"""
LC Salva — Respaldo de los archivos de Supabase Storage.

Los backups diarios de Supabase cubren SOLO la base de datos, no los archivos
(fotos de portadores y documentos de la Bóveda Médica). Este script descarga
todos los objetos de todos los buckets a una carpeta local.

Variables de entorno:
  SUPABASE_URL               https://<proyecto>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY  llave de servicio (solo como secreto de GitHub, nunca en el código)
Uso:
  python scripts/respaldo_storage.py respaldo/storage
"""
import json
import os
import sys
import urllib.parse
import urllib.request

URL = os.environ["SUPABASE_URL"].rstrip("/")
LLAVE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
CABECERAS = {"apikey": LLAVE, "Authorization": "Bearer " + LLAVE}
LOTE = 1000


def peticion(ruta, cuerpo=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    cabeceras = dict(CABECERAS, **({"Content-Type": "application/json"} if datos else {}))
    req = urllib.request.Request(URL + ruta, data=datos, headers=cabeceras, method="POST" if datos else "GET")
    with urllib.request.urlopen(req, timeout=120) as res:
        return res.read()


def listar(bucket, prefijo=""):
    """Recorre recursivamente un bucket; las carpetas llegan con id = null."""
    desplazamiento = 0
    while True:
        lote = json.loads(peticion("/storage/v1/object/list/" + bucket, {
            "prefix": prefijo, "limit": LOTE, "offset": desplazamiento,
            "sortBy": {"column": "name", "order": "asc"},
        }))
        for item in lote:
            ruta = (prefijo + "/" + item["name"]) if prefijo else item["name"]
            if item.get("id") is None:
                yield from listar(bucket, ruta)
            else:
                yield ruta
        if len(lote) < LOTE:
            return
        desplazamiento += LOTE


def main():
    destino = sys.argv[1] if len(sys.argv) > 1 else "respaldo/storage"
    buckets = [b["id"] for b in json.loads(peticion("/storage/v1/bucket"))]
    total = 0
    for bucket in buckets:
        for ruta in listar(bucket):
            archivo = os.path.join(destino, bucket, *ruta.split("/"))
            os.makedirs(os.path.dirname(archivo), exist_ok=True)
            contenido = peticion("/storage/v1/object/" + bucket + "/" + urllib.parse.quote(ruta))
            with open(archivo, "wb") as f:
                f.write(contenido)
            total += 1
        print(f"Bucket {bucket}: respaldado")
    print(f"Total de archivos respaldados: {total}")


if __name__ == "__main__":
    main()
