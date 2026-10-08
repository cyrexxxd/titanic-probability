# Probability on the Titanic

An interactive lab in probability theory and statistics, built on the passenger
list of RMS Titanic (1912). Every probability, distribution, test statistic and
confidence interval on the page is computed live in the browser from the raw
data — there are no prepared answers.

## What it covers

Classical probability, the addition and multiplication rules, conditional
probability, independence (including mutual independence of three events),
drawing without replacement, total probability and Bayes' theorem, several
independent events, random variables and their distributions, and a full
correlation study (Pearson r, least-squares line, t-test, confidence interval).

## Running locally

It is a pure static site — no build step, no dependencies, no network needed
except the KaTeX and Google-Fonts CDNs (the page also degrades gracefully
without them).

- Open `index.html` directly in a browser (`file://` works), **or**
- serve the folder with any static server, e.g.
  `python -m http.server`, and open <http://localhost:8000>.

## Files

- `index.html` — the single-page report
- `css/style.css` — styling (light/dark, print stylesheet, responsive)
- `js/prob.js` — pure probability/statistics functions (`window.Prob`),
  also loadable in Node via `module.exports` for unit testing
- `js/app.js` — UI: builds controls, tables and SVG charts from the data
- `data/titanic.js` — the passenger list (`window.TITANIC`)

## Data source

titanic3 dataset, Vanderbilt University Department of Biostatistics:
https://hbiostat.org/data/ — 1,309 passengers (crew excluded), 500 survived.
