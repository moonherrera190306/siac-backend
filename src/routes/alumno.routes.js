import express from "express";
import prisma from "../lib/prisma.js";
import bcrypt from "bcrypt";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";

const router = express.Router();


// ✅ CREAR ALUMNO
router.post(
  "/",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { name, email, matricula } = req.body;

      if (!name || !email || !matricula) {
        return res.status(400).json({ message: "Faltan datos" });
      }

      const hashedPassword = await bcrypt.hash("123456", 10);

      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "ALUMNO"
        }
      });

      const alumno = await prisma.alumno.create({
        data: {
          matricula,
          userId: user.id
        }
      });

      res.json(alumno);

    } catch (error) {
      console.error(error);

      if (error.code === "P2002") {
        return res.status(400).json({
          message: "Email o matrícula ya registrada"
        });
      }

      res.status(500).json({ error: error.message });
    }
  }
);


// ✅ OBTENER TODOS LOS ALUMNOS
router.get(
  "/",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA"]),
  async (req, res) => {
    try {
      const alumnos = await prisma.alumno.findMany({
        include: { user: true }
      });

      res.json(alumnos);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }
);


// ✅ OBTENER UN SOLO ALUMNO
router.get(
  "/:id",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      const alumno = await prisma.alumno.findUnique({
        where: { id },
        include: { user: true }
      });

      if (!alumno) {
        return res.status(404).json({ message: "Alumno no encontrado" });
      }

      res.json(alumno);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }
);


// ✏️ ACTUALIZAR ALUMNO
router.put(
  "/:id",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, email, matricula } = req.body;

      const alumno = await prisma.alumno.update({
        where: { id },
        data: {
          matricula,
          user: {
            update: {
              name,
              email
            }
          }
        },
        include: { user: true }
      });

      res.json(alumno);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }
);


// 🗑️ ELIMINAR ALUMNO
router.delete(
  "/:id",
  verifyToken,
  checkRole(["ADMIN", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      const alumno = await prisma.alumno.findUnique({
        where: { id }
      });

      if (!alumno) {
        return res.status(404).json({ message: "Alumno no encontrado" });
      }

      await prisma.alumno.delete({
        where: { id }
      });

      await prisma.user.delete({
        where: { id: alumno.userId }
      });

      res.json({ message: "Alumno eliminado correctamente" });

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }
);


//////////////////////////////////////////////////////////
// 🔥🔥🔥 ESTA ES LA QUE TE FALTABA (CLAVE)
//////////////////////////////////////////////////////////

// 📚 MATERIAS DEL ALUMNO
router.get(
  "/materias/:id",
  verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;

      // 🔥 buscar alumno por userId
      const alumno = await prisma.alumno.findUnique({
        where: { userId: id }
      });

      if (!alumno) {
        return res.status(404).json({
          message: "Alumno no encontrado"
        });
      }

      // 🔥 materias del grupo
      const materias = await prisma.materia.findMany({
        where: {
          grupoId: alumno.grupoId
        },
        include: {
          docente: {
            include: {
              user: true
            }
          }
        }
      });

      // 🔥 calificaciones
      const calificaciones = await prisma.calificacion.findMany({
        where: {
          alumnoId: alumno.id
        }
      });

      // 🔥 combinar todo
      const resultado = materias.map((m) => {
        const califs = calificaciones.filter(
          (c) => c.materiaId === m.id
        );

        const promedio =
          califs.length > 0
            ? califs.reduce((a, b) => a + b.calificacion, 0) /
              califs.length
            : 0;

        return {
          materia: m.nombre,
          docente: m.docente?.user?.name || "Sin asignar",
          horario: m.horario || "N/A",
          aula: m.aula || "N/A",
          promedio: promedio.toFixed(1),
        };
      });

      res.json(resultado);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;