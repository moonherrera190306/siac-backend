import prisma from "../src/lib/prisma.js";
import bcrypt from "bcrypt";

console.log("🔥 SCRIPT INICIADO");

async function main() {
  console.log("🚀 Creando usuarios...");

  const password = await bcrypt.hash("123456", 10);

  const users = [
    { name: "Admin", email: "admin@siac.com", role: "ADMIN" },
    { name: "Caja", email: "caja@siac.com", role: "CAJA" },
    { name: "Director", email: "director@siac.com", role: "DIRECTOR" },
    { name: "Secretaria", email: "secretaria@siac.com", role: "SECRETARIA" },
  ];

  for (const u of users) {
    const exists = await prisma.user.findUnique({
      where: { email: u.email },
    });

    if (!exists) {
      await prisma.user.create({
        data: {
          name: u.name,
          email: u.email,
          password,
          role: u.role,
        },
      });

      console.log(`✅ ${u.role} creado`);
    } else {
      console.log(`⚠️ ${u.role} ya existe`);
    }
  }

  console.log("🔥 Proceso terminado");
}

main()
  .catch((e) => console.error("❌ ERROR:", e))
  .finally(async () => {
    await prisma.$disconnect();
  });