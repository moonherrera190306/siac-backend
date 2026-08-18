/**
 * CSV sin dependencias. Se escapa comilla doble y se envuelve
 * todo campo que contenga separador, comilla o salto de línea.
 */
export function aCSV(filas, columnas) {
  const escapar = (valor) => {
    const texto = valor === null || valor === undefined ? "" : String(valor);

    return /[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };

  const encabezado = columnas.map((c) => escapar(c.label)).join(",");

  const cuerpo = filas
    .map((f) => columnas.map((c) => escapar(f[c.id])).join(","))
    .join("\n");

  // BOM para que Excel en Windows respete los acentos.
  return "﻿" + encabezado + "\n" + cuerpo;
}
