import prisma from "./prisma.js";

/**
 * ⏱️ TOLERANCIA DE LA BITÁCORA DOCENTE
 *
 * La bitácora sirve como control de asistencia del profesor: por eso el
 * registro solo se acepta dentro de una ventana que empieza a la hora
 * programada de la clase y dura unos minutos. Fuera de esa ventana el
 * registro deja de probar que el maestro estuvo ahí, así que se bloquea
 * y solo dirección puede capturarlo.
 *
 * La hora se calcula en la zona horaria de la escuela, no en la del
 * servidor: Railway corre en UTC y la ventana se recorrería 6 horas.
 */

export const TOLERANCIA_MINUTOS = Number(process.env.TOLERANCIA_BITACORA_MIN || 10);

export const ZONA = process.env.TZ_ESCUELA || "America/Mexico_City";

const DIA_POR_INDICE = {
  0: "DOMINGO",
  1: "LUNES",
  2: "MARTES",
  3: "MIERCOLES",
  4: "JUEVES",
  5: "VIERNES",
  6: "SABADO",
};

/** Momento actual expresado en la zona horaria de la escuela. */
export function ahoraEscolar() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());

  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));

  const fechaISO = `${p.year}-${p.month}-${p.day}`;

  // El índice del día se saca de la fecha ya trasladada a la zona.
  const indice = new Date(`${fechaISO}T12:00:00Z`).getUTCDay();

  return {
    fechaISO,
    dia: DIA_POR_INDICE[indice],
    minutos: Number(p.hour) * 60 + Number(p.minute),
    hora: `${p.hour}:${p.minute}`,
  };
}

/** "07:30" → 450 */
export function aMinutos(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;

  const [h, m] = hhmm.split(":").map(Number);

  if (isNaN(h) || isNaN(m)) return null;

  return h * 60 + m;
}

/** 450 → "07:30" */
export function aHora(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Estado de una hora programada frente al reloj de ahora.
 * PENDIENTE = todavía no abre · ABIERTA = dentro de la tolerancia ·
 * VENCIDA = ya pasó la ventana.
 */
export function estadoVentana(horaInicio, ahora = ahoraEscolar()) {
  const inicio = aMinutos(horaInicio);

  if (inicio === null) return { estado: "SIN_HORARIO", inicio: null };

  const cierre = inicio + TOLERANCIA_MINUTOS;

  if (ahora.minutos < inicio) {
    return {
      estado: "PENDIENTE",
      inicio,
      cierre,
      abreEn: inicio - ahora.minutos,
      cierraA: aHora(cierre),
    };
  }

  if (ahora.minutos <= cierre) {
    return {
      estado: "ABIERTA",
      inicio,
      cierre,
      minutosRetardo: ahora.minutos - inicio,
      restan: cierre - ahora.minutos,
      cierraA: aHora(cierre),
    };
  }

  return {
    estado: "VENCIDA",
    inicio,
    cierre,
    minutosRetardo: ahora.minutos - inicio,
    cierraA: aHora(cierre),
  };
}

/**
 * Decide si un docente puede registrar la clase en este momento.
 *
 * Devuelve { ok, motivo, horarioId, minutosRetardo }.
 * `horarioId` puede venir resuelto aunque el frontend no lo mande:
 * se busca el horario de la asignación cuya ventana esté abierta.
 */
export async function puedeRegistrar({ asignacionId, horarioId, fecha }) {
  const ahora = ahoraEscolar();

  // 1️⃣ Solo el día de la clase. Ayer ya no se justifica; mañana menos.
  const fechaClase = new Date(fecha).toISOString().slice(0, 10);

  if (fechaClase !== ahora.fechaISO) {
    return {
      ok: false,
      motivo: `Solo puedes registrar la clase del día de hoy (${ahora.fechaISO}). Para una fecha distinta pídelo a dirección.`,
    };
  }

  const horarios = await prisma.horario.findMany({
    where: { asignacionId, dia: ahora.dia },
    orderBy: { horaInicio: "asc" },
  });

  if (horarios.length === 0) {
    return {
      ok: false,
      motivo: `Esta materia no tiene clase programada hoy (${ahora.dia}).`,
    };
  }

  // 2️⃣ Si el frontend mandó horario, se respeta; si no, se busca el abierto.
  const candidatos = horarioId
    ? horarios.filter((h) => h.id === horarioId)
    : horarios;

  for (const h of candidatos) {
    const v = estadoVentana(h.horaInicio, ahora);

    if (v.estado === "ABIERTA") {
      return {
        ok: true,
        horarioId: h.id,
        minutosRetardo: v.minutosRetardo,
        horario: h,
      };
    }
  }

  // 3️⃣ Ninguna ventana abierta: se explica cuál era la más cercana.
  const proxima = candidatos
    .map((h) => ({ h, v: estadoVentana(h.horaInicio, ahora) }))
    .sort((a, b) => Math.abs(a.v.inicio - ahora.minutos) - Math.abs(b.v.inicio - ahora.minutos))[0];

  if (!proxima) {
    return { ok: false, motivo: "No se encontró el horario indicado." };
  }

  if (proxima.v.estado === "PENDIENTE") {
    return {
      ok: false,
      motivo: `Todavía no abre el registro. La clase empieza a las ${proxima.h.horaInicio} y podrás registrarla hasta las ${proxima.v.cierraA}.`,
    };
  }

  return {
    ok: false,
    motivo: `Se cerró el registro. La clase de las ${proxima.h.horaInicio} solo admitía registro hasta las ${proxima.v.cierraA} (${TOLERANCIA_MINUTOS} minutos de tolerancia). Repórtalo a dirección.`,
  };
}
