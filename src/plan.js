// Architectural plans drawn from design.js: the same data drives the 3D model,
// so the plans and the model cannot disagree. Used by the plan viewer and by the
// walk-mode minimap.
import * as D from './design.js';

const C = {
  paper: '#f7f2e7', ink: '#2a2420', poche: '#3b332c', soft: '#8b7f72', faint: '#cfc4b3', grid: '#b0563a',
  water: '#2f7fc4', cool: '#2f8fe0', warm: '#e8742a', green: '#7aa35c', greenFill: 'rgba(122,163,92,0.25)', court: 'rgba(120,170,210,0.18)',
  rubble: '#a99b86', road: '#5b5b5d', clay: '#b4613a',
};
const LEVEL_NAME = { ground: 'Ground · open stilt garden', first: 'First floor · family home', terrace: 'Terrace garden' };
const FT = D.FT;
const sqft = (m2) => Math.round(m2 / (FT * FT));
const isHoriz = (w) => Math.abs(w.a[1] - w.b[1]) < 1e-6;

export function planLevels() { return Object.keys(LEVEL_NAME).map((k) => ({ id: k, name: LEVEL_NAME[k] })); }

// Draw the full sheet. opts: { overlays, walker:{x,z,yaw,level}, compact, dpr }
export function drawPlan(canvas, level, opts = {}) {
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height, dpr = opts.dpr || 1;
  const compact = !!opts.compact, overlays = opts.overlays !== false;
  ctx.save();
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  const side = !compact && W > H * 1.2, legend = compact ? 0 : side ? Math.min(300 * dpr, W * 0.3) : Math.min(170 * dpr, H * 0.3);
  const planW = side ? W - legend : W, planH = side ? H : H - legend;
  const bx0 = compact ? D.HOUSE.x0 - 2.2 : -10.9, bx1 = compact ? D.HOUSE.x1 + 1.4 : 9.7, bz0 = compact ? D.HOUSE.z0 - 1.0 : -6.9, bz1 = compact ? D.HOUSE.z1 + 1.0 : 6.5;
  const pad = (compact ? 6 : 26) * dpr;
  const s = Math.min((planW - 2 * pad) / (bx1 - bx0), (planH - 2 * pad) / (bz1 - bz0));
  const ox = pad + (planW - 2 * pad - (bx1 - bx0) * s) / 2, oy = pad + (planH - 2 * pad - (bz1 - bz0) * s) / 2;
  const P = (x, z) => [ox + (x - bx0) * s, oy + (z - bz0) * s];
  const T = { ctx, s, P, dpr, compact, fs: (k) => Math.max(compact ? 7 : 9, Math.min(compact ? 9 : 15, s * k)) * dpr };

  drawSite(T, level);
  if (level === 'ground') drawGround(T, overlays);
  if (level === 'first') drawFirst(T, overlays);
  if (level === 'terrace') drawTerrace(T, overlays);
  if (!compact) { drawGridBubbles(T); drawNorth(T, P(bx1 - 0.7, bz0 + 0.9)); drawScale(T, P(bx0 + 0.5, bz1 - 0.45)); }
  if (opts.walker && opts.walker.level === level) drawWalker(T, opts.walker);
  if (!compact) drawLegend(T, level, side, side ? [planW, 0, legend, H] : [0, planH, W, legend], overlays);
  ctx.restore();
  return { s, P };
}

// ---------------------------------------------------------------- basics ----
function poly(T, pts, { fill, stroke, width = 1, dash } = {}) {
  const { ctx, P, dpr } = T;
  ctx.beginPath();
  pts.forEach(([x, z], i) => { const [px, py] = P(x, z); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.setLineDash(dash ? dash.map((d) => d * dpr) : []); ctx.strokeStyle = stroke; ctx.lineWidth = width * dpr; ctx.stroke(); ctx.setLineDash([]); }
}
const rectPts = (r) => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
function line(T, pts, { stroke = C.ink, width = 1, dash } = {}) {
  const { ctx, P, dpr } = T;
  ctx.beginPath();
  pts.forEach(([x, z], i) => { const [px, py] = P(x, z); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
  ctx.setLineDash(dash ? dash.map((d) => d * dpr) : []);
  ctx.strokeStyle = stroke; ctx.lineWidth = width * dpr; ctx.stroke(); ctx.setLineDash([]);
}
function text(T, str, x, z, { size = 0.16, color = C.ink, weight = '600', align = 'center', base = 'middle', rot = 0, bg } = {}) {
  const { ctx, P } = T, [px, py] = P(x, z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(rot);
  ctx.font = `${weight} ${T.fs(size)}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = base;
  if (bg) { const m = ctx.measureText(str), w = m.width + 6 * T.dpr, h = T.fs(size) * 1.3; ctx.fillStyle = bg; ctx.fillRect(align === 'center' ? -w / 2 : align === 'left' ? -3 * T.dpr : -w + 3 * T.dpr, -h / 2, w, h); }
  ctx.fillStyle = color;
  ctx.fillText(str, 0, 0);
  ctx.restore();
}
function arrow(T, a, b, { stroke = C.water, width = 1.6, head = 0.18 } = {}) {
  line(T, [a, b], { stroke, width });
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), h = head;
  poly(T, [b, [b[0] - h * Math.cos(ang - 0.45), b[1] - h * Math.sin(ang - 0.45)], [b[0] - h * Math.cos(ang + 0.45), b[1] - h * Math.sin(ang + 0.45)]], { fill: stroke });
}
function wallRect(w) {
  const h = w.t / 2;
  return isHoriz(w) ? { x0: Math.min(w.a[0], w.b[0]), x1: Math.max(w.a[0], w.b[0]), z0: w.a[1] - h, z1: w.a[1] + h } : { x0: w.a[0] - h, x1: w.a[0] + h, z0: Math.min(w.a[1], w.b[1]), z1: Math.max(w.a[1], w.b[1]) };
}
// Draw a wall in poché with gaps at its openings, plus opening symbols.
function drawWall(T, w, fill = C.poche) {
  const len = D.wallLength(w), horiz = isHoriz(w), dir = horiz ? Math.sign(w.b[0] - w.a[0]) : Math.sign(w.b[1] - w.a[1]), r = wallRect(w);
  const at = (s) => (horiz ? w.a[0] + dir * s : w.a[1] + dir * s);
  const seg = (s0, s1) => { const a = at(s0), b = at(s1); return horiz ? { x0: Math.min(a, b), x1: Math.max(a, b), z0: r.z0, z1: r.z1 } : { x0: r.x0, x1: r.x1, z0: Math.min(a, b), z1: Math.max(a, b) }; };
  if (w.kind === 'screen' || w.kind === 'spine') { poly(T, rectPts(r), { fill: 'rgba(120,80,40,0.35)', stroke: C.soft, width: 0.6, dash: [2, 2] }); return; }
  const ops = [...w.openings].sort((a, b) => a.s - b.s);
  let cur = 0;
  for (const o of ops) {
    if (o.s > cur) poly(T, rectPts(seg(cur, o.s)), { fill });
    const g = seg(o.s, o.s + o.w);
    if (o.type === 'window') {
      poly(T, rectPts(g), { fill: C.paper, stroke: C.ink, width: 0.7 });
      const mid = horiz ? [[g.x0, (g.z0 + g.z1) / 2], [g.x1, (g.z0 + g.z1) / 2]] : [[(g.x0 + g.x1) / 2, g.z0], [(g.x0 + g.x1) / 2, g.z1]];
      line(T, mid, { stroke: C.ink, width: 0.7 });
      if (o.lowJaali) poly(T, rectPts(g), { stroke: C.cool, width: 1.6 });
    } else if (o.type === 'jaali') {
      poly(T, rectPts(g), { fill: 'rgba(180,97,58,0.35)', stroke: C.clay, width: 0.8, dash: [1.5, 1.5] });
      if (o.role === 'exhaust') poly(T, rectPts(g), { stroke: C.warm, width: 1.6 });
    } else if (o.type === 'arch') {
      const mid = horiz ? [[g.x0, g.z0], [g.x1, g.z0]] : [[g.x0, g.z0], [g.x0, g.z1]];
      line(T, mid, { stroke: C.soft, width: 0.6, dash: [3, 2] });
    }
    cur = o.s + o.w;
  }
  if (cur < len) poly(T, rectPts(seg(cur, len)), { fill });
  for (const o of ops) if (o.type === 'door') drawDoor(T, w, o);
}
function drawDoor(T, w, o) {
  for (const lf of D.doorLeaves(w, o)) {
    const end = [lf.hinge[0] + lf.openDir[0] * lf.w, lf.hinge[1] + lf.openDir[1] * lf.w];
    line(T, [lf.hinge, end], { stroke: C.ink, width: 1.2 });
    const pts = [];
    for (let k = 0; k <= 16; k++) { const a = (Math.PI / 2) * (k / 16); pts.push([lf.hinge[0] + lf.w * (lf.closedDir[0] * Math.cos(a) + lf.openDir[0] * Math.sin(a)), lf.hinge[1] + lf.w * (lf.closedDir[1] * Math.cos(a) + lf.openDir[1] * Math.sin(a))]); }
    line(T, pts, { stroke: C.soft, width: 0.6, dash: [2, 2] });
  }
}
function drawFurniture(T, level) {
  for (const f of D.FURNITURE) {
    if (f.level !== level) continue;
    poly(T, rectPts(f), { fill: f.type === 'thinnai' ? 'rgba(160,74,46,0.25)' : 'rgba(255,255,255,0.55)', stroke: C.soft, width: 0.6 });
    if (f.type === 'bed') { const inset = { x0: f.x0 + 0.06, x1: f.x1 - 0.06, z0: f.z0 + 0.06, z1: f.z1 - 0.06 }; poly(T, rectPts(inset), { stroke: C.faint, width: 0.5 }); }
  }
}
function roomLabel(T, r) {
  const a = D.roomArea(r), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, small = Math.min(r.x1 - r.x0, r.z1 - r.z0) < 1.9;
  const dims = `${D.fmtFtIn(r.x1 - r.x0)} × ${D.fmtFtIn(r.z1 - r.z0)}`;
  const name = small ? r.name.replace(' alcove', '') : r.name, words = name.split(' ');
  // Narrow rooms: break two-word names onto two lines so neighbours do not collide.
  if (small && words.length === 2 && r.x1 - r.x0 < 1.9) {
    text(T, words[0], cx, cz - 0.3, { size: 0.11, bg: 'rgba(247,242,231,0.8)' });
    text(T, words[1], cx, cz - 0.1, { size: 0.11, bg: 'rgba(247,242,231,0.8)' });
  } else text(T, name, cx, cz - 0.17, { size: small ? 0.11 : 0.15, bg: 'rgba(247,242,231,0.8)' });
  if (!T.compact) text(T, small ? `${a.toFixed(1)} m²` : `${a.toFixed(1)} m² · ${sqft(a)} ft²`, cx, cz + 0.1, { size: small ? 0.095 : 0.105, weight: '500', color: C.soft });
  if (!T.compact && !small) text(T, dims, cx, cz + 0.28, { size: 0.095, weight: '500', color: C.soft });
}

// ------------------------------------------------------------------ site ----
function drawSite(T, level) {
  const V = D.PLOT.vertices;
  // Road and footpath on the west.
  const w0 = [[V[3][0], V[3][1] + 1.5], [V[0][0], V[0][1] - 1.5]];
  const off = (p, d) => [p[0] - d, p[1]];
  if (!T.compact) {
    poly(T, [off(w0[0], 1.2), off(w0[1], 1.2), off(w0[1], 7.2), off(w0[0], 7.2)], { fill: 'rgba(91,91,93,0.18)' });
    poly(T, [w0[0], w0[1], off(w0[1], 1.2), off(w0[0], 1.2)], { fill: 'rgba(160,150,135,0.18)' });
    text(T, 'ROAD (west)', (V[0][0] + V[3][0]) / 2 - 2.6, 0, { size: 0.2, color: C.road, rot: -Math.PI / 2 });
  }
  poly(T, V, { fill: level === 'ground' ? 'rgba(122,163,92,0.10)' : null, stroke: C.ink, width: 1.2, dash: [8, 3, 2, 3] });
  // Compound wall band with the gate gap.
  for (let i = 0; i < 4; i++) {
    const p = V[i], q = V[(i + 1) % 4], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz), n = [-dz / L, dx / L], t = D.COMPOUND.t;
    const band = (a, b) => poly(T, [a, b, [b[0] + n[0] * t, b[1] + n[1] * t], [a[0] + n[0] * t, a[1] + n[1] * t]], { fill: C.rubble });
    if (i === 3) {
      const at = (z) => [D.boundaryX('W', z), z];
      band(p, at(D.GATE.z1 + D.GATE.pierW)); band(at(D.GATE.z0 - D.GATE.pierW), q);
      for (const [za, zb] of [[D.GATE.z0 - D.GATE.pierW, D.GATE.z0], [D.GATE.z1, D.GATE.z1 + D.GATE.pierW]]) band(at(za), at(zb));
    } else band(p, q);
    if (!T.compact) {
      const k = Object.keys(D.PLOT.sidesFt)[[0, 3, 1, 2][i]], ft = D.PLOT.sidesFt[k], away = k === 'N' ? 1.55 : 0.45;
      const mid = [(p[0] + q[0]) / 2 - n[0] * away, (p[1] + q[1]) / 2 - n[1] * away];
      const rot = Math.abs(dz) > Math.abs(dx) ? -Math.PI / 2 : 0;
      text(T, `${k} ${ft}′ · ${(ft * FT).toFixed(2)} m`, mid[0], mid[1], { size: 0.14, color: C.ink, rot, bg: 'rgba(247,242,231,0.85)' });
    }
  }
  // Sliding gate: leaf parked open (solid), closed position dashed, travel arrow.
  for (const lf of D.gateLeaves()) {
    line(T, lf.open, { stroke: '#6b4126', width: 2.4 });
    line(T, lf.closed, { stroke: C.soft, width: 0.7, dash: [3, 2] });
    const m = [(lf.closed[0][0] + lf.closed[1][0]) / 2 + 0.25, (lf.closed[0][1] + lf.closed[1][1]) / 2];
    arrow(T, m, [m[0] - lf.dir[0] * 1.2, m[1] - lf.dir[1] * 1.2], { stroke: '#6b4126', width: 1, head: 0.14 });
  }
  if (!T.compact && level === 'ground') text(T, 'Sliding timber gate', D.boundaryX('W', (D.GATE.z0 + D.GATE.z1) / 2) - 0.75, (D.GATE.z0 + D.GATE.z1) / 2, { size: 0.12, rot: -Math.PI / 2, color: '#6b4126' });
}
function drawColumns(T) {
  for (const c of D.COLUMNS) {
    poly(T, rectPts({ x0: c.x - c.w / 2, x1: c.x + c.w / 2, z0: c.z - c.d / 2, z1: c.z + c.d / 2 }), { fill: '#1d1916' });
  }
}
function drawGridBubbles(T) {
  // Column-line bubbles along the north, row-line bubbles along the east (the west yard holds the drainage).
  const g = D.GRID, zTop = D.HOUSE.z0 - 0.75, xRight = D.HOUSE.x1 + 2.05;
  for (const [k, x] of Object.entries(g.x)) {
    line(T, [[x, zTop + 0.2], [x, D.HOUSE.z1 + 0.35]], { stroke: C.grid, width: 0.5, dash: [6, 2, 1, 2] });
    bubble(T, x, zTop, k);
  }
  for (const [k, z] of Object.entries(g.z)) {
    line(T, [[D.HOUSE.x0 - 0.35, z], [xRight - 0.2, z]], { stroke: C.grid, width: 0.5, dash: [6, 2, 1, 2] });
    bubble(T, xRight, z, k);
  }
  const xs = Object.values(g.x), zd = zTop - 0.42;
  for (let i = 0; i < xs.length - 1; i++) dim(T, [xs[i], zd], [xs[i + 1], zd], `${(xs[i + 1] - xs[i]).toFixed(2)} m`);
  dim(T, [D.HOUSE.x0, zd - 0.42], [D.HOUSE.x1, zd - 0.42], `${(D.HOUSE.x1 - D.HOUSE.x0).toFixed(2)} m · ${D.fmtFtIn(D.HOUSE.x1 - D.HOUSE.x0)}`);
  const zs = Object.values(g.z), xd = xRight + 0.5;
  for (let i = 0; i < zs.length - 1; i++) dim(T, [xd, zs[i]], [xd, zs[i + 1]], `${(zs[i + 1] - zs[i]).toFixed(2)} m`, true);
  dim(T, [xd + 0.42, D.HOUSE.z0], [xd + 0.42, D.HOUSE.z1], `${(D.HOUSE.z1 - D.HOUSE.z0).toFixed(2)} m · ${D.fmtFtIn(D.HOUSE.z1 - D.HOUSE.z0)}`, true);
}
function bubble(T, x, z, label) {
  const { ctx, P, dpr } = T, [px, py] = P(x, z), r = Math.max(7, T.s * 0.2) * dpr / (dpr > 1 ? 1 : 1);
  ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fillStyle = C.paper; ctx.fill(); ctx.strokeStyle = C.grid; ctx.lineWidth = 1 * dpr; ctx.stroke();
  text(T, label, x, z, { size: 0.14, color: C.grid, weight: '700' });
}
function dim(T, a, b, label, vertical = false) {
  line(T, [a, b], { stroke: C.soft, width: 0.6 });
  for (const p of [a, b]) line(T, vertical ? [[p[0] - 0.08, p[1] - 0.08], [p[0] + 0.08, p[1] + 0.08]] : [[p[0] - 0.08, p[1] + 0.08], [p[0] + 0.08, p[1] - 0.08]], { stroke: C.soft, width: 0.8 });
  text(T, label, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - (vertical ? 0 : 0.14), { size: 0.105, color: C.soft, weight: '500', rot: vertical ? -Math.PI / 2 : 0, bg: C.paper });
}
function drawNorth(T, [px, py]) {
  const { ctx, dpr } = T, r = 16 * dpr;
  ctx.save(); ctx.translate(px, py);
  ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.45, r * 0.6); ctx.lineTo(0, r * 0.3); ctx.lineTo(-r * 0.45, r * 0.6); ctx.closePath();
  ctx.fillStyle = C.ink; ctx.fill();
  ctx.font = `700 ${12 * dpr}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('N', 0, -r - 6 * dpr);
  ctx.restore();
}
function drawScale(T, [px, py]) {
  const { ctx, s, dpr } = T;
  ctx.save(); ctx.translate(px, py);
  for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? C.paper : C.ink; ctx.fillRect(i * s, -4 * dpr, s, 6 * dpr); }
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1 * dpr; ctx.strokeRect(0, -4 * dpr, 5 * s, 6 * dpr);
  ctx.fillStyle = C.ink; ctx.font = `600 ${10 * dpr}px system-ui, sans-serif`; ctx.textAlign = 'center';
  for (const m of [0, 1, 2, 5]) ctx.fillText(`${m}`, m * s, 16 * dpr);
  ctx.textAlign = 'left'; ctx.fillText('m', 5 * s + 6 * dpr, 2 * dpr);
  ctx.restore();
}
function drawWalker(T, wk) {
  const { ctx, P, dpr } = T, [px, py] = P(wk.x, wk.z), r = 6 * dpr, a = -wk.yaw - Math.PI / 2, fov = 0.65, L = 34 * dpr;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, L, a - fov, a + fov); ctx.closePath();
  ctx.fillStyle = 'rgba(214,64,52,0.22)'; ctx.fill();
  ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fillStyle = '#d64034'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr; ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- levels ----
function drawGround(T, overlays) {
  poly(T, rectPts(D.HOUSE), { stroke: C.soft, width: 0.9, dash: [5, 4] });
  if (!T.compact) text(T, 'first floor above', D.HOUSE.x1 - 1.3, D.HOUSE.z1 - 0.3, { size: 0.1, color: C.soft, weight: '500' });
  const cb = D.DRAINAGE.courtBasin;
  poly(T, rectPts(cb), { fill: C.greenFill, stroke: C.green, width: 1 });
  const tr = D.COURT_TREE;
  T.ctx.beginPath(); const [tx, ty] = T.P(tr.x, tr.z); T.ctx.arc(tx, ty, tr.canopy * T.s, 0, Math.PI * 2); T.ctx.strokeStyle = C.green; T.ctx.lineWidth = 0.8 * T.dpr; T.ctx.setLineDash([3 * T.dpr, 2 * T.dpr]); T.ctx.stroke(); T.ctx.setLineDash([]);
  drawFurniture(T, 'ground');
  drawStair(T, 0, 'ground');
  for (const w of D.WALLS) if (w.level === 'ground') drawWall(T, w, w.kind === 'low' ? '#7a5a44' : C.poche);
  drawColumns(T);
  for (const r of D.ROOMS.filter((r) => r.level === 'ground')) if (r.use !== 'stair') text(T, r.name, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2 + (r.use === 'garden' ? 0.75 : 0), { size: 0.13, bg: 'rgba(247,242,231,0.8)' });
  text(T, 'Stair hall', (D.STAIR.floorLanding.x0 + D.STAIR.floorLanding.x1) / 2, (D.STAIR.box.z0 + D.STAIR.box.z1) / 2, { size: 0.1, bg: 'rgba(247,242,231,0.8)' });
  if (!T.compact) text(T, `12 columns · hidden in walls · max span ${Math.max(...D.BEAMS.map((b) => b.span || 0)).toFixed(1)} m (230 × ${Math.round(D.DEEP_BEAM * 1000)} mm beams)`, (D.HOUSE.x0 + D.HOUSE.x1) / 2, D.HOUSE.z1 + 1.5, { size: 0.11, color: C.grid, weight: '600' });
  if (!overlays) return;
  for (const c of D.DRAINAGE.channels) {
    const a = [c.from[0], c.from[2]], b = [c.to[0], c.to[2]];
    line(T, [a, b], { stroke: C.water, width: 3 });
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    arrow(T, [m[0] - u[0] * 0.25, m[1] - u[1] * 0.25], [m[0] + u[0] * 0.25, m[1] + u[1] * 0.25], { stroke: '#fff', width: 1.2, head: 0.14 });
    if (!T.compact && L > 1) text(T, `1:${Math.round(L / (c.from[1] - c.to[1]))}`, m[0] + u[1] * 0.28, m[1] - u[0] * 0.28 - 0.0, { size: 0.095, color: C.water, weight: '600', bg: 'rgba(247,242,231,0.8)' });
  }
  const pit = D.DRAINAGE.rechargePit, st = D.DRAINAGE.siltTrap;
  T.ctx.beginPath(); const [qx, qy] = T.P(pit.x, pit.z); T.ctx.arc(qx, qy, pit.r * T.s, 0, Math.PI * 2); T.ctx.fillStyle = 'rgba(47,127,196,0.25)'; T.ctx.fill(); T.ctx.strokeStyle = C.water; T.ctx.lineWidth = 1.4 * T.dpr; T.ctx.stroke();
  poly(T, rectPts({ x0: st.x - st.size / 2, x1: st.x + st.size / 2, z0: st.z - st.size / 2, z1: st.z + st.size / 2 }), { fill: 'rgba(47,127,196,0.2)', stroke: C.water, width: 1.2 });
  if (T.compact) return;
  text(T, 'Recharge pit', pit.x + 0.2, pit.z - pit.r - 0.22, { size: 0.11, color: C.water, bg: 'rgba(247,242,231,0.85)' });
  text(T, 'Silt trap', st.x + 0.62, st.z, { size: 0.1, color: C.water, align: 'left', bg: 'rgba(247,242,231,0.85)' });
  text(T, 'Courtyard overflow', -4.4, -0.88, { size: 0.11, color: C.water, bg: 'rgba(247,242,231,0.85)' });
  text(T, 'Gate intercept (grated)', D.boundaryX('W', 2.6) + 0.95, 2.4, { size: 0.1, color: C.water, rot: -Math.PI / 2, bg: 'rgba(247,242,231,0.85)' });
}
function drawStair(T, y0, level) {
  const S = D.STAIR;
  const treadsHere = level === 'terrace' ? [] : D.stairTreads(y0);
  poly(T, rectPts(S.box), { fill: 'rgba(255,255,255,0.4)' });
  for (const t of treadsHere) poly(T, rectPts(t), { stroke: C.soft, width: 0.6 });
  poly(T, rectPts({ x0: S.midLanding.x0, x1: S.midLanding.x1, z0: S.box.z0, z1: S.box.z1 }), { stroke: C.soft, width: 0.6 });
  const zN = (S.lane1.z0 + S.lane1.z1) / 2, zS = (S.lane2.z0 + S.lane2.z1) / 2;
  if (level === 'ground') { arrow(T, [S.flight.x0 + 0.15, zN], [S.flight.x1 - 0.1, zN], { stroke: C.ink, width: 1, head: 0.14 }); text(T, 'UP', S.flight.x0 + 0.5, zN - 0.24, { size: 0.1 }); }
  if (level === 'first') {
    arrow(T, [S.flight.x0 + 0.15, zN], [S.flight.x1 - 0.1, zN], { stroke: C.ink, width: 1, head: 0.14 }); text(T, 'UP', S.flight.x0 + 0.5, zN - 0.24, { size: 0.1 });
    arrow(T, [S.flight.x0 + 0.15, zS], [S.flight.x1 - 0.1, zS], { stroke: C.soft, width: 1, head: 0.14 }); text(T, 'DN', S.flight.x0 + 0.5, zS + 0.26, { size: 0.1, color: C.soft });
  }
}
function drawFirst(T, overlays) {
  const yF = D.LEVELS.first;
  for (const r of D.ROOMS.filter((r) => r.level === 'first' && r.use !== 'void' && r.use !== 'stair')) poly(T, rectPts(r), { fill: ['hall', 'living', 'family', 'kitchen'].includes(r.use) ? 'rgba(214,170,110,0.14)' : r.use === 'bath' ? 'rgba(160,190,200,0.18)' : 'rgba(255,255,255,0.5)' });
  poly(T, rectPts(D.COURT), { fill: C.court, stroke: C.water, width: 1 });
  line(T, [[D.COURT.x0, D.COURT.z0], [D.COURT.x1, D.COURT.z1]], { stroke: C.water, width: 0.6 });
  line(T, [[D.COURT.x1, D.COURT.z0], [D.COURT.x0, D.COURT.z1]], { stroke: C.water, width: 0.6 });
  drawFurniture(T, 'first');
  drawStair(T, yF, 'first');
  for (const g of D.GUARDS) for (const r of D.guardBands(g)) poly(T, rectPts(r), { fill: '#7a5a44' });
  for (const w of D.WALLS) if (w.level === 'first' || w.id === 'stair-spine') drawWall(T, w);
  drawColumns(T);
  for (const r of D.ROOMS.filter((r) => r.level === 'first' && !['void', 'stair', 'verandah'].includes(r.use))) roomLabel(T, r);
  text(T, 'NADUMUTTAM', (D.COURT.x0 + D.COURT.x1) / 2, (D.COURT.z0 + D.COURT.z1) / 2 - 0.12, { size: 0.13, color: C.water, weight: '700', bg: 'rgba(247,242,231,0.8)' });
  if (!T.compact) text(T, 'open to sky', (D.COURT.x0 + D.COURT.x1) / 2, (D.COURT.z0 + D.COURT.z1) / 2 + 0.12, { size: 0.1, color: C.water, weight: '500' });
  if (!overlays) return;
  for (const p of D.AIRFLOW.paths) {
    const pts = p.pts.filter((q) => q[1] < D.LEVELS.terrace + 0.5 && q[1] > yF - 0.5).map((q) => [q[0], q[2]]);
    for (let i = 1; i < pts.length; i++) {
      const k = i / (pts.length - 1), col = `rgb(${Math.round(47 + (232 - 47) * k)},${Math.round(143 + (116 - 143) * k)},${Math.round(224 + (42 - 224) * k)})`;
      if (i === pts.length - 1) arrow(T, pts[i - 1], pts[i], { stroke: col, width: 1.6, head: 0.16 });
      else line(T, [pts[i - 1], pts[i]], { stroke: col, width: 1.6 });
    }
  }
  if (T.compact) return;
  text(T, 'SW low inlet → cross-flow → high exhaust', -0.2, D.HOUSE.z1 + 1.5, { size: 0.12, color: C.cool, weight: '700', bg: 'rgba(247,242,231,0.85)' });
  text(T, 'low jaali inlets', -4.75, D.HOUSE.z1 + 0.85, { size: 0.1, color: C.cool });
  text(T, 'high jaali exhausts', D.HOUSE.x1 + 0.35, -1.2, { size: 0.1, color: C.warm, rot: -Math.PI / 2 });
}
function drawTerrace(T, overlays) {
  const yT = D.LEVELS.terrace;
  poly(T, rectPts(D.HOUSE), { fill: 'rgba(177,95,57,0.12)' });
  for (const p of D.TERRACE.planters) poly(T, rectPts(p), { fill: C.greenFill, stroke: C.green, width: 0.8 });
  const so = D.TERRACE.solar;
  poly(T, rectPts(so), { fill: 'rgba(40,60,110,0.12)', stroke: '#2b3a67', width: 0.8, dash: [4, 2] });
  poly(T, rectPts(D.TERRACE.washCanopy), { stroke: C.soft, width: 0.6, dash: [2, 2] });
  poly(T, rectPts(D.COURT), { fill: C.court, stroke: C.water, width: 1 });
  drawStair(T, yT, 'terrace');
  drawFurniture(T, 'terrace');
  for (const w of D.WALLS) if (w.level === 'terrace') drawWall(T, w, w.jaaliAbove ? '#7a4a30' : C.poche);
  const tk = D.TERRACE.tank;
  T.ctx.beginPath(); const [kx, ky] = T.P(tk.x, tk.z); T.ctx.arc(kx, ky, tk.r * T.s, 0, Math.PI * 2); T.ctx.strokeStyle = C.soft; T.ctx.lineWidth = 0.8 * T.dpr; T.ctx.setLineDash([3 * T.dpr, 2 * T.dpr]); T.ctx.stroke(); T.ctx.setLineDash([]);
  text(T, 'Stair head', (D.MUMTY.x0 + D.MUMTY.x1) / 2 - 1.0, (D.MUMTY.z0 + D.MUMTY.z1) / 2 + 0.2, { size: 0.11, bg: 'rgba(247,242,231,0.8)' });
  if (!T.compact) text(T, '1,000 L tank above', tk.x + 0.2, tk.z + 0.75, { size: 0.095, color: C.soft });
  text(T, 'PV pergola', (so.x0 + so.x1) / 2, (so.z0 + so.z1) / 2, { size: 0.12, color: '#2b3a67', rot: -Math.PI / 2, bg: 'rgba(247,242,231,0.7)' });
  text(T, 'Wash + drying', (D.TERRACE.washCanopy.x0 + D.TERRACE.washCanopy.x1) / 2, 2.95, { size: 0.1 });
  text(T, 'Terrace garden', 3.7, -1.5, { size: 0.13 });
  if (!overlays) return;
  for (const [x, z] of D.SCUPPERS) {
    const inX = Math.abs(x - D.COURT.x0) < 0.01 ? 1 : Math.abs(x - D.COURT.x1) < 0.01 ? -1 : 0, inZ = inX ? 0 : Math.abs(z - D.COURT.z0) < 0.01 ? 1 : -1;
    arrow(T, [x - inX * 0.45, z - inZ * 0.45], [x + inX * 0.35, z + inZ * 0.35], { stroke: C.water, width: 1.4, head: 0.13 });
  }
  for (const [x, z] of [[-4.2, -3.0], [-4.2, 2.6], [0.2, 3.0], [4.6, -3.0], [4.6, -0.2], [4.0, 1.6], [-3.8, -0.15]]) {
    const tx = Math.min(Math.max(x, D.COURT.x0 - 0.5), D.COURT.x1 + 0.5), tz = Math.min(Math.max(z, D.COURT.z0 - 0.5), D.COURT.z1 + 0.5);
    const d = Math.hypot(tx - x, tz - z), L = Math.min(1.1, d);
    if (d > 0.3) arrow(T, [x, z], [x + ((tx - x) / d) * L, z + ((tz - z) / d) * L], { stroke: 'rgba(47,127,196,0.75)', width: 1.1, head: 0.13 });
  }
  if (T.compact) return;
  const maxRun = Math.max(D.COURT.x0 - D.HOUSE.x0, D.HOUSE.x1 - D.COURT.x1, D.COURT.z0 - D.HOUSE.z0, D.HOUSE.z1 - D.COURT.z1);
  text(T, `Terrace falls to the court (≥ 1:${Math.round(maxRun / D.TERRACE.fall)}) · 8 scuppers`, 0.3, D.HOUSE.z0 - 0.38, { size: 0.11, color: C.water, weight: '600', bg: 'rgba(247,242,231,0.85)' });
  text(T, 'Flat stone coping on parapets · 1.0 m guards · 1.8 m brick-jaali screen at the wash area', 0.3, D.HOUSE.z1 + 1.5, { size: 0.105, color: C.clay, weight: '600', bg: 'rgba(247,242,231,0.85)' });
}

// ---------------------------------------------------------------- legend ----
function drawLegend(T, level, side, [x, y, w, h], overlays) {
  const { ctx, dpr } = T, pad = 14 * dpr;
  ctx.save();
  ctx.fillStyle = 'rgba(255,253,248,0.92)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.faint; ctx.lineWidth = 1 * dpr; ctx.beginPath(); side ? (ctx.moveTo(x, y), ctx.lineTo(x, y + h)) : (ctx.moveTo(x, y), ctx.lineTo(x + w, y)); ctx.stroke();
  let cy = y + pad + 4 * dpr;
  const put = (str, size = 12, weight = '500', color = C.ink) => {
    ctx.font = `${weight} ${size * dpr}px system-ui, sans-serif`; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const words = str.split(' '), maxW = w - 2 * pad;
    let ln = '';
    for (const wd of words) { const t = ln ? `${ln} ${wd}` : wd; if (ctx.measureText(t).width > maxW && ln) { ctx.fillText(ln, x + pad, cy); cy += size * 1.35 * dpr; ln = wd; } else ln = t; }
    if (ln) { ctx.fillText(ln, x + pad, cy); cy += size * 1.35 * dpr; }
  };
  put(LEVEL_NAME[level], 15, '700');
  const areaM2 = D.polygonArea(D.PLOT.vertices);
  put(`Plot: N 51′ · S 46′ · W 33′ · E 33′ (road on the west). Drawn area ${areaM2.toFixed(1)} m² = ${Math.round(areaM2 / FT / FT).toLocaleString('en-IN')} sq ft. The stated 1,620 sq ft is not possible with these sides (max 1,596 sq ft); corner angles unsurveyed.`, 11, '500', C.soft);
  cy += 4 * dpr;
  const items = level === 'ground'
    ? [['#1d1916', '12 columns (stilts)'], [C.greenFill, 'Courtyard rain garden'], ['rgba(160,74,46,0.4)', 'Thinnai seats'], ...(overlays ? [[C.water, 'Drains: overflow → silt trap → recharge pit'], [C.water, 'Gate intercept: grated, no road discharge']] : [])]
    : level === 'first'
      ? [[C.poche, 'Walls'], [C.court, 'Nadumuttam (open to sky)'], ['rgba(180,97,58,0.5)', 'Jaali (perforated screen)'], ...(overlays ? [[C.cool, 'SW low inlet (cool air)'], [C.warm, 'High exhaust (warm air)']] : [])]
      : [[C.poche, 'Parapets 1.0 m + stone coping'], [C.greenFill, 'Planters (≥ 0.6 m from guards)'], ['rgba(40,60,110,0.3)', 'PV pergola 11° south'], ...(overlays ? [[C.water, 'Falls + scuppers to the court']] : [])];
  for (const [col, label] of items) {
    ctx.fillStyle = col; ctx.fillRect(x + pad, cy + 1 * dpr, 14 * dpr, 10 * dpr);
    ctx.strokeStyle = C.soft; ctx.strokeRect(x + pad, cy + 1 * dpr, 14 * dpr, 10 * dpr);
    ctx.font = `500 ${11 * dpr}px system-ui, sans-serif`; ctx.fillStyle = C.ink; ctx.textBaseline = 'top';
    ctx.fillText(label, x + pad + 20 * dpr, cy);
    cy += 16 * dpr;
    if (!side && cy > y + h - 30 * dpr) break;
  }
  cy += 6 * dpr;
  put('Concept visualisation, not a construction drawing. Structure, drainage, setbacks and plot geometry need a survey and professional design.', 10.5, '600', '#9b3b25');
  ctx.restore();
}
