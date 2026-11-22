// Drawing only: the world's state in, a three.js museum out. The camera sits high above the
// room at a steep angle, so the whole heist — thief, guards with their cones, wall cameras,
// the glowing vault and the exit — is visible in one frame. Vision cones are translucent
// sector meshes lying on the floor, so they read at a glance: yellow for guards, red for
// cameras. All geometry is procedural; nothing is fetched from the network.
import { CAMERAS, CASES, EXIT, FIELD, GUARDS, PALETTE, SPOTS, VAULT, WALLS } from './config.js';

const CONE_OPACITY = 0.3;

function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 576;
  const g = c.getContext('2d');
  g.fillStyle = '#20242f';
  g.fillRect(0, 0, 1024, 576);
  // Large dark tiles with faint gold grout, plus a few worn patches.
  const tile = 64;
  for (let y = 0; y < 576 / tile; y += 1) {
    for (let x = 0; x < 1024 / tile; x += 1) {
      const v = 30 + ((x * 7 + y * 13) % 5) * 3;
      g.fillStyle = `rgb(${v}, ${v + 4}, ${v + 12})`;
      g.fillRect(x * tile + 1, y * tile + 1, tile - 2, tile - 2);
    }
  }
  g.strokeStyle = 'rgba(201,162,39,0.16)';
  g.lineWidth = 2;
  for (let x = 0; x <= 1024; x += tile) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 576);
    g.stroke();
  }
  for (let y = 0; y <= 576; y += tile) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(1024, y);
    g.stroke();
  }
  // A faded gold carpet runner down the middle.
  g.fillStyle = 'rgba(201,162,39,0.07)';
  g.fillRect(0, 256, 1024, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeTextTexture(text, color, font) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 128);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A flat vision-cone sector on the floor, centred on world angle 0; the parent group rotates
// it to the watcher's facing (group.rotation.y = -facing).
function makeConeMesh(range, halfAngle, color) {
  const geo = new THREE.CircleGeometry(range, 28, -halfAngle, halfAngle * 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: CONE_OPACITY, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.06;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, mesh, mat };
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d12);
  scene.fog = new THREE.Fog(0x0b0d12, 55, 95);

  // --- lights: dim ambient, a soft key light, two warm spotlights, vault + exit glows ---
  scene.add(new THREE.AmbientLight(0x8fa3c7, 0.85));
  const key = new THREE.DirectionalLight(0xfff2d9, 1.0);
  key.position.set(10, 30, 26);
  scene.add(key);
  const spotA = new THREE.SpotLight(0xffd9a0, 320, 34, 0.62, 0.55, 1.6);
  spotA.position.set(12, 14, 6);
  spotA.target.position.set(12, 0, 6);
  scene.add(spotA, spotA.target);
  const spotB = new THREE.SpotLight(0xffd9a0, 320, 34, 0.62, 0.55, 1.6);
  spotB.position.set(30, 14, 16);
  spotB.target.position.set(30, 0, 16);
  scene.add(spotB, spotB.target);

  // --- floor ---
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD.width, FIELD.height),
    new THREE.MeshLambertMaterial({ map: makeFloorTexture() }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(FIELD.width / 2, 0, FIELD.height / 2);
  scene.add(floor);

  // Warm spotlight pools (soft radial decals on the floor).
  for (const s of SPOTS) {
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(s.r, 24),
      new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.06, depthWrite: false }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(s.x, 0.03, s.z);
    scene.add(pool);
  }

  // --- walls (slate boxes with a gold trim on top) ---
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x3a4152 });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0xc9a227, emissive: 0x332a00 });
  for (const w of WALLS) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w.w, 2.2, w.d), wallMat);
    box.position.set(w.x + w.w / 2, 1.1, w.z + w.d / 2);
    scene.add(box);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w.w, 0.1, w.d), trimMat);
    trim.position.set(w.x + w.w / 2, 2.25, w.z + w.d / 2);
    scene.add(trim);
  }

  // --- display cases: glass boxes on dark plinths ---
  const caseGlass = new THREE.MeshLambertMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.35, emissive: 0x0a2530 });
  const caseBase = new THREE.MeshLambertMaterial({ color: 0x1f2937 });
  for (const cs of CASES) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(cs.w, 0.5, cs.d), caseBase);
    base.position.set(cs.x + cs.w / 2, 0.25, cs.z + cs.d / 2);
    scene.add(base);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(cs.w * 0.92, 1.1, cs.d * 0.92), caseGlass);
    glass.position.set(cs.x + cs.w / 2, 1.05, cs.z + cs.d / 2);
    scene.add(glass);
    // A tiny golden trinket inside each case, so the cases read as loot displays.
    const trinket = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22),
      new THREE.MeshLambertMaterial({ color: 0xf2c94c, emissive: 0x554400 }),
    );
    trinket.position.set(cs.x + cs.w / 2, 0.95, cs.z + cs.d / 2);
    scene.add(trinket);
  }

  // --- the vault: a gold strongbox that pulses, with its own light ---
  const vaultGroup = new THREE.Group();
  const vaultBody = new THREE.Mesh(
    new THREE.BoxGeometry(VAULT.size, 1.7, VAULT.size),
    new THREE.MeshLambertMaterial({ color: 0xd4af37, emissive: 0x664d00 }),
  );
  vaultBody.position.y = 0.85;
  vaultGroup.add(vaultBody);
  const vaultDoor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.12, 24),
    new THREE.MeshLambertMaterial({ color: 0x8a6d1b, emissive: 0x332a00 }),
  );
  vaultDoor.rotation.x = Math.PI / 2;
  vaultDoor.position.set(0, 0.85, VAULT.size / 2 + 0.05);
  vaultGroup.add(vaultDoor);
  vaultGroup.position.set(VAULT.x, 0, VAULT.z);
  scene.add(vaultGroup);
  const vaultLight = new THREE.PointLight(0xffd700, 26, 13, 1.8);
  vaultLight.position.set(VAULT.x, 2.4, VAULT.z);
  scene.add(vaultLight);
  // Orbiting sparkles above the vault.
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(12 * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffe27a, size: 0.16, transparent: true, opacity: 0.9 }));
  scene.add(sparks);

  // --- exit: a green glowing zone with EXIT written on the floor ---
  const exitMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.32, depthWrite: false });
  const exitPlane = new THREE.Mesh(new THREE.PlaneGeometry(EXIT.w, EXIT.d), exitMat);
  exitPlane.rotation.x = -Math.PI / 2;
  exitPlane.position.set(EXIT.x + EXIT.w / 2, 0.05, EXIT.z + EXIT.d / 2);
  scene.add(exitPlane);
  const exitText = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 1.7),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('EXIT', '#4ade80', 'bold 64px system-ui, sans-serif'), transparent: true, depthWrite: false }),
  );
  exitText.rotation.x = -Math.PI / 2;
  exitText.position.set(EXIT.x + EXIT.w / 2, 0.07, EXIT.z + EXIT.d / 2);
  scene.add(exitText);
  const exitLight = new THREE.PointLight(0x22c55e, 12, 9, 1.8);
  exitLight.position.set(EXIT.x + EXIT.w / 2, 2, EXIT.z + EXIT.d / 2);
  scene.add(exitLight);

  // --- thief: a slate figure with a gold visor and a gold ring on the floor, so the
  // player is always easy to spot against the dark floor ---
  const thiefGroup = new THREE.Group();
  const thiefBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.44, 1.0, 12),
    new THREE.MeshLambertMaterial({ color: 0x64748b }),
  );
  thiefBody.position.y = 0.5;
  thiefGroup.add(thiefBody);
  const thiefHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 14, 10),
    new THREE.MeshLambertMaterial({ color: 0x334155 }),
  );
  thiefHead.position.y = 1.18;
  thiefGroup.add(thiefHead);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.1, 0.12),
    new THREE.MeshLambertMaterial({ color: 0xf2c94c, emissive: 0x554400 }),
  );
  visor.position.set(0, 1.2, 0.28);
  thiefGroup.add(visor);
  const thiefRing = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.72, 24),
    new THREE.MeshBasicMaterial({ color: 0xf2c94c, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
  );
  thiefRing.rotation.x = -Math.PI / 2;
  thiefRing.position.y = 0.04;
  thiefGroup.add(thiefRing);
  scene.add(thiefGroup);

  // --- guards: navy figures with caps; a "!" appears above one that is suspicious ---
  const bangTex = makeTextTexture('!', '#ff5a5a', 'bold 96px system-ui, sans-serif');
  const guardObjs = GUARDS.map((g) => {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.5, 1.15, 12),
      new THREE.MeshLambertMaterial({ color: g.color }),
    );
    body.position.y = 0.58;
    grp.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 14, 10),
      new THREE.MeshLambertMaterial({ color: 0xd9c1a3 }),
    );
    head.position.y = 1.32;
    grp.add(head);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.36, 0.12, 12),
      new THREE.MeshLambertMaterial({ color: 0x111827 }),
    );
    cap.position.y = 1.56;
    grp.add(cap);
    const bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: bangTex, transparent: true, depthWrite: false }));
    bang.scale.set(1.1, 0.55, 1);
    bang.position.y = 2.3;
    bang.visible = false;
    grp.add(bang);
    scene.add(grp);
    const cone = makeConeMesh(8.5, 0.55, 0xfacc15);
    cone.group.position.set(0, 0, 0);
    scene.add(cone.group);
    return { group: grp, cone, bang, baseColor: g.color };
  });

  // --- wall cameras: a housing + lens, with a red sweeping cone ---
  const camObjs = CAMERAS.map((c) => {
    const grp = new THREE.Group();
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.4, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x374151 }),
    );
    housing.position.y = 1.9;
    grp.add(housing);
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 0.4, 10),
      new THREE.MeshLambertMaterial({ color: 0xef4444, emissive: 0x550000 }),
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 1.9, 0.35);
    grp.add(lens);
    grp.position.set(c.x, 0, c.z);
    scene.add(grp);
    const cone = makeConeMesh(c.range, 0.5, 0xef4444);
    cone.group.position.set(c.x, 0, c.z);
    scene.add(cone.group);
    return { group: grp, lens, cone, baseAngle: c.baseAngle };
  });

  // --- drifting dust motes for atmosphere ---
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(90 * 3);
  for (let i = 0; i < 90; i += 1) {
    dustPos[i * 3] = Math.random() * FIELD.width;
    dustPos[i * 3 + 1] = 0.4 + Math.random() * 3.4;
    dustPos[i * 3 + 2] = Math.random() * FIELD.height;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffe9b0, size: 0.07, transparent: true, opacity: 0.5 }));
  scene.add(dust);

  // --- the high-angle camera: the whole 40 x 22.5 room fits in one frame ---
  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 200);
  function frameCamera() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    // Elevation ~50 degrees, centred on the room; distance scales with aspect so the
    // room always fits (wider windows pull back, narrower ones too).
    const dist = 40 * Math.max(1, (16 / 9) / camera.aspect);
    const el = (50 * Math.PI) / 180;
    camera.position.set(FIELD.width / 2, Math.sin(el) * dist, FIELD.height / 2 + Math.cos(el) * dist);
    camera.lookAt(FIELD.width / 2, 0, FIELD.height / 2);
    camera.updateProjectionMatrix();
  }
  frameCamera();

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    frameCamera();
  }
  window.addEventListener('resize', resize);
  resize();

  function draw(state, time) {
    const t = state.thief;
    thiefGroup.position.set(t.x, Math.abs(Math.sin(t.bob)) * 0.09, t.z);
    thiefGroup.rotation.y = -t.facing + Math.PI / 2;
    // The thief's loot: a gold glint above the head once the vault is taken.
    thiefGroup.children.forEach((child) => {
      if (child.userData.isLoot) child.visible = state.loot;
    });

    for (let i = 0; i < state.guards.length; i += 1) {
      const g = state.guards[i];
      const obj = guardObjs[i];
      obj.group.position.set(g.x, Math.abs(Math.sin(g.bob)) * 0.07, g.z);
      obj.group.rotation.y = -g.facing + Math.PI / 2;
      obj.cone.group.position.set(g.x, 0, g.z);
      obj.cone.group.rotation.y = -g.facing;
      // Cone turns orange when the guard is chasing, and fades while it investigates.
      const hot = g.mode === 'chase' ? 0xff8c1a : 0xfacc15;
      obj.cone.mat.color.setHex(hot);
      obj.cone.mat.opacity = g.mode === 'investigate' ? 0.14 : CONE_OPACITY;
      obj.bang.visible = g.suspicion > 40;
    }

    for (let i = 0; i < state.cameras.length; i += 1) {
      const c = state.cameras[i];
      const obj = camObjs[i];
      obj.group.rotation.y = -c.angle + Math.PI / 2;
      obj.cone.group.rotation.y = -c.angle;
      obj.cone.group.visible = c.disabled <= 0;
      obj.lens.material.emissive.setHex(c.disabled > 0 ? 0x222222 : 0x550000);
    }

    // The vault pulses while its loot is still inside; it goes dark once taken.
    const pulse = 0.75 + 0.25 * Math.sin(time * 3.2);
    vaultLight.intensity = state.loot ? 4 : 26 * pulse;
    vaultBody.material.emissive.setHex(state.loot ? 0x111111 : 0x664d00);
    for (let i = 0; i < 12; i += 1) {
      const a = time * 0.9 + (i / 12) * Math.PI * 2;
      sparkPos[i * 3] = VAULT.x + Math.cos(a) * 1.4;
      sparkPos[i * 3 + 1] = 1.2 + Math.sin(time * 2 + i) * 0.5;
      sparkPos[i * 3 + 2] = VAULT.z + Math.sin(a) * 1.4;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparks.visible = !state.loot;

    // Exit glow breathes gently.
    exitMat.opacity = 0.26 + 0.1 * Math.sin(time * 2.2);
    exitLight.intensity = 10 + 4 * Math.sin(time * 2.2);

    // Dust drifts.
    dust.rotation.y = time * 0.008;

    renderer.render(scene, camera);
  }

  // A small gold loot satchel that appears on the thief's back once the vault is taken.
  const satchel = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.26, 0.16),
    new THREE.MeshLambertMaterial({ color: 0xf2c94c, emissive: 0x554400 }),
  );
  satchel.position.set(0, 0.62, -0.42);
  satchel.userData.isLoot = true;
  satchel.visible = false;
  thiefGroup.add(satchel);

  return { draw, resize };
}
