// Custom Leaflet layer that draws the Maidenhead grid as SVG lines and labels.
// Depends on: Maidenhead (maidenhead.js) and L (leaflet.js)

const MaidenheadGridLayer = L.Layer.extend({
    onAdd(map) {
        this._map = map;

        // Place the SVG inside a dedicated Leaflet pane so it sits in the normal
        // Leaflet z-order (above GeoJSON tiles, below markers and popups).
        // Leaflet transforms the map pane during panning, so we counter-translate
        // the SVG by the inverse of that transform on every draw, which keeps our
        // container-relative coordinates correctly aligned at all times.
        if (!map.getPane('gridPane')) {
            const pane = map.createPane('gridPane');
            pane.style.zIndex = 350; // above tilePane(200), below overlayPane(400)/popupPane(700)
            pane.style.pointerEvents = 'none';
        }

        this._svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this._svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;overflow:visible;';
        map.getPane('gridPane').appendChild(this._svg);

        map.on('move zoom', this._scheduleRedraw, this);
        map.on('moveend zoomend', this._redraw, this);
        this._redraw();
    },

    onRemove(map) {
        this._svg.remove();
        map.off('move zoom', this._scheduleRedraw, this);
        map.off('moveend zoomend', this._redraw, this);
        if (this._rafId) cancelAnimationFrame(this._rafId);
        delete this._svg;
    },

    _scheduleRedraw() {
        if (this._rafId) return;
        this._rafId = requestAnimationFrame(() => {
            this._rafId = null;
            this._redraw();
        });
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

        // The gridPane lives inside .leaflet-map-pane which Leaflet shifts via
        // CSS transform during panning. Counter-translate the SVG by the inverse
        // so our container-relative pixel coordinates remain correct.
        const pos = map._getMapPanePos();
        svg.style.transform = `translate(${-pos.x}px,${-pos.y}px)`;

        // Clear previous drawing
        while (svg.firstChild) svg.removeChild(svg.firstChild);

        const bounds = map.getBounds();
        // Use raw (unwrapped) bounds — Leaflet reports longitudes beyond ±180
        // when panned across the antimeridian, and latLngToContainerPoint handles them.
        const west  = bounds.getWest();
        const east  = bounds.getEast();
        const south = Math.max(bounds.getSouth(), -90);
        const north = Math.min(bounds.getNorth(),  90);

        if (zoom < 5) {
            this._drawFieldGrid(west, east, south, north);
        } else {
            this._drawFieldGrid(west, east, south, north, true);
            this._drawSquareGrid(west, east, south, north);
        }
    },

    // Draw the 20°×10° field grid lines and labels.
    // Longitude loops start from the first aligned value west of `west` so the
    // grid covers any world copy the user has panned to.
    _drawFieldGrid(west, east, south, north, faint) {
        const svg = this._svg;
        const g   = this._svgGroup(svg);

        const lineColor = faint ? 'rgba(40,40,55,0.3)' : 'rgba(40,40,55,0.6)';
        const lineWidth = faint ? '0.8' : '1.5';

        // Vertical field lines every 20°
        const vStart = Math.floor(west / 20) * 20;
        for (let lon = vStart; lon <= east + 20; lon += 20) {
            const p0 = this._px(Math.max(south - 5, -90), lon);
            const p1 = this._px(Math.min(north + 5,  90), lon);
            this._line(g, p0, p1, lineColor, lineWidth);
        }

        // Horizontal field lines every 10°
        for (let lat = -90; lat <= 90; lat += 10) {
            if (lat < south - 10 || lat > north + 10) continue;
            const p0 = this._px(lat, west - 20);
            const p1 = this._px(lat, east + 20);
            this._line(g, p0, p1, lineColor, lineWidth);
        }

        // Field labels — iterate over the visible longitude range in 20° steps
        const lStart = Math.floor(west / 20) * 20;
        for (let lon = lStart; lon < east; lon += 20) {
            const centerLon = lon + 10;
            for (let lati = 0; lati < 18; lati++) {
                const swLat = -90 + lati * 10;
                if (swLat + 10 < south || swLat > north) continue;
                const centerLat = swLat + 5;
                // fromLatLon normalises longitude internally, giving the right label
                const label = Maidenhead.fromLatLon(centerLat, centerLon).substring(0, 2);
                const cp = this._px(centerLat, centerLon);
                this._text(g, cp.x, cp.y, label, {
                    fontSize: faint ? '13px' : '18px',
                    fontWeight: 'bold',
                    fill: 'rgba(30,30,50,0.75)',
                    stroke: 'rgba(255,255,255,0.8)',
                    strokeWidth: faint ? '2' : '3',
                    letterSpacing: '2px'
                });
            }
        }
    },

    // Draw 2°×1° square sub-grid and labels, covering the full visible lon range.
    _drawSquareGrid(west, east, south, north) {
        const svg = this._svg;
        const g   = this._svgGroup(svg);

        // Iterate over visible fields by longitude/latitude
        const fLonStart = Math.floor(west / 20) * 20;
        const fLatStart = Math.floor(Math.max(south, -90) / 10) * 10;

        for (let fLon = fLonStart; fLon < east; fLon += 20) {
            for (let fLat = fLatStart; fLat < Math.min(north, 90); fLat += 10) {
                // Interior vertical lines every 2° within this field
                for (let lon = fLon + 2; lon < fLon + 20; lon += 2) {
                    if (lon <= west - 2 || lon >= east + 2) continue;
                    const p0 = this._px(Math.max(fLat,        south - 1), lon);
                    const p1 = this._px(Math.min(fLat + 10, north + 1), lon);
                    this._line(g, p0, p1, 'rgba(40,40,55,0.3)', '0.6');
                }
                // Interior horizontal lines every 1° within this field
                for (let lat = fLat + 1; lat < fLat + 10; lat += 1) {
                    if (lat <= south - 1 || lat >= north + 1) continue;
                    const p0 = this._px(lat, Math.max(fLon,        west - 2));
                    const p1 = this._px(lat, Math.min(fLon + 20, east + 2));
                    this._line(g, p0, p1, 'rgba(40,40,55,0.3)', '0.6');
                }

                // Square labels — only if cells are tall/wide enough
                const cellH = Math.abs(this._px(fLat + 1, fLon).y - this._px(fLat, fLon).y);
                const cellW = Math.abs(this._px(fLat, fLon + 2).x - this._px(fLat, fLon).x);

                if (cellH >= 16 && cellW >= 20) {
                    for (let di = 0; di < 10; di++) {
                        for (let dj = 0; dj < 10; dj++) {
                            const cLon = fLon + di * 2 + 1;
                            const cLat = fLat + dj * 1 + 0.5;
                            if (cLon < west || cLon > east || cLat < south || cLat > north) continue;
                            const label = Maidenhead.fromLatLon(cLat, cLon);
                            const cp = this._px(cLat, cLon);
                            this._text(g, cp.x, cp.y, label, {
                                fontSize: '11px',
                                fontWeight: '600',
                                fill: 'rgba(30,30,50,0.85)',
                                stroke: 'rgba(255,255,255,0.85)',
                                strokeWidth: '2'
                            });
                        }
                    }
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
        el.setAttribute('fill', opts.fill || 'rgba(30,30,50,0.75)');
        if (opts.stroke) {
            el.setAttribute('stroke', opts.stroke);
            el.setAttribute('stroke-width', opts.strokeWidth || '2');
            el.setAttribute('paint-order', 'stroke fill');
        }
        if (opts.letterSpacing) el.setAttribute('letter-spacing', opts.letterSpacing);
        el.textContent = content;
        parent.appendChild(el);
        return el;
    }
});
