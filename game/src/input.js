// Keyboard and pointer input. Held keys give a movement vector; one-shot presses (start,
// restart, tools, pause) are queued as bit flags and taken once by the loop, so a press between
// two frames is never lost and never counted twice.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_NOISE = 4;
export const ACTION_EMP = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const NOISE = new Set(['KeyQ']);
const EMP = new Set(['KeyE']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mouse = null; // last pointer position in client pixels (for aiming the noise maker)

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      held.add(event.code);
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (NOISE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_NOISE;
    } else if (EMP.has(event.code)) {
      if (!event.repeat) actions |= ACTION_EMP;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => held.clear());
  target.addEventListener('pointerdown', (event) => {
    mouse = { x: event.clientX, y: event.clientY };
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointermove', (event) => {
    mouse = { x: event.clientX, y: event.clientY };
  });

  function has(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** Normalised movement vector {x, z} in world axes (x right, z down the screen). */
    move() {
      const x = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
      const z = (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0);
      if (x === 0 && z === 0) return { x: 0, z: 0 };
      const len = Math.hypot(x, z);
      return { x: x / len, z: z / len };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Last pointer position (client pixels), or null. */
    mousePos() {
      return mouse;
    },
  };
}
