/**
 * Carga el horario del ciclo 2026-2027 y da de alta a las secretarías.
 *
 *   node prisma/migrar-horarios.js
 *   node prisma/migrar-horarios.js --limpiar   → borra el horario y lo rehace
 *
 * Lee prisma/legado/datos/horarios.json (lo genera extraer-horarios.py).
 * Idempotente: se puede correr varias veces.
 *
 * REQUIERE la migración 20260907120000_iniciales_usuario (columna
 * User.iniciales). Aplícala antes con `npx prisma migrate deploy`.
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

// Docente provisional: AsignacionMateria exige docenteId y los Excel de
// horario no traen maestros. Dirección los va reasignando desde el sistema.
const SIN_DOCENTE = 'DOC-POR-ASIGNAR';

const SECRETARIAS = [
  { nombre: 'Laura', iniciales: 'LBZ' },
  { nombre: 'Paulina', iniciales: 'PAG' },
  { nombre: 'Mónica', iniciales: 'MRCM' },
  { nombre: 'Elizabeth', iniciales: 'EASO' },
];

const paso = (n, t) => console.log(`\n[${n}] ${t}`);
const ok = (n, extra = '') => console.log(`     ${n} ${extra}`);

async function limpiar(cicloNombre) {
  paso('!', 'Borrando el horario cargado anteriormente…');
  const ciclo = await prisma.cicloEscolar.findUnique({ where: { nombre: cicloNombre } });
  if (!ciclo) return console.log('     no había nada');
  await prisma.horario.deleteMany({
    where: { asignacion: { cicloEscolarId: ciclo.id } },
  });
  await prisma.asignacionMateria.deleteMany({ where: { cicloEscolarId: ciclo.id } });
  console.log('     listo');
}

async function main() {
  const d = JSON.parse(fs.readFileSync(path.join(DATOS, 'horarios.json'), 'utf8'));
  if (process.argv.includes('--limpiar')) await limpiar(d.ciclo);

  const hash = await bcrypt.hash(PASSWORD, 10);

  // ── 1. secretarías ──────────────────────────────────────────
  paso(1, 'Secretarías (para firmar los recibos)');
  for (const s of SECRETARIAS) {
    const email = `${s.nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')}@ceszam.mx`;
    await prisma.user.upsert({
      where: { email },
      update: { iniciales: s.iniciales },
      create: {
        name: s.nombre,
        email,
        password: hash,
        role: 'SECRETARIA',
        iniciales: s.iniciales,
        debeCambiarPassword: true,
      },
    });
    console.log(`     ${s.iniciales.padEnd(5)} ${s.nombre.padEnd(12)} ${email}`);
  }

  // ── 2. ciclo ────────────────────────────────────────────────
  paso(2, `Ciclo ${d.ciclo}`);
  const ciclo = await prisma.cicloEscolar.upsert({
    where: { nombre: d.ciclo },
    update: { activo: true },
    create: { nombre: d.ciclo, legacyId: `CIC-${d.ciclo}`, activo: true },
  });
  const { count } = await prisma.cicloEscolar.updateMany({
    where: { id: { not: ciclo.id }, activo: true },
    data: { activo: false },
  });
  ok(`activo. ${count} ciclo(s) anterior(es) pasaron a histórico`);

  // ── 3. trayectorias y grupos nuevos ─────────────────────────
  paso(3, 'Trayectorias y grupos nuevos');
  const nivel = await prisma.nivelAcademico.findUnique({ where: { clave: 'PREPA' } });
  if (!nivel) throw new Error('Falta el nivel PREPA: corre primero `npm run legado`.');

  for (const t of d.trayectorias) {
    await prisma.trayectoria.upsert({
      where: { clave: t.clave },
      update: {},
      create: {
        clave: t.clave,
        nombre: t.nombre,
        legacyId: `TRA-${t.clave}`,
        nivelAcademicoId: nivel.id,
      },
    });
  }

  const trayIds = Object.fromEntries(
    (await prisma.trayectoria.findMany({ select: { id: true, clave: true } })).map((t) => [
      t.clave,
      t.id,
    ]),
  );
  const turnoIds = Object.fromEntries(
    (await prisma.turno.findMany({ select: { id: true, clave: true } })).map((t) => [
      t.clave,
      t.id,
    ]),
  );
  const semIds = Object.fromEntries(
    (await prisma.semestre.findMany({ select: { id: true, legacyId: true } })).map((s) => [
      s.legacyId,
      s.id,
    ]),
  );

  const grupos = {};
  for (const g of d.grupos) {
    grupos[g.legacyId] = await prisma.grupo.upsert({
      where: { legacyId: g.legacyId },
      update: {},
      create: {
        legacyId: g.legacyId,
        nombre: g.nombre,
        turnoId: turnoIds[g.turnoClave] ?? null,
        semestreId: semIds[`SEM-PREPA-${g.semestre}`] ?? null,
      },
    });
  }
  ok(`${d.trayectorias.length} trayectorias, ${d.grupos.filter((g) => !g.yaExiste).length} grupos nuevos`);

  // ── 4. materias nuevas ──────────────────────────────────────
  paso(4, 'Materias nuevas (laboratorios y asignaturas del nuevo plan)');
  for (const m of d.materiasNuevas) {
    await prisma.materia.upsert({
      where: { legacyId: m.legacyId },
      update: {},
      create: {
        legacyId: m.legacyId,
        nombre: m.nombre,
        tipo: m.tipo,
        tipoEvaluacion: m.tipoEvaluacion,
        semestreId: semIds[`SEM-PREPA-${m.semestre}`] ?? null,
        trayectoriaId: m.trayectoriaClave ? trayIds[m.trayectoriaClave] ?? null : null,
      },
    });
    console.log(`     sem${m.semestre}  ${m.nombre}`);
  }

  // ── 5. docente provisional ──────────────────────────────────
  paso(5, 'Docente provisional');
  let docente = await prisma.docente.findUnique({ where: { legacyId: SIN_DOCENTE } });
  if (!docente) {
    const email = 'porasignar@docente.ceszam.mx';
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: 'POR ASIGNAR',
          email,
          password: hash,
          role: 'MAESTRO',
          activo: false,
          debeCambiarPassword: true,
        },
      });
    }
    docente = await prisma.docente.create({
      data: { legacyId: SIN_DOCENTE, nombre: 'POR ASIGNAR', userId: user.id, activo: false },
    });
  }
  ok('"POR ASIGNAR" listo (inactivo: no puede entrar al sistema)');

  // ── 6. asignaciones ─────────────────────────────────────────
  paso(6, 'Asignaciones materia ↔ grupo');
  const materias = Object.fromEntries(
    (await prisma.materia.findMany({ select: { id: true, legacyId: true } }))
      .filter((m) => m.legacyId)
      .map((m) => [m.legacyId, m.id]),
  );

  const faltantes = new Set();
  const claves = new Map();
  for (const s of d.sesiones) {
    const materiaId = materias[s.materiaLegacyId];
    const grupo = grupos[s.grupoLegacyId];
    if (!materiaId || !grupo) {
      faltantes.add(s.materiaLegacyId);
      continue;
    }
    claves.set(`${materiaId}|${grupo.id}`, { materiaId, grupoId: grupo.id });
  }
  await prisma.asignacionMateria.createMany({
    data: [...claves.values()].map((c) => ({
      ...c,
      cicloEscolarId: ciclo.id,
      docenteId: docente.id,
    })),
    skipDuplicates: true,
  });
  ok(`${claves.size} asignaciones`);
  if (faltantes.size) console.log(`     ⚠ ${faltantes.size} materias sin resolver:`, [...faltantes].slice(0, 5));

  // ── 7. horarios ─────────────────────────────────────────────
  paso(7, 'Sesiones del horario');
  const asigs = Object.fromEntries(
    (
      await prisma.asignacionMateria.findMany({
        where: { cicloEscolarId: ciclo.id },
        select: { id: true, materiaId: true, grupoId: true },
      })
    ).map((a) => [`${a.materiaId}|${a.grupoId}`, a.id]),
  );

  const filas = [];
  for (const s of d.sesiones) {
    const materiaId = materias[s.materiaLegacyId];
    const grupo = grupos[s.grupoLegacyId];
    if (!materiaId || !grupo) continue;
    const asignacionId = asigs[`${materiaId}|${grupo.id}`];
    if (!asignacionId) continue;
    filas.push({
      asignacionId,
      dia: s.dia,
      horaInicio: s.horaInicio,
      horaFin: s.horaFin,
      aula: s.aula ?? null,
    });
  }
  for (let i = 0; i < filas.length; i += 500) {
    await prisma.horario.createMany({ data: filas.slice(i, i + 500), skipDuplicates: true });
  }
  ok(`${filas.length} sesiones (${filas.filter((f) => f.aula).length} en laboratorio)`);

  // ── resumen ─────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────');
  console.log(`HORARIO ${d.ciclo} CARGADO\n`);
  console.log(`  grupos con horario   ${d.grupos.length}`);
  console.log(`  asignaciones         ${await prisma.asignacionMateria.count({ where: { cicloEscolarId: ciclo.id } })}`);
  console.log(`  sesiones semanales   ${await prisma.horario.count({ where: { asignacion: { cicloEscolarId: ciclo.id } } })}`);
  console.log('\n  Todas quedaron con el docente "POR ASIGNAR".');
  console.log('  Dirección → Asignaciones para poner al maestro real.');
  console.log('───────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('\nERROR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
