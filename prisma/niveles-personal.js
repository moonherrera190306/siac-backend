import "dotenv/config"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * 🏫 NIVEL DE DIRECCIÓN Y SECRETARÍA
 *
 *   npm run niveles
 *
 * Quien tiene nivel solo ve ese nivel. Sin nivel (null) ve ambos.
 * Se puede correr las veces que sea.
 */
const NIVELES = {
  "cuauhtemoc@ceszam.mx": "PREPARATORIA", // Director de la Preparatoria
  "ramon@ceszam.mx": "PREPARATORIA",      // Subdirector
  "laura@ceszam.mx": "PREPARATORIA",
  "paulina@ceszam.mx": "PREPARATORIA",
  "monica@ceszam.mx": "PREPARATORIA",
  "igor@ceszam.mx": "UNIVERSIDAD",        // Director de la Universidad
  "elizabeth@ceszam.mx": "UNIVERSIDAD",
  "fernando@ceszam.mx": null,             // Coordinador: ambos niveles
}

async function main() {
  const niveles = await prisma.nivelAcademico.findMany({ select: { id: true, clave: true } })
  const idDe = Object.fromEntries(niveles.map((n) => [n.clave, n.id]))

  for (const [email, clave] of Object.entries(NIVELES)) {
    if (clave && !idDe[clave]) {
      console.log(`❌ No existe el nivel ${clave} en la base.`)
      continue
    }

    const r = await prisma.user.updateMany({
      where: { email },
      data: { nivelAcademicoId: clave ? idDe[clave] : null },
    })

    console.log(r.count ? `✅ ${email.padEnd(24)} → ${clave ?? "ambos niveles"}` : `⚠️  ${email} no existe`)
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
