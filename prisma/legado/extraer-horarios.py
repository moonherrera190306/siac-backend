# -*- coding: utf-8 -*-
"""
Convierte los Excel de horarios del ciclo 2026-2027 en datos/horarios.json,
que consume prisma/migrar-horarios.js.

Dos hojas del mismo libro:
  HORARIOS CON 7_7_7 → horario POR GRUPO (la celda dice qué materia)
  HORARIOS LAB       → ocupación POR AULA (la celda dice qué grupo)

De la segunda salen las aulas de laboratorio: si un grupo aparece ahí en un
día y hora, esa sesión se marca en ese laboratorio.
"""
import re, os, json, unicodedata, datetime, difflib
from collections import Counter, defaultdict

import openpyxl

LIBRO = os.environ.get('LIBRO_HORARIOS', './horarios/HORARIO COMPLETO 26  27.xlsx')
DATOS = os.environ.get('OUT_DIR', './datos')
CICLO = os.environ.get('CICLO_HORARIOS', '2026-2027')
NIVEL = 'PREPA'

DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES']
DUR = 50  # minutos por sesión


def norm(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^A-Z0-9 ]', ' ', s.upper())
    return re.sub(r'\s+', ' ', s).strip()


def slug(s):
    return re.sub(r'[^A-Z0-9]+', '-', norm(s)).strip('-')[:60]


# ── horas ─────────────────────────────────────────────────────

def hhmm(t):
    return '%02d:%02d' % (t.hour, t.minute)


def suma(h, minutos):
    base = datetime.datetime(2000, 1, 1, int(h[:2]), int(h[3:]))
    return (base + datetime.timedelta(minutes=minutos)).strftime('%H:%M')


def parse_hora(v):
    """Devuelve (inicio, fin) en 24h. El matutino trae un `time`; el
    vespertino trae la cadena '3:00 pm. 3:50 pm.' con las dos horas."""
    if isinstance(v, datetime.time):
        i = hhmm(v)
        return i, suma(i, DUR)
    if isinstance(v, datetime.datetime):
        i = hhmm(v.time())
        return i, suma(i, DUR)
    s = str(v or '')
    horas = re.findall(r'(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?', s, re.I)
    if not horas:
        return None
    def a24(h, m, ind):
        h = int(h)
        pm = (ind or '').lower().startswith('p')
        # sin indicador: 1..6 en un horario escolar es tarde
        if pm or (not ind and 1 <= h <= 6):
            if h != 12:
                h += 12
        return '%02d:%02d' % (h, int(m))
    i = a24(*horas[0])
    f = a24(*horas[1]) if len(horas) > 1 else suma(i, DUR)
    return i, f


# ── identificación de grupos ──────────────────────────────────

# El guion es significativo: '11-1' y '11' son secciones distintas, así que
# esta normalización lo conserva (norm() lo convertiría en espacio).
def norm_sec(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^A-Z0-9\- ]', ' ', s.upper())
    return re.sub(r'\s+', ' ', s).strip()


SEC = re.compile(r'(\d{2}\s*-\s*\d|\d{2})\s*$')


def parse_grupo(titulo):
    """'3° B TRAYECTORIA ASOCIADA DERECHO Y FILOSOFIA SEC 03' →
       (semestre 3, letra 'B', turno 'MAT', tipo 'TR', seccion '03')"""
    t = norm(titulo)
    m = re.match(r'(\d)\s*(?:º|°)?\s*([A-H])?\b', t)
    if not m:
        return None
    sem = int(m.group(1))
    letra = m.group(2) or 'A'
    turno = 'VES' if 'VESPERTINO' in t else 'MAT'
    if 'AREA PROPEDEUTICA' in t or 'AREA PROP' in t:
        tipo = 'AP'
    elif 'TRAYECTORIA' in t:
        tipo = 'TR'
    else:
        tipo = None
    sec = None
    if tipo:
        ms = SEC.search(norm_sec(titulo))
        sec = re.sub(r'\s*', '', ms.group(1)) if ms else None
    return {'semestre': sem, 'letra': letra, 'turno': turno,
            'tipo': tipo, 'seccion': sec, 'titulo': titulo.strip()}


def etiqueta_lab(txt):
    """'3ºF HIST.SOC.2' → (3, 'F').  '5° D MAT.Y SUST' → (5, 'D')"""
    m = re.match(r'\s*(\d)\s*(?:º|°)\s*([A-H])\b', str(txt or ''))
    return (int(m.group(1)), m.group(2)) if m else None


# ── lectura del libro ─────────────────────────────────────────

def bloques(ws, etiqueta):
    out, r = [], 1
    while r <= ws.max_row:
        v = ws.cell(r, 2).value
        if isinstance(v, str) and norm(v).startswith(etiqueta):
            titulo = next((str(ws.cell(r, c).value) for c in range(3, 8)
                           if ws.cell(r, c).value), '')
            filas, rr = [], r + 2
            while rr <= ws.max_row:
                h = ws.cell(rr, 2).value
                if h is None or (isinstance(h, str) and norm(h).startswith(('GRUPO', 'AULA', 'HORA'))):
                    break
                filas.append((h, [ws.cell(rr, c).value for c in range(3, 8)]))
                rr += 1
            out.append((titulo.strip(), filas))
            r = rr
        else:
            r += 1
    return out


def main():
    wb = openpyxl.load_workbook(LIBRO, data_only=True)
    porGrupo = bloques(wb['HORARIOS CON 7_7_7'], 'GRUPO')
    porAula = bloques(wb['HORARIOS LAB'], 'AULA')

    # ── aulas de laboratorio: (semestre, letra, dia, horaInicio) → aula
    aulas = {}
    for titulo, filas in porAula:
        aula = re.sub(r'^LABORATORIO DE\s*', 'Lab. ', titulo.strip(), flags=re.I).title()
        aula = aula.replace('Lab. ', 'Lab. ')
        for h, celdas in filas:
            hp = parse_hora(h)
            if not hp:
                continue
            for i, c in enumerate(celdas):
                if not c or norm(c) == 'RECESO':
                    continue
                for parte in str(c).split('\n'):
                    et = etiqueta_lab(parte)
                    if et:
                        aulas[(et[0], et[1], DIAS[i], hp[0])] = aula

    # ── puente con lo ya migrado ──────────────────────────────
    # La sección ('02', '11-1', …) es la llave: identifica la trayectoria
    # aunque el nombre venga escrito distinto en cada archivo.
    trayMigradas = json.load(open(os.path.join(DATOS, 'trayectorias.json'), encoding='utf8'))
    gruposMigrados = {g['legacyId']: g for g in
                      json.load(open(os.path.join(DATOS, 'grupos.json'), encoding='utf8'))}

    porSeccion = {}
    for t in trayMigradas:
        if not t['clave'].startswith(NIVEL + '-'):
            continue
        resto = t['clave'][len(NIVEL) + 1:]
        ms = re.search(r'(\d{2}(?:-\d)?)$', resto)
        if not ms:
            continue
        tipo = 'AP' if resto.startswith('AREA-PROP') else 'TR' if resto.startswith('TR-') else None
        if tipo:
            porSeccion[(tipo, ms.group(1))] = t['clave']

    # ── catálogo de materias ya migradas, por semestre
    materias = json.load(open(os.path.join(DATOS, 'materias.json'), encoding='utf8'))
    porSem = defaultdict(dict)
    for m in materias:
        s = m['semestreLegacyId']
        n = int(s.rsplit('-', 1)[1]) if s else None
        porSem[n][norm(m['nombre'])] = m
    todos = sorted({norm(m['nombre']) for m in materias})

    # Un laboratorio NO es la clase teórica: 'LAB.FISICA' no debe empatar con
    # la materia 'FISICA'. Se tratan como materias propias y se unifican las
    # variantes de escritura (LAB.FIS. / LAB QUIM. / LAB.QUIM.).
    MATERIA_LAB = [('FIS', 'FISICA'), ('QUIM', 'QUIMICA'), ('BIO', 'BIOLOGIA'),
                   ('COMP', 'COMPUTO'), ('DIB', 'DIBUJO TECNICO')]

    def es_lab(a):
        m = re.match(r'^LAB\b\.?\s*(.*)$', a)
        if not m:
            return None
        resto = m.group(1).strip()
        for pre, completo in MATERIA_LAB:
            if resto.startswith(pre):
                return 'LAB DE ' + completo
        return 'LAB ' + resto if resto else None

    def empatar(abbr, sem):
        """La celda trae abreviaturas ('GRAM. ESP.'). Se busca la materia
        real cuyos tokens empiecen igual, primero en el mismo semestre."""
        a = norm(abbr)
        lab = es_lab(a)
        if lab:
            return lab, 'laboratorio'
        for cand in (porSem[sem].keys(), todos):
            if a in cand:
                return a, 'exacto'
        mejor, punt = None, 0
        for n in list(porSem[sem].keys()) + todos:
            ta, tn = a.split(), n.split()
            if len(ta) > len(tn):
                continue
            i, okk = 0, True
            for x in ta:
                while i < len(tn) and not tn[i].startswith(x[:4]):
                    i += 1
                if i >= len(tn):
                    okk = False
                    break
                i += 1
            if okk:
                p = difflib.SequenceMatcher(None, a, n).ratio() + 0.3
                if n in porSem[sem]:
                    p += 0.2
                if p > punt:
                    mejor, punt = n, p
        if mejor:
            return mejor, 'abreviatura'
        c = difflib.get_close_matches(a, todos, n=1, cutoff=0.6)
        if c:
            return c[0], 'aproximado'
        return a, 'nueva'

    # ── recorrido principal
    grupos, trayectorias, matNuevas, sesiones = {}, {}, {}, []
    mapeo, sinGrupo = [], []

    for titulo, filas in porGrupo:
        g = parse_grupo(titulo)
        if not g:
            sinGrupo.append(titulo)
            continue
        sem = g['semestre']

        if g['tipo'] and g['seccion']:
            tclave = porSeccion.get((g['tipo'], g['seccion']))
            if not tclave:
                # sección que no existía en el legado (AP 11-2, TR 11-3)
                tclave = '%s-%s-SEC-%s' % (NIVEL, g['tipo'], g['seccion'])
                trayectorias.setdefault(tclave, {
                    'clave': tclave, 'nivelClave': NIVEL,
                    'nombre': re.sub(r'^\d\s*(?:º|°)?\s*[A-H]?\s*', '', titulo).strip(),
                })
        else:
            tclave = '%s-TRONCO-COMUN' % NIVEL

        # mismo esquema de id que la migración: así el horario se cuelga de
        # los grupos que ya existen en vez de duplicarlos
        gid = 'GRP-%s-%s-%s-%s-%s' % (NIVEL, sem, tclave[len(NIVEL) + 1:], g['turno'], g['letra'])
        if gid in gruposMigrados:
            nombre = gruposMigrados[gid]['nombre']
        else:
            nombre = '%s%s' % (sem, g['letra'])
            if not tclave.endswith('TRONCO-COMUN'):
                nombre += ' %s-%s' % (g['tipo'], g['seccion'])
        grupos.setdefault(gid, {
            'legacyId': gid, 'nombre': nombre, 'turnoClave': g['turno'],
            'semestre': sem, 'trayectoriaClave': tclave, 'titulo': titulo.strip(),
            'yaExiste': gid in gruposMigrados,
        })

        for h, celdas in filas:
            hp = parse_hora(h)
            if not hp:
                continue
            for i, c in enumerate(celdas):
                if not c or norm(c) in ('RECESO', ''):
                    continue
                nombreReal, como = empatar(c, sem)
                mid = 'MAT-%s-%s-MAT-%s' % (NIVEL, sem, slug(nombreReal))
                if nombreReal not in porSem[sem]:
                    matNuevas.setdefault(mid, {
                        'legacyId': mid, 'nombre': nombreReal, 'tipo': 'OBLIGATORIA',
                        'tipoEvaluacion': 'NUMERICA', 'semestre': sem,
                        'trayectoriaClave': tclave,
                    })
                mapeo.append({'celda': str(c).strip(), 'materia': nombreReal,
                              'semestre': sem, 'como': como})
                sesiones.append({
                    'grupoLegacyId': gid, 'materiaLegacyId': mid,
                    'dia': DIAS[i], 'horaInicio': hp[0], 'horaFin': hp[1],
                    'aula': aulas.get((sem, g['letra'], DIAS[i], hp[0])),
                })

    # choques: el mismo grupo con dos materias a la misma hora
    ch = Counter((s['grupoLegacyId'], s['dia'], s['horaInicio']) for s in sesiones)
    choques = [k for k, v in ch.items() if v > 1]

    os.makedirs(DATOS, exist_ok=True)
    salida = {
        'ciclo': CICLO,
        'trayectorias': list(trayectorias.values()),
        'grupos': list(grupos.values()),
        'materiasNuevas': list(matNuevas.values()),
        'sesiones': sesiones,
    }
    with open(os.path.join(DATOS, 'horarios.json'), 'w', encoding='utf8') as f:
        json.dump(salida, f, ensure_ascii=False, separators=(',', ':'))

    # reporte revisable de cómo se interpretó cada abreviatura
    import csv
    vistos = {}
    for m in mapeo:
        vistos[(m['celda'], m['semestre'])] = m
    with open(os.path.join(DATOS, 'horarios-materias.csv'), 'w', newline='', encoding='utf8') as f:
        w = csv.DictWriter(f, fieldnames=['celda', 'semestre', 'materia', 'como'])
        w.writeheader()
        for v in sorted(vistos.values(), key=lambda x: (x['como'], x['celda'])):
            w.writerow(v)

    c = Counter(m['como'] for m in vistos.values())
    reuso = sum(1 for g in grupos.values() if g['yaExiste'])
    print('Ciclo:            %s' % CICLO)
    print('Grupos:           %d  (%d ya existían, %d nuevos)' % (len(grupos), reuso, len(grupos) - reuso))
    print('Trayectorias nuevas: %d' % len(trayectorias))
    print('Materias nuevas:  %d' % len(matNuevas))
    print('Sesiones:         %d' % len(sesiones))
    print('  con aula de lab: %d' % sum(1 for s in sesiones if s['aula']))
    print('\nInterpretación de las celdas: %s' % dict(c))
    print('  revisar datos/horarios-materias.csv')
    if choques:
        print('\n⚠ CHOQUES (mismo grupo, dos materias a la misma hora): %d' % len(choques))
        for k in choques[:10]:
            print('   ', k)
    if sinGrupo:
        print('\n⚠ bloques sin grupo reconocible:', sinGrupo)


if __name__ == '__main__':
    main()
