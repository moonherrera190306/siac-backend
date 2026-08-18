import { PrismaClient } from "@prisma/client"
import readline from "node:readline/promises"

const prisma = new PrismaClient()

/**
 * =========================================
 * 🧹 BORRAR LOS DATOS DE PRUEBA
 * =========================================
 *
 *   npm run demo:limpiar
 *   npm run demo:limpiar -- --si     (sin preguntar)
 *
 * Borra ÚNICAMENTE lo que sembró seed-demo.js. Se reconoce por:
 *   · `legacyId` que empieza con DEMO-
 *   · correos @demo.ceszam.mx
 *
 * Lo que NO tenga esa marca no se toca. Si algún día ya hay datos
 * reales conviviendo con los de prueba, este script los respeta.
 *
 * El orden importa: primero lo que depende de otros, al final lo que
 * es referenciado. Si se invierte, Postgres rechaza el borrado por
 * las llaves foráneas — que es exactamente lo que debe pasar.
 */

const MARCA = "DEMO-"
const DOMINIO = "demo.ceszam.mx"

async function main() {
  const sinPreguntar = process.argv.includes("--si")

  /* ---------- qué hay marcado como demo ---------- */

  const usuarios = await prisma.user.findMany({
    where: { email: { endsWith: `@${DOMINIO}` } },
    select: { id: true },
  })

  const usuarioIds = usuarios.map((u) => u.id)

  const alumnos = await prisma.alumno.findMany({
    where: {
      OR: [
        { legacyId: { startsWith: MARCA } },
        { userId: { in: usuarioIds } },
      ],
    },
    select: { id: true },
  })

  const alumnoIds = alumnos.map((a) => a.id)

  const docentes = await prisma.docente.findMany({
    where: {
      OR: [
        { legacyId: { startsWith: MARCA } },
        { userId: { in: usuarioIds } },
      ],
    },
    select: { id: true },
  })

  const docenteIds = docentes.map((d) => d.id)

  const grupos = await prisma.grupo.findMany({
    where: { legacyId: { startsWith: MARCA } },
    select: { id: true },
  })

  const grupoIds = grupos.map((g) => g.id)

  const asignaciones = await prisma.asignacionMateria.findMany({
    where: {
      OR: [{ grupoId: { in: grupoIds } }, { docenteId: { in: docenteIds } }],
    },
    select: { id: true },
  })

  const asignacionIds = asignaciones.map((a) => a.id)

  const pagos = await prisma.pago.findMany({
    where: { alumnoId: { in: alumnoIds } },
    select: { id: true },
  })

  const pagoIds = pagos.map((p) => p.id)

  console.log("\n🧹 Se va a borrar:\n")
  console.log(`   ${usuarioIds.length} usuarios @${DOMINIO}`)
  console.log(`   ${alumnoIds.length} alumnos`)
  console.log(`   ${docenteIds.length} docentes`)
  console.log(`   ${grupoIds.length} grupos`)
  console.log(`   ${asignacionIds.length} asignaciones (con horarios y clases)`)
  console.log(`   ${pagoIds.length} recibos (con sus detalles)`)
  console.log("   + calificaciones, asistencias, adeudos, trámites y observaciones\n")

  if (alumnoIds.length === 0 && usuarioIds.length === 0) {
    console.log("No hay datos de prueba que borrar.\n")
    return
  }

  if (!sinPreguntar) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const respuesta = await rl.question('Escribe "BORRAR" para confirmar: ')

    rl.close()

    if (respuesta.trim() !== "BORRAR") {
      console.log("\nCancelado. No se borró nada.\n")
      return
    }
  }

  /* ---------- borrado en orden de dependencia ---------- */

  const pasos = []

  const anota = (nombre, resultado) =>
    pasos.push(`   ${String(resultado.count).padStart(5)}  ${nombre}`)

  // Hijos de observación
  anota(
    "seguimientos de observación",
    await prisma.observacionSeguimiento.deleteMany({
      where: {
        observacion: {
          OR: [
            { alumnoId: { in: alumnoIds } },
            { docenteId: { in: docenteIds } },
            { grupoId: { in: grupoIds } },
          ],
        },
      },
    })
  )

  anota(
    "observaciones",
    await prisma.observacion.deleteMany({
      where: {
        OR: [
          { alumnoId: { in: alumnoIds } },
          { docenteId: { in: docenteIds } },
          { grupoId: { in: grupoIds } },
        ],
      },
    })
  )

  // Asistencia y clases
  anota(
    "asistencias de clase",
    await prisma.asistenciaClase.deleteMany({
      where: { alumnoId: { in: alumnoIds } },
    })
  )

  anota(
    "clases",
    await prisma.clase.deleteMany({
      where: { asignacionId: { in: asignacionIds } },
    })
  )

  anota(
    "asistencia mensual",
    await prisma.asistenciaMensual.deleteMany({
      where: { alumnoId: { in: alumnoIds } },
    })
  )

  anota(
    "horarios",
    await prisma.horario.deleteMany({
      where: { asignacionId: { in: asignacionIds } },
    })
  )

  // Caja
  anota(
    "trámites",
    await prisma.tramite.deleteMany({ where: { alumnoId: { in: alumnoIds } } })
  )

  anota(
    "detalles de pago",
    await prisma.detallePago.deleteMany({ where: { pagoId: { in: pagoIds } } })
  )

  anota(
    "recibos",
    await prisma.pago.deleteMany({ where: { alumnoId: { in: alumnoIds } } })
  )

  anota(
    "adeudos",
    await prisma.adeudo.deleteMany({ where: { alumnoId: { in: alumnoIds } } })
  )

  // Académico
  anota(
    "calificaciones",
    await prisma.calificacion.deleteMany({
      where: { alumnoId: { in: alumnoIds } },
    })
  )

  anota(
    "documentos",
    await prisma.documento.deleteMany({ where: { alumnoId: { in: alumnoIds } } })
  )

  anota(
    "inscripciones",
    await prisma.inscripcion.deleteMany({
      where: { alumnoId: { in: alumnoIds } },
    })
  )

  anota(
    "asignaciones",
    await prisma.asignacionMateria.deleteMany({
      where: { id: { in: asignacionIds } },
    })
  )

  // Personas
  anota(
    "alumnos",
    await prisma.alumno.deleteMany({ where: { id: { in: alumnoIds } } })
  )

  anota(
    "docentes",
    await prisma.docente.deleteMany({ where: { id: { in: docenteIds } } })
  )

  anota(
    "grupos",
    await prisma.grupo.deleteMany({ where: { id: { in: grupoIds } } })
  )

  // Auditoría de esos usuarios
  anota(
    "registros de auditoría",
    await prisma.auditLog.deleteMany({
      where: { usuarioId: { in: usuarioIds } },
    })
  )

  anota(
    "usuarios",
    await prisma.user.deleteMany({ where: { id: { in: usuarioIds } } })
  )

  console.log("\n✅ Borrado:\n")
  console.log(pasos.join("\n"))

  console.log(`
─────────────────────────────────────────────────────────
Los CATÁLOGOS se conservaron a propósito:
niveles, turnos, programas, carreras, semestres, materias,
trayectorias, ciclo escolar, bloqueos y conceptos de pago.

Son la configuración de la escuela, no datos de prueba.
Si también quieres borrarlos, lo más limpio es:

    npx prisma migrate reset

que deja la base en cero y vuelve a correr el seed base.
─────────────────────────────────────────────────────────
`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
