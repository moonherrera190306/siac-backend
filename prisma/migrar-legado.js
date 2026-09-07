/**
 * Carga en PostgreSQL los datos del sistema legado CESZAM.
 *
 *   node prisma/migrar-legado.js            → migra
 *   node prisma/migrar-legado.js --limpiar  → borra SOLO lo migrado y vuelve a migrar
 *
 * Lee los JSON de prisma/legado/datos/ que produce extraer.py.
 * Es idempotente: se puede correr varias veces sin duplicar nada.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATOS = path.join(__dirname, 'legado', 'datos');
const PASSWORD = process.env.LEGACY_PASSWORD || 'Ceszam2026*';
const LOTE = 1000;

const leer = (nombre) => {
  const solo = path.join(DATOS, `${nombre}.json`);
  if (fs.existsSync(solo)) return JSON.parse(fs.readFileSync(solo, 'utf8'));
  const partes = fs
    .readdirSync(DATOS)
    .filter((f) => f.startsWith(`${nombre}.part`) && f.endsWith('.json'))
    .sort();
  if (!partes.length) throw new Error(`No encontré ${nombre}.json en ${DATOS}`);
  return partes.flatMap((f) => JSON.parse(fs.readFileSync(path.join(DATOS, f), 'utf8')));
};

// El legado guarda fechas vacías como '0000-00-00', que pasa el filtro de
// formato ISO pero produce un Invalid Date. Hay que validar el objeto Date,
// no la cadena.
const fecha = (v) => {
  if (!v) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const paso = (n, texto) => console.log(`\n[${n}] ${texto}`);
const ok = (n, extra = '') => console.log(`     ${n} registros ${extra}`);

async function porLotes(items, fn) {
  for (let i = 0; i < items.length; i += LOTE) {
    await fn(items.slice(i, i + LOTE));
    process.stdout.write(`\r     ${Math.min(i + LOTE, items.length)}/${items.length}`);
  }
  process.stdout.write('\r');
}

// ── correos únicos ────────────────────────────────────────────
const usados = new Set();
function correo(preferido, respaldo) {
  const limpio = (preferido || '').trim().toLowerCase();
  const valido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(limpio);
  if (valido && !usados.has(limpio)) {
    usados.add(limpio);
    return limpio;
  }
  let e = respaldo.toLowerCase();
  let i = 2;
  while (usados.has(e)) e = respaldo.toLowerCase().replace('@', `${i++}@`);
  usados.add(e);
  return e;
}

let hash = null;

/**
 * Crea el usuario de acceso, o reutiliza el que quedó suelto si una corrida
 * anterior se interrumpió entre el `user.create` y el `alumno.create`.
 */
async function usuarioPara(nombre, email, role) {
  const existente = await prisma.user.findUnique({
    where: { email },
    include: { alumno: true, docente: true },
  });
  if (existente) {
    if (!existente.alumno && !existente.docente) return existente;
    throw new Error(
      `El correo ${email} ya pertenece a otro registro. ` +
        `Revisa duplicados antes de continuar.`,
    );
  }
  return prisma.user.create({
    data: { name: nombre || email, email, password: hash, role, debeCambiarPassword: true },
  });
}

async function limpiarHuerfanos() {
  const { count } = await prisma.user.deleteMany({
    where: {
      role: { in: ['ALUMNO', 'MAESTRO'] },
      alumno: { is: null },
      docente: { is: null },
    },
  });
  if (count) console.log(`     ${count} usuarios sueltos de una corrida anterior, eliminados`);
}

async function limpiar() {
  paso('!', 'Borrando lo migrado anteriormente (legacyId con prefijo del legado)…');
  const like = (p) => ({ legacyId: { startsWith: p } });
  await prisma.observacion.deleteMany({ where: { descripcion: { startsWith: '[legado]' } } });
  await prisma.asistenciaMensual.deleteMany({ where: like('ASI-') });
  await prisma.calificacion.deleteMany({ where: like('CAL-') });
  await prisma.inscripcion.deleteMany({ where: like('INS-') });
  await prisma.asignacionMateria.deleteMany({
    where: { materia: { legacyId: { startsWith: 'MAT-' } } },
  });
  await prisma.alumno.deleteMany({ where: like('ALU-') });
  await prisma.docente.deleteMany({ where: like('DOC-') });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@alumno.ceszam.mx' } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@docente.ceszam.mx' } } });
  await prisma.materia.deleteMany({ where: like('MAT-') });
  await prisma.grupo.deleteMany({ where: like('GRP-') });
  await prisma.semestre.deleteMany({ where: like('SEM-') });
  console.log('     listo');
}

async function main() {
  if (process.argv.includes('--limpiar')) await limpiar();

  hash = await bcrypt.hash(PASSWORD, 10);

  // Los correos que ya existen en la base quedan reservados: así una corrida
  // reanudada no intenta reutilizar uno ajeno.
  paso(0, 'Preparando');
  await limpiarHuerfanos();
  for (const u of await prisma.user.findMany({ select: { email: true } })) usados.add(u.email);

  // ── 1. catálogos ────────────────────────────────────────────
  paso(1, 'Catálogos (niveles, turnos, programas, carreras)');
  const cat = leer('catalogos');

  const niveles = {};
  for (const n of cat.niveles) {
    niveles[n.clave] = await prisma.nivelAcademico.upsert({
      where: { clave: n.clave },
      update: { nombre: n.nombre },
      create: { clave: n.clave, nombre: n.nombre, legacyId: `NIV-${n.clave}` },
    });
  }
  const turnos = {};
  for (const t of cat.turnos) {
    turnos[t.clave] = await prisma.turno.upsert({
      where: { clave: t.clave },
      update: { nombre: t.nombre },
      create: { clave: t.clave, nombre: t.nombre, legacyId: `TUR-${t.clave}` },
    });
  }
  const programas = {};
  for (const p of cat.programas) {
    programas[p.nombre] = await prisma.programa.upsert({
      where: { nombre: p.nombre },
      update: {},
      create: { nombre: p.nombre, nivelAcademicoId: niveles[p.nivelClave].id },
    });
  }
  const carreras = {};
  for (const c of cat.carreras) {
    carreras[c.nombre] = await prisma.carrera.upsert({
      where: { nombre: c.nombre },
      update: { totalSemestres: c.totalSemestres },
      create: {
        nombre: c.nombre,
        totalSemestres: c.totalSemestres,
        programaId: programas[c.programaNombre].id,
      },
    });
  }
  ok(Object.keys(niveles).length + Object.keys(turnos).length +
     Object.keys(programas).length + Object.keys(carreras).length);

  // ── 2. ciclos ───────────────────────────────────────────────
  paso(2, 'Ciclos escolares');
  const ciclos = {};
  const listaCiclos = leer('ciclos');
  const ultimoCiclo = listaCiclos[listaCiclos.length - 1]?.nombre;
  for (const c of listaCiclos) {
    ciclos[c.nombre] = await prisma.cicloEscolar.upsert({
      where: { nombre: c.nombre },
      update: {},
      create: {
        nombre: c.nombre,
        legacyId: `CIC-${c.nombre}`,
        fechaInicio: fecha(c.fechaInicio),
        fechaFin: fecha(c.fechaFin),
        activo: c.nombre === ultimoCiclo,
      },
    });
  }
  ok(listaCiclos.length, `(activo: ${ultimoCiclo})`);

  // ── 3. trayectorias ─────────────────────────────────────────
  paso(3, 'Trayectorias / áreas propedéuticas');
  const trayectorias = {};
  for (const t of leer('trayectorias')) {
    trayectorias[t.clave] = await prisma.trayectoria.upsert({
      where: { clave: t.clave },
      update: { nombre: t.nombre },
      create: {
        clave: t.clave,
        nombre: t.nombre,
        legacyId: `TRA-${t.clave}`,
        nivelAcademicoId: niveles[t.nivelClave].id,
      },
    });
  }
  ok(Object.keys(trayectorias).length);

  // ── 4. semestres ────────────────────────────────────────────
  paso(4, 'Semestres');
  const semestres = {};
  for (const s of leer('semestres')) {
    semestres[s.legacyId] = await prisma.semestre.upsert({
      where: { legacyId: s.legacyId },
      update: { nombre: s.nombre, numero: s.numero },
      create: {
        legacyId: s.legacyId,
        nombre: s.nombre,
        numero: s.numero,
        carreraId: carreras[s.carreraNombre].id,
      },
    });
  }
  ok(Object.keys(semestres).length);

  // ── 5. grupos ───────────────────────────────────────────────
  paso(5, 'Grupos');
  const grupos = {};
  for (const g of leer('grupos')) {
    grupos[g.legacyId] = await prisma.grupo.upsert({
      where: { legacyId: g.legacyId },
      update: { nombre: g.nombre },
      create: {
        legacyId: g.legacyId,
        nombre: g.nombre,
        turnoId: turnos[g.turnoClave]?.id ?? null,
        semestreId: semestres[g.semestreLegacyId]?.id ?? null,
      },
    });
  }
  ok(Object.keys(grupos).length);

  // ── 6. materias ─────────────────────────────────────────────
  paso(6, 'Materias');
  const materias = {};
  for (const m of leer('materias')) {
    materias[m.legacyId] = await prisma.materia.upsert({
      where: { legacyId: m.legacyId },
      update: { nombre: m.nombre },
      create: {
        legacyId: m.legacyId,
        nombre: m.nombre,
        tipo: m.tipo,
        tipoEvaluacion: m.tipoEvaluacion,
        semestreId: semestres[m.semestreLegacyId]?.id ?? null,
        trayectoriaId: m.trayectoriaClave ? trayectorias[m.trayectoriaClave]?.id ?? null : null,
      },
    });
  }
  ok(Object.keys(materias).length);

  // ── 7. docentes ─────────────────────────────────────────────
  paso(7, 'Docentes (con su usuario de acceso)');
  const docentes = {};
  for (const d of leer('docentes')) {
    const existente = await prisma.docente.findUnique({ where: { legacyId: d.legacyId } });
    if (existente) {
      docentes[d.legacyId] = existente;
      continue;
    }
    const email = correo(d.email, `${(d.usuario || d.legacyId).toLowerCase()}@docente.ceszam.mx`);
    const user = await usuarioPara(d.nombre, email, 'MAESTRO');
    docentes[d.legacyId] = await prisma.docente.create({
      data: {
        legacyId: d.legacyId,
        nombre: d.nombre,
        telefono: d.telefono,
        userId: user.id,
      },
    });
  }
  ok(Object.keys(docentes).length);

  // ── 8. alumnos ──────────────────────────────────────────────
  paso(8, 'Alumnos (con su usuario de acceso)');
  const alumnos = {};
  const listaAlumnos = leer('alumnos');
  let n = 0;
  for (const a of listaAlumnos) {
    n++;
    if (n % 100 === 0) process.stdout.write(`\r     ${n}/${listaAlumnos.length}`);
    const existente = await prisma.alumno.findUnique({ where: { matricula: a.matricula } });
    if (existente) {
      alumnos[a.matricula] = existente;
      continue;
    }
    const nombreCompleto = `${a.nombre} ${a.apellidos}`.trim();
    const email = correo(a.email, `${a.matricula.toLowerCase()}@alumno.ceszam.mx`);
    const user = await usuarioPara(nombreCompleto, email, 'ALUMNO');
    alumnos[a.matricula] = await prisma.alumno.create({
      data: {
        matricula: a.matricula,
        legacyId: a.legacyId,
        userId: user.id,
        curp: a.curp,
        direccion: a.direccion,
        telefono: a.telefono,
        fechaNacimiento: fecha(a.fechaNacimiento),
        ciudad: a.ciudad,
        codigoPostal: a.codigoPostal,
        sexo: a.sexo,
        tutorNombre: a.tutorNombre,
        tutorTelefono: a.tutorTelefono,
        estatusAcademico: a.estatusAcademico,
        fechaBaja: fecha(a.fechaBaja),
        motivoBaja: a.fechaBaja ? a.situacionLegado : null,
        activo: a.estatusAcademico === 'ACTIVO',
        grupoId: grupos[a.grupoLegacyId]?.id ?? null,
        carreraId: carreras[a.carreraNombre]?.id ?? null,
        programaId: programas[a.programaNombre]?.id ?? null,
        trayectoriaId: a.trayectoriaClave ? trayectorias[a.trayectoriaClave]?.id ?? null : null,
      },
    });
  }
  process.stdout.write('\r');
  ok(Object.keys(alumnos).length);

  // ── 9. asignaciones ─────────────────────────────────────────
  paso(9, 'Asignaciones docente ↔ materia ↔ grupo ↔ ciclo');
  const asig = leer('asignaciones')
    .map((a) => ({
      materiaId: materias[a.materiaLegacyId]?.id,
      grupoId: grupos[a.grupoLegacyId]?.id,
      cicloEscolarId: ciclos[a.cicloNombre]?.id,
      docenteId: docentes[a.docenteLegacyId]?.id,
    }))
    .filter((a) => a.materiaId && a.grupoId && a.cicloEscolarId && a.docenteId);
  await porLotes(asig, (l) =>
    prisma.asignacionMateria.createMany({ data: l, skipDuplicates: true }),
  );
  ok(asig.length);

  // ── 10. inscripciones ───────────────────────────────────────
  paso(10, 'Inscripciones (historial por ciclo)');
  const ins = leer('inscripciones')
    .map((i) => ({
      legacyId: `INS-${i.matricula}-${i.cicloNombre}`,
      alumnoId: alumnos[i.matricula]?.id,
      cicloEscolarId: ciclos[i.cicloNombre]?.id,
      grupoId: grupos[i.grupoLegacyId]?.id ?? null,
      semestreNumero: i.semestreNumero,
      estatus: i.cicloNombre === ultimoCiclo ? 'ACTIVA' : 'CONCLUIDA',
    }))
    .filter((i) => i.alumnoId && i.cicloEscolarId);
  await porLotes(ins, (l) => prisma.inscripcion.createMany({ data: l, skipDuplicates: true }));
  ok(ins.length);

  // ── 11. calificaciones ──────────────────────────────────────
  paso(11, 'Calificaciones (kardex completo, marcadas como migradas)');
  const cal = leer('calificaciones')
    .map((c) => ({
      legacyId: `CAL-${c.matricula}-${c.materiaLegacyId}-${c.cicloNombre}`,
      alumnoId: alumnos[c.matricula]?.id,
      materiaId: materias[c.materiaLegacyId]?.id,
      cicloEscolarId: ciclos[c.cicloNombre]?.id,
      primerParcial: c.primerParcial,
      segundoParcial: c.segundoParcial,
      promedio: c.promedio,
      examenFinal: c.examenFinal,
      notaFinal: c.notaFinal,
      extraordinario: c.extraordinario,
      adicional: c.adicional,
      especial: c.especial,
      articulo: c.articulo,
      notaDefinitiva: c.notaDefinitiva,
      estatus: c.estatus,
      migrado: true,
    }))
    .filter((c) => c.alumnoId && c.materiaId && c.cicloEscolarId);
  await porLotes(cal, (l) => prisma.calificacion.createMany({ data: l, skipDuplicates: true }));
  ok(cal.length);

  // ── 12. asistencia mensual ──────────────────────────────────
  paso(12, 'Asistencia mensual acumulada');
  const asi = leer('asistencias')
    .map((a) => ({
      legacyId: `ASI-${a.matricula}-${a.materiaLegacyId}-${a.cicloNombre}`,
      alumnoId: alumnos[a.matricula]?.id,
      materiaId: materias[a.materiaLegacyId]?.id,
      cicloEscolarId: ciclos[a.cicloNombre]?.id,
      asisMes1: a.asisMes1, asisMes2: a.asisMes2, asisMes3: a.asisMes3, asisMes4: a.asisMes4,
      faltasMes1: a.faltasMes1, faltasMes2: a.faltasMes2,
      faltasMes3: a.faltasMes3, faltasMes4: a.faltasMes4,
      porcentaje: a.porcentaje,
      migrado: true,
    }))
    .filter((a) => a.alumnoId && a.materiaId && a.cicloEscolarId);
  await porLotes(asi, (l) => prisma.asistenciaMensual.createMany({ data: l, skipDuplicates: true }));
  ok(asi.length);

  // ── 13. observaciones ───────────────────────────────────────
  paso(13, 'Observaciones del kardex');
  const obs = leer('observaciones')
    .map((o) => ({
      titulo: o.titulo,
      descripcion: `[legado] ${o.descripcion}`,
      tipo: 'ACADEMICA',
      estatus: 'CERRADA',
      alumnoId: alumnos[o.matricula]?.id,
      materiaId: materias[o.materiaLegacyId]?.id ?? null,
    }))
    .filter((o) => o.alumnoId);
  await porLotes(obs, (l) => prisma.observacion.createMany({ data: l }));
  ok(obs.length);

  // ── resumen ─────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────');
  console.log('MIGRACIÓN TERMINADA\n');
  const c = {
    alumnos: await prisma.alumno.count(),
    docentes: await prisma.docente.count(),
    materias: await prisma.materia.count(),
    grupos: await prisma.grupo.count(),
    inscripciones: await prisma.inscripcion.count(),
    calificaciones: await prisma.calificacion.count(),
    asistencias: await prisma.asistenciaMensual.count(),
  };
  for (const [k, v] of Object.entries(c)) console.log(`  ${k.padEnd(16)} ${v}`);
  console.log(`\n  Contraseña inicial de todos: ${PASSWORD}`);
  console.log('  Los alumnos entran con <matricula>@alumno.ceszam.mx');
  console.log('───────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('\nERROR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
