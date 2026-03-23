// App bootstrap: map init, GeoJSON base layer, search, marker

// Returns a copy of a GeoJSON FeatureCollection with all longitudes shifted by `offset`.
// Used to render world copies at ±360° so the map wraps past the antimeridian.
function shiftGeoJSON(data, offset) {
    function shiftRing(ring) { return ring.map(([lon, lat, ...rest]) => [lon + offset, lat, ...rest]); }
    function shiftGeom(geom) {
        if (!geom) return geom;
        if (geom.type === 'Polygon')
            return { type: 'Polygon', coordinates: geom.coordinates.map(shiftRing) };
        if (geom.type === 'MultiPolygon')
            return { type: 'MultiPolygon', coordinates: geom.coordinates.map(p => p.map(shiftRing)) };
        return geom;
    }
    return { ...data, features: data.features.map(f => ({ ...f, geometry: shiftGeom(f.geometry) })) };
}

(function () {
    // --- Map init ---
    const map = L.map('map', {
        center: [20, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 10,
        worldCopyJump: true,
        zoomControl: false
    });
    L.control.zoom({ position: 'topright' }).addTo(map);

    // --- Country GeoJSON base layer ---
    const loadingEl = document.getElementById('loading');
    fetch('data/world.geojson')
        .then(r => {
            if (!r.ok) throw new Error('Failed to load world.geojson');
            return r.json();
        })
        .then(data => {
            GeoLookup.setCountries(data.features);

            const style = { color: '#666', weight: 0.6, fillColor: '#d6cfba', fillOpacity: 1 };

            // Render three world copies so the map wraps correctly when panned
            // past the antimeridian. Coordinates are shifted by ±360° longitude.
            [-360, 0, 360].forEach(offset => {
                const layer = offset === 0 ? data : shiftGeoJSON(data, offset);
                L.geoJSON(layer, { style, pane: 'tilePane' }).addTo(map);
            });

            if (loadingEl) loadingEl.style.display = 'none';
        })
        .catch(err => {
            console.error(err);
            if (loadingEl) loadingEl.textContent = 'Error loading map data. Run setup.sh first.';
        });

    // --- States/provinces GeoJSON for lookup (optional) ---
    fetch('data/states.geojson')
        .then(r => r.json())
        .then(data => GeoLookup.setStates(data.features))
        .catch(() => {}); // silently skip if not downloaded yet

    // --- Maidenhead grid overlay ---
    new MaidenheadGridLayer().addTo(map);

    // --- Search ---
    let searchMarker  = null;
    let searchRect    = null;
    let activeLocator = null;

    const searchInput = document.getElementById('search');
    const searchError = document.getElementById('search-error');
    const goBtn       = document.getElementById('go');
    const clearBtn    = document.getElementById('clear');
    const resetBtn    = document.getElementById('reset-view');

    // --- Distance ---
    let distLine    = null;
    let distLayers  = [];   // [{rect, marker}, {rect, marker}]

    function clearDistance() {
        if (distLine) { distLine.remove(); distLine = null; }
        distLayers.forEach(({ rect, marker }) => { rect.remove(); marker.remove(); });
        distLayers = [];
        document.getElementById('dist-from').value = '';
        document.getElementById('dist-to').value   = '';
        document.getElementById('dist-error').textContent  = '';
        document.getElementById('dist-result').textContent = '';
    }

    function clearSelection() {
        if (searchMarker) { searchMarker.remove(); searchMarker = null; }
        if (searchRect)   { searchRect.remove();   searchRect   = null; }
        searchInput.value = '';
        searchError.textContent = '';
        activeLocator = null;
        clearDistance();
    }

    clearBtn.addEventListener('click', clearSelection);
    resetBtn.addEventListener('click', () => map.setView([20, 0], 2));

    // --- Collapsible panel ---
    const toggleBtn = document.getElementById('toggle');
    const uiBody    = document.getElementById('ui-body');
    toggleBtn.addEventListener('click', () => {
        const collapsed = uiBody.classList.toggle('hidden');
        toggleBtn.innerHTML = collapsed ? '&#x25BC;' : '&#x25B2;';
        toggleBtn.title     = collapsed ? 'Expand' : 'Collapse';
    });

    // Build and add a highlight rect + circle marker for a locator. Returns { rect, marker }.
    function buildLocatorLayer(raw, color, openPopup) {
        const bounds = Maidenhead.toBounds(raw);
        const center = Maidenhead.toCenter(raw);

        const rect = L.rectangle(
            [[bounds.swLat, bounds.swLon], [bounds.neLat, bounds.neLon]],
            { color, weight: 2, fillColor: color, fillOpacity: 0.15 }
        ).addTo(map);

        const coordStr = `${Math.abs(center.lat).toFixed(2)}°${center.lat >= 0 ? 'N' : 'S'}, `
                       + `${Math.abs(center.lon).toFixed(2)}°${center.lon >= 0 ? 'E' : 'W'}`;
        const { country, state } = GeoLookup.lookupBounds(bounds.swLat, bounds.swLon, bounds.neLat, bounds.neLon);
        const locationStr = [state, country].filter(Boolean).join(', ');
        const popupHtml = `<strong>${raw}</strong><br>${coordStr}`
                        + (locationStr ? `<br>${locationStr}` : '');

        const marker = L.circleMarker([center.lat, center.lon], {
            radius: 8, color, weight: 2, fillColor: color, fillOpacity: 0.9
        }).bindPopup(popupHtml).addTo(map);

        if (openPopup) marker.openPopup();
        return { rect, marker };
    }

    // Show highlight + marker for a locator string, optionally panning to it.
    function showLocator(raw, pan) {
        if (pan) {
            const b = Maidenhead.toBounds(raw);
            map.fitBounds(
                [[b.swLat, b.swLon], [b.neLat, b.neLon]],
                { maxZoom: raw.length === 4 ? 8 : 4, animate: true, padding: [40, 40] }
            );
        }

        if (searchMarker) { searchMarker.remove(); searchMarker = null; }
        if (searchRect)   { searchRect.remove();   searchRect   = null; }

        ({ rect: searchRect, marker: searchMarker } = buildLocatorLayer(raw, '#e63030', true));
        activeLocator = raw;
    }

    function doSearch() {
        const raw = searchInput.value.trim().toUpperCase();
        searchError.textContent = '';
        if (!raw) return;
        const err = Maidenhead.validate(raw);
        if (err) { searchError.textContent = 'Invalid grid square: ' + err; return; }
        showLocator(raw, true);
    }

    // Click on map to select the grid square under the cursor (only when sub-squares visible)
    map.on('click', e => {
        if (map.getZoom() < 5) return;
        const locator = Maidenhead.fromLatLon(e.latlng.lat, e.latlng.lng);
        if (locator === activeLocator) {
            clearSelection();
        } else {
            searchInput.value = locator;
            searchError.textContent = '';
            showLocator(locator, false);
        }
    });

    goBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') doSearch();
    });

    // Capitalize as user types
    searchInput.addEventListener('input', () => {
        const pos = searchInput.selectionStart;
        searchInput.value = searchInput.value.toUpperCase();
        searchInput.setSelectionRange(pos, pos);
    });

    // --- Distance calculation ---
    const distFrom   = document.getElementById('dist-from');
    const distTo     = document.getElementById('dist-to');
    const distGoBtn  = document.getElementById('dist-go');
    const distError  = document.getElementById('dist-error');
    const distResult = document.getElementById('dist-result');

    function autoUpper(input) {
        input.addEventListener('input', () => {
            const pos = input.selectionStart;
            input.value = input.value.toUpperCase();
            input.setSelectionRange(pos, pos);
        });
    }
    autoUpper(distFrom);
    autoUpper(distTo);

    function doDistance() {
        const rawA = distFrom.value.trim().toUpperCase();
        const rawB = distTo.value.trim().toUpperCase();
        distError.textContent  = '';
        distResult.textContent = '';
        // Clear previous distance layers
        if (distLine) { distLine.remove(); distLine = null; }
        distLayers.forEach(({ rect, marker }) => { rect.remove(); marker.remove(); });
        distLayers = [];

        const errA = Maidenhead.validate(rawA);
        const errB = Maidenhead.validate(rawB);
        if (errA || errB) {
            distError.textContent = errA ? `"From" — ${errA}` : `"To" — ${errB}`;
            return;
        }

        const { km, mi } = Maidenhead.distance(rawA, rawB);
        distResult.textContent = `${km.toLocaleString()} km / ${mi.toLocaleString()} mi`;

        // Markers and highlights for both squares
        distLayers.push(buildLocatorLayer(rawA, '#e69030', false));
        distLayers.push(buildLocatorLayer(rawB, '#e69030', false));

        const cA = Maidenhead.toCenter(rawA);
        const cB = Maidenhead.toCenter(rawB);
        distLine = L.polyline(
            [[cA.lat, cA.lon], [cB.lat, cB.lon]],
            { color: '#e69030', weight: 2, dashArray: '6 4' }
        ).addTo(map);

        map.fitBounds(distLine.getBounds(), { padding: [40, 40], animate: true });
    }

    distGoBtn.addEventListener('click', doDistance);
    distTo.addEventListener('keydown', e => { if (e.key === 'Enter') doDistance(); });
})();
