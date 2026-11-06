// queris gene-cancer associations live from Wikidata and turns
// the raw SPARQL rows into gene objects

"use strict";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

// Human genes (Q7187) with a "genetic association" (P2293) to any cancer
// (Q12078 or a subclass of it), plus the gene's chromosome (P1057).
const SPARQL_QUERY = `
SELECT ?gene ?geneLabel ?chromosomeLabel ?diseaseLabel WHERE {
  ?gene wdt:P31 wd:Q7187;
        wdt:P703 wd:Q15978631;
        wdt:P2293 ?disease.
  ?disease wdt:P279* wd:Q12078.
  OPTIONAL { ?gene wdt:P1057 ?chromosome. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

