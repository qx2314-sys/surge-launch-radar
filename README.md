# surge-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/qx2314-sys/surge-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/qx2314-sys/surge-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Build the best token launch radar. It reads a sealed snapshot of every protocol and writes a web dashboard that ranks the protocols with no token yet by what their launch would be worth, each with the steps to farm it — priced for the surge: recent launches set the price, a hot week counts extra, and the newest protocols rank highest.

The board covers the snapshot's whole 40-protocol watchlist plus 138 early protocols below the $50M floor — every one of them genuinely still waiting on a launch: pre-token, and not a wrapped, staked or bridged product of a token that already trades. The value model (radar-surge) prices each protocol from the market's newest launches: the multiple is the median market-cap-to-TVL of the live-token protocols in the same category that launched within the last two years, times seven-day TVL growth amplified at weight 1.5, times a recency factor that is 1.00 on listing day and slides to 0.60 by day 720, times a small bonus for chain breadth. Each protocol gets an eight-step farm plan built for speed — the first actions happen within days — with what it costs and how long it takes, derived from its own category, chains, size and age. The dashboard leads with a "Newest & fastest" strip, shows age and 7d change prominently in the table, and every detail view opens with the recency and surge breakdown.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

Node 22.18 or later, standard library only, no network, no install. The program reads the snapshot, writes `out/board.json` (178 rows), `out/data.js`, copies `dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json`. Two runs write the same bytes. The three screenshots were taken from this dashboard in a headless browser.

---

<sub>Entered on [make.fun](https://make.fun/?ref=fgckatac&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
