// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the 3D renderer paints what is there. The
// game moves between four screens: title, play, win and caught. ?shot=cover|tension|loot|win
// (with &seed=N) stages that scene instead of running the loop, paints it and sets
// window.__shotReady for a screenshot. ?auto=1 plays the game with a simple autopilot (used to
// prove the heist is winnable).
import { BEST_KEY, CAMERAS, EXIT, FIELD, STEP, VAULT } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CAUGHT, EVENT_EMP, EVENT_LOOT, EVENT_NOISE, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_EMP, ACTION_NOISE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer } from './render3d.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const auto = params.get('auto') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const alarmFill = document.getElementById('alarmFill');
const lootPill = document.getElementById('lootPill');
const toolsPill = document.getElementById('toolsPill');
const timePill = document.getElementById('timePill');
const objectiveEl = document.getElementById('objective');
const bannerEl = document.getElementById('banner');
const panelEl = document.getElementById('panel');

const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

function titlePanel(best) {
  return `<div class="card">
    <h1>THE GILDED VAULT</h1>
    <h2>A museum heist in 3D</h2>
    <p>Night has fallen on the Marroway Museum. The gold vault glows at the far end of the hall — slip past the guards and their sweeping vision cones, dodge the red camera sweeps, take the vault, and reach the green EXIT.</p>
    <p class="keys"><b>WASD / arrows</b> — move &nbsp;·&nbsp; <b>Q</b> — throw a noise maker (lures a guard) &nbsp;·&nbsp; <b>E</b> — EMP the cameras<br><b>P</b> — pause &nbsp;·&nbsp; <b>Space</b> — start / retry</p>
    <p>Three routes cross the hall: the open floor, the top vent corridor, and the bottom passage. Watch the cones — when the alarm fills, you are caught.</p>
    ${best > 0 ? `<p class="score">Best score: ${best}</p>` : ''}
    <div class="cta">PRESS SPACE OR CLICK TO START</div>
  </div>`;
}

function winPanel(score, time, best) {
  return `<div class="card">
    <h1>GETAWAY!</h1>
    <h2>You slipped out with the vault</h2>
    <p class="score">Score ${score} &nbsp;·&nbsp; Time ${fmtTime(time)}</p>
    <p>Best score: ${best}</p>
    <div class="cta">PRESS SPACE OR CLICK TO PLAY AGAIN</div>
  </div>`;
}

function caughtPanel(reason) {
  return `<div class="card">
    <h1 style="color:#ff5a5a">CAUGHT!</h1>
    <h2>The heist is over</h2>
    <p>${reason}</p>
    <div class="cta">PRESS SPACE OR CLICK TO TRY AGAIN</div>
  </div>`;
}

function updateHud() {
  const s = world.state;
  const pct = Math.round(s.alarm);
  alarmFill.style.width = `${pct}%`;
  alarmFill.style.background = pct < 40 ? '#22c55e' : pct < 70 ? '#facc15' : '#ef4444';
  lootPill.textContent = s.loot ? '💎 Loot: TAKEN — get to the EXIT!' : '💎 Loot: not taken';
  toolsPill.textContent = `Q Noise ×${s.noiseLeft}  ·  E EMP ×${s.empLeft}`;
  timePill.textContent = `⏱ ${fmtTime(s.elapsed)}`;
  objectiveEl.textContent = s.loot
    ? 'You have the vault! Reach the green EXIT — stay out of the cones.'
    : 'Objective: slip past the guards and cameras, take the gold vault, then reach the green EXIT.';
  bannerEl.style.display = s.spotted && s.status === 'play' ? 'block' : 'none';
  if (s.spotted && s.status === 'play') bannerEl.textContent = 'SPOTTED!';
}

function announce(message) {
  statusEl.textContent = message;
}

// --- autopilot: a fixed safe route that proves the heist is winnable ---
// Start -> up the left side -> along the top vent corridor -> the vault -> back along the
// top -> down the left side -> the exit. It waits when the alarm is high, and fires the EMP
// while crossing the camera-swept top corridor.
const AUTO_ROUTE = [
  [2.5, 6], [4, 2.6], [10, 2.6], [18, 2.6], [26, 2.6], [33, 2.6], [34.8, 3.0],
  [33, 2.6], [26, 2.6], [18, 2.6], [10, 2.6], [4, 2.6], [2.5, 6], [3.4, 20],
];
let autoWp = 0; // index of the route point the thief is heading for (never goes back)
function autopilot() {
  const s = world.state;
  const t = s.thief;
  let move = { x: 0, z: 0 };
  let actions = 0;
  let aim = null;
  // Wait out a hot alarm before moving on.
  if (s.alarm > 60) return { move, actions, aim };
  // EMP the cameras while crossing the top corridor (they sweep it).
  const inTopCorridor = t.z < 4 && t.x > 8 && t.x < 34;
  const anyCamOn = s.cameras.some((c) => c.disabled <= 0);
  if (inTopCorridor && anyCamOn && s.empLeft > 0 && s.empTimer <= 0) actions |= ACTION_EMP;
  // Lure Sable away from the vault before the approach: throw the noise maker at a point
  // near Sable's patrol but away from the vault, so Sable walks off to investigate.
  if (!s.loot && s.noiseLeft > 0 && !s.noise && t.x > 24 && t.x < 33 && t.z < 5) {
    actions |= ACTION_NOISE;
    aim = { x: 33, z: 12 };
  }
  // Advance along the route in order; only move on to the next point once this one is reached.
  while (autoWp < AUTO_ROUTE.length && Math.hypot(AUTO_ROUTE[autoWp][0] - t.x, AUTO_ROUTE[autoWp][1] - t.z) <= 0.9) {
    autoWp += 1;
  }
  if (autoWp >= AUTO_ROUTE.length) return { move, actions, aim };
  const target = AUTO_ROUTE[autoWp];
  const dx = target[0] - t.x;
  const dz = target[1] - t.z;
  const len = Math.hypot(dx, dz);
  move = { x: dx / len, z: dz / len };
  return { move, actions, aim };
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, world.state.elapsed + 0.5);
    updateHud();
    if (scene.banner) {
      bannerEl.style.display = 'block';
      bannerEl.textContent = scene.banner;
    }
    if (scene.panel === 'win') {
      const score = world.score();
      panelEl.innerHTML = winPanel(score, world.state.elapsed, Math.max(readBest(), score));
    }
    painted += 1;
    if (painted < 4) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = 'title';
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function startGame() {
    world.reset();
    world.state.status = 'play';
    screen = 'play';
    panelEl.innerHTML = '';
    bannerEl.style.display = 'none';
    accumulator = 0;
    autoWp = 0;
    announce('Playing. Steal the vault and reach the exit.');
  }

  function endGame(win) {
    if (win) {
      screen = 'win';
      const score = world.score();
      if (score > best) {
        best = score;
        saveBest(best);
      }
      panelEl.innerHTML = winPanel(score, world.state.elapsed, best);
      announce(`Getaway! Score ${score}. Best ${best}.`);
    } else {
      screen = 'caught';
      panelEl.innerHTML = caughtPanel(world.state.caughtReason);
      announce(`Caught. ${world.state.caughtReason}`);
    }
  }

  function handleScreenActions(actions) {
    if (actions & ACTION_CONFIRM && (screen === 'title' || screen === 'win' || screen === 'caught')) startGame();
    else if (actions & ACTION_PAUSE && screen === 'play') {
      screen = 'paused';
      panelEl.innerHTML = `<div class="card"><h1 style="color:#eef1f5">PAUSED</h1><p>Press P or Space to keep going.</p></div>`;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === 'paused') {
      screen = 'play';
      panelEl.innerHTML = '';
      announce('Playing.');
    }
  }

  function step(frameActions) {
    if (screen !== 'play') return;
    let move;
    let actions = frameActions;
    let aim = null;
    if (auto) {
      const plan = autopilot();
      move = plan.move;
      actions = plan.actions;
      aim = plan.aim;
    } else {
      move = input.move();
      // Aiming the noise maker: toward the pointer when the player clicked, else ahead.
      if (actions & ACTION_NOISE) {
        const m = input.mousePos();
        if (m) {
          const rect = canvas.getBoundingClientRect();
          const nx = (m.x - rect.left) / rect.width - 0.5;
          const nz = (m.y - rect.top) / rect.height - 0.5;
          const len = Math.hypot(nx, nz) || 1;
          aim = { x: world.state.thief.x + (nx / len) * 6, z: world.state.thief.z + (nz / len) * 6 };
        }
      }
    }
    const events = world.step(STEP, move, (actions & ACTION_NOISE ? 4 : 0) | (actions & ACTION_EMP ? 8 : 0), aim);
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_CAUGHT) endGame(false);
    else if (events & EVENT_LOOT) announce('Vault taken! Get to the green EXIT.');
    else if (events & EVENT_NOISE) announce('Noise maker thrown — a guard is going to look.');
    else if (events & EVENT_EMP) announce('EMP pulse — the cameras are dark.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Read the one-shot presses once per frame: the screen handler takes CONFIRM/PAUSE,
    // and the first world step of the frame takes NOISE/EMP, so no press is lost or doubled.
    const frameActions = input.takeActions();
    handleScreenActions(frameActions);
    if (screen === 'play') {
      let first = true;
      while (accumulator >= STEP && screen === 'play') {
        step(first ? frameActions : 0);
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    // The title screen shows the room idling behind the card.
    if (screen === 'title') {
      world.state.elapsed += STEP;
      for (const c of world.state.cameras) {
        c.angle = c.baseAngle + Math.sin((world.state.elapsed / c.period) * Math.PI * 2) * c.sweep;
      }
    }
    renderer.draw(world.state, world.state.elapsed);
    updateHud();
    if (screen === 'title') panelEl.innerHTML = titlePanel(best);
  }

  panelEl.innerHTML = titlePanel(best);
  announce('The Gilded Vault. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

// Small read-only accessor used by automated tests to observe the game state.
window.__gameState = () => ({
  x: world.state.thief.x,
  z: world.state.thief.z,
  status: world.state.status,
  alarm: world.state.alarm,
  loot: world.state.loot,
  elapsed: world.state.elapsed,
});
