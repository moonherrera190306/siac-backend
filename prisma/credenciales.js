/**
 * Exporta las credenciales de acceso a CSV, listas para imprimir y repartir.
 *
 *   node prisma/credenciales.js
 *
 * Genera en prisma/credenciales/:
 *   alumnos.csv    · docentes.csv    · personal.csv
 *
 * ⚠️ Las contraseñas están cifradas con bcrypt y NO se pueden recuperar.
 * Lo que va en el CSV es la contraseña INICIAL con la que se crearon las
 * cuentas: sirve solo mientras el usuario no la haya cambiado. La columna
 * "Ya entró" dice si esa cuenta ya tiene contraseña propia.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.join(__dirname, "credenciales");

const PASSWORD = process.env.LEGACY_PASSWORD || "Ceszam2026*";

/** Escapa comillas y separadores para que Excel no parta las columnas. */
const csv = (filas) =>
  filas
    .map((f) =>
      f
        .map((v) => {
          const s = v == null ? "" : String(v);
          return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\r\n");

function guardar(nombre, filas) {
  const p = path.join(SALIDA, `${nombre}.csv`);

  // BOM: sin él Excel en Windows destroza los acentos.
  fs.writeFileSync(p, "﻿" + csv(filas), "utf8");

  console.log(`  ${nombre.padEnd(10)} ${String(filas.length - 1).padStart(5)} cuentas  →  ${p}`);
}

async function main() {
  fs.mkdirSync(SALIDA, { recursive: true });

  console.log("\nExportando credenciales…\n");

  // ── alumnos ─────────────────────────────────────────────────
  const alumnos = await prisma.alumno.findMany({
    include: {
      user: true,
      grupo: { include: { turno: true } },
      carrera: true,
    },
    orderBy: [{ grupo: { nombre: "asc" } }, { matricula: "asc" }],
  });

  guardar("alumnos", [
    ["Matrícula", "Nombre", "Carrera", "Grupo", "Turno", "Correo", "Contraseña inicial", "Ya entró", "Estatus"],
    ...alumnos.map((a) => [
      a.matricula,
      a.user?.name,
      a.carrera?.nombre,
      a.grupo?.nombre,
      a.grupo?.turno?.nombre,
      a.user?.email,
      a.user?.debeCambiarPassword ? PASSWORD : "(ya la cambió)",
      a.user?.debeCambiarPassword ? "no" : "sí",
      a.estatusAcademico,
    ]),
  ]);

  // ── docentes ────────────────────────────────────────────────
  const docentes = await prisma.docente.findMany({
    include: { user: true },
    orderBy: { nombre: "asc" },
  });

  guardar("docentes", [
    ["Nombre", "Correo", "Contraseña inicial", "Ya entró", "Teléfono", "Activo"],
    ...docentes.map((d) => [
      d.nombre ?? d.user?.name,
      d.user?.email,
      d.user?.debeCambiarPassword ? PASSWORD : "(ya la cambió)",
      d.user?.debeCambiarPassword ? "no" : "sí",
      d.telefono,
      d.activo ? "sí" : "no",
    ]),
  ]);

  // ── personal administrativo ─────────────────────────────────
  const personal = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "DIRECTOR", "SECRETARIA", "CAJA"] } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  guardar("personal", [
    ["Rol", "Nombre", "Iniciales", "Correo", "Contraseña inicial", "Ya entró"],
    ...personal.map((u) => [
      u.role,
      u.name,
      u.iniciales ?? "",
      u.email,
      u.debeCambiarPassword ? PASSWORD : "(ya la cambió)",
      u.debeCambiarPassword ? "no" : "sí",
    ]),
  ]);

  console.log(
    `\n  Total: ${alumnos.length + docentes.length + personal.length} cuentas.` +
      "\n\n  ⚠️  Estos archivos traen contraseñas: no los subas a GitHub." +
      "\n      La carpeta prisma/credenciales/ ya está en .gitignore.\n"
  );
}

main()
  .catch((e) => {
    console.error("\nERROR:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
