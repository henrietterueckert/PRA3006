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

// SECTION 1: Venn diagram. Two circles: breast cancer genes and other cancer genes.
// The overlap is the shared genes.
function renderSummary() {
  const count = (cat) => genes.filter((g) => g.category === cat).length;
  const breastOnly = count("breast-only");
  const shared = count("shared");
  const otherOnly = count("other-only");

  const W = 900, H = 340, cy = 170;

  // Circle AREA is proportional to the number of genes, so radius = k * sqrt(count).
  // Each circle holds its own genes plus the shared ones.
  const rOther = 130;
  const k = rOther / Math.sqrt(otherOnly + shared);
  const rBreast = k * Math.sqrt(breastOnly + shared);

  // Horizontal positions. The sizes are to scale, the overlap is only approximate.
  const dist = rOther + 0.2 * rBreast;      // distance between the two centres
  const span = rBreast + dist + rOther;     // total width of the picture
  const cxBreast = (W - span) / 2 + rBreast;
  const cxOther = cxBreast + dist;

  const svg = d3.select("#summary").html("").append("svg").attr("viewBox", `0 0 ${W} ${H}`);

  // The two circles. They are see-through, so the overlap looks purple.
  svg.selectAll("circle")
    .data([
      { cx: cxBreast, r: rBreast, color: "#d6336c" },
      { cx: cxOther, r: rOther, color: "#3b82c4" },
    ])
    .join("circle")
    .attr("cx", (d) => d.cx)
    .attr("cy", cy)
    .attr("r", (d) => d.r)
    .attr("fill", (d) => d.color)
    .attr("fill-opacity", 0.6);

  // The three regions. x = the middle of each region, y = where its name goes.
  const regions = [
    { n: breastOnly, name: "Breast cancer only", x: (cxBreast - rBreast + cxOther - rOther) / 2, y: cy + rOther + 30 },
    { n: shared, name: "Breast + other cancers", x: (cxOther - rOther + cxBreast + rBreast) / 2, y: 20 },
    { n: otherOnly, name: "Other cancers only", x: (cxBreast + rBreast + cxOther + rOther) / 2, y: cy + rOther + 30 },
  ];

  // A thin line from the "shared" name down to the overlap
  svg.append("line")
    .attr("x1", regions[1].x).attr("x2", regions[1].x)
    .attr("y1", 28).attr("y2", cy - 20)
    .attr("stroke", "#999");

  // The numbers, inside the regions
  svg.selectAll("text.n").data(regions).join("text")
    .attr("class", "n")
    .attr("x", (d) => d.x).attr("y", cy + 8)
    .attr("text-anchor", "middle").attr("font-size", 24).attr("font-weight", 700)
    .text((d) => d.n);

  // The names
  svg.selectAll("text.name").data(regions).join("text")
    .attr("class", "name")
    .attr("x", (d) => d.x).attr("y", (d) => d.y)
    .attr("text-anchor", "middle").attr("font-size", 14)
    .text((d) => d.name);
}

// SECTION 2: dot plot (dumbbell). On each chromosome, a pink dot (breast genes)
// and a blue dot (other genes) joined by a line. A long line = big difference.
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

  const COLORS = { Breast: "#d6336c", Other: "#3b82c4" };
  const W = 900, H = 380, m = { t: 20, r: 20, b: 50, l: 55 };
  const svg = d3.select("#chrom-chart").html("").append("svg").attr("viewBox", `0 0 ${W} ${H}`);

  // x: scalePoint gives ONE position per chromosome (like scaleBand, but a point, not a band)
  const x = d3.scalePoint().domain(chroms).range([m.l + 20, W - m.r - 20]);
  const y = d3.scaleLinear()
    .domain([0, d3.max(data, (d) => Math.max(d.Breast, d.Other)) * 1.1])
    .nice()
    .range([H - m.b, m.t]);

  // axes and titles
  svg.append("g").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x));
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y));
  svg.append("text").attr("x", W / 2).attr("y", H - 10).attr("text-anchor", "middle").text("Chromosome");
  svg.append("text").attr("transform", "rotate(-90)").attr("x", -H / 2).attr("y", 15)
    .attr("text-anchor", "middle")
    .text(mode === "percent" ? "% of that group's genes" : "Number of genes");

  // The connecting lines: one per chromosome, from the breast dot to the other dot
  svg.selectAll("line.link")
    .data(data)
    .join("line")
    .attr("class", "link")
    .attr("x1", (d) => x(d.chrom)).attr("x2", (d) => x(d.chrom))
    .attr("y1", (d) => y(d.Breast)).attr("y2", (d) => y(d.Other))
    .attr("stroke", "#bbb").attr("stroke-width", 2);

  // The dots: first one pink dot per chromosome, then one blue dot per chromosome
  const tip = d3.select("#tooltip");
  ["Breast", "Other"].forEach((key) => {
    svg.selectAll("circle." + key)
      .data(data)
      .join("circle")
      .attr("class", key)
      .attr("cx", (d) => x(d.chrom))
      .attr("cy", (d) => y(d[key]))
      .attr("r", 6)
      .attr("fill", COLORS[key])
      .on("mousemove", (event, d) => {
        const unit = mode === "percent" ? "%" : "";
        tip.style("opacity", 1)
          .style("left", event.pageX + 12 + "px")
          .style("top", event.pageY + 12 + "px")
          .text(`Chr ${d.chrom}, ${key === "Breast" ? "breast" : "other"}: ${d[key].toFixed(mode === "percent" ? 1 : 0)}${unit}`);
      })
      .on("mouseleave", () => tip.style("opacity", 0));
  });

  // legend
  [["Breast cancer genes", COLORS.Breast], ["Other cancer genes", COLORS.Other]].forEach(([t, c], i) => {
    svg.append("circle").attr("cx", W - 195).attr("cy", m.t + 6 + i * 20).attr("r", 6).attr("fill", c);
    svg.append("text").attr("x", W - 183).attr("y", m.t + 11 + i * 20).text(t);
  });
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
  }
}
// re-draw when the dropdown changes
document.getElementById("chrom-mode").onchange = (e) => {
  if (genes.length) renderChromosomes(e.target.value);
};

document.getElementById("search").oninput = () => { if (genes.length) renderTable(); };
document.getElementById("category-filter").onchange = () => { if (genes.length) renderTable(); };

init();

