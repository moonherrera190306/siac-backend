import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { aMinutos, seTraslapan, validarDatos } from "../src/lib/horarios.js";

describe("conversión de hora", () => {
  test("convierte HH:MM a minutos", () => {
    assert.equal(aMinutos("07:00"), 420);
    assert.equal(aMinutos("00:00"), 0);
    assert.equal(aMinutos("23:59"), 1439);
  });
});

describe("traslape de bloques", () => {
  test("dos bloques idénticos chocan", () => {
    assert.equal(seTraslapan("07:00", "08:00", "07:00", "08:00"), true);
  });

  test("uno dentro del otro choca", () => {
    assert.equal(seTraslapan("07:00", "09:00", "07:30", "08:00"), true);
  });

  test("traslape parcial choca", () => {
    assert.equal(seTraslapan("07:00", "08:00", "07:30", "09:00"), true);
  });

  test("bloques pegados NO chocan", () => {
    // 07:00-08:00 y 08:00-09:00 son clases consecutivas, no un choque.
    assert.equal(seTraslapan("07:00", "08:00", "08:00", "09:00"), false);
  });

  test("bloques separados no chocan", () => {
    assert.equal(seTraslapan("07:00", "08:00", "10:00", "11:00"), false);
  });

  test("el orden de los argumentos no importa", () => {
    assert.equal(seTraslapan("10:00", "11:00", "07:00", "08:00"), false);
    assert.equal(seTraslapan("08:00", "10:00", "07:00", "09:00"), true);
  });
});

describe("validación de un bloque", () => {
  test("un bloque correcto no da error", () => {
    assert.equal(
      validarDatos({ dia: "LUNES", horaInicio: "07:00", horaFin: "08:00" }),
      null
    );
  });

  test("rechaza día inválido", () => {
    assert.match(
      validarDatos({ dia: "DOMINGO", horaInicio: "07:00", horaFin: "08:00" }),
      /día debe ser/
    );
  });

  test("rechaza formato de hora inválido", () => {
    assert.match(
      validarDatos({ dia: "LUNES", horaInicio: "7:00", horaFin: "08:00" }),
      /HH:MM/
    );

    assert.match(
      validarDatos({ dia: "LUNES", horaInicio: "25:00", horaFin: "26:00" }),
      /HH:MM/
    );
  });

  test("rechaza que la salida sea antes de la entrada", () => {
    assert.match(
      validarDatos({ dia: "LUNES", horaInicio: "09:00", horaFin: "08:00" }),
      /posterior/
    );
  });

  test("rechaza duración cero", () => {
    assert.match(
      validarDatos({ dia: "LUNES", horaInicio: "08:00", horaFin: "08:00" }),
      /posterior/
    );
  });
});
