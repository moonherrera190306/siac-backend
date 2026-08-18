import { PrismaClient } from "@prisma/client"
import bcrypt from "bcrypt"

const prisma = new PrismaClient()

/**
 * =========================================
 * 🌱 SEED — estructura mínima de CESZAM
 * =========================================
 *
 * Crea la estructura académica completa (nivel → turno → programa →
 * carrera → semestre → grupo), un ciclo activo con sus bloqueos de
 * kardex, los conceptos de caja y un usuario por cada rol.
 *
 * La contraseña se toma de SEED_PASSWORD. Si no está definida se usa
 * una por defecto y los alumnos quedan obligados a cambiarla.
 */

const PASSWORD_PLANO = process.env.SEED_PASSWORD || "Ceszam2026*"

async function main() {
  const password = await bcrypt.hash(PASSWORD_PLANO, 10)

  /* =======================================
     🏛️ NIVELES Y TURNOS
  ======================================= */

  const prepa = await prisma.nivelAcademico.create({
    data: { clave: "PREPARATORIA", nombre: "Escuela Preparatoria por Cooperación" },
  })

  const universidad = await prisma.nivelAcademico.create({
    data: { clave: "UNIVERSIDAD", nombre: "CESZAM" },
  })

  const matutino = await prisma.turno.create({
    data: { clave: "MAT", nombre: "Matutino" },
  })

  await prisma.turno.create({
    data: { clave: "VES", nombre: "Vespertino" },
  })

  /* =======================================
     📚 PROGRAMAS, CARRERAS Y SEMESTRES
  ======================================= */

  const programaPrepa = await prisma.programa.create({
    data: { nombre: "Bachillerato", nivelAcademicoId: prepa.id },
  })

  await prisma.programa.create({
    data: { nombre: "Licenciaturas", nivelAcademicoId: universidad.id },
  })

  const carrera = await prisma.carrera.create({
    data: {
      nombre: "Bachillerato General",
      totalSemestres: 6,
      programaId: programaPrepa.id,
    },
  })

  const semestres = []

  for (let n = 1; n <= 6; n++) {
    const s = await prisma.semestre.create({
      data: {
        nombre: `${n}° Semestre`,
        numero: n,
        carreraId: carrera.id,
      },
    })

    semestres.push(s)
  }

  /* =======================================
     🧭 TRAYECTORIAS UMSNH
  ======================================= */

  const trayectorias = [
    { clave: "321", nombre: "Físico Matemáticas", seccion: "01" },
    { clave: "331", nombre: "Químico Biológicas", seccion: "02" },
    { clave: "341", nombre: "Económico Administrativas", seccion: "03" },
    { clave: "351", nombre: "Humanidades", seccion: "04" },
  ]

  // Las trayectorias son propias de preparatoria.
  for (const t of trayectorias) {
    await prisma.trayectoria.create({
      data: { ...t, nivelAcademicoId: prepa.id },
    })
  }

  /* =======================================
     👥 GRUPO
  ======================================= */

  const grupo = await prisma.grupo.create({
    data: {
      nombre: "1A",
      turnoId: matutino.id,
      semestreId: semestres[0].id,
      cupo: 40,
    },
  })

  /* =======================================
     📅 CICLO ESCOLAR + BLOQUEOS
  ======================================= */

  const ciclo = await prisma.cicloEscolar.create({
    data: {
      nombre: "2026-2027",
      activo: true,
      fechaInicio: new Date("2026-08-01"),
      fechaFin: new Date("2027-06-30"),
    },
  })

  // Todas las columnas del kardex nacen cerradas. Dirección las abre.
  const columnas = ["PP", "SP", "PROM", "EF", "O", "EE", "EA", "EER", "ND"]

  for (const columna of columnas) {
    await prisma.bloqueo.create({
      data: {
        cicloEscolarId: ciclo.id,
        columna,
        abierto: columna === "PP",
      },
    })
  }

  /* =======================================
     📘 MATERIAS
  ======================================= */

  const matematicas = await prisma.materia.create({
    data: {
      clave: "100155",
      nombre: "Matemáticas I",
      tipo: "OBLIGATORIA",
      tipoEvaluacion: "NUMERICA",
      creditos: 8,
      horasSemana: 5,
      semestreId: semestres[0].id,
    },
  })

  const espanol = await prisma.materia.create({
    data: {
      clave: "100281",
      nombre: "Lengua y Literatura I",
      tipo: "OBLIGATORIA",
      tipoEvaluacion: "NUMERICA",
      creditos: 6,
      horasSemana: 4,
      semestreId: semestres[0].id,
    },
  })

  const deportes = await prisma.materia.create({
    data: {
      clave: "100900",
      nombre: "Actividades Deportivas",
      tipo: "EXTRACURRICULAR",
      tipoEvaluacion: "ACREDITACION",
      horasSemana: 2,
      semestreId: semestres[0].id,
    },
  })

  /* =======================================
     💰 CONCEPTOS DE CAJA
  ======================================= */

  const conceptos = [
    { clave: "INSCRIPCION", nombre: "Inscripción", monto: 2500, generaTramite: false },
    { clave: "CONSTANCIA", nombre: "Constancia de estudios", monto: 150, generaTramite: true },
    { clave: "MEMORANDUM", nombre: "Memorándum", monto: 100, generaTramite: true },
    { clave: "OTROS", nombre: "Otros", monto: null, generaTramite: false },
  ]

  for (const c of conceptos) {
    await prisma.conceptoPago.create({ data: c })
  }

  /* =======================================
     🧑‍💼 USUARIOS DE STAFF
  ======================================= */

  const staff = [
    { name: "Administrador", email: "admin@ceszam.mx", role: "ADMIN" },
    { name: "Dirección", email: "director@ceszam.mx", role: "DIRECTOR" },
    { name: "Secretaría", email: "secretaria@ceszam.mx", role: "SECRETARIA" },
    { name: "Caja", email: "caja@ceszam.mx", role: "CAJA" },
  ]

  for (const u of staff) {
    await prisma.user.create({
      data: { ...u, password, debeCambiarPassword: false },
    })
  }

  /* =======================================
     👨‍🏫 DOCENTE
  ======================================= */

  const maestroUser = await prisma.user.create({
    data: {
      name: "Maestro Demo",
      email: "maestro@ceszam.mx",
      password,
      role: "MAESTRO",
      debeCambiarPassword: false,
    },
  })

  const docente = await prisma.docente.create({
    data: {
      userId: maestroUser.id,
      nombre: "Maestro Demo",
      cedula: "0000000",
      rfc: "XAXX010101000",
    },
  })

  /* =======================================
     🔗 ASIGNACIONES + HORARIOS
  ======================================= */

  const horariosPorMateria = {
    [matematicas.id]: [
      { dia: "LUNES", horaInicio: "07:00", horaFin: "08:00" },
      { dia: "MIERCOLES", horaInicio: "07:00", horaFin: "08:00" },
    ],
    [espanol.id]: [
      { dia: "MARTES", horaInicio: "08:00", horaFin: "09:00" },
      { dia: "JUEVES", horaInicio: "08:00", horaFin: "09:00" },
    ],
    [deportes.id]: [{ dia: "VIERNES", horaInicio: "09:00", horaFin: "11:00" }],
  }

  for (const materia of [matematicas, espanol, deportes]) {
    const asignacion = await prisma.asignacionMateria.create({
      data: {
        materiaId: materia.id,
        docenteId: docente.id,
        grupoId: grupo.id,
        cicloEscolarId: ciclo.id,
        aula: "A-1",
      },
    })

    for (const h of horariosPorMateria[materia.id]) {
      await prisma.horario.create({
        data: { ...h, asignacionId: asignacion.id, aula: "A-1" },
      })
    }
  }

  /* =======================================
     👨‍🎓 ALUMNOS
  ======================================= */

  for (let i = 1; i <= 5; i++) {
    const matricula = `20260${i}`

    const user = await prisma.user.create({
      data: {
        name: `Alumno ${i}`,
        email: `${matricula}@ceszam.mx`,
        password,
        role: "ALUMNO",
        debeCambiarPassword: true,
      },
    })

    const alumno = await prisma.alumno.create({
      data: {
        matricula,
        userId: user.id,
        grupoId: grupo.id,
        programaId: programaPrepa.id,
        carreraId: carrera.id,
      },
    })

    // El grupo vigente vive en Alumno; el historial, en Inscripcion.
    await prisma.inscripcion.create({
      data: {
        alumnoId: alumno.id,
        cicloEscolarId: ciclo.id,
        grupoId: grupo.id,
        semestreNumero: 1,
        estatus: "ACTIVA",
      },
    })
  }

  console.log("🔥 SEED COMPLETADO")
  console.log(`   Contraseña de acceso: ${PASSWORD_PLANO}`)
  console.log("   Recuerda continuar la serie de folios:")
  console.log('   ALTER SEQUENCE "Pago_folio_seq" RESTART WITH 100053;')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
