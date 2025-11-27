// Leaflet basemap for NYC with simple crash dots
// Exports: renderLeafletNYC(containerId, points = [], options = {})

let maps = new Map(); // containerId -> L.Map
let dotLayers = new Map(); // containerId -> L.LayerGroup

export function renderLeafletNYC(containerId, points = [], options = {}) {
  const id = containerId.replace('#','');
  const el = document.getElementById(id) || document.querySelector(containerId);
  if (!el) throw new Error(`Leaflet container ${containerId} not found`);

  const {
    dotRadiusPx = 1, // 1/3 of previous default (3px)
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
    if (injuryMode) {
      if (p.injured) {
        const v = Math.max(p.severity || 0, p.injuredCount || 0);
        const t = maxSev > 0 ? (v / maxSev) : 0;
        color = colorScale(t);
        fillOpacity = 0.9;
        radius = Math.max(1, Math.round(dotRadiusPx + t * 2));
      } else {
        color = 'rgba(148,163,184,0.6)';
        fillOpacity = 0.35;
      }
    }
    L.circleMarker([p.lat, p.lon], {
      radius,
      renderer: canvas,
      color,
      fillColor: color,
      fillOpacity,
      opacity: fillOpacity,
      weight: 0.5,
    }).addTo(group);
  });

  group.addTo(map);
  dotLayers.set(id, group);
}
