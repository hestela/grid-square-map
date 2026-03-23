// App bootstrap: map init, GeoJSON base layer, search, marker

(function () {
    // --- Map init ---
    const map = L.map('map', {
        center: [20, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 10,
        worldCopyJump: true,
        zoomControl: true
    });

    // --- Country GeoJSON base layer ---
    const loadingEl = document.getElementById('loading');
    fetch('data/world.geojson')
        .then(r => {
            if (!r.ok) throw new Error('Failed to load world.geojson');
            return r.json();
        })
        .then(data => {
            L.geoJSON(data, {
                style: {
                    color: '#666',
                    weight: 0.6,
                    fillColor: '#d6cfba',
                    fillOpacity: 1
                },
                pane: 'tilePane'  // keep countries below grid overlay
            }).addTo(map);
            if (loadingEl) loadingEl.style.display = 'none';
        })
        .catch(err => {
            console.error(err);
            if (loadingEl) loadingEl.textContent = 'Error loading map data. Run setup.sh first.';
        });

    // --- Maidenhead grid overlay ---
    new MaidenheadGridLayer().addTo(map);

    // --- Search ---
    let searchMarker = null;
    let searchRect   = null;

    const searchInput = document.getElementById('search');
    const searchError = document.getElementById('search-error');
    const goBtn       = document.getElementById('go');

    function doSearch() {
        const raw = searchInput.value.trim().toUpperCase();
        searchError.textContent = '';

        if (!raw) return;

        const err = Maidenhead.validate(raw);
        if (err) {
            searchError.textContent = 'Invalid grid square: ' + err;
            return;
        }

        const bounds  = Maidenhead.toBounds(raw);
        const center  = Maidenhead.toCenter(raw);
        const is4char = raw.length === 4;

        // Pan and zoom to the grid square
        map.fitBounds(
            [[bounds.swLat, bounds.swLon], [bounds.neLat, bounds.neLon]],
            { maxZoom: is4char ? 8 : 4, animate: true, padding: [40, 40] }
        );

        // Remove previous marker/rect
        if (searchMarker) { searchMarker.remove(); searchMarker = null; }
        if (searchRect)   { searchRect.remove();   searchRect   = null; }

        // Highlight the square with a semi-transparent rectangle
        searchRect = L.rectangle(
            [[bounds.swLat, bounds.swLon], [bounds.neLat, bounds.neLon]],
            { color: '#e63030', weight: 2, fillColor: '#e63030', fillOpacity: 0.15 }
        ).addTo(map);

        // Place a circle marker at the center
        const coordStr = `${Math.abs(center.lat).toFixed(2)}°${center.lat >= 0 ? 'N' : 'S'}, `
                       + `${Math.abs(center.lon).toFixed(2)}°${center.lon >= 0 ? 'E' : 'W'}`;
        searchMarker = L.circleMarker([center.lat, center.lon], {
            radius: 8,
            color: '#e63030',
            weight: 2,
            fillColor: '#e63030',
            fillOpacity: 0.9
        })
        .bindPopup(`<strong>${raw}</strong><br>${coordStr}`)
        .addTo(map)
        .openPopup();
    }

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
})();
