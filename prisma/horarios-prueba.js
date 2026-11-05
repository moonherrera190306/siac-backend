import "dotenv/config"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * 🕐 HORARIOS DE PRUEBA PARA EL CICLO ACTIVO
 *
 *   node prisma/horarios-prueba.js            → solo cuenta
 *   node prisma/horarios-prueba.js --aplicar  → los guarda
 *
 * A cada materia asignada del ciclo activo que no tenga horario le pone
 * bloques de una hora, de lunes a viernes, en el turno de su grupo
 * (matutino 07:00–13:00, vespertino 15:00–21:00). Usa materia.horasSemana
 * o 3 si no está capturado. Nunca encima dos materias del mismo grupo ni
 * al mismo maestro en dos lugares a la vez. Lo que no cabe se reporta.
 */
const DIAS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES"]
const MAT = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00"]
const VES = ["15:00", "16:00", "17:00", "18:00", "19:00", "20:00"]
const fin = (h) => `${String(Number(h.slice(0, 2)) + 1).padStart(2, "0")}:00`

async function main() {
  const aplicar = process.argv.includes("--aplicar")

  const ciclo = await prisma.cicloEscolar.findFirst({
    where: { activo: true },
    orderBy: [{ fechaInicio: "desc" }, { createdAt: "desc" }],
  })
  if (!ciclo) throw new Error("No hay ciclo activo.")

  const asignaciones = await prisma.asignacionMateria.findMany({
    where: { cicloEscolarId: ciclo.id },
    include: {
      horarios: true,
      materia: { select: { horasSemana: true } },
      grupo: { select: { nombre: true, turno: { select: { clave: true, nombre: true } } } },
    },
    orderBy: [{ grupoId: "asc" }, { materiaId: "asc" }],
  })

  // Lo ya ocupado (horarios existentes) cuenta para no encimar.
  const ocupadoGrupo = new Set()
  const ocupadoDocente = new Set()
  for (const a of asignaciones) for (const h of a.horarios) {
    ocupadoGrupo.add(`${a.grupoId}|${h.dia}|${h.horaInicio}`)
    ocupadoDocente.add(`${a.docenteId}|${h.dia}|${h.horaInicio}`)
  }

  const nuevos = []
  const incompletas = []

  for (const a of asignaciones.filter((x) => !x.horarios.length)) {
    const vespertino = /VES/i.test(a.grupo.turno?.clave ?? a.grupo.turno?.nombre ?? "")
    const horas = vespertino ? VES : MAT
    const meta = Math.min(a.materia.horasSemana || 3, 5)
    let puestas = 0

    // Recorre las horas y, dentro de cada hora, los días: así reparte en la semana.
    for (const hora of horas) {
      for (const dia of DIAS) {
        if (puestas >= meta) break
        const kg = `${a.grupoId}|${dia}|${hora}`, kd = `${a.docenteId}|${dia}|${hora}`
        if (ocupadoGrupo.has(kg) || ocupadoDocente.has(kd)) continue
        // Una sola vez por día para la misma materia.
        if (nuevos.some((n) => n.asignacionId === a.id && n.dia === dia)) continue
        ocupadoGrupo.add(kg); ocupadoDocente.add(kd)
        nuevos.push({ asignacionId: a.id, dia, horaInicio: hora, horaFin: fin(hora) })
        puestas++
      }
      if (puestas >= meta) break
    }
    if (puestas < meta) incompletas.push(`${a.grupo.nombre}: ${puestas} de ${meta} horas`)
  }

  console.log(`\nCiclo activo: ${ciclo.nombre}`)
  console.log(`   ${asignaciones.filter((x) => !x.horarios.length).length} materias sin horario`)
  console.log(`   ${nuevos.length} bloques de una hora a crear`)
  if (incompletas.length) {
    console.log(`   ${incompletas.length} materias no cupieron completas (grupo o maestro sin horas libres):`)
    incompletas.slice(0, 20).forEach((t) => console.log(`      ${t}`))
  }

  if (!aplicar) {
    console.log("\nNada se guardó. Para guardar:  node prisma/horarios-prueba.js --aplicar\n")
    return
  }

  const r = await prisma.horario.createMany({ data: nuevos, skipDuplicates: true })
  console.log(`\n✅ ${r.count} horarios creados en ${ciclo.nombre}.\n`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
