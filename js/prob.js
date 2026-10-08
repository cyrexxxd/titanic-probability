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
    fmt: fmt
  };

  global.Prob = Prob;
  if (typeof module !== 'undefined') module.exports = Prob;
})(typeof window !== 'undefined' ? window : globalThis);
