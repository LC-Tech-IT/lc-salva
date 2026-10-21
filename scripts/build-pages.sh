#!/usr/bin/env bash
# LC Salva — Construcción para Cloudflare Pages
# Copia SOLO los archivos públicos del sitio a dist/. Así no se publican
# las migraciones SQL, las funciones de Supabase, los scripts ni la documentación.
#
# Cloudflare Pages → Build command: bash scripts/build-pages.sh
#                    Build output directory: dist
set -euo pipefail

rm -rf dist
mkdir -p dist

cp ./*.html ./*.css ./*.js dist/
cp ./*.jpg dist/
cp ./*.jpeg dist/ 2>/dev/null || true
cp manifest.webmanifest dist/
cp -r icons dist/
cp _headers _redirects dist/

# Versión del service worker = commit desplegado (CF_PAGES_COMMIT_SHA en Cloudflare Pages)
VERSION="${CF_PAGES_COMMIT_SHA:-$(date +%s)}"
sed -i "s/__SALVA_VERSION__/${VERSION:0:12}/" dist/sw.js
echo "Service worker versión: ${VERSION:0:12}"

# Cache-busting automático: style.css?v=2.2 → style.css?v=2.2-<commit> en cada despliegue
sed -i -E 's/\?v=([0-9.]+)"/?v=\1-'"${VERSION:0:8}"'"/g' dist/*.html
echo "Recursos versionados con el sufijo -${VERSION:0:8}"

echo "Sitio listo en dist/:"
ls -1 dist
