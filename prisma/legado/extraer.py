# -*- coding: utf-8 -*-
"""
Extrae los 3 dumps MariaDB del sistema legado CESZAM y produce los JSON
que consume prisma/migrar-legado.js.

Los dumps se leen directamente: NO hace falta levantar MySQL.
"""
import re, os, json, math, unicodedata, sys
from collections import defaultdict, Counter

DIR = os.environ.get('DUMPS_DIR', './dumps')
FILES = {'viejo': 'ceszam_viejo.sql', 'nuevo': 'ceszam_nuevo.sql', 'derecho': 'ceszam_derecho.sql'}
OUT = os.environ.get('OUT_DIR', './datos')
PREF = {'viejo': 'VIE', 'nuevo': 'NUE', 'derecho': 'DER'}

_cache = {}


def load(k):
    if k not in _cache:
        _cache[k] = open(os.path.join(DIR, FILES[k]), encoding='utf8', errors='replace').read()
    return _cache[k]


def table(k, t):
    """Parsea los INSERT INTO de una tabla respetando comillas y escapes."""
    txt = load(k)
    m = re.search(r'INSERT INTO `%s` \(([^)]*)\) VALUES' % t, txt)
    if not m:
        return [], []
    cols = [c.strip(' `') for c in m.group(1).split(',')]
    data = []
    for b in re.findall(r'INSERT INTO `%s` \([^)]*\) VALUES\s*(.*?);\s*\n' % t, txt, re.S):
        i, n = 0, len(b)
        while i < n:
            if b[i] == '(':
                j, q, buf = i + 1, False, ''
                while j < n:
                    ch = b[j]
                    if q:
                        if ch == '\\':
                            buf += b[j:j + 2]; j += 2; continue
                        if ch == "'":
                            q = False
                        buf += ch
                    else:
                        if ch == "'":
                            q = True; buf += ch
                        elif ch == ')':
                            break
                        else:
                            buf += ch
                    j += 1
                f, cur, q, kk = [], '', False, 0
                while kk < len(buf):
                    ch = buf[kk]
                    if q:
                        if ch == '\\':
                            cur += buf[kk + 1]; kk += 2; continue
                        if ch == "'":
                            q = False
                        else:
                            cur += ch
                    else:
                        if ch == "'":
                            q = True
                        elif ch == ',':
                            f.append(cur.strip()); cur = ''
                        else:
                            cur += ch
                    kk += 1
                f.append(cur.strip())
                data.append(f)
                i = j + 1
            else:
                i += 1
    return cols, data


def dicts(k, t):
    c, d = table(k, t)
    out = []
    for r in d:
        row = dict(zip(c, r))
        for key, v in list(row.items()):
            if v == 'NULL' or v == '':
                row[key] = None
        out.append(row)
    return out


def norm(s):
    s = unicodedata.normalize('NFD', s or '')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s).strip().upper()


def slug(s):
    s = norm(s)
    s = re.sub(r'[^A-Z0-9]+', '-', s).strip('-')
    return s[:60]


def matn(v):
    """El legado tiene matrículas capturadas en minúscula (2229895e vs 2229895E)."""
    return (v or '').strip().upper()


IGNORAR = {'DE', 'DEL', 'LA', 'LAS', 'EL', 'LOS', 'Y', 'A', 'EN'}


def sigla(nombre):
    """'TR. CIENCIAS SOCIALES Y HUM. 03-1' → 'TR-CSH-03-1'.

    El prefijo TR/AP y el número de área son parte de la identidad del
    grupo: sin ellos dos trayectorias distintas se verían igual.
    """
    n = norm(nombre)
    pre = ''
    if n.startswith('AREA PROP'):
        pre = 'AP'
        n = re.sub(r'^AREA PROP\.?', '', n)
    elif n.startswith('TR.') or n.startswith('TR '):
        pre = 'TR'
        n = re.sub(r'^TR\.?', '', n)
    num = ''
    m = re.search(r'(\d+(?:-\d+)?)\s*$', n)
    if m:
        num = m.group(1)
        n = n[:m.start()]
    letras = ''.join(p[0] for p in re.findall(r'[A-Z]+', n) if p not in IGNORAR)[:4]
    return '-'.join(x for x in (pre, letras, num) if x)


# ══════════════════════════════════════════════════════════════
# FÓRMULAS DEL KARDEX LEGADO
# Réplica exacta de las columnas GENERATED de MariaDB.
# El .5 SUBE de 6.5 en adelante y BAJA de 5.5 para abajo.
# ══════════════════════════════════════════════════════════════

MEDIOS = {9.5: 10, 8.5: 9, 7.5: 8, 6.5: 7, 5.5: 5, 4.5: 4, 3.5: 3, 2.5: 2, 1.5: 1, 0.5: 0}


def mnum(v):
    """Conversión varchar→número al estilo MySQL: 'NP' y basura valen 0."""
    if v is None:
        return None
    try:
        return float(v)
    except ValueError:
        return 0.0


def redondear(avg):
    if avg in MEDIOS:
        return MEDIOS[avg]
    return int(avg) if float(avg).is_integer() else int(round(avg))


def calc_promedio(pp, sp):
    if pp == 'NP':
        return None if sp is None else math.floor(mnum(sp) / 2)
    if sp == 'NP':
        return None if pp is None else math.floor(mnum(pp) / 2)
    if pp is None or sp is None:
        return None
    return redondear((mnum(pp) + mnum(sp)) / 2)


def calc_nota_final(prom, ef):
    if ef == 'NP':
        return None if prom is None else math.floor(prom / 2)
    if ef is None or prom is None:
        return None
    return redondear((prom + mnum(ef)) / 2)


CASCADA_ND = ['nota_por_articulo', 'recmtoDos_eer', 'recmtoDos_extra', 'recmtoDos_ord',
              'recmto_eer', 'recmto_extra', 'recmto_ord', 'especial', 'adicional',
              'extraordinario']


def calc_nd(r, nota_final):
    for c in CASCADA_ND:
        v = r.get(c)
        if v is not None:
            return v
    return None if nota_final is None else str(nota_final)


def ge6(v):
    return v is not None and mnum(v) >= 6


def calc_estatus(r, nota_final, nd):
    """Traduce el estatus legado al enum EstatusCalificacion del SIAC."""
    aprobado = (
        r.get('portabilidad') == 'Si'
        or ge6(r.get('nota_por_articulo'))
        or ge6(r.get('recmtoDos_eer')) or ge6(r.get('recmtoDos_extra')) or ge6(r.get('recmtoDos_ord'))
        or ge6(r.get('recmto_eer')) or ge6(r.get('recmto_extra')) or ge6(r.get('recmto_ord'))
        or ge6(r.get('especial')) or ge6(r.get('adicional')) or ge6(r.get('extraordinario'))
        or (nota_final is not None and nota_final >= 6)
    )
    if aprobado:
        return 'APROBADA'
    if nd == 'NP':
        return 'NO_PRESENTO'
    if nd is None:
        return 'EN_CURSO'
    return 'REPROBADA'


# ══════════════════════════════════════════════════════════════
# JERARQUÍA ACADÉMICA LEGADA
# viejo/derecho: nivel_academico → bachillerato → semestre → grupo
# nuevo:         nivel_academico → turno → bachillerato → semestre → grupo
# ══════════════════════════════════════════════════════════════

NUM_SEM = {'PRIMER SEMESTRE': 1, 'SEGUNDO SEMESTRE': 2, 'TERCER SEMESTRE': 3,
           'CUARTO SEMESTRE': 4, 'QUINTO SEMESTRE': 5, 'SEXTO SEMESTRE': 6,
           'SEPTIMO SEMESTRE': 7, 'OCTAVO SEMESTRE': 8, 'NOVENO SEMESTRE': 9,
           'DECIMO SEMESTRE': 10}


def nivel_de(nombre):
    n = norm(nombre)
    if n.startswith('PREP') or n.startswith('PREPRAT'):
        return 'PREPA'
    return 'UNIV'


def construir(k):
    """Devuelve dict id_grupo → contexto académico completo."""
    ciclos = {r['id_ciclo']: r for r in dicts(k, 'ciclo')}
    niveles = {r['id_nivelAcademico']: r for r in dicts(k, 'nivel_academico')}
    turnos = {r['id_turno']: r for r in dicts(k, 'turno')}
    bach = {}
    for r in dicts(k, 'bachillerato'):
        if 'id_turno' in r and r.get('id_turno') is not None:
            t = turnos.get(r['id_turno'], {})
            n = niveles.get(t.get('id_nivelAcademico'), {})
            turno = t.get('nombre')
        else:
            n = niveles.get(r.get('id_nivelAcademico'), {})
            turno = n.get('turno')
        cic = ciclos.get(n.get('id_ciclo'), {})
        bach[r['id_bachillerato']] = {
            'ciclo': cic.get('nombre'), 'cicloIni': cic.get('fecha_inicio'), 'cicloFin': cic.get('fecha_fin'),
            'nivel': nivel_de(n.get('nombre')), 'turno': norm(turno) or 'MATUTINO',
            'tray': norm(r['nombre']),
        }
    sem = {}
    for r in dicts(k, 'semestre'):
        b = bach.get(r['id_bachillerato'])
        if b:
            sem[r['id_semestre']] = dict(b, semNombre=norm(r['nombre']),
                                         semNum=NUM_SEM.get(norm(r['nombre'])))
    gru = {}
    for r in dicts(k, 'grupo'):
        s = sem.get(r['id_semestre'])
        if s:
            gru[r['id_grupo']] = dict(s, letra=r['nombre'])
    return gru


# ══════════════════════════════════════════════════════════════

CARRERA = {'PREPA': ('Bachillerato General', 6), 'UNIV': ('Licenciatura en Derecho', 9)}
PROGRAMA = {'PREPA': 'Preparatoria', 'UNIV': 'Universidad'}
TRONCO = {'TRONCO COMUN'}

TIPOS = [
    ('materia', 'id_materia', 'OBLIGATORIA', 'calificacion', 'asistencia', 'MAT'),
    ('mat_complementaria', 'id_mat_compl', 'COMPLEMENTARIA', 'cal_mat_compl', 'asist_mat_compl', 'MCO'),
    ('extracurricular', 'id_extracurr', 'EXTRACURRICULAR', 'cal_extracurricular', 'asist_extracurricular', 'MEX'),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    rep = Counter()
    avisos = []

    ciclos, trayectorias, semestres, grupos, materias = {}, {}, {}, {}, {}
    docentes, alumnos = {}, {}
    asignaciones, inscripciones = {}, {}
    calificaciones, asistencias, observaciones = {}, {}, []
    descartes = []

    # ---- docentes: se deduplican por nombre normalizado (son las mismas personas)
    doc_de = {}
    for k in FILES:
        for r in dicts(k, 'maestro'):
            full = norm((r.get('nombre') or '') + ' ' + (r.get('apellidos') or ''))
            key = 'DOC-' + slug(full)
            doc_de[(k, r['id_maestro'])] = key
            if key not in docentes:
                docentes[key] = {
                    'legacyId': key,
                    'nombre': ' '.join(x for x in [r.get('grado'), r.get('nombre'), r.get('apellidos')] if x),
                    'usuario': r.get('usuario'), 'email': r.get('email'),
                    'telefono': r.get('tel_celular') or r.get('tel_casa'),
                    'curp': r.get('curp'),
                }

    # ---- estructura + materias + calificaciones
    for k in FILES:
        ctx = construir(k)

        for tabla, idcol, tipo, caltab, asistab, mp in TIPOS:
            mat_ctx = {}
            for r in dicts(k, tabla):
                g = ctx.get(r['id_grupo'])
                if not g:
                    rep['materia_sin_grupo'] += 1
                    continue

                niv = g['nivel']
                carrera, totsem = CARRERA[niv]

                # ciclo
                if g['ciclo'] and g['ciclo'] not in ciclos:
                    ciclos[g['ciclo']] = {'nombre': g['ciclo'], 'fechaInicio': g['cicloIni'],
                                          'fechaFin': g['cicloFin']}
                # trayectoria
                tclave = '%s-%s' % (niv, slug(g['tray']))
                if tclave not in trayectorias:
                    trayectorias[tclave] = {'clave': tclave, 'nombre': g['tray'], 'nivelClave': niv}
                # semestre (catálogo, por carrera)
                sid = 'SEM-%s-%s' % (niv, g['semNum'])
                if g['semNum'] and sid not in semestres:
                    semestres[sid] = {'legacyId': sid, 'nombre': g['semNombre'],
                                      'numero': g['semNum'], 'carreraNombre': carrera}
                # grupo (se fusionan los de distintos ciclos: el ciclo vive en Inscripcion)
                es_tronco = g['tray'] in TRONCO
                gid = 'GRP-%s-%s-%s-%s-%s' % (niv, g['semNum'], slug(g['tray']), g['turno'][:3], g['letra'])
                if gid not in grupos:
                    nombre = '%s%s' % (g['semNum'], g['letra'])
                    if not es_tronco:
                        nombre += ' ' + sigla(g['tray'])
                    elif niv == 'UNIV':
                        # sin esto "1A vespertino" de prepa y de Derecho
                        # se ven idénticos en las listas
                        nombre += ' DER'
                    grupos[gid] = {'legacyId': gid, 'nombre': nombre,
                                   'turnoClave': g['turno'][:3], 'semestreLegacyId': sid}
                # materia (catálogo deduplicado por carrera+semestre+tipo+nombre)
                mid = 'MAT-%s-%s-%s-%s' % (niv, g['semNum'], mp, slug(r['nombre']))
                if mid not in materias:
                    materias[mid] = {'legacyId': mid, 'nombre': norm(r['nombre']),
                                     'tipo': tipo, 'tipoEvaluacion': 'NUMERICA',
                                     'semestreLegacyId': sid,
                                     'trayectoriaClave': None if es_tronco else tclave}
                mat_ctx[r[idcol]] = (mid, gid, g)

                # asignación docente
                d = doc_de.get((k, r.get('id_maestro')))
                if d and g['ciclo']:
                    akey = (mid, gid, g['ciclo'])
                    if akey not in asignaciones:
                        asignaciones[akey] = {'materiaLegacyId': mid, 'grupoLegacyId': gid,
                                              'cicloNombre': g['ciclo'], 'docenteLegacyId': d}
                    else:
                        rep['asignacion_duplicada'] += 1

            # calificaciones de este tipo de materia
            for r in dicts(k, caltab):
                mc = mat_ctx.get(r[idcol])
                if not mc:
                    rep['calif_huerfana'] += 1
                    continue
                mid, gid, g = mc
                mat = matn(r['matricula'])
                ciclo = g['ciclo']
                key = (mat, mid, ciclo)

                prom = calc_promedio(r.get('primer_parcial'), r.get('segundo_parcial'))
                nf = calc_nota_final(prom, r.get('examen_final'))
                nd = calc_nd(r, nf)

                fila = {
                    'matricula': mat, 'materiaLegacyId': mid, 'cicloNombre': ciclo,
                    'primerParcial': r.get('primer_parcial'),
                    'segundoParcial': r.get('segundo_parcial'),
                    'promedio': None if prom is None else str(prom),
                    'examenFinal': r.get('examen_final'),
                    'notaFinal': None if nf is None else str(nf),
                    'extraordinario': r.get('extraordinario'),
                    'adicional': r.get('adicional'),
                    'especial': r.get('especial'),
                    'articulo': r.get('articulo'),
                    'notaDefinitiva': nd,
                    'estatus': calc_estatus(r, nf, nd),
                    'origen': k,
                }
                if key in calificaciones:
                    # gana el dump más reciente; el descartado se reporta
                    prev = calificaciones[key]
                    if k in ('nuevo', 'derecho') and prev['origen'] == 'viejo':
                        descartes.append(dict(prev, motivo='reemplazada por ' + k))
                        calificaciones[key] = fila
                    else:
                        descartes.append(dict(fila, motivo='duplicada, se conservó ' + prev['origen']))
                    rep['calif_duplicada'] += 1
                else:
                    calificaciones[key] = fila

                # inscripción implícita
                ik = (mat, ciclo)
                if ik not in inscripciones:
                    inscripciones[ik] = {'matricula': mat, 'cicloNombre': ciclo,
                                         'grupoLegacyId': gid, 'semestreNumero': g['semNum'],
                                         'orden': ciclo or ''}
                # observaciones del kardex
                for campo, tit in (('observaciones', 'Observación de kardex'),
                                   ('observaciones_direccion', 'Observación de dirección')):
                    if r.get(campo):
                        observaciones.append({'matricula': mat, 'materiaLegacyId': mid,
                                              'titulo': tit, 'descripcion': r[campo]})

            # asistencia mensual
            for r in dicts(k, asistab):
                mc = mat_ctx.get(r[idcol])
                if not mc:
                    rep['asist_huerfana'] += 1
                    continue
                mid, gid, g = mc
                key = (matn(r['matricula']), mid, g['ciclo'])
                if key in asistencias:
                    rep['asist_duplicada'] += 1
                    continue

                def i(v):
                    try:
                        return int(v)
                    except (TypeError, ValueError):
                        return 0
                asis = [i(r.get('asis_mes%d' % n)) for n in (1, 2, 3, 4)]
                tot = [i(r.get('cantidad_de_clases_mes%d' % n)) for n in (1, 2, 3, 4)]
                faltas = [max(0, tot[n] - asis[n]) for n in range(4)]
                st, sf = sum(tot), sum(faltas)
                asistencias[key] = {
                    'matricula': matn(r['matricula']), 'materiaLegacyId': mid, 'cicloNombre': g['ciclo'],
                    'asisMes1': asis[0], 'asisMes2': asis[1], 'asisMes3': asis[2], 'asisMes4': asis[3],
                    'faltasMes1': faltas[0], 'faltasMes2': faltas[1],
                    'faltasMes3': faltas[2], 'faltasMes4': faltas[3],
                    'porcentaje': round(sf * 100.0 / st, 1) if st else None,
                }

        # alumnos
        for r in dicts(k, 'alumno'):
            m = matn(r['matricula'])
            prev = alumnos.get(m)
            if prev and k == 'viejo':
                continue  # gana el dump más reciente
            alumnos[m] = {
                'matricula': m, 'legacyId': 'ALU-' + m,
                'nombre': (r.get('nombre') or '').strip(),
                'apellidos': (r.get('apellidos') or '').strip(),
                'email': r.get('email'), 'curp': r.get('curp'),
                'direccion': r.get('direccion'),
                'telefono': r.get('tel_celular') or r.get('tel_casa'),
                'fechaNacimiento': r.get('fecha_nacimiento'),
                'ciudad': r.get('lugar_nacimiento'),
                'codigoPostal': str(r['cp']) if r.get('cp') else None,
                'sexo': r.get('sexo'),
                'tutorNombre': r.get('tutor'), 'tutorTelefono': r.get('tutor_celular'),
                'fechaBaja': r.get('fecha_de_baja'),
                'estatusAcademico': 'BAJA_DEFINITIVA' if (r.get('situacion_academica') == 'BAJA'
                                                          or r.get('fecha_de_baja')) else 'ACTIVO',
                'situacionLegado': r.get('situacion_academica'),
                'origen': k,
            }

    # grupo/carrera/trayectoria vigentes = los de su inscripción más reciente
    porAlumno = defaultdict(list)
    for (mat, ciclo), ins in inscripciones.items():
        porAlumno[mat].append(ins)
    for mat, lista in porAlumno.items():
        lista.sort(key=lambda x: x['orden'])
        ult = lista[-1]
        a = alumnos.get(mat)
        if not a:
            rep['inscripcion_sin_alumno'] += 1
            continue
        g = grupos.get(ult['grupoLegacyId'], {})
        niv = ult['grupoLegacyId'].split('-')[1]
        a['grupoLegacyId'] = ult['grupoLegacyId']
        a['carreraNombre'] = CARRERA[niv][0]
        a['programaNombre'] = PROGRAMA[niv]
        sem = semestres.get(g.get('semestreLegacyId'), {})
        tray = materias  # placeholder
        a['trayectoriaClave'] = None

    # trayectoria vigente del alumno: la del grupo más reciente que no sea tronco común
    for mat, lista in porAlumno.items():
        a = alumnos.get(mat)
        if not a:
            continue
        for ins in reversed(lista):
            partes = ins['grupoLegacyId'].split('-', 3)
            tslug = partes[3].rsplit('-', 2)[0] if len(partes) > 3 else ''
            clave = '%s-%s' % (partes[1], tslug)
            if clave in trayectorias and trayectorias[clave]['nombre'] not in TRONCO:
                a['trayectoriaClave'] = clave
                break

    # alumnos que se dieron de baja sin llegar a tener calificaciones: no
    # tienen inscripción de dónde deducir la carrera, se toma del dump.
    for mat, a in alumnos.items():
        if not a.get('carreraNombre'):
            niv = 'UNIV' if a['origen'] == 'derecho' else 'PREPA'
            a['carreraNombre'] = CARRERA[niv][0]
            a['programaNombre'] = PROGRAMA[niv]
            a.setdefault('grupoLegacyId', None)
            a.setdefault('trayectoriaClave', None)
            rep['alumno_sin_kardex'] += 1
        a.pop('origen', None)

    catalogos = {
        'niveles': [{'clave': 'PREPA', 'nombre': 'Preparatoria'},
                    {'clave': 'UNIV', 'nombre': 'Universidad'}],
        'turnos': [{'clave': 'MAT', 'nombre': 'Matutino'},
                   {'clave': 'VES', 'nombre': 'Vespertino'}],
        'programas': [{'nombre': PROGRAMA['PREPA'], 'nivelClave': 'PREPA'},
                      {'nombre': PROGRAMA['UNIV'], 'nivelClave': 'UNIV'}],
        'carreras': [{'nombre': CARRERA['PREPA'][0], 'totalSemestres': 6, 'programaNombre': PROGRAMA['PREPA']},
                     {'nombre': CARRERA['UNIV'][0], 'totalSemestres': 9, 'programaNombre': PROGRAMA['UNIV']}],
    }

    LOTE = 20000  # los archivos se parten para no rebasar límites de transferencia

    def dump(nombre, datos):
        for viejo in os.listdir(OUT):
            if viejo.startswith(nombre + '.part') or viejo == nombre + '.json':
                os.remove(os.path.join(OUT, viejo))
        if isinstance(datos, list) and len(datos) > LOTE:
            partes = [datos[i:i + LOTE] for i in range(0, len(datos), LOTE)]
            tam = 0
            for n, parte in enumerate(partes, 1):
                p = os.path.join(OUT, '%s.part%02d.json' % (nombre, n))
                with open(p, 'w', encoding='utf8') as f:
                    json.dump(parte, f, ensure_ascii=False, separators=(',', ':'))
                tam += os.path.getsize(p)
            print('  %-18s %7d  (%.1f MB en %d partes)' % (nombre, len(datos), tam / 1e6, len(partes)))
            return
        p = os.path.join(OUT, nombre + '.json')
        with open(p, 'w', encoding='utf8') as f:
            json.dump(datos, f, ensure_ascii=False, separators=(',', ':'))
        print('  %-18s %7d  (%.1f MB)' % (nombre, len(datos), os.path.getsize(p) / 1e6))

    print('\nArchivos generados en %s:' % OUT)
    dump('catalogos', catalogos)
    dump('ciclos', sorted(ciclos.values(), key=lambda x: x['nombre']))
    dump('trayectorias', list(trayectorias.values()))
    dump('semestres', list(semestres.values()))
    dump('grupos', list(grupos.values()))
    dump('materias', list(materias.values()))
    dump('docentes', list(docentes.values()))
    dump('alumnos', list(alumnos.values()))
    dump('asignaciones', list(asignaciones.values()))
    dump('inscripciones', [{k2: v for k2, v in i.items() if k2 != 'orden'}
                           for i in inscripciones.values()])
    dump('calificaciones', [{k2: v for k2, v in c.items() if k2 != 'origen'}
                            for c in calificaciones.values()])
    dump('asistencias', list(asistencias.values()))
    dump('observaciones', observaciones)

    if descartes:
        import csv
        p = os.path.join(OUT, 'descartadas.csv')
        with open(p, 'w', newline='', encoding='utf8') as f:
            w = csv.DictWriter(f, fieldnames=list(descartes[0].keys()))
            w.writeheader()
            w.writerows(descartes)
        print('  %-18s %7d  → revisar %s' % ('descartadas', len(descartes), p))

    print('\nIncidencias:')
    for k2, v in sorted(rep.items()):
        print('   %-24s %d' % (k2, v))
    if not rep:
        print('   ninguna')


if __name__ == '__main__':
    main()
