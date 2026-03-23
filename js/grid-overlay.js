// Custom Leaflet layer that draws the Maidenhead grid as SVG lines and labels.
// Depends on: Maidenhead (maidenhead.js) and L (leaflet.js)

const MaidenheadGridLayer = L.Layer.extend({
    onAdd(map) {
        this._map = map;

        // Attach SVG directly to the map container (not a Leaflet pane).
        // Leaflet animates panning by CSS-transforming pane divs, which would
        // misalign the grid between redraws. The map container itself is never
        // transformed, so latLngToContainerPoint() coords are always correct here.
        this._svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this._svg.style.cssText = 'position:absolute;top:0;left:0;z-index:420;pointer-events:none;overflow:visible;';
        map.getContainer().appendChild(this._svg);

        map.on('moveend zoomend', this._redraw, this);
        this._redraw();
    },

    onRemove(map) {
        this._svg.remove();
        map.off('moveend zoomend', this._redraw, this);
        delete this._svg;
    },

    _px(lat, lon) {
        // Returns container pixel point for a geographic coordinate
        return this._map.latLngToContainerPoint(L.latLng(lat, lon));
    },

    _redraw() {
        const map  = this._map;
        const svg  = this._svg;
        const zoom = map.getZoom();

        // Resize SVG to map container
        const size = map.getSize();
        svg.setAttribute('width',  size.x);
        svg.setAttribute('height', size.y);

        // Clear previous drawing
        while (svg.firstChild) svg.removeChild(svg.firstChild);

        const bounds = map.getBounds();
        const west   = Math.max(bounds.getWest(),  -180);
        const east   = Math.min(bounds.getEast(),   180);
        const south  = Math.max(bounds.getSouth(),  -90);
        const north  = Math.min(bounds.getNorth(),   90);

        if (zoom < 5) {
            this._drawFieldGrid(west, east, south, north);
        } else {
            this._drawFieldGrid(west, east, south, north, true);
            this._drawSquareGrid(bounds);
        }
    },

    // Draw the 20°×10° field grid lines and (optionally light) field labels
    _drawFieldGrid(west, east, south, north, faint) {
        const svg = this._svg;
        const g   = this._svgGroup(svg);

        const lineColor  = faint ? 'rgba(30,80,160,0.25)' : 'rgba(30,80,160,0.55)';
        const lineWidth  = faint ? '0.8' : '1.2';

        // Vertical field lines (longitude boundaries every 20°)
        for (let lon = -180; lon <= 180; lon += 20) {
            if (lon < west - 20 || lon > east + 20) continue;
            const p0 = this._px(Math.max(south - 5, -90), lon);
            const p1 = this._px(Math.min(north + 5,  90), lon);
            this._line(g, p0, p1, lineColor, lineWidth);
        }

        // Horizontal field lines (latitude boundaries every 10°)
        for (let lat = -90; lat <= 90; lat += 10) {
            if (lat < south - 10 || lat > north + 10) continue;
            const p0 = this._px(lat, Math.max(west - 20, -180));
            const p1 = this._px(lat, Math.min(east + 20,  180));
            this._line(g, p0, p1, lineColor, lineWidth);
        }

        // Field labels — always shown
        const visibleFields = Maidenhead.fieldsInBounds(this._map.getBounds());
        for (const f of visibleFields) {
            const cp = this._px(f.centerLat, f.centerLon);
            this._text(g, cp.x, cp.y, f.label, {
                fontSize: faint ? '14px' : '18px',
                fontWeight: 'bold',
                fill: faint ? 'rgba(30,80,160,0.35)' : 'rgba(30,80,160,0.45)',
                letterSpacing: '2px'
            });
        }
    },

    // Draw 2°×1° square sub-grid for visible fields + digit labels
    _drawSquareGrid(bounds) {
        const svg    = this._svg;
        const g      = this._svgGroup(svg);
        const fields = Maidenhead.fieldsInBounds(bounds);

        for (const f of fields) {
            const squares = Maidenhead.squaresInField(f.label);

            // Draw square lines within this field
            // Vertical lines every 2° inside the field
            for (let lon = f.swLon + 2; lon < f.neLon; lon += 2) {
                if (lon <= bounds.getWest() - 2 || lon >= bounds.getEast() + 2) continue;
                const p0 = this._px(Math.max(f.swLat, bounds.getSouth() - 1), lon);
                const p1 = this._px(Math.min(f.neLat, bounds.getNorth() + 1), lon);
                this._line(g, p0, p1, 'rgba(30,80,160,0.25)', '0.5');
            }
            // Horizontal lines every 1° inside the field
            for (let lat = f.swLat + 1; lat < f.neLat; lat += 1) {
                if (lat <= bounds.getSouth() - 1 || lat >= bounds.getNorth() + 1) continue;
                const p0 = this._px(lat, Math.max(f.swLon, bounds.getWest() - 2));
                const p1 = this._px(lat, Math.min(f.neLon, bounds.getEast() + 2));
                this._line(g, p0, p1, 'rgba(30,80,160,0.25)', '0.5');
            }

            // Square labels — only if cells are large enough to be readable
            // Measure pixel height of one square cell
            const topPx    = this._px(f.swLat + 1, f.swLon).y;
            const bottomPx = this._px(f.swLat,     f.swLon).y;
            const cellH    = Math.abs(bottomPx - topPx);
            const cellW    = Math.abs(this._px(f.swLat, f.swLon + 2).x - this._px(f.swLat, f.swLon).x);

            if (cellH >= 16 && cellW >= 20) {
                for (const sq of squares) {
                    if (sq.centerLon < bounds.getWest()  || sq.centerLon > bounds.getEast()  ||
                        sq.centerLat < bounds.getSouth() || sq.centerLat > bounds.getNorth()) continue;
                    const cp = this._px(sq.centerLat, sq.centerLon);
                    this._text(g, cp.x, cp.y, sq.label, {
                        fontSize: '11px',
                        fontWeight: 'normal',
                        fill: 'rgba(30,80,160,0.6)'
                    });
                }
            }
        }
    },

    // SVG helpers
    _svgGroup(svg) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        svg.appendChild(g);
        return g;
    },

    _line(parent, p0, p1, stroke, strokeWidth) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        el.setAttribute('x1', Math.round(p0.x));
        el.setAttribute('y1', Math.round(p0.y));
        el.setAttribute('x2', Math.round(p1.x));
        el.setAttribute('y2', Math.round(p1.y));
        el.setAttribute('stroke', stroke);
        el.setAttribute('stroke-width', strokeWidth);
        parent.appendChild(el);
        return el;
    },

    _text(parent, x, y, content, opts) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        el.setAttribute('x', Math.round(x));
        el.setAttribute('y', Math.round(y));
        el.setAttribute('text-anchor', 'middle');
        el.setAttribute('dominant-baseline', 'middle');
        el.setAttribute('font-family', 'monospace, sans-serif');
        el.setAttribute('font-size', opts.fontSize || '14px');
        el.setAttribute('font-weight', opts.fontWeight || 'normal');
        el.setAttribute('fill', opts.fill || 'rgba(30,80,160,0.5)');
        if (opts.letterSpacing) el.setAttribute('letter-spacing', opts.letterSpacing);
        el.textContent = content;
        parent.appendChild(el);
        return el;
    }
});
