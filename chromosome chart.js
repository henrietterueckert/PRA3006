"use strict";

let genes = [];

// sort chromosomes: 1..22, then X, Y, MT, then anything else
function chromSort(a, b) {
  const rank = (c) =>
    /^\d+$/.test(c) ? +c : c === "X" ? 23 : c === "Y" ? 24 : c === "MT" ? 25 : 99;
  return rank(a) - rank(b);
}