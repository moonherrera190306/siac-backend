import prisma from "../lib/prisma.js";

export const getDocentesResumen = async (req, res) => {
  try {
    const docentes = await prisma.docente.findMany({
      include: {
        user: true,
        materias: {
          include: {
            grupo: true,
            calificaciones: true,
          },
        },
      },
    });

    const data = docentes.map((d) => {
      // total grupos únicos
      const grupos = new Set(
        d.materias.map((m) => m.grupo?.id)
      ).size;

      // promedio general del docente
      const todasCalificaciones = d.materias.flatMap(
        (m) => m.calificaciones
      );

      const promedio =
        todasCalificaciones.length > 0
          ? todasCalificaciones.reduce((acc, c) => acc + c.calificacion, 0) /
            todasCalificaciones.length
          : 0;

      let desempeño = "Bueno";

      if (promedio >= 9) desempeño = "Alto";
      else if (promedio < 8.5) desempeño = "Seguimiento";

      return {
        id: d.id,
        nombre: d.user.name,
        materia: d.materias[0]?.nombre || "Sin asignar",
        grupos,
        desempeño,
      };
    });

    res.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      message: "Error obteniendo docentes",
    });
  }
};  