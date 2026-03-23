// Maidenhead Locator System grid math
// Supports 2-char field (e.g. "CN") and 4-char square (e.g. "CN92")

const Maidenhead = (() => {
    const FIELD_LETTERS = 'ABCDEFGHIJKLMNOPQR'; // 18 chars A-R
    const LON_ORIGIN    = -180;
    const LAT_ORIGIN    = -90;
    const FIELD_LON     = 20;  // degrees per field in longitude
    const FIELD_LAT     = 10;  // degrees per field in latitude
    const SQ_LON        = 2;   // degrees per square in longitude
    const SQ_LAT        = 1;   // degrees per square in latitude

    // Returns null if valid, or an error string if invalid.
    function validate(raw) {
        if (typeof raw !== 'string') return 'Not a string';
        const s = raw.toUpperCase();
        if (s.length !== 2 && s.length !== 4) return 'Must be 2 or 4 characters';
        const f1 = FIELD_LETTERS.indexOf(s[0]);
        const f2 = FIELD_LETTERS.indexOf(s[1]);
        if (f1 < 0) return `First character '${s[0]}' is not a valid field letter (A-R)`;
        if (f2 < 0) return `Second character '${s[1]}' is not a valid field letter (A-R)`;
        if (s.length === 4) {
            if (!/^[0-9]$/.test(s[2])) return `Third character '${s[2]}' must be a digit 0-9`;
            if (!/^[0-9]$/.test(s[3])) return `Fourth character '${s[3]}' must be a digit 0-9`;
        }
        return null;
    }

    // Returns { swLat, swLon, neLat, neLon } for a 2-char or 4-char locator.
    function toBounds(raw) {
        const s = raw.toUpperCase();
        const f1 = FIELD_LETTERS.indexOf(s[0]);
        const f2 = FIELD_LETTERS.indexOf(s[1]);
        let swLon = LON_ORIGIN + f1 * FIELD_LON;
        let swLat = LAT_ORIGIN + f2 * FIELD_LAT;
        let wLon = FIELD_LON;
        let wLat = FIELD_LAT;
        if (s.length >= 4) {
            const d1 = parseInt(s[2], 10);
            const d2 = parseInt(s[3], 10);
            swLon += d1 * SQ_LON;
            swLat += d2 * SQ_LAT;
            wLon = SQ_LON;
            wLat = SQ_LAT;
        }
        return { swLat, swLon, neLat: swLat + wLat, neLon: swLon + wLon };
    }

    // Returns { lat, lon } center point of the locator cell.
    function toCenter(raw) {
        const b = toBounds(raw);
        return {
            lat: (b.swLat + b.neLat) / 2,
            lon: (b.swLon + b.neLon) / 2
        };
    }

    // Returns array of all 324 field objects: { label, swLat, swLon, neLat, neLon, centerLat, centerLon }
    function allFields() {
        const fields = [];
        for (let loni = 0; loni < 18; loni++) {
            for (let lati = 0; lati < 18; lati++) {
                const label = FIELD_LETTERS[loni] + FIELD_LETTERS[lati];
                const swLon = LON_ORIGIN + loni * FIELD_LON;
                const swLat = LAT_ORIGIN + lati * FIELD_LAT;
                fields.push({
                    label,
                    swLon, swLat,
                    neLon: swLon + FIELD_LON,
                    neLat: swLat + FIELD_LAT,
                    centerLon: swLon + FIELD_LON / 2,
                    centerLat: swLat + FIELD_LAT / 2
                });
            }
        }
        return fields;
    }

    // Returns array of all 100 square objects within a given field label.
    function squaresInField(fieldLabel) {
        const fl = fieldLabel.toUpperCase();
        const f1 = FIELD_LETTERS.indexOf(fl[0]);
        const f2 = FIELD_LETTERS.indexOf(fl[1]);
        const fieldSwLon = LON_ORIGIN + f1 * FIELD_LON;
        const fieldSwLat = LAT_ORIGIN + f2 * FIELD_LAT;
        const squares = [];
        for (let loni = 0; loni < 10; loni++) {
            for (let lati = 0; lati < 10; lati++) {
                const swLon = fieldSwLon + loni * SQ_LON;
                const swLat = fieldSwLat + lati * SQ_LAT;
                squares.push({
                    label: fl + loni.toString() + lati.toString(),
                    digits: loni.toString() + lati.toString(),
                    swLon, swLat,
                    neLon: swLon + SQ_LON,
                    neLat: swLat + SQ_LAT,
                    centerLon: swLon + SQ_LON / 2,
                    centerLat: swLat + SQ_LAT / 2
                });
            }
        }
        return squares;
    }

    // Returns array of field objects whose bounds overlap the given Leaflet bounds.
    function fieldsInBounds(mapBounds) {
        const west  = mapBounds.getWest();
        const east  = mapBounds.getEast();
        const south = mapBounds.getSouth();
        const north = mapBounds.getNorth();
        return allFields().filter(f =>
            f.neLon > west && f.swLon < east &&
            f.neLat > south && f.swLat < north
        );
    }

    // Returns the 4-char square locator for a geographic coordinate.
    function fromLatLon(lat, lon) {
        const normLon = ((lon + 180) % 360 + 360) % 360; // 0–360
        const normLat = lat + 90;                         // 0–180
        const f1 = Math.min(Math.floor(normLon / 20), 17);
        const f2 = Math.min(Math.floor(normLat / 10), 17);
        const d1 = Math.min(Math.floor((normLon % 20) / 2), 9);
        const d2 = Math.min(Math.floor(normLat % 10), 9);
        return FIELD_LETTERS[f1] + FIELD_LETTERS[f2] + d1 + d2;
    }

    // Great-circle distance between two lat/lon points using Haversine formula.
    function haversineKm(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2
                + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
                * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.asin(Math.sqrt(a));
    }

    // Distance in km and miles between the centers of two locator strings.
    function distance(locA, locB) {
        const a = toCenter(locA);
        const b = toCenter(locB);
        const km = haversineKm(a.lat, a.lon, b.lat, b.lon);
        return { km: Math.round(km), mi: Math.round(km * 0.621371) };
    }

    return { validate, toBounds, toCenter, fromLatLon, distance, allFields, squaresInField, fieldsInBounds };
})();
