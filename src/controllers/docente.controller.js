import prisma from "../lib/prisma.js";

export const getDocentesResumen = async (req, res) => {
  try {
    const docentes = await prisma.docente.findMany({
      include: {
        user: true,
        asignaciones: {
          include: {
            materia: true,
            grupo: true,
            cicloEscolar: true,
          },
        },
      },
    });

    const data = await Promise.all(
      docentes.map(async (d) => {
        // total de grupos únicos que atiende
        const gruposUnicos = new Set(
          d.asignaciones.map((a) => a.grupoId).filter(Boolean)
        );

        // calificaciones reales de CADA asignación de este docente:
        // cruzamos materia + ciclo + grupo (vía alumno.grupoId), porque
        // Calificacion no guarda directamente a qué docente/grupo pertenece
        const calificacionesPorAsignacion = await Promise.all(
          d.asignaciones.map((a) =>
            prisma.calificacion.findMany({
              where: {
                materiaId: a.materiaId,
                cicloEscolarId: a.cicloEscolarId,
                alumno: { grupoId: a.grupoId },
                valor: { not: null }, // excluye AC/NA, que no promedian numéricamente
              },
            })
          )
        );

        const todasCalificaciones = calificacionesPorAsignacion.flat();

        const promedio =
          todasCalificaciones.length > 0
            ? todasCalificaciones.reduce((acc, c) => acc + c.valor, 0) /
              todasCalificaciones.length
            : null;

        let desempeno = "Sin datos";

        if (promedio !== null) {
          if (promedio >= 9) desempeno = "Alto";
          else if (promedio >= 8.5) desempeno = "Bueno";
          else desempeno = "Seguimiento";
        }

        return {
          id: d.id,
          nombre: d.user.name,
          materia: d.asignaciones[0]?.materia?.nombre || "Sin asignar",
          grupos: gruposUnicos.size,
          promedio: promedio !== null ? Number(promedio.toFixed(2)) : null,
          desempeno,
        };
      })
    );

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