/* prob.js: pure probability functions for the Titanic lab.
   No DOM access. Exposed as window.Prob in the browser and module.exports in Node. */
(function (global) {
  'use strict';

  /* ---------- 3.1 classical probability ---------- */

  function count(rows, pred) {
    let c = 0;
    for (let i = 0; i < rows.length; i++) if (pred(rows[i])) c++;
    return c;
  }

  function p(nA, nS) {
    return nS === 0 ? 0 : nA / nS;
  }

  function complement(pA) {
    return 1 - pA;
  }

  /* ---------- 3.2 addition rule ---------- */

  function union(pA, pB, pAB) {
    return pA + pB - pAB;
  }

  /* ---------- 3.3 conditional probability ---------- */

  function conditional(pAB, pB) {
    return pB === 0 ? null : pAB / pB;
  }

  /* ---------- 3.5 independence ---------- */

  // Definition 2.5.1 applied exactly. With P(X) = n(X)/n(S),
  // P(A∩B) = P(A)·P(B)  <=>  n(A∩B)·n(S) = n(A)·n(B), checked on whole numbers.
  function isIndependent(nA, nB, nAB, nS) {
    return nAB * nS === nA * nB;
  }

  /* ---------- 3.4 multiplication rule: chain for k draws without replacement ---------- */

  function chainWithoutReplacement(nA, nS, k) {
    const factors = [];
    let value = 1;
    for (let i = 0; i < k; i++) {
      const num = nA - i;
      const den = nS - i;
      factors.push({ num: num, den: den });
      if (k <= nA) value *= num / den;
    }
    if (k > nA) value = 0;
    return { factors: factors, value: value };
  }

  /* ---------- 3.6 several independent events ---------- */

  function allOf(ps) {
    let r = 1;
    for (let i = 0; i < ps.length; i++) r *= ps[i];
    return r;
  }

  function noneOf(ps) {
    let r = 1;
    for (let i = 0; i < ps.length; i++) r *= 1 - ps[i];
    return r;
  }

  function atLeastOne(ps) {
    return 1 - noneOf(ps);
  }

  function exactlyOne(ps) {
    let sum = 0;
    for (let i = 0; i < ps.length; i++) {
      let term = ps[i];
      for (let j = 0; j < ps.length; j++) if (j !== i) term *= 1 - ps[j];
      sum += term;
    }
    return sum;
  }

  function atMostOne(ps) {
    return noneOf(ps) + exactlyOne(ps);
  }

  /* ---------- 3.8 distribution of the number of successes ----------
     Every outcome (who succeeds, who does not) is an intersection of independent
     events, so its probability is a product; outcomes with the same number of
     successes are mutually exclusive, so their probabilities are added. */

  function outcomeDistribution(ps) {
    const n = ps.length;
    const outcomes = [];
    const dist = new Array(n + 1).fill(0);
    for (let mask = 0; mask < (1 << n); mask++) {
      const pattern = [];
      let prob = 1, k = 0;
      for (let i = 0; i < n; i++) {
        const s = ((mask >> (n - 1 - i)) & 1) === 1;
        pattern.push(s);
        prob *= s ? ps[i] : 1 - ps[i];
        if (s) k++;
      }
      outcomes.push({ pattern: pattern, k: k, prob: prob });
      dist[k] += prob;
    }
    return { outcomes: outcomes, dist: dist };
  }

  /* ---------- 3.7 total probability and Bayes ---------- */

  function totalProbability(priors, likelihoods) {
    const terms = priors.map(function (h, i) { return h * likelihoods[i]; });
    let total = 0;
    for (let i = 0; i < terms.length; i++) total += terms[i];
    return { terms: terms, total: total };
  }

  function bayes(priors, likelihoods) {
    const t = totalProbability(priors, likelihoods);
    if (t.total === 0) return priors.map(function () { return 0; });
    return t.terms.map(function (term) { return term / t.total; });
  }

  /* ---------- formatting ---------- */

  function fmt(x, d) {
    if (d === undefined) d = 4;
    if (typeof x !== 'number' || !isFinite(x)) return 'n/a';
    return x.toFixed(d);
  }

  const Prob = {
    count: count,
    p: p,
    complement: complement,
    union: union,
    conditional: conditional,
    isIndependent: isIndependent,
    chainWithoutReplacement: chainWithoutReplacement,
    allOf: allOf,
    noneOf: noneOf,
    atLeastOne: atLeastOne,
    exactlyOne: exactlyOne,
    atMostOne: atMostOne,
    outcomeDistribution: outcomeDistribution,
    totalProbability: totalProbability,
    bayes: bayes,
    fmt: fmt
  };

  global.Prob = Prob;
  if (typeof module !== 'undefined') module.exports = Prob;
})(typeof window !== 'undefined' ? window : globalThis);
