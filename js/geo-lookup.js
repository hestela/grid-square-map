// Offline country/state lookup via point-in-polygon against Natural Earth GeoJSON.
// GeoJSON coordinates are [longitude, latitude].

const GeoLookup = (() => {
    let _countries = null;
    let _states    = null;

    // Precompute a bounding box for a GeoJSON geometry so we can skip expensive
    // PIP checks for features that can't possibly contain the test point.
    function computeBbox(geom) {
        let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
        function processRing(ring) {
            for (const [lon, lat] of ring) {
                if (lon < minLon) minLon = lon;
                if (lon > maxLon) maxLon = lon;
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
            }
        }
        if (geom.type === 'Polygon')      geom.coordinates.forEach(processRing);
        if (geom.type === 'MultiPolygon') geom.coordinates.forEach(p => p.forEach(processRing));
        return { minLon, maxLon, minLat, maxLat };
    }

    function withBbox(features) {
        return features.map(f => ({
            ...f,
            _bbox: f.geometry ? computeBbox(f.geometry) : null
        }));
    }

    // Ray-casting point-in-polygon for a single ring.
    function pointInRing(pt, ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            if ((yi > pt[1]) !== (yj > pt[1]) &&
                pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }

    function pointInPolygon(pt, polygon) {
        const rings = polygon.coordinates;
        if (!pointInRing(pt, rings[0])) return false;
        for (let h = 1; h < rings.length; h++) {
            if (pointInRing(pt, rings[h])) return false;
        }
        return true;
    }

    function pointInMultiPolygon(pt, multiPolygon) {
        for (const polygonCoords of multiPolygon.coordinates) {
            const rings = polygonCoords;
            if (!pointInRing(pt, rings[0])) continue;
            let inHole = false;
            for (let h = 1; h < rings.length; h++) {
                if (pointInRing(pt, rings[h])) { inHole = true; break; }
            }
            if (!inHole) return true;
        }
        return false;
    }

    function pointInFeature(pt, feature) {
        const bb = feature._bbox;
        if (bb && (pt[0] < bb.minLon || pt[0] > bb.maxLon ||
                   pt[1] < bb.minLat || pt[1] > bb.maxLat)) return false;
        const geom = feature.geometry;
        if (!geom) return false;
        if (geom.type === 'Polygon')      return pointInPolygon(pt, geom);
        if (geom.type === 'MultiPolygon') return pointInMultiPolygon(pt, geom);
        return false;
    }

    function findName(features, pt, prop) {
        if (!features) return null;
        for (const f of features) {
            if (pointInFeature(pt, f)) return f.properties[prop] || null;
        }
        return null;
    }

    // Single-point lookup.
    function lookupPoint(lat, lon) {
        const pt = [lon, lat];
        return {
            country: findName(_countries, pt, 'NAME'),
            state:   findName(_states,    pt, 'name')
        };
    }

    // Sample a 3×3 grid of points across a grid square's bounds and aggregate
    // the unique countries/states found. This handles squares whose center is
    // ocean but land touches a corner, and squares that span two regions.
    function lookupBounds(swLat, swLon, neLat, neLon) {
        const hits = []; // { country, state }

        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                const lat = swLat + (neLat - swLat) * (i + 0.5) / 3;
                const lon = swLon + (neLon - swLon) * (j + 0.5) / 3;
                const r = lookupPoint(lat, lon);
                if (r.country) hits.push(r);
            }
        }

        if (hits.length === 0) return { country: null, state: null };

        // Pick the most frequently occurring country
        const countryCount = {};
        for (const h of hits) countryCount[h.country] = (countryCount[h.country] || 0) + 1;
        const country = Object.entries(countryCount).sort((a, b) => b[1] - a[1])[0][0];

        // Collect unique states within that country, preserving first-seen order
        const seen = new Set();
        const states = [];
        for (const h of hits) {
            if (h.country === country && h.state && !seen.has(h.state)) {
                seen.add(h.state);
                states.push(h.state);
            }
        }

        return { country, state: states.length > 0 ? states.join(' / ') : null };
    }

    return {
        setCountries(features) { _countries = withBbox(features); },
        setStates(features)    { _states    = withBbox(features); },
        lookup:       lookupPoint,
        lookupBounds: lookupBounds
    };
})();
