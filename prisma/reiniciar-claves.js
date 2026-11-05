import "dotenv/config"
import bcrypt from "bcrypt"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * 🔑 REGRESAR TODAS LAS CONTRASEÑAS A LA INICIAL
 *
 *   npm run claves:reiniciar                    → solo cuenta a cuántos afecta
 *   npm run claves:reiniciar -- --si            → todas a Ceszam2026*, con cambio obligatorio
 *   npm run claves:reiniciar -- --si --sin-cambio  → igual, sin pedir cambio al entrar
 *
 * Afecta a TODAS las cuentas (personal, maestros y alumnos), también a
 * quienes ya habían puesto la suya.
 */
const INICIAL = "Ceszam2026*"

async function main() {
  const aplicar = process.argv.includes("--si")
  const forzarCambio = !process.argv.includes("--sin-cambio")

  const porRol = await prisma.user.groupBy({ by: ["role"], _count: true })
  console.log("\nCuentas que se reinician:")
  porRol.forEach((r) => console.log(`   ${r.role.padEnd(11)} ${r._count}`))

  if (!aplicar) {
    console.log("\nNada se modificó. Para aplicar:  npm run claves:reiniciar -- --si\n")
    return
  }

  const r = await prisma.user.updateMany({
    data: { password: await bcrypt.hash(INICIAL, 10), debeCambiarPassword: forzarCambio },
  })

  console.log(`\n✅ ${r.count} cuentas con ${INICIAL}${forzarCambio ? " (se pedirá cambiarla al entrar)" : ""}.\n`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
