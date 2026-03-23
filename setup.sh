#!/usr/bin/env bash
# One-time setup: downloads Leaflet and Natural Earth world GeoJSON.
# Run once before opening index.html.
set -e

BASE="$(cd "$(dirname "$0")" && pwd)"

echo "Downloading Leaflet 1.9.4..."
curl -fsSL "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"  -o "$BASE/js/leaflet.js"
curl -fsSL "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" -o "$BASE/css/leaflet.css"

echo "Downloading Leaflet marker images..."
mkdir -p "$BASE/css/images" "$BASE/data"
curl -fsSL "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png"    -o "$BASE/css/images/marker-icon.png"
curl -fsSL "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png" -o "$BASE/css/images/marker-icon-2x.png"
curl -fsSL "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"  -o "$BASE/css/images/marker-shadow.png"

echo "Downloading Natural Earth 110m countries GeoJSON (~839KB)..."
curl -fsSL "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson" \
     -o "$BASE/data/world.geojson"

echo "Downloading Natural Earth 10m states/provinces GeoJSON (~20MB)..."
curl -fsSL "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson" \
     -o "$BASE/data/states.geojson"

echo ""
echo "Setup complete. Serve the app with:"
echo "  cd '$BASE' && python3 -m http.server 8000"
echo "Then open http://localhost:8000"
