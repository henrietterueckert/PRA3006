// script.js: interactivity for the breast cancer gene explorer.
// GENES is filled by loadGenes() (sparql.js), which queries Wikidata live and
// falls back to the snapshot in data.js. Each gene looks like:
// { id, symbol, chromosome, breast: [..], other: [..], category }
// where category is "shared" | "breast-only" | "other-only".
 
"use strict";
 
let GENES = [];
 
/* Constants  */
 
const CHROMOSOME_ORDER = [
  ...Array.from({ length: 22 }, (_, i) => String(i + 1)),
  "X", "Y", "MT", "unknown"
];
 
const CATEGORIES = [
  { key: "breast",      label: "All breast cancer genes", test: g => g.category !== "other-only" },
  { key: "breast-only", label: "Breast cancer only",      test: g => g.category === "breast-only" },
  { key: "shared",      label: "Shared with other cancers", test: g => g.category === "shared" },
  { key: "other-only",  label: "Other cancers only",      test: g => g.category === "other-only" },
  { key: "all",         label: "All genes",               test: () => true }
];
 
const state = {
  category: "breast",
  query: "",
  chromosome: "all",
  selectedId: null
};
 
/*  Helpers  */
 
function chromosomeLabel(c) {
  if (c === "unknown") return "Unknown";
  if (c === "MT") return "Mitochondrial";
  return "Chr " + c;
}
 
function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    for (const [k, v] of Object.entries(options.attrs)) node.setAttribute(k, v);
  }
  children.forEach(c => node.appendChild(c));
  return node;
}
 
/** Counts genes per chromosome for a list of genes.
 *  Returns [{ chromosome, count, share }] in chromosome order.
 *  Reused by the d3 charts in step 5. */
function chromosomeCounts(genes) {
  const counts = new Map(CHROMOSOME_ORDER.map(c => [c, 0]));
  genes.forEach(g => counts.set(g.chromosome, (counts.get(g.chromosome) || 0) + 1));
  const total = genes.length || 1;
  return CHROMOSOME_ORDER.map(c => ({
    chromosome: c,
    count: counts.get(c),
    share: counts.get(c) / total
  }));
}
 
function genesIn(categoryKey) {
  const cat = CATEGORIES.find(c => c.key === categoryKey);
  return GENES.filter(cat.test);
}
 
/* ---------- Summary cards ---------- */
 
function renderStats() {
  const breast = genesIn("breast");
  const shared = genesIn("shared");
  const unique = genesIn("breast-only");
  const others = genesIn("other-only");
 
  const cards = [
    { value: breast.length, label: "breast cancer genes" },
    { value: shared.length, label: "also linked to other cancers" },
    { value: unique.length, label: "breast cancer only (in this data)" },
    { value: others.length, label: "genes of other cancers only" }
  ];
 
  const container = document.getElementById("stats");
  container.replaceChildren(
    ...cards.map(c =>
      el("div", { className: "stat-card" }, [
        el("span", { className: "stat-value", text: String(c.value) }),
        el("span", { className: "stat-label", text: c.label })
      ])
    )
  );
}
 
/* ---------- Controls ---------- */
 
function renderCategoryFilters() {
  const group = document.getElementById("category-filters");
  group.replaceChildren(
    ...CATEGORIES.map(cat => {
      const btn = el("button", {
        text: `${cat.label} (${genesIn(cat.key).length})`,
        attrs: { type: "button", "data-category": cat.key }
      });
      btn.addEventListener("click", () => {
        state.category = cat.key;
        updateView();
      });
      return btn;
    })
  );
}
 
function renderChromosomeSelect() {
  const select = document.getElementById("chromosome-select");
  const options = [{ value: "all", text: "All chromosomes" }].concat(
    CHROMOSOME_ORDER
      .filter(c => GENES.some(g => g.chromosome === c))
      .map(c => ({ value: c, text: chromosomeLabel(c) }))
  );
  select.replaceChildren(
    ...options.map(o => el("option", { text: o.text, attrs: { value: o.value } }))
  );
  select.addEventListener("change", e => {
    state.chromosome = e.target.value;
    updateView();
  });
}
 
function bindSearch() {
  document.getElementById("gene-search").addEventListener("input", e => {
    state.query = e.target.value.trim().toLowerCase();
    updateView();
  });
}
 
/* Gene list  */
 
function visibleGenes() {
  return genesIn(state.category)
    .filter(g => state.chromosome === "all" || g.chromosome === state.chromosome)
    .filter(g => !state.query || g.symbol.toLowerCase().includes(state.query))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}
 
function renderGeneList() {
  const genes = visibleGenes();
  const list = document.getElementById("gene-list");
 
  document.getElementById("result-count").textContent =
    `${genes.length} gene${genes.length === 1 ? "" : "s"} shown`;
 
  if (genes.length === 0) {
    list.replaceChildren(el("li", { className: "empty", text: "No genes match these filters." }));
    return;
  }
 
  list.replaceChildren(
    ...genes.map(g => {
      const btn = el("button", {
        className: "gene-item category-" + g.category,
        attrs: { type: "button", "aria-pressed": String(g.id === state.selectedId) }
      }, [
        el("span", { className: "gene-symbol", text: g.symbol }),
        el("span", { className: "gene-chrom", text: chromosomeLabel(g.chromosome) })
      ]);
      btn.addEventListener("click", () => {
        state.selectedId = g.id;
        renderGeneList();
        renderGeneDetail();
      });
      return el("li", {}, [btn]);
    })
  );
}
 
/* Gene detail  */
 
const CATEGORY_TEXT = {
  "shared": "Linked to breast cancer and other cancers",
  "breast-only": "Linked to breast cancer only (in this data)",
  "other-only": "Not linked to breast cancer in this data"
};
 
function diseaseList(title, items) {
  if (items.length === 0) return null;
  return el("div", {}, [
    el("h4", { text: title }),
    el("ul", {}, items.map(d => el("li", { text: d })))
  ]);
}
 
function renderGeneDetail() {
  const panel = document.getElementById("gene-detail");
  const gene = GENES.find(g => g.id === state.selectedId);
 
  if (!gene) {
    panel.replaceChildren(el("p", { className: "placeholder", text: "Select a gene to see its cancers." }));
    return;
  }
 
  const link = el("a", {
    text: "View on Wikidata",
    attrs: {
      href: "https://www.wikidata.org/wiki/" + gene.id,
      target: "_blank",
      rel: "noopener"
    }
  });
 
  const parts = [
    el("h3", { text: gene.symbol }),
    el("p", { className: "detail-meta", text: `${chromosomeLabel(gene.chromosome)} · ${CATEGORY_TEXT[gene.category]}` }),
    diseaseList("Breast cancer associations", gene.breast),
    diseaseList("Other cancer associations", gene.other),
    el("p", {}, [link])
  ].filter(Boolean);
 
  panel.replaceChildren(...parts);
}
 
/* ---------- Update + init ---------- */
 
function updateView() {
  document.querySelectorAll("#category-filters button").forEach(btn => {
    btn.setAttribute("aria-pressed", String(btn.dataset.category === state.category));
  });
  renderGeneList();
  renderGeneDetail();
}
 
function setStatus(message, kind) {
  const status = document.getElementById("data-status");
  status.textContent = message;
  status.className = "data-status " + (kind || "");
}
 
async function init() {
  setStatus("Loading the latest data from Wikidata…", "loading");
  bindSearch(); // the search box works as soon as the page loads
 
  let result;
  try {
    result = await loadGenes();
  } catch (error) {
    setStatus("Could not load data: " + error.message, "error");
    return;
  }
 
  GENES = result.genes;
 
  if (result.source === "live") {
    setStatus("Live data from Wikidata, loaded " + result.loadedAt.toLocaleString() + ".", "live");
  } else {
    setStatus("Wikidata could not be reached (" + result.error + "). Showing a saved snapshot instead.", "warning");
  }
 
  renderStats();
  renderCategoryFilters();
  renderChromosomeSelect();
  updateView();
 
  // Charts (step 5) should listen for this event instead of assuming data exists.
  document.dispatchEvent(new CustomEvent("genes-loaded", { detail: { genes: GENES, source: result.source } }));
 
  // Handy while developing step 5: inspect these in the browser console.
  console.log("Breast genes per chromosome:", chromosomeCounts(genesIn("breast")));
  console.log("Other-cancer genes per chromosome:", chromosomeCounts(genesIn("other-only")));
}
 
document.addEventListener("DOMContentLoaded", init);
 
