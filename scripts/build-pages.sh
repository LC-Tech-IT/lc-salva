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
cp _headers _redirects dist/

echo "Sitio listo en dist/:"
ls -1 dist
