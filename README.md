# token-radar-entry

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/lsummi27-ui/token-radar-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/lsummi27-ui/token-radar-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Built for [make.fun's token-radar-01 bounty](https://make.fun/bounty/token-radar-01).

A token launch radar: it reads a sealed snapshot of DeFi protocols, ranks
the ones that record no token by an implied value, and hands in a dashboard
a reader can use — a sortable, filterable board, a detail view for each
protocol with the model's own breakdown, and a farm plan for every row.

## The model

The implied value is a comparables model, worked out from the snapshot's
own figures. For each category, the multiple is the median
market-cap-to-TVL ratio of the live-token protocols in that category (three
or more comparables, or the whole market's median when a category has too
few), clamped to 0.05–1.0. Then:

```
implied = TVL × category multiple × growth × maturity
```

Growth is the protocol's seven-day TVL change, clamped to −60%–+120% and
worth half its weight; maturity runs from 0.55 for a protocol tracked less
than a month to 1.00 after 1,095 days with no token. One function scores
every protocol; no name is special-cased.

The board is the snapshot's 40-protocol watchlist plus every genuinely
pre-token protocol below the $50M floor — 178 rows. Wrapped, staked and
bridged products are left out: their token already trades, so they are not
protocols still waiting on a launch of their own.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` (Node 22, standard library only) writes `board.json` and
`data.js` to the output directory, copies `dashboard/` and `screenshots/`,
and writes `dossier.json` with the vendored make.fun library.

## Layout

- `main.ts` — the entry program.
- `lib/model.ts` — the valuation model, the board builder and the farm plans.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied from the kit.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js` (no network).
- `screenshots/` — the board, a detail view and a filtered view.
