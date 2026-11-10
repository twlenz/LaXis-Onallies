# LaXis & OnAllies

An area-control war game set in **La Crosse** and **Onalaska, Wisconsin**. La Crosse and Onalaska fight for control of both cities while a zombie outbreak closes in from the north, east and south. The mechanics come from Axis & Allies: purchase, combat move, combat, noncombat move, mobilize, and dice that hit on a roll at or under the unit's value.

![Board preview](print/board-preview.png)

## Play

- **Digital (hot-seat or vs. computer):** open [`game/index.html`](game/index.html) in a browser. It needs no install or server, and works offline. Two people can share a screen, or the computer can play either or both sides. The game autosaves in the browser, and you can also download a save file from the menu.
- **Tabletop:** print the files in [`print/`](print/):

| File | What it is |
|---|---|
| `board-poster-24x*.pdf` | The full board on one 24-inch-wide sheet (print shop) |
| `board-tiled-letter.pdf` | The same board as letter-size tiles to trim and tape |
| `counters.pdf` | Infantry, tanks, the Gundersen Helicopter, the Onalaska Plane, zombies, stack chips, control markers, numbered wall pieces |
| `player-aid.pdf` | Turn sequence, unit chart, wall and zombie rules, setup table, spawn table |
| `trackers.pdf` | Supply (SP), oil and round tracks |
| `rulebook.pdf` | The full rules ([HTML](docs/rules.html), [Markdown](docs/RULES.md)) |
| `board.svg` | Vector board for editing |

## The game in one minute

- **Win:** own every neighborhood inside the wall (La Crosse, Onalaska, French Island) with no zombies inside, and hold that for a full round.
- **Units:** infantry, tanks (each move costs 1 oil, and oil comes from Kwik Trips), La Crosse's **Gundersen Helicopter** and Onalaska's **Plane**. Aircraft can only be bought and flown while you hold the **airport on French Island**.
- **Zombies** attack at 3 and defend at 2. Each round, roll round ÷ 2 dice (rounded up); every 6 spawns a zombie at one of six highway entry points. While both players are alive, zombies walk the main roads toward the nearest downtown.
- **The wall** surrounds both cities. There is none between them. Zombies spend a turn next to a wall segment, tear it down the next turn, then walk in. Walls are never rebuilt. Units that stay put fire over intact walls and the zombies can't hit back.
- **Rising dead:** units you lose when zombies beat you, or when you attack zombies and lose or retreat, become zombies.
- **Defeat:** end your turn without your City Hall and you're out. Your survivors turn, and **you command the horde** for the rest of the game.

## How the board was made

The board comes from OpenStreetMap data (© OpenStreetMap contributors, ODbL):

1. `tools/fetch_osm.py` downloads municipal boundaries, water, major roads, Kwik Trip locations, the airport and hospitals from the Overpass API.
2. `tools/build_map.py` projects the data, gives the dense city core more room with a mild fisheye, removes water, and splits each city into neighborhood territories. The territories are Voronoi cells around seeds placed at each neighborhood's core (`tools/board_config.py`; La Crosse names follow the city's neighborhood associations), clipped to real city limits and shorelines. Adjacency comes from shared land borders plus bridges, which are found by walking the highway network across water. Walls go on every border between inside and outside territories. Zombie road arrows are shortest paths toward the nearest downtown, with highway crossings preferred.
3. `tools/build_print.js` renders the board, counters, player aid, trackers and rulebook to SVG and PDF with headless Chromium.

Territory shapes are approximations of the neighborhoods, not their official boundaries. The board is stretched toward the middle so the cities are big enough to play on.

## Development

```sh
npm install                 # only needed for the rulebook (marked)
npm test                    # engine rules tests + generated-map invariants + AI self-play
python3 tools/fetch_osm.py  # refresh OSM cache (needs network)
python3 tools/build_map.py  # regenerate game/js/mapdata.js
node tools/build_print.js   # regenerate print/ and docs/rules.html (needs Playwright + Chromium)
node tools/simulate.js 200  # AI-vs-AI balance check
```

Code layout:

- `game/js/engine.js`: the complete rules as a pure state machine. It runs in Node and in the browser, with seeded dice.
- `game/js/ai.js`: a simple computer opponent, which the simulator also uses.
- `game/js/ui.js`, `game/index.html`, `game/css/style.css`: the browser interface.
- `game/js/mapdata.js`: the generated board.
