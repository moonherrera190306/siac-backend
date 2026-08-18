# SIAC ROADMAP

FASE ACTUAL: **1 — Cerrar fuga de datos + hacer el sistema desplegable**
Estado: **código aplicado, pendiente de verificación en ejecución**

## Completado
- `checkRole` en los 4 endpoints de `/api/reportes/*` (ADMIN/DIRECTOR, +CAJA en pagos)
- `checkRole` en los GET de materias, carreras, programas, semestres
- `reportes.routes.js`: include inválido corregido + try/catch en los 4
- `role.middleware.js`: sin log del token; los demás solo en desarrollo
- `server.js`: CORS desde `CORS_ORIGINS`
- `lib/config.ts` + 62 URLs hardcodeadas sustituidas en 42 archivos
- `app/page.tsx`: redirect por rol · sidebar: enlace roto fuera, menú ADMIN completo
- `.env.example` · scripts `users:list` / `users:create` / `users:reset`

## Pendiente (Fase 1)
- [ ] `.env` con `DATABASE_URL` y `JWT_SECRET` válidos → backend arranca con `injecting env (5)`
- [ ] `npm run users:list` responde
- [ ] ALUMNO recibe **403** en `/api/reportes/pagos`, `/academico`, `/alumnos`
- [ ] Los 6 roles entran y aterrizan en su dashboard
- [ ] Recorrer las 49 pantallas sin errores de red

## Bloqueadores
- Credenciales de Neon y JWT_SECRET expuestos en chat → **rotar ambos**
- Turbopack falló tras el cambio masivo de archivos → borrar `.next` y reiniciar

## Siguiente
**FASE 2 — Nuevo schema + migración.** Drop + recreate (no hay datos reales) con el diseño
compatible con el modelo legado. Aquí también entran índices, paginación y reestructura de carpetas.

## Fases posteriores
```
3   Auth completa (cambio de contraseña) + ownership de MAESTRO + guard por rol en el front
4   Limpieza: 4 archivos copiados, datos ficticios, 6 endpoints inexistentes
5   Estructura académica sobre el schema nuevo
6   Alumnos, inscripciones, expedientes
7   Docentes, asignaciones, horarios reales
8   Calificaciones: kardex completo
9   Asistencia: registrar y consultar
10  Caja: folio, recibo, adeudos, corte
11  Secretaría: trámites, documentos, constancias
12  Clases, bitácora, asistencia docente
13  Observaciones con seguimiento
14  Reportes, dashboards, exportación
15  AuditLog y trazabilidad
16  Sistema de diseño (azul/gris/amarillo) + responsive
17  Pruebas + endurecimiento
18  Producción
```
