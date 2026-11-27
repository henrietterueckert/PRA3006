"use strict";

let genes = [];

const CATEGORIES = {
  "breast-only": { name: "Breast cancer only", color: "#d6336c" },
  shared: { name: "Breast + other cancers", color: "#7c5cbf" },
  "other-only": { name: "Other cancers only", color: "#3b82c4" },
};


// sort chromosomes: 1..22, then X, Y, MT, then anything else
function chromSort(a, b) {
  const rank = (c) =>
    /^\d+$/.test(c) ? +c : c === "X" ? 23 : c === "Y" ? 24 : c === "MT" ? 25 : 99;
  return rank(a) - rank(b);
}

function renderChromosomes(mode) {
  // two groups; a "shared" gene is in both
  const breast = genes.filter((g) => g.breastDiseases.size > 0);
  const other = genes.filter((g) => g.otherDiseases.size > 0);
  const chroms = [...new Set(genes.map((g) => g.chromosome))].sort(chromSort);

  // one data object per chromosome: { chrom: "17", Breast: 12.5, Other: 8.1 }
  const data = chroms.map((c) => {
    const b = breast.filter((g) => g.chromosome === c).length;
    const o = other.filter((g) => g.chromosome === c).length;
    return {
      chrom: c,
      Breast: mode === "percent" ? (100 * b) / breast.length : b,
      Other: mode === "percent" ? (100 * o) / other.length : o,
    };
  });

  // drawing area
  const W = 900, H = 380, m = { t: 20, r: 20, b: 50, l: 55 };
  const svg = d3.select("#chrom-chart").html("").append("svg").attr("viewBox", `0 0 ${W} ${H}`);

  // scales: they convert data values into pixel positions
  const x0 = d3.scaleBand().domain(chroms).range([m.l, W - m.r]).padding(0.2);
  const x1 = d3.scaleBand().domain(["Breast", "Other"]).range([0, x0.bandwidth()]).padding(0.05);
  const y = d3.scaleLinear()
    .domain([0, d3.max(data, (d) => Math.max(d.Breast, d.Other)) * 1.1])
    .nice()
    .range([H - m.b, m.t]);

  // axes
  svg.append("g").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x0));
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y));
  svg.append("text").attr("x", W / 2).attr("y", H - 10).attr("text-anchor", "middle").text("Chromosome");
  svg.append("text").attr("transform", "rotate(-90)").attr("x", -H / 2).attr("y", 15)
    .attr("text-anchor", "middle")
    .text(mode === "percent" ? "% of that group's genes" : "Number of genes");

  // bars: one <g> per chromosome, two <rect> inside each
  const tip = d3.select("#tooltip");
  svg.selectAll("g.chrom")
    .data(data)
    .join("g")
    .attr("class", "chrom")
    .attr("transform", (d) => `translate(${x0(d.chrom)},0)`)
    .selectAll("rect")
    .data((d) => ["Breast", "Other"].map((k) => ({ key: k, value: d[k], chrom: d.chrom })))
    .join("rect")
    .attr("x", (d) => x1(d.key))
    .attr("y", (d) => y(d.value))
    .attr("width", x1.bandwidth())
    .attr("height", (d) => y(0) - y(d.value))
    .attr("fill", (d) => (d.key === "Breast" ? "#d6336c" : "#3b82c4"))
    .on("mousemove", (event, d) => {
      const unit = mode === "percent" ? "%" : "";
      tip.style("opacity", 1)
        .style("left", event.pageX + 12 + "px")
        .style("top", event.pageY + 12 + "px")
        .text(`Chr ${d.chrom}, ${d.key === "Breast" ? "breast" : "other"}: ${d.value.toFixed(mode === "percent" ? 1 : 0)}${unit}`);
    })
    .on("mouseleave", () => tip.style("opacity", 0));
  // legend
  [["Breast cancer genes", "#d6336c"], ["Other cancer genes", "#3b82c4"]].forEach(([t, c], i) => {
    svg.append("rect").attr("x", W - 200).attr("y", m.t + i * 20).attr("width", 12).attr("height", 12).attr("fill", c);
    svg.append("text").attr("x", W - 183).attr("y", m.t + 11 + i * 20).text(t);
  });
}

function renderSummary() {
  let html = "";
  for (const cat in CATEGORIES) {
    const n = genes.filter((g) => g.category === cat).length;
    html += `<div class="card" style="border-top:6px solid ${CATEGORIES[cat].color}">
      <div class="big">${n}</div><div>${CATEGORIES[cat].name}</div></div>`;
  }
  document.getElementById("summary").innerHTML = html;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function renderTable() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const cat = document.getElementById("category-filter").value;
  const matches = genes
    .filter((g) => (cat === "all" || g.category === cat) && g.label.toLowerCase().includes(q))
    .sort((a, b) => a.label.localeCompare(b.label));

  const shown = matches.slice(0, 500);
  document.querySelector("#gene-table tbody").innerHTML = shown
    .map((g) => {
      const cancers = [...g.breastDiseases, ...g.otherDiseases].sort().join(", ");
      return `<tr>
        <td>${escapeHtml(g.label)}</td>
        <td>${escapeHtml(g.chromosome)}</td>
        <td>${CATEGORIES[g.category].name}</td>
        <td>${escapeHtml(cancers)}</td>
      </tr>`;
    })
    .join("");

  document.getElementById("table-count").textContent =
    matches.length > 500
      ? "Showing first 500 of " + matches.length + " genes. Refine your search to see more."
      : matches.length + " genes";
}

// =================================================================
// NETWORK GRAPH (d3 force layout)
// Nodes = breast cancer, shared genes, and the top 10 other cancers.
// Links = "this gene is associated with this cancer".
// =================================================================
function renderNetwork() {
  const shared = genes.filter((g) => g.category === "shared");

  // Count how many shared genes each other cancer has, keep the top 10.
  const counts = new Map();
  for (const g of shared) {
    for (const c of g.otherDiseases) counts.set(c, (counts.get(c) || 0) + 1);
  }
  const topCancers = [...counts]
    .sort((a, b) => b[1] - a[1])   // most genes first
    .slice(0, 10)
    .map((d) => d[0]);             // keep only the names

  // Only keep shared genes that are linked to at least one of those cancers.
  const netGenes = shared.filter((g) => topCancers.some((c) => g.otherDiseases.has(c)));

  if (netGenes.length === 0) {
    document.getElementById("network").textContent = "No shared genes found.";
    return;
  }

  // NODES: every node needs a unique id, a display name and a type.
  const nodes = [
    { id: "BREAST", name: "Breast cancer", type: "breast" },
    ...topCancers.map((c) => ({ id: c, name: c, type: "cancer" })),
    ...netGenes.map((g) => ({ id: g.id, name: g.label, type: "gene" })),
  ];

  // LINKS: breast cancer -> each gene, and each gene -> its other cancers.
  const links = [];
  for (const g of netGenes) {
    links.push({ source: "BREAST", target: g.id });
    for (const c of topCancers) {
      if (g.otherDiseases.has(c)) links.push({ source: g.id, target: c });
    }
  }

  const W = 900, H = 600;
  const COLORS = { breast: "#d6336c", gene: "#7c5cbf", cancer: "#3b82c4" };
  const svg = d3.select("#network").html("").append("svg").attr("viewBox", `0 0 ${W} ${H}`);

  // The FORCE SIMULATION computes where each node goes. Three forces:
  //   link   = linked nodes pull towards each other (.id tells d3 which field identifies a node)
  //   charge = every node pushes the others away, so they don't pile up (negative = push)
  //   center = pulls everything towards the middle of the picture
  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id).distance(70))
    .force("charge", d3.forceManyBody().strength(-50))
    .force("center", d3.forceCenter(W / 2, H / 2));

  // DRAW the elements once. (Their positions are filled in by the "tick" below.)
  const link = svg.append("g").attr("stroke", "#ccc")
    .selectAll("line").data(links).join("line");

  const node = svg.append("g")
    .selectAll("circle").data(nodes).join("circle")
    .attr("r", (d) => (d.type === "breast" ? 16 : d.type === "cancer" ? 10 : 5))
    .attr("fill", (d) => COLORS[d.type]);
  node.append("title").text((d) => d.name); // the hover text

  // Text labels only for the cancers (labels on ~100 genes would be unreadable).
  const label = svg.append("g")
    .selectAll("text").data(nodes.filter((d) => d.type !== "gene")).join("text")
    .attr("font-size", 11)
    .attr("text-anchor", "middle")
    .text((d) => d.name);

  // The simulation runs in small steps ("ticks"). On every tick the nodes
  // have new x/y positions, so we move the drawn elements to match.
  // After forceLink runs, link.source and link.target are the node objects themselves.
  simulation.on("tick", () => {
    link.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
    node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
    label.attr("x", (d) => d.x).attr("y", (d) => d.y - 14);
  });
}

async function init() {
  const status = document.getElementById("status");
  try {
    status.textContent = "Querying Wikidata…";
    const [rows, breastRows] = await Promise.all([
      runQuery(SPARQL_QUERY),
      runQuery(BREAST_DISEASE_QUERY),
    ]);
    const breastIds = new Set(breastRows.map((r) => idFromUri(r.disease.value)));
    genes = buildGenes(rows, breastIds);
    status.textContent = "Loaded " + genes.length + " genes.";
    renderSummary();
    renderChromosomes(document.getElementById("chrom-mode").value);
    renderTable();
    renderNetwork();
  } catch (e) {
    status.textContent = "Error: " + e.message;
  }
}
// re-draw when the dropdown changes
document.getElementById("chrom-mode").onchange = (e) => {
  if (genes.length) renderChromosomes(e.target.value);
};

document.getElementById("search").oninput = () => { if (genes.length) renderTable(); };
document.getElementById("category-filter").onchange = () => { if (genes.length) renderTable(); };

init();

