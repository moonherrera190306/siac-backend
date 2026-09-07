import PDFDocument from "pdfkit";

/**
 * 🖨️ PDF
 *
 * Los reportes ya se descargaban en CSV, pero un CSV no se firma ni se
 * archiva: la escuela imprime. Aquí se arma el PDF en el servidor para
 * que el archivo salga igual sin importar el navegador de quien lo pide.
 *
 * Todo es tabla: encabezado institucional, columnas, filas y pie con
 * fecha de emisión y número de página.
 */

const MARGEN = 36;

const INSTITUCION = process.env.NOMBRE_INSTITUCION || "SIAC — Sistema Integral Académico";

function anchoUtil(doc) {
  return doc.page.width - MARGEN * 2;
}

function textoDe(valor) {
  if (valor === null || valor === undefined || valor === "") return "—";

  if (valor instanceof Date) return valor.toLocaleDateString("es-MX");

  if (typeof valor === "number") return String(valor);

  return String(valor);
}

/**
 * Reparte el ancho disponible entre las columnas. Una columna puede
 * pedir peso propio con `ancho` (proporción, no píxeles).
 */
function repartir(doc, columnas) {
  const total = columnas.reduce((acc, c) => acc + (c.ancho || 1), 0);

  const disponible = anchoUtil(doc);

  return columnas.map((c) => ((c.ancho || 1) / total) * disponible);
}

function encabezadoPagina(doc, { titulo, subtitulo }) {
  doc
    .fontSize(9)
    .fillColor("#64748b")
    .text(INSTITUCION, MARGEN, 24, { width: anchoUtil(doc) });

  doc
    .fontSize(16)
    .fillColor("#0f172a")
    .text(titulo, MARGEN, 40, { width: anchoUtil(doc) });

  if (subtitulo) {
    doc
      .fontSize(9)
      .fillColor("#64748b")
      .text(subtitulo, MARGEN, 62, { width: anchoUtil(doc) });
  }

  doc
    .moveTo(MARGEN, 80)
    .lineTo(doc.page.width - MARGEN, 80)
    .strokeColor("#cbd5e1")
    .stroke();

  doc.y = 92;
}

function filaTabla(doc, columnas, anchos, valores, { cabecera = false } = {}) {
  const alto = 16;

  // Salto de página cuando ya no cabe la fila.
  if (doc.y + alto > doc.page.height - 46) {
    doc.addPage();
  }

  const y = doc.y;

  if (cabecera) {
    doc
      .rect(MARGEN, y - 2, anchoUtil(doc), alto)
      .fillColor("#e2e8f0")
      .fill();
  }

  let x = MARGEN;

  doc.fontSize(cabecera ? 8 : 8.5).fillColor(cabecera ? "#0f172a" : "#1e293b");

  columnas.forEach((c, i) => {
    doc.text(textoDe(valores[i]), x + 3, y + 2, {
      width: anchos[i] - 6,
      height: alto,
      ellipsis: true,
      lineBreak: false,
      align: c.alinear || "left",
    });

    x += anchos[i];
  });

  doc.y = y + alto;

  if (!cabecera) {
    doc
      .moveTo(MARGEN, doc.y)
      .lineTo(doc.page.width - MARGEN, doc.y)
      .strokeColor("#f1f5f9")
      .stroke();
  }
}

function pieDePagina(doc) {
  const paginas = doc.bufferedPageRange();

  const emitido = new Date().toLocaleString("es-MX");

  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(paginas.start + i);

    doc
      .fontSize(7.5)
      .fillColor("#94a3b8")
      .text(
        `Emitido ${emitido}`,
        MARGEN,
        doc.page.height - 30,
        { width: anchoUtil(doc) / 2, lineBreak: false }
      );

    doc.text(
      `Página ${i + 1} de ${paginas.count}`,
      doc.page.width / 2,
      doc.page.height - 30,
      { width: anchoUtil(doc) / 2, align: "right", lineBreak: false }
    );
  }
}

/**
 * Reporte tabular.
 *
 * @param res            respuesta de Express
 * @param nombreArchivo  sin extensión
 * @param titulo         encabezado del documento
 * @param subtitulo      línea de contexto (ciclo, filtros, totales)
 * @param columnas       [{ id, label, ancho?, alinear? }]
 * @param filas          [{ [id]: valor }]
 * @param secciones      alternativa a `filas`: [{ titulo, subtitulo?, filas }]
 * @param horizontal     true para tablas anchas
 */
export function reportePDF(
  res,
  { nombreArchivo, titulo, subtitulo, columnas, filas = [], secciones = null, horizontal = false }
) {
  const doc = new PDFDocument({
    size: "LETTER",
    layout: horizontal ? "landscape" : "portrait",
    margins: { top: 92, bottom: 46, left: MARGEN, right: MARGEN },
    bufferPages: true,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${nombreArchivo}.pdf"`
  );

  doc.pipe(res);

  doc.on("pageAdded", () => encabezadoPagina(doc, { titulo, subtitulo }));

  encabezadoPagina(doc, { titulo, subtitulo });

  const anchos = repartir(doc, columnas);

  const pintarTabla = (lista) => {
    filaTabla(
      doc,
      columnas,
      anchos,
      columnas.map((c) => c.label),
      { cabecera: true }
    );

    if (lista.length === 0) {
      doc.moveDown(0.5);

      doc
        .fontSize(9)
        .fillColor("#94a3b8")
        .text("Sin registros.", MARGEN, doc.y);

      doc.moveDown(0.5);

      return;
    }

    for (const f of lista) {
      filaTabla(doc, columnas, anchos, columnas.map((c) => f[c.id]));
    }
  };

  if (Array.isArray(secciones)) {
    secciones.forEach((s, i) => {
      if (i > 0) doc.moveDown(1);

      // Un grupo no se parte a la mitad si apenas cabe el encabezado.
      if (doc.y + 70 > doc.page.height - 46) doc.addPage();

      doc
        .fontSize(11)
        .fillColor("#0f172a")
        .text(s.titulo, MARGEN, doc.y, { width: anchoUtil(doc) });

      if (s.subtitulo) {
        doc
          .fontSize(8.5)
          .fillColor("#64748b")
          .text(s.subtitulo, MARGEN, doc.y, { width: anchoUtil(doc) });
      }

      doc.moveDown(0.3);

      pintarTabla(s.filas ?? []);
    });
  } else {
    pintarTabla(filas);
  }

  pieDePagina(doc);

  doc.end();
}

/**
 * Convierte el `?formato=` de cualquier reporte en la respuesta correcta.
 * Devuelve true si ya respondió en PDF.
 */
export function respondioPDF(req, res, config) {
  if (req.query.formato !== "pdf") return false;

  reportePDF(res, config);

  return true;
}
