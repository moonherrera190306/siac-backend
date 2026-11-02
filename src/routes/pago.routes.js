import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { checkRole } from "../middleware/role.middleware.js";
import { auditar } from "../lib/audit.js";
import { reportePDF } from "../lib/pdf.js";
import { buscarExalumnos, obtenerExalumno } from "../lib/archivo.js";

const router = express.Router();

/**
 * =========================================
 * 💰 CAJA
 * =========================================
 *
 * Un Pago ES el recibo: lleva el folio consecutivo y sus líneas
 * viven en DetallePago. Un pago nunca se borra, se cancela.
 */

/**
 * "María Fernanda López" → "MFL". Si el cajero no escribe sus iniciales,
 * se toman de su nombre: el recibo físico siempre las lleva.
 */
function inicialesDe(nombre) {
  if (!nombre) return null;

  const iniciales = String(nombre)
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return iniciales || null;
}

// ==========================================
// 🗄️ BUSCAR EXALUMNOS en el Archivo histórico
// GET /api/pagos/exalumnos?q=nombre o matrícula
// ==========================================
router.get(
  "/exalumnos",
  verifyToken,
  checkRole(["ADMIN", "CAJA"]),
  async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      const data = q.length < 2 ? [] : await buscarExalumnos(q);
      res.json({ success: true, data: data ?? [] });
    } catch (error) {
      console.error(error);
      res.status(502).json({ success: false, message: error.message });
    }
  }
);

// ==========================================
// 💰 COBRAR — genera recibo con folio
// Body: {
//   alumnoId | exalumnoId (id del Archivo histórico), metodo, referencia,
//   conceptos: [{ conceptoPagoId, descripcion, cantidad, monto, adeudoId }]
// }
// ==========================================
router.post(
  "/",
  verifyToken,
  checkRole(["ADMIN", "CAJA"]),
  async (req, res) => {
    try {
      const { alumnoId, exalumnoId, metodo, referencia, conceptos, libro, iniciales } =
        req.body;

      if ((!alumnoId && !exalumnoId) || !Array.isArray(conceptos) || conceptos.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Se requiere el alumno y al menos un concepto",
        });
      }

      // 🗄️ Exalumno: los datos se toman del archivo, nunca del cliente.
      let exalumno = null;

      if (!alumnoId) {
        exalumno = await obtenerExalumno(exalumnoId);

        if (!exalumno) {
          return res.status(404).json({
            success: false,
            message: "Exalumno no encontrado en el Archivo histórico",
          });
        }
      } else {
        const alumno = await prisma.alumno.findUnique({ where: { id: alumnoId } });

        if (!alumno) {
          return res.status(404).json({
            success: false,
            message: "Alumno no encontrado",
          });
        }
      }

      const ids = conceptos.map((c) => c.conceptoPagoId);

      const catalogo = await prisma.conceptoPago.findMany({
        where: { id: { in: ids } },
      });

      if (catalogo.length !== new Set(ids).size) {
        return res.status(400).json({
          success: false,
          message: "Hay un concepto de pago que no existe",
        });
      }

      const lineas = conceptos.map((c) => {
        const monto = Number(c.monto);
        const cantidad = Number(c.cantidad ?? 1);

        if (isNaN(monto) || monto <= 0) {
          throw new Error("El monto de cada concepto debe ser mayor a cero");
        }

        return {
          conceptoPagoId: c.conceptoPagoId,
          descripcion: c.descripcion ?? null,
          cantidad,
          monto,
        };
      });

      const total = lineas.reduce((acc, l) => acc + l.monto * l.cantidad, 0);

      // 🔥 Todo ocurre en una sola transacción: recibo, líneas,
      // trámites generados y adeudos liquidados.
      const pago = await prisma.$transaction(async (tx) => {
        const creado = await tx.pago.create({
          data: {
            alumnoId: alumnoId || null,
            exalumnoArchivoId: exalumno ? exalumno.id : null,
            exalumnoMatricula: exalumno ? exalumno.matricula : null,
            exalumnoNombre: exalumno ? exalumno.nombre : null,
            total,
            metodo: metodo || "EFECTIVO",
            referencia: referencia ?? null,
            // 🔥 Libro físico e iniciales de quien cobra: así el recibo
            // digital se empata con el talonario de papel.
            libro: libro ? String(libro).trim() : null,
            iniciales: iniciales
              ? String(iniciales).trim().toUpperCase()
              : iniciales === ""
              ? null
              : inicialesDe(req.user.name),
            cobradoPorId: req.user.id,
            detalles: { create: lineas },
          },
          // El alumno y su grupo salen impresos en el recibo.
          include: {
            alumno: { include: { user: true, grupo: true } },
            detalles: { include: { concepto: true } },
          },
        });

        // Puente caja → secretaría. Solo alumnos activos: lo del
        // exalumno se atiende desde el Archivo histórico.
        for (const detalle of alumnoId ? creado.detalles : []) {
          if (detalle.concepto.generaTramite) {
            await tx.tramite.create({
              data: {
                alumnoId,
                conceptoPagoId: detalle.conceptoPagoId,
                pagoId: creado.id,
                estado: "SOLICITADO",
              },
            });
          }
        }

        // Liquidación de adeudos indicados en la línea.
        const adeudoIds = conceptos.map((c) => c.adeudoId).filter(Boolean);

        if (alumnoId && adeudoIds.length > 0) {
          await tx.adeudo.updateMany({
            where: { id: { in: adeudoIds }, alumnoId },
            data: { pagado: true, saldo: 0 },
          });
        }

        return creado;
      });

      // 🔍 Un cobro es de lo más sensible que hace el sistema.
      await auditar({
        req,
        accion: "CREAR",
        entidad: "Pago",
        entidadId: pago.id,
        despues: {
          folio: pago.folio,
          libro: pago.libro,
          alumnoId: pago.alumnoId,
          exalumnoArchivoId: pago.exalumnoArchivoId,
          total: pago.total,
          metodo: pago.metodo,
          conceptos: pago.detalles.map((d) => d.concepto?.clave),
        },
      });

      res.status(201).json({
        success: true,
        message: `Recibo ${pago.folio} generado correctamente`,
        data: pago,
      });
    } catch (error) {
      console.error(error);

      res.status(400).json({
        success: false,
        message: error.message || "Error al registrar pago",
      });
    }
  }
);

// ==========================================
// 🔥 LISTA DE PAGOS (paginada)
// ==========================================
router.get(
  "/",
  verifyToken,
  checkRole(["ADMIN", "CAJA", "DIRECTOR"]),
  async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const perPage = Math.min(100, Number(req.query.perPage) || 50);

      // 🔎 El historial se busca como se busca en el archivo físico:
      // por folio, por libro, por alumno o por rango de fechas.
      const texto = (req.query.search || "").trim();

      const folioBuscado = Number(texto);

      const where = {
        ...(req.query.estado ? { estado: req.query.estado } : {}),
        ...(req.query.libro ? { libro: req.query.libro } : {}),
        ...(req.query.folio ? { folio: Number(req.query.folio) } : {}),
        ...(req.query.desde || req.query.hasta
          ? {
              pagadoEn: {
                ...(req.query.desde
                  ? { gte: new Date(`${req.query.desde}T00:00:00`) }
                  : {}),
                ...(req.query.hasta
                  ? { lte: new Date(`${req.query.hasta}T23:59:59.999`) }
                  : {}),
              },
            }
          : {}),
        ...(texto
          ? {
              OR: [
                ...(Number.isInteger(folioBuscado) && texto !== ""
                  ? [{ folio: folioBuscado }]
                  : []),
                { libro: { contains: texto, mode: "insensitive" } },
                { iniciales: { contains: texto, mode: "insensitive" } },
                { alumno: { matricula: { contains: texto, mode: "insensitive" } } },
                {
                  alumno: {
                    user: { name: { contains: texto, mode: "insensitive" } },
                  },
                },
              ],
            }
          : {}),
      };

      const [pagos, total] = await Promise.all([
        prisma.pago.findMany({
          where,
          include: {
            alumno: { include: { user: true } },
            detalles: { include: { concepto: true } },
          },
          orderBy: { pagadoEn: "desc" },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        prisma.pago.count({ where }),
      ]);

      res.json({
        success: true,
        data: pagos,
        meta: { page, perPage, total },
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al obtener pagos",
      });
    }
  }
);

// ==========================================
// 📖 LIBRO DE RECIBOS
// El historial como se lleva en papel: folio, libro, iniciales y fecha.
// ?formato=pdf lo descarga para archivar o cotejar.
// ==========================================
router.get(
  "/libro",
  verifyToken,
  checkRole(["ADMIN", "CAJA", "DIRECTOR"]),
  async (req, res) => {
    try {
      const where = {
        ...(req.query.libro ? { libro: req.query.libro } : {}),
        ...(req.query.estado ? { estado: req.query.estado } : {}),
        ...(req.query.desde || req.query.hasta
          ? {
              pagadoEn: {
                ...(req.query.desde
                  ? { gte: new Date(`${req.query.desde}T00:00:00`) }
                  : {}),
                ...(req.query.hasta
                  ? { lte: new Date(`${req.query.hasta}T23:59:59.999`) }
                  : {}),
              },
            }
          : {}),
        ...(req.query.folioDesde || req.query.folioHasta
          ? {
              folio: {
                ...(req.query.folioDesde
                  ? { gte: Number(req.query.folioDesde) }
                  : {}),
                ...(req.query.folioHasta
                  ? { lte: Number(req.query.folioHasta) }
                  : {}),
              },
            }
          : {}),
      };

      const pagos = await prisma.pago.findMany({
        where,
        include: {
          alumno: { include: { user: true } },
          detalles: { include: { concepto: true } },
        },
        // El libro se lee en orden de folio, como el talonario.
        orderBy: { folio: "asc" },
        take: 2000,
      });

      const filas = pagos.map((p) => ({
        folio: p.folio,
        libro: p.libro || "—",
        iniciales: p.iniciales || "—",
        fecha: p.pagadoEn ? new Date(p.pagadoEn).toLocaleDateString("es-MX") : "—",
        matricula: p.alumno?.matricula ?? p.exalumnoMatricula ?? "",
        alumno: p.alumno?.user?.name ?? (p.exalumnoNombre ? `${p.exalumnoNombre} (exalumno)` : ""),
        concepto:
          p.detalles.map((d) => d.concepto?.nombre).filter(Boolean).join(", ") ||
          "—",
        total: Number(p.total ?? 0).toFixed(2),
        estado: p.estado === "CANCELADO" ? "CANCELADO" : "PAGADO",
      }));

      const total = pagos
        .filter((p) => p.estado !== "CANCELADO")
        .reduce((acc, p) => acc + Number(p.total ?? 0), 0);

      const meta = {
        recibos: filas.length,
        total,
        libro: req.query.libro || null,
        desde: req.query.desde || null,
        hasta: req.query.hasta || null,
      };

      if (req.query.formato === "pdf") {
        const rango =
          filas.length > 0
            ? `Folios ${filas[0].folio} al ${filas[filas.length - 1].folio}`
            : "Sin recibos";

        return reportePDF(res, {
          nombreArchivo: `libro-de-recibos${req.query.libro ? `-${req.query.libro}` : ""}`,
          titulo: "Libro de recibos",
          subtitulo: [
            req.query.libro ? `Libro ${req.query.libro}` : null,
            rango,
            `${filas.length} recibo(s)`,
            `Total $${total.toFixed(2)}`,
          ]
            .filter(Boolean)
            .join(" · "),
          horizontal: true,
          columnas: [
            { id: "folio", label: "Folio", ancho: 0.8 },
            { id: "libro", label: "Libro", ancho: 0.7 },
            { id: "iniciales", label: "Iniciales", ancho: 0.8 },
            { id: "fecha", label: "Fecha", ancho: 1 },
            { id: "matricula", label: "Matrícula", ancho: 1.1 },
            { id: "alumno", label: "Alumno", ancho: 2.6 },
            { id: "concepto", label: "Concepto", ancho: 2.2 },
            { id: "total", label: "Importe", ancho: 0.9, alinear: "right" },
            { id: "estado", label: "Estado", ancho: 0.9 },
          ],
          filas,
        });
      }

      res.json({ success: true, data: filas, meta });
    } catch (error) {
      console.error("ERROR LIBRO DE RECIBOS:", error);

      res.status(500).json({
        success: false,
        message: "Error al generar el libro de recibos",
      });
    }
  }
);

// ==========================================
// 🧾 CORTE DE CAJA POR CAJERO
// ==========================================
router.get(
  "/corte/dia",
  verifyToken,
  checkRole(["ADMIN", "CAJA", "DIRECTOR"]),
  async (req, res) => {
    try {
      const dia = req.query.fecha ? new Date(req.query.fecha) : new Date();

      const desde = new Date(dia);
      desde.setHours(0, 0, 0, 0);

      const hasta = new Date(dia);
      hasta.setHours(23, 59, 59, 999);

      // Un cajero solo ve su propio corte.
      const where = {
        estado: "PAGADO",
        pagadoEn: { gte: desde, lte: hasta },
        ...(req.user.role === "CAJA" ? { cobradoPorId: req.user.id } : {}),
      };

      const pagos = await prisma.pago.findMany({
        where,
        include: { detalles: { include: { concepto: true } } },
      });

      const porConcepto = {};

      for (const p of pagos) {
        for (const d of p.detalles) {
          const clave = d.concepto.clave;
          porConcepto[clave] = (porConcepto[clave] || 0) + d.monto * d.cantidad;
        }
      }

      res.json({
        success: true,
        data: {
          fecha: desde,
          recibos: pagos.length,
          total: pagos.reduce((acc, p) => acc + p.total, 0),
          porConcepto,
        },
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al generar el corte",
      });
    }
  }
);

// ==========================================
// 📊 RESUMEN DE PAGOS Y ADEUDO REAL
// ==========================================
router.get(
  "/resumen/:alumnoId",
  verifyToken,
  checkRole(["ADMIN", "CAJA", "ALUMNO", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { alumnoId } = req.params;

      // 🔒 SEGURIDAD
      if (req.user.role === "ALUMNO" && req.user.alumnoId !== alumnoId) {
        return res.status(403).json({
          success: false,
          message: "No autorizado",
        });
      }

      const [pagos, adeudos] = await Promise.all([
        prisma.pago.findMany({
          where: { alumnoId, estado: "PAGADO" },
        }),
        prisma.adeudo.findMany({
          where: { alumnoId, pagado: false },
        }),
      ]);

      // 🔥 El adeudo sale de la tabla Adeudo, ya no de una constante.
      res.json({
        success: true,
        data: {
          totalPagado: pagos.reduce((acc, p) => acc + p.total, 0),
          adeudo: adeudos.reduce((acc, a) => acc + a.saldo, 0),
          adeudos,
        },
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al obtener resumen",
      });
    }
  }
);

// ==========================================
// 🚫 CANCELAR UN PAGO (nunca se borra)
// ==========================================
router.put(
  "/cancelar/:id",
  verifyToken,
  checkRole(["ADMIN", "CAJA"]),
  async (req, res) => {
    try {
      const { motivo } = req.body;

      if (!motivo) {
        return res.status(400).json({
          success: false,
          message: "El motivo de cancelación es obligatorio",
        });
      }

      const previo = await prisma.pago.findUnique({
        where: { id: req.params.id },
      });

      const pago = await prisma.pago.update({
        where: { id: req.params.id },
        data: {
          estado: "CANCELADO",
          canceladoEn: new Date(),
          canceladoPorId: req.user.id,
          motivoCancela: motivo,
        },
      });

      // 🔍 Cancelar un recibo debe quedar registrado con el estado previo.
      await auditar({
        req,
        accion: "CANCELAR",
        entidad: "Pago",
        entidadId: pago.id,
        antes: { estado: previo?.estado, total: previo?.total },
        despues: { estado: pago.estado, motivo },
      });

      res.json({
        success: true,
        message: `Recibo ${pago.folio} cancelado`,
        data: pago,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al cancelar el pago",
      });
    }
  }
);

// ==========================================
// 💸 ADEUDOS — crearlos es lo que activa el bloqueo
// ==========================================
router.post(
  "/adeudos",
  verifyToken,
  checkRole(["ADMIN", "CAJA"]),
  async (req, res) => {
    try {
      const { alumnoId, conceptoPagoId, cicloEscolarId, descripcion, monto, fechaLimite } =
        req.body;

      if (!alumnoId || !monto) {
        return res.status(400).json({
          success: false,
          message: "Alumno y monto son requeridos",
        });
      }

      const adeudo = await prisma.adeudo.create({
        data: {
          alumnoId,
          conceptoPagoId: conceptoPagoId ?? null,
          cicloEscolarId: cicloEscolarId ?? null,
          descripcion: descripcion ?? null,
          monto: Number(monto),
          saldo: Number(monto),
          fechaLimite: fechaLimite ? new Date(fechaLimite) : null,
          createdById: req.user.id,
        },
      });

      res.status(201).json({ success: true, data: adeudo });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al registrar el adeudo",
      });
    }
  }
);

// ==========================================
// 🏷️ CATÁLOGO DE CONCEPTOS DE PAGO
// Antes de "/:alumnoId" para que la ruta no lo absorba.
// ==========================================
router.get(
  "/conceptos",
  verifyToken,
  checkRole(["ADMIN", "CAJA", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const conceptos = await prisma.conceptoPago.findMany({
        where: { activo: true },
        orderBy: { nombre: "asc" },
      });

      res.json({ success: true, data: conceptos });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al obtener los conceptos",
      });
    }
  }
);

// ==========================================
// 💸 LISTA DE ADEUDOS
// Se declara ANTES de "/:alumnoId" o la ruta se lo come.
// ==========================================
router.get(
  "/adeudos/lista",
  verifyToken,
  checkRole(["ADMIN", "CAJA", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const perPage = Math.min(200, Number(req.query.perPage) || 50);

      const where = {
        ...(req.query.pagado !== undefined
          ? { pagado: req.query.pagado === "true" }
          : { pagado: false }),
        ...(req.query.alumnoId ? { alumnoId: req.query.alumnoId } : {}),
      };

      const [adeudos, total, suma] = await Promise.all([
        prisma.adeudo.findMany({
          where,
          include: {
            alumno: { include: { user: true, grupo: true } },
            concepto: true,
          },
          orderBy: [{ fechaLimite: "asc" }, { createdAt: "desc" }],
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        prisma.adeudo.count({ where }),
        prisma.adeudo.aggregate({ where, _sum: { saldo: true } }),
      ]);

      res.json({
        success: true,
        data: adeudos,
        meta: { page, perPage, total, saldoTotal: suma._sum.saldo || 0 },
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al obtener los adeudos",
      });
    }
  }
);

// ==========================================
// 📄 PAGOS POR ALUMNO
// ==========================================
router.get(
  "/:alumnoId",
  verifyToken,
  checkRole(["ADMIN", "CAJA", "ALUMNO", "DIRECTOR", "SECRETARIA"]),
  async (req, res) => {
    try {
      const { alumnoId } = req.params;

      // 🔒 SEGURIDAD
      if (req.user.role === "ALUMNO" && req.user.alumnoId !== alumnoId) {
        return res.status(403).json({
          success: false,
          message: "No autorizado",
        });
      }

      const pagos = await prisma.pago.findMany({
        where: { alumnoId },
        include: {
          alumno: { include: { user: true, grupo: true } },
          detalles: { include: { concepto: true } },
        },
        orderBy: { pagadoEn: "desc" },
      });

      res.json({
        success: true,
        data: pagos,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Error al obtener pagos",
      });
    }
  }
);

export default router;
