// Leaflet basemap for NYC with simple crash dots
// Exports: renderLeafletNYC(containerId, points = [], options = {})

let maps = new Map(); // containerId -> L.Map
let dotLayers = new Map(); // containerId -> L.LayerGroup
let legends = new Map(); // containerId -> L.Control legend

export function renderLeafletNYC(containerId, points = [], options = {}) {
  const id = containerId.replace('#','');
  const el = document.getElementById(id) || document.querySelector(containerId);
  if (!el) throw new Error(`Leaflet container ${containerId} not found`);

  const {
    dotRadiusPx = 2, // make base dots a bit larger for clarity
    dotColor = '#e60026', // red dots by default
    dotOpacity = 0.75,
    injuryMode = false,
  } = options;

  // Ensure the container has some height; fallback if CSS not applied
  if (!el.style.height) {
    el.style.height = '50vh';
  }

  // Create or reuse map
  let map = maps.get(id);
  if (!map) {
    // NYC center and zoom
    const nyc = [40.7128, -74.0060];
    map = L.map(el, {
      center: nyc,
      zoom: 11,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    maps.set(id, map);

    // Slight delay to fix initial sizing if in a reveal animation
    setTimeout(() => map.invalidateSize(), 200);
  } else {
    // On re-render (e.g., resize), just invalidate size
    map.invalidateSize();
  }

  // Remove previous dots layer if present
  const prev = dotLayers.get(id);
  if (prev) {
    map.removeLayer(prev);
  }

  if (!points || points.length === 0) {
    dotLayers.set(id, null);
    const prevLegend = legends.get(id);
    if (prevLegend) {
      try { map.removeControl(prevLegend); } catch (e) {}
      legends.set(id, null);
    }
    return;
  }

  // Use canvas renderer for performance
  const canvas = L.canvas({ padding: 0.2 });
  const group = L.layerGroup([], { renderer: canvas });

  // Color scheme: if injuryMode, color injured by severity/number; else uniform color
  const colorScale = (v) => {
    // v in [0..max]; map to YlOrRd palette
    const t = Math.max(0, Math.min(1, v));
    return d3.interpolateYlOrRd(t);
  };
  // Compute normalization for severity
  let maxSev = 1;
  if (injuryMode) {
    maxSev = d3.max(points, p => {
      const v = Math.max(p?.severity || 0, p?.injuredCount || 0);
      return Number.isFinite(v) ? v : 0;
    }) || 1;
  }

  points.forEach(p => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return;
    let color = dotColor;
    let fillOpacity = dotOpacity;
    let radius = dotRadiusPx;
    let weight = 0.5;
    if (injuryMode) {
      if (p.injured) {
        const v = Math.max(p.severity || 0, p.injuredCount || 0);
        const t = maxSev > 0 ? (v / maxSev) : 0;
        color = colorScale(t);
        fillOpacity = 0.95;
        radius = Math.max(2, Math.round(dotRadiusPx + 1 + t * 3));
        weight = t > 0.6 ? 1.2 : 0.8;
      } else {
        color = 'rgba(148,163,184,0.35)';
        fillOpacity = 0.25;
        weight = 0.2;
      }
    }
    L.circleMarker([p.lat, p.lon], {
      radius,
      renderer: canvas,
      color,
      fillColor: color,
      fillOpacity,
      opacity: fillOpacity,
      weight,
    }).addTo(group);
  });

  group.addTo(map);
  dotLayers.set(id, group);

  // --- Legend control (injury mode only) ---
  const prevLegend = legends.get(id);
  if (prevLegend) {
    try { map.removeControl(prevLegend); } catch (e) {}
    legends.set(id, null);
  }
  if (injuryMode) {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function() {
      const div = L.DomUtil.create('div', 'leaflet-control legend-control');
      div.style.background = 'rgba(14,23,42,0.92)';
      div.style.color = '#e5edff';
      div.style.padding = '8px 10px';
      div.style.border = '1px solid #334155';
      div.style.borderRadius = '8px';
      div.style.fontSize = '12px';
      div.style.boxShadow = '0 6px 16px rgba(0,0,0,0.35)';
      const steps = 12;
      let gradient = 'linear-gradient(to right,';
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const col = d3.interpolateYlOrRd(t);
        gradient += `${col} ${Math.round(t * 100)}%${i < steps ? ', ' : ''}`;
      }
      const title = 'Injury intensity';
      const bar = `<div style="width:200px;height:10px;background:${gradient};border:1px solid #334155;border-radius:4px;margin:4px 0;"></div>`;
      const labels = `<div style="display:flex;justify-content:space-between;"><span>Lower</span><span>Higher</span></div>`;
      const note = `<div style="color:#cbd5e1;margin-top:2px;">Color by number/severity</div>`;
      div.innerHTML = `<div style="font-weight:600;">${title}</div>${bar}${labels}${note}`;
      return div;
    };
    legend.addTo(map);
    legends.set(id, legend);
  }
}
