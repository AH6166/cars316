// --------------------------------------------------------------------
// ORBIT VISUALIZATION
// Sun + Boroughs + Contributing Factor Moons
// Year + Vehicle-type filters (top 5 VEHICLE_TYPE)
// No page reload on filter change
// --------------------------------------------------------------------

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const width = window.innerWidth;
const height = window.innerHeight;

const svg = d3.select("#chart").append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("background", "#0b1020");

const tooltip = d3.select("#tooltip");
const yearSelect = d3.select("#yearSelect");
const vehicleSelect = d3.select("#vehicleSelect");

// Glow Filter
const defs = svg.append("defs");
const glow = defs.append("filter").attr("id", "soft-glow");
glow.append("feGaussianBlur").attr("stdDeviation", 6).attr("result", "blur");
const feMerge = glow.append("feMerge");
feMerge.append("feMergeNode").attr("in", "blur");
feMerge.append("feMergeNode").attr("in", "SourceGraphic");

// Layer for dynamic viz elements
// Insert a transparent background rect before viz layer to capture pan/zoom gestures
const vizLayer = svg.append("g").attr("class", "viz-layer");
const zoomBg = svg.insert("rect", "g.viz-layer")
    .attr("class", "zoom-bg")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", width)
    .attr("height", height)
    .style("fill", "none")
    .style("pointer-events", "all");

// Enable pan & zoom on the whole scene by transforming vizLayer
const zoom = d3.zoom()
    .scaleExtent([0.5, 4])
    .on("zoom", (event) => {
        vizLayer.attr("transform", event.transform);
    });
svg.call(zoom);

const boroughs = ["BROOKLYN", "QUEENS", "MANHATTAN", "BRONX", "STATEN ISLAND"];
const center = { x: width / 2, y: height / 2 };
const orbitRadius = 330;

// Subtle movement noise
function smoothNoise(t, o) {
    return Math.sin(t * 0.0004 + o) * 0.6 +
        Math.sin(t * 0.0007 + o * 1.7) * 0.3;
}

// Helpers to read filters from URL (for initial load)
function getYearFromURL() {
    const params = new URLSearchParams(window.location.search);
    const y = params.get("year");
    return y ? parseInt(y, 10) : null;
}

function getVehicleFromURL() {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("veh");
    return v || null;
}

d3.csv("../data/original/collisions_severity.csv").then(data => {
    // Clean + extract YEAR
    data.forEach(d => {
        d.BOROUGH = d.BOROUGH?.trim().toUpperCase();
        d.VEHICLE_TYPE = d.VEHICLE_TYPE?.trim();

        if (d.CRASH_DATE) {
            const parts = d.CRASH_DATE.split("/");
            const yr = parts.length === 3 ? parseInt(parts[2], 10) : null;
            d.YEAR = yr;
        } else {
            d.YEAR = null;
        }
    });

    // Years
    const years = [...new Set(
        data.map(d => d.YEAR).filter(y => y != null && !Number.isNaN(y))
    )].sort((a, b) => a - b);

    // Top 5 vehicle types
    const vehicleCounts = {};
    data.forEach(d => {
        if (!d.VEHICLE_TYPE) return;
        vehicleCounts[d.VEHICLE_TYPE] =
            (vehicleCounts[d.VEHICLE_TYPE] || 0) + 1;
    });

    const topVehicles = Object.entries(vehicleCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([v]) => v);

    // Initial filter state from URL
    let selectedYear = years.includes(getYearFromURL()) ? getYearFromURL() : null;
    let selectedVehicle = topVehicles.includes(getVehicleFromURL())
        ? getVehicleFromURL()
        : null;

    // Build dropdowns
    const yearOptions = ["all", ...years];
    yearSelect
        .selectAll("option")
        .data(yearOptions)
        .enter()
        .append("option")
        .attr("value", d => d === "all" ? "all" : d)
        .text(d => d === "all" ? "All years" : d);
    yearSelect.property("value", selectedYear ?? "all");

    const vehicleOptions = ["all", ...topVehicles];
    vehicleSelect
        .selectAll("option")
        .data(vehicleOptions)
        .enter()
        .append("option")
        .attr("value", d => d === "all" ? "all" : d)
        .text(d => d === "all"
            ? "All vehicle types"
            : d
        );
    vehicleSelect.property("value", selectedVehicle ?? "all");

    // Animation data structures
    let nodes = [];
    let moonNodes = [];
    let planetLinks = [];

    let linkLines, moonLinks, planetCircles, moonCircles, labels, moonLabels;

    // Keep URL in sync without reload
    function syncURL() {
        const params = new URLSearchParams(window.location.search);

        if (selectedYear == null) params.delete("year");
        else params.set("year", String(selectedYear));

        if (selectedVehicle == null) params.delete("veh");
        else params.set("veh", selectedVehicle);

        const qs = params.toString();
        const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
        window.history.replaceState(null, "", newUrl);
    }

    // Build / rebuild visualization from filtered data
    function buildScene(filteredData) {
        vizLayer.selectAll("*").remove();

        const boroughCounts = {};
        boroughs.forEach(b => boroughCounts[b] = 0);
        filteredData.forEach(d => boroughCounts[d.BOROUGH]++);

        const nycTotal = filteredData.length;

        const radiusScale = d3.scaleLinear()
            .domain(d3.extent(Object.values(boroughCounts)))
            .range([55, 115]);

        nodes = [];
        moonNodes = [];
        planetLinks = [];

        // SUN
        nodes.push({
            id: "NEW YORK",
            type: "sun",
            count: nycTotal,
            r: 140,
            x: center.x,
            y: center.y,
            color: "#EBDFAF"
        });

        // BOROUGHS
        boroughs.forEach((b, i) => {
            const ang = (i / boroughs.length) * Math.PI * 2;
            nodes.push({
                id: b,
                type: "borough",
                count: boroughCounts[b],
                baseAngle: ang,
                r: radiusScale(boroughCounts[b]),
                noiseOffset: Math.random() * 20000,
                color: "#C3B9A6",
                x: center.x + orbitRadius * Math.cos(ang),
                y: center.y + orbitRadius * Math.sin(ang)
            });
        });

        // CONTRIBUTING FACTORS
        const factorCounts = {};
        boroughs.forEach(b => factorCounts[b] = {});

        filteredData.forEach(d => {
            const f = d.CONTRIBUTING_FACTOR_1?.trim();
            if (f && f !== "Unspecified") {
                factorCounts[d.BOROUGH][f] =
                    (factorCounts[d.BOROUGH][f] || 0) + 1;
            }
        });

        // MOONS — full factor names
        boroughs.forEach(b => {
            const parent = nodes.find(n => n.id === b);

            const top3 = Object.entries(factorCounts[b])
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);

            const dist = parent.r + 50; // original distance

            top3.forEach(([factor, count], i) => {
                let angle = (i / top3.length) * Math.PI * 2;
                let mAngle = angle;
                let mDist = dist;

                // Special tweak for Staten Island's problematic moon
                if (b === "STATEN ISLAND" &&
                    factor === "Driver Inattention/Distraction") {
                    mAngle = angle + Math.PI * 0.2;
                    mDist = dist + 20;
                }

                moonNodes.push({
                    id: factor,
                    count,
                    type: "moon",
                    borough: b,
                    r: Math.max(7, Math.min(20, count / 30)),
                    angle: mAngle,
                    offsetX: Math.cos(mAngle) * mDist,
                    offsetY: Math.sin(mAngle) * mDist,
                    x: parent.x,
                    y: parent.y,
                    noiseOffset: Math.random() * 20000,
                    color: "#a5a5a5"
                });
            });
        });

        planetLinks = nodes.filter(n => n.type === "borough")
            .map(n => ({ source: nodes[0], target: n }));

        // DRAW ----------------------------------------------------
        linkLines = vizLayer.append("g")
            .selectAll("line.sunLink")
            .data(planetLinks)
            .enter().append("line")
            .attr("stroke", "#94a3b8")
            .attr("stroke-width", 2)
            .attr("opacity", 0.7)
            .attr("filter", "url(#soft-glow)");

        moonLinks = vizLayer.append("g")
            .selectAll("line.moonLink")
            .data(moonNodes)
            .enter().append("line")
            .attr("stroke", "#c8c8c8")
            .attr("stroke-width", 1.3)
            .attr("opacity", 0.75);

        planetCircles = vizLayer.append("g")
            .selectAll("circle.planet")
            .data(nodes)
            .enter().append("circle")
            .attr("class", "planet")
            .attr("r", d => d.r)
            .attr("fill", d => d.color)
            .attr("stroke", "#eee8e0")
            .attr("stroke-width", 3)
            .call(
                d3.drag()
                    .on("start", (e, d) => { e.sourceEvent?.stopPropagation?.(); d.dragging = (d.type === "borough"); })
                    .on("drag", (e, d) => { if (d.dragging) { d.x = e.x; d.y = e.y; } })
                    .on("end", (e, d) => { d.dragging = false; })
            );

        moonCircles = vizLayer.append("g")
            .selectAll("circle.moon")
            .data(moonNodes)
            .enter().append("circle")
            .attr("class", "moon")
            .attr("r", d => d.r)
            .attr("fill", d => d.color)
            .attr("stroke", "#b9b9b9")
            .attr("stroke-width", 1)
            .style("opacity", 0.93)
            .call(
                d3.drag()
                    .on("start", (e, d) => { e.sourceEvent?.stopPropagation?.(); d.dragging = true; })
                    .on("drag", (e, d) => { d.x = e.x; d.y = e.y; })
                    .on("end", (e, d) => { d.dragging = false; })
            );

        // LABELS — SUN + BOROUGHS
        labels = vizLayer.append("g")
            .selectAll("text.nodeLabel")
            .data(nodes)
            .enter().append("text")
            .attr("text-anchor", "middle")
            .style("fill", "#e5edff")
            .style("pointer-events", "none")
            .each(function (d) {
                const t = d3.select(this);
                t.append("tspan")
                    .text(d.type === "sun" ? "New York" : d.id)
                    .attr("dy", "-4px")
                    .style("font-size", d.type === "sun" ? "34px" : "22px")
                    .style("font-weight", "700");
                t.append("tspan")
                    .text(d.count.toLocaleString() + " cases")
                    .attr("x", 0)
                    .attr("dy", "22px")
                    .style("font-size", "17px")
                    .style("font-weight", "500");
            });

        // LABELS — MOONS (wrapped)
        moonLabels = vizLayer.append("g")
            .selectAll("text.moonLabel")
            .data(moonNodes)
            .enter().append("text")
            .attr("text-anchor", "middle")
            .style("fill", "#cbd5e1")
            .style("pointer-events", "none")
            .style("font-size", "13px")
            .each(function (d) {
                const label = d3.select(this);
                const words = d.id.split(" ");
                let line = [], lineNum = 0;

                words.forEach(w => {
                    line.push(w);
                    if (line.join(" ").length > 14) {
                        line.pop();
                        label.append("tspan")
                            .text(line.join(" "))
                            .attr("x", 0)
                            .attr("dy", lineNum === 0 ? -d.r - 8 : 14); // original offset
                        line = [w];
                        lineNum++;
                    }
                });

                if (line.length) {
                    label.append("tspan")
                        .text(line.join(" "))
                        .attr("x", 0)
                        .attr("dy", lineNum === 0 ? -d.r - 8 : 14); // original offset
                }

                label.append("tspan")
                    .text(d.count.toLocaleString() + " cases")
                    .attr("x", 0)
                    .attr("dy", 14)
                    .style("font-size", "12px")
                    .style("font-weight", "600");
            });

        tick();
    }

    // Apply filters -> compute filtered data -> rebuild scene
    function applyFilters() {
        const filtered = data.filter(d =>
            boroughs.includes(d.BOROUGH) &&
            (selectedYear == null || d.YEAR === selectedYear) &&
            (selectedVehicle == null || d.VEHICLE_TYPE === selectedVehicle)
        );

        const finalData = filtered.length > 0
            ? filtered
            : data.filter(d =>
                boroughs.includes(d.BOROUGH) &&
                (selectedYear == null || d.YEAR === selectedYear)
            );

        buildScene(finalData);
        syncURL();
    }

    // Dropdown handlers
    yearSelect.on("change", () => {
        const val = yearSelect.property("value");
        selectedYear = (val === "all") ? null : +val;
        applyFilters();
    });

    vehicleSelect.on("change", () => {
        const val = vehicleSelect.property("value");
        selectedVehicle = (val === "all") ? null : val;
        applyFilters();
    });

    // Initial render
    applyFilters();

    // ----------------------------------------------------------
    // Animation
    // ----------------------------------------------------------
    function animate() {
        const t = Date.now();

        nodes.forEach(n => {
            if (n.type === "borough" && !n.dragging) {
                const tx = center.x + orbitRadius * Math.cos(n.baseAngle);
                const ty = center.y + orbitRadius * Math.sin(n.baseAngle);
                n.x += (tx - n.x) * 0.04 + smoothNoise(t, n.noiseOffset) * 0.4;
                n.y += (ty - n.y) * 0.04 + smoothNoise(t, n.noiseOffset + 2000) * 0.4;
            }
        });

        moonNodes.forEach(m => {
            const p = nodes.find(n => n.id === m.borough);
            if (!p) return;
            if (!m.dragging) {
                const tx = p.x + m.offsetX + smoothNoise(t, m.noiseOffset) * 3;
                const ty = p.y + m.offsetY + smoothNoise(t, m.noiseOffset + 2000) * 3;
                m.x += (tx - m.x) * 0.08;
                m.y += (ty - m.y) * 0.08;
            }
        });

        tick();
        requestAnimationFrame(animate);
    }

    function tick() {
        if (planetCircles) {
            planetCircles.attr("cx", d => d.x).attr("cy", d => d.y);
        }
        if (moonCircles) {
            moonCircles.attr("cx", d => d.x).attr("cy", d => d.y);
        }
        if (labels) {
            labels.attr("transform", d => `translate(${d.x},${d.y})`);
        }
        if (moonLabels) {
            moonLabels.attr("transform", d => `translate(${d.x},${d.y})`);
        }

        if (linkLines) {
            linkLines
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
        }

        if (moonLinks) {
            moonLinks
                .attr("x1", d => {
                    const p = nodes.find(n => n.id === d.borough);
                    if (!p) return d.x;
                    const dx = d.x - p.x, dy = d.y - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    return p.x + (dx / dist) * p.r;
                })
                .attr("y1", d => {
                    const p = nodes.find(n => n.id === d.borough);
                    if (!p) return d.y;
                    const dx = d.x - p.x, dy = d.y - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    return p.y + (dy / dist) * p.r;
                })
                .attr("x2", d => d.x)
                .attr("y2", d => d.y);
        }
    }

    requestAnimationFrame(animate);
});
