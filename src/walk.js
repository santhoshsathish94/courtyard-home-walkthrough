// First-person walking: keyboard + mouse (pointer lock) on desktop, joystick +
// drag-look on touch devices. Collision and floor heights come from design.js;
// door and gate leaves are added live, so closed doors block and open ones do not.
import * as THREE from 'three';
import * as D from './design.js';

const R = 0.22, STEP = 0.42, BODY = 1.7, WALK = 1.45, RUN = 2.9;
const EPS = 1e-6;
const isHoriz = (w) => Math.abs(w.a[1] - w.b[1]) < EPS;

function wallSolids(w) {
  const len = D.wallLength(w), h = w.t / 2, horiz = isHoriz(w);
  const dir = horiz ? Math.sign(w.b[0] - w.a[0]) : Math.sign(w.b[1] - w.a[1]);
  const cuts = w.openings.filter((o) => o.type === 'door' || o.type === 'arch').map((o) => [o.s, o.s + o.w]).sort((a, b) => a[0] - b[0]);
  const parts = [];
  let cur = 0;
  for (const [s0, s1] of cuts) { if (s0 > cur) parts.push([cur, s0]); cur = Math.max(cur, s1); }
  if (cur < len) parts.push([cur, len]);
  return parts.map(([s0, s1]) => {
    if (horiz) { const xa = w.a[0] + dir * s0, xb = w.a[0] + dir * s1; return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: w.a[1] - h, z1: w.a[1] + h }; }
    const za = w.a[1] + dir * s0, zb = w.a[1] + dir * s1;
    return { x0: w.a[0] - h, x1: w.a[0] + h, z0: Math.min(za, zb), z1: Math.max(za, zb) };
  });
}
function buildColliders() {
  const rects = [], segs = [];
  for (const w of D.WALLS) {
    const y0 = D.LEVELS[w.level];
    for (const s of wallSolids(w)) rects.push({ ...s, y0, y1: y0 + w.h });
  }
  for (const f of D.FURNITURE) {
    if (f.h < 0.08) continue;
    const base = D.LEVELS[f.level];
    rects.push({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1, y0: f.hang ? base + f.h - 0.08 : base, y1: base + f.h });
  }
  for (const c of D.COLUMNS) rects.push({ x0: c.x - c.w / 2, x1: c.x + c.w / 2, z0: c.z - c.d / 2, z1: c.z + c.d / 2, y0: 0, y1: D.LEVELS.first });
  for (const g of D.GUARDS) for (const r of D.guardBands(g)) rects.push({ ...r, y0: D.LEVELS[g.level], y1: D.LEVELS[g.level] + g.h });
  const yT = D.LEVELS.terrace;
  for (const p of D.TERRACE.planters) rects.push({ ...p, y0: yT, y1: yT + p.h });
  for (const [x, z] of [...D.TERRACE.solar.posts, ...D.TERRACE.washCanopy.posts]) rects.push({ x0: x - 0.06, x1: x + 0.06, z0: z - 0.06, z1: z + 0.06, y0: yT, y1: yT + 2.4 });
  const tr = D.COURT_TREE;
  rects.push({ x0: tr.x - 0.09, x1: tr.x + 0.09, z0: tr.z - 0.09, z1: tr.z + 0.09, y0: -0.1, y1: 2.3 });
  const pm = D.PALM;
  rects.push({ x0: pm.x - 0.18, x1: pm.x + 0.18, z0: pm.z - 0.18, z1: pm.z + 0.18, y0: 0, y1: 4 });
  // Compound wall along the boundary (inset by half its thickness), with the gate gap.
  const V = D.PLOT.vertices;
  for (let i = 0; i < 4; i++) {
    const p = V[i], q = V[(i + 1) % 4], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz), n = [-dz / L, dx / L];
    const off = (pt) => [pt[0] + (n[0] * D.COMPOUND.t) / 2, pt[1] + (n[1] * D.COMPOUND.t) / 2];
    const at = (z) => [D.boundaryX('W', z), z];
    const runs = i === 3 ? [[p, at(D.GATE.z1 + D.GATE.pierW)], [at(D.GATE.z0 - D.GATE.pierW), q]] : [[p, q]];
    for (const [a, b] of runs) segs.push({ a: off(a), b: off(b), t: D.COMPOUND.t, y0: -0.2, y1: D.COMPOUND.h });
    if (i === 3) for (const [za, zb] of [[D.GATE.z0 - D.GATE.pierW, D.GATE.z0], [D.GATE.z1, D.GATE.z1 + D.GATE.pierW]]) segs.push({ a: off(at(za)), b: off(at(zb)), t: D.COMPOUND.t + 0.12, y0: -0.2, y1: D.GATE.pierH });
  }
  return { rects, segs };
}
const inR = (x, z, r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
const inHouse = (x, z) => x >= D.HOUSE.x0 && x <= D.HOUSE.x1 && z >= D.HOUSE.z0 && z <= D.HOUSE.z1;
function terraceY(x, z) {
  const C = D.COURT, g = 0.23, x0 = D.HOUSE.x0 + g, x1 = D.HOUSE.x1 - g, z0 = D.HOUSE.z0 + g, z1 = D.HOUSE.z1 - g;
  const dmax = Math.max(C.x0 - g - x0, x1 - C.x1 - g, C.z0 - g - z0, z1 - C.z1 - g);
  const dx = Math.max(C.x0 - g - x, 0, x - C.x1 - g), dz = Math.max(C.z0 - g - z, 0, z - C.z1 - g);
  return D.LEVELS.terrace + 0.02 + D.TERRACE.fall * Math.min(1, Math.max(dx, dz) / dmax);
}
// All walkable surfaces at (x, z); the caller picks the right one from the current height.
export function floorCandidates(x, z) {
  const c = [];
  if (D.pointInPolygon([x, z], D.PLOT.vertices)) c.push(inR(x, z, D.DRAINAGE.courtBasin) ? D.DRAINAGE.courtBasin.floor : 0.014);
  else c.push(x < D.boundaryX('W', z) - 1.2 ? -D.ROAD.drop : -0.03);
  for (const lvl of ['first', 'terrace']) {
    if (!inHouse(x, z) || D.SLAB_OPENINGS[lvl].some((o) => inR(x, z, o))) continue;
    if (lvl === 'first') c.push(D.LEVELS.first + 0.012);
    else c.push(inR(x, z, D.MUMTY) ? D.LEVELS.terrace + 0.012 : terraceY(x, z));
  }
  for (const y0 of [D.LEVELS.ground, D.LEVELS.first]) { const y = D.stairWalkY(x, z, y0); if (y !== null) c.push(y); }
  return c;
}
export function levelOf(feet) { return feet > D.LEVELS.terrace - 0.6 ? 'terrace' : feet > D.LEVELS.first - 0.6 ? 'first' : 'ground'; }

export function createWalker({ camera, dom, getMovers, onInteract, onLockChange, isTouch }) {
  const { rects, segs } = buildColliders();
  const st = { x: 0, z: 0, feet: 0, vy: 0, yaw: 0, pitch: 0, enabled: false, bob: 0 };
  const keys = new Set();
  const joy = { id: null, x: 0, y: 0, cx: 0, cy: 0 }, look = { id: null, x: 0, y: 0, moved: 0, t: 0 };
  let locked = false, wantLock = false;

  function bodyRange() { return [st.feet + STEP - 0.02, st.feet + BODY]; }
  function collide(x, z) {
    const [b0, b1] = bodyRange();
    for (let it = 0; it < 3; it++) {
      for (const r of rects) {
        if (r.y1 <= b0 || r.y0 >= b1) continue;
        const cx = Math.max(r.x0, Math.min(x, r.x1)), cz = Math.max(r.z0, Math.min(z, r.z1));
        const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        if (d2 > 1e-10) { const d = Math.sqrt(d2), k = (R - d) / d; x += dx * k; z += dz * k; }
        else {
          const pens = [[x - r.x0 + R, -1, 0], [r.x1 - x + R, 1, 0], [z - r.z0 + R, 0, -1], [r.z1 - z + R, 0, 1]].sort((a, b) => a[0] - b[0])[0];
          x += pens[1] * pens[0]; z += pens[2] * pens[0];
        }
      }
      for (const s of [...segs, ...dynamicSegs()]) {
        if (s.y1 <= b0 || s.y0 >= b1) continue;
        const ax = s.a[0], az = s.a[1], bx = s.b[0] - ax, bz = s.b[1] - az, L2 = bx * bx + bz * bz;
        const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / L2));
        const px = ax + bx * t, pz = az + bz * t, dx = x - px, dz = z - pz, d = Math.hypot(dx, dz), min = R + s.t / 2;
        if (d < min && d > 1e-9) { x += (dx / d) * (min - d); z += (dz / d) * (min - d); }
      }
    }
    const rr = Math.hypot(x, z);
    if (rr > 24) { x *= 24 / rr; z *= 24 / rr; }
    return [x, z];
  }
  function dynamicSegs() {
    const out = [];
    for (const m of getMovers()) for (const lf of m.leaves) {
      const a = lf.pivot.rotation.y, p = lf.pivot.position;
      out.push({ a: [p.x, p.z], b: [p.x + Math.cos(a) * lf.w, p.z - Math.sin(a) * lf.w], t: 0.05, y0: m.y0, y1: m.y0 + 2.1 });
    }
    return out;
  }
  function floorAt(x, z, feet) {
    const c = floorCandidates(x, z);
    let best = -Infinity;
    for (const y of c) if (y <= feet + STEP && y > best) best = y;
    return best === -Infinity ? null : best;
  }
  function placeCamera() {
    const bob = Math.sin(st.bob) * 0.018;
    camera.position.set(st.x, st.feet + D.EYE + bob, st.z);
    camera.rotation.set(st.pitch, st.yaw, 0, 'YXZ');
  }
  function setFrom(pos, lookAt) {
    st.x = pos[0]; st.z = pos[2];
    const c = floorCandidates(st.x, st.z), want = pos[1] - D.EYE;
    st.feet = c.reduce((b, y) => (Math.abs(y - want) < Math.abs(b - want) ? y : b), c[0]);
    st.vy = 0;
    const dx = lookAt[0] - pos[0], dy = lookAt[1] - pos[1], dz = lookAt[2] - pos[2];
    st.yaw = Math.atan2(-dx, -dz);
    st.pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(dy, Math.hypot(dx, dz))));
    placeCamera();
  }
  // Sub-stepped so walking speed holds at low frame rates (slow phones, software GL).
  function update(dt) {
    if (!st.enabled) return false;
    dt = Math.min(dt, 0.25);
    const n = Math.max(1, Math.ceil(dt / 0.034));
    let moved = false;
    for (let i = 0; i < n; i++) moved = step(dt / n) || moved;
    placeCamera();
    return moved;
  }
  function step(dt) {
    let f = 0, s = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyA')) s -= 1;
    if (keys.has('KeyD')) s += 1;
    if (keys.has('ArrowLeft')) st.yaw += dt * 1.8;
    if (keys.has('ArrowRight')) st.yaw -= dt * 1.8;
    if (joy.id !== null) { f += -joy.y; s += joy.x; }
    const mag = Math.hypot(f, s), speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN : WALK;
    let moved = false;
    if (mag > 0.05) {
      const k = (Math.min(1, mag) * speed * dt) / mag;
      const sin = Math.sin(st.yaw), cos = Math.cos(st.yaw);
      let nx = st.x + (-sin * f + cos * s) * k, nz = st.z + (-cos * f - sin * s) * k;
      [nx, nz] = collide(nx, nz);
      const fl = floorAt(nx, nz, st.feet);
      if (fl !== null && fl >= st.feet - 3.5) { st.x = nx; st.z = nz; moved = true; st.bob += dt * 9 * Math.min(1, mag); }
    }
    const fl = floorAt(st.x, st.z, st.feet);
    if (fl !== null) {
      if (fl > st.feet) { st.feet = Math.min(fl, st.feet + dt * 3.5 + 0.02); st.vy = 0; }
      else if (fl < st.feet - 0.005) { st.vy -= 9.8 * dt; st.feet = Math.max(fl, st.feet + st.vy * dt); if (st.feet === fl) st.vy = 0; }
      else st.vy = 0;
    }
    return moved || Math.abs(st.vy) > 0;
  }

  // ---- input ----
  const onKey = (e, down) => {
    if (!st.enabled) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
      e.preventDefault();
      if (down) keys.add(e.code); else keys.delete(e.code);
    }
    if (down && e.code === 'KeyE') onInteract(null);
  };
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => { keys.clear(); joy.id = null; joy.x = joy.y = 0; look.id = null; });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === dom;
    onLockChange(locked, wantLock && st.enabled);
    if (!locked) keys.clear();
  });
  dom.addEventListener('mousemove', (e) => {
    if (!st.enabled || !locked) return;
    st.yaw -= e.movementX * 0.0022;
    st.pitch = Math.max(-1.25, Math.min(1.25, st.pitch - e.movementY * 0.0022));
  });
  dom.addEventListener('click', (e) => {
    if (!st.enabled || isTouch()) return;
    if (!locked) { requestLock(); return; }
    onInteract(null, e);
  });
  function requestLock() {
    wantLock = true;
    try { const p = dom.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch { /* pointer lock unavailable */ }
  }
  // Touch: left-bottom joystick moves; drag elsewhere looks; tap interacts.
  const joyEl = document.getElementById('joystick'), knob = document.getElementById('joystick-knob');
  joyEl.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0], r = joyEl.getBoundingClientRect();
    joy.id = t.identifier; joy.cx = r.left + r.width / 2; joy.cy = r.top + r.height / 2;
    moveJoy(t); e.preventDefault();
  }, { passive: false });
  const moveJoy = (t) => {
    const dx = t.clientX - joy.cx, dy = t.clientY - joy.cy, m = 46, d = Math.hypot(dx, dy), k = d > m ? m / d : 1;
    joy.x = (dx * k) / m; joy.y = (dy * k) / m;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  };
  window.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) moveJoy(t);
      if (t.identifier === look.id) {
        const dx = t.clientX - look.x, dy = t.clientY - look.y;
        look.x = t.clientX; look.y = t.clientY; look.moved += Math.abs(dx) + Math.abs(dy);
        st.yaw -= dx * 0.0055;
        st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch - dy * 0.0055));
      }
    }
    if (st.enabled && (joy.id !== null || look.id !== null)) e.preventDefault();
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) { joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; }
      if (t.identifier === look.id) {
        if (look.moved < 10 && performance.now() - look.t < 350) onInteract({ x: t.clientX, y: t.clientY });
        look.id = null;
      }
    }
  };
  window.addEventListener('touchend', endTouch);
  window.addEventListener('touchcancel', endTouch);
  dom.addEventListener('touchstart', (e) => {
    if (!st.enabled) return;
    const t = e.changedTouches[0];
    look.id = t.identifier; look.x = t.clientX; look.y = t.clientY; look.moved = 0; look.t = performance.now();
    e.preventDefault();
  }, { passive: false });

  return {
    state: st,
    enable(pos, lookAt) { st.enabled = true; setFrom(pos, lookAt); },
    disable() { st.enabled = false; keys.clear(); wantLock = false; if (document.pointerLockElement === dom) document.exitPointerLock?.(); },
    jump(pos, lookAt) { setFrom(pos, lookAt); },
    update,
    requestLock,
    get locked() { return locked; },
    get level() { return levelOf(st.feet); },
    colliders: { rects, segs },
  };
}
