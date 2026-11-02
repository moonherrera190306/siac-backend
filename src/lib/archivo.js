/**
 * 🗄️ ARCHIVO HISTÓRICO (app biblioteca-siac)
 *
 * Integración servidor a servidor. Variables de entorno:
 *   ARCHIVO_URL       https://<deploy-de-la-biblioteca>   (sin diagonal final)
 *   SIAC_API_KEY      llave compartida (≥24 caracteres), igual en ambos
 *   SSO_SIAC_SECRET   secreto del SSO (≥32 caracteres), igual en ambos
 */

export const ARCHIVO_URL = (process.env.ARCHIVO_URL || "").replace(/\/+$/, "");

async function llamar(ruta) {
  if (!ARCHIVO_URL || !process.env.SIAC_API_KEY) {
    throw new Error("El Archivo histórico no está configurado");
  }

  const res = await fetch(`${ARCHIVO_URL}${ruta}`, {
    headers: { "x-siac-key": process.env.SIAC_API_KEY },
    signal: AbortSignal.timeout(15000),
  });

  const json = await res.json().catch(() => null);

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(json?.message || "El Archivo histórico no respondió");

  return json?.data ?? null;
}

export const buscarExalumnos = (q) =>
  llamar(`/api/siac/exalumnos?q=${encodeURIComponent(q)}`);

export const obtenerExalumno = (id) =>
  llamar(`/api/siac/exalumnos?id=${encodeURIComponent(id)}`);

/**
 * Las pantallas leen `pago.alumno.user.name` y `pago.alumno.matricula`.
 * Para no tocar cada una, en las respuestas se rellena un `alumno`
 * virtual en los pagos de exalumnos.
 */
function rellenar(valor, vistos = new Set()) {
  if (!valor || typeof valor !== "object" || vistos.has(valor)) return;
  vistos.add(valor);

  if (Array.isArray(valor)) {
    valor.forEach((v) => rellenar(v, vistos));
    return;
  }

  if (valor.exalumnoNombre && !valor.alumno && "exalumnoArchivoId" in valor) {
    valor.alumno = {
      id: null,
      matricula: valor.exalumnoMatricula ?? "",
      user: { name: `${valor.exalumnoNombre} (exalumno)` },
      grupo: null,
      esExalumno: true,
    };
  }

  Object.values(valor).forEach((v) => rellenar(v, vistos));
}

export function alumnoVirtualExalumno(req, res, next) {
  const json = res.json.bind(res);
  res.json = (cuerpo) => {
    try {
      rellenar(cuerpo);
    } catch {}
    return json(cuerpo);
  };
  next();
}
