import "dotenv/config"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * 👨‍🏫 UNA SOLA CUENTA PARA LOS DIRECTIVOS QUE DAN CLASE
 *
 *   node prisma/unir-directivos.js            → solo muestra
 *   node prisma/unir-directivos.js --aplicar  → lo guarda
 *
 * Su ficha de maestro (materias, grupos, calificaciones) quedó colgada de
 * una cuenta MAESTRO aparte. Aquí se pasa la ficha a su cuenta de
 * dirección y la cuenta de maestro duplicada se desactiva (no se borra).
 */
const PARES = [
  ["fernando@ceszam.mx", "jvelazquez@docente.ceszam.mx"],
  ["cuauhtemoc@ceszam.mx", "corozco@docente.ceszam.mx"],
  ["igor@ceszam.mx", "igor@docente.ceszam.mx"],
  ["ramon@ceszam.mx", "raymon_vega@hotmail.com"],
]

async function main() {
  const aplicar = process.argv.includes("--aplicar")
  console.log()

  for (const [direccion, maestro] of PARES) {
    const dir = await prisma.user.findUnique({ where: { email: direccion }, include: { docente: true } })
    const mae = await prisma.user.findUnique({
      where: { email: maestro },
      include: { docente: { include: { _count: { select: { asignaciones: true } } } } },
    })

    if (!dir) { console.log(`⚠️  No existe ${direccion}`); continue }
    if (dir.docente) { console.log(`✓  ${direccion} ya tiene su ficha de maestro`); continue }
    if (!mae?.docente) { console.log(`⚠️  ${maestro} no tiene ficha de maestro`); continue }

    console.log(`${direccion.padEnd(22)} ← ficha de ${maestro} (${mae.docente.nombre || mae.name}, ${mae.docente._count.asignaciones} materias)`)

    if (aplicar) {
      await prisma.$transaction([
        prisma.docente.update({ where: { id: mae.docente.id }, data: { userId: dir.id } }),
        prisma.user.update({ where: { id: mae.id }, data: { activo: false } }),
      ])
    }
  }

  console.log(aplicar ? "\n✅ Listo. Que cierren sesión y vuelvan a entrar.\n" : "\nNada se guardó. Para guardar:  node prisma/unir-directivos.js --aplicar\n")
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
