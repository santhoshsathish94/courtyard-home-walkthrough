// Builds the 3D model entirely from the design data in design.js.
// Static geometry is merged per material and per level group, so draw calls stay
// low on mobile. Doors, the gate and the swing stay dynamic.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as D from './design.js';

const { LEVELS, SLAB, HOUSE, COURT, STAIR, WALLS, ROOMS, BEAMS, FURNITURE, COLUMNS, TERRACE, DRAINAGE, SCUPPERS, PLOT, COMPOUND, GATES, ROAD, MUMTY, COPING, FACE, BALCONY } = D;
const SWD = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const EPS = 1e-6;
const isHoriz = (w) => Math.abs(w.a[1] - w.b[1]) < EPS;

// ------------------------------------------------------------ geometry ----
// UVs in metres, projected along each face's dominant normal axis.
function worldUV(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i), p.getZ(i));
    else if (ax >= az) uv.setXY(i, p.getZ(i), p.getY(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  uv.needsUpdate = true;
  return g;
}
function boxG(x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return worldUV(g);
}
// Box along a plan segment p0→p1 (thickness t, offset perpendicular by off).
function segBoxG(p0, p1, y0, y1, t, off = 0) {
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
  const g = new THREE.BoxGeometry(len, y1 - y0, t);
  g.rotateY(Math.atan2(-uz, ux));
  g.translate((p0[0] + p1[0]) / 2 - uz * off, (y0 + y1) / 2, (p0[1] + p1[1]) / 2 + ux * off);
  return worldUV(g);
}
function cylG(x, z, r, y0, y1, seg = 16, rTop = r) {
  const g = new THREE.CylinderGeometry(rTop, r, y1 - y0, seg);
  g.translate(x, (y0 + y1) / 2, z);
  return worldUV(g);
}
const NO_SHADOW = new Set(['water', 'grass', 'soil', 'gravel', 'asphalt', 'flame', 'glass']);
class Batch {
  constructor(name) { this.name = name; this.map = new Map(); this.raw = new Map(); }
  add(key, g) { if (!g) return; const a = this.map.get(key) || []; a.push(g.index ? g.toNonIndexed() : g); this.map.set(key, a); }
  addRaw(key, g) { const a = this.raw.get(key) || []; a.push(g.index ? g.toNonIndexed() : g); this.raw.set(key, a); }
  box(key, x0, x1, y0, y1, z0, z1) {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1), az = Math.min(z0, z1), bz = Math.max(z0, z1);
    if (bx - ax < 1e-4 || by - ay < 1e-4 || bz - az < 1e-4) return;
    this.add(key, boxG(ax, bx, ay, by, az, bz));
  }
  build(M) {
    const group = new THREE.Group();
    group.name = this.name;
    for (const src of [this.map, this.raw]) for (const [key, list] of src) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list, false), M[key]);
      mesh.name = `${this.name}:${key}`;
      mesh.castShadow = !NO_SHADOW.has(key);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    return group;
  }
}
// Axis-aligned rectangle minus rectangular holes, as a list of rectangles.
function rectMinus(o, holes) {
  const xs = new Set([o.x0, o.x1]), zs = new Set([o.z0, o.z1]);
  for (const h of holes) {
    for (const x of [h.x0, h.x1]) if (x > o.x0 && x < o.x1) xs.add(x);
    for (const z of [h.z0, h.z1]) if (z > o.z0 && z < o.z1) zs.add(z);
  }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b), out = [];
  for (let j = 0; j < Z.length - 1; j++) {
    let run = null;
    for (let i = 0; i < X.length - 1; i++) {
      const cx = (X[i] + X[i + 1]) / 2, cz = (Z[j] + Z[j + 1]) / 2;
      const solid = !holes.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1);
      if (solid && run) run.x1 = X[i + 1];
      else if (solid) run = { x0: X[i], x1: X[i + 1], z0: Z[j], z1: Z[j + 1] };
      else if (run) { out.push(run); run = null; }
    }
    if (run) out.push(run);
  }
  return out;
}
// Furniture frame: u runs across the front (left → right as seen from the front),
// v runs from the back (0) to the front (depth). `back` is the side against a wall.
function frame(f, back, y) {
  const W = back === 'N' || back === 'S' ? f.x1 - f.x0 : f.z1 - f.z0;
  const Dp = back === 'N' || back === 'S' ? f.z1 - f.z0 : f.x1 - f.x0;
  const P = (u, v) => {
    switch (back) {
      case 'N': return [f.x0 + u, f.z0 + v];
      case 'S': return [f.x1 - u, f.z1 - v];
      case 'E': return [f.x1 - v, f.z0 + u];
      default: return [f.x0 + v, f.z1 - u];
    }
  };
  return {
    W, Dp, P,
    box(b, key, u0, u1, y0, y1, v0, v1) { const a = P(u0, v0), c = P(u1, v1); b.box(key, a[0], c[0], y + y0, y + y1, a[1], c[1]); },
    cyl(b, key, u, v, r, y0, y1, seg = 14, rTop = r) { const [x, z] = P(u, v); b.add(key, cylG(x, z, r, y + y0, y + y1, seg, rTop)); },
  };
}
function autoBack(f) {
  const r = ROOMS.find((rm) => rm.level === f.level && (f.x0 + f.x1) / 2 >= rm.x0 && (f.x0 + f.x1) / 2 <= rm.x1 && (f.z0 + f.z1) / 2 >= rm.z0 && (f.z0 + f.z1) / 2 <= rm.z1);
  if (!r) return 'N';
  const c = [['N', f.z0 - r.z0, f.x1 - f.x0], ['S', r.z1 - f.z1, f.x1 - f.x0], ['W', f.x0 - r.x0, f.z1 - f.z0], ['E', r.x1 - f.x1, f.z1 - f.z0]].filter((s) => Math.abs(s[1]) < 0.04);
  c.sort((a, b) => b[2] - a[2]);
  return c.length ? c[0][0] : 'N';
}
const opposite = { N: 'S', S: 'N', E: 'W', W: 'E' };

// Leaf cards for foliage: crossed vertical planes plus one horizontal plane.
function leafClump(b, key, x, y, z, size, rot = 0) {
  for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(size, size);
    g.rotateY(rot + (k * Math.PI) / 3);
    g.translate(x, y, z);
    b.addRaw(key, g);
  }
  const g = new THREE.PlaneGeometry(size * 0.9, size * 0.9);
  g.rotateX(-Math.PI / 2);
  g.rotateY(rot);
  g.translate(x, y + size * 0.18, z);
  b.addRaw(key, g);
}

// -------------------------------------------------------------- walls -----
const houseCentre = [(HOUSE.x0 + HOUSE.x1) / 2, (HOUSE.z0 + HOUSE.z1) / 2];
function outwardOf(w) {
  let c = houseCentre;
  if (w.id.startsWith('tr-mumty')) c = [(MUMTY.x0 + MUMTY.x1) / 2, (MUMTY.z0 + MUMTY.z1) / 2];
  return isHoriz(w) ? [0, Math.sign(w.a[1] - c[1]) || 1] : [Math.sign(w.a[0] - c[0]) || 1, 0];
}
// Map wall-local (s along the wall, n across it from the centreline) to plan coordinates.
function wallMap(w) {
  const len = D.wallLength(w), ux = (w.b[0] - w.a[0]) / len, uz = (w.b[1] - w.a[1]) / len;
  return { len, ux, uz, at: (s, n = 0) => [w.a[0] + ux * s - uz * n, w.a[1] + uz * s + ux * n], nx: -uz, nz: ux };
}
// Box in wall-local coordinates: s0..s1 along the wall, n0..n1 across it, y absolute.
function wallBox(b, key, w, s0, s1, y0, y1, n0, n1) {
  const m = wallMap(w), a = m.at(s0, n0), c = m.at(s1, n1);
  b.box(key, Math.min(a[0], c[0]), Math.max(a[0], c[0]), y0, y1, Math.min(a[1], c[1]), Math.max(a[1], c[1]));
}
// Jaali: a perforated panel (alpha-tested) set in the wall plane with a slim frame.
function addJaali(b, w, s0, s1, y0, y1, key = 'jaaliClay', n = 0, frameKey = 'granite') {
  const m = wallMap(w), len = s1 - s0, h = y1 - y0, c = m.at((s0 + s1) / 2, n);
  const g = new THREE.PlaneGeometry(len, h);
  g.rotateY(Math.atan2(-m.uz, m.ux));
  g.translate(c[0], (y0 + y1) / 2, c[1]);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, uv.getY(i) * h);
  b.addRaw(key, g);
  const t = Math.min(w.t, 0.12) / 2, f = 0.035;
  wallBox(b, frameKey, w, s0, s1, y0 - f, y0, -t, t);
  wallBox(b, frameKey, w, s0, s1, y1, y1 + f, -t, t);
}
// Chajja: a crisp, thin concrete shade slab on the exterior side (modern, flat).
function addRainHood(b, w, s0, s1, y, depth = 0.45, key = 'limeExt') {
  const m = wallMap(w), out = outwardOf(w), sgn = Math.sign(out[0] * m.nx + out[1] * m.nz) || 1, t = w.t / 2;
  const n0 = sgn * t, n1 = sgn * (t + depth);
  wallBox(b, key, w, s0 - 0.15, s1 + 0.15, y, y + 0.07, Math.min(n0, n1), Math.max(n0, n1));
}
// Flat stone coping with a drip overhang on both faces along a wall top.
function addCoping(b, p0, p1, y, t) {
  b.add('granite', segBoxG(p0, p1, y, y + COPING.h, t + 2 * COPING.overhang));
}

function buildWall(b, w, opts) {
  const y0 = LEVELS[w.level], h = w.h, m = wallMap(w), t = w.t / 2;
  const mat = opts.mat || 'lime', ops = [...w.openings].sort((a, c) => a.s - c.s);
  if (w.kind === 'screen') {
    // Full-height slender oak fins (95 mm gaps) between dark steel rails: a modern jaali.
    const yTop = y0 + h, n = Math.max(2, Math.round(m.len / 0.12));
    wallBox(b, 'frameDark', w, 0, m.len, y0, y0 + 0.05, -t, t);
    wallBox(b, 'frameDark', w, 0, m.len, yTop - 0.05, yTop, -t, t);
    for (let i = 0; i <= n; i++) { const s = Math.min(m.len - 0.025, Math.max(0, (m.len * i) / n - 0.0125)); wallBox(b, 'oak', w, s, s + 0.025, y0 + 0.05, yTop - 0.05, -t, t); }
    return;
  }
  let cur = 0;
  const piece = (s0, s1, ya, yb) => { if (s1 - s0 > 1e-4 && yb - ya > 1e-4) wallBox(b, mat, w, s0, s1, y0 + ya, y0 + yb, -t, t); };
  if (w.jaaliAbove) {
    // Solid parapet to jaaliAbove with a terracotta jaali above (wash-area safety screen).
    piece(0, m.len, 0, w.jaaliAbove);
    addJaali(b, w, 0.02, m.len - 0.02, y0 + w.jaaliAbove + 0.035, y0 + h - 0.035, 'jaaliClay', 0, 'limeExt');
    addCoping(b, m.at(0), m.at(m.len), y0 + h, w.t);
    return;
  }
  if (w.kind === 'low') {
    piece(0, m.len, 0, h);
    wallBox(b, 'graniteBlack', w, -0.02, m.len + 0.02, y0 + h, y0 + h + 0.04, -t - 0.03, t + 0.03);
    return;
  }
  for (const o of ops) {
    piece(cur, o.s, 0, h);
    const bottom = o.type === 'door' || o.type === 'arch' || o.type === 'slider' ? 0 : o.sill;
    if (o.lowJaali) { piece(o.s, o.s + o.w, 0, o.lowJaali[0]); piece(o.s, o.s + o.w, o.lowJaali[1], bottom); }
    else piece(o.s, o.s + o.w, 0, bottom);
    if (o.vent) { piece(o.s, o.s + o.w, o.head, o.head + 0.10); piece(o.s, o.s + o.w, o.head + 0.40, h); }
    else piece(o.s, o.s + o.w, o.head, h);
    cur = o.s + o.w;
    fillOpening(b, w, o, opts);
  }
  piece(cur, m.len, 0, h);
  if (COPING.on.includes(w.kind)) addCoping(b, m.at(0), m.at(m.len), y0 + h, w.t);
}

function fillOpening(b, w, o, opts) {
  const y0 = LEVELS[w.level], t = w.t / 2, m = wallMap(w), ext = w.kind === 'exterior' || w.kind === 'mumty' || w.level === 'ground';
  const s0 = o.s, s1 = o.s + o.w;
  if (o.type === 'jaali') {
    addJaali(b, w, s0, s1, y0 + o.sill, y0 + o.head, ext ? 'jaaliClay' : 'jaaliTeak');
    if (o.hood) addRainHood(b, w, s0, s1, y0 + o.head + 0.04, 0.30);
  }
  if (o.vent) addJaali(b, w, s0, s1, y0 + o.head + 0.10, y0 + o.head + 0.40, ext ? 'jaaliClay' : 'jaaliTeak', 0, ext ? 'granite' : 'teakDark');
  if (o.lowJaali) {
    addJaali(b, w, s0, s1, y0 + o.lowJaali[0], y0 + o.lowJaali[1], 'jaaliClay');
    addRainHood(b, w, s0, s1, y0 + o.lowJaali[1] + 0.02, 0.22);
  }
  if (o.type === 'window') {
    // Modern window: slim dark aluminium frame centred in a deep reveal, mullions about
    // every 0.6 m, clear glass, a honed stone sill. No shutters or bars.
    const fy0 = y0 + o.sill, fy1 = y0 + o.head, fw = 0.045, fn0 = -0.03, fn1 = 0.03;
    wallBox(b, 'frameDark', w, s0, s0 + fw, fy0, fy1, fn0, fn1);
    wallBox(b, 'frameDark', w, s1 - fw, s1, fy0, fy1, fn0, fn1);
    wallBox(b, 'frameDark', w, s0, s1, fy1 - fw, fy1, fn0, fn1);
    wallBox(b, 'frameDark', w, s0, s1, fy0, fy0 + fw, fn0, fn1);
    const nm = o.w > 1.05 ? Math.round(o.w / 0.6) : 1;
    for (let i = 1; i < nm; i++) { const s = s0 + (o.w * i) / nm; wallBox(b, 'frameDark', w, s - 0.018, s + 0.018, fy0, fy1, fn0, fn1); }
    if (fy1 - fy0 > 1.25) { const yb = fy1 - 0.42; wallBox(b, 'frameDark', w, s0, s1, yb - 0.018, yb + 0.018, fn0, fn1); }
    wallBox(b, 'glass', w, s0 + fw, s1 - fw, fy0 + fw, fy1 - fw, -0.004, 0.004);
    wallBox(b, 'kotaSlab', w, s0 - 0.02, s1 + 0.02, fy0 - 0.03, fy0, -t - 0.02, t + 0.02);
    // Safety rails (the "grille") on the room side of low and court-facing windows.
    if (o.grille !== false && (o.sill < 1.0 || o.court)) {
      let roomSide;
      if (o.court) { const cc = [(COURT.x0 + COURT.x1) / 2, (COURT.z0 + COURT.z1) / 2], wa = m.at(0); roomSide = -(Math.sign((cc[0] - wa[0]) * m.nx + (cc[1] - wa[1]) * m.nz) || 1); }
      else { const out = outwardOf(w); roomSide = -(Math.sign(out[0] * m.nx + out[1] * m.nz) || 1); }
      const nr = roomSide * (t - 0.04);
      for (const yy of [0.62, 1.02]) if (yy > o.sill + 0.08) wallBox(b, 'frameDark', w, s0 + fw, s1 - fw, y0 + yy - 0.012, y0 + yy + 0.012, nr - 0.012, nr + 0.012);
      for (const ss of [s0 + fw + 0.01, s1 - fw - 0.03]) wallBox(b, 'frameDark', w, ss, ss + 0.02, fy0, y0 + 1.04, nr - 0.012, nr + 0.012);
    }
    // Main first-floor windows get a projecting dark box frame (shade + depth on the
    // facade); smaller ones keep a thin chajja.
    if (ext && w.kind === 'exterior' && w.level === 'first' && o.w >= 1.0) {
      const out = outwardOf(w), sg = Math.sign(out[0] * m.nx + out[1] * m.nz) || 1, n0 = sg * t, n1 = sg * (t + 0.28);
      const lo = Math.min(n0, n1), hi = Math.max(n0, n1), k = 0.06;
      const yb = y0 + (o.lowJaali ? o.lowJaali[0] : o.sill) - k, yt = y0 + o.head + (o.vent ? 0.40 : 0) + k;
      wallBox(b, 'frameDark', w, s0 - k, s1 + k, yt - k, yt, lo, hi);
      wallBox(b, 'frameDark', w, s0 - k, s1 + k, yb, yb + k, lo, hi);
      wallBox(b, 'frameDark', w, s0 - k, s0, yb, yt, lo, hi);
      wallBox(b, 'frameDark', w, s1, s1 + k, yb, yt, lo, hi);
    } else if (ext) addRainHood(b, w, s0, s1, y0 + o.head + (o.vent ? 0.44 : 0.04), o.hood ? 0.55 : 0.45);
  }
  if (o.type === 'slider') {
    // Sliding glass door: dark aluminium frame, two overlapping panels, flush stone threshold.
    const fy1 = y0 + o.head, fw = 0.05, mid = (s0 + s1) / 2;
    wallBox(b, 'frameDark', w, s0, s0 + fw, y0, fy1, -0.05, 0.05);
    wallBox(b, 'frameDark', w, s1 - fw, s1, y0, fy1, -0.05, 0.05);
    wallBox(b, 'frameDark', w, s0, s1, fy1 - fw, fy1, -0.05, 0.05);
    wallBox(b, 'frameDark', w, s0, s1, y0, y0 + 0.03, -0.05, 0.05);
    for (const [a, c, n0] of [[s0 + fw, mid + 0.03, -0.04], [mid - 0.03, s1 - fw, 0.005]]) {
      wallBox(b, 'frameDark', w, a, a + 0.035, y0 + 0.03, fy1 - fw, n0, n0 + 0.035);
      wallBox(b, 'frameDark', w, c - 0.035, c, y0 + 0.03, fy1 - fw, n0, n0 + 0.035);
      wallBox(b, 'frameDark', w, a, c, y0 + 0.03, y0 + 0.09, n0, n0 + 0.035);
      wallBox(b, 'glass', w, a + 0.035, c - 0.035, y0 + 0.09, fy1 - fw, n0 + 0.012, n0 + 0.022);
    }
    wallBox(b, 'kotaSlab', w, s0 - 0.02, s1 + 0.02, y0, y0 + 0.012, -t - 0.02, t + 0.02);
  }
  if (o.type === 'door') {
    const fw = 0.05, head = y0 + o.head, fk = o.main ? 'teakDark' : 'oak';
    wallBox(b, fk, w, s0, s0 + fw, y0, head, -t, t);
    wallBox(b, fk, w, s1 - fw, s1, y0, head, -t, t);
    wallBox(b, fk, w, s0, s1, head - fw, head, -t, t);
    if (o.main) wallBox(b, 'kotaSlab', w, s0 - 0.12, s1 + 0.12, y0, y0 + 0.04, -t - 0.25, t + 0.25);
  }
  if (o.type === 'arch') {
    const rise = Math.min(0.30, o.w * 0.28), H = y0 + o.head;
    for (const left of [true, false]) {
      const sh = new THREE.Shape();
      if (left) { sh.moveTo(0, -rise); sh.quadraticCurveTo(0, 0, o.w * 0.5, 0); sh.lineTo(0, 0); }
      else { sh.moveTo(o.w, -rise); sh.lineTo(o.w, 0); sh.lineTo(o.w * 0.5, 0); sh.quadraticCurveTo(o.w, 0, o.w, -rise); }
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: w.t, bevelEnabled: false, curveSegments: 10 });
      g.translate(0, 0, -t);
      const mat4 = new THREE.Matrix4().makeBasis(new THREE.Vector3(m.ux, 0, m.uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(m.nx, 0, m.nz));
      g.applyMatrix4(mat4);
      const p = m.at(s0);
      g.translate(p[0], H, p[1]);
      g.computeVertexNormals();
      b.add(opts.mat || 'lime', worldUV(g));
    }
    wallBox(b, 'granite', w, s0, s1, y0, y0 + 0.012, -t, t);
  }
}

// --------------------------------------------------------------- doors ----
function makeLeafMesh(M, w, h, kind) {
  // Flush modern leaves: light oak for rooms, a grooved dark-teak main door, and
  // oak-framed timber-slat leaves for the pooja. Slim dark pull handles.
  const g = new THREE.Group(), th = 0.04, skin = kind === 'main' ? M.teakDark : M.oak;
  const body = new THREE.Mesh(boxG(0, w, 0, h, -th / 2, th / 2), skin);
  g.add(body);
  if (kind === 'jali') {
    body.geometry = boxG(0, w, 0, h * 0.42, -th / 2, th / 2);
    const top = new THREE.Mesh(boxG(0, 0.05, h * 0.42, h, -th / 2, th / 2), skin); g.add(top);
    g.add(new THREE.Mesh(boxG(w - 0.05, w, h * 0.42, h, -th / 2, th / 2), skin));
    g.add(new THREE.Mesh(boxG(0, w, h - 0.05, h, -th / 2, th / 2), skin));
    const j = new THREE.PlaneGeometry(w - 0.1, h * 0.58 - 0.05);
    j.translate(w / 2, h * 0.42 + (h * 0.58 - 0.05) / 2, 0);
    g.add(new THREE.Mesh(j, M.jaaliTeak));
  } else if (kind === 'main') {
    for (const zf of [-1, 1]) for (let u = 0.09; u < w - 0.05; u += 0.09) {
      g.add(new THREE.Mesh(boxG(u - 0.004, u + 0.004, 0.08, h - 0.08, zf * th / 2 - 0.002, zf * th / 2 + 0.002), M.iron));
    }
  }
  for (const zf of [-1, 1]) {
    const hy = kind === 'main' ? [0.7, 1.5] : [0.92, 1.12];
    g.add(new THREE.Mesh(boxG(w - 0.08, w - 0.06, hy[0], hy[1], zf * (th / 2 + 0.035) - 0.01, zf * (th / 2 + 0.035) + 0.01), M.frameDark));
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
const angleOf = (d) => Math.atan2(-d[1], d[0]);
function deltaAngle(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

function buildDoors(M, groups) {
  const doors = [];
  for (const w of WALLS) for (const o of w.openings) {
    if (o.type !== 'door') continue;
    const level = w.level, y0 = LEVELS[level], sw = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[o.swing];
    const leaves = D.doorLeaves(w, o).map((lf) => {
      const lw = lf.w - 0.06 - 0.005, h = o.head - 0.06 - 0.01;
      const pivot = new THREE.Group();
      const hx = lf.hinge[0] + lf.closedDir[0] * 0.06 - sw[0] * 0.025, hz = lf.hinge[1] + lf.closedDir[1] * 0.06 - sw[1] * 0.025;
      pivot.position.set(hx, y0 + 0.01, hz);
      const closed = angleOf(lf.closedDir), open = closed + deltaAngle(closed, angleOf(lf.openDir));
      pivot.add(makeLeafMesh(M, lw, h, o.jali ? 'jali' : o.main ? 'main' : 'flush'));
      pivot.userData.door = o.id;
      return { pivot, closed, open, w: lw, hinge: [hx, hz] };
    });
    const g = groups[level === 'ground' ? 'L0' : level === 'first' ? 'L1' : 'L2'];
    for (const lf of leaves) g.add(lf.pivot);
    const door = { id: o.id, label: o.main ? 'Main door' : o.id, level, y0, open: o.defaultOpen !== false, t: o.defaultOpen !== false ? 1 : 0, leaves, openDeg: 90 };
    for (const lf of leaves) { lf.pivot.rotation.y = lf.closed + (lf.open - lf.closed) * door.t; lf.pivot.traverse((m) => { if (m.isMesh) m.userData.door = door; }); }
    doors.push(door);
  }
  return doors;
}

// --------------------------------------------------------------- gates ----
// Horizontal oak slats with narrow gaps on a slim dark steel frame. The car gate
// slides north behind the compound wall; the front gate swings inward on its hinge
// post. Leaves expose apply(t) so the mover loop animates slides and swings alike
// (t = 0 closed, 1 open).
function buildGates(M, group) {
  return GATES.map((G) => {
    const leaves = D.gateLeaves(G).map((lf) => {
      const pivot = new THREE.Group(), w = lf.w, h = G.leafH, g = new THREE.Group(), fr = 0.04, th = G.t / 2;
      for (const [x0, x1, y0, y1] of [[0, fr, 0.04, h], [w - fr, w, 0.04, h], [0, w, h - fr, h], [0, w, 0.04, 0.04 + fr]]) g.add(new THREE.Mesh(boxG(x0, x1, y0, y1, -th, th), M.frameDark));
      for (let y = 0.1; y < h - 0.1; y += 0.115) g.add(new THREE.Mesh(boxG(fr, w - fr, y, y + 0.095, -th * 0.7, th * 0.7), M.oak));
      pivot.add(g);
      group.add(pivot);
      if (lf.sliding) {
        g.add(new THREE.Mesh(boxG(0.02, w - 0.02, 0, 0.04, -0.03, 0.03), M.iron));
        pivot.rotation.y = angleOf(lf.dir);
        const a = new THREE.Vector3(lf.closed[0][0], 0.0, lf.closed[0][1]), c = new THREE.Vector3(lf.open[0][0], 0.0, lf.open[0][1]);
        return { pivot, w, apply: (t) => pivot.position.lerpVectors(a, c, t) };
      }
      pivot.position.set(lf.hinge[0], 0.0, lf.hinge[1]);
      const closed = angleOf(lf.closedDir), open = closed + deltaAngle(closed, angleOf(lf.openDir));
      return { pivot, w, apply: (t) => { pivot.rotation.y = closed + (open - closed) * t; } };
    });
    if (G.type === 'sliding') {
      const lf0 = D.gateLeaves(G)[0];
      group.add(new THREE.Mesh(segBoxG(lf0.open[0], lf0.closed[1], 0.0, 0.03, 0.08), M.iron));
    }
    const gate = { id: G.id, label: G.label, level: 'ground', y0: 0, open: true, t: 1, leaves, sliding: G.type === 'sliding' };
    for (const lf of leaves) { lf.apply(1); lf.pivot.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.userData.door = gate; } }); }
    return gate;
  });
}

// --------------------------------------------------------- furniture ----
function buildFurnitureItem(b, M, f, dyn) {
  const y = LEVELS[f.level];
  const back = f.head || f.back || (f.face ? opposite[f.face] : autoBack(f));
  const F = frame(f, back, y), W = F.W, Dp = F.Dp;
  switch (f.type) {
    case 'bed': {
      F.box(b, 'oak', -0.05, W + 0.05, 0, 1.05, 0, 0.06);
      F.box(b, 'fabricLinen', 0.02, W - 0.02, 0.32, 1.0, 0.06, 0.12);
      F.box(b, 'oak', 0.02, W - 0.02, 0.06, 0.30, 0.05, Dp - 0.01);
      for (const [u, v] of [[0.03, Dp - 0.06], [W - 0.06, Dp - 0.06]]) F.box(b, 'frameDark', u, u + 0.05, 0, 0.06, v, v + 0.05);
      F.box(b, 'mattress', 0.04, W - 0.04, 0.30, 0.47, 0.07, Dp - 0.04);
      F.box(b, f.single ? 'fabricSage' : f.id.startsWith('bed2') ? 'fabricLinen' : 'fabricRust', 0.025, W - 0.025, 0.30, 0.49, Dp * 0.62, Dp - 0.02);
      const pw = f.single ? W - 0.2 : (W - 0.3) / 2;
      for (let i = 0; i < (f.single ? 1 : 2); i++) F.box(b, 'white', 0.1 + i * (pw + 0.1), 0.1 + i * (pw + 0.1) + pw, 0.47, 0.58, 0.1, 0.42);
      break;
    }
    case 'wardrobe': {
      F.box(b, 'oak', 0, W, 0.06, f.h, 0, Dp);
      F.box(b, 'frameDark', 0.02, W - 0.02, 0, 0.06, 0.04, Dp - 0.04);
      const n = Math.max(2, Math.round(W / 0.5));
      for (let i = 0; i < n; i++) {
        const u0 = (W / n) * i + 0.004, u1 = (W / n) * (i + 1) - 0.004;
        F.box(b, 'oak', u0, u1, 0.07, f.h - 0.01, Dp, Dp + 0.018);
        const hu = i % 2 ? u0 + 0.04 : u1 - 0.06;
        F.box(b, 'frameDark', hu, hu + 0.02, 0.9, 1.3, Dp + 0.018, Dp + 0.04);
      }
      break;
    }
    case 'diwan': {
      F.box(b, 'oak', 0, W, 0.06, 0.2, 0, Dp);
      F.box(b, 'frameDark', 0.06, W - 0.06, 0, 0.06, 0.06, Dp - 0.06);
      F.box(b, 'fabricGrey', 0.02, W - 0.02, 0.2, 0.42, 0.02, Dp - 0.02);
      F.box(b, 'fabricGrey', 0, W, 0.2, 0.72, 0, 0.18);
      for (const u of [0, W - 0.16]) F.box(b, 'fabricGrey', u, u + 0.16, 0.2, 0.58, 0.18, Dp);
      for (const [u, k] of [[0.45, 'fabricLinen'], [W / 2, 'fabricLinen'], [W - 0.45, 'fabricRust']]) F.box(b, k, u - 0.22, u + 0.22, 0.42, 0.8, 0.18, 0.3);
      break;
    }
    case 'swing': {
      // Oak bench swing with a low back, hung on slim steel rods from the slab above.
      const pivot = new THREE.Group(), top = LEVELS.terrace - SLAB, cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
      const hw = (f.x1 - f.x0) / 2, hd = (f.z1 - f.z0) / 2, drop = top - y - f.h, bk = SWD[opposite[f.face || 'S']];
      pivot.position.set(cx, top, cz);
      pivot.add(new THREE.Mesh(boxG(-hw, hw, -drop - 0.05, -drop, -hd, hd), M.oak));
      if (Math.abs(bk[1]) > 0.5) pivot.add(new THREE.Mesh(boxG(-hw, hw, -drop, -drop + 0.38, bk[1] > 0 ? hd - 0.04 : -hd, bk[1] > 0 ? hd : -hd + 0.04), M.oak));
      else pivot.add(new THREE.Mesh(boxG(bk[0] > 0 ? hw - 0.04 : -hw, bk[0] > 0 ? hw : -hw + 0.04, -drop, -drop + 0.38, -hd, hd), M.oak));
      pivot.add(new THREE.Mesh(boxG(-hw + 0.08, hw - 0.08, -drop, -drop + 0.05, -hd + 0.06, hd - 0.06), M.fabricLinen));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, drop, 6), M.steel);
        ch.position.set(sx * (hw - 0.05), -drop / 2, sz * (hd - 0.05));
        pivot.add(ch);
      }
      pivot.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      dyn.swings.push({ pivot, level: f.level, axis: Math.abs(bk[1]) > 0.5 ? 'x' : 'z', phase: dyn.swings.length * 1.3 });
      break;
    }
    case 'sofa': {
      // Low modern sofa: dark plinth, grey frame, linen seat and back cushions.
      F.box(b, 'frameDark', 0.06, W - 0.06, 0, 0.08, 0.06, Dp - 0.06);
      F.box(b, 'fabricGrey', 0, W, 0.08, 0.30, 0, Dp);
      F.box(b, 'fabricGrey', 0, W, 0.30, f.h, 0, 0.2);
      for (const u of [0, W - 0.14]) F.box(b, 'fabricGrey', u, u + 0.14, 0.30, 0.58, 0.2, Dp);
      const n = Math.max(2, Math.round((W - 0.28) / 0.62));
      for (let i = 0; i < n; i++) {
        const u0 = 0.14 + ((W - 0.28) * i) / n + 0.005, u1 = 0.14 + ((W - 0.28) * (i + 1)) / n - 0.005;
        F.box(b, 'fabricLinen', u0, u1, 0.30, 0.44, 0.2, Dp - 0.02);
        F.box(b, 'fabricLinen', u0, u1, 0.44, f.h - 0.04, 0.2, 0.34);
      }
      F.box(b, 'fabricRust', 0.22, 0.62, 0.44, 0.76, 0.34, 0.46);
      F.box(b, 'fabricSage', W - 0.62, W - 0.22, 0.44, 0.76, 0.34, 0.46);
      break;
    }
    case 'tvunit': {
      // Floating oak console, a fluted oak wall panel and a wall-mounted screen.
      F.box(b, 'oak', 0, W, 0.18, f.h, 0, Dp);
      F.box(b, 'frameDark', 0.02, W - 0.02, 0.18, 0.2, 0.02, Dp);
      const n = Math.max(2, Math.round(W / 0.45));
      for (let i = 1; i < n; i++) F.box(b, 'frameDark', (W * i) / n - 0.004, (W * i) / n + 0.004, 0.22, f.h - 0.03, Dp, Dp + 0.004);
      for (let u = 0.0; u < W - 0.03; u += 0.06) F.box(b, 'oak', u, u + 0.045, f.h + 0.08, 1.85, 0, 0.03);
      F.box(b, 'glassDark', W / 2 - 0.6, W / 2 + 0.6, 0.85, 1.55, 0.03, 0.065);
      F.box(b, 'books', 0.08, 0.36, f.h, f.h + 0.22, 0.05, 0.25);
      F.cyl(b, 'terracotta', W - 0.2, Dp / 2, 0.08, f.h, f.h + 0.26, 14, 0.06);
      break;
    }
    case 'coffeetable': {
      F.box(b, 'graniteBlack', 0, W, f.h - 0.03, f.h, 0, Dp);
      F.box(b, 'oak', 0.14, W - 0.14, 0, f.h - 0.03, 0.1, Dp - 0.1);
      F.box(b, 'brass', W * 0.6, W * 0.6 + 0.2, f.h, f.h + 0.035, Dp * 0.3, Dp * 0.3 + 0.14);
      break;
    }
    case 'shoebench': {
      F.box(b, 'oak', 0, W, f.h - 0.04, f.h, 0, Dp);
      for (const u of [0, W - 0.03]) F.box(b, 'oak', u, u + 0.03, 0, f.h - 0.04, 0, Dp);
      F.box(b, 'oak', 0.03, W - 0.03, 0.16, 0.18, 0.02, Dp - 0.02);
      F.box(b, 'fabricLinen', 0.04, W - 0.04, f.h, f.h + 0.05, 0.03, Dp - 0.03);
      for (let i = 0; i < 2; i++) F.box(b, 'rubber', 0.07 + i * 0.22, 0.25 + i * 0.22, 0.18, 0.27, 0.05, 0.3);
      break;
    }
    case 'chair': {
      F.box(b, 'oak', 0.03, W - 0.03, 0.40, 0.45, 0.05, Dp - 0.03);
      F.box(b, 'cane', 0.06, W - 0.06, 0.45, 0.46, 0.1, Dp - 0.06);
      for (const u of [0.03, W - 0.07]) for (const v of [0.05, Dp - 0.07]) F.box(b, 'oak', u, u + 0.04, 0, 0.42, v, v + 0.04);
      F.box(b, 'oak', 0.03, W - 0.03, 0.42, f.h, 0.05, 0.1);
      F.box(b, 'cane', 0.08, W - 0.08, 0.5, f.h - 0.06, 0.07, 0.08);
      for (const u of [0.03, W - 0.07]) F.box(b, 'oak', u, u + 0.04, 0.6, 0.64, 0.05, Dp - 0.05);
      break;
    }
    case 'cabinet': {
      F.box(b, 'teak', 0, W, 0.06, f.h, 0, Dp);
      F.box(b, 'teakDark', 0.02, W - 0.02, 0, 0.06, 0.02, Dp - 0.02);
      for (let i = 0; i < 3; i++) F.box(b, 'teakDark', 0.03 + (i * (W - 0.06)) / 3, 0.03 + ((i + 1) * (W - 0.06)) / 3 - 0.02, 0.12, f.h - 0.08, Dp, Dp + 0.01);
      F.cyl(b, 'brass', W * 0.3, Dp / 2, 0.07, f.h, f.h + 0.03, 14);
      F.cyl(b, 'brass', W * 0.3, Dp / 2, 0.015, f.h + 0.03, f.h + 0.55, 8);
      F.cyl(b, 'brass', W * 0.3, Dp / 2, 0.09, f.h + 0.55, f.h + 0.57, 14, 0.07);
      F.cyl(b, 'flame', W * 0.3 + 0.06, Dp / 2, 0.008, f.h + 0.57, f.h + 0.6, 6, 0.001);
      F.cyl(b, 'copper', W * 0.75, Dp / 2, 0.09, f.h, f.h + 0.2, 14, 0.06);
      break;
    }
    case 'bookseat': {
      F.box(b, 'teak', 0, W, 0, 0.36, 0, Dp);
      F.box(b, 'fabricIndigo', 0.02, W - 0.02, 0.36, f.h, 0.02, Dp - 0.02);
      F.box(b, 'cushion', 0.1, 0.5, f.h, f.h + 0.3, 0.02, 0.14);
      break;
    }
    case 'bookshelf': {
      F.box(b, 'teak', 0, W, 0, f.h, 0, 0.02);
      for (const u of [0, W - 0.03]) F.box(b, 'teak', u, u + 0.03, 0, f.h, 0, Dp);
      for (let k = 0; k <= 5; k++) F.box(b, 'teak', 0.03, W - 0.03, k * (f.h / 5) - (k ? 0.025 : 0), k * (f.h / 5) + (k ? 0 : 0.03), 0.02, Dp);
      const [ax, az] = F.P(0.03, Dp - 0.04), [cx, cz] = F.P(W - 0.03, Dp - 0.04);
      const g = new THREE.PlaneGeometry(Math.hypot(cx - ax, cz - az), f.h - 0.08);
      const dir = [cx - ax, cz - az], L = Math.hypot(dir[0], dir[1]);
      g.rotateY(Math.atan2(-dir[1] / L, dir[0] / L));
      g.translate((ax + cx) / 2, y + f.h / 2, (az + cz) / 2);
      b.addRaw('books', g);
      break;
    }
    case 'altar': {
      F.box(b, 'graniteBlack', 0, W, 0, f.h, 0, Dp);
      F.box(b, 'teak', 0.05, W - 0.05, f.h, f.h + 0.08, 0.02, Dp * 0.5);
      for (const [u, s] of [[W * 0.3, 0.75], [W * 0.5, 1], [W * 0.7, 0.75]]) {
        F.cyl(b, 'idol', u, Dp * 0.26, 0.045 * s, f.h + 0.08, f.h + 0.08 + 0.22 * s, 10, 0.03 * s);
        F.cyl(b, 'idol', u, Dp * 0.26, 0.035 * s, f.h + 0.08 + 0.22 * s, f.h + 0.08 + 0.3 * s, 10, 0.012);
      }
      for (const u of [0.08, W - 0.08]) {
        F.cyl(b, 'brass', u, Dp * 0.75, 0.06, f.h, f.h + 0.02, 12);
        F.cyl(b, 'brass', u, Dp * 0.75, 0.012, f.h + 0.02, f.h + 0.42, 8);
        F.cyl(b, 'brass', u, Dp * 0.75, 0.07, f.h + 0.42, f.h + 0.44, 12, 0.055);
        F.cyl(b, 'flame', u + 0.05, Dp * 0.75, 0.008, f.h + 0.44, f.h + 0.47, 6, 0.001);
      }
      for (let i = 0; i < 9; i++) F.cyl(b, i % 2 ? 'marigold' : 'jasmine', W * (0.15 + i * 0.087), Dp * 0.55, 0.025, f.h, f.h + 0.04, 8);
      F.box(b, 'teak', 0, W, 1.75, 1.82, 0, Dp * 0.6);
      break;
    }
    case 'sidetable': {
      F.box(b, 'oak', 0, W, f.h - 0.04, f.h, 0, Dp);
      for (const u of [0.02, W - 0.06]) for (const v of [0.02, Dp - 0.06]) F.box(b, 'frameDark', u, u + 0.03, 0, f.h - 0.04, v, v + 0.03);
      F.box(b, 'oak', 0.03, W - 0.03, 0.12, 0.15, 0.03, Dp - 0.03);
      F.cyl(b, 'brass', W / 2, Dp / 2, 0.05, f.h, f.h + 0.03, 12);
      F.cyl(b, 'brass', W / 2, Dp / 2, 0.01, f.h + 0.03, f.h + 0.3, 8);
      F.cyl(b, 'white', W / 2, Dp / 2, 0.11, f.h + 0.28, f.h + 0.45, 14, 0.07);
      break;
    }
    case 'counter': {
      const cab = f.level === 'terrace' ? 'concrete' : 'cabinetSage', top = f.level === 'terrace' ? 'kadappa' : 'quartz';
      F.box(b, cab, 0, W, 0.1, f.h - 0.04, 0, Dp - 0.04);
      F.box(b, 'frameDark', 0, W, 0, 0.1, 0.02, Dp - 0.08);
      F.box(b, top, 0, W, f.h - 0.04, f.h, 0, Dp);
      const n = Math.max(1, Math.round(W / 0.55));
      for (let i = 0; i < n; i++) F.box(b, cab, (W / n) * i + 0.003, (W / n) * (i + 1) - 0.003, 0.12, f.h - 0.06, Dp - 0.04, Dp - 0.022);
      if (f.level !== 'terrace') F.box(b, 'bathTile', 0, W, f.h, f.h + 0.6, 0, 0.012);
      // Map a world range along the counter's length to the frame's u axis.
      const toU = ([a, c]) => (back === 'E' ? a - f.z0 : back === 'W' ? f.z1 - c : back === 'N' ? a - f.x0 : f.x1 - c);
      if (f.sink) {
        const u0 = toU(f.sink), u1 = u0 + (f.sink[1] - f.sink[0]);
        F.box(b, 'steel', u0 + 0.05, u1 - 0.05, f.h - 0.2, f.h + 0.003, 0.12, Dp - 0.1);
        F.cyl(b, 'steel', (u0 + u1) / 2, 0.07, 0.015, f.h, f.h + 0.32, 8);
        F.box(b, 'steel', (u0 + u1) / 2 - 0.012, (u0 + u1) / 2 + 0.012, f.h + 0.29, f.h + 0.315, 0.07, 0.24);
      }
      if (f.stove) {
        const u0 = toU(f.stove), u1 = u0 + (f.stove[1] - f.stove[0]);
        F.box(b, 'glassDark', u0, u1, f.h, f.h + 0.02, 0.1, Dp - 0.06);
        for (const k of [0.25, 0.75]) F.cyl(b, 'iron', u0 + (u1 - u0) * k, Dp / 2, 0.09, f.h + 0.02, f.h + 0.045, 14);
        F.cyl(b, 'brass', u0 + (u1 - u0) * 0.25, Dp / 2, 0.12, f.h + 0.045, f.h + 0.2, 14, 0.1);
        // Slim chimney hood; its duct rises to the high exhaust jaali.
        if (f.level !== 'terrace') {
          F.box(b, 'frameDark', u0 - 0.03, u1 + 0.03, 1.62, 1.70, 0, 0.5);
          F.box(b, 'frameDark', (u0 + u1) / 2 - 0.14, (u0 + u1) / 2 + 0.14, 1.70, 2.0, 0, 0.26);
        }
      }
      if (f.level !== 'terrace') {
        // Open oak shelf on the back wall, split around windows in that wall and the hood.
        const line = back === 'E' ? f.x1 : back === 'W' ? f.x0 : back === 'S' ? f.z1 : f.z0, gaps = [];
        if (f.stove) { const s0 = toU(f.stove); gaps.push([s0 - 0.08, s0 + (f.stove[1] - f.stove[0]) + 0.08]); }
        for (const w2 of WALLS) {
          if (w2.level !== f.level || (back === 'E' || back === 'W') === isHoriz(w2)) continue;
          if (Math.abs((isHoriz(w2) ? w2.a[1] : w2.a[0]) - line) > w2.t / 2 + 0.05) continue;
          for (const o of w2.openings) {
            if (o.type === 'door' || o.head < 1.5) continue;
            const sp = D.openingSpan(w2, o), k = isHoriz(w2) ? 0 : 1, a = Math.min(sp.p0[k], sp.p1[k]) - 0.05, c = Math.max(sp.p0[k], sp.p1[k]) + 0.05;
            const g0 = toU([a, c]);
            gaps.push([g0, g0 + (c - a)]);
          }
        }
        let u = 0;
        for (const [g0, g1] of [...gaps.sort((p, q) => p[0] - q[0]), [W, W]]) {
          const end = Math.min(g0, W);
          if (end - u > 0.35) {
            F.box(b, 'oak', u, end, 1.55, 1.59, 0, 0.3);
            const n = Math.floor((end - u) / 0.32);
            for (let i = 0; i < n; i++) F.cyl(b, i % 3 ? 'steel' : 'brass', u + 0.16 + i * 0.32, 0.15, 0.06, 1.58, 1.72, 12, 0.05);
          }
          u = Math.max(u, g1);
        }
      }
      break;
    }
    case 'fridge': {
      F.box(b, 'white', 0.02, W - 0.02, 0.02, f.h, 0, Dp - 0.04);
      F.box(b, 'white', 0.02, W - 0.02, f.h * 0.62, f.h, Dp - 0.04, Dp - 0.01);
      F.box(b, 'white', 0.02, W - 0.02, 0.05, f.h * 0.61, Dp - 0.04, Dp - 0.01);
      F.box(b, 'steel', W - 0.08, W - 0.06, f.h * 0.3, f.h * 0.55, Dp - 0.01, Dp + 0.02);
      F.box(b, 'steel', W - 0.08, W - 0.06, f.h * 0.66, f.h * 0.85, Dp - 0.01, Dp + 0.02);
      break;
    }
    case 'table': {
      F.box(b, 'teak', 0, W, f.h - 0.045, f.h, 0, Dp);
      for (const u of [0.05, W - 0.1]) for (const v of [0.05, Dp - 0.1]) F.box(b, 'teak', u, u + 0.05, 0, f.h - 0.045, v, v + 0.05);
      for (const [u, v, face] of [[W * 0.28, -0.32, 1], [W * 0.72, -0.32, 1], [W * 0.28, Dp + 0.32, -1], [W * 0.72, Dp + 0.32, -1]]) {
        const c0 = v - 0.21, c1 = v + 0.21;
        F.box(b, 'teak', u - 0.21, u + 0.21, 0.43, 0.47, Math.min(c0, c1), Math.max(c0, c1));
        for (const du of [-0.18, 0.15]) for (const dv of [-0.18, 0.15]) F.box(b, 'teak', u + du, u + du + 0.03, 0, 0.43, v + dv, v + dv + 0.03);
        const bv = face > 0 ? v - 0.21 : v + 0.18;
        F.box(b, 'teak', u - 0.21, u + 0.21, 0.47, 0.92, bv, bv + 0.03);
      }
      F.cyl(b, 'brass', W / 2, Dp / 2, 0.12, f.h, f.h + 0.05, 16, 0.14);
      break;
    }
    case 'desk': {
      F.box(b, 'oak', 0, W, f.h - 0.04, f.h, 0, Dp);
      for (const u of [0, W - 0.03]) F.box(b, 'oak', u, u + 0.03, 0, f.h - 0.04, 0, Dp);
      F.box(b, 'fabricSage', W * 0.25, W * 0.75, 0.4, 0.46, Dp + 0.18, Dp + 0.58);
      F.box(b, 'frameDark', W * 0.48, W * 0.52, 0, 0.4, Dp + 0.36, Dp + 0.4);
      F.box(b, 'books', 0.05, 0.4, f.h, f.h + 0.25, 0.02, 0.2);
      break;
    }
    case 'shower': {
      F.box(b, 'kota', 0, W, -0.004, 0.012, 0, Dp);
      F.cyl(b, 'steel', W / 2, 0.04, 0.012, 0.012, 2.05, 8);
      F.cyl(b, 'steel', W / 2, 0.12, 0.07, 2.02, 2.05, 14);
      F.cyl(b, 'brass', W * 0.25, Dp * 0.6, 0.15, 0.012, 0.36, 14, 0.17);
      break;
    }
    case 'wc': {
      F.box(b, 'porcelain', W * 0.15, W * 0.85, 0, 0.38, 0.18, Dp - 0.06);
      F.box(b, 'porcelain', W * 0.1, W * 0.9, 0.38, 0.42, 0.16, Dp - 0.02);
      F.box(b, 'porcelain', W * 0.12, W * 0.88, 0.3, 0.75, 0, 0.18);
      break;
    }
    case 'basin': {
      F.box(b, 'graniteBlack', 0, W, f.h - 0.04, f.h, 0, Dp);
      F.box(b, 'porcelain', W * 0.15, W * 0.85, f.h - 0.16, f.h + 0.01, 0.06, Dp - 0.06);
      F.box(b, 'mirror', 0.02, W - 0.02, 1.25, 1.85, 0, 0.012);
      F.cyl(b, 'steel', W / 2, 0.05, 0.012, f.h, f.h + 0.2, 8);
      break;
    }
    case 'thinnai': {
      F.box(b, 'concreteBoard', 0, W, 0, f.h - 0.06, 0.04, Dp);
      F.box(b, 'graniteBlack', -0.02, W + 0.02, f.h - 0.06, f.h, 0.02, Dp + 0.04);
      F.box(b, 'granite', 0, W, 0, 0.08, Dp, Dp + 0.03);
      F.box(b, 'fabricRust', 0.25, 0.75, f.h, f.h + 0.06, 0.08, Dp - 0.06);
      break;
    }
    case 'waterpot': {
      F.box(b, 'granite', 0, W, 0, 0.12, 0, Dp);
      F.box(b, 'kota', 0.04, W - 0.04, 0.12, 0.14, 0.04, Dp - 0.04);
      F.cyl(b, 'granite', W * 0.75, Dp / 2, 0.06, 0.14, 0.95, 10);
      F.box(b, 'brass', W * 0.75 - 0.012, W * 0.75 + 0.012, 0.82, 0.85, Dp / 2, Dp / 2 + 0.16);
      const lathe = new THREE.LatheGeometry([[0.0, 0], [0.11, 0.02], [0.16, 0.12], [0.15, 0.22], [0.07, 0.3], [0.06, 0.34], [0.09, 0.36]].map(([r, h]) => new THREE.Vector2(r, h)), 18);
      const [px, pz] = F.P(W * 0.3, Dp / 2);
      lathe.translate(px, y + 0.14, pz);
      b.add('brass', worldUV(lathe));
      break;
    }
    case 'scooter': {
      const along = (f.x1 - f.x0) > (f.z1 - f.z0);
      const L = along ? f.x1 - f.x0 : f.z1 - f.z0, cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
      const P = (s, n) => (along ? [cx + s, cz + n] : [cx + n, cz + s]);
      for (const s of [-L / 2 + 0.25, L / 2 - 0.25]) {
        const g = new THREE.TorusGeometry(0.2, 0.06, 8, 18);
        if (along) g.rotateY(0); else g.rotateY(Math.PI / 2);
        const [x, z] = P(s, 0);
        g.translate(x, y + 0.26, z);
        b.add('rubber', worldUV(g));
      }
      const pts = [[-L / 2 + 0.2, 0.35, 0.18], [L / 2 - 0.45, 0.3, 0.16], [L / 2 - 0.3, 0.85, 0.12], [-L / 2 + 0.15, 0.62, 0.16]];
      for (const [s0, hgt, half] of pts) { const [x, z] = P(s0, 0); b.box('paintRed', x - (along ? 0.18 : half), x + (along ? 0.18 : half), y + hgt - 0.12, y + hgt + 0.12, z - (along ? half : 0.18), z + (along ? half : 0.18)); }
      const [sx, sz] = P(-L / 2 + 0.45, 0);
      b.box('rubber', sx - (along ? 0.3 : 0.14), sx + (along ? 0.3 : 0.14), y + 0.72, y + 0.8, sz - (along ? 0.14 : 0.3), sz + (along ? 0.14 : 0.3));
      const [hx, hz] = P(L / 2 - 0.3, 0);
      b.box('steel', hx - (along ? 0.02 : 0.32), hx + (along ? 0.02 : 0.32), y + 1.0, y + 1.03, hz - (along ? 0.32 : 0.02), hz + (along ? 0.32 : 0.02));
      break;
    }
    case 'cycle': {
      const along = (f.x1 - f.x0) > (f.z1 - f.z0), L = along ? f.x1 - f.x0 : f.z1 - f.z0, cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
      const P = (s) => (along ? [cx + s, cz] : [cx, cz + s]);
      for (const s of [-L / 2 + 0.34, L / 2 - 0.34]) {
        const g = new THREE.TorusGeometry(0.32, 0.018, 6, 24);
        if (!along) g.rotateY(Math.PI / 2);
        const [x, z] = P(s);
        g.translate(x, y + 0.34, z);
        b.add('rubber', worldUV(g));
      }
      const seg = (s0, y0, s1, y1) => { const a = P(s0), c = P(s1); const g = new THREE.CylinderGeometry(0.014, 0.014, Math.hypot(s1 - s0, y1 - y0), 6); g.rotateZ(Math.atan2(s1 - s0, y1 - y0) * -1); if (!along) g.rotateY(Math.PI / 2); g.translate((a[0] + c[0]) / 2, y + (y0 + y1) / 2, (a[1] + c[1]) / 2); b.add('paintRed', worldUV(g)); };
      seg(-L / 2 + 0.34, 0.34, -0.05, 0.36); seg(-0.05, 0.36, 0.25, 0.8); seg(-L / 2 + 0.34, 0.34, -0.12, 0.82); seg(-0.12, 0.82, 0.3, 0.8); seg(0.3, 0.8, L / 2 - 0.34, 0.34); seg(0.3, 0.8, 0.32, 0.98);
      break;
    }
    case 'tulsi': {
      F.box(b, 'concreteBoard', 0, W, 0, 0.12, 0, Dp);
      F.box(b, 'kolam', 0.05, W - 0.05, 0.12, 0.62, 0.05, Dp - 0.05);
      F.box(b, 'concreteBoard', 0.02, W - 0.02, 0.62, 0.72, 0.02, Dp - 0.02);
      F.box(b, 'soil', 0.06, W - 0.06, 0.72, 0.74, 0.06, Dp - 0.06);
      const [x, z] = F.P(W / 2, Dp / 2);
      leafClump(b, 'tulsi', x, y + 0.92, z, 0.42, 0.3);
      leafClump(b, 'tulsi', x + 0.05, y + 1.08, z - 0.03, 0.3, 1.1);
      break;
    }
    case 'uruli': {
      const lathe = new THREE.LatheGeometry([[0, 0], [0.14, 0.01], [0.28, 0.08], [0.34, 0.18], [0.36, 0.22], [0.33, 0.23]].map(([r, h]) => new THREE.Vector2(r, h)), 28);
      const [x, z] = F.P(W / 2, Dp / 2);
      lathe.translate(x, y - 0.06, z);
      b.add('brass', worldUV(lathe));
      b.add('water', cylG(x, z, 0.32, y + 0.12, y + 0.135, 24));
      for (let i = 0; i < 7; i++) { const a = i * 0.9; b.add(i % 2 ? 'marigold' : 'jasmine', cylG(x + Math.cos(a) * 0.16, z + Math.sin(a) * 0.16, 0.035, y + 0.135, y + 0.15, 8)); }
      break;
    }
    case 'store': {
      F.box(b, 'teak', 0, W, 0, f.h, 0, Dp);
      const n = Math.max(1, Math.round(W / 0.6));
      for (let i = 0; i < n; i++) F.box(b, 'teakDark', (W / n) * i + 0.03, (W / n) * (i + 1) - 0.03, 0.06, f.h - 0.06, Dp, Dp + 0.01);
      break;
    }
    case 'washer': {
      F.box(b, 'white', 0, W, 0, f.h, 0, Dp);
      const [x, z] = F.P(W / 2, Dp + 0.005);
      const g = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24);
      if (back === 'N' || back === 'S') g.rotateX(Math.PI / 2); else g.rotateZ(Math.PI / 2);
      g.translate(x, y + f.h * 0.48, z);
      b.add('glassDark', worldUV(g));
      break;
    }
    case 'bar': {
      // Breakfast counter = the U's seating leg. Back (v = 0) faces the cook; the
      // 300 mm overhang and the stools face the family space and the court.
      const base = 0.6, top = f.h, seatV = Dp - 0.2;
      F.box(b, 'oak', 0, W, 0.1, top - 0.04, 0, base);
      F.box(b, 'frameDark', 0, W, 0, 0.1, 0.02, base - 0.02);
      F.box(b, 'quartz', 0, W, top - 0.04, top, -0.02, base + 0.3);
      const n = Math.max(2, Math.round(W / 0.5));
      for (let i = 0; i < n; i++) F.box(b, 'cabinetSage', (W / n) * i + 0.003, (W / n) * (i + 1) - 0.003, 0.12, top - 0.06, -0.015, 0);
      F.box(b, 'oak', 0, W, 0.1, top - 0.04, base, base + 0.015);
      for (let i = 0; i < (f.stools || 3); i++) {
        const u = (W * (i + 0.5)) / (f.stools || 3);
        F.cyl(b, 'steel', u, seatV, 0.16, 0, 0.02, 16);
        F.cyl(b, 'steel', u, seatV, 0.025, 0.02, 0.62, 8);
        F.cyl(b, 'oak', u, seatV, 0.17, 0.62, 0.66, 18);
        F.cyl(b, 'steel', u, seatV, 0.13, 0.24, 0.255, 14);
        // Pendant over the counter: cord from the ceiling, dark cone shade, warm bulb.
        const ceil = LEVELS.terrace - SLAB - y, pv = base * 0.55;
        F.cyl(b, 'frameDark', u, pv, 0.004, 1.95, ceil, 6);
        F.cyl(b, 'frameDark', u, pv, 0.16, 1.72, 1.95, 18, 0.03);
        F.cyl(b, 'flame', u, pv, 0.05, 1.69, 1.74, 10);
      }
      break;
    }
    case 'poojaunit': {
      // Closed teak pooja cabinet: storage below, a lit niche with the idols facing
      // `face`, jaali doors folded open, and a stepped crown.
      F.box(b, 'oak', 0, W, 0.06, 0.78, 0, Dp);
      F.box(b, 'frameDark', 0.02, W - 0.02, 0, 0.06, 0.02, Dp - 0.02);
      for (const [u0, u1] of [[0.03, W / 2 - 0.01], [W / 2 + 0.01, W - 0.03]]) F.box(b, 'oak', u0, u1, 0.12, 0.72, Dp, Dp + 0.012);
      for (const u of [W / 2 - 0.06, W / 2 + 0.04]) F.box(b, 'brass', u, u + 0.02, 0.4, 0.55, Dp + 0.012, Dp + 0.03);
      F.box(b, 'graniteBlack', 0, W, 0.78, 1.62, 0, 0.04);
      for (const u of [0, W - 0.05]) F.box(b, 'oak', u, u + 0.05, 0.78, 1.62, 0, Dp);
      F.box(b, 'oak', 0, W, 1.62, 1.70, 0, Dp);
      F.box(b, 'flame', 0.06, W - 0.06, 1.595, 1.605, 0.06, 0.09);
      F.box(b, 'oak', 0.04, W - 0.04, 1.70, f.h, 0.02, Dp - 0.3);
      for (const [u, s] of [[W * 0.3, 0.75], [W * 0.5, 1], [W * 0.7, 0.75]]) {
        F.cyl(b, 'idol', u, 0.16, 0.045 * s, 0.8, 0.8 + 0.22 * s, 10, 0.03 * s);
        F.cyl(b, 'idol', u, 0.16, 0.035 * s, 0.8 + 0.22 * s, 0.8 + 0.3 * s, 10, 0.012);
      }
      for (const u of [0.12, W - 0.12]) {
        F.cyl(b, 'brass', u, Dp * 0.62, 0.05, 0.78, 0.8, 12);
        F.cyl(b, 'brass', u, Dp * 0.62, 0.01, 0.8, 1.12, 8);
        F.cyl(b, 'brass', u, Dp * 0.62, 0.06, 1.12, 1.14, 12, 0.045);
        F.cyl(b, 'flame', u + 0.04, Dp * 0.62, 0.007, 1.14, 1.17, 6, 0.001);
      }
      for (let i = 0; i < 7; i++) F.cyl(b, i % 2 ? 'marigold' : 'jasmine', W * (0.2 + i * 0.1), Dp * 0.45, 0.022, 0.78, 0.815, 8);
      // Jaali doors, folded back against the cabinet sides.
      for (const [u0, sgn] of [[0, -1], [W, 1]]) {
        const [ax, az] = F.P(u0, Dp), [cx, cz] = F.P(u0 + sgn * 0.02, Dp + W / 2 - 0.04);
        b.box('jaaliTeak', Math.min(ax, cx), Math.max(ax, cx), y + 0.8, y + 1.6, Math.min(az, cz), Math.max(az, cz));
      }
      F.cyl(b, 'brass', W / 2, Dp * 0.5, 0.05, 1.42, 1.56, 12, 0.02);
      break;
    }
    case 'car': {
      // A compact hatchback parked nose-in (nose = +x when the bay runs east–west).
      const along = (f.x1 - f.x0) > (f.z1 - f.z0);
      const L = (along ? f.x1 - f.x0 : f.z1 - f.z0) - 0.1, Wd = (along ? f.z1 - f.z0 : f.x1 - f.x0) - 0.05, cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
      const bx = (s0, s1, y0, y1, n0, n1, key) => {
        const a = along ? [cx + s0, cz + n0] : [cx + n0, cz + s0], c = along ? [cx + s1, cz + n1] : [cx + n1, cz + s1];
        b.box(key, Math.min(a[0], c[0]), Math.max(a[0], c[0]), y + y0, y + y1, Math.min(a[1], c[1]), Math.max(a[1], c[1]));
      };
      const hL = L / 2, hW = Wd / 2;
      for (const s of [-hL + 0.75, hL - 0.8]) for (const n of [-hW + 0.13, hW - 0.13]) {
        const g = new THREE.CylinderGeometry(0.31, 0.31, 0.2, 20);
        g.rotateX(Math.PI / 2);
        if (!along) g.rotateY(Math.PI / 2);
        const p = along ? [cx + s, cz + n] : [cx + n, cz + s];
        g.translate(p[0], y + 0.31, p[1]);
        b.add('rubber', worldUV(g));
        const r = new THREE.CylinderGeometry(0.19, 0.19, 0.205, 14);
        r.rotateX(Math.PI / 2);
        if (!along) r.rotateY(Math.PI / 2);
        r.translate(p[0], y + 0.31, p[1]);
        b.add('steel', worldUV(r));
      }
      bx(-hL + 0.05, hL - 0.05, 0.16, 0.28, -hW + 0.2, hW - 0.2, 'iron');
      bx(-hL, hL, 0.28, 0.82, -hW, hW, 'white');
      bx(hL - 1.15, hL - 0.05, 0.82, 0.9, -hW + 0.04, hW - 0.04, 'white');
      bx(-hL + 0.25, hL - 1.15, 0.82, 1.38, -hW + 0.06, hW - 0.06, 'glassDark');
      bx(-hL + 0.35, hL - 1.35, 1.38, 1.46, -hW + 0.1, hW - 0.1, 'white');
      for (const s of [-hL + 0.28, -0.2, hL - 1.2]) bx(s, s + 0.08, 0.82, 1.4, -hW + 0.05, hW - 0.05, 'white');
      for (const sgn of [-1, 1]) {
        bx(hL - 0.02, hL + 0.01, 0.6, 0.72, sgn > 0 ? hW - 0.32 : -hW + 0.08, sgn > 0 ? hW - 0.08 : -hW + 0.32, 'porcelain');
        bx(-hL - 0.01, -hL + 0.02, 0.62, 0.76, sgn > 0 ? hW - 0.3 : -hW + 0.06, sgn > 0 ? hW - 0.06 : -hW + 0.3, 'paintRed');
      }
      bx(hL - 0.02, hL + 0.05, 0.28, 0.44, -hW + 0.02, hW - 0.02, 'iron');
      bx(-hL - 0.05, -hL + 0.02, 0.28, 0.44, -hW + 0.02, hW - 0.02, 'iron');
      break;
    }
    default:
      F.box(b, 'teak', 0, W, 0, f.h, 0, Dp);
  }
}

// --------------------------------------------------------------- plants ----
function buildFrangipani(b) {
  const { x, z, h, canopy } = D.COURT_TREE, y = -0.10;
  b.add('barkSmooth', cylG(x, z, 0.075, y, y + 2.3, 10, 0.06));
  const tips = [];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.4, r = canopy * 0.7, tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r, ty = y + h - 0.35 - (i % 2) * 0.45;
    const p0 = new THREE.Vector3(x, y + 2.25, z), p1 = new THREE.Vector3(tx, ty, tz);
    const len = p0.distanceTo(p1), g = new THREE.CylinderGeometry(0.03, 0.05, len, 8);
    g.translate(0, len / 2, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize())));
    g.translate(p0.x, p0.y, p0.z);
    b.add('barkSmooth', worldUV(g));
    tips.push([tx, ty, tz]);
  }
  for (const [tx, ty, tz] of tips) { leafClump(b, 'frangipani', tx, ty + 0.15, tz, 0.95, tx); leafClump(b, 'frangipani', tx * 0.9 + x * 0.1, ty - 0.2, tz * 0.9 + z * 0.1, 0.7, tz); }
}
function buildPalm(b) {
  const { x, z, h } = D.PALM;
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0, z), new THREE.Vector3(x - 0.1, h * 0.4, z + 0.05), new THREE.Vector3(x - 0.35, h * 0.8, z + 0.12), new THREE.Vector3(x - 0.5, h, z + 0.15)]);
  const trunk = new THREE.TubeGeometry(curve, 24, 0.16, 10, false);
  b.addRaw('bark', trunk);
  const top = curve.getPoint(1);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, L = 3.0 + (i % 3) * 0.3, droop = 0.45 + (i % 4) * 0.15, seg = 10;
    const g = new THREE.PlaneGeometry(L, L / 4, seg, 1), p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const u = (p.getX(k) + L / 2) / L;
      p.setXYZ(k, u * L, -droop * u * u * L * 0.5 + 0.3 * u, p.getY(k));
    }
    g.rotateX(-0.15 * (i % 2 ? 1 : -1));
    g.rotateY(a);
    g.translate(top.x, top.y, top.z);
    g.computeVertexNormals();
    b.addRaw('frond', g);
  }
  for (let i = 0; i < 6; i++) { const a = i * 1.05; const s = new THREE.SphereGeometry(0.11, 8, 6); s.translate(top.x + Math.cos(a) * 0.18, top.y - 0.25, top.z + Math.sin(a) * 0.18); b.addRaw('trunk', s); }
}

// -------------------------------------------------------------- world ----
export function buildWorld(M) {
  const B = { site: new Batch('site'), L0: new Batch('L0'), L1: new Batch('L1'), L2: new Batch('L2'), F0: new Batch('F0'), F1: new Batch('F1'), F2: new Batch('F2') };
  const lvlBatch = (lvl) => (lvl === 'ground' ? B.L0 : lvl === 'first' ? B.L1 : B.L2);
  const furnBatch = (lvl) => (lvl === 'ground' ? B.F0 : lvl === 'first' ? B.F1 : B.F2);
  const dyn = { swings: [] };
  const yF = LEVELS.first, yT = LEVELS.terrace;
  const RUNS = D.STAIR_RUNS, lane = STAIR.lane;

  // ---- site: surroundings, road, plot ground, paving ----
  const V = PLOT.vertices;
  B.site.box('grass', -40, 40, -0.26, -0.2, -30, 30);
  {
    // Footpath and road along the straight west boundary.
    const footW = 1.2;
    for (const [off, w, key, y] of [[0, footW, 'kota', -0.03], [footW, ROAD.width, 'asphalt', -ROAD.drop]]) {
      const p0 = [V[3][0] - off - w / 2, V[3][1]], p1 = [V[0][0] - off - w / 2, V[0][1]];
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, ext = 25;
      B.site.add(key, segBoxG([p0[0] - ux * ext, p0[1] - uz * ext], [p1[0] + ux * ext, p1[1] + uz * ext], y - 0.04, y, w));
    }
  }
  const cb = DRAINAGE.courtBasin;
  const cbOuter = { x0: cb.x0 - 0.12, x1: cb.x1 + 0.12, z0: cb.z0 - 0.12, z1: cb.z1 + 0.12 };
  {
    // Plot ground with a hole for the recessed court rain garden.
    const sh = new THREE.Shape(V.map(([x, z]) => new THREE.Vector2(x, -z)));
    sh.holes.push(new THREE.Path([[cbOuter.x0, -cbOuter.z0], [cbOuter.x0, -cbOuter.z1], [cbOuter.x1, -cbOuter.z1], [cbOuter.x1, -cbOuter.z0]].map(([x, y]) => new THREE.Vector2(x, y))));
    const g = new THREE.ShapeGeometry(sh);
    g.rotateX(-Math.PI / 2);
    B.site.add('grass', worldUV(g));
  }
  // Stilt-level Kota paving under the house, cut for the court, the channels and the car bay.
  const carBay = ROOMS.find((r) => r.id === 'g-car');
  const channelHoles = DRAINAGE.channels.filter((c) => Math.abs(c.from[2] - c.to[2]) < 1e-6).map((c) => ({ x0: Math.min(c.from[0], c.to[0]) - 0.1, x1: Math.max(c.from[0], c.to[0]) + 0.1, z0: c.from[2] - c.w / 2 - 0.07, z1: c.from[2] + c.w / 2 + 0.07 }));
  for (const r of rectMinus({ x0: HOUSE.x0, x1: HOUSE.x1, z0: HOUSE.z0, z1: HOUSE.z1 }, [cbOuter, carBay, ...channelHoles])) B.site.box('kota', r.x0, r.x1, 0.0, 0.012, r.z0, r.z1);
  const xIn = D.boundaryX('W', 0) + COMPOUND.t;
  {
    // Driveway + car bay: exposed concrete between granite strips, straight in from the car gate.
    const cg = GATES.find((g) => g.type === 'sliding');
    B.site.box('concrete', xIn, carBay.x1, 0.0, 0.016, cg.z0, cg.z1);
    for (const z of [cg.z0, cg.z1 - 0.08]) B.site.box('granite', xIn, carBay.x1, 0.0, 0.02, z, z + 0.08);
    // Entrance path: large granite pavers from the front gate to the stair foot.
    const pg = GATES.find((g) => g.type === 'swing'), x1 = RUNS[0].f1.x0;
    for (let x = xIn + 0.04; x < x1 - 0.1; x += 0.66) B.site.box('granite', x, Math.min(x + 0.62, x1 - 0.02), 0.0, 0.022, pg.z0 + 0.02, pg.z1 - 0.1);
    B.site.box('graniteBlack', RUNS[0].foot[0], x1, 0.0, 0.024, lane.z0, lane.z1);
  }

  // ---- compound wall (smooth lime plaster, flat stone coping) and gate piers ----
  const gatesSouthFirst = [...GATES].sort((a, b) => b.z1 - a.z1);
  for (let i = 0; i < 4; i++) {
    const p = V[i], q = V[(i + 1) % 4], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const nIn = [-uz, ux];
    const off = (pt) => [pt[0] + nIn[0] * COMPOUND.t / 2, pt[1] + nIn[1] * COMPOUND.t / 2];
    const runs = [];
    if (i === 3) {
      // West (road) side runs south → north with an opening per gate.
      const at = (z) => [D.boundaryX('W', z), z];
      let cur = p;
      for (const G of gatesSouthFirst) {
        runs.push([cur, at(G.z1 + G.pierW)]);
        cur = at(G.z0 - G.pierW);
        for (const [za, zb] of [[G.z0 - G.pierW, G.z0], [G.z1, G.z1 + G.pierW]]) {
          const a = off(at(za)), c = off(at(zb));
          B.site.add('concreteBoard', segBoxG(a, c, -0.26, G.pierH, COMPOUND.t + 0.1));
          B.site.add('graniteBlack', segBoxG([a[0], a[1] + 0.02], [c[0], c[1] - 0.02], G.pierH, G.pierH + 0.05, COMPOUND.t + 0.16));
        }
        B.site.add('granite', segBoxG(off(at(G.z0)), off(at(G.z1)), -0.26, 0.03, COMPOUND.t + 0.1));
      }
      runs.push([cur, q]);
      // House name plate and a low wall light on the front-gate pier.
      const pg = GATES.find((g) => g.type === 'swing'), pz = pg.z0 - pg.pierW / 2, px = D.boundaryX('W', pz);
      B.site.box('brass', px - 0.07, px - 0.06, 1.05, 1.30, pz - 0.11, pz + 0.11);
      B.site.box('frameDark', px - 0.07, px - 0.05, 1.45, 1.53, pz - 0.05, pz + 0.05);
    } else runs.push([p, q]);
    for (const [a, c] of runs) {
      B.site.add('limeExt', segBoxG(off(a), off(c), -0.26, COMPOUND.h, COMPOUND.t));
      addCoping(B.site, off(a), off(c), COMPOUND.h, COMPOUND.t);
    }
  }

  // ---- drainage: court rain garden, channels, silt trap, recharge pit ----
  B.site.box('soil', cb.x0, cb.x1, cb.floor - 0.05, cb.floor, cb.z0, cb.z1);
  {
    const [wx, wy, wz] = cb.weir, kt = 0.12;
    const weirSide = Math.abs(wx - cb.x0) < 0.01 ? 'W' : Math.abs(wx - cb.x1) < 0.01 ? 'E' : Math.abs(wz - cb.z0) < 0.01 ? 'N' : 'S';
    const kerbs = { N: [cb.x0 - kt, cb.x1 + kt, cb.z0 - kt, cb.z0], S: [cb.x0 - kt, cb.x1 + kt, cb.z1, cb.z1 + kt], W: [cb.x0 - kt, cb.x0, cb.z0, cb.z1], E: [cb.x1, cb.x1 + kt, cb.z0, cb.z1] };
    for (const [side, [x0, x1, z0, z1]] of Object.entries(kerbs)) {
      if (side !== weirSide) { B.site.box('granite', x0, x1, cb.floor, cb.kerbTop, z0, z1); continue; }
      if (side === 'W' || side === 'E') {
        B.site.box('granite', x0, x1, cb.floor, cb.kerbTop, z0, wz - 0.12);
        B.site.box('granite', x0, x1, cb.floor, cb.kerbTop, wz + 0.12, z1);
        B.site.box('granite', x0, x1, cb.floor, wy, wz - 0.12, wz + 0.12);
      } else {
        B.site.box('granite', x0, wx - 0.12, cb.floor, cb.kerbTop, z0, z1);
        B.site.box('granite', wx + 0.12, x1, cb.floor, cb.kerbTop, z0, z1);
        B.site.box('granite', wx - 0.12, wx + 0.12, cb.floor, wy, z0, z1);
      }
    }
  }
  for (let i = 0; i < 46; i++) {
    const a = i * 2.39996, r = 0.25 + ((i * 37) % 100) / 100 * 1.1;
    const px = (cb.x0 + cb.x1) / 2 + Math.cos(a) * r * 0.95, pz = (cb.z0 + cb.z1) / 2 + Math.sin(a) * r * 0.95;
    if (px < cb.x0 + 0.08 || px > cb.x1 - 0.08 || pz < cb.z0 + 0.08 || pz > cb.z1 - 0.08) continue;
    B.site.add('granite', cylG(px, pz, 0.035 + (i % 3) * 0.015, cb.floor, cb.floor + 0.03, 7));
  }
  for (const [px, pz, s] of [[cb.x0 + 0.35, cb.z0 + 0.3, 0.5], [cb.x1 - 0.3, cb.z0 + 0.35, 0.55], [cb.x0 + 0.3, cb.z1 - 0.45, 0.45], [cb.x1 - 0.35, cb.z1 - 0.25, 0.4]]) leafClump(B.site, 'leafDark', px, cb.floor + s * 0.45, pz, s, px * 3);
  for (const c of DRAINAGE.channels) addChannel(B.site, c);
  const st = DRAINAGE.siltTrap;
  B.site.box('granite', st.x - st.size / 2 - 0.05, st.x + st.size / 2 + 0.05, -0.03, 0.012, st.z - st.size / 2 - 0.05, st.z + st.size / 2 + 0.05);
  {
    const g = new THREE.PlaneGeometry(st.size, st.size); g.rotateX(-Math.PI / 2); g.translate(st.x, 0.014, st.z);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * st.size, uv.getY(i) * st.size);
    B.site.addRaw('grating', g);
  }
  const pit = DRAINAGE.rechargePit;
  B.site.add('granite', cylG(pit.x, pit.z, pit.r + 0.08, -0.04, 0.014, 28));
  {
    const g = new THREE.CircleGeometry(pit.r - 0.02, 28); g.rotateX(-Math.PI / 2); g.translate(pit.x, 0.016, pit.z);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * pit.r * 2, uv.getY(i) * pit.r * 2);
    B.site.addRaw('grating', g);
    B.site.add('gravel', cylG(pit.x, pit.z, pit.r - 0.03, -0.12, -0.08, 24));
  }
  // North-east garden (the extended corner): stepping stones and planting around the pit.
  for (const [px, pz, s] of [[7.9, -4.2, 0.7], [8.2, -3.5, 0.55], [7.2, -2.2, 0.5], [7.6, -0.6, 0.6]]) leafClump(B.site, 'leaf', px, s * 0.45, pz, s, px + pz);

  // ---- columns (stilts) and beams ----
  for (const c of COLUMNS) {
    if (c.round) {
      // The one expressed column: round, fair-faced concrete, visible on both floors.
      B.L0.add('concrete', cylG(c.x, c.z, c.w / 2, 0, yF - D.BEAM.d, 28));
      B.L1.add('concrete', cylG(c.x, c.z, c.w / 2, yF, yT - D.BEAM.d, 28));
      B.L0.add('graniteBlack', cylG(c.x, c.z, c.w / 2 + 0.03, 0, 0.06, 28));
      continue;
    }
    const w = c.w + 0.006, d = c.d + 0.006;
    B.L0.box('graniteBlack', c.x - w / 2 - 0.02, c.x + w / 2 + 0.02, 0, 0.08, c.z - d / 2 - 0.02, c.z + d / 2 + 0.02);
    B.L0.box('concrete', c.x - w / 2, c.x + w / 2, 0.08, yF - D.BEAM.d, c.z - d / 2, c.z + d / 2);
  }
  // Exposed concrete under the first floor (the stilt ceiling); plastered beams indoors.
  for (const bm of BEAMS) lvlBatch(bm.level === 'first' ? 'first' : 'terrace').box(bm.level === 'first' ? 'concrete' : 'lime', bm.x0 - 0.008, bm.x1 + 0.008, bm.y0, bm.y1 - 0.004, bm.z0 - 0.008, bm.z1 + 0.008);

  // ---- slabs, balcony, floor finishes, terrace surface ----
  for (const r of rectMinus(HOUSE, D.SLAB_OPENINGS.first)) B.L1.box('concrete', r.x0, r.x1, yF - SLAB, yF, r.z0, r.z1);
  for (const r of rectMinus(HOUSE, D.SLAB_OPENINGS.terrace)) B.L2.box('lime', r.x0, r.x1, yT - SLAB, yT, r.z0, r.z1);
  // West balcony: cantilevered deck (teak boards) and a thin concrete frame roof.
  B.L1.box('concrete', BALCONY.x0, BALCONY.x1, yF - SLAB, yF, BALCONY.z0, BALCONY.z1);
  for (let z = BALCONY.z0 + 0.06; z < BALCONY.z1 - 0.07; z += 0.14) B.L1.box('teak', BALCONY.x0 + 0.06, BALCONY.x1, yF, yF + 0.02, z, Math.min(z + 0.13, BALCONY.z1 - 0.06));
  B.L2.box('limeExt', BALCONY.x0, BALCONY.x1, yT - SLAB, yT + 0.06, BALCONY.z0, BALCONY.z1);
  B.L1.box('concreteBoard', BALCONY.x0, BALCONY.x1, yF, yT - SLAB, BALCONY.z1 - 0.15, BALCONY.z1);
  for (const [x0, x1, z0, z1, key] of [[3.75, 5.35, -3.60, -2.62, 'fabricLinen'], [-4.30, -1.90, 2.30, 4.35, 'fabricGrey'], [-1.25, 1.05, 2.35, 4.35, 'fabricSage'], [4.20, 6.30, 2.55, 4.45, 'fabricLinen']]) B.F1.box(key, x0, x1, yF + 0.016, yF + 0.026, z0, z1);
  addCoping(B.L2, [BALCONY.x0 + 0.04, BALCONY.z0], [BALCONY.x0 + 0.04, BALCONY.z1], yT + 0.06, 0.1);
  // One continuous Kota floor through the open half (foyer, hall, living, kitchen);
  // bedrooms and baths get their own finish on top (slightly thicker, so no z-fighting).
  for (const r of rectMinus({ x0: FACE.A, x1: FACE.D, z0: FACE.N, z1: FACE.S }, D.SLAB_OPENINGS.first)) B.L1.box('kotaSlab', r.x0, r.x1, yF, yF + 0.010, r.z0, r.z1);
  const finishOf = { bedroom: 'terrazzoWarm', dressing: 'terrazzoWarm', bath: 'bathTile' };
  for (const r of ROOMS) if (r.level === 'first' && finishOf[r.use]) B.L1.box(finishOf[r.use], r.x0, r.x1, yF, yF + 0.014, r.z0, r.z1);
  // Stair-head floor around the terrace opening.
  const tOpen = D.SLAB_OPENINGS.terrace.find((o) => o.id === 'stair');
  for (const r of rectMinus({ x0: MUMTY.x0 + 0.23, x1: MUMTY.x1 - 0.23, z0: lane.z0, z1: lane.z1 }, [tOpen])) B.L2.box('kotaSlab', r.x0, r.x1, yT, yT + 0.012, r.z0, r.z1);
  // Slab drip bands: a 100 mm projecting edge at each slab casts a crisp shadow line.
  for (const [b, y] of [[B.L1, yF], [B.L2, yT]]) {
    const p = 0.1, x0 = HOUSE.x0 - p, x1 = HOUSE.x1 + p, z0 = HOUSE.z0 - p, z1 = HOUSE.z1 + p, ya = y - SLAB - 0.04, yb = y + (y === yT ? 0.02 : 0);
    b.box('limeExt', x0, x1, ya, yb, z0, HOUSE.z0);
    b.box('limeExt', HOUSE.x0, x1, ya, yb, HOUSE.z1, z1);
    b.box('limeExt', x0, HOUSE.x0, ya, yb, HOUSE.z0, BALCONY.z0);
    b.box('limeExt', HOUSE.x1, x1, ya, yb, HOUSE.z0, HOUSE.z1);
  }
  buildTerraceSurface(B.L2);

  // ---- walls, openings, jaalis, rain hoods, coping ----
  for (const w of WALLS) {
    const mat = w.level === 'ground' ? 'concreteBoard' : w.kind === 'parapet' || w.kind === 'guard' || w.kind === 'mumty' ? 'limeExt' : 'lime';
    buildWall(lvlBatch(w.level), w, { mat });
  }
  // Mumty roof slab with a drip edge; the tank stands on it.
  B.L2.box('lime', MUMTY.x0 - 0.05, MUMTY.x1 + 0.05, MUMTY.roofTop - SLAB, MUMTY.roofTop, MUMTY.z0 - 0.05, MUMTY.z1 + 0.05);
  addCoping(B.L2, [MUMTY.x0 - 0.05, MUMTY.z0 - 0.05], [MUMTY.x1 + 0.05, MUMTY.z0 - 0.05], MUMTY.roofTop, 0.12);
  const tk = TERRACE.tank;
  B.L2.box('concrete', tk.x - tk.r - 0.1, tk.x + tk.r + 0.1, MUMTY.roofTop, MUMTY.roofTop + 0.15, tk.z - tk.r - 0.1, tk.z + tk.r + 0.1);
  B.L2.add('white', cylG(tk.x, tk.z, tk.r, MUMTY.roofTop + 0.15, MUMTY.roofTop + 0.15 + tk.h, 24));
  B.L2.add('white', cylG(tk.x, tk.z, tk.r * 0.35, MUMTY.roofTop + 0.15 + tk.h, MUMTY.roofTop + 0.25 + tk.h, 16));
  B.L2.add('iron', cylG(MUMTY.x1 + 0.08, MUMTY.z1 - 0.3, 0.02, yT + 0.1, MUMTY.roofTop + 0.4, 8));

  // ---- stairs: main run (stilts → first floor), terrace run stacked above ----
  buildStairRun(B.L0, RUNS[0], true);
  buildStairRun(B.L1, RUNS[1], false);

  // ---- guards: frameless glass in a stone kerb with a slim steel cap rail ----
  for (const g of D.GUARDS) for (const r of D.guardBands(g)) {
    const y0 = LEVELS[g.level], bb = lvlBatch(g.level), along = r.x1 - r.x0 > r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    bb.box('kotaSlab', r.x0, r.x1, y0, y0 + g.kerb, r.z0, r.z1);
    if (along) {
      bb.box('glass', r.x0, r.x1, y0 + g.kerb, y0 + g.h - 0.035, cz - 0.006, cz + 0.006);
      bb.box('steel', r.x0, r.x1, y0 + g.h - 0.035, y0 + g.h, cz - 0.02, cz + 0.02);
    } else {
      bb.box('glass', cx - 0.006, cx + 0.006, y0 + g.kerb, y0 + g.h - 0.035, r.z0, r.z1);
      bb.box('steel', cx - 0.02, cx + 0.02, y0 + g.h - 0.035, y0 + g.h, r.z0, r.z1);
    }
  }

  // ---- scuppers at terrace level: stone spouts throwing rain into the court ----
  for (const [x, z, dx = 0, dz = 0] of SCUPPERS) {
    const ax = Math.abs(dx) > 0.5, hw = 0.06, ext = 0.3, back = 0.25;
    const xa = ax ? Math.min(x - dx * back, x + dx * ext) : x - hw, xb = ax ? Math.max(x - dx * back, x + dx * ext) : x + hw;
    const za = ax ? z - hw : Math.min(z - dz * back, z + dz * ext), zb = ax ? z + hw : Math.max(z - dz * back, z + dz * ext);
    B.L2.box('granite', xa, xb, yT + 0.02, yT + 0.09, za, zb);
  }

  // ---- terrace: planters, solar canopy, wash canopy ----
  for (const p of TERRACE.planters) {
    B.L2.box('concreteBoard', p.x0, p.x1, yT + 0.05, yT + p.h, p.z0, p.z1);
    B.L2.box('soil', p.x0 + 0.04, p.x1 - 0.04, yT + p.h - 0.06, yT + p.h - 0.02, p.z0 + 0.04, p.z1 - 0.04);
    const along = p.x1 - p.x0 > p.z1 - p.z0, L = along ? p.x1 - p.x0 : p.z1 - p.z0, n = Math.floor(L / 0.55);
    for (let i = 0; i < n; i++) {
      const s = (along ? p.x0 : p.z0) + (i + 0.5) * (L / n), cx = along ? s : (p.x0 + p.x1) / 2, cz = along ? (p.z0 + p.z1) / 2 : s;
      leafClump(B.L2, i % 3 === 1 ? 'frangipani' : i % 3 === 2 ? 'tulsi' : 'leafDark', cx, yT + p.h + 0.25, cz, 0.55, s * 2);
    }
  }
  // PV pergola: two south-facing rows at 11° (a sawtooth keeps the frame low).
  const so = TERRACE.solar, tilt = (so.tiltDeg * Math.PI) / 180, zMid = (so.z0 + so.z1) / 2, rowL = (so.z1 - so.z0) / 2, rise = rowL * Math.tan(tilt);
  for (const [px, pz] of so.posts) {
    const top = pz > zMid + 0.5 ? so.h : so.h + rise;
    B.L2.box('steel', px - 0.04, px + 0.04, yT + 0.08, yT + top, pz - 0.04, pz + 0.04);
    B.L2.box('concrete', px - 0.12, px + 0.12, yT, yT + 0.1, pz - 0.12, pz + 0.12);
  }
  for (const zc of [so.z0 + rowL / 2, zMid + rowL / 2]) {
    const Wd = so.x1 - so.x0, Ls = rowL / Math.cos(tilt), y = yT + so.h + rise / 2;
    const g = new THREE.BoxGeometry(Wd, 0.04, Ls);
    g.rotateX(tilt);
    g.translate((so.x0 + so.x1) / 2, y + 0.04, zc);
    const uv = g.attributes.uv, n = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, uv.getX(i) * Wd / 1.0, uv.getY(i) * Ls / 1.7);
    B.L2.addRaw('solar', g);
    for (const x of [so.x0, so.x1]) { const r = new THREE.BoxGeometry(0.06, 0.08, Ls); r.rotateX(tilt); r.translate(x, y - 0.02, zc); B.L2.add('steel', worldUV(r)); }
  }
  const wc = TERRACE.washCanopy;
  for (const [px, pz] of wc.posts) B.L2.box('steel', px - 0.035, px + 0.035, yT, yT + wc.h, pz - 0.035, pz + 0.035);
  B.L2.box('steel', wc.x0, wc.x1, yT + wc.h, yT + wc.h + 0.05, wc.z0, wc.z1);
  B.L2.box('concrete', wc.x0 - 0.05, wc.x1, yT + wc.h + 0.05, yT + wc.h + 0.1, wc.z0 - 0.05, wc.z1);

  // ---- furniture ----
  for (const f of FURNITURE) buildFurnitureItem(furnBatch(f.level), M, f, dyn);
  // Potted plants (terracotta pots): entrance, stilts, living, balcony and terrace.
  for (const [x, z, y, s] of [[-6.45, -2.45, 0, 0.6], [-2.05, -3.35, 0, 0.55], [6.25, -1.55, yF, 0.55], [-6.62, 4.45, yF, 0.5], [-5.2, -3.85, yT, 0.6], [4.6, -2.75, yT, 0.55]]) {
    const pot = new THREE.LatheGeometry([[0, 0], [0.14, 0], [0.19, 0.3], [0.21, 0.33], [0.2, 0.36]].map(([r, h]) => new THREE.Vector2(r, h)), 16);
    pot.translate(x, y, z);
    const fb = furnBatch(y === 0 ? 'ground' : y === yF ? 'first' : 'terrace');
    fb.add('terracotta', worldUV(pot));
    leafClump(fb, 'leaf', x, y + 0.36 + s * 0.4, z, s, x + z);
  }
  buildFrangipani(B.site);
  if (D.PALM) buildPalm(B.site);

  // ---- assemble ----
  const groups = {};
  const root = new THREE.Group();
  for (const [k, b] of Object.entries(B)) { groups[k] = b.build(M); root.add(groups[k]); }
  const doors = buildDoors(M, groups);
  const gates = buildGates(M, groups.site);
  for (const s of dyn.swings) groups[s.level === 'ground' ? 'F0' : s.level === 'first' ? 'F1' : 'F2'].add(s.pivot);
  const structure = buildStructure();
  root.add(structure);
  structure.visible = false;

  const movers = [...doors, ...gates];
  let swingT = 0;
  function update(dt, sway = false) {
    let active = false;
    for (const d of movers) {
      const target = d.open ? 1 : 0;
      if (Math.abs(d.t - target) > 1e-3) {
        d.t += Math.sign(target - d.t) * Math.min(Math.abs(target - d.t), dt * 1.6);
        for (const lf of d.leaves) { if (lf.apply) lf.apply(easeInOut(d.t)); else lf.pivot.rotation.y = lf.closed + (lf.open - lf.closed) * easeInOut(d.t); }
        active = true;
      }
    }
    if (dyn.swings.length && sway) { swingT += dt; for (const s of dyn.swings) s.pivot.rotation[s.axis] = Math.sin(swingT * 1.6 + s.phase) * 0.045; active = true; }
    return active;
  }
  return { root, groups, doors, gate: gates[0], gates, movers, structure, swing: dyn.swings[0]?.pivot || null, swings: dyn.swings, update };

  // ----------------------------------------------------------- locals ----
  function addChannel(b, c) {
    // Shallow stone channel: a dark Kota bed between granite lips. The invert falls
    // along the run (see DRAINAGE); the bed is drawn just above grade to stay visible.
    const p0 = [c.from[0], c.from[2]], p1 = [c.to[0], c.to[2]], w = c.w;
    b.add('kota', segBoxG(p0, p1, -0.02, 0.004, w));
    for (const sgn of [-1, 1]) b.add('granite', segBoxG(p0, p1, -0.02, 0.022, 0.07, sgn * (w / 2 + 0.035)));
    if (c.grated) {
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz);
      const gg = new THREE.PlaneGeometry(L, w);
      gg.rotateX(-Math.PI / 2);
      gg.rotateY(Math.atan2(-dz / L, dx / L));
      gg.translate((p0[0] + p1[0]) / 2, 0.018, (p0[1] + p1[1]) / 2);
      const uv = gg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L, uv.getY(i) * w);
      b.addRaw('grating', gg);
    }
  }
  function buildTerraceSurface(b) {
    // Terracotta pavers rising 60 mm from the court guard to the parapets: rain runs to the court.
    // Tile edges include every hole edge, so no paver overhangs the void or the stair head.
    const holes = [...D.SLAB_OPENINGS.terrace, { x0: MUMTY.x0, x1: MUMTY.x1, z0: MUMTY.z0, z1: MUMTY.z1 }];
    const x0 = HOUSE.x0 + 0.23, x1 = HOUSE.x1 - 0.23, z0 = HOUSE.z0 + 0.23, z1 = HOUSE.z1 - 0.23, step = 0.2;
    const grid = (a, c, keys) => { const s = new Set([a, c]); for (let v = a + step; v < c - 1e-6; v += step) s.add(Math.round(v * 1e4) / 1e4); for (const k of keys) if (k > a && k < c) s.add(k); return [...s].sort((p, q) => p - q); };
    const X = grid(x0, x1, holes.flatMap((h) => [h.x0, h.x1])), Z = grid(z0, z1, holes.flatMap((h) => [h.z0, h.z1]));
    const dmax = Math.max(COURT.x0 - 0.23 - x0, x1 - COURT.x1 - 0.23, COURT.z0 - 0.23 - z0, z1 - COURT.z1 - 0.23);
    const hAt = (x, z) => {
      const dx = Math.max(COURT.x0 - 0.23 - x, 0, x - COURT.x1 - 0.23), dz = Math.max(COURT.z0 - 0.23 - z, 0, z - COURT.z1 - 0.23);
      return yT + 0.02 + TERRACE.fall * Math.min(1, Math.max(dx, dz) / dmax);
    };
    const pos = [], uv = [];
    for (let j = 0; j < Z.length - 1; j++) for (let i = 0; i < X.length - 1; i++) {
      const ax = X[i], bx = X[i + 1], az = Z[j], bz = Z[j + 1], cx = (ax + bx) / 2, cz = (az + bz) / 2;
      if (holes.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1)) continue;
      const q = [[ax, az], [bx, az], [bx, bz], [ax, bz]].map(([x, z]) => [x, hAt(x, z), z]);
      for (const k of [0, 2, 1, 0, 3, 2]) { pos.push(...q[k]); uv.push(q[k][0], q[k][2]); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    b.addRaw('terracotta', g);
  }
  function buildStairRun(b, run, openSouth) {
    // Floating stair: 50 mm oak treads with open risers on a dark steel spine per
    // flight, an oak-topped steel mid landing, slim steel balusters on any open side.
    const S = STAIR, r = S.riser, T = S.tread, z0 = lane.z0, z1 = lane.z1, zc = (z0 + z1) / 2, y0 = run.y0, Hf = S.perFlight * r, slope = r / T, th = Math.atan(slope);
    for (const t of D.stairTreads(y0)) b.box('oak', t.x0 - 0.015, t.x1 + 0.005, t.top - 0.05, t.top, z0 + 0.02, z1 - 0.02);
    for (const [fl, f] of [[1, run.f1], [2, run.f2]]) {
      const ya = y0 + (fl === 1 ? 0 : Hf), L = f.x1 - f.x0, len = Math.hypot(L, L * slope) + 0.1, d = 0.2;
      const xm = (f.x0 + f.x1) / 2, ytop = ya + 0.5 * r - 0.05 + (xm - f.x0) * slope;
      const g = new THREE.BoxGeometry(len, d, 0.16);
      g.rotateZ(th);
      g.translate(xm, ytop - (d / 2) / Math.cos(th), zc);
      b.add('frameDark', worldUV(g));
    }
    const yL = y0 + Hf;
    b.box('oak', run.mid.x0 - 0.015, run.mid.x1 + 0.005, yL - 0.05, yL, z0 + 0.02, z1 - 0.02);
    b.box('frameDark', run.mid.x0 + 0.02, run.mid.x1 - 0.02, yL - 0.16, yL - 0.05, z0 + 0.08, z1 - 0.08);
    if (y0 === LEVELS.ground) b.add('frameDark', cylG((run.mid.x0 + run.mid.x1) / 2, z1 - 0.16, 0.04, 0, yL - 0.16, 12));
    else b.box('frameDark', run.mid.x0 + 0.1, run.mid.x1 - 0.1, yL - 0.32, yL - 0.16, z0, z0 + 0.05);
    // Handrail on the wall side, 0.9 m above the nosings.
    const rail = (zr, key) => {
      for (const [fl, f] of [[1, run.f1], [2, run.f2]]) {
        const ya = y0 + (fl === 1 ? 0 : Hf) + r + 0.9, yb = ya + (f.x1 - f.x0) * slope, L = f.x1 - f.x0;
        const g = new THREE.BoxGeometry(Math.hypot(L, yb - ya), 0.045, 0.045);
        g.rotateZ(Math.atan2(yb - ya, L));
        g.translate((f.x0 + f.x1) / 2, (ya + yb) / 2, zr);
        b.add(key, worldUV(g));
      }
      b.box(key, run.mid.x0, run.mid.x1, yL + 0.9 - 0.0225 + r, yL + 0.9 + 0.0225 + r, zr - 0.0225, zr + 0.0225);
    };
    rail(z0 + 0.05, 'oak');
    if (!openSouth) return;
    // Open (south) side of the main run: 12 mm steel balusters at < 100 mm and an oak rail.
    const zb = z1 - 0.035;
    rail(zb, 'oak');
    for (const [fl, f] of [[1, run.f1], [2, run.f2]]) {
      const ya = y0 + (fl === 1 ? 0 : Hf);
      for (let x = f.x0 + 0.05; x < f.x1 - 0.02; x += 0.095) {
        const k = Math.min(S.perFlight - 1, Math.floor((x - f.x0) / T) + 1), base = ya + k * r, topY = ya + r + (x - f.x0) * slope + 0.9;
        b.box('frameDark', x - 0.006, x + 0.006, base, topY, zb - 0.006, zb + 0.006);
      }
    }
    for (let x = run.mid.x0 + 0.05; x < run.mid.x1; x += 0.095) b.box('frameDark', x - 0.006, x + 0.006, yL, yL + 0.9 + r, zb - 0.006, zb + 0.006);
  }
  function buildStructure() {
    // X-ray view: the 16 columns and the beam grid, ground to terrace.
    const g = new THREE.Group();
    const colMat = new THREE.MeshStandardMaterial({ color: 0xd2691e, emissive: 0x6b2a05, roughness: 0.6 });
    const beamMat = new THREE.MeshStandardMaterial({ color: 0xe8a33d, emissive: 0x5a3500, roughness: 0.6 });
    for (const c of COLUMNS) g.add(new THREE.Mesh(c.round ? cylG(c.x, c.z, c.w / 2 + 0.01, 0, yT, 20) : boxG(c.x - c.w / 2 - 0.01, c.x + c.w / 2 + 0.01, 0, yT, c.z - c.d / 2 - 0.01, c.z + c.d / 2 + 0.01), colMat));
    for (const bm of BEAMS) g.add(new THREE.Mesh(boxG(bm.x0 - 0.012, bm.x1 + 0.012, bm.y0, bm.y1 + 0.005, bm.z0 - 0.012, bm.z1 + 0.012), beamMat));
    g.name = 'structure';
    return g;
  }
}
const easeInOut = (t) => t * t * (3 - 2 * t);
