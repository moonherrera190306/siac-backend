/**
 * Lista los usuarios existentes en la base de datos.
 *
 *   node src/scripts/listUsers.js
 *
 * NOTA: las contraseñas están cifradas con bcrypt y NO se pueden recuperar.
 * Para asignar una nueva usa: node src/scripts/resetPassword.js <correo> <clave>
 */
import "dotenv/config";
import prisma from "../lib/prisma.js";

async function main() {
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { email: "asc" }],
    include: {
      alumno: { select: { matricula: true } },
      docente: { select: { id: true } },
    },
  });

  if (users.length === 0) {
    console.log("\n⚠️  No hay usuarios en la base de datos.");
    console.log("   Crea los administrativos con:  node src/scripts/createUsers.js");
    console.log("   Crea los de demo con:          npx prisma db seed\n");
    return;
  }

  console.log(`\n👥 ${users.length} usuario(s) en la base de datos:\n`);
  console.log(
    "ROL".padEnd(12) +
      "CORREO".padEnd(30) +
      "NOMBRE".padEnd(22) +
      "MATRÍCULA".padEnd(12) +
      "ACTIVO".padEnd(8) +
      "DEBE CAMBIAR CLAVE"
  );
  console.log("-".repeat(100));

  for (const u of users) {
    console.log(
      String(u.role).padEnd(12) +
        String(u.email).padEnd(30) +
        String(u.name).slice(0, 20).padEnd(22) +
        String(u.alumno?.matricula ?? "—").padEnd(12) +
        String(u.activo ? "sí" : "NO").padEnd(8) +
        (u.debeCambiarPassword ? "sí" : "no")
    );
  }

  console.log(
    "\nℹ️  Las contraseñas están cifradas y no se pueden mostrar." +
      "\n   Para asignar una nueva:  node src/scripts/resetPassword.js <correo> <nueva-clave>\n"
  );
}

main()
  .catch((e) => {
    console.error("❌ ERROR:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
