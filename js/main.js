// Main orchestrator module
// Loads data, processes it, renders the heatmap, point map, and factor chart, and handles resize.

import { loadCollisions, loadLocations, loadAnalysis } from './dataLoader.js';
import { buildGrid } from './dataProcessor.js';
import { renderHeatmap } from './heatmapChart.js';
// import { renderPointMap } from './pointMap.js';
import { renderLeafletNYC } from './leafletMap.js';
import { analyzeFactors } from './analysis.js';
import { renderFactorChart } from './factorViz.js';

const CSV_PATH = 'data/original/collisions_severity.csv';

function formatHour(h) {
  if (h == null || !Number.isFinite(h)) return 'All';
  const hh = String(h).padStart(2, '0');
  return `${hh}:00`;
}

function getSelectedHour() {
  const slider = document.getElementById('hour-slider');
  if (!slider) return null;
  const v = +slider.value;
  return Number.isFinite(v) ? v : null;
}

function updateHourLabel() {
  const label = document.getElementById('hour-label');
  const slider = document.getElementById('hour-slider');
  if (!label || !slider) return;
  const hour = getSelectedHour();
  label.textContent = formatHour(hour);
  // keep ARIA attributes in sync
  slider.setAttribute('aria-valuenow', String(hour ?? ''));
}

function filterPointsByHour(arr, hour) {
  if (!arr || !arr.length) return [];
  if (hour == null || !Number.isFinite(hour)) return arr;
  return arr.filter(p => p && Number.isFinite(p.hour) && p.hour === hour);
}

function isChecked(id) {
  const el = document.getElementById(id);
  return !!(el && el.checked);
}

function renderMapForCurrentHour(allPoints) {
  const hour = getSelectedHour();
  const filtered = filterPointsByHour(allPoints || [], hour);
  const injuryMode = isChecked('map-injury-mode');
  renderLeafletNYC(LEAFLET_CONTAINER_ID, filtered, { dotColor: '#e60026', injuryMode });
}
const HEATMAP_CONTAINER_ID = 'chart';
const MAP_CONTAINER_ID = 'map';
const FACTOR_CONTAINER_ID = 'factors';
const LEAFLET_CONTAINER_ID = 'leaflet-map';

let model = null;
let points = null;
let factors = null;
let collisions = null; // raw collision rows with dates and hours
let analysisData = null; // rows for factor analysis

function renderTimeInsight(rows) {
  try {
    const el = document.getElementById('time-insight');
    if (!el || !rows || !rows.length) return;
    el.style.color = '#ffffff'; // Set text color to white

    // Group by year and month
    const byMonth = new Map(); // key: YYYY-MM -> count
    rows.forEach(r => {
      if (!r || !r.date) return;
      const y = r.date.getFullYear();
      const m = r.date.getMonth() + 1;
      const key = `${y}-${String(m).padStart(2,'0')}`;
      byMonth.set(key, (byMonth.get(key) || 0) + 1);
    });

    // Split into pre-2020 and 2020+
    let preSum = 0, preN = 0, postSum = 0, postN = 0;
    for (const [key, cnt] of byMonth.entries()) {
      const y = +key.slice(0,4);
      if (y < 2020) { preSum += cnt; preN++; }
      else { postSum += cnt; postN++; }
    }

    const preAvg = preN ? preSum / preN : 0;
    const postAvg = postN ? postSum / postN : 0;
    const diffPct = (preAvg && postAvg) ? ((preAvg - postAvg) / preAvg) * 100 : 0;

    // Compose explanation
    const parts = [];
    if (preN && postN) {
      parts.push(`Avg monthly collisions before 2020: ${preAvg.toFixed(1)}; since 2020: ${postAvg.toFixed(1)}.`);
      parts.push(`${diffPct >= 0 ? 'That\'s' : 'That\'s about a'} ${Math.abs(diffPct).toFixed(0)}% ${diffPct >= 0 ? 'lower' : 'higher'} since 2020 in this dataset.`);
    }
    parts.push('Reason: 2020 brought pandemic shutdowns and lasting traffic shifts, so counts dropped after 2020. Also note the heatmap uses a percentile-based color scale within the shown window, so “more red” reflects relatively higher counts, not an absolute unit scale.');

    el.textContent = parts.join(' ');
  } catch (e) {
    // ignore insight errors
  }
}



async function init() {
  try {
    const [raw, locs, analysisRows] = await Promise.all([
      loadCollisions(CSV_PATH),
      loadLocations(CSV_PATH),
      loadAnalysis(CSV_PATH)
    ]);
    collisions = raw;
    model = buildGrid(raw);
    points = locs;
    analysisData = analysisRows;
    factors = analyzeFactors(analysisRows);

    // Setup slider interactions
    const slider = document.getElementById('hour-slider');
    if (slider) {
      slider.addEventListener('input', () => {
        updateHourLabel();
        renderMapForCurrentHour(points);
      });
      updateHourLabel();
    }

    const mode = getHeatmapMode();
    const hmInjury = isChecked('hm-injury-mode');
    renderHeatmap(HEATMAP_CONTAINER_ID, model, { mode, injuryMode: hmInjury });
    renderTimeInsight(collisions);
    // Render Leaflet map filtered to selected hour (injury mode handled inside)
    renderMapForCurrentHour(points);
    const facInjury = isChecked('factors-injury-mode');
    renderFactorChart(FACTOR_CONTAINER_ID, factors, { injuryMode: facInjury });

    // Render quick snapshot charts
    try {
      renderQuickCharts(analysisData);
    } catch (e) { /* ignore */ }

    initHeatmapToggle();

    // Hook up other injury toggles
    const mapInj = document.getElementById('map-injury-mode');
    if (mapInj) mapInj.addEventListener('change', () => renderMapForCurrentHour(points));

    const facInjEl = document.getElementById('factors-injury-mode');
    if (facInjEl) facInjEl.addEventListener('change', () => {
      const facInjury2 = isChecked('factors-injury-mode');
      renderFactorChart(FACTOR_CONTAINER_ID, factors, { injuryMode: facInjury2 });
    });

    // Initialize injury risk estimator
    initEstimator(analysisData);
    try { if (estModel) renderRiskChains('viz-chains', analysisData, estModel); } catch (e) { /* ignore */ }

    const dowInj = document.getElementById('dow-injury-mode');
    if (dowInj) dowInj.addEventListener('change', () => { try { renderQuickCharts(analysisData); } catch(e) {} });
    const vehInj = document.getElementById('vehicle-injury-mode');
    if (vehInj) vehInj.addEventListener('change', () => { try { renderQuickCharts(analysisData); } catch(e) {} });
    const genInj = document.getElementById('gender-injury-mode');
    if (genInj) genInj.addEventListener('change', () => { try { renderQuickCharts(analysisData); } catch(e) {} });
  } catch (err) {
    console.error(err);
    const heatEl = document.getElementById(HEATMAP_CONTAINER_ID);
    const leafletEl = document.getElementById(LEAFLET_CONTAINER_ID);
    const facEl = document.getElementById(FACTOR_CONTAINER_ID);
    if (heatEl) heatEl.innerHTML = '<p>Failed to load or render heatmap.</p>';
    if (leafletEl) leafletEl.innerHTML = '<p>Failed to load or render map.</p>';
    if (facEl) facEl.innerHTML = '<p>Failed to load or render factors.</p>';
  }
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), wait);
  };
}

const onResize = debounce(() => {
  if (model) {
    const mode = getHeatmapMode();
    const hmInjury = isChecked('hm-injury-mode');
    renderHeatmap(HEATMAP_CONTAINER_ID, model, { mode, injuryMode: hmInjury });
  }
  // Re-render combined Leaflet map with current hour filter
  renderMapForCurrentHour(points || []);
  if (factors) {
    const facInjury = isChecked('factors-injury-mode');
    renderFactorChart(FACTOR_CONTAINER_ID, factors, { injuryMode: facInjury });
  }
  // Re-render quick snapshot charts
  try { if (analysisData) renderQuickCharts(analysisData); } catch (e) { /* ignore */ }
  // Re-render risk chains
  try { if (analysisData && estModel) renderRiskChains('viz-chains', analysisData, estModel); } catch (e) { /* ignore */ }
}, 150);

window.addEventListener('resize', onResize);

function getHeatmapMode() {
  const rb = document.querySelector('input[name="hm-norm"]:checked');
  return rb ? rb.value : 'global';
}

function initHeatmapToggle() {
  const radios = document.querySelectorAll('input[name="hm-norm"]');
  if (radios && radios.length) {
    radios.forEach(r => r.addEventListener('change', () => {
      if (model) {
        const mode = getHeatmapMode();
        const hmInjury = isChecked('hm-injury-mode');
        renderHeatmap(HEATMAP_CONTAINER_ID, model, { mode, injuryMode: hmInjury });
      }
    }));
  }
  const inj = document.getElementById('hm-injury-mode');
  if (inj) {
    inj.addEventListener('change', () => {
      if (model) {
        const mode = getHeatmapMode();
        const hmInjury = isChecked('hm-injury-mode');
        renderHeatmap(HEATMAP_CONTAINER_ID, model, { mode, injuryMode: hmInjury });
      }
    });
  }
}

// ---- Quick simple visualizations (intro) ----
function renderQuickCharts(rows) {
  const dowInjury = isChecked('dow-injury-mode');
  const vehInjury = isChecked('vehicle-injury-mode');
  const genInjury = isChecked('gender-injury-mode');
  try { renderDoWChart('viz-dow', rows, { injuryMode: dowInjury }); } catch(e) { /* ignore */ }
  try { renderVehicleChart('viz-vehicle', rows, { injuryMode: vehInjury }); } catch(e) { /* ignore */ }
  try { renderGenderChart('viz-gender', rows, { injuryMode: genInjury }); } catch(e) { /* ignore */ }
}

function ebShrink(a, n, baseRate, k = 50) {
  return (a + k * baseRate) / (n + k);
}

function renderDoWChart(containerId, rows, opts = {}) {
  const el = document.getElementById(containerId);
  if (!el) return; el.innerHTML = '';
  const width = el.clientWidth || 320; const height = el.clientHeight || 240;
  const svg = d3.select(el).append('svg').attr('width', width).attr('height', height);
  const margin = { top: 20, right: 24, bottom: 48, left: 48 };
  const innerW = Math.max(160, width - margin.left - margin.right);
  const innerH = Math.max(100, height - margin.top - margin.bottom);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const data = (rows||[]).filter(r=>r && r.dow!=null);
  if (!data.length) { g.append('text').attr('x', innerW/2).attr('y', innerH/2).attr('text-anchor','middle').attr('fill','var(--muted)').text('No data'); return; }
  const N = data.length; const inj = d3.sum(data, r=>r.injured?1:0); const base = inj/Math.max(1,N);
  const by = d3.rollups(data, v=>({ n:v.length, a:d3.sum(v,r=>r.injured?1:0) }), r=>r.dow);
  // Order Monday (1) to Sunday (0)
  const order = [1,2,3,4,5,6,0];
  const labels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const items = order.map(dow=>{
    const rec = by.find(d=>d[0]===dow)?.[1] || {n:0,a:0};
    const rate = ebShrink(rec.a, rec.n, base);
    return { key: dow, label: labels[dow], n: rec.n, a: rec.a, rate };
  });
  // Do not sort by rate; keep Mon→Sun order for readability

  const x = d3.scaleBand().domain(items.map(d=>d.label)).range([0, innerW]).padding(0.25);
  const useRate = !!opts.injuryMode;
  const y = d3.scaleLinear().domain([0, d3.max(items,d=> useRate ? d.rate : d.n)||0.01]).nice().range([innerH, 0]);

  const bars = g.selectAll('rect').data(items).join('rect')
    .attr('x', d=>x(d.label)).attr('y', d=>y(useRate ? d.rate : d.n)).attr('width', x.bandwidth()).attr('height', d=>innerH - y(useRate ? d.rate : d.n))
    .attr('fill', '#e11d48').attr('opacity', 0.9).attr('rx', 3);

  const xAxis = d3.axisBottom(x);
  const yAxis = useRate ? d3.axisLeft(y).ticks(4).tickFormat(d3.format('.0%')) : d3.axisLeft(y).ticks(4).tickFormat(d3.format('~s'));
  g.append('g').attr('transform', `translate(0,${innerH})`).call(xAxis);
  g.append('g').call(yAxis);

  // baseline only for rate mode
  if (useRate) {
    const baseY = y(base);
    g.append('line').attr('x1',0).attr('x2',innerW).attr('y1',baseY).attr('y2',baseY).attr('stroke','#94a3b8').attr('stroke-dasharray','4,4');
    g.append('text').attr('x', innerW).attr('y', baseY-6).attr('text-anchor','end').attr('fill','var(--muted)').text('Baseline');
  }

  const tooltip = d3.select('#tooltip'); const fmtPct = d3.format('.1%');
  const fmtNum = d3.format('~s');
  bars.on('mousemove', (event,d)=>{
    const val = useRate ? fmtPct(d.rate) : fmtNum(d.n);
    const label = useRate ? `EB rate: ${val}` : `Crashes: ${val}`;
    tooltip.style('left', event.pageX+'px').style('top',(event.pageY-8)+'px').style('opacity',1)
      .html(`<strong>${d.label}</strong><br>${label}<br>n = ${d.n.toLocaleString()}`);
  }).on('mouseout', ()=> tooltip.style('opacity',0));
}

function renderVehicleChart(containerId, rows, opts = {}) {
  const el = document.getElementById(containerId);
  if (!el) return; el.innerHTML = '';
  const width = el.clientWidth || 320; const height = el.clientHeight || 240;
  const svg = d3.select(el).append('svg').attr('width', width).attr('height', height);
  const margin = { top: 20, right: 24, bottom: 72, left: 140 };
  const innerW = Math.max(160, width - margin.left - margin.right);
  const innerH = Math.max(100, height - margin.top - margin.bottom);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const data = (rows||[]).filter(r=>r);
  if (!data.length) { g.append('text').attr('x', innerW/2).attr('y', innerH/2).attr('text-anchor','middle').attr('fill','var(--muted)').text('No data'); return; }
  const N = data.length; const inj = d3.sum(data, r=>r.injured?1:0); const base = inj/Math.max(1,N);
  // Build groups and keep top 8 by n
  // Group by normalized vehicle label so variants aggregate (e.g., station wagon / sport utility -> 'SUV')
  const map = d3.rollups(data, v=>({ n:v.length, a:d3.sum(v,r=>r.injured?1:0) }), r=>normalizeVehicleLabel(cleanCat(r.vehicleType))||'Other');
  let items = map.map(([label, c])=> ({ label, n:c.n, a:c.a, rate: ebShrink(c.a, c.n, base) }));
  // Exclude certain noisy/undesired vehicle type categories (compare lower-case normalized labels)
  const vehExclude = new Set(['4 dr sedan', 'taxi', 'tractor truck diesel']);
  items = items.filter(d => !vehExclude.has(String(d.label).toLowerCase()));
  items.sort((a,b)=> d3.descending(a.n,b.n));
  let top = items.slice(0, 8);
  const useRate = !!opts.injuryMode;
  // Sort by chosen metric for display order
  top.sort((a,b)=> d3.descending(useRate ? a.rate : a.n, useRate ? b.rate : b.n));

  const y = d3.scaleBand().domain(top.map(d=>d.label)).range([0, innerH]).padding(0.25);
  const x = d3.scaleLinear().domain([0, d3.max(top,d=> useRate ? d.rate : d.n)||0.01]).nice().range([0, innerW]);

  const bars = g.selectAll('rect').data(top).join('rect')
    .attr('y', d=>y(d.label)).attr('x', 0).attr('height', y.bandwidth()).attr('width', d=>x(useRate ? d.rate : d.n))
    .attr('fill', '#e11d48').attr('opacity', 0.9).attr('rx', 3);

  const xAxis = useRate ? d3.axisBottom(x).ticks(4).tickFormat(d3.format('.0%')) : d3.axisBottom(x).ticks(4).tickFormat(d3.format('~s'));
  const yAxis = d3.axisLeft(y).tickSizeOuter(0);
  g.append('g').attr('transform', `translate(0,${innerH})`).call(xAxis);
  g.append('g').call(yAxis);

  if (useRate) {
    const baseX = x(base);
    g.append('line').attr('x1', baseX).attr('x2', baseX).attr('y1',0).attr('y2',innerH).attr('stroke','#94a3b8').attr('stroke-dasharray','4,4');
    g.append('text').attr('x', baseX+4).attr('y', 12).attr('fill','var(--muted)').text('Baseline');
  }

  const tooltip = d3.select('#tooltip'); const fmtPct = d3.format('.1%'); const fmtNum = d3.format('~s');
  bars.on('mousemove', (event,d)=>{
    const label = useRate ? `EB rate: ${fmtPct(d.rate)}` : `Crashes: ${fmtNum(d.n)}`;
    tooltip.style('left', event.pageX+'px').style('top',(event.pageY-8)+'px').style('opacity',1)
      .html(`<strong>${d.label}</strong><br>${label}<br>n = ${d.n.toLocaleString()}`);
  }).on('mouseout', ()=> tooltip.style('opacity',0));
}

function renderGenderChart(containerId, rows, opts = {}) {
  const el = document.getElementById(containerId);
  if (!el) return; el.innerHTML = '';
  const width = el.clientWidth || 320; const height = el.clientHeight || 240;
  const svg = d3.select(el).append('svg').attr('width', width).attr('height', height);
  const margin = { top: 20, right: 24, bottom: 48, left: 120 };
  const innerW = Math.max(160, width - margin.left - margin.right);
  const innerH = Math.max(100, height - margin.top - margin.bottom);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const data = (rows||[]).filter(r=>r);
  if (!data.length) { g.append('text').attr('x', innerW/2).attr('y', innerH/2).attr('text-anchor','middle').attr('fill','var(--muted)').text('No data'); return; }
  const N = data.length; const inj = d3.sum(data, r=>r.injured?1:0); const base = inj/Math.max(1,N);
  const map = d3.rollups(data, v=>({ n:v.length, a:d3.sum(v,r=>r.injured?1:0) }), r=>{
    const s = cleanCat(r.driverSex);
    // Treat missing/unspecified driver sex as part of the broader 'Other/Unknown'
    if (s === null) return 'Other/Unknown';
    if (/^m/i.test(s)) return 'Male';
    if (/^f/i.test(s)) return 'Female';
    return 'Other/Unknown';
  });
  const items = map.map(([label, c])=> ({ label, n:c.n, a:c.a, rate: ebShrink(c.a, c.n, base) }));
  // Order Male, Female, Other/Unknown if present
  const desired = ['Male','Female','Other/Unknown','Unknown'];
  items.sort((a,b)=> desired.indexOf(a.label) - desired.indexOf(b.label));

  const x = d3.scaleBand().domain(items.map(d=>d.label)).range([0, innerW]).padding(0.35);
  const useRate = !!opts.injuryMode;
  const y = d3.scaleLinear().domain([0, d3.max(items,d=> useRate ? d.rate : d.n)||0.01]).nice().range([innerH, 0]);

  const color = d => (d.label==='Male' ? '#ef4444' : d.label==='Female' ? '#10b981' : '#94a3b8');

  const bars = g.selectAll('rect').data(items).join('rect')
    .attr('x', d=>x(d.label)).attr('y', d=>y(useRate ? d.rate : d.n)).attr('width', x.bandwidth()).attr('height', d=>innerH - y(useRate ? d.rate : d.n))
    .attr('fill', d=>color(d)).attr('opacity', 0.9).attr('rx', 3);

  const xAxis = d3.axisBottom(x);
  const yAxis = useRate ? d3.axisLeft(y).ticks(4).tickFormat(d3.format('.0%')) : d3.axisLeft(y).ticks(4).tickFormat(d3.format('~s'));
  g.append('g').attr('transform', `translate(0,${innerH})`).call(xAxis);
  g.append('g').call(yAxis);

  if (useRate) {
    const baseY = y(base);
    g.append('line').attr('x1',0).attr('x2',innerW).attr('y1',baseY).attr('y2',baseY).attr('stroke','#94a3b8').attr('stroke-dasharray','4,4');
    g.append('text').attr('x', innerW).attr('y', baseY-6).attr('text-anchor','end').attr('fill','var(--muted)').text('Baseline');
  }

  const tooltip = d3.select('#tooltip'); const fmtPct = d3.format('.1%'); const fmtNum = d3.format('~s');
  bars.on('mousemove', (event,d)=>{
    const label = useRate ? `EB rate: ${fmtPct(d.rate)}` : `Crashes: ${fmtNum(d.n)}`;
    tooltip.style('left', event.pageX+'px').style('top',(event.pageY-8)+'px').style('opacity',1)
      .html(`<strong>${d.label}</strong><br>${label}<br>n = ${d.n.toLocaleString()}`);
  }).on('mouseout', ()=> tooltip.style('opacity',0));
}



function cleanCat(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t || t === 'Unspecified' || t === 'NA' || t === 'Unknown') return null;
  return t;
}

// Normalize vehicle-type labels for display and grouping
function normalizeVehicleLabel(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t) return null;
  const l = t.toLowerCase();
  // Map station wagon / sport utility variants to a concise 'SUV' label
  if (l.includes('station wagon') || l.includes('sport utility') || l.includes('sport-utility') || l.includes('sport') && l.includes('utility') || l.includes('suv')) return 'SUV';
  return t;
}


// ----- Injury Risk Estimator (logistic regression) -----
let estModel = null; // { D, w: Float64Array, b: number, baseRate: number }

function sigmoid(z) { return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z)))); }
function hashStr(s, D) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  h = Math.abs(h);
  return h % D;
}
function featureIndices(choice, D) {
  const idx = new Set();
  const add = (k, v) => {
    if (v == null || v === '' || v === 'Unspecified') return;
    const key = `${k}=${v}`;
    idx.add(hashStr(key, D));
  };
  add('veh', choice.vehicleType || '');
  add('act', choice.preCrash || '');
  add('bor', choice.borough || '');
  // Encode hour and day-of-week as categories
  if (Number.isFinite(choice.hour)) add('hour', String(choice.hour));
  if (Number.isFinite(choice.dow)) add('dow', String(choice.dow));
  // Simple pairwise interactions to catch obvious combos
  if (choice.preCrash && Number.isFinite(choice.hour)) add('actxhour', choice.preCrash + '×' + choice.hour);
  if (choice.preCrash && Number.isFinite(choice.dow)) add('actxdow', choice.preCrash + '×' + choice.dow);
  if (choice.vehicleType && choice.preCrash) add('vehxact', choice.vehicleType + '×' + choice.preCrash);
  return Array.from(idx.values());
}

function trainEstimator(rows, D = 1024) {
  const N = rows.length;
  if (!N) return null;
  const injuredTotal = d3.sum(rows, r => r.injured ? 1 : 0);
  const baseRate = injuredTotal / Math.max(1, N);
  const w = new Float64Array(D);
  let b = Math.log((baseRate + 1e-6) / (1 - baseRate + 1e-6));
  // SGD with L2
  const lr0 = 0.2, lambda = 1e-3, epochs = 3;
  // Build compact arrays of features for speed
  const Xidx = rows.map(r => featureIndices(r, D));
  const y = rows.map(r => r.injured ? 1 : 0);
  for (let ep = 0; ep < epochs; ep++) {
    for (let i = 0; i < N; i++) {
      // dot
      let z = b;
      const idx = Xidx[i];
      for (let k = 0; k < idx.length; k++) z += w[idx[k]];
      const p = sigmoid(z);
      const g = p - y[i]; // gradient for log loss
      const lr = lr0 / (1 + ep); // simple decay
      // update bias
      b -= lr * g;
      // update weights with L2
      for (let k = 0; k < idx.length; k++) {
        const j = idx[k];
        w[j] = w[j] * (1 - lr * lambda) - lr * g;
      }
    }
  }
  return { D, w, b, baseRate };
}

function predictEstimator(model, choice) {
  if (!model) return null;
  const idx = featureIndices(choice, model.D);
  let z = model.b;
  for (let k = 0; k < idx.length; k++) z += model.w[idx[k]];
  const p = sigmoid(z);
  // Clamp to [0,1]
  return Math.max(0, Math.min(1, p));
}

function populateEstimatorOptions(rows) {
  const byCount = (arr, key) => {
    const m = new Map();
    arr.forEach(r => {
      const v = (r[key] || '').trim();
      if (!v || v === 'Unspecified' || v === 'NA' || v === 'Unknown') return;
      m.set(v, (m.get(v) || 0) + 1);
    });
    return Array.from(m.entries()).sort((a,b)=> b[1]-a[1]).map(d=>d[0]);
  };
  const topVeh = byCount(rows, 'vehicleType').slice(0, 25);
  const topAct = byCount(rows, 'preCrash').slice(0, 25);
  const topBor = byCount(rows, 'borough').slice(0, 10);

  function fillSelect(id, values, formatter = d=>d, includeEmpty=true) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    if (includeEmpty) {
      const opt = document.createElement('option'); opt.value=''; opt.textContent='—'; el.appendChild(opt);
    }
    values.forEach(v => { const opt = document.createElement('option'); opt.value = v; opt.textContent = formatter(v); el.appendChild(opt); });
  }
  fillSelect('est-vehicle', topVeh);
  fillSelect('est-action', topAct);
  fillSelect('est-borough', topBor);
  // Hours 0..23
  const hours = d3.range(0,24);
  fillSelect('est-hour', hours, h => String(h).padStart(2,'0')+':00', true);
  // Day of week Mon..Sun (1..6,0)
  const order = [1,2,3,4,5,6,0];
  const labels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  fillSelect('est-dow', order, d => labels[d], true);
}

function readEstimatorChoice() {
  const getSel = id => {
    const el = document.getElementById(id); if (!el) return '';
    const v = el.value; return v == null ? '' : v;
  };
  const hourSel = document.getElementById('est-hour');
  const dowSel = document.getElementById('est-dow');
  const hour = hourSel && hourSel.value !== '' ? parseInt(hourSel.value, 10) : NaN;
  // read numeric day-of-week directly from select value
  const dow = dowSel && dowSel.value !== '' ? parseInt(dowSel.value, 10) : NaN;
  return {
    vehicleType: getSel('est-vehicle') || null,
    preCrash: getSel('est-action') || null,
    borough: getSel('est-borough') || null,
    hour: Number.isFinite(hour) ? hour : null,
    dow: Number.isFinite(dow) ? dow : null,
  };
}

function renderEstimatorPrediction() {
  const out = document.getElementById('estimator-output');
  if (!out) return;
  if (!estModel) { out.textContent = 'Loading estimator…'; return; }
  const choice = readEstimatorChoice();
  const p = predictEstimator(estModel, choice);
  if (p == null) { out.textContent = '—'; return; }
  const fmtPct = d3.format('.1%');
  const rr = estModel.baseRate > 0 ? (p / estModel.baseRate) : 1;
  const dir = rr >= 1 ? 'higher' : 'lower';
  out.textContent = `${fmtPct(p)} chance that a crash involved injuries (about ${Math.abs((rr-1)*100).toFixed(0)}% ${dir} than average in this dataset).`;
}

function initEstimator(rows) {
  try {
    estModel = trainEstimator(rows);
    populateEstimatorOptions(rows);
    // Hook up change handlers
    ['est-vehicle','est-action','est-borough','est-hour','est-dow'].forEach(id => {
      const el = document.getElementById(id); if (el) el.addEventListener('change', renderEstimatorPrediction);
    });
    renderEstimatorPrediction();
  } catch (e) { console.error('Estimator init failed', e); }
}

// ----- Best vs Worst risk decision chains -----
function buildDomains(rows) {
  const byCount = (arr, key) => {
    const m = new Map();
    arr.forEach(r => {
      const v = (r[key] || '').trim();
      if (!v || v === 'Unspecified' || v === 'NA' || v === 'Unknown') return;
      m.set(v, (m.get(v) || 0) + 1);
    });
    return Array.from(m.entries()).sort((a,b)=> b[1]-a[1]).map(d=>d[0]);
  };
  const veh = byCount(rows, 'vehicleType').slice(0, 12);
  const act = byCount(rows, 'preCrash').slice(0, 12);
  const bor = byCount(rows, 'borough').slice(0, 6);
  const hour = d3.range(0,24);
  const dowOrder = [1,2,3,4,5,6,0];
  return { vehicleType: veh, preCrash: act, borough: bor, hour, dow: dowOrder };
}

function supportCount(rows, sel) {
  let n = 0;
  for (const r of rows) {
    if (sel.vehicleType && r.vehicleType !== sel.vehicleType) continue;
    if (sel.preCrash && r.preCrash !== sel.preCrash) continue;
    if (sel.borough && r.borough !== sel.borough) continue;
    if (Number.isFinite(sel.hour) && r.hour !== sel.hour) continue;
    if (Number.isFinite(sel.dow) && r.dow !== sel.dow) continue;
    n++;
  }
  return n;
}

function greedyChain(rows, model, domains, direction = 'worst', opts = {}) {
  const maxDepth = opts.maxDepth ?? 5;
  const minSupport = opts.minSupport ?? 80;
  const minDelta = opts.minDelta ?? 0.001; // 0.1pp
  const fields = ['vehicleType','preCrash','borough','hour','dow'];
  const nice = {
    vehicleType: 'Vehicle',
    preCrash: 'Action',
    borough: 'Borough',
    hour: 'Hour',
    dow: 'Day'
  };
  const dowLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const fmtHour = h => `${String(h).padStart(2,'0')}:00`;
  const fmtVal = (k, v) => {
    if (k === 'hour') return fmtHour(v);
    if (k === 'dow') return dowLabels[v] || String(v);
    return String(v);
  };

  const steps = [];
  const sel = { vehicleType:null, preCrash:null, borough:null, hour:null, dow:null };
  let pCurr = predictEstimator(model, sel) ?? (model?.baseRate ?? 0);
  steps.push({ label: 'Start', field: null, value: null, p: pCurr, n: rows.length });

  for (let d = 0; d < maxDepth; d++) {
    let best = null; // {field, value, p, n, delta}
    for (const f of fields) {
      if (sel[f] != null) continue; // already chosen
      const candidates = domains[f] || [];
      for (const v of candidates) {
        const trial = { ...sel, [f]: v };
        const n = supportCount(rows, trial);
        if (n < minSupport) continue;
        const p = predictEstimator(model, trial);
        if (p == null) continue;
        const delta = p - pCurr;
        const score = (direction === 'worst') ? delta : -delta;
        if (best == null || score > best.score) {
          best = { field: f, value: v, p, n, delta, score };
        }
      }
    }
    if (!best) break;
    const improve = (direction === 'worst') ? (best.delta >= minDelta) : ((-best.delta) >= minDelta);
    if (!improve) break;
    sel[best.field] = best.value;
    pCurr = best.p;
    steps.push({ label: `${nice[best.field]} = ${fmtVal(best.field, best.value)}`, field: best.field, value: best.value, p: best.p, n: best.n, delta: best.delta });
  }

  return steps;
}

function renderRiskChains(containerId, rows, model) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  const width = el.clientWidth || 320;
  const height = el.clientHeight || 260;
  const svg = d3.select(el).append('svg').attr('width', width).attr('height', height);
  const margin = { top: 24, right: 24, bottom: 24, left: 24 };
  const innerW = Math.max(200, width - margin.left - margin.right);
  const innerH = Math.max(160, height - margin.top - margin.bottom);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  if (!rows || !rows.length || !model) {
    g.append('text').attr('x', innerW/2).attr('y', innerH/2).attr('text-anchor','middle').attr('fill','var(--muted)').text('Not enough data to build chains');
    return;
  }

  const domains = buildDomains(rows);
  const worst = greedyChain(rows, model, domains, 'worst', { maxDepth: 5, minSupport: 30, minDelta: 0 });
  const best = greedyChain(rows, model, domains, 'best', { maxDepth: 5, minSupport: 30, minDelta: 0 });

  // Layout: two rows (best on top, worst on bottom)
  const rowsY = [innerH*0.3, innerH*0.75];
  const lanes = [
    { title: 'Best (lower risk)', steps: best, y: rowsY[0], color: '#10b981' },
    { title: 'Worst (higher risk)', steps: worst, y: rowsY[1], color: '#ef4444' }
  ];

  const fmtPct = d3.format('.1%');

  lanes.forEach((lane, iLane) => {
    // Title
    g.append('text').attr('x', 0).attr('y', lane.y - 24).attr('fill', 'var(--accent)').text(lane.title);
    const nSteps = lane.steps.length;
    const xScale = d3.scalePoint().domain(d3.range(nSteps)).range([0, innerW]).padding(0.5);

    // Links
    for (let i = 0; i < nSteps - 1; i++) {
      const x1 = xScale(i), x2 = xScale(i+1);
      g.append('line').attr('x1', x1).attr('y1', lane.y).attr('x2', x2).attr('y2', lane.y)
        .attr('stroke', '#94a3b8').attr('stroke-dasharray', '4,4');
      // arrowhead
      g.append('path')
        .attr('d', `M${x2-6},${lane.y-4} L${x2},${lane.y} L${x2-6},${lane.y+4}`)
        .attr('fill', 'none').attr('stroke', '#94a3b8');
    }

    // Nodes
    const nodeG = g.selectAll(`g.node-${iLane}`).data(lane.steps).join('g').attr('transform', (d, i)=>`translate(${xScale(i)},${lane.y})`);
    nodeG.append('circle').attr('r', 18).attr('fill', lane.color).attr('opacity', 0.9).attr('stroke', '#334155');
    // Labels: top line condition, bottom line p and n
    nodeG.append('text').attr('y', -28).attr('text-anchor','middle').attr('fill','#e5edff').attr('font-size', 11)
      .text(d => d.label);
    nodeG.append('text').attr('y', 4).attr('text-anchor','middle').attr('fill','#0b1020').attr('font-size', 11)
      .text(d => fmtPct(d.p));
    nodeG.append('text').attr('y', 22).attr('text-anchor','middle').attr('fill','var(--muted)').attr('font-size', 10)
      .text(d => `n=${(d.n||0).toLocaleString()}`);
  });
}

// Kick off
init();