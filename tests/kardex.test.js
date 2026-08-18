import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  redondear,
  normalizarValor,
  calcularPromedio,
  calcularNotaDefinitiva,
  calcularEstatus,
} from "../src/lib/kardex.js";

describe("redondeo institucional", () => {
  test("el .5 sube", () => {
    assert.equal(redondear(7.5), 8);
    assert.equal(redondear(6.5), 7);
  });

  test("por debajo de .5 baja", () => {
    assert.equal(redondear(7.4), 7);
    assert.equal(redondear(9.49), 9);
  });

  test("un entero se queda igual", () => {
    assert.equal(redondear(8), 8);
  });

  test("lo que no es número da null", () => {
    assert.equal(redondear("AC"), null);
  });
});

describe("normalización de valores", () => {
  test("materia numérica acepta 1-10 y redondea", () => {
    assert.equal(normalizarValor("7.5", "NUMERICA", "PP"), "8");
    assert.equal(normalizarValor(6, "NUMERICA", "PP"), "6");
  });

  test("NP se acepta siempre", () => {
    assert.equal(normalizarValor("np", "NUMERICA", "PP"), "NP");
    assert.equal(normalizarValor("NP", "ACREDITACION", "PP"), "NP");
  });

  test("materia numérica rechaza AC", () => {
    assert.throws(() => normalizarValor("AC", "NUMERICA", "PP"), /no acepta AC/);
  });

  test("materia de acreditación rechaza un número", () => {
    assert.throws(
      () => normalizarValor("8", "ACREDITACION", "PP"),
      /solo acepta AC, NA o NP/
    );
  });

  test("materia de acreditación acepta AC y NA", () => {
    assert.equal(normalizarValor("ac", "ACREDITACION", "PP"), "AC");
    assert.equal(normalizarValor("na", "ACREDITACION", "PP"), "NA");
  });

  test("rechaza fuera del rango 0-10", () => {
    assert.throws(() => normalizarValor("11", "NUMERICA", "PP"), /entre 0 y 10/);
  });

  test("vacío se guarda como null, no como cero", () => {
    assert.equal(normalizarValor("", "NUMERICA", "PP"), null);
    assert.equal(normalizarValor(null, "NUMERICA", "PP"), null);
  });
});

describe("promedio de parciales", () => {
  test("promedia PP y SP con el mismo redondeo", () => {
    assert.equal(calcularPromedio("8", "7"), "8"); // 7.5 sube
    assert.equal(calcularPromedio("6", "7"), "7"); // 6.5 sube
    assert.equal(calcularPromedio("6", "6"), "6");
  });

  test("sin los dos parciales no hay promedio", () => {
    assert.equal(calcularPromedio("8", null), null);
    assert.equal(calcularPromedio(null, null), null);
  });

  test("un parcial no numérico no promedia", () => {
    assert.equal(calcularPromedio("AC", "8"), null);
  });
});

describe("nota definitiva", () => {
  test("la última oportunidad presentada manda", () => {
    assert.equal(
      calcularNotaDefinitiva({ promedio: "6", examenFinal: "7", notaFinal: "7", extraordinario: "8" }),
      "8"
    );

    assert.equal(
      calcularNotaDefinitiva({ promedio: "6", extraordinario: "5", especial: "9" }),
      "9"
    );
  });

  test("sin nada capturado es null", () => {
    assert.equal(calcularNotaDefinitiva({}), null);
  });

  test("cae al promedio si no hay más", () => {
    assert.equal(calcularNotaDefinitiva({ promedio: "7" }), "7");
  });
});

describe("estatus a partir de la definitiva", () => {
  test("6 o más aprueba", () => {
    assert.equal(calcularEstatus("6"), "APROBADA");
    assert.equal(calcularEstatus("10"), "APROBADA");
  });

  test("menos de 6 reprueba", () => {
    assert.equal(calcularEstatus("5"), "REPROBADA");
  });

  test("AC aprueba y NA reprueba", () => {
    assert.equal(calcularEstatus("AC"), "APROBADA");
    assert.equal(calcularEstatus("NA"), "REPROBADA");
  });

  test("NP no es reprobada, es no presentó", () => {
    assert.equal(calcularEstatus("NP"), "NO_PRESENTO");
  });

  test("sin definitiva sigue en curso", () => {
    assert.equal(calcularEstatus(null), "EN_CURSO");
  });
});
