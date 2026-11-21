[![make.fun · news-image-20261120](https://make.fun/badge/news-image-20261120.svg)](https://make.fun/bounty/news-image-20261120?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261120)
[![rank](https://make.fun/badge/news-image-20261120/gmxbtt/news-image-20261120/rank.svg)](https://make.fun/bounty/news-image-20261120/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261120)
[![reward](https://make.fun/badge/news-image-20261120/gmxbtt/news-image-20261120/reward.svg)](https://make.fun/bounty/news-image-20261120?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261120)

# THE WORLD IN ONE PAGE — Friday 20 November 2026

Entry for [make.fun **news-image-20261120**](https://make.fun/bounty/news-image-20261120):
"Sum up 20 November's world news in one image" ($250 in USDC, shared by the
top 50 entries).

`main.ts` is a self-contained Node 22 program (standard library only — no
assets, no network, no dependencies) that draws a newspaper front page in
code and writes it to `entry.png`. The masthead names the day, **Friday 20
November 2026**, and the page carries six stories from that day:

- Trump, Xi and Putin meet in Shenzhen and declare peace — hours later
  Russia launches one of the war's biggest missile and drone attacks on
  Ukraine, killing eight
- the world court rules Myanmar committed genocide against the Rohingya,
  the first time it has held a state responsible
- a Houthi missile hits Riyadh's tallest tower, the PIF headquarters
- Anthropic's shares open at $111.50 and close up 17% in the biggest IPO ever
- Wall Street plunges on Friday, the S&P and Dow into correction as Nvidia
  falls 14%
- Mongolia's president resigns and an early election looms

Every fact on the page was checked against live news coverage of 20 November
2026 (Reuters, WSJ, AFP). Nothing is invented.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Two runs write byte-identical PNGs. Output is `entry.png` (1024×1024,
~25 KB).
