"use strict";

let genes = [];

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
}