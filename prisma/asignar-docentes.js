import "dotenv/config"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * 👨‍🏫 ASIGNAR MAESTROS COMO ERAN
 *
 *   npm run asignar:docentes
 *       → lista los ciclos con cuántas materias asignadas y horarios tiene cada uno
 *
 *   npm run asignar:docentes -- --desde "2025-2026"
 *       → muestra qué se copiaría de ese ciclo al ciclo activo
 *
 *   npm run asignar:docentes -- --desde "2025-2026" --aplicar
 *       → lo copia: misma materia, mismo grupo, mismo maestro, mismo horario
 *
 * Lo que ya exista en el ciclo activo (misma materia y grupo) no se toca.
 */

const arg = (nombre) => {
  const i = process.argv.indexOf(nombre)
  return i > -1 ? process.argv[i + 1] : null
}

async function main() {
  const desde = arg("--desde")
  const aplicar = process.argv.includes("--aplicar")

  const activo = await prisma.cicloEscolar.findFirst({
    where: { activo: true },
    orderBy: [{ fechaInicio: "desc" }, { createdAt: "desc" }],
  })
  if (!activo) throw new Error("No hay ciclo activo.")

  const ciclos = await prisma.cicloEscolar.findMany({ orderBy: [{ fechaInicio: "asc" }, { nombre: "asc" }] })

  if (!desde) {
    console.log("\nCiclo            Materias asignadas  Horarios")
    for (const c of ciclos) {
      const asig = await prisma.asignacionMateria.count({ where: { cicloEscolarId: c.id } })
      const hor = await prisma.horario.count({ where: { asignacion: { cicloEscolarId: c.id } } })
      console.log(`${(c.nombre + (c.id === activo.id ? " (activo)" : "")).padEnd(17)}${String(asig).padStart(18)}${String(hor).padStart(10)}`)
    }
    console.log(`\nPara copiar al ciclo activo:  npm run asignar:docentes -- --desde "NOMBRE DEL CICLO"\n`)
    return
  }

  const origen = ciclos.find((c) => c.nombre === desde)
  if (!origen) throw new Error(`No existe el ciclo "${desde}".`)
  if (origen.id === activo.id) throw new Error("El ciclo de origen es el activo.")

  const fuente = await prisma.asignacionMateria.findMany({
    where: { cicloEscolarId: origen.id, grupo: { activo: true }, docente: { activo: true } },
    include: { horarios: true },
  })

  const existentes = new Set(
    (await prisma.asignacionMateria.findMany({
      where: { cicloEscolarId: activo.id },
      select: { materiaId: true, grupoId: true },
    })).map((a) => `${a.materiaId}|${a.grupoId}`)
  )

  const nuevas = fuente.filter((a) => !existentes.has(`${a.materiaId}|${a.grupoId}`))
  const horarios = nuevas.reduce((n, a) => n + a.horarios.length, 0)

  console.log(`\nDe ${origen.nombre} → ${activo.nombre}:`)
  console.log(`   ${nuevas.length} materias asignadas se copian (con ${horarios} horarios)`)
  console.log(`   ${fuente.length - nuevas.length} ya existían en el ciclo activo y no se tocan`)

  if (!aplicar) {
    console.log(`\nNada se guardó. Para guardar:  npm run asignar:docentes -- --desde "${desde}" --aplicar\n`)
    return
  }

  let hechas = 0
  for (const a of nuevas) {
    await prisma.asignacionMateria.create({
      data: {
        materiaId: a.materiaId,
        docenteId: a.docenteId,
        grupoId: a.grupoId,
        cicloEscolarId: activo.id,
        aula: a.aula,
        horarios: {
          create: a.horarios.map((h) => ({ dia: h.dia, horaInicio: h.horaInicio, horaFin: h.horaFin, aula: h.aula })),
        },
      },
    })
    if (++hechas % 50 === 0) console.log(`   ${hechas}…`)
  }

  console.log(`\n✅ Copiadas ${hechas} materias con sus maestros y horarios a ${activo.nombre}.\n`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
