import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Datos de la petición en curso que las consultas necesitan conocer
 * sin pasarlos a mano por cada ruta (hoy: el nivel del usuario).
 */
export const contexto = new AsyncLocalStorage();
