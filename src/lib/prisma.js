import { PrismaClient } from "@prisma/client"
import { contexto, clavesDe } from "./contexto.js"

const base = new PrismaClient()

/**
 * 🏫 FILTRO POR NIVEL
 *
 * Si quien hace la petición es de Dirección o Secretaría y tiene nivel
 * (PREPARATORIA / UNIVERSIDAD), toda lectura de estos modelos se limita
 * a ese nivel. Sin nivel (admin, caja, Fernando, maestros, scripts) no
 * se filtra nada.
 *
 * El nivel cuelga de: Grupo → Semestre → Carrera → Programa → Nivel.
 */
const enNivel = (clave) => ({ programa: { nivelAcademico: { clave: { in: clavesDe(clave) } } } })
const grupoEn = (clave) => ({ semestre: { carrera: enNivel(clave) } })
const alumnoEn = (clave) => ({
  OR: [{ grupo: grupoEn(clave) }, enNivel(clave), { carrera: enNivel(clave) }],
})

const FILTROS = {
  Alumno: alumnoEn,
  Grupo: grupoEn,
  Semestre: (c) => ({ carrera: enNivel(c) }),
  Carrera: enNivel,
  Programa: (c) => ({ nivelAcademico: { clave: { in: clavesDe(c) } } }),
  NivelAcademico: (c) => ({ clave: { in: clavesDe(c) } }),
  Materia: (c) => ({ OR: [{ semestre: { carrera: enNivel(c) } }, { semestreId: null }] }),
  AsignacionMateria: (c) => ({ grupo: grupoEn(c) }),
  Horario: (c) => ({ asignacion: { grupo: grupoEn(c) } }),
  Clase: (c) => ({ asignacion: { grupo: grupoEn(c) } }),
  Inscripcion: (c) => ({ alumno: alumnoEn(c) }),
  Calificacion: (c) => ({ alumno: alumnoEn(c) }),
  AsistenciaClase: (c) => ({ alumno: alumnoEn(c) }),
  AsistenciaMensual: (c) => ({ alumno: alumnoEn(c) }),
  Documento: (c) => ({ alumno: alumnoEn(c) }),
  Tramite: (c) => ({ alumno: alumnoEn(c) }),
  Observacion: (c) => ({ OR: [{ alumno: alumnoEn(c) }, { grupo: grupoEn(c) }] }),
}

const LECTURAS = new Set([
  "findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy",
])

const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const nivel = contexto.getStore()?.nivel
        const filtro = nivel && LECTURAS.has(operation) && FILTROS[model]

        if (!filtro) return query(args)

        const where = filtro(nivel)
        return query({ ...args, where: args?.where ? { AND: [args.where, where] } : where })
      },
    },
  },
})

export default prisma
