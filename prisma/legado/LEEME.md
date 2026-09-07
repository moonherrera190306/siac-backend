# Migración del sistema legado CESZAM → SIAC

Trae a PostgreSQL los tres respaldos MariaDB del sistema anterior:
`ceszam_viejo`, `ceszam_nuevo` (preparatoria) y `ceszam_derecho`.

## Cómo se corre

```bash
# 1. Base en cero (borra TODO, incluidos los datos demo)
npx prisma migrate reset

# 2. Cargar el legado
node prisma/migrar-legado.js
```

Tarda unos minutos: son 1,737 alumnos y 63,164 calificaciones.
El script es **idempotente** — si se interrumpe, se vuelve a correr y continúa
sin duplicar nada. Para rehacer la carga desde cero:

```bash
node prisma/migrar-legado.js --limpiar
```

Eso borra **solo** lo migrado (todo lleva `legacyId` con prefijo) y respeta
cualquier dato capturado después en el SIAC.

## Volver a generar los JSON

Ya vienen generados en `prisma/legado/datos/`. Solo hace falta rehacerlos si
cambian los respaldos:

```bash
cd prisma/legado
# copiar los .sql a ./dumps/ con los nombres ceszam_viejo.sql, etc.
python extraer.py
```

`extraer.py` **lee los .sql directamente**: no hay que levantar MySQL ni
restaurar nada.

## Qué se migra

| | |
|---|---|
| Alumnos | 1,737 (con su usuario de acceso) |
| Docentes | 45 |
| Materias | 182 |
| Grupos | 56 |
| Inscripciones | 6,456 |
| **Calificaciones** | **63,164** |
| Asistencia mensual | 63,596 |
| Observaciones | 2,990 |
| Ciclos | 10 (2021-2022 → 2026-2026) |

## Accesos

Contraseña inicial de todos: `Ceszam2026*` (o el valor de `LEGACY_PASSWORD`).
Todos entran con `debeCambiarPassword = true`.

- Alumnos: `<matricula>@alumno.ceszam.mx` — ej. `2228306c@alumno.ceszam.mx`
- Docentes: `<usuario>@docente.ceszam.mx`

Si el alumno o docente traía correo real en el sistema viejo, se respeta ese
(fueron 22 casos).

---

## Decisiones que hay que conocer

### PROM, O y ND se recalculan

Los respaldos **no traen** esas tres columnas: en MariaDB son
`GENERATED ALWAYS AS`, o sea virtuales, y no se exportan. Solo vienen PP, SP y EF.

`extraer.py` replica la fórmula original **al pie de la letra**, incluido su
redondeo asimétrico:

> el `.5` **sube** de 6.5 en adelante (6.5→7, 7.5→8, 8.5→9, 9.5→10)
> y **baja** de 5.5 para abajo (5.5→5, 4.5→4, 3.5→3)

Es intencional en el sistema viejo: evita que alguien pase con 5.5. Usar
redondeo normal habría convertido en aprobados a cientos de reprobados.

También se replican `floor(x/2)` cuando hay `NP`, la cascada de 11 niveles que
define ND (artículo → recursamientos → especial → adicional → extraordinario →
ordinario) y el estatus.

Todo entra con `migrado = true`, así que **el SIAC nunca las recalcula**.

### Los tres respaldos se fusionan por nombre, no por id

`id_materia = 1` existe en las tres bases y son materias distintas; el ciclo
`2025-2025` es id 8 en viejo, 6 en nuevo y 3 en derecho. Nada se mapea por id:
todo va por nombre, y cada registro lleva `legacyId` propio.

### Alumnos repetidos = la misma persona

20 matrículas aparecen en dos respaldos: son alumnos que hicieron la prepa y
siguieron a Derecho. Se unifican en **un solo Alumno con varias Inscripciones**.
Cuando el nombre viene escrito distinto entre bases, gana el del respaldo más
reciente.

### Lo que se descartó

`datos/descartadas.csv` — **48 calificaciones**, todas de la matrícula
`2228306C` (Regina Margarita Verduzco Mora), que es el único caso real de
duplicado: tiene kardex en `viejo` y en `nuevo` para los mismos 5 ciclos. Se
conservó la versión de `nuevo`. Vale la pena revisar ese CSV y confirmar cuál
es la buena.

### Estructura académica

El respaldo `nuevo` tiene un nivel extra (`nivel_academico → turno →
bachillerato`) que `viejo` y `derecho` no tienen; el extractor maneja las dos
formas.

- `bachillerato` del legado → **Trayectoria** del SIAC (tronco común, TR-… y ÁREA PROP-…)
- Los grupos se nombran `3B TR-CSH-03`, `5A AP-CQB-11`, `1A DER`
- Los grupos del mismo semestre y trayectoria se fusionan entre ciclos: el ciclo
  vive en `Inscripcion`, que es donde corresponde

## Limitaciones conocidas

- **Recursamientos**: el legado guarda 6 columnas (`recmto_ord`, `recmto_extra`,
  `recmto_eer` y sus `recmtoDos_*`), 1,897 registros con datos. El SIAC no tiene
  columnas para eso. **El resultado sí llega**, porque alimenta ND y el estatus,
  pero se pierde el detalle de en cuál intento se acreditó. Si hace falta,
  son tres columnas nullables en `Calificacion`.
- **Portabilidad**: 433 registros con `portabilidad = 'Si'`. Se reflejan como
  `APROBADA` pero sin marca propia.
- **Bloqueos**: el legado los guarda por materia; el SIAC por ciclo + columna.
  No son equivalentes, no se migran — se configuran desde dirección.
- **Usuarios administrativos** del legado (19 en total): no se migran, el SIAC
  maneja sus propios roles.
- **Tabla `revalidante`**: no tiene equivalente en el schema. No se migra.
- **79 asignaciones duplicadas**: misma materia y grupo en el mismo ciclo con
  dos docentes distintos. `AsignacionMateria` solo admite una; se conservó la
  primera.

## Verificación

Después de correr la migración:

```sql
-- deben salir 63,164
SELECT COUNT(*) FROM "Calificacion" WHERE migrado = true;

-- kardex de un alumno
SELECT m.nombre, c."primerParcial", c."segundoParcial", c.promedio,
       c."examenFinal", c."notaFinal", c."notaDefinitiva", c.estatus
FROM "Calificacion" c
JOIN "Materia" m ON m.id = c."materiaId"
JOIN "Alumno" a ON a.id = c."alumnoId"
WHERE a.matricula = '2228306C'
ORDER BY m.nombre;
```

En la interfaz: entrar como SECRETARÍA → Alumnos, buscar cualquier matrícula y
abrir su kardex. Debe coincidir con el sistema viejo columna por columna.
