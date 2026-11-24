// Animated overlays: airflow (along the designed inlet → exhaust paths) and rain
// (falling rain, scupper jets into the court, terrace run-off and channel flow to
// the recharge pit). Paths come from design.js, so the overlays show exactly
// what the validator checks.
import * as THREE from 'three';
import * as D from './design.js';

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const COOL = new THREE.Color(0x4fb3ff), WARM = new THREE.Color(0xff8a3d);

export function buildAirflow() {
  const group = new THREE.Group();
  group.name = 'airflow';
  const curves = D.AIRFLOW.paths.map((p) => new THREE.CatmullRomCurve3(p.pts.map((q) => new THREE.Vector3(q[0], q[1], q[2])), false, 'centripetal'));
  for (const c of curves) {
    const pts = c.getSpacedPoints(120), col = [];
    pts.forEach((_, i) => { const k = new THREE.Color().lerpColors(COOL, WARM, i / (pts.length - 1)); col.push(k.r, k.g, k.b); });
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const ln = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false }));
    ln.renderOrder = 20;
    group.add(ln);
  }
  for (const inl of D.AIRFLOW.inlets) group.add(marker(inl.at, COOL, 0.22));
  for (const ex of D.AIRFLOW.exhausts) group.add(marker(ex.at, WARM, 0.22));
  const per = 34, n = per * curves.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), phase = new Float32Array(n);
  for (let i = 0; i < n; i++) phase[i] = (i % per) / per + Math.random() * 0.02;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.3, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, depthTest: false }));
  pts.renderOrder = 21;
  pts.frustumCulled = false;
  group.add(pts);
  const lengths = curves.map((c) => c.getLength()), tmp = new THREE.Vector3(), k = new THREE.Color();
  function update(dt) {
    for (let p = 0; p < curves.length; p++) {
      const speed = 0.9 / lengths[p];
      for (let j = 0; j < per; j++) {
        const i = p * per + j;
        phase[i] = (phase[i] + dt * speed) % 1;
        curves[p].getPointAt(phase[i], tmp);
        pos[i * 3] = tmp.x; pos[i * 3 + 1] = tmp.y; pos[i * 3 + 2] = tmp.z;
        k.lerpColors(COOL, WARM, phase[i]);
        col[i * 3] = k.r; col[i * 3 + 1] = k.g; col[i * 3 + 2] = k.b;
      }
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
  update(0);
  return { group, update };
}
function marker(at, color, r) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }));
  m.renderOrder = 22;
  m.position.set(at[0], at[1], at[2]);
  m.lookAt(at[0] + 1, at[1], at[2]);
  return m;
}

export function buildRain() {
  const group = new THREE.Group();
  group.name = 'rain';
  const V = D.PLOT.vertices, xs = V.map((v) => v[0]), zs = V.map((v) => v[1]);
  const bx0 = Math.min(...xs) - 1.5, bx1 = Math.max(...xs) + 1, bz0 = Math.min(...zs) - 1, bz1 = Math.max(...zs) + 1, top = 13;
  // Falling streaks
  const N = 2200, seg = new Float32Array(N * 6), vel = new Float32Array(N);
  const reset = (i, y) => {
    const x = bx0 + Math.random() * (bx1 - bx0), z = bz0 + Math.random() * (bz1 - bz0), yy = y ?? Math.random() * top;
    seg[i * 6] = x; seg[i * 6 + 1] = yy; seg[i * 6 + 2] = z; seg[i * 6 + 3] = x - 0.02; seg[i * 6 + 4] = yy - 0.28; seg[i * 6 + 5] = z + 0.01;
    vel[i] = 7 + Math.random() * 3;
  };
  for (let i = 0; i < N; i++) reset(i);
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(seg, 3));
  const streaks = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xa9c4dc, transparent: true, opacity: 0.45, depthWrite: false }));
  streaks.frustumCulled = false;
  group.add(streaks);
  // Water flows: scupper jets (terrace → court garden), terrace run-off, and channels.
  const flows = [];
  const yT = D.LEVELS.terrace, cb = D.DRAINAGE.courtBasin;
  for (const [x, z, inX = 0, inZ = 0] of D.SCUPPERS) {
    const p0 = new THREE.Vector3(x + inX * 0.3, yT + 0.06, z + inZ * 0.3);
    const curve = new THREE.QuadraticBezierCurve3(p0, new THREE.Vector3(x + inX * 0.55, yT - 0.4, z + inZ * 0.55), new THREE.Vector3(x + inX * 0.62, cb.floor + 0.05, z + inZ * 0.62));
    flows.push({ curve, n: 14, speed: 1.1, size: 0.07 });
  }
  const step = 1.1;
  for (let x = D.HOUSE.x0 + 0.6; x < D.HOUSE.x1 - 0.4; x += step) for (let z = D.HOUSE.z0 + 0.6; z < D.HOUSE.z1 - 0.4; z += step) {
    const inCourt = x > D.COURT.x0 - 0.4 && x < D.COURT.x1 + 0.4 && z > D.COURT.z0 - 0.4 && z < D.COURT.z1 + 0.4;
    const inMumty = !!D.MUMTY && x > D.MUMTY.x0 && x < D.MUMTY.x1 && z > D.MUMTY.z0 && z < D.MUMTY.z1;
    if (inCourt || inMumty) continue;
    const tx = Math.min(Math.max(x, D.COURT.x0 - 0.3), D.COURT.x1 + 0.3), tz = Math.min(Math.max(z, D.COURT.z0 - 0.3), D.COURT.z1 + 0.3);
    const d = Math.hypot(tx - x, tz - z), L = Math.min(0.7, d);
    if (L < 0.2) continue;
    const ex = x + ((tx - x) / d) * L, ez = z + ((tz - z) / d) * L;
    flows.push({ curve: new THREE.LineCurve3(new THREE.Vector3(x, yT + 0.12, z), new THREE.Vector3(ex, yT + 0.1, ez)), n: 2, speed: 0.6, size: 0.05 });
  }
  for (const c of D.DRAINAGE.channels) {
    flows.push({ curve: new THREE.LineCurve3(new THREE.Vector3(c.from[0], 0.03, c.from[2]), new THREE.Vector3(c.to[0], 0.03, c.to[2])), n: Math.max(4, Math.round(Math.hypot(c.to[0] - c.from[0], c.to[2] - c.from[2]) * 3)), speed: 0.7, size: 0.08 });
  }
  const pit = D.DRAINAGE.rechargePit;
  flows.push({ curve: new THREE.LineCurve3(new THREE.Vector3(pit.x, 0.03, pit.z - pit.r + 0.1 + 0.45), new THREE.Vector3(pit.x, -0.4, pit.z)), n: 6, speed: 0.5, size: 0.08 });
  const total = flows.reduce((a, f) => a + f.n, 0), fpos = new Float32Array(total * 3), fph = new Float32Array(total);
  let idx = 0;
  for (const f of flows) { f.start = idx; f.len = f.curve.getLength(); for (let j = 0; j < f.n; j++) fph[idx++] = j / f.n; }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  const water = new THREE.Points(fg, new THREE.PointsMaterial({ size: 0.16, color: 0x2f86e8, map: dotTexture(), transparent: true, depthWrite: false, depthTest: false }));
  water.renderOrder = 21;
  water.frustumCulled = false;
  group.add(water);
  // Ponding sheet in the court rain garden while it rains.
  const pond = new THREE.Mesh(new THREE.PlaneGeometry(cb.x1 - cb.x0 - 0.02, cb.z1 - cb.z0 - 0.02), new THREE.MeshStandardMaterial({ color: 0x2f5560, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 }));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set((cb.x0 + cb.x1) / 2, cb.floor + 0.035, (cb.z0 + cb.z1) / 2);
  group.add(pond);
  const tmp = new THREE.Vector3();
  function update(dt) {
    for (let i = 0; i < N; i++) {
      const dy = vel[i] * dt;
      seg[i * 6 + 1] -= dy; seg[i * 6 + 4] -= dy;
      if (seg[i * 6 + 4] < 0) reset(i, top);
    }
    rg.attributes.position.needsUpdate = true;
    for (const f of flows) for (let j = 0; j < f.n; j++) {
      const i = f.start + j;
      fph[i] = (fph[i] + (dt * f.speed) / Math.max(0.3, f.len)) % 1;
      f.curve.getPointAt(fph[i], tmp);
      fpos[i * 3] = tmp.x; fpos[i * 3 + 1] = tmp.y; fpos[i * 3 + 2] = tmp.z;
    }
    fg.attributes.position.needsUpdate = true;
  }
  update(0);
  return { group, update };
}
