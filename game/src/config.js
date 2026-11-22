// "The Gilded Vault" — a 3D museum heist. All tuning, colours and the room layout in one place.
// World units: x 0..40 (left to right), z 0..22.5 (top to bottom in the top-down view), y is up.
// The renderer maps this 2D playfield into a 3D museum; the world logic never touches THREE.

export const FIELD = { width: 40, height: 22.5 };
export const STEP = 1 / 60;

export const THIEF = { radius: 0.55, speed: 6.0 };
export const GUARD = { radius: 0.6, patrolSpeed: 2.2, chaseSpeed: 4.5, range: 8.5, halfAngle: 0.55, touchDist: 1.15 };
export const CAMERA = { range: 9.0, halfAngle: 0.5 };

export const ALARM = { guardRate: 45, cameraRate: 60, decay: 14, max: 100 };
export const TOOLS = { noise: 2, emp: 2, empSeconds: 6, noiseSeconds: 4, noiseRadius: 14 };

// Walls and display cases: rectangles {x, z, w, d} (x,z = top-left corner). They block
// movement and line of sight. The room's outer border plus interior partitions make three
// routes to the vault: the open floor, the top vent corridor, and the bottom passage.
export const WALLS = [
  { x: 0, z: 0, w: 40, d: 0.8 }, // top
  { x: 0, z: 21.7, w: 40, d: 0.8 }, // bottom
  { x: 0, z: 0, w: 0.8, d: 22.5 }, // left
  { x: 39.2, z: 0, w: 0.8, d: 22.5 }, // right
  { x: 12, z: 4, w: 0.8, d: 9 }, // partition A (gap top + bottom)
  { x: 27, z: 9, w: 0.8, d: 10 }, // partition B (gap top + bottom)
  { x: 17, z: 11, w: 8, d: 0.8 }, // central display block
];

export const CASES = [
  { x: 16, z: 4.5, w: 2.6, d: 1.5 },
  { x: 16, z: 17, w: 2.6, d: 1.5 },
  { x: 31, z: 14, w: 2.6, d: 1.5 },
  { x: 6, z: 11, w: 2.6, d: 1.5 },
];

export const VAULT = { x: 36.5, z: 3, size: 2.2, pickup: 3.0 };
export const EXIT = { x: 1.2, z: 18.8, w: 4.5, d: 2.5 };
export const THIEF_START = { x: 2.5, z: 19.8 };

// Guards: name, patrol waypoints, patrol speed, uniform colour.
export const GUARDS = [
  { name: 'Marco', color: 0x3b5bdb, waypoints: [[9, 6], [9, 16], [20, 16], [20, 6]], speed: 2.2 },
  { name: 'Sable', color: 0x7048e8, waypoints: [[29, 5], [35, 5], [35, 11], [29, 11]], speed: 2.4 },
  { name: 'Rook', color: 0x0ca678, waypoints: [[8, 18], [22, 18], [22, 13], [8, 13]], speed: 2.0 },
];

// Wall cameras: position, base facing angle (radians, 0 = +x, PI/2 = +z), sweep amplitude, period.
export const CAMERAS = [
  { x: 20, z: 0.8, baseAngle: Math.PI / 2, sweep: 0.96, period: 4.2, range: 9.0 },
  { x: 39.2, z: 12, baseAngle: Math.PI, sweep: 0.87, period: 5.1, range: 8.0 },
];

// Warm spotlight pools on the floor (x, z, radius).
export const SPOTS = [
  { x: 8, z: 6, r: 5.5 },
  { x: 20, z: 5, r: 5.5 },
  { x: 32, z: 6, r: 5.5 },
  { x: 10, z: 17, r: 5.5 },
  { x: 24, z: 17, r: 5.5 },
  { x: 34, z: 17, r: 5.0 },
];

export const PALETTE = {
  floor: '#232833',
  floorTile: '#2a2f3d',
  wall: '#3a4152',
  wallTop: '#c9a227',
  caseGlass: '#7dd3fc',
  caseBase: '#1f2937',
  vault: '#f2c94c',
  vaultGlow: '#ffd700',
  exit: '#22c55e',
  thief: '#1f2937',
  thiefTrim: '#f2c94c',
  coneGuard: '#facc15',
  coneCamera: '#ef4444',
  alarmLow: '#22c55e',
  alarmMid: '#facc15',
  alarmHigh: '#ef4444',
  text: '#eef1f5',
  muted: '#9aa3b2',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const BEST_KEY = 'gilded-vault.best';
