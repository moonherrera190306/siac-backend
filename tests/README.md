# Pruebas del SIAC

```
npm test          # corre todo
npm run test:watch
```

## Por qué `node:test` y no Jest o Vitest

**Cero dependencias.** El runner viene dentro de Node 18+. No hay nada que
instalar, actualizar ni configurar, y una dependencia menos es una dependencia
menos que puede romperse.

## Qué se prueba hoy

Solo **lógica pura**: funciones que no tocan la base ni el servidor. Son las
reglas de negocio donde un error pasa desapercibido y sale caro.

| Archivo | Cubre |
|---|---|
| `kardex.test.js` | Redondeo institucional (.5 sube), qué acepta cada tipo de materia, cálculo de PROM y ND, y el estatus resultante |
| `horarios.test.js` | Traslape de bloques — incluido el caso de clases consecutivas, que NO deben marcarse como choque |
| `csv.test.js` | Escapado de comas y comillas, BOM para Excel, y que los nulos no salgan como "null" |

## Qué NO se prueba todavía

Todo lo que necesita base de datos: ownership del maestro, bloqueos de columna,
cobro con folio, adeudo que bloquea calificaciones, roles por endpoint.

Eso requiere una base de pruebas desechable (`DATABASE_URL` apuntando a otro
esquema y `prisma migrate reset` antes de cada corrida). Es el siguiente paso
y sí es donde están los riesgos reales.
