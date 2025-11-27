// Region map rendering using Leaflet tiles (no GeoJSON)
// Exports: renderRegionMap(containerId, points)
// points: optional array of { lat, lon } used to fit the viewport

export function renderRegionMap(containerId, points = []) {
  const container = document.getElementById(containerId.replace('#','')) || document.querySelector(containerId);
  if (!container) throw new Error(`Container ${containerId} not found`);

  // Clear container so re-renders on resize recreate the map cleanly
  container.innerHTML = '';

  // If Leaflet is unavailable, show a friendly message
  if (typeof L === 'undefined') {
    console.warn('[RegionMap] Leaflet (window.L) is undefined. The Leaflet JS/CSS may have failed to load. If you used integrity/crossorigin attributes, ensure the SRI hash matches the CDN file or remove them.');
    const fallback = document.createElement('div');
    fallback.style.display = 'flex';
    fallback.style.alignItems = 'center';
    fallback.style.justifyContent = 'center';
    fallback.style.height = '100%';
    fallback.style.color = 'var(--muted, #94a3b8)';
    fallback.textContent = 'Map unavailable (Leaflet not loaded)';
    container.appendChild(fallback);
    return;
  }

  // Create Leaflet map
  const map = L.map(container, {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: true,
    dragging: true
  });

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Compute bounds from points, with trimming to avoid outliers
  let bounds = null;
  if (points && points.length) {
    const lats = points.map(p => p.lat).filter(Number.isFinite).sort((a,b)=>a-b);
    const lons = points.map(p => p.lon).filter(Number.isFinite).sort((a,b)=>a-b);
    if (lats.length && lons.length) {
      const q = (arr, t) => arr[Math.max(0, Math.min(arr.length - 1, Math.floor(t * (arr.length - 1))))];
      const latMin = q(lats, 0.01), latMax = q(lats, 0.99);
      const lonMin = q(lons, 0.01), lonMax = q(lons, 0.99);
      bounds = L.latLngBounds([
        [latMin, lonMin],
        [latMax, lonMax]
      ]);
    }
  }

  // Default to NYC if no points available
  if (!bounds) {
    bounds = L.latLngBounds([
      [40.4774, -74.2591], // SW NYC approx
      [40.9176, -73.7004]  // NE NYC approx
    ]);
  }

  map.fitBounds(bounds, { padding: [10, 10] });

  // Optional: small marker at center for reference (disabled by default)
  // L.marker(bounds.getCenter(), { opacity: 0.0 }).addTo(map);
}
