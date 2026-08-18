import prisma from "./prisma.js";

/**
 * 🔍 AUDITORÍA
 *
 * El modelo `AuditLog` existía desde el rediseño del schema y nadie
 * escribía en él. Este helper es el único punto por el que se registra.
 *
 * REGLA: auditar nunca debe tumbar la operación auditada. Si el registro
 * falla, se avisa por consola y la operación sigue. Un pago no se pierde
 * porque no se pudo escribir su bitácora.
 */

/**
 * Deja solo los campos que interesan y descarta ruido
 * (fechas automáticas, ids de relación repetidos).
 */
function limpiar(objeto, campos) {
  if (!objeto) return null;

  if (!campos) return objeto;

  const salida = {};

  for (const c of campos) {
    if (objeto[c] !== undefined) salida[c] = objeto[c];
  }

  return salida;
}

/**
 * Registra una operación sensible.
 *
 * @param {object} opciones
 * @param {object} [opciones.tx]  cliente de transacción; si no viene usa prisma
 * @param {object} opciones.req   para sacar usuario, ip y user-agent
 * @param {string} opciones.accion  CREAR | ACTUALIZAR | ELIMINAR | CANCELAR | LOGIN
 * @param {string} opciones.entidad  "Calificacion", "Pago", …
 * @param {string} opciones.entidadId
 * @param {object} [opciones.antes]
 * @param {object} [opciones.despues]
 * @param {string[]} [opciones.campos]  lista blanca de campos a guardar
 */
export async function auditar({
  tx,
  req,
  accion,
  entidad,
  entidadId,
  antes = null,
  despues = null,
  campos = null,
  usuarioId = null,
}) {
  try {
    const cliente = tx ?? prisma;

    await cliente.auditLog.create({
      data: {
        usuarioId: usuarioId ?? req?.user?.id ?? null,
        accion,
        entidad,
        entidadId: String(entidadId),
        valorAnterior: limpiar(antes, campos),
        valorNuevo: limpiar(despues, campos),
        ip: req?.ip ?? null,
        userAgent: req?.headers?.["user-agent"] ?? null,
      },
    });
  } catch (error) {
    // Nunca propagar: la auditoría es best-effort.
    console.error("⚠️ No se pudo registrar la auditoría:", error.message);
  }
}

/**
 * Versión para lotes: una sola inserción para N registros.
 * Se usa en la captura de calificaciones, donde se guardan
 * decenas de filas de golpe.
 */
export async function auditarLote({ req, accion, entidad, registros }) {
  try {
    if (!Array.isArray(registros) || registros.length === 0) return;

    await prisma.auditLog.createMany({
      data: registros.map((r) => ({
        usuarioId: req?.user?.id ?? null,
        accion,
        entidad,
        entidadId: String(r.entidadId),
        valorAnterior: r.antes ?? null,
        valorNuevo: r.despues ?? null,
        ip: req?.ip ?? null,
        userAgent: req?.headers?.["user-agent"] ?? null,
      })),
    });
  } catch (error) {
    console.error("⚠️ No se pudo registrar la auditoría en lote:", error.message);
  }
}
