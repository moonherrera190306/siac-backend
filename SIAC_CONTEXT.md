# SIAC CONTEXT

> Mapa técnico compacto. Punto de entrada de toda sesión.
> Si el código contradice este archivo, gana el código: corrige solo el área afectada.
> Última actualización: 2026-08-15

Institución: **CESZAM** — Centro de Estudios Superiores de Zamora / Escuela Preparatoria
por Cooperación de Zamora, incorporada a la UMSNH. Prepa + universidad. ~3,000 alumnos.

## Arquitectura

- **Frontend:** Next.js 16.1.6 (App Router, Turbopack) · React 19 · Tailwind v4 · TypeScript → Vercel
- **Backend:** Node + Express 4 (ESM, `"type":"module"`) · Prisma 6 → Railway
- **Database:** PostgreSQL en Neon
- **Auth:** JWT (8h) en `localStorage`, header `Authorization: Bearer`
- **Local:** front `:3000`, back `:4000`

Repos válidos: **`C:\Users\traba\siac-frontend`** y **`C:\Users\traba\siac-backend`**.
`SIAC-DUAL/` NO se usa. `siac-frontend/sie-backend/` es de otro proyecto.

## Estructura importante

```
siac-backend/
  src/server.js              monta 16 routers
  src/lib/prisma.js          cliente Prisma
  src/middleware/            auth.middleware.js (verifyToken) · role.middleware.js (checkRole)
  src/routes/*.routes.js     17 archivos — toda la lógica vive aquí (no hay capa de servicios)
  src/controllers/docente.controller.js   ⚠️ CÓDIGO MUERTO, no se importa
  src/scripts/               createUsers.js · listUsers.js · resetPassword.js
  prisma/schema.prisma · prisma/seed.js

siac-frontend/
  app/layout.tsx · app/page.tsx (redirect por rol) · app/login/page.tsx
  app/(dashboard)/layout.tsx  sidebar + menú por rol
  app/(dashboard)/{administrador,director,secretaria,caja,maestro,alumno}/**/page.tsx  (49 páginas)
  lib/config.ts        API_URL  ← usar SIEMPRE esto, nunca URLs literales
  lib/apiClient.ts     apiFetch() — maneja 401; solo lo usan 3 páginas
  components/ModulePage.tsx   ⚠️ CÓDIGO MUERTO
```

## Modelos Prisma (schema ACTUAL, 15 modelos, 0 índices)

```
User ─1:1─ Alumno ─┬─ Grupo ─ Semestre ─ Carrera ─ Programa
    └─1:1─ Docente ├─ Calificacion ─ Materia / CicloEscolar
                   ├─ Asistencia ─ Grupo
                   ├─ Pago ─ Cuota
                   ├─ Adeudo
                   └─ Documento
Docente ─ AsignacionMateria ─ Materia / Grupo / CicloEscolar
```

Enums: `Role`, `NivelEducativo`, `EstadoAsistencia`, `EstadoCalificacion`.

⚠️ Este schema **se reemplaza completo en la Fase 2**. El diseño nuevo (compatible con la
migración del sistema legado) está en el proyecto de Claude: `claude/ceszam-modelo-datos.md`.

## Roles

`ADMIN` · `DIRECTOR` · `SECRETARIA` · `CAJA` · `MAESTRO` · `ALUMNO`

## Módulos — estado resumido

| Módulo | Estado |
|---|---|
| Auth (login) | 🟢 funciona · sin cambio de contraseña ni refresh |
| Alumnos | 🟡 CRUD real, sin paginación |
| Docentes | 🟡 alta/listado real |
| Ciclos · Grupos · Materias · Semestres | 🟡 CRUD real |
| Asignaciones | 🟢 el módulo mejor construido |
| Calificaciones | 🟠 UI del maestro buena, pero llama 2 endpoints inexistentes |
| Asistencia | 🔴 solo lectura, **no hay endpoint para registrarla** |
| Pagos | 🟠 alta/listado; sin folio, recibo ni adeudos reales |
| Caja | 🔴 sin backend (`caja.routes.js` no existe) |
| Secretaría | 🔴 sin backend (`secretaria.routes.js` no existe) |
| Documentos | 🔴 solo GET |
| Reportes | 🟡 devuelven JSON, no se renderiza |
| Bitácora · Observaciones · AuditLog · Notificaciones | 🔴 no existen |

## APIs — mapa resumido

Prefijos montados en `server.js`:
`/api/auth` `/api/admin` `/api/alumnos` `/api/docentes` `/api/grupos` `/api/materias`
`/api/semestres` `/api/carreras` `/api/programas` `/api/ciclos` `/api/asignaciones`
`/api/calificaciones` `/api/asistencias` `/api/documentos` `/api/pagos` `/api/reportes` `/api/director`

**No existen:** `/api/caja`, `/api/secretaria`.

Endpoints que el frontend llama y NO existen (pendiente Fase 4):
- `PUT /api/alumnos/perfil/:id` (el real es `PUT /api/alumnos/:id`)
- `GET|POST /api/docentes/grupos/:g/materias/:m/alumnos|calificaciones`
- `GET /api/director/reportes/:tipo` (el real no lleva parámetro)
- `GET /api/documentos` sin id

## Autenticación y permisos

- Login: `POST /api/auth/login` → bcrypt · JWT payload `{ id, role, alumnoId }` · 8h
- Backend: `verifyToken` + `checkRole([...])` por ruta. `director.routes.js` usa `router.use()` global.
- Frontend: los layouts **solo comprueban que exista token, no el rol**. El menú es cosmético.
  No hay `middleware.ts`. → pendiente Fase 3.
- ⚠️ Sin ownership: un MAESTRO puede calificar/consultar cualquier grupo (Fase 3).

## Convenciones

- Backend: toda la lógica en `routes/`; respuestas `res.json(data)` o `{ message }` en error.
- Frontend: `"use client"` en casi todo; `fetch` a mano (no axios).
  **Siempre** `import { API_URL } from "@/lib/config"` — nunca URLs literales.
- Español en nombres de rutas, modelos y UI.

## Problemas conocidos

- 4 páginas con contenido copiado de otra ruta: `administrador/page.tsx`, `alumno/horario`,
  `caja/recibos`, `director/calificaciones`.
- Datos ficticios en el cliente: `director/asistencias`, `director/calificaciones`,
  `maestro/horario`, `secretaria/documentos`, `administrador/maestros`.
- `pago.routes.js`: `deudaBase = 1000` hardcodeado. Nada crea registros `Adeudo`.
- `director.routes.js`: usa `c.calificacion` y `as.presente` — campos que no existen → promedio y
  asistencia siempre 0. Además devuelve `desempeño:"Bueno"` y `promedio:85` hardcodeados.
- `Asistencia @@unique([alumnoId, fecha])` con timestamp: nunca dispara.
- Sin paginación, sin índices, sin validación de entrada, sin tests.
- Password `"123456"` en `seed.js` y `createUsers.js`; sin endpoint de cambio de contraseña.

Detalle completo: `claude/auditoria-siac-2026-08.md` en el proyecto de Claude.

## Roadmap

Ver `SIAC_ROADMAP.md`. **Fase actual: 1 (cerrando).**

## Últimos cambios

**2026-08-15**
- Fase 1: `checkRole` en `/api/reportes/*` (era accesible para cualquier autenticado) y en los
  GET de materias, carreras, programas, semestres.
- `reportes.routes.js`: corregido `include: { materias: true }` inválido (daba 500) + try/catch.
- `role.middleware.js`: eliminado el log del token; los demás solo en desarrollo.
- `server.js`: CORS desde `CORS_ORIGINS`.
- Frontend: creado `lib/config.ts`; 62 URLs `localhost:4000` sustituidas en 42 archivos.
- `app/page.tsx`: redirect por rol. Sidebar: quitado enlace roto `/director/maestros`,
  agregadas 5 entradas al menú de ADMIN.
- Nuevos scripts: `npm run users:list` · `users:create` · `users:reset`.
  Corregida ruta de import rota en `createUsers.js`.

## Decisiones técnicas

1. **El schema se reemplaza completo en la Fase 2** (no hay datos reales en Neon).
   Debe ser compatible con el modelo legado para migrar alumnos.
2. **Calificaciones = columnas fijas del kardex** (PP, SP, PROM, EF, O, EE, EA, EER, Artículo, ND),
   guardadas como **texto** para aceptar `1-10`, `AC`, `NA`, `NP`. No parciales genéricos.
3. **Redondeo institucional: el .5 siempre sube.** Solo en capturas nuevas; lo migrado no se recalcula.
4. **Asistencia:** acumulado mensual por materia (compatible con el legado) + registro diario por
   clase que lo alimenta hacia adelante.
5. **Recibos:** folio consecutivo continuando la serie física (último impreso: 100052).
6. **Caja → Secretaría:** cobrar un servicio con `generaTramite` crea el trámite en la misma transacción.
7. **Paleta de interfaz:** azules, grises y toques amarillos.
8. No reestructurar carpetas hasta la Fase 2 (va junto con el rewrite del backend).
