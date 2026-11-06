import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Datos de la petición en curso que las consultas necesitan conocer
 * sin pasarlos a mano por cada ruta (hoy: el nivel del usuario).
 */
export const contexto = new AsyncLocalStorage();

/**
 * En la base conviven dos claves por nivel (las del sistema anterior y
 * las nuevas): PREPARATORIA/PREPA y UNIVERSIDAD/UNIV. Se tratan como una.
 */
export const CLAVES_NIVEL = {
  PREPARATORIA: ["PREPARATORIA", "PREPA"],
  UNIVERSIDAD: ["UNIVERSIDAD", "UNIV"],
};

export const clavesDe = (nivel) => CLAVES_NIVEL[nivel] ?? [nivel];

/** "PREPA" → "PREPARATORIA", "UNIV" → "UNIVERSIDAD". */
export const nivelCanonico = (clave) =>
  Object.keys(CLAVES_NIVEL).find((k) => CLAVES_NIVEL[k].includes(clave)) ?? clave;
