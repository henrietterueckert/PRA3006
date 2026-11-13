// queris gene-cancer associations live from Wikidata and turns
// the raw SPARQL rows into gene objects

"use strict";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

// Human genes (Q7187) with a "genetic association" (P2293) to any cancer
// (Q12078 or a subclass of it), plus the gene's chromosome (P1057).
const SPARQL_QUERY = `
SELECT ?gene ?geneLabel ?chromosomeLabel ?diseaseLabel ?isBreast WHERE {
  ?gene wdt:P31 wd:Q7187;
        wdt:P703 wd:Q15978631;
        wdt:P2293 ?disease.
  ?disease wdt:P279* wd:Q12078.
  BIND(EXISTS { ?disease wdt:P279* wd:Q128581 } AS ?isBreast)
  OPTIONAL { ?gene wdt:P1057 ?chromosome. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;


// Q2 (the extra question): biological processes (P682) of those same genes.
// In Wikidata, processes are recorded on the protein a gene encodes (P688),
// not on the gene itself, so we go gene -> protein -> process.
const PROCESS_QUERY = `
SELECT ?gene ?processLabel WHERE {
  ?gene wdt:P31 wd:Q7187;
        wdt:P703 wd:Q15978631;
        wdt:P2293 ?disease;
        wdt:P688 ?protein.
  ?protein wdt:P682 ?process.
  ?disease wdt:P279* wd:Q12078.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

// Send a query to Wikidata and return the result rows (array of binding objects).
async function runQuery(query) {
  const url = SPARQL_ENDPOINT + "?format=json&origin=*&query=" + encodeURIComponent(query);
  const response = await fetch(url, { headers: { Accept: "application/sparql-results+json" } });
  if (!response.ok) {
    throw new Error("Wikidata returned HTTP " + response.status);
  }
  const json = await response.json();
  return json.results.bindings;
}
