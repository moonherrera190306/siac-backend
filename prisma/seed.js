import { PrismaClient } from "@prisma/client"
import bcrypt from "bcrypt"

const prisma = new PrismaClient()

async function main() {
  // 🔐 Password común
  const password = await bcrypt.hash("123456", 10)

  // 👨‍🏫 MAESTRO
  const maestroUser = await prisma.user.create({
    data: {
      name: "Maestro Demo",
      email: "maestro@siac.com",
      password,
      role: "MAESTRO",
      debeCambiarPassword: false
    },
  })

  const docente = await prisma.docente.create({
    data: {
      userId: maestroUser.id,
    },
  })

  // 🎓 ESTRUCTURA
  const programa = await prisma.programa.create({
    data: {
      nombre: "Preparatoria",
    },
  })

  const carrera = await prisma.carrera.create({
    data: {
      nombre: "General",
      programaId: programa.id,
    },
  })

  const semestre = await prisma.semestre.create({
    data: {
      nombre: "1",
      carreraId: carrera.id,
    },
  })

  const grupo = await prisma.grupo.create({
    data: {
      nombre: "A",
      semestreId: semestre.id,
    },
  })

  // 📚 MATERIAS
  const matematicas = await prisma.materia.create({
    data: {
      nombre: "Matemáticas",
      grupoId: grupo.id,
      docenteId: docente.id,
    },
  })

  const espanol = await prisma.materia.create({
    data: {
      nombre: "Español",
      grupoId: grupo.id,
      docenteId: docente.id,
    },
  })

  // 👨‍🎓 ALUMNOS
  for (let i = 1; i <= 5; i++) {
    const matricula = `20230${i}`

    const user = await prisma.user.create({
      data: {
        name: `Alumno ${i}`,
        email: `${matricula}@siac.com`,
        password,
        role: "ALUMNO",
        debeCambiarPassword: false
      },
    })

    await prisma.alumno.create({
      data: {
        matricula,
        userId: user.id,
        grupoId: grupo.id,
      },
    })
  }

  console.log("🔥 SEED COMPLETADO")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })