"use strict";

let genes = [];
const COLORS = { Breast: "#d6336c", Other: "#3b82c4" };

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
  const items = [
    ["breast-only", "Breast cancer only", "#d6336c"],
    ["shared", "Breast + other cancers", "#7c5cbf"],
    ["other-only", "Other cancers only", "#3b82c4"],
  ];
  const box = document.getElementById("summary");
  box.innerHTML = "";
  for (const [cat, name, color] of items) {
    const n = genes.filter((g) => g.category === cat).length;
    box.innerHTML += `<div class="card" style="border-top:6px solid ${color}">
      <div class="big">${n}</div><div>${name}</div></div>`;
  }
}

const CATEGORY_NAMES = {
  "breast-only": "Breast cancer only",
  shared: "Breast + other cancers",
  "other-only": "Other cancers only",
};

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
        <td>${CATEGORY_NAMES[g.category]}</td>
        <td>${escapeHtml(cancers)}</td>
      </tr>`;
    })
    .join("");

  document.getElementById("table-count").textContent =
    matches.length > 500
      ? "Showing first 500 of " + matches.length + " genes. Refine your search to see more."
      : matches.length + " genes";
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
  } catch (e) {
    status.textContent = "Error: " + e.message;
    return;
  }

  try {
    status.textContent = "Loaded " + genes.length + " genes. Loading cell processes…";
    const processRows = await runQuery(PROCESS_QUERY);
    addProcesses(genes, processRows);
    renderProcesses();
    status.textContent = "Loaded " + genes.length + " genes.";
  } catch (e) {
    document.getElementById("process-chart").textContent = "Could not load process data: " + e.message;
  }
}

// re-draw when the dropdown changes
document.getElementById("chrom-mode").onchange = (e) => {
  if (genes.length) renderChromosomes(e.target.value);
};

document.getElementById("search").oninput = () => { if (genes.length) renderTable(); };
document.getElementById("category-filter").onchange = () => { if (genes.length) renderTable(); };

init();

// top biological processes, as % of each group's genes that have process data
function renderProcesses() {
  const box = d3.select("#process-chart").html("");
  const groups = {
    Breast: genes.filter((g) => g.breastDiseases.size > 0 && g.processes.size > 0),
    Other: genes.filter((g) => g.otherDiseases.size > 0 && g.processes.size > 0),
  };
  if (!groups.Breast.length && !groups.Other.length) {
    box.text("No process data found in Wikidata for these genes.");
    return;
  }

  const pct = (key, p) =>
    groups[key].length ? (100 * groups[key].filter((g) => g.processes.has(p)).length) / groups[key].length : 0;

  const all = new Set(genes.flatMap((g) => [...g.processes]));
  const rows = [...all]
    .map((p) => ({ process: p, Breast: pct("Breast", p), Other: pct("Other", p) }))
    .sort((a, b) => b.Breast + b.Other - (a.Breast + a.Other))
    .slice(0, 10);

  const W = 900, rowH = 44, m = { t: 30, r: 30, b: 40, l: 280 };
  const H = m.t + m.b + rows.length * rowH;
  const svg = box.append("svg").attr("viewBox", `0 0 ${W} ${H}`);

  const y0 = d3.scaleBand().domain(rows.map((r) => r.process)).range([m.t, H - m.b]).padding(0.2);
  const y1 = d3.scaleBand().domain(["Breast", "Other"]).range([0, y0.bandwidth()]).padding(0.05);
  const x = d3.scaleLinear()
    .domain([0, d3.max(rows, (r) => Math.max(r.Breast, r.Other)) * 1.1])
    .nice()
    .range([m.l, W - m.r]);

  svg.append("g").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x));
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y0));
  svg.append("text").attr("x", (m.l + W - m.r) / 2).attr("y", H - 5).attr("text-anchor", "middle")
    .text("% of the group's genes with process data");

  const tip = d3.select("#tooltip");
  svg.selectAll("g.proc")
    .data(rows)
    .join("g")
    .attr("class", "proc")
    .attr("transform", (d) => `translate(0,${y0(d.process)})`)
    .selectAll("rect")
    .data((d) => ["Breast", "Other"].map((k) => ({ key: k, value: d[k], process: d.process })))
    .join("rect")
    .attr("x", m.l)
    .attr("y", (d) => y1(d.key))
    .attr("height", y1.bandwidth())
    .attr("width", (d) => x(d.value) - m.l)
    .attr("fill", (d) => COLORS[d.key])
    .on("mousemove", (event, d) => {
      tip.style("opacity", 1)
        .style("left", event.pageX + 12 + "px")
        .style("top", event.pageY + 12 + "px")
        .text(`${d.process}, ${d.key === "Breast" ? "breast" : "other"}: ${d.value.toFixed(1)}%`);
    })
    .on("mouseleave", () => tip.style("opacity", 0));

  [["Breast cancer genes (" + groups.Breast.length + " with data)", COLORS.Breast],
   ["Other cancer genes (" + groups.Other.length + " with data)", COLORS.Other]].forEach(([t, c], i) => {
    svg.append("rect").attr("x", W - 260).attr("y", 5 + i * 18).attr("width", 12).attr("height", 12).attr("fill", c);
    svg.append("text").attr("x", W - 243).attr("y", 16 + i * 18).attr("font-size", 12).text(t);
  });
}