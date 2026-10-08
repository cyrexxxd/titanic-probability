/* app.js: UI for "Probability on the Titanic". Depends on window.TITANIC, window.Prob, window.katex. */
(function () {
  'use strict';

  const Prob = window.Prob;
  const T = window.TITANIC;

  /* ================= data ================= */

  const rows = T.rows.map(function (r, i) {
    const o = { _i: i };
    T.fields.forEach(function (f, j) { o[f] = r[j]; });
    o.ageGroup = o.age === null ? 'unknown' : (o.age < 18 ? 'child' : 'adult');
    o.familySize = o.sibsp + o.parch + 1;
    o.alone = o.familySize === 1;
    return o;
  });
  const N = rows.length;
  const nSurv = Prob.count(rows, function (r) { return r.survived === 1; });

  /* ================= shared state ================= */

  function defaultEvent() {
    return { pclass: 'any', sex: 'any', ageGroup: 'any', survived: 'any', embarked: 'any', alone: 'any' };
  }

  const state = {
    evA: Object.assign(defaultEvent(), { survived: '1' }),
    evB: Object.assign(defaultEvent(), { sex: 'F' }),
    evC: null, // null = C not defined
    drawGroup: 0,
    drawK: 3,
    bayesPart: 'pclass',
    bayesEv: '1',
    boat: [
      { pclass: '1', sex: 'F', ageGroup: 'any' },
      { pclass: '3', sex: 'M', ageGroup: 'adult' },
      { pclass: 'any', sex: 'any', ageGroup: 'child' }
    ],
    streakGroup: 1,
    streakN: 10,
    famFilter: 'all'
  };

  /* ================= tiny DOM helpers ================= */

  function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        const v = attrs[k];
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (v === true) el.setAttribute(k, '');
        else if (v !== false && v !== null && v !== undefined) el.setAttribute(k, v);
      });
    }
    (kids || []).forEach(function (kid) {
      if (kid == null) return;
      el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    });
    return el;
  }

  const NS = 'http://www.w3.org/2000/svg';
  function S(tag, attrs, kids) {
    const el = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (kid) {
      el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    });
    return el;
  }
  function TXT(attrs, str) { const t = S('text', attrs); t.textContent = str; return t; }

  /* ================= button groups ================= */

  // Every <select> inside a .control label is shown as a row of toggle buttons.
  // The select stays in the DOM (hidden) as the single source of truth, so all
  // existing change handlers keep working unchanged.
  function chipify(sel, name) {
    const group = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': name || 'Options' });
    const sync = function () {
      Array.prototype.forEach.call(group.children, function (b) {
        const on = b.dataset.v === sel.value;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on || (!sel.value && b === group.firstChild) ? 0 : -1;
      });
    };
    Array.prototype.forEach.call(sel.options, function (o) {
      if (o.value === '') return; // placeholder options ("Choose…") have no button
      const b = h('button', { type: 'button', class: 'chip', role: 'radio', 'data-v': o.value, text: o.textContent });
      b.addEventListener('click', function () {
        if (sel.value !== o.value) {
          sel.value = o.value;
          sel.dispatchEvent(new Event('change'));
        }
        sync();
      });
      group.append(b);
    });
    group.addEventListener('keydown', function (e) {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      const bs = Array.prototype.slice.call(group.children);
      let i = bs.findIndex(function (b) { return b.dataset.v === sel.value; });
      i = (i + step + bs.length) % bs.length;
      e.preventDefault();
      bs[i].click();
      if (bs[i].isConnected) bs[i].focus();
    });
    sel.hidden = true;
    sel.classList.add('chip-source');
    sel._chipSync = sync;
    sync();
    return group;
  }

  // Turn <label class="control"><span>Name</span><select/></label> into a
  // <div class="control"> holding the name and a button group. A <label> cannot
  // be kept: clicking its text would press the first button.
  function chipifyAll(root) {
    (root || document).querySelectorAll('label.control').forEach(function (lab) {
      const sel = lab.querySelector('select:not(.chip-source)');
      if (!sel) return;
      const name = lab.querySelector('span') ? lab.querySelector('span').textContent : '';
      const div = h('div', { class: 'control control-chips' });
      while (lab.firstChild) div.appendChild(lab.firstChild);
      lab.parentNode.replaceChild(div, lab);
      div.appendChild(chipify(sel, name));
    });
  }

  function pct(x) { return (x * 100).toFixed(2) + '%'; }
  function pctTex(x) { return '\\;(' + (x * 100).toFixed(2) + '\\%)'; }

  function tex(el, str, display) {
    if (window.katex) {
      el.innerHTML = window.katex.renderToString(str, { throwOnError: false, displayMode: !!display });
    } else {
      el.textContent = str;
    }
  }

  function renderInlineTex(scope) {
    (scope || document).querySelectorAll('.tex').forEach(function (el) {
      if (!el.dataset.done) { tex(el, el.dataset.tex, false); el.dataset.done = '1'; }
    });
  }

  const ORD = ['', '1st', '2nd', '3rd'];
  function fmt(x, d) { return Prob.fmt(x, d); }
  function int(n) { return n.toLocaleString('en-US'); }
  function fracTex(nA, nS) { return '\\frac{' + nA + '}{' + nS + '}'; }

  function niceTicks(min, max, count) {
    const span = (max - min) || 1;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
      ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    }
    return ticks;
  }

  /* ================= events ================= */

  const EV_FIELDS = [
    { key: 'pclass', label: 'Class', opts: [['any', 'Any class'], ['1', '1st class'], ['2', '2nd class'], ['3', '3rd class']] },
    { key: 'sex', label: 'Sex', opts: [['any', 'Any sex'], ['F', 'Female'], ['M', 'Male']] },
    { key: 'ageGroup', label: 'Age group', opts: [['any', 'Any age'], ['child', 'Child (< 18)'], ['adult', 'Adult (≥ 18)'], ['unknown', 'Age unknown']] },
    { key: 'survived', label: 'Survival', opts: [['any', 'Survivors and non-survivors'], ['1', 'Survived'], ['0', 'Died']] },
    { key: 'embarked', label: 'Embarked', opts: [['any', 'Any port'], ['S', 'Southampton'], ['C', 'Cherbourg'], ['Q', 'Queenstown']] },
    { key: 'alone', label: 'Travelling alone', opts: [['any', 'Alone or with family'], ['1', 'Travelling alone'], ['0', 'Travelling with family']] }
  ];

  const PHRASES = {
    pclass: { '1': '1st class', '2': '2nd class', '3': '3rd class' },
    sex: { 'F': 'female', 'M': 'male' },
    ageGroup: { child: 'a child (< 18)', adult: 'an adult (≥ 18)', unknown: 'age unknown' },
    survived: { '1': 'survived', '0': 'died' },
    embarked: { S: 'embarked at Southampton', C: 'embarked at Cherbourg', Q: 'embarked at Queenstown' },
    alone: { '1': 'travelling alone', '0': 'travelling with family' }
  };

  const DEFAULT_C = { pclass: 'any', sex: 'any', ageGroup: 'any', survived: 'any', embarked: 'S', alone: 'any' };

  function evPred(ev) {
    return function (r) {
      if (ev.pclass !== 'any' && String(r.pclass) !== ev.pclass) return false;
      if (ev.sex !== 'any' && r.sex !== ev.sex) return false;
      if (ev.ageGroup !== 'any' && r.ageGroup !== ev.ageGroup) return false;
      if (ev.survived !== 'any' && String(r.survived) !== ev.survived) return false;
      if (ev.embarked !== 'any' && String(r.embarked) !== ev.embarked) return false;
      if (ev.alone !== 'any' && String(r.alone ? '1' : '0') !== ev.alone) return false;
      return true;
    };
  }

  function describeEvent(ev) {
    const parts = [];
    EV_FIELDS.forEach(function (f) {
      if (ev[f.key] !== 'any') parts.push(PHRASES[f.key][ev[f.key]]);
    });
    return parts.length ? parts.join(', ') : 'the whole passenger list';
  }

  function evCount(ev) { return Prob.count(rows, evPred(ev)); }

  function eventSelect(ev, onChange) {
    const frag = document.createDocumentFragment();
    EV_FIELDS.forEach(function (f) {
      const sel = h('select');
      f.opts.forEach(function (o) { sel.append(h('option', { value: o[0], text: o[1] })); });
      sel.value = ev[f.key];
      sel.addEventListener('change', function () { ev[f.key] = sel.value; onChange(); });
      frag.append(h('label', { class: 'control' }, [h('span', { text: f.label }), sel]));
    });
    return frag;
  }

  function syncEventSelects(container, ev) {
    const sels = container.querySelectorAll('select');
    EV_FIELDS.forEach(function (f, i) {
      sels[i].value = ev[f.key];
      if (sels[i]._chipSync) sels[i]._chipSync();
    });
  }

  /* ================= SVG charts ================= */

  function hbarChart(mount, items) {
    const rowH = 26, labelW = 175, barW = 280, W = labelW + barW + 210;
    const H = items.length * rowH + 8;
    const svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'chart', role: 'img' });
    items.forEach(function (it, i) {
      const y = i * rowH + 5;
      const w = Math.max(1.5, it.value * barW);
      svg.append(TXT({ x: labelW - 8, y: y + 14, 'text-anchor': 'end' }, it.label));
      svg.append(S('rect', { x: labelW, y: y + 3, width: w, height: 15, 'class': it.dim ? 'bar dim' : 'bar' }));
      svg.append(TXT({ x: labelW + w + 8, y: y + 15, 'class': 'val' }, it.text));
    });
    mount.innerHTML = '';
    mount.appendChild(svg);
  }

  function vbarChart(mount, items, opts) {
    opts = opts || {};
    const W = opts.width || 620, padL = 46, padR = 12, padT = 24, padB = 34;
    const plotW = W - padL - padR, plotH = (opts.height || 260) - padT - padB;
    const maxV = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1e-9]));
    const H = padT + plotH + padB;
    const svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'chart', role: 'img' });
    [0, 0.5, 1].forEach(function (f) {
      const y = padT + plotH - f * plotH;
      svg.append(S('line', { x1: padL, y1: y, x2: W - padR, y2: y, 'class': f === 0 ? 'axis' : 'guide' }));
      svg.append(TXT({ x: padL - 6, y: y + 4, 'text-anchor': 'end' }, fmt(maxV * f, maxV >= 20 ? 0 : 2)));
    });
    const slot = plotW / items.length;
    const bw = Math.min(48, slot * 0.62);
    items.forEach(function (it, i) {
      const bh = it.value / maxV * plotH;
      const x = padL + i * slot + (slot - bw) / 2;
      const y = padT + plotH - bh;
      svg.append(S('rect', { x: x, y: y, width: bw, height: Math.max(bh, it.value > 0 ? 1 : 0), 'class': it.dim ? 'bar dim' : 'bar' }));
      svg.append(TXT({ x: padL + i * slot + slot / 2, y: padT + plotH + 16, 'text-anchor': 'middle' }, it.label));
      if (items.length <= 14) {
        svg.append(TXT({ x: padL + i * slot + slot / 2, y: Math.max(y - 5, 10), 'text-anchor': 'middle', 'class': 'val' }, it.text));
      }
    });
    mount.innerHTML = '';
    mount.appendChild(svg);
  }

  function lineChart(mount, values, opts) {
    const W = 620, H = 240, padL = 52, padR = 14, padT = 16, padB = 34;
    const maxV = Math.max.apply(null, values.concat([1e-9]));
    const svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'chart', role: 'img' });
    [0, 0.5, 1].forEach(function (f) {
      const y = padT + (H - padT - padB) * (1 - f);
      svg.append(S('line', { x1: padL, y1: y, x2: W - padR, y2: y, 'class': f === 0 ? 'axis' : 'guide' }));
      svg.append(TXT({ x: padL - 6, y: y + 4, 'text-anchor': 'end' }, fmt(maxV * f, 4)));
    });
    const n = values.length;
    const px = function (i) { return padL + (n === 1 ? 0 : i / (n - 1)) * (W - padL - padR); };
    const py = function (v) { return padT + (1 - v / maxV) * (H - padT - padB); };
    const d = values.map(function (v, i) { return (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(v).toFixed(1); }).join(' ');
    svg.append(S('path', { d: d, 'class': 'line' }));
    [0, Math.floor((n - 1) / 2), n - 1].forEach(function (i) {
      svg.append(TXT({ x: px(i), y: H - padB + 16, 'text-anchor': 'middle' }, String(i + 1)));
    });
    svg.append(TXT({ x: padL + (W - padL - padR) / 2, y: H - 2, 'text-anchor': 'middle' }, 'n'));
    mount.innerHTML = '';
    mount.appendChild(svg);
  }

  /* ================= header ================= */

  function initHeader() {
    document.getElementById('kfN').textContent = int(N);
    document.getElementById('kfS').textContent = int(nSurv);
    document.getElementById('kfP').textContent = fmt(Prob.p(nSurv, N));
    const f = rows.filter(function (r) { return r.sex === 'F'; });
    const m = rows.filter(function (r) { return r.sex === 'M'; });
    const pf = Prob.p(Prob.count(f, function (r) { return r.survived === 1; }), f.length);
    const pm = Prob.p(Prob.count(m, function (r) { return r.survived === 1; }), m.length);
    document.getElementById('kfFM').textContent = fmt(pf) + ' vs ' + fmt(pm);
  }

  /* ================= section 1: the data ================= */

  const VAR_META = [
    { key: 'pclass', meaning: 'Ticket class', values: '1, 2, 3' },
    { key: 'survived', meaning: 'Survived the sinking', values: '1 (yes) / 0 (no)' },
    { key: 'sex', meaning: 'Sex', values: '"F" / "M"' },
    { key: 'age', meaning: 'Age in years; fractional for infants', values: 'number or missing' },
    { key: 'sibsp', meaning: 'Siblings and spouses aboard', values: '0 – 8' },
    { key: 'parch', meaning: 'Parents and children aboard', values: '0 – 9' },
    { key: 'fare', meaning: 'Passenger fare, pre-1970 British pounds', values: 'number or missing' },
    { key: 'embarked', meaning: 'Port of embarkation', values: '"S", "C", "Q" or missing' }
  ];

  function initData() {
    const vt = document.getElementById('varTable');
    vt.innerHTML = '';
    vt.append(h('caption', { text: 'Table 1.1. Variables in the dataset; missing counts are computed live from the list.' }));
    vt.append(h('thead', {}, [h('tr', {}, [
      h('th', { text: 'Variable' }), h('th', { text: 'Meaning' }),
      h('th', { text: 'Values' }), h('th', { class: 'num', text: 'Missing' })
    ])]));
    const tb = h('tbody');
    VAR_META.forEach(function (v) {
      const miss = Prob.count(rows, function (r) { return r[v.key] === null; });
      tb.append(h('tr', {}, [
        h('td', {}, [h('code', { text: v.key })]),
        h('td', { text: v.meaning }),
        h('td', { text: v.values }),
        h('td', { class: 'num', text: miss ? int(miss) : '0' })
      ]));
    });
    vt.append(tb);

    // contingency table: class x sex x survived
    const ct = document.getElementById('contTable');
    ct.innerHTML = '';
    ct.append(h('caption', { text: 'Table 1.2. Passengers by class, sex and survival. The last column is P(survived | row), computed within the row.' }));
    ct.append(h('thead', {}, [h('tr', {}, [
      h('th', { text: 'Group' }), h('th', { class: 'num', text: 'n' }),
      h('th', { class: 'num', text: 'Survived' }), h('th', { class: 'num', text: 'Died' }),
      h('th', { class: 'num', text: 'P(survived | row)' })
    ])]));
    const tb2 = h('tbody');
    const grand = { n: 0, s: 0 };
    [1, 2, 3].forEach(function (cls) {
      const clsRows = rows.filter(function (r) { return r.pclass === cls; });
      const sub = { n: clsRows.length, s: Prob.count(clsRows, function (r) { return r.survived === 1; }) };
      [['F', 'female'], ['M', 'male']].forEach(function (sm) {
        const g = clsRows.filter(function (r) { return r.sex === sm[0]; });
        const ns = Prob.count(g, function (r) { return r.survived === 1; });
        const ng = g.length;
        tb2.append(countRow(cls + ' class · ' + sm[1], ng, ns, false));
      });
      tb2.append(countRow(cls + ' class, all', sub.n, sub.s, true));
      grand.n += sub.n; grand.s += sub.s;
    });
    tb2.append(countRow('All passengers', grand.n, grand.s, true, true));
    ct.append(tb2);
    document.getElementById('contCaption').textContent =
      'Third class alone accounts for ' + int(Prob.count(rows, function (r) { return r.pclass === 3; })) +
      ' of ' + int(N) + ' passengers (' + fmt(Prob.p(Prob.count(rows, function (r) { return r.pclass === 3; }), N)) +
      '), yet its survival rate is the lowest of the three classes. This asymmetry drives most of this lab.';

    function countRow(label, n, ns, isSub, isTotal) {
      const p = Prob.p(ns, n);
      return h('tr', { class: isTotal ? 'total' : (isSub ? 'subtotal' : '') }, [
        h('td', { text: label }),
        h('td', { class: 'num', text: int(n) }),
        h('td', { class: 'num', text: int(ns) }),
        h('td', { class: 'num', text: int(n - ns) }),
        h('td', { class: 'num', html: ns + ' / ' + n + ' = ' + fmt(p) })
      ]);
    }

    const mb = document.getElementById('modelBox1');
    mb.innerHTML = '';
    const p = h('p');
    tex(p, 'P(A)=\\frac{n(A)}{n(S)}', false);
    mb.append(
      h('p', {}, [h('strong', { text: 'The probability model. ' }),
        document.createTextNode(' The experiment behind every probability on this page is: choose one passenger uniformly at random from the ' + int(N) + ' on the list. The sample space S is the set of all passengers, n(S) = ' + int(N) + ', and for any event A the classical definition applies: ')]),
      p,
      h('p', { text: 'Both the counting fraction and its decimal value (4 dp) are always shown, so that every number can be traced back to a count of passengers.' })
    );
  }

  /* ================= table of contents ================= */

  function initTOC() {
    const links = Array.prototype.slice.call(document.querySelectorAll('.toc-list a'));
    const secs = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
    if (!('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove('active'); });
        const i = secs.indexOf(e.target);
        if (i >= 0) {
          links[i].classList.add('active');
        }
      });
    }, { rootMargin: '-10% 0px -75% 0px' });
    secs.forEach(function (s) { if (s) obs.observe(s); });
    const det = document.getElementById('tocDetails');
    if (det && window.innerWidth >= 1100) det.open = true;
  }

  /* ================= section 2: event builder ================= */

  const PRESETS = [
    { name: 'Survived & female', A: { survived: '1' }, B: { sex: 'F' } },
    { name: '1st class & survived', A: { pclass: '1' }, B: { survived: '1' } },
    { name: 'Male & female (mutually exclusive)', A: { sex: 'M' }, B: { sex: 'F' } },
    { name: 'Embarked at Q & 3rd class', A: { embarked: 'Q' }, B: { pclass: '3' } },
    { name: 'Child & survived', A: { ageGroup: 'child' }, B: { survived: '1' } }
  ];

  function initEvents() {
    const grid = document.getElementById('eventControls');
    const wrapA = h('div', { class: 'event-def' });
    const wrapB = h('div', { class: 'event-def' });
    const descA = h('p', { class: 'ev-desc' });
    const descB = h('p', { class: 'ev-desc' });
    wrapA.append(h('h4', { text: 'Event A' }), descA);
    wrapB.append(h('h4', { text: 'Event B' }), descB);
    wrapA.appendChild(eventSelect(state.evA, renderEvents));
    wrapB.appendChild(eventSelect(state.evB, renderEvents));
    grid.append(wrapA, wrapB);

    const cToggle = document.getElementById('cToggle');
    const cWrap = h('div', { class: 'event-def' });
    const descC = h('p', { class: 'ev-desc' });
    cWrap.append(h('h4', { text: 'Event C' }), descC);
    const evCStore = defaultEvent();
    evCStore.embarked = 'S';
    cWrap.appendChild(eventSelect(evCStore, function () { if (state.evC) renderEvents(); }));
    const cControls = document.getElementById('cControls');
    cControls.appendChild(cWrap);
    cToggle.addEventListener('change', function () {
      state.evC = cToggle.checked ? evCStore : null;
      cControls.hidden = !cToggle.checked;
      renderEvents();
    });

    const presetRow = document.getElementById('presetRow');
    PRESETS.forEach(function (pr) {
      const b = h('button', { class: 'btn btn-small', type: 'button', text: pr.name });
      b.addEventListener('click', function () {
        Object.assign(state.evA, defaultEvent(), pr.A);
        Object.assign(state.evB, defaultEvent(), pr.B);
        syncEventSelects(wrapA, state.evA);
        syncEventSelects(wrapB, state.evB);
        renderEvents();
      });
      presetRow.append(b);
    });

    renderEvents();
  }

  function pLine(str) {
    const p = h('p', { class: 'math-line' });
    tex(p, str, true);
    return p;
  }

  function renderEvents() {
    const evA = state.evA, evB = state.evB;
    const grid = document.getElementById('eventControls');
    const descs = Array.prototype.slice.call(grid.querySelectorAll('.ev-desc'));
    const cDesc = document.querySelector('#cControls .ev-desc');
    if (cDesc) descs[2] = cDesc;
    descs[0].textContent = 'A = {' + describeEvent(evA) + '}';
    descs[1].textContent = 'B = {' + describeEvent(evB) + '}';
    if (descs[2]) descs[2].textContent = 'C = {' + describeEvent(state.evC || DEFAULT_C) + '}';

    const predA = evPred(evA), predB = evPred(evB);
    const nA = Prob.count(rows, predA);
    const nB = Prob.count(rows, predB);
    const nAB = Prob.count(rows, function (r) { return predA(r) && predB(r); });
    const nU = nA + nB - nAB;
    const nNeither = N - nU;
    const pA = Prob.p(nA, N), pB = Prob.p(nB, N), pAB = Prob.p(nAB, N), pU = Prob.p(nU, N);

    const out = document.getElementById('eventOutput');
    out.innerHTML = '';
    out.append(h('div', { class: 'count-grid' }, [
      countCell('n(A)', nA), countCell('n(B)', nB),
      countCell('n(A ∩ B)', nAB), countCell('n(A ∪ B)', nU)
    ]));
    const cAB = Prob.conditional(pAB, pB), cBA = Prob.conditional(pAB, pA);
    out.append(h('div', { class: 'pct-grid', 'aria-live': 'polite' }, [
      pctCell('P(A)', pA, nA + ' / ' + N),
      pctCell('P(B)', pB, nB + ' / ' + N),
      pctCell('P(A ∩ B)', pAB, nAB + ' / ' + N),
      pctCell('P(A ∪ B)', pU, nU + ' / ' + N),
      pctCell('P(A | B)', cAB, cAB === null ? 'P(B) = 0' : nAB + ' / ' + nB, true),
      pctCell('P(B | A)', cBA, cBA === null ? 'P(A) = 0' : nAB + ' / ' + nA, true)
    ]));
    out.append(pLine('P(A)=\\frac{n(A)}{n(S)}=' + fracTex(nA, N) + '=' + fmt(pA) + pctTex(pA)));
    out.append(pLine("P(A')=1-P(A)=1-" + fmt(pA) + '=' + fmt(1 - pA)));
    out.append(pLine('P(B)=\\frac{n(B)}{n(S)}=' + fracTex(nB, N) + '=' + fmt(pB) + pctTex(pB)));
    out.append(pLine("P(B')=1-P(B)=1-" + fmt(pB) + '=' + fmt(1 - pB)));
    out.append(pLine('P(A\\cap B)=\\frac{n(A\\cap B)}{n(S)}=' + fracTex(nAB, N) + '=' + fmt(pAB) + pctTex(pAB)));
    out.append(pLine('P(A\\cup B)=\\frac{n(A\\cup B)}{n(S)}=' + fracTex(nU, N) + '=' + fmt(pU) + pctTex(pU)));
    out.append(pLine('P(A\\cup B)=P(A)+P(B)-P(A\\cap B)=' + fmt(pA) + '+' + fmt(pB) + '-' + fmt(pAB) + '=' + fmt(pU)));
    if (pB === 0) {
      out.append(pLine('P(A\\mid B)=\\frac{P(A\\cap B)}{P(B)}\\ \\text{is undefined, because } P(B)=0'));
    } else {
      out.append(pLine('P(A\\mid B)=\\frac{P(A\\cap B)}{P(B)}=\\frac{' + fracTex(nAB, N) + '}{' + fracTex(nB, N) + '}=' + fracTex(nAB, nB) + '=' + fmt(Prob.conditional(pAB, pB)) + pctTex(Prob.conditional(pAB, pB))));
    }
    if (pA === 0) {
      out.append(pLine('P(B\\mid A)=\\frac{P(A\\cap B)}{P(A)}\\ \\text{is undefined, because } P(A)=0'));
    } else {
      out.append(pLine('P(B\\mid A)=\\frac{P(A\\cap B)}{P(A)}=\\frac{' + fracTex(nAB, N) + '}{' + fracTex(nA, N) + '}=' + fracTex(nAB, nA) + '=' + fmt(Prob.conditional(pAB, pA)) + pctTex(Prob.conditional(pAB, pA))));
    }

    renderVerdicts(nA, nB, nAB, pA, pB, pAB);
    renderVenn(nA, nB, nAB, nNeither);
    renderIndependence();
  }

  function pctCell(label, p, frac, strong) {
    return h('div', { class: 'pct-cell' + (strong ? ' strong' : '') }, [
      h('div', { class: 'pc-label', text: label }),
      h('div', { class: 'pc-value', text: p === null ? 'n/a' : pct(p) }),
      h('div', { class: 'pc-frac', text: frac })
    ]);
  }

  function countCell(label, value) {
    return h('div', { class: 'count-cell' }, [
      h('div', { class: 'cc-label', text: label }),
      h('div', { class: 'cc-value', text: int(value) })
    ]);
  }

  function renderVerdicts(nA, nB, nAB, pA, pB, pAB) {
    const box = document.getElementById('verdicts');
    box.innerHTML = '';
    // mutual exclusivity
    if (nAB === 0 && nA > 0 && nB > 0) {
      box.append(h('div', { class: 'verdict no' }, [
        h('p', {}, [h('span', { class: 'v-title', text: 'Mutually exclusive. ' }),
          document.createTextNode('No passenger satisfies both conditions (n(A ∩ B) = 0). Moreover, since P(A) = ' + fmt(pA) + ' > 0 and P(B) = ' + fmt(pB) + ' > 0, the events cannot be independent: independence would require P(A ∩ B) = P(A)·P(B) = ' + fmt(pA * pB) + ', not 0. A lecture fact: mutually exclusive events with non-zero probabilities are never independent.')])
      ]));
    } else if (nAB === 0) {
      box.append(h('div', { class: 'verdict' }, [
        h('p', {}, [h('span', { class: 'v-title', text: 'Trivially exclusive. ' }),
          document.createTextNode('n(A ∩ B) = 0, but one of the events is empty (n(A) = ' + int(nA) + ', n(B) = ' + int(nB) + '), so there is nothing to infer.')])
      ]));
    } else {
      box.append(h('div', { class: 'verdict' }, [
        h('p', {}, [h('span', { class: 'v-title', text: 'Not mutually exclusive. ' }),
          document.createTextNode(int(nAB) + ' passenger' + (nAB === 1 ? '' : 's') + ' satisf' + (nAB === 1 ? 'ies' : 'y') + ' both conditions, so P(A ∩ B) = ' + fmt(pAB) + ' ≠ 0.')])
      ]));
    }
    // independence
    const prod = pA * pB;
    const indep = Prob.isIndependent(nA, nB, nAB, N);
    const condAB = Prob.conditional(pAB, pB);
    const cls = indep ? 'ok' : 'no';
    const parts = [h('p', {}, [h('span', { class: 'v-title', text: (indep ? 'Independent.' : 'Not independent.') })])];
    let txt = 'Definition: A and B are independent if P(A ∩ B) = P(A)·P(B). Here P(A ∩ B) = ' + nAB + ' / ' + N + ' = ' + fmt(pAB) +
      ' and P(A)·P(B) = ' + fmt(pA) + '·' + fmt(pB) + ' = ' + fmt(prod) + '. In whole numbers: n(A ∩ B)·n(S) = ' + int(nAB * N) +
      (indep ? ' = ' : ' ≠ ') + int(nA * nB) + ' = n(A)·n(B), so the two sides are ' + (indep ? 'equal.' : 'not equal.');
    if (condAB !== null) {
      txt += ' The same check in conditional form: P(A|B) = ' + fmt(condAB) + (indep ? ' = ' : ' ≠ ') + 'P(A) = ' + fmt(pA) + '.';
    }
    parts.push(h('p', { text: txt }));
    box.append(h('div', { class: 'verdict ' + cls }, parts));
  }

  function renderVenn(nA, nB, nAB, nNeither) {
    const mount = document.getElementById('venn');
    const W = 340, H = 210;
    const svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'chart', role: 'img' });
    svg.append(S('rect', { x: 6, y: 6, width: W - 12, height: H - 12, 'class': 'frame' }));
    svg.append(TXT({ x: 16, y: 26 }, 'S'));
    svg.append(S('circle', { cx: 128, cy: 108, r: 66, fill: 'var(--accent)', 'fill-opacity': '0.10', stroke: 'var(--accent)', 'stroke-width': '1.5' }));
    svg.append(S('circle', { cx: 212, cy: 108, r: 66, fill: 'var(--survived)', 'fill-opacity': '0.12', stroke: 'var(--survived)', 'stroke-width': '1.5' }));
    svg.append(TXT({ x: 96, y: 44, 'class': 'val' }, 'A'));
    svg.append(TXT({ x: 238, y: 44, 'class': 'val' }, 'B'));
    const aOnly = nA - nAB, bOnly = nB - nAB;
    svg.append(TXT({ x: 106, y: 112, 'text-anchor': 'middle', 'class': 'val' }, int(aOnly)));
    svg.append(TXT({ x: 170, y: 112, 'text-anchor': 'middle', 'class': 'val' }, int(nAB)));
    svg.append(TXT({ x: 234, y: 112, 'text-anchor': 'middle', 'class': 'val' }, int(bOnly)));
    svg.append(TXT({ x: W - 18, y: H - 14, 'text-anchor': 'end' }, 'neither: ' + int(nNeither)));
    mount.innerHTML = '';
    mount.appendChild(svg);
  }

  /* ================= section 3: conditional probability ================= */

  const BAR_GROUPS = [
    { label: '1st class · female', pred: function (r) { return r.pclass === 1 && r.sex === 'F'; } },
    { label: '2nd class · female', pred: function (r) { return r.pclass === 2 && r.sex === 'F'; } },
    { label: '1st class', pred: function (r) { return r.pclass === 1; } },
    { label: 'child (< 18)', pred: function (r) { return r.ageGroup === 'child'; } },
    { label: '2nd class · male', pred: function (r) { return r.pclass === 2 && r.sex === 'M'; } },
    { label: '3rd class · female', pred: function (r) { return r.pclass === 3 && r.sex === 'F'; } },
    { label: 'female', pred: function (r) { return r.sex === 'F'; } },
    { label: 'age unknown', pred: function (r) { return r.ageGroup === 'unknown'; } },
    { label: 'adult (≥ 18)', pred: function (r) { return r.ageGroup === 'adult'; } },
    { label: '3rd class', pred: function (r) { return r.pclass === 3; } },
    { label: 'male', pred: function (r) { return r.sex === 'M'; } },
    { label: '2nd class', pred: function (r) { return r.pclass === 2; } },
    { label: '1st class · male', pred: function (r) { return r.pclass === 1 && r.sex === 'M'; } },
    { label: '3rd class · male', pred: function (r) { return r.pclass === 3 && r.sex === 'M'; } }
  ];

  const DRAW_GROUPS = [
    { label: 'survivors', pred: function (r) { return r.survived === 1; } },
    { label: 'female passengers', pred: function (r) { return r.sex === 'F'; } },
    { label: 'male passengers', pred: function (r) { return r.sex === 'M'; } },
    { label: '1st class', pred: function (r) { return r.pclass === 1; } },
    { label: '2nd class', pred: function (r) { return r.pclass === 2; } },
    { label: '3rd class', pred: function (r) { return r.pclass === 3; } },
    { label: 'children', pred: function (r) { return r.ageGroup === 'child'; } },
    { label: 'adults', pred: function (r) { return r.ageGroup === 'adult'; } },
    { label: '1st-class women', pred: function (r) { return r.pclass === 1 && r.sex === 'F'; } },
    { label: '3rd-class men', pred: function (r) { return r.pclass === 3 && r.sex === 'M'; } },
    { label: 'embarked at Southampton', pred: function (r) { return r.embarked === 'S'; } },
    { label: 'embarked at Queenstown', pred: function (r) { return r.embarked === 'Q'; } },
    { label: 'travelling alone', pred: function (r) { return r.alone; } }
  ];

  function initConditional() {
    // Part A: survival rate by group
    const items = BAR_GROUPS.map(function (g) {
      const n = Prob.count(rows, g.pred);
      const ns = Prob.count(rows, function (r) { return g.pred(r) && r.survived === 1; });
      return { label: g.label, n: n, ns: ns, p: Prob.p(ns, n) };
    }).sort(function (a, b) { return b.p - a.p; });
    hbarChart(document.getElementById('groupBars'), items.map(function (it) {
      return { label: it.label, value: it.p, text: fmt(it.p) + '  (' + it.ns + ' / ' + it.n + ')' };
    }));

    // Part B: drawing without replacement
    const controls = document.getElementById('drawControls');
    const gsel = h('select');
    DRAW_GROUPS.forEach(function (g, i) { gsel.append(h('option', { value: i, text: g.label })); });
    gsel.value = state.drawGroup;
    const ksel = h('select');
    for (let k = 1; k <= 10; k++) ksel.append(h('option', { value: k, text: String(k) }));
    ksel.value = state.drawK;
    gsel.addEventListener('change', function () { state.drawGroup = +gsel.value; renderDraw(); });
    ksel.addEventListener('change', function () { state.drawK = +ksel.value; renderDraw(); });
    controls.append(
      h('label', { class: 'control' }, [h('span', { text: 'Group A' }), gsel]),
      h('label', { class: 'control' }, [h('span', { text: 'Draws k' }), ksel])
    );
    renderDraw();
  }

  function renderDraw() {
    const g = DRAW_GROUPS[state.drawGroup];
    const k = state.drawK;
    const nA = Prob.count(rows, g.pred);
    const out = document.getElementById('drawOut');
    out.innerHTML = '';
    if (nA === 0) {
      out.append(h('p', { class: 'muted-line', text: 'No passengers match this group.' }));
      return;
    }
    const chain = Prob.chainWithoutReplacement(nA, N, k);
    const p0 = Prob.p(nA, N);
    const withRep = Math.pow(p0, k);
    const factors = chain.factors.map(function (f) { return fracTex(f.num, f.den); }).join('\\cdot');
    out.append(pLine('P(\\text{all } k \\text{ draws in } A)=\\frac{' + nA + '}{' + N + '}\\cdot\\frac{' + (nA - 1) + '}{' + (N - 1) + '}\\cdots\\frac{' + (nA - k + 1) + '}{' + (N - k + 1) + '}=' + factors + '=' + fmt(chain.value) + pctTex(chain.value)));
    out.append(pLine('P(\\text{all } k \\text{ draws in } A)=\\Big(' + fracTex(nA, N) + '\\Big)^{' + k + '}=' + fmt(p0) + '^{' + k + '}=' + fmt(withRep) + '\\quad(\\text{with replacement, independent draws})'));
    const diffTxt = Math.abs(chain.value - withRep) < 5e-5
      ? 'For this group and k the two experiments practically coincide.'
      : 'The two values differ by ' + fmt(Math.abs(chain.value - withRep)) + ' here.';
    let note = 'Without replacement the draws are dependent: every passenger removed from the list shrinks both the numerator and the denominator of the next factor. This is the chain form of the multiplication rule. ' +
      diffTxt + ' As the list grows relative to k, the shrinking matters less and the two models converge.';
    if (k > nA) note = 'k exceeds n(A): the group runs out of passengers, so the event is impossible and the chain product is 0, the clearest sign that the draws are dependent.';
    out.append(h('p', { class: 'muted-line', text: note }));
  }

  /* ================= section 4: independence ================= */

  function initIndependence() {
    renderIndependence();
  }

  function evNotPred(pred) { return function (r) { return !pred(r); }; }

  function renderIndependence() {
    const predA = evPred(state.evA), predB = evPred(state.evB);
    const predNA = evNotPred(predA), predNB = evNotPred(predB);
    const nA = Prob.count(rows, predA), nB = Prob.count(rows, predB);
    const pA = Prob.p(nA, N), pB = Prob.p(nB, N);

    // 4.1 complements table
    const ct = document.getElementById('compTable');
    ct.innerHTML = '';
    ct.append(h('caption', { text: 'Table 4.1. Combinations of A, B and their complements. Each row tests the definition P(X ∩ Y) = P(X)·P(Y) exactly, in whole numbers: n(X ∩ Y)·n(S) = n(X)·n(Y).' }));
    ct.append(h('thead', {}, [h('tr', {}, [
      h('th', { text: 'Events' }), h('th', { class: 'num', text: 'n(X ∩ Y)' }),
      h('th', { class: 'num', text: 'P(X ∩ Y)' }), h('th', { class: 'num', text: 'P(X)·P(Y)' }),
      h('th', { class: 'num', text: 'n(X ∩ Y)·n(S) vs n(X)·n(Y)' }), h('th', { text: 'Independent?' })
    ])]));
    const tb = h('tbody');
    const pairs = [
      ['A ∩ B', predA, predB, nA, nB],
      ["A ∩ B′", predA, predNB, nA, N - nB],
      ["A′ ∩ B", predNA, predB, N - nA, nB],
      ["A′ ∩ B′", predNA, predNB, N - nA, N - nB]
    ];
    const abIndep = Prob.isIndependent(nA, nB, Prob.count(rows, function (r) { return predA(r) && predB(r); }), N);
    pairs.forEach(function (row) {
      const nXY = Prob.count(rows, function (r) { return row[1](r) && row[2](r); });
      const pXY = Prob.p(nXY, N);
      const pX = Prob.p(row[3], N), pY = Prob.p(row[4], N);
      const prod = pX * pY;
      const ok = Prob.isIndependent(row[3], row[4], nXY, N);
      tb.append(h('tr', {}, [
        h('td', { text: row[0] }),
        h('td', { class: 'num', text: int(nXY) }),
        h('td', { class: 'num', text: nXY + ' / ' + N + ' = ' + fmt(pXY) }),
        h('td', { class: 'num', text: fmt(pX) + '·' + fmt(pY) + ' = ' + fmt(prod) }),
        h('td', { class: 'num', text: int(nXY * N) + (ok ? ' = ' : ' ≠ ') + int(row[3] * row[4]) }),
        h('td', {}, [h('span', { class: 'tick ' + (ok ? 'yes' : 'no'), text: ok ? '✓ yes' : '✗ no' })])
      ]));
    });
    ct.append(tb);

    const oldCap = document.getElementById('compCaption');
    if (oldCap) oldCap.remove();
    const caption = h('p', {
      id: 'compCaption', class: 'muted-line',
      text: abIndep
        ? 'A and B from §2 are independent, and, as the lecture fact promises, so are the mixed pairs A ∩ B′, A′ ∩ B and A′ ∩ B′.'
        : 'A and B from §2 are not independent, so the lecture fact makes no promise here; each mixed pair is checked on its own merits.'
    });
    const tableWrap = ct.parentNode; // .table-scroll
    tableWrap.parentNode.insertBefore(caption, tableWrap.nextSibling);

    // 4.2 three events
    const evC = state.evC || DEFAULT_C;
    const predC = evPred(evC);
    const nC = Prob.count(rows, predC);
    const pC = Prob.p(nC, N);
    const cond = function (preds) {
      return Prob.count(rows, function (r) { return preds.every(function (p) { return p(r); }); });
    };
    const cAB = cond([predA, predB]), cAC = cond([predA, predC]), cBC = cond([predB, predC]), cABC = cond([predA, predB, predC]);
    const rows3 = [
      ['P(A ∩ B) = P(A)·P(B)', Prob.p(cAB, N), pA * pB, cAB * N === nA * nB],
      ['P(A ∩ C) = P(A)·P(C)', Prob.p(cAC, N), pA * pC, cAC * N === nA * nC],
      ['P(B ∩ C) = P(B)·P(C)', Prob.p(cBC, N), pB * pC, cBC * N === nB * nC],
      // n(A∩B∩C)·n(S)² = n(A)·n(B)·n(C): stays below 2^53, so the comparison is exact
      ['P(A ∩ B ∩ C) = P(A)·P(B)·P(C)', Prob.p(cABC, N), pA * pB * pC, cABC * N * N === nA * nB * nC]
    ];
    const tt = document.getElementById('threeTable');
    tt.innerHTML = '';
    tt.append(h('caption', { text: 'Table 4.2. Mutual independence of A, B and C (C = {' + describeEvent(evC) + '}). All four conditions must hold.' }));
    tt.append(h('thead', {}, [h('tr', {}, [
      h('th', { text: 'Condition' }), h('th', { class: 'num', text: 'left side' }),
      h('th', { class: 'num', text: 'right side' }), h('th', { text: 'Holds?' })
    ])]));
    const tb3 = h('tbody');
    const flags = rows3.map(function (r3) {
      const ok = r3[3];
      tb3.append(h('tr', {}, [
        h('td', { text: r3[0] }),
        h('td', { class: 'num', text: fmt(r3[1]) }),
        h('td', { class: 'num', text: fmt(r3[2]) }),
        h('td', {}, [h('span', { class: 'tick ' + (ok ? 'yes' : 'no'), text: ok ? '✓ yes' : '✗ no' })])
      ]));
      return ok;
    });
    tt.append(tb3);
    const verdict = document.getElementById('threeVerdict');
    verdict.innerHTML = '';
    let vText, vCls;
    if (flags[0] && flags[1] && flags[2] && flags[3]) {
      vText = 'Verdict: mutually independent: all four conditions hold exactly.';
      vCls = 'ok';
    } else if (flags[0] && flags[1] && flags[2]) {
      vText = 'Verdict: pairwise independent only. The three pairwise conditions hold but the triple product fails. Pairwise independence does not imply mutual independence.';
      vCls = 'no';
    } else {
      vText = 'Verdict: not independent: at least one pairwise condition already fails.';
      vCls = 'no';
    }
    verdict.append(h('div', { class: 'verdict ' + vCls }, [h('p', { text: vText })]));
  }

  /* ================= section 5: total probability and Bayes ================= */

  const PARTITIONS = {
    pclass: {
      label: 'Ticket class', groups: [
        { v: '1', label: '1st class' }, { v: '2', label: '2nd class' }, { v: '3', label: '3rd class' }
      ]
    },
    sex: {
      label: 'Sex', groups: [
        { v: 'F', label: 'Female' }, { v: 'M', label: 'Male' }
      ]
    },
    ageGroup: {
      label: 'Age group', groups: [
        { v: 'child', label: 'Child (< 18)' }, { v: 'adult', label: 'Adult (≥ 18)' }, { v: 'unknown', label: 'Age unknown' }
      ]
    },
    embarked: {
      label: 'Port of embarkation', groups: [
        { v: 'S', label: 'Southampton' }, { v: 'C', label: 'Cherbourg' }, { v: 'Q', label: 'Queenstown' }, { v: 'unknown', label: 'Port unknown' }
      ]
    }
  };

  function partPred(key, v) {
    if (key === 'embarked' && v === 'unknown') return function (r) { return r.embarked === null; };
    return function (r) { return String(r[key]) === v; };
  }

  function initBayes() {
    const controls = document.getElementById('bayesControls');
    const psel = h('select');
    Object.keys(PARTITIONS).forEach(function (k) { psel.append(h('option', { value: k, text: PARTITIONS[k].label })); });
    psel.value = state.bayesPart;
    const esel = h('select', {}, [
      h('option', { value: '1', text: 'E = {survived}' }),
      h('option', { value: '0', text: 'E = {died}' })
    ]);
    esel.value = state.bayesEv;
    psel.addEventListener('change', function () { state.bayesPart = psel.value; renderBayes(); });
    esel.addEventListener('change', function () { state.bayesEv = esel.value; renderBayes(); });
    controls.append(
      h('label', { class: 'control' }, [h('span', { text: 'Partition H₁…Hₘ' }), psel]),
      h('label', { class: 'control' }, [h('span', { text: 'Event E' }), esel])
    );
    renderBayes();
  }

  function renderBayes() {
    const part = PARTITIONS[state.bayesPart];
    const evLabel = state.bayesEv === '1' ? 'survived' : 'died';
    const evPredFn = function (r) { return r.survived === (+state.bayesEv); };
    const nE = Prob.count(rows, evPredFn);
    const groups = part.groups.map(function (g) {
      const predH = partPred(state.bayesPart, g.v);
      const nH = Prob.count(rows, predH);
      const nHE = Prob.count(rows, function (r) { return predH(r) && evPredFn(r); });
      return {
        label: g.label, nH: nH, prior: Prob.p(nH, N),
        nHE: nHE, lik: Prob.p(nHE, nH), term: Prob.p(nHE, N)
      };
    });
    const tp = Prob.totalProbability(groups.map(function (g) { return g.prior; }), groups.map(function (g) { return g.lik; }));
    const post = Prob.bayes(groups.map(function (g) { return g.prior; }), groups.map(function (g) { return g.lik; }));

    renderTree(groups, evLabel);
    document.getElementById('treeCaption').textContent = 'Figure 5.1. Probability tree by ' + part.label.toLowerCase() + ': multiply along each path to get P(Hᵢ ∩ E).';

    const out = document.getElementById('totalOut');
    out.innerHTML = '';
    const sumStr = tp.terms.map(function (t) { return fmt(t); }).join('+');
    const termStr = groups.filter(function (g) { return g.nH > 0; }).map(function (g) {
      return fracTex(g.nH, N) + '\\cdot' + fracTex(g.nHE, g.nH);
    }).join('+');
    out.append(pLine('P(E)=\\sum_i P(H_i)\\,P(E\\mid H_i)'));
    out.append(pLine('P(\\text{' + evLabel + '})=' + termStr));
    out.append(pLine('P(\\text{' + evLabel + '})=' + sumStr + '=' + fmt(tp.total) + pctTex(tp.total)));

    // Bayes table
    const bt = document.getElementById('bayesTable');
    bt.innerHTML = '';
    bt.append(h('caption', { text: 'Table 5.1. Total probability and Bayes’ theorem by ' + part.label.toLowerCase() + ' for E = {' + evLabel + '}. The last column is the posterior: the share of ' + (state.bayesEv === '1' ? 'survivors' : 'the dead') + ' coming from each group.' }));
    bt.append(h('thead', {}, [h('tr', {}, [
      h('th', { text: 'Hᵢ' }), h('th', { class: 'num', text: 'P(Hᵢ)' }),
      h('th', { class: 'num', text: 'P(E | Hᵢ)' }), h('th', { class: 'num', text: 'P(Hᵢ)·P(E | Hᵢ)' }),
      h('th', { class: 'num', text: 'P(Hᵢ | E)' })
    ])]));
    const tb = h('tbody');
    let maxRatio = null, minRatio = null;
    groups.forEach(function (g, i) {
      const ratio = g.prior > 0 ? post[i] / g.prior : 0;
      if (!maxRatio || ratio > maxRatio.ratio) maxRatio = { g: g, ratio: ratio, post: post[i] };
      if (!minRatio || ratio < minRatio.ratio) minRatio = { g: g, ratio: ratio, post: post[i] };
      tb.append(h('tr', {}, [
        h('td', { text: g.label }),
        h('td', { class: 'num' }, [g.nH + ' / ' + N + ' = ' + fmt(g.prior), h('span', { class: 'frac-note', text: 'prior' })]),
        h('td', { class: 'num' }, [g.nH === 0 ? 'n/a' : g.nHE + ' / ' + g.nH + ' = ' + fmt(g.lik)]),
        h('td', { class: 'num', text: fmt(tp.terms[i]) }),
        h('td', { class: 'num' }, [fmt(post[i]) + ' (' + pct(post[i]) + ')', h('span', { class: 'frac-note', text: 'posterior' })])
      ]));
    });
    tb.append(h('tr', { class: 'total' }, [
      h('td', { text: 'Total' }),
      h('td', { class: 'num', text: fmt(1) }),
      h('td', { text: '' }),
      h('td', { class: 'num', text: fmt(tp.total) }),
      h('td', { class: 'num', text: fmt(1) })
    ]));
    bt.append(tb);

    // narrative note
    const note = document.getElementById('bayesNote');
    note.textContent = 'Read the table left to right. The prior column is simply the composition of the passenger list; the posterior column is the composition of the ' +
      (state.bayesEv === '1' ? 'survivors' : 'dead') + '. Bayes’ theorem is the bookkeeping that turns one into the other. ' +
      'Given E = {' + evLabel + '}, the share of ' + minRatio.g.label + ' falls from a prior ' + fmt(minRatio.g.prior) + ' to a posterior ' + fmt(minRatio.post) +
      ' (×' + fmt(minRatio.ratio, 2) + '), while ' + maxRatio.g.label + ' rises from ' + fmt(maxRatio.g.prior) + ' to ' + fmt(maxRatio.post) +
      ' (×' + fmt(maxRatio.ratio, 2) + ').';

    // verification
    const ver = document.getElementById('bayesVerify');
    ver.innerHTML = '';
    const pEl = h('p');
    tex(pEl, 'P(' + evLabel + ')=\\frac{n(' + evLabel + ')}{n(S)}=' + fracTex(nE, N) + '=' + fmt(Prob.p(nE, N)) + '\\quad\\text{(direct count)}', true);
    ver.append(h('div', { class: 'verdict ' + (Math.abs(tp.total - Prob.p(nE, N)) < 1e-9 ? 'ok' : 'no') }, [
      h('p', {}, [h('span', { class: 'v-title', text: 'Verification. ' }),
        document.createTextNode('The total from the partition (' + fmt(tp.total) + ') equals the direct count n(E)/n(S) = ' + int(nE) + ' / ' + int(N) + ' = ' + fmt(Prob.p(nE, N)) + '. The partition is complete (every passenger falls in exactly one group), so the two must agree.')]),
      pEl
    ]));
  }

  function renderTree(groups, evLabel) {
    const mount = document.getElementById('tree');
    const per = 92, W = 580, H = groups.length * per + 16;
    const svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'chart', role: 'img' });
    const rootX = 24, midX = 235, leafX = 470;
    const midY = H / 2;
    svg.append(S('circle', { cx: rootX, cy: midY, r: 3.5, fill: 'var(--ink)' }));
    groups.forEach(function (g, i) {
      const gy = i * per + per / 2 + 8;
      const eY = gy - 17, neY = gy + 17;
      // edges
      svg.append(S('line', { x1: rootX, y1: midY, x2: midX, y2: gy, stroke: 'var(--muted)', 'stroke-width': '1' }));
      svg.append(S('line', { x1: midX, y1: gy, x2: leafX, y2: eY, stroke: 'var(--survived)', 'stroke-width': '1' }));
      svg.append(S('line', { x1: midX, y1: gy, x2: leafX, y2: neY, stroke: 'var(--died)', 'stroke-width': '1' }));
      svg.append(S('circle', { cx: midX, cy: gy, r: 3, fill: 'var(--accent)' }));
      svg.append(S('circle', { cx: leafX, cy: eY, r: 3, fill: 'var(--survived)' }));
      svg.append(S('circle', { cx: leafX, cy: neY, r: 3, fill: 'var(--died)' }));
      // edge labels
      svg.append(TXT({ x: (rootX + midX) / 2, y: (midY + gy) / 2 - 5, 'text-anchor': 'middle' }, fmt(g.prior)));
      svg.append(TXT({ x: (midX + leafX) / 2, y: (gy + eY) / 2 - 4, 'text-anchor': 'middle', fill: 'var(--survived)' }, fmt(g.lik)));
      svg.append(TXT({ x: (midX + leafX) / 2, y: (gy + neY) / 2 + 11, 'text-anchor': 'middle', fill: 'var(--died)' }, fmt(1 - g.lik)));
      // node labels
      svg.append(TXT({ x: midX + 8, y: gy - 6, 'class': 'val' }, g.label));
      svg.append(TXT({ x: leafX + 10, y: eY + 4 }, 'E: ' + fmt(g.term)));
      svg.append(TXT({ x: leafX + 10, y: neY + 4 }, 'E′: ' + fmt(g.prior - g.term)));
    });
    svg.append(TXT({ x: rootX - 4, y: midY - 10 }, 'root'));
    svg.append(TXT({ x: leafX + 10, y: 14 }, 'E = {' + evLabel + '}'));
    mount.innerHTML = '';
    mount.appendChild(svg);
  }

  /* ================= section 6: several independent passengers ================= */

  const BOAT_PROFILE_FIELDS = [
    { key: 'pclass', label: 'Class', opts: [['any', 'Any class'], ['1', '1st class'], ['2', '2nd class'], ['3', '3rd class']] },
    { key: 'sex', label: 'Sex', opts: [['any', 'Any sex'], ['F', 'Female'], ['M', 'Male']] },
    { key: 'ageGroup', label: 'Age group', opts: [['any', 'Any age'], ['child', 'Child (< 18)'], ['adult', 'Adult (≥ 18)'], ['unknown', 'Age unknown']] }
  ];

  function profilePred(prof) {
    return function (r) {
      if (prof.pclass !== 'any' && String(r.pclass) !== prof.pclass) return false;
      if (prof.sex !== 'any' && r.sex !== prof.sex) return false;
      if (prof.ageGroup !== 'any' && r.ageGroup !== prof.ageGroup) return false;
      return true;
    };
  }

  function profileLabel(prof) {
    const parts = [];
    BOAT_PROFILE_FIELDS.forEach(function (f) {
      if (prof[f.key] !== 'any') parts.push(f.opts.filter(function (o) { return o[0] === prof[f.key]; })[0][1].toLowerCase());
    });
    return parts.length ? parts.join(', ') : 'any passenger';
  }

  function profileProb(prof) {
    const pred = profilePred(prof);
    const n = Prob.count(rows, pred);
    if (n === 0) return { n: 0, ns: 0, p: null };
    const ns = Prob.count(rows, function (r) { return pred(r) && r.survived === 1; });
    return { n: n, ns: ns, p: Prob.p(ns, n) };
  }

  function initBoat() {
    document.getElementById('addBoat').addEventListener('click', function () {
      if (state.boat.length >= 8) return;
      state.boat.push({ pclass: 'any', sex: 'any', ageGroup: 'any' });
      renderBoat();
    });
    renderBoat();
  }

  function renderBoat() {
    const mount = document.getElementById('boatRows');
    mount.innerHTML = '';
    state.boat.forEach(function (prof, i) {
      const row = h('div', { class: 'boat-row' });
      row.append(h('span', { class: 'row-num', text: String(i + 1) }));
      BOAT_PROFILE_FIELDS.forEach(function (f) {
        const sel = h('select');
        f.opts.forEach(function (o) { sel.append(h('option', { value: o[0], text: o[1] })); });
        sel.value = prof[f.key];
        sel.addEventListener('change', function () { prof[f.key] = sel.value; renderBoat(); });
        row.append(h('label', { class: 'control' }, [h('span', { text: f.label }), sel]));
      });
      const info = profileProb(prof);
      const pEl = h('span', { class: 'boat-p' });
      if (info.p === null) {
        pEl.append(h('span', { class: 'nodata', text: 'no data, excluded' }));
      } else {
        pEl.textContent = 'p' + (i + 1) + ' = ' + info.ns + ' / ' + info.n + ' = ' + fmt(info.p) + ' (' + pct(info.p) + ')';
      }
      row.append(pEl);
      const rm = h('button', { class: 'btn btn-small btn-quiet', type: 'button', text: 'Remove' });
      rm.disabled = state.boat.length <= 1;
      rm.addEventListener('click', function () { state.boat.splice(i, 1); renderBoat(); });
      row.append(rm);
      mount.append(row);
    });
    chipifyAll(mount);
    document.getElementById('addBoat').disabled = state.boat.length >= 8;
    renderBoatOut();
    renderDistX();
  }

  function validBoatPs() {
    return state.boat.map(profileProb).filter(function (x) { return x.p !== null; }).map(function (x) { return x.p; });
  }

  function renderBoatOut() {
    const out = document.getElementById('boatOut');
    out.innerHTML = '';
    const ps = validBoatPs();
    if (!ps.length) {
      out.append(h('p', { class: 'muted-line', text: 'No passenger with data in the group yet. Adjust the profiles.' }));
      return;
    }
    const subs = ps.map(function (p) { return fmt(p); }).join('\\cdot');
    const subsC = ps.map(function (p) { return fmt(1 - p); }).join('\\cdot');
    const all = Prob.allOf(ps), none = Prob.noneOf(ps);
    out.append(pLine('p_i=P(\\text{survived}\\mid\\text{profile}_i)=\\frac{n(\\text{survived}\\cap\\text{profile}_i)}{n(\\text{profile}_i)}'));
    out.append(pLine('P(\\text{all survive})=\\prod_i p_i=' + subs + '=' + fmt(all) + pctTex(all)));
    out.append(pLine('P(\\text{nobody survives})=\\prod_i (1-p_i)=' + subsC + '=' + fmt(none) + pctTex(none)));
    out.append(pLine('P(\\text{at least one survives})=1-\\prod_i(1-p_i)=1-' + fmt(none) + '=' + fmt(1 - none) + pctTex(1 - none)));
    out.append(pLine('P(\\text{exactly one survives})=\\sum_i p_i\\prod_{j\\neq i}(1-p_j)=' + fmt(Prob.exactlyOne(ps)) + pctTex(Prob.exactlyOne(ps))));
    out.append(pLine('P(\\text{at most one survives})=P(\\text{none})+P(\\text{exactly one})=' + fmt(none) + '+' + fmt(Prob.exactlyOne(ps)) + '=' + fmt(Prob.atMostOne(ps)) + pctTex(Prob.atMostOne(ps))));
    const excluded = state.boat.length - ps.length;
    out.append(h('p', { class: 'muted-line', text: (excluded ? excluded + ' profile' + (excluded === 1 ? ' has' : 's have') + ' no data and ' + (excluded === 1 ? 'is' : 'are') + ' excluded. ' : '') + 'These values assume independence between the ' + ps.length + ' members (see the caveat in §4).' }));
  }

  function initStreaks() {
    const controls = document.getElementById('streakControls');
    const gsel = h('select');
    DRAW_GROUPS.forEach(function (g, i) { gsel.append(h('option', { value: i, text: g.label })); });
    gsel.value = state.streakGroup;
    const nInput = h('input', { type: 'range', min: '1', max: '50', step: '1', value: String(state.streakN), 'aria-label': 'n, number of independent passengers' });
    const nVal = h('span', { class: 'row-num', text: 'n = ' + state.streakN });
    gsel.addEventListener('change', function () { state.streakGroup = +gsel.value; renderStreak(); });
    nInput.addEventListener('input', function () { state.streakN = +nInput.value; nVal.textContent = 'n = ' + state.streakN; renderStreak(); });
    controls.append(
      h('label', { class: 'control' }, [h('span', { text: 'Group' }), gsel]),
      h('label', { class: 'control' }, [h('span', { text: 'n' }), nInput]),
      nVal
    );
    renderStreak();
  }

  function renderStreak() {
    const g = DRAW_GROUPS[state.streakGroup];
    const n = state.streakN;
    const nA = Prob.count(rows, g.pred);
    const out = document.getElementById('streakOut');
    out.innerHTML = '';
    if (nA === 0) {
      out.append(h('p', { class: 'muted-line', text: 'No passengers match this group.' }));
      return;
    }
    const nAS = Prob.count(rows, function (r) { return g.pred(r) && r.survived === 1; });
    const p = Prob.p(nAS, nA);
    out.append(pLine('p=P(\\text{survived}\\mid\\text{' + g.label + '})=' + fracTex(nAS, nA) + '=' + fmt(p)));
    out.append(pLine('P(\\text{all } n \\text{ survive})=p^{' + n + '}=' + fmt(p) + '^{' + n + '}=' + fmt(Math.pow(p, n)) + pctTex(Math.pow(p, n))));
    const vals = [];
    for (let i = 1; i <= n; i++) vals.push(Math.pow(p, i));
    lineChart(document.getElementById('streakChart'), vals);
  }

  /* ================= section 7: random variables ================= */

  function initRV() {
    renderDistX();
    initFam();
    renderClassZ();
  }

  function renderDistX() {
    const mount = document.getElementById('distXOut');
    mount.innerHTML = '';
    const ps = validBoatPs();
    if (!ps.length) {
      mount.append(h('p', { class: 'muted-line', text: 'Define at least one profile with data in §6.1.' }));
      document.getElementById('distXChart').innerHTML = '';
      return;
    }
    const od = Prob.outcomeDistribution(ps);
    const q = od.dist;
    const n = ps.length;

    // list every outcome while the list is short enough to read (2^3 = 8 rows)
    if (n <= 3) {
      const ot = h('table');
      ot.append(h('caption', { text: 'Table 7.1. All ' + od.outcomes.length + ' outcomes for the group: S = survives, D = dies. Each outcome is an intersection of independent events, so its probability is a product.' }));
      ot.append(h('thead', {}, [h('tr', {}, [
        h('th', { text: 'Outcome' }), h('th', { class: 'num', text: 'x' }), h('th', { class: 'num', text: 'Probability' })
      ])]));
      const otb = h('tbody');
      od.outcomes.forEach(function (o) {
        const factors = o.pattern.map(function (s, i) { return fmt(s ? ps[i] : 1 - ps[i]); }).join(' · ');
        otb.append(h('tr', {}, [
          h('td', { text: o.pattern.map(function (s) { return s ? 'S' : 'D'; }).join(' ') }),
          h('td', { class: 'num', text: String(o.k) }),
          h('td', { class: 'num', text: factors + ' = ' + fmt(o.prob) })
        ]));
      });
      ot.append(otb);
      const ow = h('div', { class: 'table-scroll' });
      ow.append(ot);
      mount.append(ow);
    } else {
      mount.append(h('p', { class: 'muted-line', text: 'With ' + n + ' passengers there are 2^' + n + ' = ' + int(od.outcomes.length) + ' outcomes. They are summed in the same way; only the totals are shown. Reduce the group to 3 passengers to see every outcome.' }));
    }

    const tbl = h('table');
    tbl.append(h('caption', { text: 'Table 7.2. Distribution of X = number of survivors among the ' + n + ' passengers of the lifeboat group. Outcomes with the same x are mutually exclusive, so their probabilities are added.' }));
    tbl.append(h('thead', {}, [h('tr', {}, [h('th', { class: 'num', text: 'x' }), h('th', { class: 'num', text: 'P(X = x)' })])]));
    const tb = h('tbody');
    q.forEach(function (prob, k) {
      tb.append(h('tr', {}, [h('td', { class: 'num', text: String(k) }), h('td', { class: 'num', text: fmt(prob) + ' (' + pct(prob) + ')' })]));
    });
    let sum = 0; q.forEach(function (v) { sum += v; });
    tb.append(h('tr', { class: 'total' }, [h('td', { class: 'num', text: 'Σ' }), h('td', { class: 'num', text: fmt(sum) })]));
    tbl.append(tb);
    const wrap = h('div', { class: 'table-scroll' });
    wrap.append(tbl);
    mount.append(wrap);
    vbarChart(document.getElementById('distXChart'), q.map(function (prob, k) {
      return { label: String(k), value: prob, text: fmt(prob) };
    }), { height: 220 });
  }

  function initFam() {
    const controls = document.getElementById('famControls');
    const sel = h('select', {}, [
      h('option', { value: 'all', text: 'All classes' }),
      h('option', { value: '1', text: '1st class only' }),
      h('option', { value: '2', text: '2nd class only' }),
      h('option', { value: '3', text: '3rd class only' })
    ]);
    sel.value = state.famFilter;
    sel.addEventListener('change', function () { state.famFilter = sel.value; renderFam(); });
    controls.append(h('label', { class: 'control' }, [h('span', { text: 'Filter' }), sel]));
    renderFam();
  }

  function famCounts(subset) {
    const counts = {};
    subset.forEach(function (r) { counts[r.familySize] = (counts[r.familySize] || 0) + 1; });
    return { counts: counts, n: subset.length };
  }

  function renderFam() {
    const subset = state.famFilter === 'all' ? rows : rows.filter(function (r) { return String(r.pclass) === state.famFilter; });
    const st = famCounts(subset);
    const maxY = Math.max.apply(null, Object.keys(st.counts).map(Number));
    const tbl = document.getElementById('famTable');
    tbl.innerHTML = '';
    tbl.append(h('caption', { text: 'Table 7.3. Distribution of Y = family size aboard (' + (state.famFilter === 'all' ? 'all passengers' : ORD[+state.famFilter] + ' class') + '), P(Y = y) = n(Y = y) / n(S).' }));
    tbl.append(h('thead', {}, [h('tr', {}, [h('th', { class: 'num', text: 'y' }), h('th', { class: 'num', text: 'n(Y = y)' }), h('th', { class: 'num', text: 'P(Y = y)' })])]));
    const tb = h('tbody');
    let sum = 0;
    for (let y = 1; y <= maxY; y++) {
      const c = st.counts[y] || 0;
      const pr = Prob.p(c, st.n);
      sum += pr;
      tb.append(h('tr', {}, [
        h('td', { class: 'num', text: String(y) }),
        h('td', { class: 'num', text: int(c) }),
        h('td', { class: 'num', text: c + ' / ' + st.n + ' = ' + fmt(pr) })
      ]));
    }
    tb.append(h('tr', { class: 'total' }, [h('td', { text: 'Σ' }), h('td', { class: 'num', text: int(st.n) }), h('td', { class: 'num', text: fmt(sum) })]));
    tbl.append(tb);
    vbarChart(document.getElementById('famChart'), (function () {
      const items = [];
      for (let y = 1; y <= maxY; y++) {
        items.push({ label: String(y), value: st.counts[y] || 0, text: int(st.counts[y] || 0) });
      }
      return items;
    })(), { height: 220 });
  }

  function renderClassZ() {
    const tbl = document.getElementById('classTable');
    tbl.innerHTML = '';
    tbl.append(h('caption', { text: 'Table 7.4. Distribution of Z = ticket class of a randomly chosen passenger.' }));
    tbl.append(h('thead', {}, [h('tr', {}, [h('th', { class: 'num', text: 'z' }), h('th', { class: 'num', text: 'n' }), h('th', { class: 'num', text: 'P(Z = z)' })])]));
    const tb = h('tbody');
    let sum = 0;
    [1, 2, 3].forEach(function (cls) {
      const c = Prob.count(rows, function (r) { return r.pclass === cls; });
      const pr = Prob.p(c, N);
      sum += pr;
      tb.append(h('tr', {}, [
        h('td', { class: 'num', text: String(cls) }),
        h('td', { class: 'num', text: int(c) }),
        h('td', { class: 'num', text: c + ' / ' + N + ' = ' + fmt(pr) })
      ]));
    });
    tb.append(h('tr', { class: 'total' }, [h('td', { class: 'num', text: 'Σ' }), h('td', { class: 'num', text: int(N) }), h('td', { class: 'num', text: fmt(sum) })]));
    tbl.append(tb);
  }

  /* ================= section 8: self-check ================= */

  const QUIZ_EVENTS = [
    { label: 'female', pred: function (r) { return r.sex === 'F'; } },
    { label: 'male', pred: function (r) { return r.sex === 'M'; } },
    { label: 'a 1st-class passenger', pred: function (r) { return r.pclass === 1; } },
    { label: 'a 2nd-class passenger', pred: function (r) { return r.pclass === 2; } },
    { label: 'a 3rd-class passenger', pred: function (r) { return r.pclass === 3; } },
    { label: 'a child (under 18)', pred: function (r) { return r.ageGroup === 'child'; } },
    { label: 'an adult (18 or older)', pred: function (r) { return r.ageGroup === 'adult'; } },
    { label: 'a survivor', pred: function (r) { return r.survived === 1; } },
    { label: 'a non-survivor', pred: function (r) { return r.survived === 0; } },
    { label: 'a passenger who embarked at Southampton', pred: function (r) { return r.embarked === 'S'; } },
    { label: 'a passenger who embarked at Cherbourg', pred: function (r) { return r.embarked === 'C'; } },
    { label: 'a passenger travelling alone', pred: function (r) { return r.alone; } }
  ];

  const quiz = { q: null, score: 0, total: 0 };

  function initQuiz() {
    document.getElementById('quizNew').addEventListener('click', newQuestion);
    newQuestion();
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function newQuestion() {
    const type = pick(['pa', 'pcond', 'punion', 'indep', 'bayes', 'atleast']);
    let q;
    if (type === 'pa') {
      const A = pick(QUIZ_EVENTS);
      const nA = Prob.count(rows, A.pred);
      q = {
        type: type, html: 'Choose one passenger at random. What is P(the passenger is ' + A.label + ')?',
        answer: Prob.p(nA, N),
        sol: 'P(A)=\\frac{n(A)}{n(S)}=' + fracTex(nA, N) + '=' + fmt(Prob.p(nA, N))
      };
    } else if (type === 'pcond') {
      let B = pick(QUIZ_EVENTS), A = pick(QUIZ_EVENTS), nB, nAB, guard = 0;
      do {
        B = pick(QUIZ_EVENTS); A = pick(QUIZ_EVENTS);
        nB = Prob.count(rows, B.pred);
        nAB = Prob.count(rows, function (r) { return A.pred(r) && B.pred(r); });
        guard++;
      } while ((A === B || nB === 0 || nAB === 0) && guard < 60);
      q = {
        type: type, html: 'A passenger is known to be ' + B.label + '. What is P(the passenger is ' + A.label + ' | this)?',
        answer: Prob.conditional(Prob.p(nAB, N), Prob.p(nB, N)),
        sol: 'P(A\\mid B)=\\frac{n(A\\cap B)}{n(B)}=' + fracTex(nAB, nB) + '=' + fmt(Prob.p(nAB, nB))
      };
    } else if (type === 'punion') {
      const A = pick(QUIZ_EVENTS), B = pick(QUIZ_EVENTS.filter(function (e) { return e !== A; }));
      const nA = Prob.count(rows, A.pred), nB = Prob.count(rows, B.pred);
      const nAB = Prob.count(rows, function (r) { return A.pred(r) && B.pred(r); });
      q = {
        type: type, html: 'What is P(the passenger is ' + A.label + ' or ' + B.label + ')?',
        answer: Prob.p(nA + nB - nAB, N),
        sol: 'P(A\\cup B)=\\frac{n(A)+n(B)-n(A\\cap B)}{n(S)}=\\frac{' + nA + '+' + nB + '-' + nAB + '}{' + N + '}=' + fracTex(nA + nB - nAB, N) + '=' + fmt(Prob.p(nA + nB - nAB, N))
      };
    } else if (type === 'indep') {
      const A = pick(QUIZ_EVENTS), B = pick(QUIZ_EVENTS.filter(function (e) { return e !== A; }));
      const nA = Prob.count(rows, A.pred), nB = Prob.count(rows, B.pred);
      const nAB = Prob.count(rows, function (r) { return A.pred(r) && B.pred(r); });
      const pA = Prob.p(nA, N), pB = Prob.p(nB, N), pAB = Prob.p(nAB, N);
      const yes = Prob.isIndependent(nA, nB, nAB, N);
      q = {
        type: type, html: 'Is &ldquo;the passenger is ' + A.label + '&rdquo; independent of &ldquo;the passenger is ' + B.label + '&rdquo;?',
        answer: yes, yesno: true,
        sol: 'P(A\\cap B)=\\frac{' + nAB + '}{' + N + '}=' + fmt(pAB) + ',\\quad P(A)\\,P(B)=' + fmt(pA) + '\\cdot' + fmt(pB) + '=' + fmt(pA * pB) + ',\\quad n(A\\cap B)\\,n(S)=' + nAB * N + (yes ? '=' : '\\neq ') + nA * nB + '=n(A)\\,n(B)' + (yes ? '\\ \\Rightarrow\\ \\text{yes}' : '\\ \\Rightarrow\\ \\text{no}')
      };
    } else if (type === 'bayes') {
      const cls = pick([1, 2, 3]);
      const surv = Math.random() < 0.5;
      const nH = Prob.count(rows, function (r) { return r.pclass === cls; });
      const nHE = Prob.count(rows, function (r) { return r.pclass === cls && r.survived === (surv ? 1 : 0); });
      const nE = Prob.count(rows, function (r) { return r.survived === (surv ? 1 : 0); });
      q = {
        type: type, html: 'A passenger ' + (surv ? 'survived' : 'did not survive') + '. What is P(passenger travelled in ' + ORD[cls] + ' class | this)?',
        answer: Prob.p(nHE, nE),
        sol: 'P(H\\mid E)=\\frac{n(H\\cap E)}{n(E)}=' + fracTex(nHE, nE) + '=' + fmt(Prob.p(nHE, nE))
      };
    } else {
      const A = pick(QUIZ_EVENTS.filter(function (e) { return Prob.count(rows, e.pred) > 0; }));
      const nA = Prob.count(rows, A.pred);
      const nn = 2 + Math.floor(Math.random() * 4);
      const p = Prob.p(nA, N);
      q = {
        type: type, html: 'Choose ' + nn + ' passengers independently at random (with replacement). What is the probability that at least one of them is ' + A.label + '?',
        answer: 1 - Math.pow(1 - p, nn),
        sol: 'P(\\text{at least one})=1-(1-p)^{' + nn + '}=1-(1-' + fmt(p) + ')^{' + nn + '}=1-' + fmt(Math.pow(1 - p, nn)) + '=' + fmt(1 - Math.pow(1 - p, nn))
      };
    }
    quiz.q = q;
    const box = document.getElementById('quizBox');
    box.innerHTML = '';
    const pEl = h('p', { class: 'q-text', html: q.html });
    box.append(pEl);
    const row = document.getElementById('quizAnswerRow');
    row.innerHTML = '';
    const res = document.getElementById('quizResult');
    res.textContent = ''; res.className = '';
    const sol = document.getElementById('quizSolution');
    sol.innerHTML = '';
    document.getElementById('quizShow').hidden = true;
    if (q.yesno) {
      const sel = h('select', { 'aria-label': 'Your answer' }, [h('option', { value: '', text: 'Choose…' }), h('option', { value: 'yes', text: 'Yes' }), h('option', { value: 'no', text: 'No' })]);
      const btn = h('button', { class: 'btn', type: 'button', text: 'Check' });
      btn.addEventListener('click', function () {
        if (!sel.value) return;
        checkAnswer(sel.value === 'yes');
      });
      row.append(h('label', { class: 'control' }, [h('span', { text: 'Your answer' }), sel]), btn);
      chipifyAll(row);
    } else {
      const input = h('input', { type: 'text', inputmode: 'decimal', 'aria-label': 'Your answer (decimal)' });
      const btn = h('button', { class: 'btn', type: 'button', text: 'Check' });
      const submit = function () {
        const v = parseFloat(input.value.replace(',', '.'));
        if (isNaN(v)) return;
        checkAnswer(Math.abs(v - q.answer) <= 0.001);
      };
      btn.addEventListener('click', submit);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      row.append(h('label', { class: 'control' }, [h('span', { text: 'Your answer' }), input]), btn);
    }
  }

  function checkAnswer(correct) {
    quiz.total++;
    if (correct) quiz.score++;
    document.getElementById('quizScore').textContent = 'Score: ' + quiz.score + ' / ' + quiz.total;
    const res = document.getElementById('quizResult');
    res.className = correct ? 'ok' : 'no';
    res.textContent = correct ? '✓ Correct.' : '✗ Not quite. The correct answer is ' + (quiz.q.yesno ? (quiz.q.answer ? 'yes' : 'no') : fmt(quiz.q.answer)) + '.';
    document.getElementById('quizShow').hidden = false;
  }

  function initQuizSolution() {
    document.getElementById('quizShow').addEventListener('click', function () {
      const sol = document.getElementById('quizSolution');
      sol.innerHTML = '';
      const pEl = h('p', { class: 'math-line' });
      tex(pEl, quiz.q.sol, true);
      sol.append(pEl);
      document.getElementById('quizShow').hidden = true;
    });
  }

  /* ================= section 9: formula reference ================= */

  const FORMULAS = [
    {
      group: 'Foundations (classical definition)', items: [
        { tex: 'P(A)=\\dfrac{n(A)}{n(S)}', note: 'Probability = favourable count over total count; the model is one uniformly chosen passenger.', sec: 1 },
        { tex: "P(A')=1-P(A)", note: 'The complement rule: the probability of “not A”.', sec: 2 }
      ]
    },
    {
      group: 'Addition rule', items: [
        { tex: 'P(A\\cup B)=P(A)+P(B)-P(A\\cap B)', note: '“A or B”; subtract the overlap so it is not counted twice.', sec: 2 },
        { tex: 'P(A\\cap B)=0\\ \\Rightarrow\\ P(A\\cup B)=P(A)+P(B)', note: 'For mutually exclusive events the overlap vanishes.', sec: 2 }
      ]
    },
    {
      group: 'Conditional probability', items: [
        { tex: 'P(A\\mid B)=\\dfrac{P(A\\cap B)}{P(B)},\\ P(B)>0', note: 'Probability of A restricted to the world where B happened.', sec: 3 }
      ]
    },
    {
      group: 'Multiplication rule', items: [
        { tex: 'P(A\\cap B)=P(B)\\,P(A\\mid B)', note: 'Chain two events; the base changes after the first.', sec: 3 },
        { tex: 'P(A_1\\cap\\cdots\\cap A_k)=P(A_1)P(A_2\\mid A_1)\\cdots P(A_k\\mid A_1\\cdots A_{k-1})', note: 'k draws without replacement; each factor uses the shrunken list.', sec: 3 }
      ]
    },
    {
      group: 'Independence', items: [
        { tex: 'P(A\\cap B)=P(A)\\,P(B)\\ \\Leftrightarrow\\ P(A\\mid B)=P(A)', note: 'Knowing B tells nothing about A. Checked exactly, in whole numbers: n(A ∩ B)·n(S) = n(A)·n(B).', sec: 4 },
        { tex: 'A,B\\ \\text{indep.}\\ \\Rightarrow\\ A\\text{ and }B\',\\ A\'\\text{ and }B,\\ A\'\\text{ and }B\'\\ \\text{indep.}', note: 'Lecture fact: independence survives taking complements.', sec: 4 },
        { tex: 'P(A\\cap B)=P(A)P(B),\\ P(A\\cap C)=P(A)P(C),\\ P(B\\cap C)=P(B)P(C),\\ P(A\\cap B\\cap C)=P(A)P(B)P(C)', note: 'Mutual independence of three events needs all four conditions.', sec: 4 }
      ]
    },
    {
      group: 'Several independent events', items: [
        { tex: 'P(A_1\\cap\\cdots\\cap A_n)=\\prod_i P(A_i)', note: 'Everyone succeeds.', sec: 6 },
        { tex: 'P(\\text{at least one})=1-\\prod_i\\bigl(1-P(A_i)\\bigr)', note: 'Complement of “nobody succeeds”.', sec: 6 },
        { tex: 'P(\\text{exactly one})=\\sum_i P(A_i)\\prod_{j\\neq i}\\bigl(1-P(A_j)\\bigr)', note: 'Pick the one who succeeds, the rest fail.', sec: 6 },
        { tex: 'P(\\text{all } n)=p^n', note: 'Equal probabilities: the lecture’s 44-game streak and 24-bulb Christmas lights.', sec: 6 }
      ]
    },
    {
      group: 'Total probability and Bayes', items: [
        { tex: 'P(E)=\\sum_{i=1}^{m}P(H_i)\\,P(E\\mid H_i)', note: 'Rebuild P(E) from a partition H₁…Hₘ of the sample space.', sec: 5 },
        { tex: 'P(H_i\\mid E)=\\dfrac{P(H_i)\\,P(E\\mid H_i)}{\\sum_j P(H_j)\\,P(E\\mid H_j)}', note: 'Reverse the conditioning: from P(E|H) to P(H|E).', sec: 5 }
      ]
    },
    {
      group: 'Random variables', items: [
        { tex: '\\sum_i P(X=x_i)=1', note: 'The probabilities in a distribution table add up to 1 (used to find k in the practice paper, Q5 and Q17).', sec: 7 },
        { tex: 'P(X=k)=\\sum_{\\text{outcomes with }k\\text{ successes}}\\ \\prod_i P(\\text{outcome}_i)', note: 'List the outcomes, multiply along each one (independence), add the mutually exclusive outcomes with the same k.', sec: 7 }
      ]
    }
  ];

  function initRef() {
    const mount = document.getElementById('formulaRef');
    FORMULAS.forEach(function (gdef) {
      const g = h('div', { class: 'ref-group' });
      g.append(h('h3', { text: gdef.group }));
      gdef.items.forEach(function (item) {
        const math = h('div', { class: 'ref-math' });
        tex(math, item.tex, false);
        g.append(h('div', { class: 'ref-item' }, [
          math,
          h('div', { class: 'ref-note' }, [
            document.createTextNode(item.note + ' '),
            h('a', { href: '#sec' + item.sec, text: 'Used in §' + item.sec })
          ])
        ]));
      });
      mount.append(g);
    });
  }

  /* ================= boot ================= */

  function init() {
    renderInlineTex(document);
    initHeader();
    initData();
    initEvents();
    initConditional();
    initIndependence();
    initBayes();
    initBoat();
    initStreaks();
    initRV();
    initQuiz();
    initQuizSolution();
    initRef();
    chipifyAll(document);
    initTOC();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
