// --------------------------------------------------------------------
// ORBIT VISUALIZATION (FULL FINAL VERSION — Full Factor Names)
// Sun + Boroughs + Contributing Factor Moons
// Centered labels, full factor names wrapped naturally, “cases” included
// --------------------------------------------------------------------

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const width = window.innerWidth;
const height = window.innerHeight;

d3.select("body").style("background", "#f5f5f5");

const svg = d3.select("#chart").append("svg")
    .attr("width", width)
    .attr("height", height);

const tooltip = d3.select("#tooltip");

// Glow Filter
const defs = svg.append("defs");
const glow = defs.append("filter").attr("id", "soft-glow");
glow.append("feGaussianBlur").attr("stdDeviation", 6).attr("result", "blur");
const feMerge = glow.append("feMerge");
feMerge.append("feMergeNode").attr("in", "blur");
feMerge.append("feMergeNode").attr("in", "SourceGraphic");

const boroughs = ["BROOKLYN", "QUEENS", "MANHATTAN", "BRONX", "STATEN ISLAND"];
const center = { x: width / 2, y: height / 2 };

// Slightly closer to sun to avoid clipping
const orbitRadius = 330;

// Subtle movement noise
function smoothNoise(t, o) {
    return Math.sin(t * 0.0004 + o) * 0.6 +
        Math.sin(t * 0.0007 + o * 1.7) * 0.3;
}

// --------------------------------------------------------------------
d3.csv("../data/original/collisions_severity.csv").then(data => {

    data.forEach(d => d.BOROUGH = d.BOROUGH?.trim().toUpperCase());
    const filtered = data.filter(d => boroughs.includes(d.BOROUGH));

    const boroughCounts = {};
    boroughs.forEach(b => boroughCounts[b] = 0);
    filtered.forEach(d => boroughCounts[d.BOROUGH]++);

    const nycTotal = d3.sum(Object.values(boroughCounts));

    const radiusScale = d3.scaleLinear()
        .domain(d3.extent(Object.values(boroughCounts)))
        .range([55, 115]);

    const nodes = [];

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

    filtered.forEach(d => {
        const f = d.CONTRIBUTING_FACTOR_1?.trim();
        if (f && f !== "Unspecified") {
            factorCounts[d.BOROUGH][f] = (factorCounts[d.BOROUGH][f] || 0) + 1;
        }
    });

    // MOONS — full factor names
    const moonNodes = [];
    boroughs.forEach(b => {
        const parent = nodes.find(n => n.id === b);

        const top3 = Object.entries(factorCounts[b])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        const dist = parent.r + 50;

        top3.forEach(([factor, count], i) => {
            const angle = (i / top3.length) * Math.PI * 2;
            moonNodes.push({
                id: factor,
                count,
                type: "moon",
                borough: b,
                r: Math.max(7, Math.min(20, count / 30)),
                angle,
                offsetX: Math.cos(angle) * dist,
                offsetY: Math.sin(angle) * dist,
                x: parent.x,
                y: parent.y,
                noiseOffset: Math.random() * 20000,
                color: "#a5a5a5"
            });
        });
    });

    const planetLinks = nodes.filter(n => n.type === "borough")
        .map(n => ({ source: nodes[0], target: n }));

    const linkLines = svg.append("g")
        .selectAll("line.sunLink")
        .data(planetLinks)
        .enter().append("line")
        .attr("stroke", "#bfbab2")
        .attr("stroke-width", 2)
        .attr("opacity", 0.7)
        .attr("filter", "url(#soft-glow)");

    const moonLinks = svg.append("g")
        .selectAll("line.moonLink")
        .data(moonNodes)
        .enter().append("line")
        .attr("stroke", "#c8c8c8")
        .attr("stroke-width", 1.3)
        .attr("opacity", 0.75);

    // PLANETS
    const planetCircles = svg.append("g")
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
                .on("start", (e, d) => d.dragging = (d.type === "borough"))
                .on("drag", (e, d) => { if (d.dragging) { d.x = e.x; d.y = e.y; } })
                .on("end", (e, d) => d.dragging = false)
        );

    // MOONS
    const moonCircles = svg.append("g")
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
                .on("start", (e, d) => d.dragging = true)
                .on("drag", (e, d) => { d.x = e.x; d.y = e.y; })
                .on("end", (e, d) => d.dragging = false)
        );

    // LABELS — SUN + BOROUGHS
    const labels = svg.append("g")
        .selectAll("text.nodeLabel")
        .data(nodes)
        .enter().append("text")
        .attr("text-anchor", "middle")
        .style("fill", "#3c3c3c")
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

    // LABELS — MOONS (full wrapped)
    const moonLabels = svg.append("g")
        .selectAll("text.moonLabel")
        .data(moonNodes)
        .enter().append("text")
        .attr("text-anchor", "middle")
        .style("fill", "#444")
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
                        .attr("dy", lineNum === 0 ? -d.r - 8 : 14);
                    line = [w];
                    lineNum++;
                }
            });

            if (line.length) {
                label.append("tspan")
                    .text(line.join(" "))
                    .attr("x", 0)
                    .attr("dy", lineNum === 0 ? -d.r - 8 : 14);
            }

            label.append("tspan")
                .text(d.count.toLocaleString() + " cases")
                .attr("x", 0)
                .attr("dy", 14)
                .style("font-size", "12px")
                .style("font-weight", "600");
        });

    // ----------------------------------------------------------
    // Animation
    // ----------------------------------------------------------
    tick();
    requestAnimationFrame(animate);

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
        planetCircles.attr("cx", d => d.x).attr("cy", d => d.y);
        moonCircles.attr("cx", d => d.x).attr("cy", d => d.y);

        labels.attr("transform", d => `translate(${d.x},${d.y})`);
        moonLabels.attr("transform", d => `translate(${d.x},${d.y})`);

        // Sun → Borough
        linkLines
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        // Borough → Moon connectors start at planet edge
        moonLinks
            .attr("x1", d => {
                const p = nodes.find(n => n.id === d.borough);
                const dx = d.x - p.x, dy = d.y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                return p.x + (dx / dist) * p.r;
            })
            .attr("y1", d => {
                const p = nodes.find(n => n.id === d.borough);
                const dx = d.x - p.x, dy = d.y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                return p.y + (dy / dist) * p.r;
            })
            .attr("x2", d => d.x)
            .attr("y2", d => d.y);
    }

});
