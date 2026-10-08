/* prob.js: pure probability & statistics functions for the Titanic lab.
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

  function isIndependent(pA, pB, pAB, tol) {
    if (tol === undefined) tol = 0.005;
    return Math.abs(pAB - pA * pB) <= tol;
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

  /* ---------- 3.8 distribution of the number of successes (product rule, recursively) ----------
     After each trial i: q_new[k] = q[k]·(1−p_i) + q[k−1]·p_i. */

  function successDistribution(ps) {
    let q = [1];
    for (let i = 0; i < ps.length; i++) {
      const pi = ps[i];
      const qn = new Array(q.length + 1).fill(0);
      for (let k = 0; k < qn.length; k++) {
        const stay = k < q.length ? q[k] * (1 - pi) : 0;
        const gain = k > 0 ? q[k - 1] * pi : 0;
        qn[k] = stay + gain;
      }
      q = qn;
    }
    return q;
  }

  function mean(values, probs) {
    let s = 0;
    for (let i = 0; i < values.length; i++) s += values[i] * probs[i];
    return s;
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

  /* ---------- 3.9 descriptive statistics ---------- */

  function describe(xs) {
    const n = xs.length;
    if (n === 0) return { n: 0, mean: 0, median: 0, min: 0, max: 0, sd: 0 };
    let sum = 0, min = Infinity, max = -Infinity;
    for (let i = 0; i < n; i++) {
      sum += xs[i];
      if (xs[i] < min) min = xs[i];
      if (xs[i] > max) max = xs[i];
    }
    const m = sum / n;
    const sorted = xs.slice().sort(function (a, b) { return a - b; });
    const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    let sq = 0;
    for (let i = 0; i < n; i++) sq += (xs[i] - m) * (xs[i] - m);
    const sd = n > 1 ? Math.sqrt(sq / (n - 1)) : 0;
    return { n: n, mean: m, median: median, min: min, max: max, sd: sd };
  }

  function correlation(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n === 0) return { n: 0, r: 0, a: 0, b: 0, sxx: 0, syy: 0, sxy: 0 };
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
    const mx = sx / n, my = sy / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx, dy = ys[i] - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    const b = sxx === 0 ? 0 : sxy / sxx;
    const a = my - b * mx;
    const r = sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
    return { n: n, r: r, a: a, b: b, sxx: sxx, syy: syy, sxy: sxy };
  }

  /* ---------- special functions: log-gamma (Lanczos), regularized incomplete beta (Lentz) ---------- */

  const LANCZOS = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];

  function logGamma(z) {
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
    z -= 1;
    let x = LANCZOS[0];
    for (let i = 1; i < 9; i++) x += LANCZOS[i] / (z + i);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  function betacf(a, b, x) {
    const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1;
    let d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  function ibeta(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(
      logGamma(a + b) - logGamma(a) - logGamma(b) +
      a * Math.log(x) + b * Math.log(1 - x)
    );
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }

  /* ---------- Student t distribution ---------- */

  function tCdf(t, df) {
    if (!(df > 0)) return NaN;
    const x = df / (df + t * t);
    const ib = ibeta(df / 2, 0.5, x);
    return t >= 0 ? 1 - 0.5 * ib : 0.5 * ib;
  }

  function tInv(pp, df) {
    if (!(df > 0) || !(pp > 0) || !(pp < 1)) return NaN;
    let lo = -1, hi = 1;
    while (tCdf(lo, df) > pp && lo > -1e7) lo *= 2;
    while (tCdf(hi, df) < pp && hi < 1e7) hi *= 2;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (tCdf(mid, df) < pp) lo = mid; else hi = mid;
      if (hi - lo < 1e-12) break;
    }
    return (lo + hi) / 2;
  }

  /* ---------- tests and intervals ---------- */

  function corrTest(r, n, alpha) {
    const df = n - 2;
    if (df <= 0) return { t: NaN, df: df, p: NaN, tCrit: NaN, reject: false };
    const d = 1 - r * r;
    const t = d <= 0 ? (r > 0 ? Infinity : -Infinity) : r * Math.sqrt(df) / Math.sqrt(d);
    const p = 2 * (1 - tCdf(Math.abs(t), df));
    const tCrit = tInv(1 - alpha / 2, df);
    return { t: t, df: df, p: p, tCrit: tCrit, reject: Math.abs(t) > tCrit };
  }

  function meanCI(xs, alpha) {
    const d = describe(xs);
    const n = d.n;
    if (n < 2) return { mean: d.mean, lo: d.mean, hi: d.mean, tCrit: NaN, se: 0 };
    const se = d.sd / Math.sqrt(n);
    const tCrit = tInv(1 - alpha / 2, n - 1);
    return { mean: d.mean, lo: d.mean - tCrit * se, hi: d.mean + tCrit * se, tCrit: tCrit, se: se };
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
    successDistribution: successDistribution,
    mean: mean,
    totalProbability: totalProbability,
    bayes: bayes,
    describe: describe,
    correlation: correlation,
    logGamma: logGamma,
    ibeta: ibeta,
    tCdf: tCdf,
    tInv: tInv,
    corrTest: corrTest,
    meanCI: meanCI,
    fmt: fmt
  };

  global.Prob = Prob;
  if (typeof module !== 'undefined') module.exports = Prob;
})(typeof window !== 'undefined' ? window : globalThis);
