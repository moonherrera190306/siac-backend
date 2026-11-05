import "dotenv/config"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * 🏷️ MARCAR DATOS DE PRUEBA PARA BORRARLOS
 *
 *   npm run prueba:marcar      → solo muestra qué marcaría
 *   npm run prueba:marcar -- --si
 *   npm run demo:limpiar       → borra todo lo marcado
 *
 * Toma los alumnos "Alumno 1…5" (matrículas 202601-202605) que se
 * colaron en la base real y les pone la misma marca que usa el seed
 * demo (legacyId DEMO-… y correo @demo.ceszam.mx). Su grupo se marca
 * solo si no tiene a nadie más. Así el borrado lo hace limpiar-demo.js,
 * que ya sabe el orden correcto y no toca nada sin marca.
 */
const MATRICULAS = ["202601", "202602", "202603", "202604", "202605"]

async function main() {
  const marcar = process.argv.includes("--si")

  const alumnos = await prisma.alumno.findMany({
    where: { matricula: { in: MATRICULAS }, user: { name: { startsWith: "Alumno " } } },
    select: { id: true, matricula: true, grupoId: true, userId: true, user: { select: { name: true } } },
  })

  if (!alumnos.length) {
    console.log("\nNo hay alumnos de prueba con esas matrículas.\n")
    return
  }

  const ids = alumnos.map((a) => a.id)
  const grupoIds = [...new Set(alumnos.map((a) => a.grupoId).filter(Boolean))]

  // Un grupo se borra solo si todos sus alumnos (vigentes o inscritos) son de prueba.
  const gruposSoloPrueba = []
  for (const grupoId of grupoIds) {
    const otros = await prisma.alumno.count({ where: { grupoId, id: { notIn: ids } } })
    const otrasInscripciones = await prisma.inscripcion.count({ where: { grupoId, alumnoId: { notIn: ids } } })
    if (!otros && !otrasInscripciones) gruposSoloPrueba.push(grupoId)
  }

  console.log("\nAlumnos de prueba:")
  alumnos.forEach((a) => console.log(`   ${a.matricula}  ${a.user.name}`))
  console.log(`Grupos que quedan vacíos y también se borran: ${gruposSoloPrueba.length}\n`)

  if (!marcar) {
    console.log('Nada se modificó. Para marcarlos: npm run prueba:marcar -- --si\n')
    return
  }

  for (const a of alumnos) {
    await prisma.$transaction([
      prisma.alumno.update({ where: { id: a.id }, data: { legacyId: `DEMO-PRUEBA-${a.matricula}` } }),
      prisma.user.update({ where: { id: a.userId }, data: { email: `${a.matricula}@demo.ceszam.mx` } }),
    ])
  }

  for (const id of gruposSoloPrueba) {
    await prisma.grupo.update({ where: { id }, data: { legacyId: `DEMO-PRUEBA-GRUPO-${id.slice(0, 8)}` } })
  }

  console.log("✅ Marcados. Ahora corre:  npm run demo:limpiar\n")
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
