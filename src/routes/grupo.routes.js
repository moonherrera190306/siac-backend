import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";
import { reportePDF } from "../lib/pdf.js";

const router = express.Router();

/**
 * 🔒 Un MAESTRO solo puede ver los grupos donde tiene asignación.
 * Devuelve null para el resto de roles (sin filtro).
 */
async function filtroPorDocente(user) {
  if (user.role !== "MAESTRO") return null;

  const docente = await prisma.docente.findUnique({
    where: { userId: user.id },
  });

  if (!docente) return { id: { in: [] } };

  const asignaciones = await prisma.asignacionMateria.findMany({
    where: { docenteId: docente.id },
    select: { grupoId: true },
  });

  return { id: { in: asignaciones.map((a) => a.grupoId) } };
}

/* =========================================
   📄 LISTAR GRUPOS
========================================= */
router.get(
  "/",
  verifyToken,

  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA", "MAESTRO"]),

  async (req, res) => {
    try {
      const filtro = await filtroPorDocente(req.user);

      const grupos = await prisma.grupo.findMany({
        where: {
          ...(filtro ?? {}),
          ...(req.query.semestreId ? { semestreId: req.query.semestreId } : {}),
        },
        include: {
          turno: true,
          semestre: { include: { carrera: true } },
          _count: { select: { alumnos: true } },
        },
        orderBy: { nombre: "asc" },
      });

      res.json({ data: grupos });
    } catch (error) {
      console.error("ERROR GRUPOS:", error);

      res.status(500).json({
        message: "Error al obtener grupos",
      });
    }
  }
);

/* =========================================
   ➕ CREAR GRUPO
========================================= */
router.post(
  "/",
  verifyToken,

  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA"]),

  async (req, res) => {
    try {
      const { nombre, turnoId, semestreId, cupo } = req.body;

      if (!nombre) {
        return res.status(400).json({
          message: "El nombre del grupo es requerido",
        });
      }

      // 🔥 `turno` y `nivel` dejaron de ser texto suelto: ahora son relaciones.
      const grupo = await prisma.grupo.create({
        data: {
          nombre,
          turnoId: turnoId || null,
          semestreId: semestreId || null,
          cupo: cupo ? Number(cupo) : null,
        },
        include: { turno: true, semestre: true },
      });

      res.status(201).json({ data: grupo });
    } catch (error) {
      console.error("ERROR CREAR GRUPO:", error);

      res.status(500).json({
        message: "Error al crear el grupo",
      });
    }
  }
);

/* =========================================
   🖨️ LISTADO DE GRUPOS CON SUS ALUMNOS
   Lo que se imprime y se pega en la puerta del salón.
   ?formato=pdf lo descarga listo para imprimir.
   Va ANTES de "/:id" para que Express no lo tome por un id.
========================================= */
router.get(
  "/listado",
  verifyToken,

  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA", "MAESTRO"]),

  async (req, res) => {
    try {
      const filtro = await filtroPorDocente(req.user);

      const grupos = await prisma.grupo.findMany({
        where: {
          ...(filtro ?? {}),
          ...(req.query.grupoId ? { id: req.query.grupoId } : {}),
          ...(req.query.semestreId ? { semestreId: req.query.semestreId } : {}),
          ...(req.query.turnoId ? { turnoId: req.query.turnoId } : {}),
          ...(req.query.incluirInactivos === "true" ? {} : { activo: true }),
        },
        include: {
          turno: true,
          semestre: { include: { carrera: true } },
          alumnos: {
            where: { activo: true },
            include: { user: true },
            // El listado impreso se ordena por matrícula, como el acta.
            orderBy:
              req.query.orden === "nombre"
                ? { user: { name: "asc" } }
                : { matricula: "asc" },
          },
        },
        orderBy: { nombre: "asc" },
      });

      const secciones = grupos.map((g) => ({
        id: g.id,
        grupo: g.nombre,
        turno: g.turno?.nombre ?? null,
        semestre: g.semestre?.nombre ?? null,
        carrera: g.semestre?.carrera?.nombre ?? null,
        totalAlumnos: g.alumnos.length,
        alumnos: g.alumnos.map((a, i) => ({
          no: i + 1,
          matricula: a.matricula,
          alumno: a.user?.name ?? "",
          estatus: a.estatusAcademico,
        })),
      }));

      if (req.query.formato === "pdf") {
        return reportePDF(res, {
          nombreArchivo: "listado-de-grupos",
          titulo: "Listado de grupos y alumnos",
          subtitulo: `${secciones.length} grupo(s) · ${secciones.reduce(
            (acc, s) => acc + s.totalAlumnos,
            0
          )} alumno(s)`,
          columnas: [
            { id: "no", label: "#", ancho: 0.4, alinear: "right" },
            { id: "matricula", label: "Matrícula", ancho: 1.2 },
            { id: "alumno", label: "Alumno", ancho: 4 },
            { id: "estatus", label: "Estatus", ancho: 1.2 },
          ],
          secciones: secciones.map((s) => ({
            titulo: `Grupo ${s.grupo}`,
            subtitulo: [
              s.carrera,
              s.semestre,
              s.turno ? `Turno ${s.turno}` : null,
              `${s.totalAlumnos} alumno(s)`,
            ]
              .filter(Boolean)
              .join(" · "),
            filas: s.alumnos,
          })),
        });
      }

      res.json({ success: true, data: secciones });
    } catch (error) {
      console.error("ERROR LISTADO GRUPOS:", error);

      res.status(500).json({
        message: "Error al generar el listado de grupos",
      });
    }
  }
);

/* =========================================
   📄 UN GRUPO
========================================= */
router.get(
  "/:id",
  verifyToken,

  checkRole(["ADMIN", "DIRECTOR", "SECRETARIA", "MAESTRO"]),

  async (req, res) => {
    try {
      const filtro = await filtroPorDocente(req.user);

      if (filtro && !filtro.id.in.includes(req.params.id)) {
        return res.status(403).json({
          message: "No tienes asignación en ese grupo",
        });
      }

      const grupo = await prisma.grupo.findUnique({
        where: { id: req.params.id },
        include: {
          turno: true,
          semestre: { include: { carrera: true } },
          alumnos: { include: { user: true }, orderBy: { matricula: "asc" } },
          asignaciones: {
            include: {
              materia: true,
              docente: { include: { user: true } },
              horarios: true,
            },
          },
        },
      });

      if (!grupo) {
        return res.status(404).json({
          message: "Grupo no encontrado",
        });
      }

      res.json({ data: grupo });
    } catch (error) {
      console.error("ERROR GRUPO:", error);

      res.status(500).json({
        message: "Error al obtener grupo",
      });
    }
  }
);

export default router;
