import { PrismaClient } from "@prisma/client"
import bcrypt from "bcrypt"

const prisma = new PrismaClient()

/**
 * =========================================
 * 🧪 DATOS DE PRUEBA
 * =========================================
 *
 * Llena el SIAC con una escuela completa y creíble para poder probar
 * todo el sistema: dos turnos (matutino = mañana, vespertino = tarde),
 * preparatoria y universidad, horarios, clases, asistencias, kardex,
 * pagos, adeudos, trámites y observaciones.
 *
 *   npm run demo            → siembra
 *   npm run demo:limpiar    → borra SOLO lo sembrado aquí
 *
 * TODO lo que crea queda marcado:
 *   · `legacyId` que empieza con DEMO-
 *   · correos @demo.ceszam.mx
 *
 * Por eso se puede borrar después sin tocar datos reales.
 */

const MARCA = "DEMO-"
const DOMINIO = "demo.ceszam.mx"
const PASSWORD = process.env.SEED_PASSWORD || "Ceszam2026*"

/** Generador reproducible: dos corridas dan los mismos datos. */
let semilla = 20260817

function aleatorio() {
  semilla = (semilla * 1103515245 + 12345) % 2147483648
  return semilla / 2147483648
}

function entre(min, max) {
  return Math.floor(aleatorio() * (max - min + 1)) + min
}

function elegir(lista) {
  return lista[Math.floor(aleatorio() * lista.length)]
}

const NOMBRES = [
  "María", "José", "Guadalupe", "Juan", "Ana", "Luis", "Fernanda", "Carlos",
  "Sofía", "Miguel", "Valeria", "Jorge", "Camila", "Diego", "Regina", "Andrés",
  "Ximena", "Ricardo", "Daniela", "Alejandro", "Paola", "Emilio", "Renata",
  "Sebastián", "Mariana", "Adrián", "Itzel", "Rodrigo", "Karla", "Óscar",
]

const APELLIDOS = [
  "Hernández", "García", "Martínez", "López", "González", "Pérez", "Sánchez",
  "Ramírez", "Cruz", "Flores", "Gómez", "Torres", "Vázquez", "Ramos", "Ruiz",
  "Mendoza", "Chávez", "Ortiz", "Silva", "Núñez",
]

function nombrePersona() {
  return `${elegir(NOMBRES)} ${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`
}

/* Horas de clase por turno. La tarde arranca a las 15:00. */
const HORAS_MATUTINO = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00"]
const HORAS_VESPERTINO = ["15:00", "16:00", "17:00", "18:00", "19:00", "20:00"]

const DIAS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES"]

function siguienteHora(hora) {
  const [h, m] = hora.split(":")
  return `${String(Number(h) + 1).padStart(2, "0")}:${m}`
}

async function main() {
  console.log("🧪 Sembrando datos de prueba...\n")

  // 🔒 Los catálogos usan upsert y aguantan repetirse, pero las clases,
  // los pagos y las asistencias se crean directo: correr esto dos veces
  // sobre datos ya sembrados duplicaría todo eso.
  const yaSembrado = await prisma.alumno.count({
    where: { legacyId: { startsWith: MARCA } },
  })

  if (yaSembrado > 0) {
    console.log(`⚠️  Ya hay ${yaSembrado} alumnos de prueba en la base.`)
    console.log("")
    console.log("   Volver a sembrar duplicaría clases, pagos y asistencias.")
    console.log("   Primero limpia:  npm run demo:limpiar")
    console.log("")
    return
  }

  const password = await bcrypt.hash(PASSWORD, 10)

  /* =====================================================
     🏛️ CATÁLOGOS
     upsert: funciona haya corrido o no el seed base.
  ===================================================== */

  const prepa = await prisma.nivelAcademico.upsert({
    where: { clave: "PREPARATORIA" },
    update: {},
    create: {
      clave: "PREPARATORIA",
      nombre: "Escuela Preparatoria por Cooperación de Zamora",
      legacyId: MARCA + "NIV-PREPA",
    },
  })

  const universidad = await prisma.nivelAcademico.upsert({
    where: { clave: "UNIVERSIDAD" },
    update: {},
    create: {
      clave: "UNIVERSIDAD",
      nombre: "CESZAM",
      legacyId: MARCA + "NIV-UNI",
    },
  })

  // 🔥 Los dos turnos de la escuela: mañana y tarde.
  const matutino = await prisma.turno.upsert({
    where: { clave: "MAT" },
    update: {},
    create: { clave: "MAT", nombre: "Matutino", legacyId: MARCA + "TUR-MAT" },
  })

  const vespertino = await prisma.turno.upsert({
    where: { clave: "VES" },
    update: {},
    create: { clave: "VES", nombre: "Vespertino", legacyId: MARCA + "TUR-VES" },
  })

  const programaPrepa = await prisma.programa.upsert({
    where: { nombre: "Bachillerato" },
    update: {},
    create: {
      nombre: "Bachillerato",
      nivelAcademicoId: prepa.id,
      legacyId: MARCA + "PROG-BACH",
    },
  })

  const programaUni = await prisma.programa.upsert({
    where: { nombre: "Licenciaturas" },
    update: {},
    create: {
      nombre: "Licenciaturas",
      nivelAcademicoId: universidad.id,
      legacyId: MARCA + "PROG-LIC",
    },
  })

  const trayectorias = []

  for (const t of [
    { clave: "321", nombre: "Físico Matemáticas", seccion: "01" },
    { clave: "331", nombre: "Químico Biológicas", seccion: "02" },
    { clave: "341", nombre: "Económico Administrativas", seccion: "03" },
    { clave: "351", nombre: "Humanidades", seccion: "04" },
  ]) {
    trayectorias.push(
      await prisma.trayectoria.upsert({
        where: { clave: t.clave },
        update: {},
        create: {
          ...t,
          nivelAcademicoId: prepa.id,
          legacyId: MARCA + "TRAY-" + t.clave,
        },
      })
    )
  }

  console.log("✅ Catálogos: 2 niveles, 2 turnos, 2 programas, 4 trayectorias")

  /* =====================================================
     🎓 CARRERAS Y SEMESTRES
  ===================================================== */

  // La institución ofrece preparatoria y una sola licenciatura: Derecho.
  const carrerasDef = [
    { nombre: "Bachillerato General", total: 6, programa: programaPrepa },
    { nombre: "Licenciatura en Derecho", total: 9, programa: programaUni },
  ]

  const carreras = []

  let indiceCarrera = 0

  for (const c of carrerasDef) {
    indiceCarrera++

    // El legacyId va por índice, no por el nombre recortado: dos
    // carreras con el mismo prefijo generaban la misma clave.
    const legacyCarrera = `${MARCA}CAR-${indiceCarrera}`

    const carrera = await prisma.carrera.upsert({
      where: { nombre: c.nombre },
      update: { legacyId: legacyCarrera },
      create: {
        nombre: c.nombre,
        totalSemestres: c.total,
        programaId: c.programa.id,
        legacyId: legacyCarrera,
      },
    })

    const semestres = []

    for (let n = 1; n <= c.total; n++) {
      const legacyId = `${MARCA}SEM-${indiceCarrera}-${n}`

      let semestre = await prisma.semestre.findUnique({ where: { legacyId } })

      if (!semestre) {
        semestre = await prisma.semestre.create({
          data: {
            nombre: `${n}° Semestre`,
            numero: n,
            carreraId: carrera.id,
            legacyId,
          },
        })
      }

      semestres.push(semestre)
    }

    carreras.push({ carrera, semestres, programa: c.programa })
  }

  console.log("✅ 3 carreras con sus semestres")

  /* =====================================================
     📅 CICLO ESCOLAR + BLOQUEOS
  ===================================================== */

  const ciclo = await prisma.cicloEscolar.upsert({
    where: { nombre: "2026-2027" },
    update: { activo: true },
    create: {
      nombre: "2026-2027",
      activo: true,
      fechaInicio: new Date("2026-08-03"),
      fechaFin: new Date("2027-06-30"),
      legacyId: MARCA + "CICLO",
    },
  })

  // Para probar la captura: PP y SP abiertas, el resto cerrado.
  for (const columna of ["PP", "SP", "PROM", "EF", "O", "EE", "EA", "EER", "ND"]) {
    await prisma.bloqueo.upsert({
      where: { cicloEscolarId_columna: { cicloEscolarId: ciclo.id, columna } },
      update: {},
      create: {
        cicloEscolarId: ciclo.id,
        columna,
        abierto: columna === "PP" || columna === "SP",
      },
    })
  }

  console.log("✅ Ciclo 2026-2027 activo · columnas PP y SP abiertas")

  /* =====================================================
     📘 MATERIAS
  ===================================================== */

  const MATERIAS_PREPA = [
    ["100155", "Matemáticas I", 8, 5],
    ["100281", "Lengua y Literatura I", 6, 4],
    ["100310", "Historia de México", 6, 3],
    ["100422", "Química I", 7, 4],
    ["100533", "Inglés I", 5, 3],
  ]

  const MATERIAS_UNI = [
    ["200110", "Introducción al Estudio del Derecho", 9, 5],
    ["200220", "Derecho Romano", 8, 4],
    ["200330", "Teoría General del Estado", 8, 4],
    ["200440", "Metodología de la Investigación Jurídica", 6, 3],
  ]

  const materias = []

  async function crearMateria(clave, nombre, creditos, horas, semestre, trayectoria) {
    let materia = await prisma.materia.findUnique({ where: { clave } })

    if (!materia) {
      materia = await prisma.materia.create({
        data: {
          clave,
          nombre,
          creditos,
          horasSemana: horas,
          semestreId: semestre.id,
          trayectoriaId: trayectoria?.id ?? null,
          tipo: "OBLIGATORIA",
          tipoEvaluacion: "NUMERICA",
          legacyId: MARCA + "MAT-" + clave,
        },
      })
    }

    materias.push(materia)
    return materia
  }

  const semPrepa1 = carreras[0].semestres[0]

  for (const [clave, nombre, cr, hr] of MATERIAS_PREPA) {
    await crearMateria(clave, nombre, cr, hr, semPrepa1)
  }

  // Una materia de acreditación (AC/NA) para probar ese camino del kardex.
  let deportes = await prisma.materia.findUnique({ where: { clave: "100900" } })

  if (!deportes) {
    deportes = await prisma.materia.create({
      data: {
        clave: "100900",
        nombre: "Actividades Deportivas",
        tipo: "EXTRACURRICULAR",
        tipoEvaluacion: "ACREDITACION",
        horasSemana: 2,
        semestreId: semPrepa1.id,
        legacyId: MARCA + "MAT-100900",
      },
    })
  }

  materias.push(deportes)

  const semUni1 = carreras[1].semestres[0]

  for (const [clave, nombre, cr, hr] of MATERIAS_UNI) {
    await crearMateria(clave, nombre, cr, hr, semUni1)
  }

  console.log(`✅ ${materias.length} materias (una de acreditación AC/NA)`)

  /* =====================================================
     👨‍🏫 DOCENTES
  ===================================================== */

  const docentes = []

  for (let i = 1; i <= 6; i++) {
    const nombre = nombrePersona()
    const email = `docente${i}@${DOMINIO}`

    let user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: nombre,
          email,
          password,
          role: "MAESTRO",
          debeCambiarPassword: false,
        },
      })
    }

    const legacyId = MARCA + "DOC-" + i

    let docente = await prisma.docente.findUnique({ where: { legacyId } })

    if (!docente) {
      docente = await prisma.docente.create({
        data: {
          userId: user.id,
          nombre,
          cedula: String(1000000 + i * 12345),
          rfc: `XAXX0101${String(i).padStart(2, "0")}000`,
          telefono: `351-100-00${i}`,
          legacyId,
        },
      })
    }

    docentes.push(docente)
  }

  console.log("✅ 6 docentes")

  /* =====================================================
     👥 GRUPOS — matutino y vespertino
  ===================================================== */

  const gruposDef = [
    // Preparatoria: dos grupos por la mañana, uno por la tarde.
    { nombre: "1A", turno: matutino, carrera: 0, semestre: 0, cupo: 35 },
    { nombre: "1B", turno: matutino, carrera: 0, semestre: 0, cupo: 35 },
    { nombre: "1C", turno: vespertino, carrera: 0, semestre: 0, cupo: 30 },
    // Derecho: la licenciatura es vespertina.
    { nombre: "DER-1A", turno: vespertino, carrera: 1, semestre: 0, cupo: 25 },
    { nombre: "DER-1B", turno: matutino, carrera: 1, semestre: 0, cupo: 25 },
  ]

  const grupos = []

  for (const g of gruposDef) {
    const legacyId = MARCA + "GRU-" + g.nombre

    let grupo = await prisma.grupo.findUnique({ where: { legacyId } })

    if (!grupo) {
      grupo = await prisma.grupo.create({
        data: {
          nombre: g.nombre,
          turnoId: g.turno.id,
          semestreId: carreras[g.carrera].semestres[g.semestre].id,
          cupo: g.cupo,
          legacyId,
        },
      })
    }

    grupos.push({
      ...g,
      registro: grupo,
      esPrepa: g.carrera === 0,
    })
  }

  console.log("✅ 5 grupos: 3 de preparatoria y 2 de Derecho")

  /* =====================================================
     🔗 ASIGNACIONES + HORARIOS
  ===================================================== */

  const materiasPrepa = materias.filter((m) => m.clave.startsWith("100"))
  const materiasUni = materias.filter((m) => m.clave.startsWith("200"))

  const asignaciones = []

  for (const g of grupos) {
    const delGrupo = g.esPrepa ? materiasPrepa : materiasUni
    const horas = g.turno.clave === "MAT" ? HORAS_MATUTINO : HORAS_VESPERTINO

    let indice = 0

    for (const materia of delGrupo) {
      const asignacion = await prisma.asignacionMateria.upsert({
        where: {
          materiaId_grupoId_cicloEscolarId: {
            materiaId: materia.id,
            grupoId: g.registro.id,
            cicloEscolarId: ciclo.id,
          },
        },
        update: {},
        create: {
          materiaId: materia.id,
          docenteId: docentes[indice % docentes.length].id,
          grupoId: g.registro.id,
          cicloEscolarId: ciclo.id,
          aula: `${g.turno.clave}-${indice + 1}`,
        },
      })

      // Dos bloques por materia, en días distintos y horas distintas:
      // así ningún grupo choca consigo mismo.
      const bloques = [
        { dia: DIAS[indice % DIAS.length], hora: horas[indice % horas.length] },
        {
          dia: DIAS[(indice + 2) % DIAS.length],
          hora: horas[(indice + 1) % horas.length],
        },
      ]

      for (const b of bloques) {
        const existe = await prisma.horario.findUnique({
          where: {
            asignacionId_dia_horaInicio: {
              asignacionId: asignacion.id,
              dia: b.dia,
              horaInicio: b.hora,
            },
          },
        })

        if (!existe) {
          await prisma.horario.create({
            data: {
              asignacionId: asignacion.id,
              dia: b.dia,
              horaInicio: b.hora,
              horaFin: siguienteHora(b.hora),
              aula: asignacion.aula,
            },
          })
        }
      }

      asignaciones.push({ asignacion, materia, grupo: g })
      indice++
    }
  }

  console.log(`✅ ${asignaciones.length} asignaciones con horario en ambos turnos`)

  /* =====================================================
     💰 CONCEPTOS DE PAGO
  ===================================================== */

  const conceptosDef = [
    { clave: "INSCRIPCION", nombre: "Inscripción", monto: 2500, generaTramite: false },
    { clave: "COLEGIATURA", nombre: "Colegiatura mensual", monto: 1200, generaTramite: false },
    { clave: "CONSTANCIA", nombre: "Constancia de estudios", monto: 150, generaTramite: true },
    { clave: "MEMORANDUM", nombre: "Memorándum", monto: 100, generaTramite: true },
    { clave: "OTROS", nombre: "Otros", monto: null, generaTramite: false },
  ]

  const conceptos = {}

  for (const c of conceptosDef) {
    conceptos[c.clave] = await prisma.conceptoPago.upsert({
      where: { clave: c.clave },
      update: {},
      create: { ...c, legacyId: MARCA + "CON-" + c.clave },
    })
  }

  console.log("✅ 5 conceptos de pago")

  /* =====================================================
     🧑‍💼 STAFF
  ===================================================== */

  for (const u of [
    { name: "Administrador Demo", email: `admin@${DOMINIO}`, role: "ADMIN" },
    { name: "Dirección Demo", email: `director@${DOMINIO}`, role: "DIRECTOR" },
    { name: "Secretaría Demo", email: `secretaria@${DOMINIO}`, role: "SECRETARIA" },
    { name: "Caja Demo", email: `caja@${DOMINIO}`, role: "CAJA" },
  ]) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, password, debeCambiarPassword: false },
    })
  }

  console.log("✅ 4 usuarios de staff")

  /* =====================================================
     👨‍🎓 ALUMNOS + INSCRIPCIONES
  ===================================================== */

  const alumnos = []

  let consecutivo = 0

  for (const g of grupos) {
    const cuantos = entre(6, 10)

    for (let i = 0; i < cuantos; i++) {
      consecutivo++

      const matricula = `2026${String(consecutivo).padStart(4, "0")}`
      const nombre = nombrePersona()
      const email = `${matricula}@${DOMINIO}`

      let user = await prisma.user.findUnique({ where: { email } })

      if (!user) {
        user = await prisma.user.create({
          data: {
            name: nombre,
            email,
            password,
            role: "ALUMNO",
            debeCambiarPassword: false,
          },
        })
      }

      let alumno = await prisma.alumno.findUnique({ where: { matricula } })

      if (!alumno) {
        alumno = await prisma.alumno.create({
          data: {
            matricula,
            userId: user.id,
            grupoId: g.registro.id,
            programaId: carreras[g.carrera].programa.id,
            carreraId: carreras[g.carrera].carrera.id,
            // La trayectoria solo aplica en preparatoria.
            trayectoriaId: g.esPrepa ? elegir(trayectorias).id : null,
            telefono: `351-2${String(entre(100000, 999999))}`,
            curp: `CURP${matricula}DEMO`,
            tutorNombre: nombrePersona(),
            tutorTelefono: `351-3${String(entre(100000, 999999))}`,
            ciudad: "Zamora",
            estado: "Michoacán",
            legacyId: MARCA + "ALU-" + matricula,
          },
        })

        await prisma.inscripcion.create({
          data: {
            alumnoId: alumno.id,
            cicloEscolarId: ciclo.id,
            grupoId: g.registro.id,
            semestreNumero: 1,
            estatus: "ACTIVA",
            legacyId: MARCA + "INS-" + matricula,
          },
        })
      }

      alumnos.push({ alumno, grupo: g })
    }
  }

  console.log(`✅ ${alumnos.length} alumnos inscritos`)

  /* =====================================================
     📆 CLASES + ASISTENCIA
     Cuatro semanas ya cursadas: sirve para probar el
     cumplimiento docente (programadas vs. impartidas).
  ===================================================== */

  const inicio = new Date(Date.UTC(2026, 7, 3)) // lunes 3 de agosto

  const DIA_INDICE = { LUNES: 1, MARTES: 2, MIERCOLES: 3, JUEVES: 4, VIERNES: 5 }

  /**
   * 🚀 Todo esto se inserta por lotes.
   *
   * Hacerlo fila por fila son ~1,900 viajes de ida y vuelta a la base;
   * contra una base en la nube eso son varios minutos. Por lotes son
   * unos pocos viajes.
   */
  async function porLotes(crear, filas, tamano = 1000) {
    for (let i = 0; i < filas.length; i += tamano) {
      await crear({ data: filas.slice(i, i + tamano), skipDuplicates: true })
    }
  }

  // Un solo query para todos los horarios, en vez de uno por asignación.
  const todosHorarios = await prisma.horario.findMany({
    where: { asignacionId: { in: asignaciones.map((a) => a.asignacion.id) } },
  })

  const horariosPorAsignacion = new Map()

  for (const h of todosHorarios) {
    if (!horariosPorAsignacion.has(h.asignacionId)) {
      horariosPorAsignacion.set(h.asignacionId, [])
    }

    horariosPorAsignacion.get(h.asignacionId).push(h)
  }

  const alumnosPorGrupo = new Map()

  for (const a of alumnos) {
    if (!alumnosPorGrupo.has(a.grupo.nombre)) {
      alumnosPorGrupo.set(a.grupo.nombre, [])
    }

    alumnosPorGrupo.get(a.grupo.nombre).push(a.alumno)
  }

  /* --- 1. armar las clases en memoria --- */

  const clasesData = []
  const planAsistencia = []

  for (const { asignacion, grupo } of asignaciones) {
    const horarios = horariosPorAsignacion.get(asignacion.id) ?? []
    const delGrupo = alumnosPorGrupo.get(grupo.nombre) ?? []

    for (let semana = 0; semana < 4; semana++) {
      for (const h of horarios) {
        const fecha = new Date(inicio)

        fecha.setUTCDate(
          inicio.getUTCDate() + semana * 7 + (DIA_INDICE[h.dia] - 1)
        )

        // Una de cada diez clases queda sin registrar a propósito:
        // si todas estuvieran al 100%, el reporte de cumplimiento
        // docente no probaría nada.
        const registrada = aleatorio() > 0.1

        clasesData.push({
          asignacionId: asignacion.id,
          horarioId: h.id,
          fecha,
          registrada,
          registradaEn: registrada ? fecha : null,
          tema: registrada ? `Sesión ${semana + 1} — unidad ${semana + 1}` : null,
          actividad: registrada ? "Exposición y ejercicios" : null,
          incidencias:
            registrada && aleatorio() > 0.9
              ? "Falta de material en el aula"
              : null,
        })

        if (!registrada) continue

        planAsistencia.push({
          llave: `${asignacion.id}|${h.id}|${fecha.toISOString()}`,
          materiaId: asignacion.materiaId,
          alumnos: delGrupo.map((al) => {
            const dado = aleatorio()

            return {
              alumnoId: al.id,
              estado: dado > 0.92 ? "FALTA" : dado > 0.86 ? "RETARDO" : "PRESENTE",
            }
          }),
        })
      }
    }
  }

  await porLotes((args) => prisma.clase.createMany(args), clasesData)

  /* --- 2. recuperar los ids para colgarles la asistencia --- */

  const clasesCreadasBD = await prisma.clase.findMany({
    where: { asignacionId: { in: asignaciones.map((a) => a.asignacion.id) } },
    select: { id: true, asignacionId: true, horarioId: true, fecha: true },
  })

  const idPorLlave = new Map(
    clasesCreadasBD.map((c) => [
      `${c.asignacionId}|${c.horarioId}|${c.fecha.toISOString()}`,
      c.id,
    ])
  )

  /* --- 3. asistencia --- */

  const asistenciasData = []
  const mensual = new Map()

  for (const plan of planAsistencia) {
    const claseId = idPorLlave.get(plan.llave)

    if (!claseId) continue

    for (const a of plan.alumnos) {
      asistenciasData.push({
        claseId,
        alumnoId: a.alumnoId,
        estado: a.estado,
      })

      const llave = `${a.alumnoId}|${plan.materiaId}`

      if (!mensual.has(llave)) mensual.set(llave, { asis: 0, faltas: 0 })

      const acc = mensual.get(llave)

      if (a.estado === "FALTA") acc.faltas++
      else acc.asis++
    }
  }

  await porLotes(
    (args) => prisma.asistenciaClase.createMany(args),
    asistenciasData
  )

  /* --- 4. acumulado mensual --- */

  const mensualData = []

  for (const [llave, acc] of mensual) {
    const [alumnoId, materiaId] = llave.split("|")
    const total = acc.asis + acc.faltas

    mensualData.push({
      alumnoId,
      materiaId,
      cicloEscolarId: ciclo.id,
      asisMes1: acc.asis,
      faltasMes1: acc.faltas,
      porcentaje: total === 0 ? null : Number(((acc.asis / total) * 100).toFixed(2)),
      legacyId: MARCA + "ASI-" + llave,
    })
  }

  await porLotes(
    (args) => prisma.asistenciaMensual.createMany(args),
    mensualData
  )

  console.log(
    `✅ ${clasesData.length} clases (${planAsistencia.length} registradas) y ${asistenciasData.length} asistencias`
  )

  /* =====================================================
     📝 CALIFICACIONES — PP y SP capturados
  ===================================================== */

  function redondear(n) {
    const entero = Math.floor(n)
    return n - entero >= 0.5 ? entero + 1 : entero
  }

  const calificacionesData = []

  for (const { asignacion, materia, grupo } of asignaciones) {
    const delGrupo = alumnosPorGrupo.get(grupo.nombre) ?? []

    for (const alumno of delGrupo) {
      let data

      if (materia.tipoEvaluacion === "ACREDITACION") {
        const acredita = aleatorio() > 0.1

        data = {
          primerParcial: acredita ? "AC" : "NA",
          segundoParcial: acredita ? "AC" : "NA",
          notaDefinitiva: acredita ? "AC" : "NA",
          estatus: acredita ? "APROBADA" : "REPROBADA",
        }
      } else {
        const pp = entre(4, 10)
        const sp = entre(4, 10)
        const prom = redondear((pp + sp) / 2)

        data = {
          primerParcial: String(pp),
          segundoParcial: String(sp),
          promedio: String(prom),
          notaDefinitiva: String(prom),
          estatus: prom >= 6 ? "APROBADA" : "REPROBADA",
        }
      }

      calificacionesData.push({
        alumnoId: alumno.id,
        materiaId: asignacion.materiaId,
        cicloEscolarId: ciclo.id,
        legacyId: `${MARCA}CAL-${alumno.matricula}-${materia.clave}`,
        ...data,
      })
    }
  }

  await porLotes(
    (args) => prisma.calificacion.createMany(args),
    calificacionesData
  )

  console.log(
    `✅ ${calificacionesData.length} calificaciones con PP, SP y definitiva`
  )

  /* =====================================================
     💳 PAGOS, ADEUDOS Y TRÁMITES
  ===================================================== */

  let pagos = 0
  let adeudos = 0
  let tramites = 0

  const adeudosData = []

  for (const { alumno } of alumnos) {
    // Casi todos pagaron inscripción.
    if (aleatorio() > 0.15) {
      const pago = await prisma.pago.create({
        data: {
          alumnoId: alumno.id,
          total: 2500,
          metodo: elegir(["EFECTIVO", "TRANSFERENCIA", "TARJETA"]),
          pagadoEn: new Date("2026-08-01"),
          detalles: {
            create: [
              {
                conceptoPagoId: conceptos.INSCRIPCION.id,
                descripcion: "Inscripción ciclo 2026-2027",
                cantidad: 1,
                monto: 2500,
              },
            ],
          },
        },
      })

      pagos++

      // Algunos además pidieron constancia: eso genera trámite.
      if (aleatorio() > 0.8) {
        const conConstancia = await prisma.pago.create({
          data: {
            alumnoId: alumno.id,
            total: 150,
            metodo: "EFECTIVO",
            pagadoEn: new Date("2026-08-20"),
            detalles: {
              create: [
                {
                  conceptoPagoId: conceptos.CONSTANCIA.id,
                  cantidad: 1,
                  monto: 150,
                },
              ],
            },
          },
        })

        await prisma.tramite.create({
          data: {
            alumnoId: alumno.id,
            conceptoPagoId: conceptos.CONSTANCIA.id,
            pagoId: conConstancia.id,
            estado: elegir(["SOLICITADO", "EN_PROCESO", "LISTO"]),
          },
        })

        pagos++
        tramites++
      }

      void pago
    } else {
      // Los que no pagaron quedan con adeudo: sirve para probar
      // el bloqueo de calificaciones.
      adeudosData.push({
          alumnoId: alumno.id,
          conceptoPagoId: conceptos.INSCRIPCION.id,
          cicloEscolarId: ciclo.id,
          descripcion: "Inscripción ciclo 2026-2027",
          monto: 2500,
          saldo: 2500,
          fechaLimite: new Date("2026-09-15"),
      })

      adeudos++
    }

    // Colegiatura de septiembre pendiente para una parte del grupo.
    if (aleatorio() > 0.7) {
      adeudosData.push({
          alumnoId: alumno.id,
          conceptoPagoId: conceptos.COLEGIATURA.id,
          cicloEscolarId: ciclo.id,
          descripcion: "Colegiatura septiembre",
          monto: 1200,
          saldo: 1200,
          fechaLimite: new Date("2026-09-10"),
      })

      adeudos++
    }
  }

  await porLotes((args) => prisma.adeudo.createMany(args), adeudosData)

  console.log(`✅ ${pagos} recibos · ${adeudos} adeudos · ${tramites} trámites`)

  /* =====================================================
     📌 OBSERVACIONES
  ===================================================== */

  let observaciones = 0

  for (const { alumno, grupo } of alumnos.slice(0, 8)) {
    const o = await prisma.observacion.create({
      data: {
        titulo: elegir([
          "Bajo desempeño en matemáticas",
          "Inasistencias recurrentes",
          "Reconocimiento por participación",
          "Retardos frecuentes",
        ]),
        descripcion:
          "Registrada durante la siembra de datos de prueba para verificar el módulo de seguimiento.",
        tipo: elegir(["ACADEMICA", "ASISTENCIA", "CONDUCTA", "RECONOCIMIENTO"]),
        gravedad: elegir(["BAJA", "MEDIA", "ALTA"]),
        alumnoId: alumno.id,
        grupoId: grupo.registro.id,
      },
    })

    if (aleatorio() > 0.5) {
      await prisma.observacionSeguimiento.create({
        data: {
          observacionId: o.id,
          nota: "Se citó al tutor y se acordó plan de recuperación.",
          estatusNuevo: "EN_SEGUIMIENTO",
        },
      })

      await prisma.observacion.update({
        where: { id: o.id },
        data: { estatus: "EN_SEGUIMIENTO" },
      })
    }

    observaciones++
  }

  console.log(`✅ ${observaciones} observaciones\n`)

  /* =====================================================
     🔑 RESUMEN
  ===================================================== */

  console.log("─".repeat(58))
  console.log("🧪 DATOS DE PRUEBA LISTOS")
  console.log("─".repeat(58))
  console.log(`Contraseña de todos:  ${PASSWORD}`)
  console.log("")
  console.log(`  Admin        admin@${DOMINIO}`)
  console.log(`  Dirección    director@${DOMINIO}`)
  console.log(`  Secretaría   secretaria@${DOMINIO}`)
  console.log(`  Caja         caja@${DOMINIO}`)
  console.log(`  Maestro      docente1@${DOMINIO}`)
  console.log(`  Alumno       20260001@${DOMINIO}`)
  console.log("")
  console.log("Turnos: Matutino (mañana) y Vespertino (tarde)")
  console.log("")
  console.log("Para borrar todo esto:  npm run demo:limpiar")
  console.log("─".repeat(58))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
