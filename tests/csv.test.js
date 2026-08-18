import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { aCSV } from "../src/lib/csv.js";

const COLUMNAS = [
  { id: "nombre", label: "Alumno" },
  { id: "grupo", label: "Grupo" },
];

describe("exportación CSV", () => {
  test("escribe encabezado y filas", () => {
    const csv = aCSV([{ nombre: "Ana", grupo: "1A" }], COLUMNAS);

    assert.ok(csv.includes("Alumno,Grupo"));
    assert.ok(csv.includes("Ana,1A"));
  });

  test("lleva BOM para que Excel respete los acentos", () => {
    const csv = aCSV([], COLUMNAS);

    assert.equal(csv.charCodeAt(0), 0xfeff);
  });

  test("entrecomilla los campos con coma", () => {
    const csv = aCSV([{ nombre: "Pérez, Ana", grupo: "1A" }], COLUMNAS);

    assert.ok(csv.includes('"Pérez, Ana"'));
  });

  test("duplica las comillas internas", () => {
    const csv = aCSV([{ nombre: 'Ana "La jefa"', grupo: "1A" }], COLUMNAS);

    assert.ok(csv.includes('"Ana ""La jefa"""'));
  });

  test("los nulos quedan vacíos, no como 'null'", () => {
    const csv = aCSV([{ nombre: null, grupo: undefined }], COLUMNAS);

    assert.ok(!csv.includes("null"));
    assert.ok(!csv.includes("undefined"));
  });
});
