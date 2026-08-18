/**
 * 🕐 REGLAS DE HORARIO
 *
 * Extraídas de horario.routes.js: la detección de traslape es la
 * validación más delicada del módulo y conviene poder probarla sola.
 */

export const DIAS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];

export const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function aMinutos(hora) {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

export function seTraslapan(aInicio, aFin, bInicio, bFin) {
  // Dos bloques chocan si uno empieza antes de que el otro termine.
  return aMinutos(aInicio) < aMinutos(bFin) && aMinutos(bInicio) < aMinutos(aFin);
}

export function validarDatos({ dia, horaInicio, horaFin }) {
  if (!DIAS.includes(dia)) {
    return `El día debe ser uno de: ${DIAS.join(", ")}`;
  }

  if (!RE_HORA.test(horaInicio) || !RE_HORA.test(horaFin)) {
    return "Las horas deben tener formato HH:MM (24 horas)";
  }

  if (aMinutos(horaFin) <= aMinutos(horaInicio)) {
    return "La hora de fin debe ser posterior a la de inicio";
  }

  return null;
}
