import "dotenv/config"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * 📋 INSCRIBIR AL CICLO ACTIVO, PASANDO DE SEMESTRE
 *
 *   npm run inscribir:ciclo              → muestra a dónde pasaría cada grupo
 *   npm run inscribir:ciclo -- --aplicar → inscribe y mueve a los alumnos
 *
 * Cada alumno activo pasa al semestre siguiente de su carrera y turno:
 *   - Mismo nombre sin número ("2A DER" → "3A DER").
 *   - Prepa 4° → 5°: misma área (CEA, CSH, IA, CQB); TR pasa a AP.
 *   - Prepa 2° → 3°: el área sale de la trayectoria del alumno.
 *   - Si hay varios grupos posibles: el de la misma letra, si no, el
 *     que lleve menos alumnos asignados (para repartir parejo).
 * Nunca se cruza de área. Quien egresa o no tiene grupo destino se queda.
 *
 * Inscripcion (historial) y Alumno.grupoId (vigente) se escriben juntos.
 * Correrlo dos veces no vuelve a mover a nadie.
 */
const MARCA = "Pasó de semestre con inscribir:ciclo"

const sinNumero = (n) => n.trim().replace(/^\d+\s*/, "").toUpperCase()
const letra = (n) => n.trim().toUpperCase().match(/^\d+\s*([A-Z])/)?.[1] ?? null
const codigo = (n) => n.toUpperCase().match(/(?:TR|AP)-([A-Z]+-\d+(?:-\d+)?)/)?.[1] ?? null
const familia = (n) => codigo(n)?.split("-")[0] ?? null

const sinAcentos = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
function familiaDeTrayectoria(nombre) {
  const t = sinAcentos(nombre ?? "")
  if (/ECONOM|ADMINISTR|CONTA/.test(t)) return "CEA"
  if (/QUIM|BIOL|SALUD|MEDIC/.test(t)) return "CQB"
  if (/INGEN|ARQUIT|FISICO|MATEMAT/.test(t)) return "IA"
  if (/SOCIAL|HUMAN/.test(t)) return "CSH"
  return null
}

async function main() {
  const aplicar = process.argv.includes("--aplicar")

  const ciclo = await prisma.cicloEscolar.findFirst({
    where: { activo: true },
    orderBy: [{ fechaInicio: "desc" }, { createdAt: "desc" }],
  })
  if (!ciclo) throw new Error("No hay ciclo activo.")

  const grupos = await prisma.grupo.findMany({
    select: {
      id: true, nombre: true, turnoId: true, activo: true,
      semestre: { select: { numero: true, carreraId: true, carrera: { select: { totalSemestres: true } } } },
    },
  })
  const porId = new Map(grupos.map((g) => [g.id, g]))
  const carga = new Map() // alumnos asignados en esta corrida, para repartir

  const todos = await prisma.alumno.findMany({
    select: {
      id: true, grupoId: true, activo: true, estatusAcademico: true,
      trayectoria: { select: { nombre: true } },
      inscripciones: {
        select: { id: true, grupoId: true, observaciones: true, cicloEscolarId: true, cicloEscolar: { select: { nombre: true, fechaInicio: true, createdAt: true } } },
      },
    },
  })

  const diag = new Map(), cruces = new Map(), quedan = new Map(), yaHechos = new Map()
  const suma = (m, k) => m.set(k, (m.get(k) ?? 0) + 1)
  const mover = []

  for (const a of todos) {
    if (!a.activo) { suma(diag, "alumno inactivo"); continue }
    if (a.estatusAcademico !== "ACTIVO") { suma(diag, `estatus ${a.estatusAcademico}`); continue }

    const actual = a.inscripciones.find((i) => i.cicloEscolarId === ciclo.id)
    if (actual?.observaciones === MARCA) { suma(yaHechos, "ya pasó con este script"); continue }

    const previas = a.inscripciones
      .filter((i) => i.cicloEscolarId !== ciclo.id && i.grupoId)
      .sort((x, y) => (y.cicloEscolar.fechaInicio ?? y.cicloEscolar.createdAt) - (x.cicloEscolar.fechaInicio ?? x.cicloEscolar.createdAt))
    const origen = porId.get(a.grupoId ?? previas[0]?.grupoId)
    if (!origen) { suma(diag, "sin grupo"); continue }
    suma(diag, "con grupo")

    const s = origen.semestre
    if (!s?.numero || !s.carreraId) { suma(quedan, `${origen.nombre} — grupo sin semestre/carrera`); continue }
    if (s.carrera?.totalSemestres && s.numero >= s.carrera.totalSemestres) { suma(quedan, `${origen.nombre} — último semestre (egresa)`); continue }

    let opciones = grupos.filter((x) =>
      x.activo && x.semestre?.carreraId === s.carreraId && x.semestre?.numero === s.numero + 1 && x.turnoId === origen.turnoId)
    if (!opciones.length) { suma(quedan, `${origen.nombre} — no hay grupo de ${s.numero + 1}° en ese turno`); continue }

    let destino = opciones.find((x) => sinNumero(x.nombre) === sinNumero(origen.nombre)) ?? null

    if (!destino) {
      const fam = familia(origen.nombre) ?? familiaDeTrayectoria(a.trayectoria?.nombre)
      if (opciones.some((x) => familia(x.nombre))) {
        // Hay grupos con área (TR-/AP-): solo esos, y de la misma área si se sabe.
        const conArea = opciones.filter((x) => familia(x.nombre))
        const exactos = conArea.filter((x) => codigo(x.nombre) === codigo(origen.nombre))
        opciones = exactos.length ? exactos : fam ? conArea.filter((x) => familia(x.nombre) === fam) : conArea
      }
      if (!opciones.length) { suma(quedan, `${origen.nombre} — no hay grupo de su área en ${s.numero + 1}°`); continue }
      const mismaLetra = opciones.filter((x) => letra(x.nombre) === letra(origen.nombre))
      const lista = mismaLetra.length === 1 ? mismaLetra : opciones
      destino = lista.reduce((m, x) => ((carga.get(x.id) ?? 0) < (carga.get(m.id) ?? 0) ? x : m))
    }

    carga.set(destino.id, (carga.get(destino.id) ?? 0) + 1)
    mover.push({ a, destino, inscripcionId: actual?.id ?? null })
    suma(cruces, `${origen.nombre} → ${destino.nombre}`)
  }

  const imprime = (titulo, m) => {
    if (!m.size) return
    console.log(`\n${titulo}`)
    ;[...m].sort().forEach(([k, n]) => console.log(`   ${String(n).padStart(4)}  ${k}`))
  }
  console.log(`\nCiclo activo: ${ciclo.nombre} · alumnos en la base: ${todos.length}`)
  ;[...diag].forEach(([k, n]) => console.log(`   ${String(n).padStart(5)}  ${k}`))
  imprime("Pasan de semestre:", cruces)
  imprime("Se quedan donde están:", quedan)
  imprime("Ya hechos:", yaHechos)
  console.log(`\nTotal: ${mover.length} pasan · ${[...quedan.values()].reduce((x, y) => x + y, 0)} se quedan`)

  if (!aplicar) {
    console.log("\nNada se guardó. Para guardar:  npm run inscribir:ciclo -- --aplicar\n")
    return
  }

  let n = 0
  for (const { a, destino, inscripcionId } of mover) {
    const datos = { grupoId: destino.id, semestreNumero: destino.semestre?.numero ?? null, observaciones: MARCA }
    await prisma.$transaction([
      inscripcionId
        ? prisma.inscripcion.update({ where: { id: inscripcionId }, data: datos })
        : prisma.inscripcion.create({ data: { ...datos, alumnoId: a.id, cicloEscolarId: ciclo.id, estatus: "ACTIVA" } }),
      prisma.alumno.update({ where: { id: a.id }, data: { grupoId: destino.id } }),
    ])
    if (++n % 200 === 0) console.log(`   ${n}…`)
  }
  console.log(`\n✅ ${n} alumnos inscritos en ${ciclo.nombre} en su nuevo semestre.\n`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
