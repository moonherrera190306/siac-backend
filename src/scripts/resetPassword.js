/**
 * Restablece la contraseña de un usuario.
 *
 *   node src/scripts/resetPassword.js admin@siac.com MiNuevaClave123
 *
 * Con --forzar-cambio el usuario deberá cambiarla en su próximo acceso
 * (la bandera debeCambiarPassword se pone en true).
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import prisma from "../lib/prisma.js";

async function main() {
  const [email, nuevaPassword] = process.argv.slice(2);
  const forzarCambio = process.argv.includes("--forzar-cambio");

  if (!email || !nuevaPassword) {
    console.log("\nUso:  node src/scripts/resetPassword.js <correo> <nueva-clave> [--forzar-cambio]\n");
    process.exit(1);
  }

  if (nuevaPassword.length < 8) {
    console.log("\n❌ La contraseña debe tener al menos 8 caracteres.\n");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.log(`\n❌ No existe ningún usuario con el correo "${email}".`);
    console.log("   Revisa la lista con:  node src/scripts/listUsers.js\n");
    process.exit(1);
  }

  await prisma.user.update({
    where: { email },
    data: {
      password: await bcrypt.hash(nuevaPassword, 10),
      debeCambiarPassword: forzarCambio,
      activo: true,
    },
  });

  console.log(`\n✅ Contraseña actualizada para ${user.name} (${user.role}) — ${email}`);
  if (forzarCambio) {
    console.log("   Se le pedirá cambiarla en su próximo acceso.");
  }
  console.log();
}

main()
  .catch((e) => {
    console.error("❌ ERROR:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
