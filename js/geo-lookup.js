// Offline country/state lookup via point-in-polygon against Natural Earth GeoJSON.
// GeoJSON coordinates are [longitude, latitude].

const GeoLookup = (() => {
    let _countries = null;
    let _states    = null;

    // Ray-casting point-in-polygon for a single ring (array of [lon, lat] pairs).
    // Returns true if pt=[lon,lat] is inside the ring.
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

    // Returns true if pt is inside a GeoJSON Polygon geometry.
    // Polygon coords: [ outerRing, ...holeRings ]
    function pointInPolygon(pt, polygon) {
        const rings = polygon.coordinates;
        if (!pointInRing(pt, rings[0])) return false;
        // If inside outer ring, check it's not inside any hole
        for (let h = 1; h < rings.length; h++) {
            if (pointInRing(pt, rings[h])) return false;
        }
        return true;
    }

    // Returns true if pt is inside any polygon of a GeoJSON MultiPolygon geometry.
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

    return {
        setCountries(features) { _countries = features; },
        setStates(features)    { _states    = features; },

        // Returns { country, state } for a geographic coordinate.
        // Either value may be null (ocean, or states not loaded).
        lookup(lat, lon) {
            const pt = [lon, lat]; // GeoJSON order
            return {
                country: findName(_countries, pt, 'NAME'),
                state:   findName(_states,    pt, 'name')
            };
        }
    };
})();
