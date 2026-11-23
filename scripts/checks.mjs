// Semantic validation for the courtyard walkthrough.
//
// Earlier versions pinned exact source coordinates. This version checks
// architectural intent against the shared design data (src/design.js):
// plot geometry, structure, stair rules and headroom, rooms, doors, circulation,
// airflow, drainage and safety. It also checks interaction and accessibility
// invariants in the web sources.
//
// Used by scripts/validate.mjs (CLI) and tests/validator.test.mjs (mutation tests).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const fx = (v, d = 2) => Number(v).toFixed(d);
const EPS = 1e-6;
function checker() {
  const C = { failures: [], warnings: [], facts: [], count: 0, meta: {} };
  C.check = (ok, msg) => { C.count++; if (!ok) C.failures.push(msg); return ok; };
  C.warn = (ok, msg) => { if (!ok) C.warnings.push(msg); };
  return C;
}

// D = the design module namespace (or a modified copy, for mutation tests).
// root = repository root. sources=false skips the web-source checks.
export function validate({ D, root, sources = true }) {
const C = checker(), { check, warn, facts } = C;

// ------------------------------------------------------------ geometry ----
const rectOverlap = (a, b, tol = 0.001) => a.x0 < b.x1 - tol && b.x0 < a.x1 - tol && a.z0 < b.z1 - tol && b.z0 < a.z1 - tol;
const inRect = (x, z, r, tol = 0) => x >= r.x0 - tol && x <= r.x1 + tol && z >= r.z0 - tol && z <= r.z1 + tol;
const expand = (r, d) => ({ x0: r.x0 - d, x1: r.x1 + d, z0: r.z0 - d, z1: r.z1 + d });
const rectDist = (a, b) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));
const isHoriz = (w) => Math.abs(w.a[1] - w.b[1]) < EPS;
function wallRect(w) {
  const [ax, az] = w.a, [bx, bz] = w.b, h = w.t / 2;
  if (Math.abs(az - bz) < EPS) return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: az - h, z1: az + h };
  if (Math.abs(ax - bx) < EPS) return { x0: ax - h, x1: ax + h, z0: Math.min(az, bz), z1: Math.max(az, bz) };
  return null;
}
const wallBand = (w) => [D.LEVELS[w.level], D.LEVELS[w.level] + w.h];
const colRect = (c) => ({ x0: c.x - c.w / 2, x1: c.x + c.w / 2, z0: c.z - c.d / 2, z1: c.z + c.d / 2 });
// Wall rect split into solid pieces, leaving passable openings (doors, arches) open.
function wallSolids(w) {
  const r = wallRect(w), len = D.wallLength(w), horiz = isHoriz(w);
  const dir = horiz ? Math.sign(w.b[0] - w.a[0]) : Math.sign(w.b[1] - w.a[1]);
  const cuts = w.openings.filter((o) => o.type === 'door' || o.type === 'arch').map((o) => [o.s, o.s + o.w]).sort((a, b) => a[0] - b[0]);
  const parts = [];
  let cur = 0;
  for (const [s0, s1] of cuts) { if (s0 > cur) parts.push([cur, s0]); cur = Math.max(cur, s1); }
  if (cur < len) parts.push([cur, len]);
  return parts.map(([s0, s1]) => {
    if (horiz) { const xa = w.a[0] + dir * s0, xb = w.a[0] + dir * s1; return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: r.z0, z1: r.z1 }; }
    const za = w.a[1] + dir * s0, zb = w.a[1] + dir * s1;
    return { x0: r.x0, x1: r.x1, z0: Math.min(za, zb), z1: Math.max(za, zb) };
  });
}
function segX(p, q, a, b) {
  const rx = q[0] - p[0], rz = q[1] - p[1], sx = b[0] - a[0], sz = b[1] - a[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-12) return null;
  const u = ((a[0] - p[0]) * sz - (a[1] - p[1]) * sx) / den;
  const v = ((a[0] - p[0]) * rz - (a[1] - p[1]) * rx) / den;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v } : null;
}
const sampleSeg = (a, b, step = 0.1) => {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
};
const H = D.HOUSE, V = D.PLOT.vertices, S = D.STAIR;
const inHouse = (x, z) => x >= H.x0 && x <= H.x1 && z >= H.z0 && z <= H.z1;
// Plot geometry computed independently of design.js helpers (they read module internals).
const pip = ([x, z], pts = V) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
const distB = ([x, z]) => Math.min(...V.map((a, i) => {
  const b = V[(i + 1) % V.length], dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
}));
const westX = (z) => { const [a, b] = [V[3], V[0]]; return a[0] + ((z - a[1]) / (b[1] - a[1])) * (b[0] - a[0]); };

// ============================================================ A. sources ====
if (sources) {
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const srcDir = path.join(root, 'src');
const srcFiles = readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort();
const src = Object.fromEntries(srcFiles.map((f) => [f, readFileSync(path.join(srcDir, f), 'utf8')]));
const allJs = Object.values(src).join('\n');
for (const f of ['design.js', 'build3d.js', 'textures.js', 'walk.js', 'plan.js', 'main.js']) check(f in src, `src/${f} must exist`);

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
const dupIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
check(dupIds.length === 0, `HTML IDs must be unique (duplicates: ${dupIds.join(', ')})`);
const refIds = new Set([...allJs.matchAll(/(?:getElementById|\$)\(\s*['"]([A-Za-z][\w-]*)['"]\s*\)/g)].map((m) => m[1]));
const missingIds = [...refIds].filter((id) => !ids.includes(id));
check(missingIds.length === 0, `Every element referenced from JS must exist in index.html (missing: ${missingIds.join(', ')})`);
for (const f of srcFiles) {
  const r = spawnSync(process.execPath, ['--check', path.join(srcDir, f)], { encoding: 'utf8' });
  check(r.status === 0, `src/${f} must parse as an ES module: ${(r.stderr || '').trim().split('\n').slice(0, 5).join(' | ')}`);
}
check(/<script type="module" src="\.\/src\/main\.js"><\/script>/.test(html), 'index.html must load src/main.js as a module');
const importMap = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
check(!!importMap, 'index.html must define an import map');
if (importMap) {
  let map = null;
  try { map = JSON.parse(importMap[1]); } catch { check(false, 'Import map must be valid JSON'); }
  const im = map?.imports || {};
  check(typeof im.three === 'string' && existsSync(path.join(root, im.three)), 'Import map must resolve "three" to the vendored build');
  check(typeof im['three/addons/'] === 'string' && existsSync(path.join(root, im['three/addons/'])), 'Import map must resolve "three/addons/" to vendored addons');
  check(Object.values(im).every((v) => !/^https?:/i.test(v)), 'Import map must not depend on a CDN');
  for (const m of allJs.matchAll(/from\s+['"]three\/addons\/([^'"]+)['"]/g)) {
    check(existsSync(path.join(root, im['three/addons/'] || '', m[1])), `Vendored addon missing: three/addons/${m[1]}`);
  }
}
check(!/from\s+['"]https?:/i.test(allJs), 'Modules must not import from a CDN');
const viewport = (html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/) || [])[1] || '';
check(/width=device-width, initial-scale=1\.0/.test(viewport), 'Viewport must be width=device-width, initial-scale=1.0');
check(!/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(viewport), 'Mobile zoom must remain enabled');
check(/aria-controls="controls-body"/.test(html) && ids.includes('controls-body'), 'Controls toggle must expose its controlled panel');
check(/aria-expanded="(true|false)"/.test(html), 'Controls toggle must expose its expanded state');
check(/window\.addEventListener\('blur'/.test(allJs), 'Held movement must clear when the window loses focus');
check(/requestPointerLock\?\.\(\)/.test(allJs), 'Desktop Walk mode must support pointer-lock recovery');
check(/touchstart|pointerdown/.test(src['walk.js'] || ''), 'Walk mode must support touch input');
check(/Concept visualisation/i.test(html) && /not a construction drawing/i.test(html), 'The concept disclaimer must be visible in the page');
check(/1,620/.test(html + allJs) && /1,596/.test(html + allJs), 'The stated vs possible plot area discrepancy must be disclosed');
check(!/function addEastServiceEave|const rainPipe\s*=|const fascia\s*=/.test(allJs + html), 'Long roof frame and downpipe must not return');
check(!/addNorthRoofWing|addWestRoofWing|addSouthRoofWing/.test(allJs + html), 'Removed broad roof wings must not return');
const planSrc = src['plan.js'] || '';
for (const label of ['12 columns', 'Courtyard overflow', 'Recharge pit', 'Gate intercept', 'Wall-top clay tiles', 'SW low inlet → cross-flow → high exhaust']) {
  check(planSrc.includes(label), `Plans must label "${label}"`);
}
const b3 = src['build3d.js'] || '';
for (const [fn, why] of [['addCopingTiles', 'Individual wall-top clay tiles'], ['addRainHood', 'Rain hoods over inlets and exhausts'], ['buildGate', 'West entrance timber gate'], ['addChannel', 'Sloped surface-water channels'], ['addJaali', 'Jaali ventilation screens']]) {
  check(new RegExp(`function ${fn}\\b`).test(b3), `${why} must be built in 3D (${fn})`);
}
check(!/neighbou?r(ing)?\s*(house|building)s?\s*=/.test(b3), 'No neighbouring buildings (keeps 360° views clear)');
for (const k of ['parapet', 'guard', 'compound']) check(D.COPING.on.includes(k), `Clay coping tiles must cover ${k} walls`);
C.meta = { ids: ids.length, refs: refIds.size, modules: srcFiles.length };
}

// ============================================================ B. design =====
// ---- B1 plot --------------------------------------------------------------
const segLen = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]) / D.FT;
const sides = { N: segLen(V[0], V[1]), E: segLen(V[1], V[2]), S: segLen(V[2], V[3]), W: segLen(V[3], V[0]) };
for (const k of ['N', 'S', 'W', 'E']) check(Math.abs(sides[k] - D.PLOT.sidesFt[k]) < 0.01, `Plot side ${k} must equal the supplied ${D.PLOT.sidesFt[k]} ft (model ${fx(sides[k], 3)})`);
const shoelace = Math.abs(V.reduce((a, p, i) => { const q = V[(i + 1) % V.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const sf = D.PLOT.sidesFt, semi = (sf.N + sf.S + sf.W + sf.E) / 2;
const plotSqFt = shoelace / D.FT ** 2, maxSqFt = Math.sqrt((semi - sf.N) * (semi - sf.S) * (semi - sf.W) * (semi - sf.E));
check(Math.abs(maxSqFt - D.PLOT.maxPossibleAreaSqFt) < 0.1, `Documented maximum area must match Brahmagupta (${fx(maxSqFt, 1)} sq ft)`);
check(plotSqFt <= maxSqFt + 0.1, 'Modelled area cannot exceed the maximum for the supplied sides');
if (D.PLOT.statedAreaSqFt > maxSqFt) check(/not surveyed/i.test(D.PLOT.assumption), 'An impossible stated area must be paired with an explicit unsurveyed-geometry assumption');
check(Math.max(V[0][0], V[3][0]) < Math.min(V[1][0], V[2][0]), 'The road (west) edge must be the minimum-x boundary');
facts.push(`Plot sides N ${fx(sides.N)} · S ${fx(sides.S)} · W ${fx(sides.W)} · E ${fx(sides.E)} ft → modelled ${fx(plotSqFt, 1)} sq ft (stated ${D.PLOT.statedAreaSqFt}, maximum possible ${fx(maxSqFt, 1)})`);

// ---- B2 house in the plot ---------------------------------------------------
for (const c of [[H.x0, H.z0], [H.x1, H.z0], [H.x1, H.z1], [H.x0, H.z1]]) {
  check(pip(c, V), `House corner (${c}) must be inside the plot`);
  check(distB(c) >= D.COMPOUND.t + 0.25, `House corner (${c}) must clear the compound wall by ≥ 0.25 m (boundary distance ${fx(distB(c))} m)`);
}
const houseM2 = (H.x1 - H.x0) * (H.z1 - H.z0);
facts.push(`First floor ${fx(H.x1 - H.x0)} × ${fx(H.z1 - H.z0)} m = ${fx(houseM2, 1)} m² (${fx(houseM2 / D.FT ** 2, 0)} sq ft), ${fx((100 * houseM2) / (plotSqFt * D.FT ** 2), 0)} % of the plot`);

// ---- B3 columns ---------------------------------------------------------------
check(D.COLUMNS.length === 12, `The structure must have 12 columns (has ${D.COLUMNS.length})`);
const structWalls = (lvl) => D.WALLS.filter((w) => w.level === lvl && (w.kind === 'exterior' || w.kind === 'grid'));
for (const c of D.COLUMNS) {
  const r = colRect(c);
  check(r.x0 >= H.x0 - EPS && r.x1 <= H.x1 + EPS && r.z0 >= H.z0 - EPS && r.z1 <= H.z1 + EPS, `Column ${c.id} must sit inside the house envelope`);
  check(!rectOverlap(r, D.COURT) && !rectOverlap(r, S.box), `Column ${c.id} must not stand in the court void or the stair`);
  const onWall = structWalls('first').some((w) => (isHoriz(w) ? Math.abs(c.z - w.a[1]) < 0.01 : Math.abs(c.x - w.a[0]) < 0.01) && inRect(c.x, c.z, wallRect(w), 0.16));
  check(onWall, `Column ${c.id} must be embedded in a first-floor wall line`);
  for (const rm of D.ROOMS) if (rm.level === 'first') check(!rectOverlap(r, rm), `Column ${c.id} must not project into ${rm.id}`);
  for (const f of D.FURNITURE) if (f.level === 'ground') check(!rectOverlap(r, f), `Ground item ${f.id} must not clash with column ${c.id}`);
}
const gx = Object.values(D.GRID.x).sort((a, b) => a - b), gz = Object.values(D.GRID.z).sort((a, b) => a - b);
const maxSpan = Math.max(...gx.slice(1).map((v, i) => v - gx[i]), ...gz.slice(1).map((v, i) => v - gz[i]));
check(maxSpan <= 5.0, `Grid spans ≤ 5.0 m for 230 × 450 mm beams (max ${fx(maxSpan)} m)`);

// ---- B4 beams and load paths ---------------------------------------------------
for (const b of D.BEAMS) {
  for (const o of D.SLAB_OPENINGS[b.level]) check(!rectOverlap(b, o), `Beam ${b.id} must not cross the ${o.id} opening`);
  check(b.x0 >= H.x0 - EPS && b.x1 <= H.x1 + EPS && b.z0 >= H.z0 - EPS && b.z1 <= H.z1 + EPS, `Beam ${b.id} must lie within the house`);
  const floorBelow = b.level === 'first' ? D.LEVELS.ground : D.LEVELS.first;
  check(b.y0 - floorBelow >= 2.10 - EPS, `Beam ${b.id} soffit must leave ≥ 2.10 m headroom (${fx(b.y0 - floorBelow)} m)`);
}
for (const lvl of ['first', 'terrace']) {
  for (const c of D.COLUMNS) {
    const n = D.BEAMS.filter((b) => b.level === lvl && inRect(c.x, c.z, b, 0.01)).length;
    check(n >= 2, `Column ${c.id} must frame ≥ 2 beams at ${lvl} level (has ${n})`);
  }
}
for (const w of D.WALLS) {
  let lvl = null;
  if ((w.level === 'first' || w.level === 'ground') && (w.kind === 'exterior' || w.kind === 'grid')) lvl = 'first';
  if (w.level === 'terrace') lvl = 'terrace';
  if (!lvl) continue;
  const loose = sampleSeg(w.a, w.b, 0.05).filter(([x, z]) => !D.BEAMS.some((b) => b.level === lvl && inRect(x, z, b, 0.002)));
  check(loose.length === 0, `Wall ${w.id} must bear on (or fit under) ${lvl}-level beams; unsupported near ${loose.slice(0, 2).map((p) => p.map((v) => fx(v)).join(',')).join(' ')}`);
}

// ---- B5 stair rules -----------------------------------------------------------
const storeyH = D.LEVELS.first - D.LEVELS.ground;
check(Math.abs(S.riser * S.risers - storeyH) < EPS && Math.abs(D.LEVELS.terrace - D.LEVELS.first - storeyH) < EPS, 'Both storeys must use the same equal risers');
check(S.risers % 2 === 0, 'A dog-leg stair needs an even riser count');
check(S.riser <= 0.19 + EPS, `Riser ≤ 190 mm (${fx(S.riser * 1000, 0)} mm)`);
check(S.tread >= 0.25 - EPS, `Tread ≥ 250 mm (${fx(S.tread * 1000, 0)} mm)`);
const blondel = 2 * S.riser + S.tread;
check(blondel >= 0.60 && blondel <= 0.65, `2R + T within 600–650 mm (${fx(blondel * 1000, 0)} mm)`);
check(Math.abs(S.flight.x1 - S.flight.x0 - (S.risers / 2 - 1) * S.tread) < EPS, 'Each flight must be exactly (risers/2 − 1) treads long');
const laneW = Math.min(S.laneN.z1 - S.laneN.z0, S.laneS.z1 - S.laneS.z0);
check(laneW >= 0.90 - EPS, `Flight width ≥ 0.90 m (${fx(laneW)})`);
check(S.midLanding.x1 - S.midLanding.x0 >= laneW && S.floorLanding.x1 - S.floorLanding.x0 >= laneW, 'Landings must be at least as deep as the flight width');
check(Math.abs(S.floorLanding.x1 - S.flight.x0) < EPS && Math.abs(S.flight.x1 - S.midLanding.x0) < EPS, 'Landings must abut the flights');
check(Math.abs(S.opening.x0 - S.flight.x0) < EPS && S.opening.x1 >= S.midLanding.x1 - EPS, 'The slab opening must expose both flights and the mid landing; the floor landing stays solid');
for (const y0 of [D.LEVELS.ground, D.LEVELS.first]) {
  const treads = D.stairTreads(y0);
  check(treads.length === S.risers - 2, 'Tread count per storey');
  check(Math.abs(Math.max(...treads.map((t) => t.top)) - (y0 + (S.risers - 1) * S.riser)) < EPS, 'Top tread is one riser below the next floor');
  const zN = (S.laneN.z0 + S.laneN.z1) / 2, zS = (S.laneS.z0 + S.laneS.z1) / 2;
  check(Math.abs(D.stairWalkY(S.flight.x0, zN, y0) - y0) < 0.01, 'Walking line starts at the floor (flight 1)');
  check(Math.abs(D.stairWalkY(S.flight.x0, zS, y0) - (y0 + storeyH)) < 0.01, 'Walking line arrives at the next floor (flight 2)');
}
// Headroom measured vertically from the pitch line (nosings) and landings.
const cosT = S.tread / Math.hypot(S.tread, S.riser), slope = S.riser / S.tread, half = S.risers / 2;
const pitch = (fl, x, y0) => (fl === 1 ? y0 + S.riser + (x - S.flight.x0) * slope : y0 + (half + 1) * S.riser + (S.flight.x1 - x) * slope);
const soffit = (fl, x, y0) => (fl === 1 ? y0 + (x - S.flight.x0) * slope : y0 + half * S.riser + (S.flight.x1 - x) * slope) - S.waist / cosT;
function lowestAbove(x, z, y) {
  let best = Infinity;
  const take = (v) => { if (v > y + 0.05 && v < best) best = v; };
  for (const lvl of ['first', 'terrace']) if (inHouse(x, z) && !D.SLAB_OPENINGS[lvl].some((o) => inRect(x, z, o, -0.001))) take(D.LEVELS[lvl] - D.SLAB);
  for (const b of D.BEAMS) if (inRect(x, z, b, -0.001)) take(b.y0);
  if (inRect(x, z, D.MUMTY, -0.001)) take(D.MUMTY.roofTop - D.SLAB);
  for (const st of [D.LEVELS.ground, D.LEVELS.first]) {
    if (x > S.flight.x0 && x < S.flight.x1) {
      if (z > S.laneN.z0 && z < S.laneN.z1) take(soffit(1, x, st));
      if (z > S.laneS.z0 && z < S.laneS.z1) take(soffit(2, x, st));
    }
    if (x > S.midLanding.x0 && x < S.midLanding.x1 && z > S.laneN.z0 && z < S.laneS.z1) take(st + half * S.riser - S.waist);
  }
  return best;
}
let minHead = Infinity, minAt = null;
const probe = (x, z, y) => { const hr = lowestAbove(x, z, y) - y; if (hr < minHead) { minHead = hr; minAt = [x, z, y]; } };
for (const st of [D.LEVELS.ground, D.LEVELS.first]) {
  for (const [fl, lane] of [[1, S.laneN], [2, S.laneS]]) {
    for (let x = S.flight.x0 + 0.005; x < S.flight.x1; x += 0.02) for (const z of [lane.z0 + 0.03, (lane.z0 + lane.z1) / 2, lane.z1 - 0.03]) probe(x, z, pitch(fl, x, st));
  }
  for (let x = S.midLanding.x0 + 0.01; x < S.midLanding.x1; x += 0.05) for (let z = S.laneN.z0 + 0.03; z < S.laneS.z1; z += 0.1) probe(x, z, st + half * S.riser);
}
for (const lvl of ['ground', 'first', 'terrace']) {
  for (let x = S.floorLanding.x0 + 0.01; x < S.floorLanding.x1; x += 0.05) for (let z = S.box.z0 + 0.03; z < S.box.z1; z += 0.1) probe(x, z, D.LEVELS[lvl]);
}
check(minHead >= 2.20, `Stair headroom ≥ 2.20 m on flights and landings (min ${fx(minHead)} m at ${minAt?.map((v) => fx(v)).join(', ')})`);
facts.push(`Stair ${S.risers} risers × ${fx(S.riser * 1000, 0)} mm, treads ${fx(S.tread * 1000, 0)} mm, 2R+T ${fx(blondel * 1000, 0)} mm, flights ${fx(laneW)} m, min headroom ${fx(minHead)} m`);

// ---- B6 rooms -------------------------------------------------------------------
const minByUse = { bedroom: [7.5, 2.4], living: [9.5, 2.4], kitchen: [5.0, 1.8], bath: [2.8, 1.2], study: [2.5, 1.2], pooja: [1.5, 1.0] };
for (const r of D.ROOMS) {
  const a = D.roomArea(r), w = Math.min(r.x1 - r.x0, r.z1 - r.z0), m = minByUse[r.use];
  if (m) {
    check(a >= m[0] - EPS, `${r.name} (${r.id}) area ≥ ${m[0]} m² (${fx(a)} m²)`);
    check(w >= m[1] - EPS, `${r.name} (${r.id}) width ≥ ${m[1]} m (${fx(w)} m)`);
  }
  if (r.level === 'ground') check([[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]].every((c) => pip(c, V)), `${r.id} must lie inside the plot`);
  else check(r.x0 >= H.x0 && r.x1 <= H.x1 && r.z0 >= H.z0 && r.z1 <= H.z1, `${r.id} must lie inside the house envelope`);
}
check(D.ROOMS.some((r) => r.use === 'bedroom' && D.roomArea(r) >= 9.5), 'At least one bedroom ≥ 9.5 m²');
for (let i = 0; i < D.ROOMS.length; i++) for (let j = i + 1; j < D.ROOMS.length; j++) {
  const a = D.ROOMS[i], b = D.ROOMS[j];
  if (a.level === b.level) check(!rectOverlap(a, b), `Rooms ${a.id} and ${b.id} must not overlap`);
}
for (const r of D.ROOMS) {
  if (r.use === 'stair' || r.use === 'void') continue;
  for (const w of D.WALLS) {
    if (w.kind === 'spine' || w.kind === 'low') continue;
    const [y0, y1] = wallBand(w), ry = D.LEVELS[r.level];
    if (ry < y0 - EPS || ry >= y1) continue;
    check(!rectOverlap(r, wallRect(w)), `Room ${r.id} must not overlap wall ${w.id}`);
  }
}
const sharedEdge = (a, b) => {
  const ox = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), oz = Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
  if (Math.abs(a.z1 - b.z0) < 0.01 || Math.abs(a.z0 - b.z1) < 0.01) return ox;
  if (Math.abs(a.x1 - b.x0) < 0.01 || Math.abs(a.x0 - b.x1) < 0.01) return oz;
  return 0;
};
function exteriorOpeningArea(r) {
  let area = 0;
  for (const w of D.WALLS.filter((w) => w.level === r.level && w.kind === 'exterior')) {
    for (const o of w.openings) {
      if (o.type === 'door' || o.type === 'arch') continue;
      const { p0, p1 } = D.openingSpan(w, o), c = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      const n = isHoriz(w) ? [0, 1] : [1, 0], d = w.t / 2 + 0.2;
      if (![-1, 1].some((sg) => inRect(c[0] + sg * n[0] * d, c[1] + sg * n[1] * d, r))) continue;
      area += o.w * (o.head - o.sill) + (o.lowJaali ? o.w * (o.lowJaali[1] - o.lowJaali[0]) : 0) + (o.vent ? o.w * 0.3 : 0);
    }
  }
  return area;
}
for (const r of D.ROOMS.filter((r) => r.level === 'first')) {
  if (['bedroom', 'living', 'kitchen', 'study', 'pooja'].includes(r.use)) {
    const area = exteriorOpeningArea(r) + sharedEdge(r, D.COURT) * 2.0;
    check(area >= D.roomArea(r) / 10, `${r.name}: daylight/vent openings ≥ 1/10 floor area (${fx(area)} m² vs ${fx(D.roomArea(r) / 10)} m²)`);
  }
  if (r.use === 'bath') check(exteriorOpeningArea(r) > 0 || !!r.ventilation, `${r.name} needs an exterior opening or declared mechanical ventilation`);
}

// ---- B7 walls and openings ----------------------------------------------------------
const levelsOverlap = (w1, w2) => { const [a0, a1] = wallBand(w1), [b0, b1] = wallBand(w2); return a0 < b1 - EPS && b0 < a1 - EPS; };
for (const w of D.WALLS) {
  check(!!wallRect(w), `Wall ${w.id} must be axis-aligned`);
  const len = D.wallLength(w), ops = [...w.openings].sort((a, b) => a.s - b.s), wr = wallRect(w);
  ops.forEach((o, i) => {
    check(o.s >= -EPS && o.s + o.w <= len + EPS, `Opening ${o.id} must lie within wall ${w.id}`);
    check(o.head > o.sill && o.head <= w.h - 0.05 + EPS, `Opening ${o.id} head (${o.head}) must sit under the wall top/beam (${fx(w.h)})`);
    if (o.vent) check(o.head + 0.40 <= w.h - 0.05 + EPS, `Opening ${o.id} vent transom must fit under the beam`);
    if (i > 0) check(ops[i - 1].s + ops[i - 1].w + 0.10 <= o.s + EPS, `Openings ${ops[i - 1].id} and ${o.id} need a ≥ 100 mm pier between them`);
    if (o.type === 'door') {
      const use = D.ROOMS.find((r) => r.id === o.room)?.use;
      check(o.w >= (o.main ? 1.0 : use === 'bath' ? 0.70 : 0.75) - EPS, `Door ${o.id} clear width (${fx(o.w)} m)`);
      check(o.head >= 2.0, `Door ${o.id} head ≥ 2.0 m`);
    }
    const { p0, p1 } = D.openingSpan(w, o);
    const oRect = isHoriz(w) ? { x0: Math.min(p0[0], p1[0]), x1: Math.max(p0[0], p1[0]), z0: wr.z0, z1: wr.z1 } : { x0: wr.x0, x1: wr.x1, z0: Math.min(p0[1], p1[1]), z1: Math.max(p0[1], p1[1]) };
    for (const w2 of D.WALLS) {
      if (w2 === w || isHoriz(w2) === isHoriz(w) || !levelsOverlap(w, w2)) continue;
      check(!rectOverlap(oRect, wallRect(w2)), `Opening ${o.id} must not run into wall ${w2.id}`);
    }
    if (w.level !== 'terrace') for (const c of D.COLUMNS) check(!rectOverlap(oRect, colRect(c)), `Opening ${o.id} must not cut column ${c.id}`);
    if (o.role) check(o.hood === true, `Opening ${o.id} (${o.role}) must have a rain hood`);
    if (o.type === 'window' && w.level === 'first' && w.kind === 'exterior' && o.sill < 1.0) check(o.grille !== false, `Low window ${o.id} on the first floor needs a safety grille`);
  });
}
for (let i = 0; i < D.WALLS.length; i++) for (let j = i + 1; j < D.WALLS.length; j++) {
  const a = D.WALLS[i], b = D.WALLS[j];
  if (isHoriz(a) === isHoriz(b) && levelsOverlap(a, b)) check(!rectOverlap(wallRect(a), wallRect(b)), `Parallel walls ${a.id} and ${b.id} must not overlap`);
}

// ---- B8 doors: swing rules and clear swing arcs ----------------------------------------
const SW = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const roomAt = (lvl, x, z) => D.ROOMS.find((r) => r.level === lvl && r.use !== 'void' && inRect(x, z, r));
const sectorPts = (leaf, deg = 90) => {
  const pts = [];
  for (let rr = 0.06; rr <= leaf.w + EPS; rr += 0.04) for (let k = 0; k <= 16; k++) {
    const a = ((deg * Math.PI) / 180) * (k / 16), c = Math.cos(a), s = Math.sin(a);
    pts.push([leaf.hinge[0] + rr * (leaf.closedDir[0] * c + leaf.openDir[0] * s), leaf.hinge[1] + rr * (leaf.closedDir[1] * c + leaf.openDir[1] * s)]);
  }
  return pts;
};
const inSector = ([x, z], leaf) => {
  const vx = x - leaf.hinge[0], vz = z - leaf.hinge[1];
  return Math.hypot(vx, vz) < leaf.w - 0.01 && vx * leaf.closedDir[0] + vz * leaf.closedDir[1] > 0.01 && vx * leaf.openDir[0] + vz * leaf.openDir[1] > 0.01;
};
const doors = [];
for (const w of D.WALLS) for (const o of w.openings) if (o.type === 'door') doors.push({ w, o, leaves: D.doorLeaves(w, o) });
const guardRects = D.GUARDS.flatMap((g) => D.guardBands(g).map((r) => ({ ...r, level: g.level, h: g.h })));
for (const { w, o, leaves } of doors) {
  check(isHoriz(w) ? 'NS'.includes(o.swing) : 'EW'.includes(o.swing), `Door ${o.id} must swing across its wall`);
  if ((o.leaves || 1) === 1) check(isHoriz(w) ? 'EW'.includes(o.hinge) : 'NS'.includes(o.hinge), `Door ${o.id} hinge must be at a jamb`);
  const { p0, p1 } = D.openingSpan(w, o), c = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], sw = SW[o.swing];
  const swingRoom = roomAt(w.level, c[0] + sw[0] * (w.t / 2 + 0.3), c[1] + sw[1] * (w.t / 2 + 0.3));
  const room = D.ROOMS.find((r) => r.id === o.room);
  if (room?.use === 'bath') check(swingRoom?.id !== room.id, `Bath door ${o.id} must open outward`);
  if (room?.use === 'bedroom') {
    check(swingRoom?.id === room.id, `Bedroom door ${o.id} must open inward`);
    const leaf = leaves[0], alongX = Math.abs(leaf.openDir[0]) > 0.5;
    const end = [leaf.hinge[0] + leaf.openDir[0] * leaf.w, leaf.hinge[1] + leaf.openDir[1] * leaf.w];
    const rests = D.WALLS.some((w2) => {
      if (w2 === w || w2.level !== w.level || isHoriz(w2) !== alongX) return false;
      const r2 = wallRect(w2);
      if (alongX) return Math.min(Math.abs(leaf.hinge[1] - r2.z0), Math.abs(leaf.hinge[1] - r2.z1)) <= 0.15 && r2.x0 <= Math.min(leaf.hinge[0], end[0]) + 0.05 && r2.x1 >= Math.max(leaf.hinge[0], end[0]) - 0.05;
      return Math.min(Math.abs(leaf.hinge[0] - r2.x0), Math.abs(leaf.hinge[0] - r2.x1)) <= 0.15 && r2.z0 <= Math.min(leaf.hinge[1], end[1]) + 0.05 && r2.z1 >= Math.max(leaf.hinge[1], end[1]) - 0.05;
    });
    check(rests, `Bedroom door ${o.id} must open against a wall`);
  }
  if (o.main) check(!swingRoom || swingRoom.use !== 'stair', `Main door ${o.id} must open outward`);
  const lvlY = D.LEVELS[w.level];
  const blockers = [
    ...D.FURNITURE.filter((f) => f.level === w.level && !f.hang && f.h > 0.05).map((f) => ({ id: f.id, r: f })),
    ...D.WALLS.filter((w2) => w2 !== w && wallBand(w2)[0] <= lvlY + 0.05 && wallBand(w2)[1] > lvlY + 0.1).map((w2) => ({ id: w2.id, r: wallRect(w2) })),
    ...(w.level === 'terrace' ? [] : D.COLUMNS.map((cl) => ({ id: `column ${cl.id}`, r: colRect(cl) }))),
    ...guardRects.filter((g) => g.level === w.level).map((g) => ({ id: g.id, r: g })),
    ...(w.level === 'first' ? [{ id: 'court void', r: D.COURT }, { id: 'stair opening', r: S.opening }] : []),
  ];
  for (const leaf of leaves) {
    const pts = sectorPts(leaf);
    for (const b of blockers) {
      const hit = pts.find(([x, z]) => inRect(x, z, b.r, -0.005));
      check(!hit, `Door ${o.id} swing must clear ${b.id}`);
    }
    for (const other of doors) {
      if (other.o === o || other.w.level !== w.level) continue;
      for (const ol of other.leaves) check(!pts.some((p) => inSector(p, ol)), `Door ${o.id} swing must not clash with door ${other.o.id}`);
    }
  }
}

// ---- B9 furniture -----------------------------------------------------------------------
for (const f of D.FURNITURE) {
  check(f.x1 > f.x0 && f.z1 > f.z0 && f.h > 0, `Furniture ${f.id} must have a positive size`);
  const corners = [[f.x0, f.z0], [f.x1, f.z0], [f.x1, f.z1], [f.x0, f.z1]];
  if (f.level === 'ground') check(corners.every((p) => pip(p, V) && distB(p) >= D.COMPOUND.t - 0.001), `${f.id} must sit inside the compound wall`);
  else check(f.x0 >= H.x0 && f.x1 <= H.x1 && f.z0 >= H.z0 && f.z1 <= H.z1, `${f.id} must sit inside the house`);
  if (f.level === 'first') check(!rectOverlap(f, D.COURT) && !rectOverlap(f, S.opening), `${f.id} must not stand over the court void or stairwell`);
  if (f.level === 'terrace') check(!rectOverlap(f, D.COURT) && !rectOverlap(f, D.MUMTY), `${f.id} must not stand in the court or stair head`);
  const fy = D.LEVELS[f.level];
  for (const w of D.WALLS) {
    const [y0, y1] = wallBand(w);
    if (fy + f.h <= y0 + EPS || fy >= y1 - EPS) continue;
    check(!rectOverlap(f, wallRect(w)), `${f.id} must not intersect wall ${w.id}`);
  }
  for (const g of guardRects) if (g.level === f.level) check(!rectOverlap(f, g), `${f.id} must not intersect ${g.id}`);
}
for (let i = 0; i < D.FURNITURE.length; i++) for (let j = i + 1; j < D.FURNITURE.length; j++) {
  const a = D.FURNITURE[i], b = D.FURNITURE[j];
  if (a.level === b.level) check(!rectOverlap(a, b), `Furniture ${a.id} and ${b.id} must not overlap`);
}
for (const w of D.WALLS) for (const o of w.openings) {
  if (o.type !== 'door' && o.type !== 'arch') continue;
  const { p0, p1 } = D.openingSpan(w, o), wr = wallRect(w);
  const zones = isHoriz(w)
    ? [{ x0: Math.min(p0[0], p1[0]), x1: Math.max(p0[0], p1[0]), z0: wr.z0 - 0.5, z1: wr.z0 }, { x0: Math.min(p0[0], p1[0]), x1: Math.max(p0[0], p1[0]), z0: wr.z1, z1: wr.z1 + 0.5 }]
    : [{ x0: wr.x0 - 0.5, x1: wr.x0, z0: Math.min(p0[1], p1[1]), z1: Math.max(p0[1], p1[1]) }, { x0: wr.x1, x1: wr.x1 + 0.5, z0: Math.min(p0[1], p1[1]), z1: Math.max(p0[1], p1[1]) }];
  for (const f of D.FURNITURE) if (f.level === w.level && !f.passable && !f.hang) for (const zn of zones) check(!rectOverlap(f, zn), `${f.id} must keep the approach to ${o.id} clear`);
}
// Child safety: climbable items near a parapet/guard need the guard ≥ item height + 0.9 m.
const guardsFor = (lvl) => [
  ...D.WALLS.filter((w) => w.level === lvl && (w.kind === 'parapet' || w.kind === 'guard')).map((w) => ({ id: w.id, r: wallRect(w), h: w.h })),
  ...guardRects.filter((g) => g.level === lvl).map((g) => ({ id: g.id, r: g, h: g.h })),
];
const climbables = [...D.FURNITURE.filter((f) => f.level !== 'ground' && f.h >= 0.3 && !f.hang), ...D.TERRACE.planters.map((p, i) => ({ ...p, id: `planter-${i + 1}`, level: 'terrace' }))];
for (const f of climbables) for (const g of guardsFor(f.level)) {
  const d = rectDist(f, g.r);
  if (d < 0.5) check(g.h >= f.h + 0.9 - EPS, `${f.id} is ${fx(d)} m from ${g.id}: guard must be ≥ ${fx(f.h + 0.9)} m (is ${fx(g.h)} m)`);
}

// ---- B10 circulation (grid flood-fill with body clearance) --------------------------------
const RES = 0.05, GX0 = -8.0, GZ0 = -5.2, NX = Math.ceil(16 / RES), NZ = Math.ceil(10.4 / RES);
function freeGrid(level, r) {
  const blocked = new Uint8Array(NX * NZ);
  const block = (rc, infl = r) => {
    const e = expand(rc, infl);
    const i0 = Math.max(0, Math.floor((e.x0 - GX0) / RES)), i1 = Math.min(NX - 1, Math.ceil((e.x1 - GX0) / RES));
    const j0 = Math.max(0, Math.floor((e.z0 - GZ0) / RES)), j1 = Math.min(NZ - 1, Math.ceil((e.z1 - GZ0) / RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = GX0 + (i + 0.5) * RES, z = GZ0 + (j + 0.5) * RES;
      if (x > e.x0 && x < e.x1 && z > e.z0 && z < e.z1) blocked[j * NX + i] = 1;
    }
  };
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = GX0 + (i + 0.5) * RES, z = GZ0 + (j + 0.5) * RES;
    const out = level === 'ground' ? !pip([x, z], V) || distB([x, z]) < D.COMPOUND.t + r : !inHouse(x, z);
    if (out) blocked[j * NX + i] = 1;
  }
  const ly = D.LEVELS[level];
  for (const w of D.WALLS) {
    const [y0, y1] = wallBand(w);
    if (y0 > ly + 0.3 || y1 <= ly + 0.3) continue;
    for (const s of wallSolids(w)) block(s);
  }
  for (const f of D.FURNITURE) if (f.level === level && !f.passable && !f.hang) block(f);
  if (level === 'ground') {
    for (const c of D.COLUMNS) block(colRect(c));
    const cb = D.DRAINAGE.courtBasin;
    block(cb);
    block({ x0: S.flight.x0, x1: S.box.x1, z0: S.box.z0, z1: S.box.z1 });
    for (const lf of D.gateLeaves()) for (const p of sampleSeg(lf.hinge, [lf.hinge[0] + lf.openDir[0] * lf.w, lf.hinge[1] + lf.openDir[1] * lf.w], 0.05)) block({ x0: p[0] - 0.03, x1: p[0] + 0.03, z0: p[1] - 0.03, z1: p[1] + 0.03 });
  } else {
    block(D.COURT);
    block(S.opening);
    for (const g of guardRects) if (g.level === level) block(g);
  }
  if (level === 'terrace') {
    for (const p of D.TERRACE.planters) block(p);
    for (const [px, pz] of [...D.TERRACE.solar.posts, ...D.TERRACE.washCanopy.posts]) block({ x0: px - 0.05, x1: px + 0.05, z0: pz - 0.05, z1: pz + 0.05 });
  }
  return blocked;
}
const cellOf = (x, z) => [Math.floor((x - GX0) / RES), Math.floor((z - GZ0) / RES)];
function reachable(level, r, from, targets) {
  const blocked = freeGrid(level, r);
  const nearestFree = ([x, z], rad = 0.6) => {
    const [ci, cj] = cellOf(x, z), k = Math.ceil(rad / RES);
    let best = null, bd = Infinity;
    for (let dj = -k; dj <= k; dj++) for (let di = -k; di <= k; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= NX || j >= NZ || blocked[j * NX + i]) continue;
      const d = di * di + dj * dj;
      if (d < bd) { bd = d; best = j * NX + i; }
    }
    return best;
  };
  const start = nearestFree(from);
  const seen = new Uint8Array(NX * NZ);
  if (start !== null) {
    const q = [start];
    seen[start] = 1;
    while (q.length) {
      const c = q.pop(), i = c % NX, j = (c - i) / NX;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
        const n = nj * NX + ni;
        if (!seen[n] && !blocked[n]) { seen[n] = 1; q.push(n); }
      }
    }
  }
  return targets.map((t) => { const c = nearestFree(t.p, t.rad ?? 0.6); return { ...t, ok: start !== null && c !== null && seen[c] === 1 }; });
}
const roomTarget = (id) => { const r = D.ROOMS.find((x) => x.id === id); return { id, p: [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2], rad: Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2 }; };
const gateIn = [westX((D.GATE.z0 + D.GATE.z1) / 2) + D.COMPOUND.t + 0.5, (D.GATE.z0 + D.GATE.z1) / 2];
const mainDoor = doors.find((d) => d.o.main);
const md = D.openingSpan(mainDoor.w, mainDoor.o);
for (const t of reachable('ground', 0.3, gateIn, [
  { id: 'main door (outside)', p: [md.p0[0] - 0.45, (md.p0[1] + md.p1[1]) / 2] },
  { id: 'stair-hall landing', p: [(S.floorLanding.x0 + S.floorLanding.x1) / 2, (S.box.z0 + S.box.z1) / 2] },
  { id: 'courtyard garden edge', p: [D.COURT.x0 - 0.6, D.COURT.z0 - 0.5] },
  { id: 'thinnai (N)', p: [-3.5, 2.6] }, { id: 'thinnai (S)', p: [-3.9, 3.6] },
  { id: 'water point', p: [-5.6, 1.0] },
])) check(t.ok, `Ground: ${t.id} must be reachable on foot from the gate`);
for (const t of reachable('ground', 0.45, gateIn, [{ id: 'two-wheeler parking', p: [-3.9, -1.15], rad: 0.2 }])) check(t.ok, `Ground: ${t.id} must be reachable from the gate with a two-wheeler (0.9 m)`);
const ffLanding = [(S.floorLanding.x0 + S.floorLanding.x1) / 2, (S.box.z0 + S.box.z1) / 2];
for (const t of reachable('first', 0.25, ffLanding, D.ROOMS.filter((r) => r.level === 'first' && !['void', 'stair'].includes(r.use)).map((r) => roomTarget(r.id)))) {
  check(t.ok, `First floor: ${t.id} must be reachable from the stair landing (0.5 m body)`);
}
const mumtyDoor = doors.find((d) => d.o.id === 'mumty-door');
const mdp = D.openingSpan(mumtyDoor.w, mumtyDoor.o);
for (const t of reachable('terrace', 0.25, ffLanding, [
  { id: 'terrace via stair-head door', p: [(mdp.p0[0] + mdp.p1[0]) / 2, mdp.p0[1] - 0.6] },
  roomTarget('t-wash'), { id: 'terrace NE corner', p: [5.0, -2.8] }, { id: 'terrace NW (solar)', p: [-4.0, -2.0] },
])) check(t.ok, `Terrace: ${t.id} must be reachable from the stair (0.5 m body)`);

// ---- B11 airflow ---------------------------------------------------------------------------
const opById = new Map();
for (const w of D.WALLS) for (const o of w.openings) opById.set(o.id, { w, o });
const bandsOf = (o) => {
  const b = [];
  if (o.type === 'door' || o.type === 'arch') b.push([0, o.head]);
  else b.push([o.sill, o.head]);
  if (o.lowJaali) b.push(o.lowJaali);
  if (o.vent) b.push([o.head + 0.10, o.head + 0.40]);
  return b;
};
for (const inl of D.AIRFLOW.inlets) {
  check(inl.at[0] < 0.5 && inl.at[2] > -0.5, `Inlet ${inl.id} must be on the south-west side`);
  if (inl.opening) {
    const ref = opById.get(inl.opening);
    check(!!ref && !!ref.o.lowJaali && ref.o.lowJaali[1] <= 0.65 && ref.o.role === 'inlet', `Inlet ${inl.id} must use a low-level jaali (≤ 0.65 m)`);
    const facesSW = ref && ref.w.kind === 'exterior' && (isHoriz(ref.w) ? ref.w.a[1] > 0 : ref.w.a[0] < 0);
    check(facesSW, `Inlet ${inl.id} must be on a south or west facade`);
  } else check(inl.at[1] - D.LEVELS.ground <= 1.2, `Inlet ${inl.id} must be low`);
}
for (const ex of D.AIRFLOW.exhausts) {
  if (ex.opening) {
    const ref = opById.get(ex.opening);
    check(!!ref && ref.o.role === 'exhaust' && ref.o.sill >= 1.6, `Exhaust ${ex.id} must be a high-level opening (sill ≥ 1.6 m)`);
  } else check(inRect(ex.at[0], ex.at[2], D.COURT) && ex.at[1] >= D.LEVELS.terrace + 1.0, `Exhaust ${ex.id} must vent above the terrace through the open court`);
}
const near3 = (a, b, tol = 0.35) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= tol;
for (const p of D.AIRFLOW.paths) {
  const inl = D.AIRFLOW.inlets.find((i) => i.id === p.from), ex = D.AIRFLOW.exhausts.find((e) => e.id === p.to);
  check(!!inl && !!ex, `Airflow ${p.id} must link a declared inlet to a declared exhaust`);
  if (!inl || !ex) continue;
  check(near3(p.pts[0], inl.at), `Airflow ${p.id} must start at inlet ${inl.id}`);
  check(p.pts.some((q) => near3(q, ex.at, 0.05)), `Airflow ${p.id} must pass through exhaust ${ex.id}`);
  check(p.pts[p.pts.length - 1][1] >= p.pts[0][1] + 1.5, `Airflow ${p.id} must rise from low inlet to high exhaust`);
  for (let k = 1; k < p.pts.length; k++) {
    const P = p.pts[k - 1], Q = p.pts[k];
    for (const w of D.WALLS) {
      const hit = segX([P[0], P[2]], [Q[0], Q[2]], w.a, w.b);
      if (!hit) continue;
      const y = P[1] + hit.u * (Q[1] - P[1]), rel = y - D.LEVELS[w.level];
      if (rel < 0 || rel > w.h) continue;
      const d = hit.v * D.wallLength(w);
      const through = w.openings.some((o) => d >= o.s - 0.02 && d <= o.s + o.w + 0.02 && bandsOf(o).some(([b0, b1]) => rel >= b0 - 0.02 && rel <= b1 + 0.02));
      check(through || w.kind === 'screen', `Airflow ${p.id} segment ${k} crosses wall ${w.id} at ${fx(rel)} m without an opening`);
    }
    for (const lvl of ['first', 'terrace']) {
      const Y = D.LEVELS[lvl];
      if ((P[1] - Y) * (Q[1] - Y) >= 0) continue;
      const t = (Y - P[1]) / (Q[1] - P[1]), x = P[0] + t * (Q[0] - P[0]), z = P[2] + t * (Q[2] - P[2]);
      if (inHouse(x, z)) check(D.SLAB_OPENINGS[lvl].some((o) => inRect(x, z, o, 0.01)), `Airflow ${p.id} must pass the ${lvl} slab through the court or stairwell (at ${fx(x)}, ${fx(z)})`);
    }
    const Ym = D.MUMTY.roofTop - D.SLAB;
    if ((P[1] - Ym) * (Q[1] - Ym) < 0) {
      const t = (Ym - P[1]) / (Q[1] - P[1]);
      check(!inRect(P[0] + t * (Q[0] - P[0]), P[2] + t * (Q[2] - P[2]), D.MUMTY), `Airflow ${p.id} must not pass through the stair-head roof`);
    }
  }
}

// ---- B12 drainage -------------------------------------------------------------------------
const DR = D.DRAINAGE, chans = DR.channels;
const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.005;
for (const c of chans) {
  const L = Math.hypot(c.to[0] - c.from[0], c.to[2] - c.from[2]), drop = c.from[1] - c.to[1];
  check(drop > 0 && drop / L >= 1 / 200, `Channel ${c.id} must fall ≥ 1:200 (fall ${fx(drop * 1000, 0)} mm over ${fx(L)} m)`);
  for (const p of sampleSeg([c.from[0], c.from[2]], [c.to[0], c.to[2]], 0.2)) {
    check(pip(p, V) && distB(p) >= D.COMPOUND.t + c.w / 2 - 0.001, `Channel ${c.id} must stay inside the compound (no road discharge)`);
  }
  const fed = chans.some((o) => o !== c && same(o.to, c.from)) || same(c.from, DR.courtBasin.weir) || c.id.startsWith('gate-intercept-s');
  check(fed, `Channel ${c.id} must start at a source or the end of another channel`);
  const drains = chans.some((o) => o !== c && same(o.from, c.to)) || same(c.to, DR.terminal);
  check(drains, `Channel ${c.id} must discharge into another channel or the recharge pit`);
  for (const col of D.COLUMNS) check(!sampleSeg([c.from[0], c.from[2]], [c.to[0], c.to[2]], 0.05).some(([x, z]) => inRect(x, z, expand(colRect(col), c.w / 2), -0.001)), `Channel ${c.id} must not run through column ${col.id}`);
}
const pit = DR.rechargePit;
check(Math.hypot(DR.terminal[0] - pit.x, DR.terminal[2] - pit.z) <= pit.r + 0.05, 'The drainage network must terminate at the recharge pit');
check(pip([pit.x, pit.z], V) && distB([pit.x, pit.z]) >= D.COMPOUND.t + pit.r + 0.1, 'The recharge pit must sit inside the plot, clear of the compound wall');
const pitToCol = Math.min(...D.COLUMNS.map((c) => Math.hypot(c.x - pit.x, c.z - pit.z) - pit.r));
check(pitToCol >= 1.0, `Recharge pit edge ≥ 1.0 m from column centres (${fx(pitToCol)} m); confirm with soil data`);
check(Math.abs(DR.courtBasin.weir[0] - DR.courtBasin.x0) < 0.01 && DR.courtBasin.weir[1] > DR.courtBasin.floor && DR.courtBasin.weir[1] < DR.courtBasin.kerbTop, 'The overflow weir must sit on the basin edge between the basin floor and kerb');
check(rectOverlap(DR.courtBasin, D.COURT) && DR.courtBasin.x0 <= D.COURT.x0 && DR.courtBasin.x1 >= D.COURT.x1 && DR.courtBasin.z0 <= D.COURT.z0 && DR.courtBasin.z1 >= D.COURT.z1, 'The court rain garden must catch the full open court');
const maxRun = Math.max(D.COURT.x0 - H.x0, H.x1 - D.COURT.x1, D.COURT.z0 - H.z0, H.z1 - D.COURT.z1);
check(D.TERRACE.fall / maxRun >= 1 / 100, `Terrace must fall ≥ 1:100 to the court (${fx(D.TERRACE.fall * 1000, 0)} mm over ${fx(maxRun)} m)`);
check(D.SCUPPERS.length >= 8 && D.SCUPPERS.every(([x, z]) => (Math.abs(x - D.COURT.x0) < 0.01 || Math.abs(x - D.COURT.x1) < 0.01) && z >= D.COURT.z0 && z <= D.COURT.z1 || (Math.abs(z - D.COURT.z0) < 0.01 || Math.abs(z - D.COURT.z1) < 0.01) && x >= D.COURT.x0 && x <= D.COURT.x1), 'Scuppers must sit on the court guard (≥ 2 per side)');
const minFallRatio = Math.max(...chans.map((c) => Math.hypot(c.to[0] - c.from[0], c.to[2] - c.from[2]) / (c.from[1] - c.to[1])));
facts.push(`Drainage: terrace → ${D.SCUPPERS.length} scuppers → court rain garden → weir → ${chans.length} channels (gentlest fall 1:${fx(minFallRatio, 0)}) → recharge pit; no road discharge`);

// ---- B13 gate --------------------------------------------------------------------------------
const G = D.GATE;
check(G.z1 - G.z0 >= 2.4, `Gate clear width ≥ 2.4 m (${fx(G.z1 - G.z0)} m)`);
check(G.z0 - G.pierW > -D.PLOT_HZ + D.COMPOUND.t && G.z1 + G.pierW < D.PLOT_HZ - D.COMPOUND.t, 'Gate and piers must sit within the west boundary');
for (const lf of D.gateLeaves()) {
  const pts = sectorPts(lf, G.openDeg);
  check(pts.every((p) => pip(p, V)), `Gate leaf ${lf.id} must open inward (inside the plot)`);
  for (const f of D.FURNITURE.filter((f) => f.level === 'ground')) check(!pts.some(([x, z]) => inRect(x, z, f, -0.005)), `Gate leaf ${lf.id} must clear ${f.id}`);
}

// ---- B14 viewpoints -----------------------------------------------------------------------
function floorAt(x, z, nearY) {
  const c = [];
  if (pip([x, z], V)) c.push(D.LEVELS.ground);
  else if (x < westX(z)) c.push(-D.ROAD.drop);
  for (const lvl of ['first', 'terrace']) if (inHouse(x, z) && !D.SLAB_OPENINGS[lvl].some((o) => inRect(x, z, o, -0.001))) c.push(D.LEVELS[lvl]);
  for (const st of [D.LEVELS.ground, D.LEVELS.first]) { const y = D.stairWalkY(x, z, st); if (y !== null) c.push(y); }
  return c.reduce((b, y) => (Math.abs(y - nearY) < Math.abs(b - nearY) ? y : b), Infinity);
}
for (const v of D.VIEWPOINTS) {
  if (v.mode !== 'walk') continue;
  const [x, y, z] = v.pos, fl = floorAt(x, z, y - D.EYE);
  check(Math.abs(y - D.EYE - fl) < 0.05, `Viewpoint ${v.id} must stand at eye height on a floor (floor ${fx(fl)}, eye ${fx(y)})`);
  const lvl = fl > D.LEVELS.terrace - 0.5 ? 'terrace' : fl > D.LEVELS.first - 0.5 ? 'first' : 'ground';
  for (const f of D.FURNITURE) if (f.level === lvl && !f.hang) check(!inRect(x, z, f, 0.15), `Viewpoint ${v.id} must not stand inside ${f.id}`);
  for (const w of D.WALLS) { const [y0, y1] = wallBand(w); if (fl >= y0 - 0.1 && fl < y1) check(!wallSolids(w).some((s) => inRect(x, z, s, 0.2)), `Viewpoint ${v.id} must not stand in wall ${w.id}`); }
  if (lvl === 'first') check(!inRect(x, z, D.COURT, 0.15), `Viewpoint ${v.id} must not stand in the court void`);
}

// ---- B15 thinnai, verandah, court ------------------------------------------------------------
const thinnai = D.FURNITURE.filter((f) => f.type === 'thinnai');
check(thinnai.length >= 2 && thinnai.every((t) => t.h >= 0.40 && t.h <= 0.50), 'Twin thinnai with 400–500 mm seat height must flank the entrance');
check(thinnai.some((t) => t.z1 <= md.p0[1] + 0.25) && thinnai.some((t) => t.z0 >= md.p1[1] - 0.35), 'Thinnai must flank the path to the main door');
check(D.ROOMS.filter((r) => r.use === 'verandah').length >= 3, 'Shaded verandahs must wrap the court');
const courtW = D.COURT.x1 - D.COURT.x0, courtD = D.COURT.z1 - D.COURT.z0;
check(courtW >= 2.4 - EPS && courtD >= 2.4 - EPS, `Nadumuttam must be at least 2.4 × 2.4 m (${fx(courtW)} × ${fx(courtD)})`);
for (const r of D.ROOMS.filter((r) => r.use === 'verandah')) {
  const clear = Math.min(r.x1 - r.x0, r.z1 - r.z0) - 0.10;
  check(clear >= 0.95 - EPS, `${r.id} clear width after the guard ≥ 0.95 m (${fx(clear)} m)`);
}

return C;
}
