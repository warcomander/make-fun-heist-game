// The game's rules and state, with no drawing and no browser in it: the thief, the guards and
// their vision cones, the wall cameras, the loot vault, the alarm meter and the two tools.
// step() advances one fixed step and returns what happened as bit flags. The playfield is the
// 2D x/z plane; the 3D renderer maps it onto the museum floor. Nothing here allocates after
// createWorld returns.
import { ALARM, CAMERAS, CASES, EXIT, FIELD, GUARDS, THIEF, THIEF_START, TOOLS, VAULT, WALLS } from './config.js';

export const EVENT_LOOT = 1;
export const EVENT_WIN = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_NOISE = 8;
export const EVENT_EMP = 16;
export const EVENT_SPOTTED = 32;

const TWO_PI = Math.PI * 2;

function angleDiff(a, b) {
  let d = (a - b) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

function angleOf(dx, dz) {
  return Math.atan2(dz, dx);
}

// Does the segment (x1,z1)-(x2,z2) cross the rectangle r? Used for line of sight.
function segmentHitsRect(x1, z1, x2, z2, r) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  let tmin = 0;
  let tmax = 1;
  if (dx === 0) {
    if (x1 < r.x || x1 > r.x + r.w) return false;
  } else {
    let t1 = (r.x - x1) / dx;
    let t2 = (r.x + r.w - x1) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (dz === 0) {
    if (z1 < r.z || z1 > r.z + r.d) return false;
  } else {
    let t1 = (r.z - z1) / dz;
    let t2 = (r.z + r.d - z1) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

function blocked(x, z, r, obstacles) {
  for (const o of obstacles) {
    if (x + r > o.x && x - r < o.x + o.w && z + r > o.z && z - r < o.z + o.d) return true;
  }
  return false;
}

function hasLineOfSight(x1, z1, x2, z2, obstacles) {
  for (const o of obstacles) {
    if (segmentHitsRect(x1, z1, x2, z2, o)) return false;
  }
  return true;
}

// Can the watcher at (x,z) facing `angle` with `range` and `halfAngle` see the thief?
function canSee(x, z, angle, range, halfAngle, thief, obstacles) {
  const dx = thief.x - x;
  const dz = thief.z - z;
  const dist = Math.hypot(dx, dz);
  if (dist > range) return false;
  if (Math.abs(angleDiff(angleOf(dx, dz), angle)) > halfAngle) return false;
  return hasLineOfSight(x, z, thief.x, thief.z, obstacles);
}

export function createWorld(random) {
  const obstacles = [...WALLS, ...CASES, { x: VAULT.x - VAULT.size / 2, z: VAULT.z - VAULT.size / 2, w: VAULT.size, d: VAULT.size }];

  const thief = { x: THIEF_START.x, z: THIEF_START.z, facing: -Math.PI / 2, moving: false, bob: 0 };
  const guards = GUARDS.map((g, i) => ({
    name: g.name,
    color: g.color,
    waypoints: g.waypoints,
    speed: g.speed,
    x: g.waypoints[0][0],
    z: g.waypoints[0][1],
    wp: 1,
    facing: 0,
    pause: 0,
    suspicion: 0,
    mode: 'patrol', // patrol | chase | investigate
    investigate: null,
    bob: 0,
    seen: false,
  }));
  const cameras = CAMERAS.map((c) => ({
    x: c.x,
    z: c.z,
    baseAngle: c.baseAngle,
    sweep: c.sweep,
    period: c.period,
    range: c.range,
    angle: c.baseAngle,
    disabled: 0,
    seen: false,
  }));

  const state = {
    thief,
    guards,
    cameras,
    alarm: 0,
    peakAlarm: 0,
    loot: false,
    noiseLeft: TOOLS.noise,
    empLeft: TOOLS.emp,
    noise: null, // {x, z, t} active noise-maker ping
    empTimer: 0,
    elapsed: 0,
    status: 'title', // title | play | win | caught
    caughtReason: '',
    spotted: false, // any watcher currently sees the thief
  };

  function reset() {
    thief.x = THIEF_START.x;
    thief.z = THIEF_START.z;
    thief.facing = -Math.PI / 2;
    thief.moving = false;
    thief.bob = 0;
    for (let i = 0; i < guards.length; i += 1) {
      const g = guards[i];
      g.x = g.waypoints[0][0];
      g.z = g.waypoints[0][1];
      g.wp = 1;
      g.facing = 0;
      g.pause = 0;
      g.suspicion = 0;
      g.mode = 'patrol';
      g.investigate = null;
      g.bob = 0;
      g.seen = false;
    }
    for (const c of cameras) {
      c.angle = c.baseAngle;
      c.disabled = 0;
      c.seen = false;
    }
    state.alarm = 0;
    state.peakAlarm = 0;
    state.loot = false;
    state.noiseLeft = TOOLS.noise;
    state.empLeft = TOOLS.emp;
    state.noise = null;
    state.empTimer = 0;
    state.elapsed = 0;
    state.status = 'play';
    state.caughtReason = '';
    state.spotted = false;
  }

  function moveCircle(body, dx, dz, radius) {
    const nx = body.x + dx;
    if (!blocked(nx, body.z, radius, obstacles)) body.x = nx;
    const nz = body.z + dz;
    if (!blocked(body.x, nz, radius, obstacles)) body.z = nz;
    body.x = Math.min(FIELD.width - 0.8 - radius, Math.max(0.8 + radius, body.x));
    body.z = Math.min(FIELD.height - 0.8 - radius, Math.max(0.8 + radius, body.z));
  }

  function stepGuard(g, dt, time) {
    g.seen = false;
    // A guard that sees the thief chases; a guard that heard the noise investigates.
    if (g.mode === 'investigate' && g.investigate) {
      const target = g.investigate;
      const dx = target.x - g.x;
      const dz = target.z - g.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.4) {
        g.investigate.wait -= dt;
        if (g.investigate.wait <= 0) {
          g.mode = 'patrol';
          g.investigate = null;
        }
      } else {
        g.facing = angleOf(dx, dz);
        const sp = g.speed * 1.15;
        moveCircle(g, (dx / dist) * sp * dt, (dz / dist) * sp * dt, 0.6);
        g.bob += dt * 9;
      }
      return;
    }
    if (g.mode === 'chase') {
      const dx = thief.x - g.x;
      const dz = thief.z - g.z;
      const dist = Math.hypot(dx, dz);
      g.facing = angleOf(dx, dz);
      if (dist > 0.9) {
        moveCircle(g, (dx / dist) * 4.5 * dt, (dz / dist) * 4.5 * dt, 0.6);
        g.bob += dt * 11;
      }
      // Lost the thief for a while: give up and go back to the nearest waypoint.
      if (g.suspicion < 15) {
        g.mode = 'patrol';
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < g.waypoints.length; i += 1) {
          const d = Math.hypot(g.waypoints[i][0] - g.x, g.waypoints[i][1] - g.z);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        g.wp = best;
      }
      return;
    }
    // Patrol: walk to the next waypoint, pause and look around there.
    if (g.pause > 0) {
      g.pause -= dt;
      g.facing += dt * 0.9; // look around while waiting
      return;
    }
    const wp = g.waypoints[g.wp];
    const dx = wp[0] - g.x;
    const dz = wp[1] - g.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.25) {
      g.wp = (g.wp + 1) % g.waypoints.length;
      g.pause = 0.6;
      return;
    }
    g.facing = angleOf(dx, dz);
    moveCircle(g, (dx / dist) * g.speed * dt, (dz / dist) * g.speed * dt, 0.6);
    g.bob += dt * 8;
  }

  /**
   * One fixed step. `move` is {x, z} (normalised, world axes). `actions` is a bitmask of
   * ACTION_* flags. `aim` is an optional {x, z} world point to throw the noise maker at.
   * Returns event flags (EVENT_*).
   */
  function step(dt, move, actions, aim) {
    let events = 0;
    if (state.status !== 'play') return events;
    state.elapsed += dt;
    const time = state.elapsed;

    // --- thief movement ---
    thief.moving = move.x !== 0 || move.z !== 0;
    if (thief.moving) {
      thief.facing = angleOf(move.x, move.z);
      moveCircle(thief, move.x * THIEF.speed * dt, move.z * THIEF.speed * dt, THIEF.radius);
      thief.bob += dt * 11;
    }

    // --- tools ---
    if (state.noise) {
      state.noise.t -= dt;
      if (state.noise.t <= 0) state.noise = null;
    }
    if (state.empTimer > 0) {
      state.empTimer -= dt;
      for (const c of cameras) c.disabled = Math.max(0, state.empTimer);
      if (state.empTimer <= 0) for (const c of cameras) c.disabled = 0;
    }
    if ((actions & 4) && state.noiseLeft > 0 && !state.noise) {
      // Q: throw the noise maker (toward the aim point, else ahead of the thief).
      const tx = aim ? aim.x : thief.x + Math.cos(thief.facing) * 6;
      const tz = aim ? aim.z : thief.z + Math.sin(thief.facing) * 6;
      state.noise = { x: Math.min(FIELD.width - 1.2, Math.max(1.2, tx)), z: Math.min(FIELD.height - 1.2, Math.max(1.2, tz)), t: TOOLS.noiseSeconds };
      state.noiseLeft -= 1;
      events |= EVENT_NOISE;
      // The nearest guard in earshot goes to investigate.
      let best = null;
      let bestD = TOOLS.noiseRadius;
      for (const g of guards) {
        const d = Math.hypot(g.x - state.noise.x, g.z - state.noise.z);
        if (d < bestD) {
          bestD = d;
          best = g;
        }
      }
      if (best) {
        best.mode = 'investigate';
        best.investigate = { x: state.noise.x, z: state.noise.z, wait: 2 };
        best.suspicion = Math.max(0, best.suspicion - 30);
      }
    }
    if ((actions & 8) && state.empLeft > 0 && state.empTimer <= 0) {
      // E: EMP pulse — every camera goes dark for a few seconds.
      state.empLeft -= 1;
      state.empTimer = TOOLS.empSeconds;
      for (const c of cameras) c.disabled = TOOLS.empSeconds;
      events |= EVENT_EMP;
    }

    // --- cameras sweep ---
    for (const c of cameras) {
      if (c.disabled > 0) continue;
      c.angle = c.baseAngle + Math.sin((time / c.period) * TWO_PI) * c.sweep;
    }

    // --- detection: guards and cameras ---
    let seenByGuard = false;
    let seenByCamera = false;
    for (const g of guards) {
      // A guard walking to a noise is distracted: it does not spot the thief.
      const sees = g.mode !== 'investigate' && canSee(g.x, g.z, g.facing, 8.5, 0.55, thief, obstacles);
      g.seen = sees;
      if (sees) {
        seenByGuard = true;
        g.suspicion = Math.min(100, g.suspicion + 70 * dt);
        if (g.suspicion > 40 && g.mode !== 'investigate') g.mode = 'chase';
      } else {
        g.suspicion = Math.max(0, g.suspicion - 25 * dt);
        if (g.mode === 'chase' && g.suspicion < 15) g.mode = 'patrol';
      }
    }
    for (const c of cameras) {
      const sees = c.disabled <= 0 && canSee(c.x, c.z, c.angle, c.range, 0.5, thief, obstacles);
      c.seen = sees;
      if (sees) seenByCamera = true;
    }
    state.spotted = seenByGuard || seenByCamera;
    if (seenByGuard) state.alarm = Math.min(ALARM.max, state.alarm + ALARM.guardRate * dt);
    if (seenByCamera) state.alarm = Math.min(ALARM.max, state.alarm + ALARM.cameraRate * dt);
    if (!state.spotted) state.alarm = Math.max(0, state.alarm - ALARM.decay * dt);
    if (state.alarm > state.peakAlarm) state.peakAlarm = state.alarm;
    if (state.spotted) events |= EVENT_SPOTTED;

    // --- guards move ---
    for (const g of guards) stepGuard(g, dt, time);

    // --- caught? ---
    if (state.alarm >= ALARM.max) {
      state.status = 'caught';
      state.caughtReason = 'The alarm hit full — the museum locked down and the guards closed in.';
      return EVENT_CAUGHT;
    }
    for (const g of guards) {
      if (Math.hypot(g.x - thief.x, g.z - thief.z) < 1.15) {
        state.status = 'caught';
        state.caughtReason = `${g.name} caught you in the open.`;
        return EVENT_CAUGHT;
      }
    }

    // --- loot ---
    if (!state.loot && Math.hypot(thief.x - VAULT.x, thief.z - VAULT.z) < VAULT.pickup) {
      state.loot = true;
      events |= EVENT_LOOT;
    }

    // --- win: reach the exit with the loot ---
    if (state.loot && thief.x > EXIT.x && thief.x < EXIT.x + EXIT.w && thief.z > EXIT.z && thief.z < EXIT.z + EXIT.d) {
      state.status = 'win';
      return events | EVENT_WIN;
    }
    return events;
  }

  function score() {
    return Math.max(0, Math.round(10000 - state.elapsed * 15 - state.peakAlarm * 10));
  }

  reset();
  state.status = 'title';
  return { state, reset, step, score, obstacles };
}
