/**
 * 🧮 REGLAS DEL KARDEX
 *
 * Se extrajeron de calificacion.routes.js para poder probarlas sin
 * levantar el servidor ni la base: son funciones puras.
 */

export const CALIFICACION_MINIMA = 6;

// Columna oficial del kardex → campo del modelo.
export const COLUMNAS = {
  PP: "primerParcial",
  SP: "segundoParcial",
  PROM: "promedio",
  EF: "examenFinal",
  O: "notaFinal",
  EE: "extraordinario",
  EA: "adicional",
  EER: "especial",
  ND: "notaDefinitiva",
};

// Valores de texto permitidos además de 1-10.
export const NO_NUMERICOS = ["AC", "NA", "NP"];

export function esNumerico(valor) {
  if (valor === null || valor === undefined || valor === "") return false;
  return !isNaN(Number(valor));
}

// El .5 siempre sube: 7.5 → 8
export function redondear(valor) {
  const n = Number(valor);
  if (isNaN(n)) return null;

  const entero = Math.floor(n);
  return n - entero >= 0.5 ? entero + 1 : entero;
}

/**
 * Convierte lo que llega del cliente al texto que se guarda.
 * La materia decide qué acepta: NUMERICA (1-10) o ACREDITACION (AC/NA).
 * NP ("no presentó") se acepta siempre.
 */
export function normalizarValor(bruto, tipoEvaluacion, columna) {
  if (bruto === null || bruto === undefined || bruto === "") return null;

  const texto = String(bruto).trim().toUpperCase();

  if (texto === "NP") return "NP";

  if (tipoEvaluacion === "ACREDITACION") {
    if (texto !== "AC" && texto !== "NA") {
      throw new Error(
        `La columna ${columna} de una materia de acreditación solo acepta AC, NA o NP`
      );
    }
    return texto;
  }

  if (NO_NUMERICOS.includes(texto)) {
    throw new Error(
      `La columna ${columna} de una materia numérica no acepta ${texto}`
    );
  }

  if (!esNumerico(texto)) {
    throw new Error(`La columna ${columna} debe ser numérica`);
  }

  const redondeado = redondear(texto);

  if (redondeado < 0 || redondeado > 10) {
    throw new Error(`La columna ${columna} debe estar entre 0 y 10`);
  }

  return String(redondeado);
}

// PROM = promedio de PP y SP, con el mismo redondeo.
export function calcularPromedio(pp, sp) {
  if (!esNumerico(pp) || !esNumerico(sp)) return null;
  return String(redondear((Number(pp) + Number(sp)) / 2));
}

// La nota definitiva la fija la última oportunidad presentada.
export function calcularNotaDefinitiva(c) {
  return (
    c.especial ??
    c.adicional ??
    c.extraordinario ??
    c.notaFinal ??
    c.examenFinal ??
    c.promedio ??
    null
  );
}

export function calcularEstatus(nd) {
  if (nd === null || nd === undefined) return "EN_CURSO";
  if (nd === "NP") return "NO_PRESENTO";
  if (nd === "AC") return "APROBADA";
  if (nd === "NA") return "REPROBADA";

  if (!esNumerico(nd)) return "EN_CURSO";

  return Number(nd) >= CALIFICACION_MINIMA ? "APROBADA" : "REPROBADA";
}
