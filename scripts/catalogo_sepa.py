"""Ingesta diaria del catálogo global de productos desde el paquete SEPA (Precios Claros).

Uso: python -I scripts/catalogo_sepa.py [--env ARCHIVO] [--archivo ZIP] [--seco]
                                        [--volcar RUTA.jsonl] [--autotest]

La publicación es todo-o-nada (publicar_catalogo, migración 20261029180000). Fuente SEPA,
CC BY 4.0: hay que atribuir. Salida: 0 publicada o sin novedad, 1 rechazada por regla,
2 error, 3 ya hay una corrida en curso.
"""

import argparse
import datetime
import glob
import hashlib
import io
import json
import os
import re
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from decimal import Decimal

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = 'sepa'
CKAN_URL = 'https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios'
HOST_DATOS = 'datos.produccion.gob.ar'
UA = 'catalogo-sepa/1.0'
# Argentina no usa horario de verano desde 2009; sin zoneinfo porque Windows no trae la base tz.
TZ_ARG = datetime.timezone(datetime.timedelta(hours=-3))
MB, GB = 2 ** 20, 2 ** 30
TAM_ZIP_MIN, TAM_ZIP_MAX = 50 * MB, GB
TAM_PRODUCTOS_MAX = 3 * GB
RAZON_MAX = 200
TOTAL_PRODUCTOS_MAX = 10 * GB
INTERNOS_MAX = 100
COLUMNAS = ('id_producto', 'productos_ean', 'productos_descripcion', 'productos_cantidad_presentacion',
            'productos_unidad_medida_presentacion', 'productos_marca')
CONTADORES = ('lineas', 'malformadas', 'gtin', 'gtin_invalidos', 'restringidos')
MAX_MALFORMADAS_PCT = 1
MAX_GTIN_INVALIDOS_PCT = 20
NOMBRE_MAX = 80
CANTIDAD_MAX = 100000
LOTE = 5000

# Incluye C1 y U+2028/2029: también son [[:cntrl:]] en el CHECK de la base.
RE_CONTROL = re.compile(r'[\x00-\x1f\x7f-\x9f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]')
RE_PREFIJO = re.compile(r'([A-Za-z]{2,6}):\s*')
# Código de envase al final (" BOT-750-ml", " PAQ-20-gr"): lo agregan algunas cadenas y no es parte del nombre.
RE_CODIGO = re.compile(r'(?:\s[A-Z]{2,5}-[0-9]+(?:[.,][0-9]+)?-[A-Za-z][A-Za-z0-9]{0,3}\.?)+$')
RE_DIGITOS = re.compile(r'[0-9]+')
RE_GTIN = re.compile(r'[0-9]{8}|[0-9]{13}')
RE_CANTIDAD = re.compile(r'[0-9]+(\.[0-9]*)?|\.[0-9]+')
RE_INTERNO = re.compile(r'sepa_[12]_comercio-sepa-([0-9]+)_.*\.zip')
RE_FECHA = re.compile(r'[0-9]{4}-[0-9]{2}-[0-9]{2}')

# Tabla fija de la fuente: unidad -> (medida, factor a ml, g o un).
UNIDADES = {
    'ml': ('ml', 1), 'ml.': ('ml', 1), 'cc': ('ml', 1), 'cc.': ('ml', 1), 'cm3': ('ml', 1), 'cmq': ('ml', 1),
    'cl': ('ml', 10), 'l': ('ml', 1000), 'lt': ('ml', 1000), 'lt.': ('ml', 1000), 'ltr': ('ml', 1000),
    'lts': ('ml', 1000), 'litro': ('ml', 1000), 'litros': ('ml', 1000), 'dm3': ('ml', 1000),
    'g': ('g', 1), 'gr': ('g', 1), 'gr.': ('g', 1), 'grm': ('g', 1), 'grs': ('g', 1),
    'kg': ('g', 1000), 'kgm': ('g', 1000), 'kgr': ('g', 1000), 'kgs': ('g', 1000),
    **{u: ('un', 1) for u in ('un', 'un.', 'uni', 'uni.', 'unid', 'unida', 'unidad', 'unidades', 'ud', 'ea')},
}
# Valores comodín de la fuente, comparados en mayúsculas y sin espacios.
MARCAS_NULAS = {''.join(m.upper().split()) for m in (
    '', 'SIN MARCA', 'S/D', 'S/M', 'S/MARCA', 'SM', 'GENERICO', 'GENÉRICO', '-', '.', 'N/A', 'NA',
    'SIN DATO', 'SIN DATOS')}


class ErrorCorrida(Exception):
    """Falla que corta la corrida con código 2."""


def canonico(bruto):
    digitos = bruto.strip()
    if not RE_DIGITOS.fullmatch(digitos):
        return None
    sig = digitos.lstrip('0')
    if len(sig) > 13:
        return None
    return sig.zfill(8) if len(sig) <= 8 else sig.zfill(13)


def gtin_ok(canon):
    # Pesos 3 y 1 desde la derecha (GS1); el relleno con ceros no cambia la suma.
    if not RE_GTIN.fullmatch(canon):
        return False
    suma = sum(int(d) * (3 if p % 2 else 1) for p, d in enumerate(reversed(canon[:-1]), 1))
    return (10 - suma % 10) % 10 == int(canon[-1])


def restringido(canon):
    # Códigos internos de cada cadena (balanza, uso propio): se excluyen sin contarlos como inválidos.
    if len(canon) == 13:
        return canon.startswith(('2', '02', '04'))
    return canon.startswith(('0', '2'))


def sanear(texto):
    return ' '.join(RE_CONTROL.sub(' ', unicodedata.normalize('NFC', texto)).split())


def descripcion_limpia(texto):
    t = RE_CODIGO.sub('', sanear(texto))
    m = RE_PREFIJO.match(t)
    if m:
        t = t[m.end():]
        cadena = m.group(1)
        if t[:len(cadena) + 1].upper() == cadena.upper() + ' ':
            t = t[len(cadena) + 1:]
    return t.rstrip('.').strip()


def cortar(texto):
    return texto[:NOMBRE_MAX].rstrip()


def marca_limpia(texto):
    t = sanear(texto)
    if ''.join(t.upper().split()) in MARCAS_NULAS:
        return None
    return cortar(t)


def normalizar_presentacion(cantidad, unidad):
    fila = UNIDADES.get(unidad.strip().lower())
    cant = cantidad.strip()
    if fila is None or not RE_CANTIDAD.fullmatch(cant):
        return None
    medida, factor = fila
    total = Decimal(cant) * factor
    # Decimales son errores de carga (0.75 ml por 750 ml); 1 g o 1 ml es marcador ("1.00 gr."), no medida.
    minimo = 1 if medida == 'un' else 2
    if total != total.to_integral_value() or not minimo <= total <= CANTIDAD_MAX:
        return None
    return total, medida


def num(valor):
    # Decimal no es JSON: entero si no tiene decimales.
    return int(valor) if valor == valor.to_integral_value() else float(valor)


def mas_votado(votos):
    return min(votos, key=lambda c: (-votos[c], c)) if votos else None


def elegir_presentacion(votos):
    # Una medida (ml o g) vence a "1 un": quien sólo informa unidades no dice cuánto contiene.
    # shortcut: sólo se usan los campos de la fuente ("1 un" en unos 6.300 EAN con medida en el nombre), mejorar si hace falta precio por medida.
    medidas = {p: n for p, n in votos.items() if p[1] != 'un'}
    return mas_votado(medidas or votos)


def elegir_texto(votos):
    # Desempate: alguna minúscula, cabe en 80, más larga, orden lexicográfico. Nunca cambia mayúsculas.
    if not votos:
        return None
    return min(votos, key=lambda c: (-votos[c], not any(ch.islower() for ch in c), len(c) > NOMBRE_MAX, -len(c), c))


def campo(bruto):
    # Comillas envolventes y "" escapado dentro del campo; el espacio sobrante no cuenta.
    x = bruto.strip()
    if len(x) >= 2 and x[0] == '"' and x[-1] == '"':
        x = x[1:-1].replace('""', '"')
    return x.strip()


def clasificar_ean(bruto, memo):
    # Memo por código crudo: el mismo producto se repite en cada sucursal.
    r = memo.get(bruto)
    if r is None:
        canon = canonico(bruto)
        if canon is None:
            r = (None, 'invalido')
        elif restringido(canon):
            r = (canon, 'restringido')
        elif gtin_ok(canon):
            r = (canon, 'ok')
        else:
            r = (canon, 'invalido')
        memo[bruto] = r
    return r


def sumar_voto(votos, candidato):
    if candidato:
        votos[candidato] = votos.get(candidato, 0) + 1


def motivo_comercio(cnt):
    if cnt['lineas'] == 0:
        return 'sin_filas'
    if cnt['malformadas'] * 100 > cnt['lineas'] * MAX_MALFORMADAS_PCT:
        return 'malformadas'
    if cnt['gtin_invalidos'] * 100 > cnt['gtin'] * MAX_GTIN_INVALIDOS_PCT:
        return 'gtin_invalidos'
    return None


def resultado_vacio(motivo):
    return {}, dict.fromkeys(CONTADORES, 0), motivo


def leer_productos(binario, memo):
    # Split manual y no el módulo csv: una comilla desbalanceada no debe comerse líneas.
    # shortcut: una línea sin salto de varios GB se lee entera en memoria; el tope de 3 GB por archivo limita el daño, usar readline(n) si la fuente deja de ser confiable.
    texto = io.TextIOWrapper(binario, encoding='utf-8-sig', errors='replace', newline='')
    lineas = (linea.rstrip('\r\n') for linea in texto)
    cabecera = next(lineas, None)
    if cabecera is None:
        return resultado_vacio('sin_cabecera')
    cab = cabecera.split('|')
    cols = {campo(c.replace('\ufeff', '')): i for i, c in enumerate(cab)}
    if any(c not in cols for c in COLUMNAS):
        return resultado_vacio('faltan_columnas')
    ix = {c: cols[c] for c in COLUMNAS}
    cnt = dict.fromkeys(CONTADORES, 0)
    acum = {}
    for linea in lineas:
        if not linea.strip() or linea.startswith(('Última', 'Ultima')):
            continue
        cnt['lineas'] += 1
        campos = linea.split('|')
        if len(campos) != len(cab) or '\ufffd' in linea:
            cnt['malformadas'] += 1
            continue
        if campo(campos[ix['productos_ean']]) != '1':
            continue
        cnt['gtin'] += 1
        canon, estado = clasificar_ean(campo(campos[ix['id_producto']]), memo)
        if estado == 'restringido':
            cnt['restringidos'] += 1
            continue
        if estado == 'invalido':
            cnt['gtin_invalidos'] += 1
            continue
        e = acum.get(canon)
        if e is None:
            e = acum[canon] = {'filas': 0, 'nombres': {}, 'marcas': {}, 'pres': {}}
        e['filas'] += 1
        sumar_voto(e['nombres'], descripcion_limpia(campo(campos[ix['productos_descripcion']])))
        sumar_voto(e['marcas'], marca_limpia(campo(campos[ix['productos_marca']])))
        pres = normalizar_presentacion(campo(campos[ix['productos_cantidad_presentacion']]),
                                       campo(campos[ix['productos_unidad_medida_presentacion']]))
        sumar_voto(e['pres'], pres)
    return acum, cnt, motivo_comercio(cnt)


def procesar_comercio(ext, info, memo):
    # Un zip interno roto descarta sólo a ese comercio; la corrida sigue con los demás.
    try:
        if info.file_size == 0:
            return resultado_vacio('zip_vacio')
        with ext.open(info) as fi, zipfile.ZipFile(fi) as zi:
            try:
                pinfo = zi.getinfo('productos.csv')
            except KeyError:
                return resultado_vacio('sin_productos')
            if pinfo.file_size > TAM_PRODUCTOS_MAX or pinfo.file_size > RAZON_MAX * max(pinfo.compress_size, 1):
                return resultado_vacio('productos_sospechoso')
            with zi.open(pinfo) as f:
                return leer_productos(f, memo)
    except Exception as exc:
        return resultado_vacio(f'zip_corrupto: {type(exc).__name__}')


def fusionar(glob, acum):
    for ean, e in acum.items():
        g = glob.setdefault(ean, {'comercios': 0, 'apariciones': 0, 'nombres': {}, 'marcas': {}, 'pres': {}})
        g['comercios'] += 1
        g['apariciones'] += e['filas']
        sumar_voto(g['nombres'], mas_votado(e['nombres']))
        sumar_voto(g['marcas'], mas_votado(e['marcas']))
        sumar_voto(g['pres'], elegir_presentacion(e['pres']))


def filas_finales(glob):
    filas = []
    for ean, g in glob.items():
        nombre = elegir_texto(g['nombres'])
        if nombre is None:
            continue
        pres = elegir_presentacion(g['pres'])
        filas.append({'ean': ean, 'nombre': cortar(nombre), 'marca': elegir_texto(g['marcas']),
                      'cantidad': num(pres[0]) if pres else None, 'unidad': pres[1] if pres else None,
                      'comercios': g['comercios'], 'apariciones': g['apariciones']})
    return sorted(filas, key=lambda f: f['ean'])


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def fecha_iso(texto):
    if not RE_FECHA.fullmatch(texto):
        return None
    try:
        return datetime.date.fromisoformat(texto)
    except ValueError:
        return None


def rechazar_fecha_futura(fecha):
    # Una fecha adelantada publicada una vez dejaría "sin novedad" a todas las corridas siguientes.
    if fecha > datetime.datetime.now(TZ_ARG).date() + datetime.timedelta(days=1):
        raise ErrorCorrida(f'la fuente es del {fecha.isoformat()}: fecha en el futuro')


def limpiar_temporales():
    # Restos de corridas cuyo borrado falló (Windows suele dejar el .zip abierto un rato).
    for ruta in glob.glob(os.path.join(tempfile.gettempdir(), 'catalogo-sepa-*.zip')):
        try:
            if time.time() - os.path.getmtime(ruta) > 86400:
                os.remove(ruta)
        except OSError:
            pass


def sha256_archivo(ruta):
    h = hashlib.sha256()
    with open(ruta, 'rb') as f:
        for bloque in iter(lambda: f.read(MB), b''):
            h.update(bloque)
    return h.hexdigest()


def carpeta_raiz(ext):
    raices = {n.split('/', 1)[0] for n in ext.namelist()}
    fecha = fecha_iso(next(iter(raices))) if len(raices) == 1 else None
    if fecha is None:
        raise ErrorCorrida('zip externo: se esperaba una única carpeta raíz AAAA-MM-DD')
    return fecha


def internos_de(ext):
    internos = []
    for info in ext.infolist():
        m = RE_INTERNO.fullmatch(info.filename.rsplit('/', 1)[-1])
        if m:
            internos.append((m.group(1), info))
    ids = [i for i, _ in internos]
    if not 1 <= len(ids) <= INTERNOS_MAX or len(set(ids)) != len(ids):
        raise ErrorCorrida('zip externo: cantidad de comercios fuera de rango o repetidos')
    return internos


def tamano_productos(ext, info):
    # Un interno ilegible vale 0 aquí; su fallo se reporta al procesar ese comercio.
    try:
        with ext.open(info) as fi, zipfile.ZipFile(fi) as zi:
            return zi.getinfo('productos.csv').file_size
    except Exception:
        return 0


def procesar_zip(ruta, fecha_esperada=None):
    t0 = time.monotonic()
    with zipfile.ZipFile(ruta) as ext:
        fecha = carpeta_raiz(ext)
        if fecha_esperada is not None and fecha != fecha_esperada:
            raise ErrorCorrida('la carpeta raíz del zip no coincide con la fecha del recurso')
        internos = internos_de(ext)
        if sum(tamano_productos(ext, info) for _, info in internos) > TOTAL_PRODUCTOS_MAX:
            raise ErrorCorrida('los productos.csv suman más de 10 GB')
        glob, por, tot, memo = {}, {}, dict.fromkeys(CONTADORES, 0), {}
        for n, (id_c, info) in enumerate(internos, 1):
            acum, cnt, motivo = procesar_comercio(ext, info, memo)
            log(f'comercio {id_c} ({n}/{len(internos)}): {motivo or "ok"}')
            por[id_c] = {'estado': 'fallido' if motivo else 'ok', 'filas': cnt['lineas'],
                         'malformadas': cnt['malformadas'], 'gtin_invalidos': cnt['gtin_invalidos'],
                         'ean': len(acum)}
            if motivo:
                por[id_c]['motivo'] = motivo
            else:
                fusionar(glob, acum)
                for k in CONTADORES:
                    tot[k] += cnt[k]
    filas = filas_finales(glob)
    ok = sum(v['estado'] == 'ok' for v in por.values())
    metricas = {'ean_distintos': len(filas), 'comercios_total': len(internos), 'comercios_ok': ok,
                'comercios_fallidos': len(internos) - ok, 'filas': tot['lineas'],
                'malformadas': tot['malformadas'], 'gtin_invalidos': tot['gtin_invalidos'],
                'restringidos': tot['restringidos'], 'segundos': round(time.monotonic() - t0, 1),
                'por_comercio': por}
    return fecha, filas, metricas


def volcar(ruta, filas):
    with open(ruta, 'w', encoding='utf-8', newline='\n') as f:
        for fila in filas:
            f.write(json.dumps(fila, ensure_ascii=False) + '\n')


def leer_env(ruta):
    try:
        with open(ruta, encoding='utf-8-sig') as f:
            lineas = f.read().splitlines()
    except OSError:
        raise ErrorCorrida(f'no se pudo leer el archivo de entorno {ruta}') from None
    env = {}
    for linea in lineas:
        linea = linea.strip()
        if not linea or linea.startswith('#') or '=' not in linea:
            continue
        clave, valor = linea.split('=', 1)
        valor = valor.strip()
        if len(valor) >= 2 and valor[0] == valor[-1] and valor[0] in '"\'':
            valor = valor[1:-1]
        env[clave.strip()] = valor
    return env


def url_supabase(url):
    p = urllib.parse.urlsplit(url)
    local = p.hostname in ('localhost', '127.0.0.1', '::1')
    if p.hostname and (p.scheme == 'https' or (p.scheme == 'http' and local)):
        return url.rstrip('/')
    raise ErrorCorrida('SUPABASE_URL debe ser https (http sólo a localhost, 127.0.0.1 o [::1])')


def config_supabase(ruta):
    env = leer_env(ruta)
    url, clave = env.get('SUPABASE_URL', ''), env.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not clave:
        raise ErrorCorrida('faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el archivo de entorno')
    return {'url': url_supabase(url), 'clave': clave}


class _Redirige(urllib.request.HTTPRedirectHandler):
    # Sólo CKAN y la descarga siguen redirecciones, y únicamente a https://datos.produccion.gob.ar.
    def __init__(self, permitidas):
        super().__init__()
        self.permitidas = permitidas

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        p = urllib.parse.urlsplit(newurl)
        if self.permitidas and p.scheme == 'https' and p.hostname == HOST_DATOS:
            return super().redirect_request(req, fp, code, msg, headers, newurl)
        return None


ABRIR_DATOS = urllib.request.build_opener(_Redirige(True))
ABRIR_SUPA = urllib.request.build_opener(_Redirige(False))


def http_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with ABRIR_DATOS.open(req, timeout=60) as r:
        return json.loads(r.read(64 * MB))


def recurso_del_dia():
    pay = http_json(CKAN_URL)
    if pay.get('success') is not True:
        raise ErrorCorrida('CKAN respondió sin success=true')
    candidatos = []
    for r in pay['result']['resources']:
        m = RE_FECHA.search(str(r.get('description') or ''))
        es_zip = str(r.get('format') or '').strip().upper() == 'ZIP'
        fecha = fecha_iso(m.group(0)) if m and es_zip else None
        try:
            ts = datetime.datetime.fromisoformat(r.get('last_modified') or '')
        except ValueError:
            ts = None
        if fecha and ts:
            candidatos.append((ts, fecha, r))
    if not candidatos:
        raise ErrorCorrida('CKAN: ningún ZIP con fecha en la descripción')
    _, fecha, rec = max(candidatos, key=lambda c: c[0])
    p = urllib.parse.urlsplit(str(rec.get('url') or ''))
    if p.scheme != 'https' or p.hostname != HOST_DATOS:
        raise ErrorCorrida(f'CKAN: la URL del recurso no es https://{HOST_DATOS}')
    try:
        tam = int(rec.get('size'))
    except (TypeError, ValueError):
        raise ErrorCorrida('CKAN: size inválido') from None
    if not TAM_ZIP_MIN <= tam <= TAM_ZIP_MAX:
        raise ErrorCorrida(f'CKAN: tamaño del recurso fuera de rango ({tam} bytes)')
    if fecha < datetime.datetime.now(TZ_ARG).date() - datetime.timedelta(days=2):
        raise ErrorCorrida(f'el recurso más nuevo es del {fecha.isoformat()}: demasiado viejo')
    return {'fecha': fecha, 'url': rec['url'], 'size': tam}


def fecha_del_zip(ruta):
    with zipfile.ZipFile(ruta) as ext:
        return carpeta_raiz(ext)


def descargar(url, tam, ruta):
    h = hashlib.sha256()
    total = 0
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with ABRIR_DATOS.open(req, timeout=60) as r, open(ruta, 'wb') as out:
        for bloque in iter(lambda: r.read(MB), b''):
            total += len(bloque)
            if total > TAM_ZIP_MAX:
                raise ErrorCorrida('la descarga supera el tope de 1 GB')
            h.update(bloque)
            out.write(bloque)
    if total != tam:
        raise ErrorCorrida(f'la descarga trajo {total} bytes; el recurso declara {tam}')
    return h.hexdigest()


def supa_pedir(cfg, metodo, ruta, cuerpo=None, prefer=None, timeout=60):
    cab = {'apikey': cfg['clave'], 'Authorization': 'Bearer ' + cfg['clave'],
           'Content-Type': 'application/json', 'User-Agent': UA}
    if prefer:
        cab['Prefer'] = prefer
    datos = None if cuerpo is None else json.dumps(cuerpo).encode('utf-8')
    req = urllib.request.Request(cfg['url'] + '/rest/v1/' + ruta, data=datos, headers=cab, method=metodo)
    try:
        with ABRIR_SUPA.open(req, timeout=timeout) as r:
            crudo = r.read()
    except urllib.error.HTTPError as exc:
        # El cuerpo de PostgREST dice qué CHECK o permiso falló; sin él el log sólo diría "HTTP Error 400".
        exc.detalle = exc.read(300).decode('utf-8', 'replace')
        raise
    return json.loads(crudo) if crudo else None


def describir(exc):
    return f'{type(exc).__name__}: {exc} {getattr(exc, "detalle", "")}'.strip()


def ahora_utc(horas_atras=0):
    t = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=horas_atras)
    return t.strftime('%Y-%m-%dT%H:%M:%SZ')


def crear_importacion(cfg, rec):
    try:
        filas = supa_pedir(cfg, 'POST', 'catalogo_importaciones',
                           {'fuente': FUENTE, 'fecha_fuente': rec['fecha'].isoformat(), 'url': rec['url']},
                           prefer='return=representation')
    except urllib.error.HTTPError as exc:
        if exc.code == 409:  # índice único catalogo_importaciones_una_corriendo
            return None
        raise
    return filas[0]['id']


def supa_sube(cfg, imp, filas):
    for i in range(0, len(filas), LOTE):
        lote = [dict(f, importacion_id=imp) for f in filas[i:i + LOTE]]
        for intento in range(4):
            try:
                supa_pedir(cfg, 'POST', 'catalogo_global_staging?on_conflict=importacion_id,ean', lote,
                           prefer='resolution=ignore-duplicates,return=minimal')
                break
            except urllib.error.HTTPError as exc:
                if exc.code < 500 or intento == 3:
                    raise
            except OSError:
                if intento == 3:
                    raise
            log(f'staging: reintento {intento + 1} desde la fila {i}')
            time.sleep(2 ** intento)
        log(f'staging: {min(i + LOTE, len(filas))}/{len(filas)}')


def marcar_error(cfg, imp, exc):
    # Mejor esfuerzo: si esto falla, lo que importa es la excepción original.
    try:
        supa_pedir(cfg, 'PATCH', f'catalogo_importaciones?id=eq.{imp}&estado=eq.corriendo',
                   {'estado': 'error', 'terminada': ahora_utc(), 'motivo': describir(exc)[:300]})
    except Exception:
        log('no se pudo marcar la importación como error')


def correr(args):
    cfg = None if args.seco else config_supabase(args.env)
    if args.archivo:
        rec = {'fecha': fecha_del_zip(args.archivo), 'url': None, 'size': os.path.getsize(args.archivo)}
    else:
        rec = recurso_del_dia()
    rechazar_fecha_futura(rec['fecha'])
    ruta_tmp = imp = None
    try:
        if cfg:
            ultima = supa_pedir(cfg, 'GET', f'catalogo_importaciones?estado=eq.publicada&fuente=eq.{FUENTE}'
                                            '&select=fecha_fuente&order=fecha_fuente.desc&limit=1')
            if ultima and fecha_iso(ultima[0]['fecha_fuente']) >= rec['fecha']:
                print(json.dumps({'estado': 'sin_novedad', 'fecha_fuente': rec['fecha'].isoformat()}))
                return 0
            # 2 h = el límite de la tarea programada: una corrida muerta no bloquea la ventana de las 19:00.
            supa_pedir(cfg, 'PATCH', f'catalogo_importaciones?fuente=eq.{FUENTE}&estado=eq.corriendo'
                                     f'&iniciada=lt.{ahora_utc(2)}',
                       {'estado': 'error', 'terminada': ahora_utc(), 'motivo': 'abandonada'})
            imp = crear_importacion(cfg, rec)
            if imp is None:
                log('ya hay una corrida en curso')
                return 3
        if args.archivo:
            ruta, sha = args.archivo, sha256_archivo(args.archivo)
        else:
            limpiar_temporales()
            fd, ruta_tmp = tempfile.mkstemp(prefix='catalogo-sepa-', suffix='.zip')
            os.close(fd)
            log('descargando el paquete SEPA')
            sha = descargar(rec['url'], rec['size'], ruta_tmp)
            ruta = ruta_tmp
        log('procesando comercios')
        fecha, filas, metricas = procesar_zip(ruta, rec['fecha'])
        metricas.update(bytes=rec['size'], sha256=sha, fecha_fuente=fecha.isoformat())
        if args.volcar:
            volcar(args.volcar, filas)
        if cfg is None:
            print(json.dumps(metricas))
            return 0
        supa_sube(cfg, imp, filas)
        supa_pedir(cfg, 'PATCH', f'catalogo_importaciones?id=eq.{imp}', {'sha256': sha})
        # El upsert de ~75 mil filas corre dentro de la RPC: con 60 s de socket el runner saldría con la base todavía publicando.
        t_rpc = time.monotonic()
        res = supa_pedir(cfg, 'POST', 'rpc/publicar_catalogo',
                         {'p_importacion_id': imp, 'p_filas': len(filas), 'p_metricas': metricas}, timeout=300)
        log(f'publicar_catalogo respondió en {time.monotonic() - t_rpc:.1f} s')
        print(json.dumps({'importacion': imp, 'resultado': res, 'metricas': metricas}))
        return {'publicada': 0, 'rechazada': 1}.get(res.get('estado'), 2)
    except BaseException as exc:
        if cfg is not None and imp is not None:
            marcar_error(cfg, imp, exc)
        raise
    finally:
        if ruta_tmp and os.path.exists(ruta_tmp):
            try:
                os.remove(ruta_tmp)
            except OSError:
                # Defender o el indexador pueden tener abierto el .zip; un borrado fallido no debe tapar el resultado.
                log(f'no se pudo borrar {ruta_tmp}; limpiar_temporales lo borra en la próxima corrida')


def autotest():
    casos = [
        ('canonico EAN-8 con ceros', canonico('0000077956262'), '77956262'),
        ('canonico 12 digitos', canonico('070330909229'), '0070330909229'),
        ('canonico vacio', canonico(''), None),
        ('canonico 14 digitos', canonico('12345678901234'), None),
        ('canonico no numerico', canonico('77A95'), None),
        ('gtin valido', gtin_ok('7790895000997'), True),
        ('gtin invalido', gtin_ok('7790895000998'), False),
        ('restringido 2...', restringido(canonico('2893554588074')), True),
        ('presentacion 900 cm3', normalizar_presentacion('900.00', 'cm3'), (900, 'ml')),
        ('presentacion 00250 gr', normalizar_presentacion('00250', 'gr'), (250, 'g')),
        ('presentacion .50 kg', normalizar_presentacion('.50', 'kg'), (500, 'g')),
        ('presentacion 1 l', normalizar_presentacion('1', 'l'), (1000, 'ml')),
        ('presentacion 2 m2 nula', normalizar_presentacion('2', 'm2'), None),
        ('prefijo de cadena', descripcion_limpia('DISC:DISC COCA COLA 2.25L'), 'COCA COLA 2.25L'),
        ('punto final', descripcion_limpia('COCA COLA X2.25L.'), 'COCA COLA X2.25L'),
        ('voto mas frecuente', elegir_texto({'COCA COLA 2.25L': 2, 'Coca Cola 2.25 L': 1}), 'COCA COLA 2.25L'),
        ('empate con minuscula', elegir_texto({'COCA COLA 2.25L': 1, 'Coca Cola 2.25 L': 1}), 'Coca Cola 2.25 L'),
        ('marca basura', marca_limpia('SIN MARCA'), None),
        ('marca propia de cadena', marca_limpia('DIA'), 'DIA'),
        ('nombre de 100 se corta a 80', cortar(elegir_texto({'A' * 100: 1})), 'A' * 80),
        ('saneo de control', sanear('a\x00b\u200bc  d'), 'a b c d'),
        ('saneo NFC', sanear('e\u0301'), 'é'),
        ('codigo de envase al final', descripcion_limpia('Arandano cub 125 gr CUB-1-un'), 'Arandano cub 125 gr'),
        ('codigo de envase con m2', descripcion_limpia('papel higienic CAMPANITA 4x30m PAQ-12-m2'), 'papel higienic CAMPANITA 4x30m'),
        ('codigo solo no se borra', descripcion_limpia('BOT-750-ml'), 'BOT-750-ml'),
        ('dos codigos al final', descripcion_limpia('Vino X  BOT-750-cc. BOT-750-ml.'), 'Vino X'),
        ('presentacion decimal en ml nula', normalizar_presentacion('0.75', 'ml'), None),
        ('presentacion 1.5 ml nula', normalizar_presentacion('1.5', 'ml'), None),
        ('presentacion 1.00 gr marcador nula', normalizar_presentacion('1.00', 'gr.'), None),
        ('presentacion 1 UNI valida', normalizar_presentacion('1', 'UNI'), (1, 'un')),
        ('medida vence a un', elegir_presentacion({(Decimal('1'), 'un'): 2, (Decimal('300'), 'g'): 1}), (300, 'g')),
    ]
    def rechaza(fn):
        try:
            fn()
        except ErrorCorrida:
            return True
        return False

    hoy = datetime.datetime.now(TZ_ARG).date()
    casos += [
        ('fecha futura se rechaza', rechaza(lambda: rechazar_fecha_futura(hoy + datetime.timedelta(days=5))), True),
        ('fecha de mañana pasa (huso)', rechaza(lambda: rechazar_fecha_futura(hoy + datetime.timedelta(days=1))), False),
    ]
    fallos = [(nombre, obtenido, esperado) for nombre, obtenido, esperado in casos if obtenido != esperado]
    for nombre, obtenido, esperado in fallos:
        print(f'FALLA {nombre}: obtenido {obtenido!r}, esperado {esperado!r}', file=sys.stderr)
    if fallos:
        return 1
    print(f'autotest: {len(casos)} casos OK')
    return 0


def parser():
    ap = argparse.ArgumentParser(description='Catálogo global desde el paquete SEPA; ver el encabezado.')
    ap.add_argument('--env', default=os.path.join(RAIZ, '.env.catalogo.local'))
    ap.add_argument('--archivo', metavar='ZIP', help='usa ese zip local en vez de bajar el del día')
    ap.add_argument('--seco', action='store_true', help='no toca Supabase; imprime las métricas')
    ap.add_argument('--volcar', metavar='RUTA.jsonl', help='escribe una línea JSON por EAN publicable')
    ap.add_argument('--autotest', action='store_true', help='aserciones de las funciones puras')
    return ap


def main(argv=None):
    args = parser().parse_args(argv)
    if args.autotest:
        return autotest()
    try:
        return correr(args)
    except ErrorCorrida as exc:
        print(f'error: {exc}', file=sys.stderr)
        return 2
    except Exception as exc:
        print(f'error inesperado: {describir(exc)}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
