# The Gilded Vault — a museum heist in 3D

[![make.fun](https://make.fun/badge.svg)](https://make.fun)
[![make.fun bounty](https://make.fun/bounty/best-heist-game-20261122-0559/badge.svg)](https://make.fun/bounty/best-heist-game-20261122-0559)

A complete 3D heist game that runs offline in a desktop browser from static files.
Night has fallen on the Marroway Museum: slip past the guards and their sweeping vision
cones, dodge the red camera sweeps, take the gold vault, and reach the green EXIT.

## Play

Open `game/index.html` in desktop Chrome (or serve `game/` with any static server).
No network request is made — three.js is vendored under `game/vendor/three.min.js`.

- **WASD / arrows** — move the thief
- **Q** — throw a noise maker (lures the nearest guard away, 2 uses)
- **E** — EMP pulse (blinds the wall cameras for 6 seconds, 2 uses)
- **P** — pause · **Space** — start / retry

Three routes cross the hall: the open floor, the top vent corridor, and the bottom
passage. When a guard or a camera sees you the alarm meter fills; at full, you are
caught. Grab the vault, then get to the green EXIT for the getaway.

## Structure

- `game/index.html` — page, canvas and HUD
- `game/src/config.js` — tuning, palette and the room layout
- `game/src/world.js` — the rules: thief, guards, cameras, alarm, tools, win/lose
- `game/src/render3d.js` — the three.js museum: floor, walls, cones, lights, figures
- `game/src/input.js` — keyboard and pointer input
- `game/src/shots.js` — the staged screenshot scenes (`?shot=cover|tension|loot|win`)
- `game/src/main.js` — boot, the fixed-step loop, screens and the autopilot (`?auto=1`)
- `game/vendor/three.min.js` — three.js r160, vendored (not our source)

## Entry

`main.ts` (Node 22) copies `game/` and `screenshots/` to `/output` and writes
`/output/dossier.json` with the vendored make.fun library. Screenshots are real
renders of the game's own code, taken in headless Chromium.
