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
const wallBand = (w) => [D.LEVELS[w.level] + (w.base || 0), D.LEVELS[w.level] + (w.base || 0) + w.h];
// Openings people walk through (doors, arches and sliding glass doors).
const PASSABLE = new Set(['door', 'arch', 'slider']);
const colRect = (c) => ({ x0: c.x - c.w / 2, x1: c.x + c.w / 2, z0: c.z - c.d / 2, z1: c.z + c.d / 2 });
// Wall rect split into solid pieces, leaving passable openings (doors, arches) open.
function wallSolids(w) {
  const r = wallRect(w), len = D.wallLength(w), horiz = isHoriz(w);
  const dir = horiz ? Math.sign(w.b[0] - w.a[0]) : Math.sign(w.b[1] - w.a[1]);
  const cuts = w.openings.filter((o) => PASSABLE.has(o.type)).map((o) => [o.s, o.s + o.w]).sort((a, b) => a[0] - b[0]);
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
const H = D.HOUSE, V = D.PLOT.vertices, S = D.STAIR, BAL = D.BALCONY;
const inHouse = (x, z) => x >= H.x0 && x <= H.x1 && z >= H.z0 && z <= H.z1;
// First-floor envelope = house + north-west bay + west balcony; terrace = house + bay.
const FFR = D.FF_RECTS || [H, ...(BAL ? [BAL] : [])], TRR = D.TERRACE_RECTS || [H];
const inFF = (x, z, tol = 0.001) => FFR.some((r) => inRect(x, z, r, tol));
const inTerr = (x, z) => TRR.some((r) => inRect(x, z, r));
const inSlab = (lvl, x, z) => (lvl === 'first' ? inFF(x, z) : inTerr(x, z));
const rectInFF = (r) => sampleSeg([r.x0, r.z0], [r.x1, r.z0], 0.05).concat(sampleSeg([r.x0, r.z1], [r.x1, r.z1], 0.05), sampleSeg([r.x0, r.z0], [r.x0, r.z1], 0.05), sampleSeg([r.x1, r.z0], [r.x1, r.z1], 0.05)).every(([x, z]) => inFF(x, z));
const OPEN = (lvl) => D.SLAB_OPENINGS[lvl] || [];
const inOpening = (lvl, x, z, tol = -0.001) => OPEN(lvl).some((o) => inRect(x, z, o, tol));
const RUNS = S.runs.map((_, i) => D.stairRun(i));
const LEVELS_FIRST = D.LEVELS.first;
// Raised floor (if any) at a plan point: it replaces the first-floor slab there.
const raisedAt = (x, z) => (D.RAISED || []).find((q) => inRect(x, z, q, -0.001)) || null;
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
check(/1,620/.test(html + allJs) && /1,617/.test(html + allJs), 'The stated vs modelled plot area must be disclosed (1,620 stated, 1,617 modelled)');
check(!/function addEastServiceEave|const rainPipe\s*=|const fascia\s*=/.test(allJs + html), 'Long roof frame and downpipe must not return');
check(!/addNorthRoofWing|addWestRoofWing|addSouthRoofWing/.test(allJs + html), 'Removed broad roof wings must not return');
const planSrc = src['plan.js'] || '';
for (const label of ['16 columns', 'Courtyard overflow', 'Recharge pit', 'Silt trap', 'Flat stone coping', 'West low inlet → cross-flow → high exhaust']) {
  check(planSrc.includes(label), `Plans must label "${label}"`);
}
const b3 = src['build3d.js'] || '';
for (const [fn, why] of [['addCoping', 'Flat stone coping on exposed wall tops'], ['addRainHood', 'Rain hoods over inlets and exhausts'], ['buildGates', 'West entrance timber gates (car + front)'], ['addChannel', 'Sloped surface-water channels'], ['addJaali', 'Jaali ventilation screens']]) {
  check(new RegExp(`function ${fn}\\b`).test(b3), `${why} must be built in 3D (${fn})`);
}
check(!/neighbou?r(ing)?\s*(house|building)s?\s*=/.test(b3), 'No neighbouring buildings (keeps 360° views clear)');
for (const k of ['parapet', 'guard', 'compound']) check(D.COPING.on.includes(k), `Stone coping must cover ${k} walls`);
C.meta = { ids: ids.length, refs: refIds.size, modules: srcFiles.length };
}

// ============================================================ B. design =====
// ---- B1 plot --------------------------------------------------------------
const segLen = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]) / D.FT;
const sides = { N: segLen(V[0], V[1]), E: segLen(V[1], V[2]), S: segLen(V[2], V[3]), W: segLen(V[3], V[0]) };
const sf = D.PLOT.sidesFt, derived = D.PLOT.derivedSides || [];
// Supplied sides must be exact; derived sides must follow from the supplied geometry.
for (const k of ['N', 'S', 'W', 'E'].filter((k) => !derived.includes(k))) check(Math.abs(sides[k] - sf[k]) < 0.01, `Plot side ${k} must equal the supplied ${sf[k]} ft (model ${fx(sides[k], 3)})`);
check(Math.abs(V[0][0] - V[3][0]) < EPS, 'The west (road) side must be straight and run due north–south');
check(Math.abs(V[0][1] - V[1][1]) < EPS && Math.abs(V[2][1] - V[3][1]) < EPS, 'The north and south sides must be square to the road side (right angles at NW and SW)');
const eDerived = Math.hypot(sf.W, sf.N - sf.S);
if (derived.includes('E')) check(Math.abs(sides.E - eDerived) < 0.01 && Math.abs(sf.E - eDerived) < 0.01, `The derived east side must be √(W² + (N − S)²) = ${fx(eDerived, 2)} ft (model ${fx(sides.E, 3)})`);
const shoelace = Math.abs(V.reduce((a, p, i) => { const q = V[(i + 1) % V.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const plotSqFt = shoelace / D.FT ** 2;
check(Math.abs(plotSqFt - D.PLOT.statedAreaSqFt) / D.PLOT.statedAreaSqFt <= 0.005, `Modelled area must be within 0.5 % of the stated ${D.PLOT.statedAreaSqFt} sq ft (model ${fx(plotSqFt, 1)})`);
check(/not surveyed/i.test(D.PLOT.assumption), 'The plot outline must carry an explicit unsurveyed-geometry note');
check(Math.max(V[0][0], V[3][0]) < Math.min(V[1][0], V[2][0]), 'The road (west) edge must be the minimum-x boundary');
facts.push(`Plot sides N ${fx(sides.N)} · S ${fx(sides.S)} · W ${fx(sides.W)} · E ${fx(sides.E)} ft (E derived) → modelled ${fx(plotSqFt, 1)} sq ft (stated ${D.PLOT.statedAreaSqFt})`);

// ---- B2 house in the plot ---------------------------------------------------
// The first-floor envelope (house + balcony) may reach the compound-wall line but
// never cross the plot boundary.
for (const r of FFR) for (const c of [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]) {
  check(pip(c, V) && distB(c) >= 0.02, `First-floor corner (${c}) must stay inside the plot line (boundary distance ${fx(distB(c))} m)`);
}
const houseM2 = FFR.reduce((a, r) => a + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
facts.push(`First floor ${fx(H.x1 - H.x0)} × ${fx(H.z1 - H.z0)} m + bay + balcony = ${fx(houseM2, 1)} m² (${fx(houseM2 / D.FT ** 2, 0)} sq ft), ${fx((100 * houseM2) / (plotSqFt * D.FT ** 2), 0)} % of the plot`);

// ---- B3 columns ---------------------------------------------------------------
check(D.COLUMNS.length === 16, `The structure must have 16 columns (has ${D.COLUMNS.length})`);
const structWalls = (lvl) => D.WALLS.filter((w) => w.level === lvl && (w.kind === 'exterior' || w.kind === 'grid'));
const groundStair = RUNS.filter((r) => r.from === 'ground').map((r) => r.rect(r.lo, r.hi));
for (const c of D.COLUMNS) {
  const r = colRect(c);
  check(rectInFF(r), `Column ${c.id} must sit inside the first-floor envelope`);
  check(!OPEN('first').some((o) => rectOverlap(r, o)) && !groundStair.some((o) => rectOverlap(r, o)), `Column ${c.id} must not stand in the court void or the stair`);
  if (c.expressed) continue; // a deliberately exposed column stands free in the open plan
  const onWall = structWalls('first').some((w) => (isHoriz(w) ? Math.abs(c.z - w.a[1]) < 0.01 : Math.abs(c.x - w.a[0]) < 0.01) && inRect(c.x, c.z, wallRect(w), 0.16));
  check(onWall, `Column ${c.id} must be embedded in a first-floor wall line`);
  for (const rm of D.ROOMS) if (rm.level === 'first') check(!rectOverlap(r, rm), `Column ${c.id} must not project into ${rm.id}`);
}
for (const c of D.COLUMNS) for (const f of D.FURNITURE) if (f.level === 'ground') check(!rectOverlap(colRect(c), f), `Ground item ${f.id} must not clash with column ${c.id}`);
const gx = Object.values(D.GRID.x).sort((a, b) => a - b), gz = Object.values(D.GRID.z).sort((a, b) => a - b);
const maxSpan = Math.max(...gx.slice(1).map((v, i) => v - gx[i]), ...gz.slice(1).map((v, i) => v - gz[i]));
check(maxSpan <= 6.0, `Grid spans ≤ 6.0 m (max ${fx(maxSpan)} m)`);
// Spans over 5.0 m need deeper beams: every beam must keep span/depth ≤ 11.
for (const b of D.BEAMS) if (b.span) check(b.span / b.d <= 11 + EPS, `Beam ${b.id}: span/depth ≤ 11 (${fx(b.span)} m on ${fx(b.d * 1000, 0)} mm)`);

// ---- B4 beams and load paths ---------------------------------------------------
for (const b of D.BEAMS) {
  for (const o of D.SLAB_OPENINGS[b.level]) check(!rectOverlap(b, o), `Beam ${b.id} must not cross the ${o.id} opening`);
  check(rectInFF(b), `Beam ${b.id} must lie within the house or the balcony`);
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
// Straight runs, each along x or z in its own lane; a run = one or more flights joined
// by landings. The main stair keeps the owner's 4 ft; the terrace stair may be narrower
// where the fixed column line limits its strip, but never under 0.90 m.
const mainRun0 = RUNS.find((r) => r.from === 'ground');
check(!!mainRun0 && Math.abs(S.width - mainRun0.width) < EPS, 'STAIR.width must match the main stair lane');
for (const r of RUNS) {
  const minW = r.from === 'ground' ? 1.22 : 0.90, laneW = r.width, cc = (r.lane[0] + r.lane[1]) / 2;
  check(laneW >= minW - EPS, `Run ${r.id}: stair width ≥ ${minW === 1.22 ? '1.22 m, 4 ft' : `${fx(minW)} m`} (${fx(laneW)} m)`);
  check(rectInFF(r.rect(r.lo, r.hi)), `Run ${r.id}: the stair must lie inside the first-floor envelope`);
  const blondel = 2 * r.riser + r.tread;
  check(Math.abs(r.riser * r.risers - (r.y1 - r.y0)) < EPS, `Run ${r.id}: equal risers must add up to the storey height`);
  check(r.riser <= 0.19 + EPS, `Run ${r.id}: riser ≤ 190 mm (${fx(r.riser * 1000, 0)} mm)`);
  check(r.tread >= 0.25 - EPS, `Run ${r.id}: tread ≥ 250 mm (${fx(r.tread * 1000, 0)} mm)`);
  check(blondel >= 0.60 - EPS && blondel <= 0.65 + EPS, `Run ${r.id}: 2R + T within 600–650 mm (${fx(blondel * 1000, 0)} mm)`);
  check(r.flights.reduce((t, f) => t + f.n, 0) === r.risers, `Run ${r.id}: flights must add up to the riser count`);
  for (const f of r.flights) {
    check(f.n <= 15, `Run ${r.id}: ≤ 15 risers per flight (${f.n})`);
    check(Math.abs(f.x1 - f.x0 - (f.n - 1) * r.tread) < EPS, `Run ${r.id}: each flight must be exactly (risers − 1) treads long`);
  }
  check(r.mids.length === r.flights.length - 1, `Run ${r.id}: one landing between consecutive flights`);
  for (const m of r.mids) check(m.x1 - m.x0 >= laneW - EPS, `Run ${r.id}: the mid landing must be at least as deep as the flight width`);
  const L = r.landing, Fo = r.foot;
  check(L[1] - L[0] >= laneW - EPS && Math.abs((r.dir > 0 ? L[0] : L[1]) - r.top) < 0.005, `Run ${r.id}: the top landing must abut the last riser and be ≥ the flight width`);
  check(Fo[1] - Fo[0] >= laneW - EPS && Math.abs((r.dir > 0 ? Fo[1] : Fo[0]) - r.start) < EPS, `Run ${r.id}: the foot landing must abut the first riser and be ≥ the flight width`);
  if (r.opening) check(Math.abs((r.dir > 0 ? r.opening[1] : r.opening[0]) - r.top) < 0.005, `Run ${r.id}: the ${r.to} slab opening must end at the top riser`);
  const atL = (lvl, a) => { const [x, z] = r.pt(a, cc); return inSlab(lvl, x, z) && !inOpening(lvl, x, z); };
  check(atL(r.to, (L[0] + L[1]) / 2), `Run ${r.id}: the top landing must be ${r.to} slab`);
  check(r.from === 'ground' || atL(r.from, (Fo[0] + Fo[1]) / 2), `Run ${r.id}: the foot landing must be ${r.from} slab, not over a stairwell`);
  const treads = D.stairTreads(r.y0);
  check(treads.length === r.risers - r.flights.length, `Run ${r.id}: tread count`);
  check(Math.abs(Math.max(...treads.map((t) => t.top)) - (r.y1 - r.riser)) < EPS, `Run ${r.id}: top tread is one riser below the next floor`);
  check(Math.abs(D.stairWalkY(...r.pt(r.start, cc), r.y0) - r.y0) < 0.01, `Run ${r.id}: walking line starts at the floor`);
  check(Math.abs(D.stairWalkY(...r.pt(r.top, cc), r.y0) - r.y1) < 0.01, `Run ${r.id}: walking line arrives at the next floor`);
}
// Headroom measured vertically from the pitch line (nosings) and landings.
const runSlope = (r) => r.riser / r.tread, runCos = (r) => r.tread / Math.hypot(r.tread, r.riser);
const pitch = (r, f, a) => f.ys + r.riser + Math.abs(a - f.xs) * runSlope(r);
// Underside of each run (flights, landings) above a plan point, or null.
function runSoffit(r, x, z) {
  const [a, c] = r.loc(x, z);
  if (!(c > r.lane[0] && c < r.lane[1])) return null;
  for (const f of r.flights) if (a > f.x0 && a < f.x1) return f.ys + Math.abs(a - f.xs) * runSlope(r) - S.waist / runCos(r);
  for (const m of r.mids) if (a >= m.x0 && a <= m.x1) return m.y - S.waist;
  return null;
}
function lowestAbove(x, z, y) {
  let best = Infinity;
  const take = (v) => { if (v !== null && v > y + 0.05 && v < best) best = v; };
  for (const lvl of ['first', 'terrace']) if (inSlab(lvl, x, z) && !inOpening(lvl, x, z)) { const rf = lvl === 'first' && raisedAt(x, z); take((rf ? rf.y : D.LEVELS[lvl]) - D.SLAB); }
  for (const b of D.BEAMS) if (inRect(x, z, b, -0.001)) take(b.y0);
  if (D.MUMTY && inRect(x, z, D.MUMTY, -0.001)) take(D.MUMTY.roofTop - D.SLAB);
  for (const r of RUNS) take(runSoffit(r, x, z));
  return best;
}
let minHead = Infinity, minAt = null;
const probe = (x, z, y) => { const hr = lowestAbove(x, z, y) - y; if (hr < minHead) { minHead = hr; minAt = [x, z, y]; } };
for (const r of RUNS) {
  const cs = [r.lane[0] + 0.03, (r.lane[0] + r.lane[1]) / 2, r.lane[1] - 0.03];
  const at = (a, y) => { for (const c of cs) probe(...r.pt(a, c), y); };
  for (const f of r.flights) for (let a = f.x0 + 0.005; a < f.x1; a += 0.02) at(a, pitch(r, f, a));
  for (const m of r.mids) for (let a = m.x0 + 0.01; a < m.x1; a += 0.05) at(a, m.y);
  for (let a = r.foot[0] + 0.01; a < r.foot[1]; a += 0.05) at(a, r.y0);
  for (let a = r.landing[0] + 0.01; a < r.landing[1]; a += 0.05) at(a, r.y1);
}
check(minHead >= 2.20, `Stair headroom ≥ 2.20 m on flights and landings (min ${fx(minHead)} m at ${minAt?.map((v) => fx(v)).join(', ')})`);
const heading = (r) => (r.axis === 'z' ? (r.dir > 0 ? 'south' : 'north') : r.dir > 0 ? 'east' : 'west');
facts.push(`Stairs: straight; ${RUNS.map((r) => `${r.id} ${fx(r.width)} m wide, ${r.risers} × ${fx(r.riser * 1000, 0)} mm on ${fx(r.tread * 1000, 0)} mm treads in flights of ${r.flights.map((f) => f.n).join(' + ')}, rising ${heading(r)}, ${fx(r.hi - r.lo)} m long`).join('; ')}; min headroom ${fx(minHead)} m`);
// Raised floors: the floor above a stair's low end must leave the stair 2.2 m (checked
// above) and is reached by equal steps of ≤ 190 mm.
for (const st of D.STEPS || []) {
  const rf = (D.RAISED || []).find((q) => inRect((st.x0 + st.x1) / 2, st.z0 - 0.05, q));
  check(!!rf && Math.abs(LEVELS_FIRST + st.n * st.rise - rf.y) < EPS, `Steps ${st.id} must rise exactly to the raised floor`);
  check(st.rise <= 0.19 + EPS && (st.z1 - st.z0) / (st.n - 1) >= 0.25 - EPS, `Steps ${st.id}: riser ≤ 190 mm, tread ≥ 250 mm`);
}
// ---- B6 rooms -------------------------------------------------------------------
const minByUse = { bedroom: [7.5, 2.4], living: [9.5, 2.4], kitchen: [5.0, 1.8], bath: [2.8, 1.2], study: [2.5, 1.2], pooja: [1.5, 1.0], family: [4.0, 1.8] };
for (const r of D.ROOMS) {
  const a = D.roomArea(r), w = Math.min(r.x1 - r.x0, r.z1 - r.z0), m = minByUse[r.use];
  if (m) {
    check(a >= m[0] - EPS, `${r.name} (${r.id}) area ≥ ${m[0]} m² (${fx(a)} m²)`);
    check(w >= m[1] - EPS, `${r.name} (${r.id}) width ≥ ${m[1]} m (${fx(w)} m)`);
  }
  if (r.level === 'ground') check([[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]].every((c) => pip(c, V)), `${r.id} must lie inside the plot`);
  else check(rectInFF(r), `${r.id} must lie inside the house envelope`);
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
      if (PASSABLE.has(o.type) && o.type !== 'slider') continue;
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
      check(o.w >= (o.main ? 1.52 : 1.22) - EPS, `Door ${o.id} clear width ≥ ${o.main ? '1.52 m (5 ft main door)' : '1.22 m (4 ft)'} (${fx(o.w)} m)`);
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
  if (room?.use === 'bedroom' || room?.private) {
    check(swingRoom?.id === room.id, `Bedroom/private door ${o.id} must open inward`);
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
  // Main door: opens outward, i.e. never into the room it serves.
  if (o.main) check(!!room && swingRoom?.id !== room.id && !!swingRoom, `Main door ${o.id} must open outward (away from ${o.room})`);
  const lvlY = D.LEVELS[w.level];
  const blockers = [
    ...D.FURNITURE.filter((f) => f.level === w.level && !f.hang && f.h > 0.05).map((f) => ({ id: f.id, r: f })),
    ...D.WALLS.filter((w2) => w2 !== w && wallBand(w2)[0] <= lvlY + 0.05 && wallBand(w2)[1] > lvlY + 0.1).map((w2) => ({ id: w2.id, r: wallRect(w2) })),
    ...(w.level === 'terrace' ? [] : D.COLUMNS.map((cl) => ({ id: `column ${cl.id}`, r: colRect(cl) }))),
    ...guardRects.filter((g) => g.level === w.level).map((g) => ({ id: g.id, r: g })),
    ...(w.level === 'ground' ? [] : OPEN(w.level).map((op) => ({ id: `${op.id} opening`, r: op }))),
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
  for (const k of ['sink', 'stove']) if (f[k]) {
    const alongX = f.back === 'N' || f.back === 'S', lo = alongX ? f.x0 : f.z0, hi = alongX ? f.x1 : f.z1;
    check(f[k][0] >= lo - EPS && f[k][1] <= hi + EPS && f[k][1] > f[k][0], `${f.id} ${k} range [${f[k]}] must lie along the counter (${fx(lo)}–${fx(hi)})`);
  }
  const corners = [[f.x0, f.z0], [f.x1, f.z0], [f.x1, f.z1], [f.x0, f.z1]];
  if (f.level === 'ground') check(corners.every((p) => pip(p, V) && distB(p) >= D.COMPOUND.t - 0.001), `${f.id} must sit inside the compound wall`);
  else check(f.level === 'first' ? rectInFF(f) : f.x0 >= H.x0 && f.x1 <= H.x1 && f.z0 >= H.z0 && f.z1 <= H.z1, `${f.id} must sit inside the house`);
  if (f.level === 'first') check(!OPEN('first').some((o) => rectOverlap(f, o)), `${f.id} must not stand over the court void or stairwell`);
  if (f.level === 'terrace') check(!OPEN('terrace').some((o) => rectOverlap(f, o)) && !(D.MUMTY && rectOverlap(f, D.MUMTY)), `${f.id} must not stand in the court or stair head`);
  const fy = D.LEVELS[f.level] + (f.dy || 0);
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
  if (!PASSABLE.has(o.type)) continue;
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
const RES = 0.05, GX0 = -9.2, GZ0 = -5.2, NX = Math.ceil(18.4 / RES), NZ = Math.ceil(10.4 / RES);
// Parked (open) position of every gate leaf.
const gateOpenSegs = () => (D.GATES || [D.GATE]).flatMap((g) => D.gateLeaves(g).map((lf) => (lf.sliding ? lf.open : [lf.hinge, [lf.hinge[0] + lf.openDir[0] * lf.w, lf.hinge[1] + lf.openDir[1] * lf.w]])));
function freeGrid(level, r, skip = []) {
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
    const out = level === 'ground' ? !pip([x, z], V) || distB([x, z]) < D.COMPOUND.t + r : level === 'first' ? !inFF(x, z) : !inTerr(x, z);
    if (out) blocked[j * NX + i] = 1;
  }
  const ly = D.LEVELS[level];
  for (const w of D.WALLS) {
    const [y0, y1] = wallBand(w);
    if (y0 > ly + 0.6 || y1 <= ly + 0.3) continue;
    for (const s of wallSolids(w)) block(s);
  }
  for (const f of D.FURNITURE) if (f.level === level && !f.passable && !f.hang && !skip.includes(f.id)) block(f);
  // Every door leaf counts as open: an open door must never block a route.
  for (const d of doors) if (d.w.level === level) for (const lf of d.leaves) {
    const end = [lf.hinge[0] + lf.openDir[0] * lf.w, lf.hinge[1] + lf.openDir[1] * lf.w];
    for (const p of sampleSeg(lf.hinge, end, 0.05)) block({ x0: p[0] - 0.025, x1: p[0] + 0.025, z0: p[1] - 0.025, z1: p[1] + 0.025 });
  }
  if (level === 'ground') {
    for (const c of D.COLUMNS) block(colRect(c));
    block(D.DRAINAGE.courtBasin);
    for (const g of groundStair) block(g);
    // Gates are open by default: block the parked leaves.
    for (const [a, b] of gateOpenSegs()) for (const p of sampleSeg(a, b, 0.05)) block({ x0: p[0] - 0.03, x1: p[0] + 0.03, z0: p[1] - 0.03, z1: p[1] + 0.03 });
  } else {
    for (const o of OPEN(level)) block(o);
    for (const g of guardRects) if (g.level === level) block(g);
  }
  if (level === 'terrace') {
    for (const p of D.TERRACE.planters) block(p);
    for (const [px, pz] of [...D.TERRACE.solar.posts, ...D.TERRACE.washCanopy.posts]) block({ x0: px - 0.05, x1: px + 0.05, z0: pz - 0.05, z1: pz + 0.05 });
  }
  return blocked;
}
const cellOf = (x, z) => [Math.floor((x - GX0) / RES), Math.floor((z - GZ0) / RES)];
function reachable(level, r, from, targets, skip = []) {
  const blocked = freeGrid(level, r, skip);
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
  const seen = new Uint8Array(NX * NZ);
  const starts = (Array.isArray(from[0]) ? from : [from]).map((p) => nearestFree(p)).filter((s) => s !== null);
  const q = [...starts];
  for (const s of starts) seen[s] = 1;
  while (q.length) {
    const c = q.pop(), i = c % NX, j = (c - i) / NX;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      const n = nj * NX + ni;
      if (!seen[n] && !blocked[n]) { seen[n] = 1; q.push(n); }
    }
  }
  return targets.map((t) => { const c = nearestFree(t.p, t.rad ?? 0.6); return { ...t, ok: starts.length > 0 && c !== null && seen[c] === 1 }; });
}
const roomTarget = (id) => { const r = D.ROOMS.find((x) => x.id === id); return { id, p: [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2], rad: Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2 }; };
const GATES = D.GATES || [D.GATE];
const gateEntry = (g) => [westX((g.z0 + g.z1) / 2) + D.COMPOUND.t + 0.5, (g.z0 + g.z1) / 2];
const pedGate = GATES.find((g) => g.type === 'swing') || GATES[0], carGate = GATES.find((g) => g.type === 'sliding') || GATES[0];
const pedIn = gateEntry(pedGate), carIn = gateEntry(carGate);
const mainDoor = doors.find((d) => d.o.main);
// A point `d` metres in front of a door, on its swing side.
const doorFront = (dr, d) => { const sp = D.openingSpan(dr.w, dr.o), sw = SW[dr.o.swing]; return [(sp.p0[0] + sp.p1[0]) / 2 + sw[0] * (dr.w.t / 2 + d), (sp.p0[1] + sp.p1[1]) / 2 + sw[1] * (dr.w.t / 2 + d)]; };
// A point in front of a seat (the side opposite its back).
const seatFront = (f) => { const bk = SW[f.back || 'N'], c = [(f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2], hd = Math.abs(bk[0]) ? (f.x1 - f.x0) / 2 : (f.z1 - f.z0) / 2; return [c[0] - bk[0] * (hd + 0.4), c[1] - bk[1] * (hd + 0.4)]; };
const waterPt = D.FURNITURE.find((f) => f.type === 'waterpot');
const mainRun = RUNS.find((r) => r.from === 'ground'), upperRun = RUNS.find((r) => r.from === 'first');
const laneMid = (r) => (r.lane[0] + r.lane[1]) / 2, runAt = (r, a) => r.pt(a, laneMid(r));
const stairFoot = runAt(mainRun, mainRun.start - mainRun.dir * 0.40);
for (const t of reachable('ground', 0.3, pedIn, [
  { id: 'stair foot', p: stairFoot },
  { id: 'courtyard garden edge', p: [D.COURT.x1 + 0.6, (D.COURT.z0 + D.COURT.z1) / 2] },
  ...(waterPt ? [{ id: 'water point', p: [waterPt.x1 + 0.4, (waterPt.z0 + waterPt.z1) / 2] }] : []),
])) check(t.ok, `Ground: ${t.id} must be reachable on foot from the front gate`);
for (const r of D.ROOMS.filter((r) => r.level === 'ground' && r.vehicle === 'two-wheeler')) {
  for (const t of reachable('ground', 0.45, [pedIn, carIn], [{ ...roomTarget(r.id), rad: 0.3 }], D.FURNITURE.filter((f) => f.type === 'scooter' || f.type === 'cycle').map((f) => f.id))) check(t.ok, `Ground: ${t.id} must be reachable from a gate with a two-wheeler (0.9 m)`);
}
const carBay = D.ROOMS.find((r) => r.level === 'ground' && r.vehicle === 'car');
check(!!carBay, 'The ground floor must provide a car bay');
if (carBay) {
  // A 1.8 m wide car with 50 mm clearance each side, driven in from the car gate.
  for (const t of reachable('ground', 0.95, carIn, [{ ...roomTarget(carBay.id), rad: 0.3 }], D.FURNITURE.filter((f) => f.type === 'car').map((f) => f.id))) check(t.ok, `Ground: the car bay must be reachable from the car gate by a 1.9 m wide car`);
  const car = D.FURNITURE.find((f) => f.type === 'car');
  check(!!car && inRect(car.x0, car.z0, carBay) && inRect(car.x1, car.z1, carBay), 'The parked car must sit inside the car bay');
  check(carBay.z0 >= carGate.z0 - 0.3 && carBay.z1 <= carGate.z1 + 0.3, 'The car bay must line up with the car gate');
}
const ffArrive = runAt(mainRun, (mainRun.landing[0] + mainRun.landing[1]) / 2);
for (const t of reachable('first', 0.25, ffArrive, [
  ...D.ROOMS.filter((r) => r.level === 'first' && !['void', 'stair'].includes(r.use)).map((r) => roomTarget(r.id)),
  { id: 'terrace-stair foot', p: runAt(upperRun, (upperRun.foot[0] + upperRun.foot[1]) / 2), rad: 0.3 },
])) {
  check(t.ok, `First floor: ${t.id} must be reachable from the stair arrival (0.5 m body)`);
}
for (const t of reachable('terrace', 0.25, runAt(upperRun, (upperRun.landing[0] + upperRun.landing[1]) / 2), [
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
      if (inSlab(lvl, x, z)) check(D.SLAB_OPENINGS[lvl].some((o) => inRect(x, z, o, 0.01)), `Airflow ${p.id} must pass the ${lvl} slab through the court or stairwell (at ${fx(x)}, ${fx(z)})`);
    }
    const Ym = D.MUMTY ? D.MUMTY.roofTop - D.SLAB : Infinity;
    if (D.MUMTY && (P[1] - Ym) * (Q[1] - Ym) < 0) {
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
  const fed = chans.some((o) => o !== c && same(o.to, c.from)) || same(c.from, DR.courtBasin.weir);
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
{
  const b = DR.courtBasin, [wx, wy, wz] = b.weir;
  const onEdge = ((Math.abs(wx - b.x0) < 0.01 || Math.abs(wx - b.x1) < 0.01) && wz >= b.z0 && wz <= b.z1) || ((Math.abs(wz - b.z0) < 0.01 || Math.abs(wz - b.z1) < 0.01) && wx >= b.x0 && wx <= b.x1);
  check(onEdge && wy > b.floor && wy < b.kerbTop, 'The overflow weir must sit on the basin edge between the basin floor and kerb');
}
check(rectOverlap(DR.courtBasin, D.COURT) && DR.courtBasin.x0 <= D.COURT.x0 && DR.courtBasin.x1 >= D.COURT.x1 && DR.courtBasin.z0 <= D.COURT.z0 && DR.courtBasin.z1 >= D.COURT.z1, 'The court rain garden must catch the full open court');
const maxRun = Math.max(D.COURT.x0 - H.x0, H.x1 - D.COURT.x1, D.COURT.z0 - H.z0, H.z1 - D.COURT.z1);
check(D.TERRACE.fall / maxRun >= 1 / 100, `Terrace must fall ≥ 1:100 to the court (${fx(D.TERRACE.fall * 1000, 0)} mm over ${fx(maxRun)} m)`);
// Scuppers sit on the terrace void edge and spout into the void (and so into the rain garden).
const voids = D.SLAB_OPENINGS.terrace.filter((o) => o.id !== 'stair');
check(D.SCUPPERS.length >= 8, `At least 8 terrace scuppers (${D.SCUPPERS.length})`);
for (const [x, z, dx = 0, dz = 0] of D.SCUPPERS) {
  const inVoid = (px, pz) => voids.some((o) => inRect(px, pz, o, -0.001));
  check(Math.hypot(dx, dz) > 0.5 && inVoid(x + dx * 0.05, z + dz * 0.05) && !inVoid(x - dx * 0.05, z - dz * 0.05), `Scupper at (${fx(x)}, ${fx(z)}) must sit on the void edge and spout into the court`);
  check(inRect(x + dx * 0.2, z + dz * 0.2, DR.courtBasin), `Scupper at (${fx(x)}, ${fx(z)}) must drop into the rain garden`);
}
const minFallRatio = Math.max(...chans.map((c) => Math.hypot(c.to[0] - c.from[0], c.to[2] - c.from[2]) / (c.from[1] - c.to[1])));
facts.push(`Drainage: terrace → ${D.SCUPPERS.length} scuppers → court rain garden → weir → ${chans.length} channels (gentlest fall 1:${fx(minFallRatio, 0)}) → recharge pit; no road discharge`);

// ---- B13 gates -------------------------------------------------------------------------------
check(GATES.every((g, i) => GATES.every((h, j) => i === j || g.z1 + g.pierW <= h.z0 - h.pierW + EPS || h.z1 + h.pierW <= g.z0 - g.pierW + EPS)), 'Gate openings and piers must not overlap');
check(GATES.some((g) => g.type === 'sliding') && GATES.some((g) => g.type === 'swing'), 'The road wall needs a car gate and a separate front (pedestrian) gate');
for (const G of GATES) {
  check(G.z0 - G.pierW > -D.PLOT_HZ + D.COMPOUND.t - EPS && G.z1 + G.pierW < D.PLOT_HZ - D.COMPOUND.t + EPS, `Gate ${G.id} and piers must sit within the west boundary`);
  if (G.type === 'sliding') check(G.z1 - G.z0 >= 2.7, `Car gate clear width ≥ 2.7 m for a car turning in from the road (${fx(G.z1 - G.z0)} m)`);
  else check(G.z1 - G.z0 >= 0.9, `Front gate clear width ≥ 0.9 m (${fx(G.z1 - G.z0)} m)`);
  for (const lf of D.gateLeaves(G)) {
    let travel;
    if (lf.sliding) {
      travel = [...sampleSeg(lf.open[0], lf.open[1], 0.05), ...sampleSeg(lf.closed[0], lf.closed[1], 0.05)];
      check(Math.max(lf.open[0][1], lf.open[1][1]) <= G.z0 - 0.05 || Math.min(lf.open[0][1], lf.open[1][1]) >= G.z1 + 0.05, `Gate leaf ${lf.id} must clear the whole opening when open`);
    } else {
      // Swept quarter-disc of a hinged leaf; it must open inward, into the plot.
      travel = [];
      for (let rr = 0.05; rr <= lf.w + EPS; rr += 0.05) for (let k = 0; k <= 12; k++) {
        const a = (Math.PI / 2) * (k / 12), cs = Math.cos(a), sn = Math.sin(a);
        travel.push([lf.hinge[0] + rr * (lf.closedDir[0] * cs + lf.openDir[0] * sn), lf.hinge[1] + rr * (lf.closedDir[1] * cs + lf.openDir[1] * sn)]);
      }
      check(lf.openDir[0] > 0.5, `Front gate ${lf.id} must open inward`);
    }
    check(travel.every((p) => pip(p, V) && distB(p) >= D.COMPOUND.t - 0.001), `Gate leaf ${lf.id} must move inside the compound wall`);
    for (const f of D.FURNITURE.filter((f) => f.level === 'ground')) check(!travel.some(([x, z]) => inRect(x, z, f, 0.05)), `Gate leaf ${lf.id} travel must clear ${f.id}`);
    for (const c of D.COLUMNS) check(!travel.some(([x, z]) => inRect(x, z, colRect(c), 0.05)), `Gate leaf ${lf.id} travel must clear column ${c.id}`);
    for (const g2 of groundStair) check(!travel.some(([x, z]) => inRect(x, z, g2, 0.05)), `Gate leaf ${lf.id} travel must clear the stair`);
    const pitR = D.DRAINAGE.rechargePit, st = D.DRAINAGE.siltTrap;
    check(!travel.some(([x, z]) => Math.hypot(x - pitR.x, z - pitR.z) < pitR.r + 0.05 || (Math.abs(x - st.x) < st.size / 2 + 0.05 && Math.abs(z - st.z) < st.size / 2 + 0.05)), `Gate leaf ${lf.id} travel must clear the recharge pit and silt trap`);
  }
}

// ---- B14 viewpoints -----------------------------------------------------------------------
function floorAt(x, z, nearY) {
  const c = [];
  if (pip([x, z], V)) c.push(D.LEVELS.ground);
  else if (x < westX(z)) c.push(-D.ROAD.drop);
  if (inFF(x, z) && !inOpening('first', x, z)) c.push(raisedAt(x, z)?.y ?? D.LEVELS.first);
  for (const st of D.STEPS || []) for (const t of D.stepTreads(st)) if (inRect(x, z, t)) c.push(t.top);
  if (inTerr(x, z) && !inOpening('terrace', x, z)) c.push(D.LEVELS.terrace);
  for (const r of RUNS) { const y = D.stairWalkY(x, z, r.y0); if (y !== null) c.push(y); }
  return c.reduce((b, y) => (Math.abs(y - nearY) < Math.abs(b - nearY) ? y : b), Infinity);
}
for (const v of D.VIEWPOINTS) {
  if (v.mode !== 'walk') continue;
  const [x, y, z] = v.pos, fl = floorAt(x, z, y - D.EYE);
  check(Math.abs(y - D.EYE - fl) < 0.05, `Viewpoint ${v.id} must stand at eye height on a floor (floor ${fx(fl)}, eye ${fx(y)})`);
  const lvl = fl > D.LEVELS.terrace - 0.5 ? 'terrace' : fl > D.LEVELS.first - 0.5 ? 'first' : 'ground';
  for (const f of D.FURNITURE) if (f.level === lvl && !f.hang) check(!inRect(x, z, f, 0.15), `Viewpoint ${v.id} must not stand inside ${f.id}`);
  for (const w of D.WALLS) { const [y0, y1] = wallBand(w); if (fl >= y0 - 0.1 && fl < y1) check(!wallSolids(w).some((s) => inRect(x, z, s, 0.2)), `Viewpoint ${v.id} must not stand in wall ${w.id}`); }
  if (lvl !== 'ground') check(!OPEN(lvl).some((o) => inRect(x, z, o, 0.15)), `Viewpoint ${v.id} must not stand over the court void or stairwell`);
  if (lvl === 'ground') check(!D.COLUMNS.some((c) => inRect(x, z, colRect(c), 0.25)), `Viewpoint ${v.id} must not stand in a column`);
}

// ---- B15 court edges ------------------------------------------------------------------------
const courtW = D.COURT.x1 - D.COURT.x0, courtD = D.COURT.z1 - D.COURT.z0;
check(courtW >= 2.4 - EPS && courtD >= 2.4 - EPS, `Nadumuttam must be at least 2.4 × 2.4 m (${fx(courtW)} × ${fx(courtD)})`);
{
  // Guarded court sides open to the walkway, living, kitchen or library walk; closed
  // sides are walls with an opening (window or jaali) onto the court.
  const g = D.GUARDS.find((x) => x.court) || D.GUARDS.find((x) => x.level === 'first');
  const C0 = D.COURT;
  const edge = { N: [[C0.x0, C0.z0], [C0.x1, C0.z0]], S: [[C0.x0, C0.z1], [C0.x1, C0.z1]], W: [[C0.x0, C0.z0], [C0.x0, C0.z1]], E: [[C0.x1, C0.z0], [C0.x1, C0.z1]] };
  const out = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
  const guarded = (pt, o) => guardRects.some((bd) => bd.level === 'first' && inRect(pt[0] + o[0] * 0.05, pt[1] + o[1] * 0.05, bd, 0.001));
  const openSides = [];
  for (const side of ['N', 'S', 'W', 'E']) {
    const [ea, eb] = edge[side], mid = [(ea[0] + eb[0]) / 2, (ea[1] + eb[1]) / 2], o = out[side];
    if (guarded(mid, o)) {
      openSides.push(side);
      const beyond = roomAt('first', mid[0] + o[0] * (g.t + 0.3), mid[1] + o[1] * (g.t + 0.3));
      check(!!beyond && ['hall', 'family', 'living', 'kitchen', 'library'].includes(beyond.use), `Court ${side} side must open to the walkway, living, kitchen or library (found ${beyond?.id || 'nothing'})`);
      const clear = beyond ? (o[1] ? beyond.z1 - beyond.z0 : beyond.x1 - beyond.x0) : 0;
      check(clear >= 0.95 - EPS, `Circulation beside the court (${side}) must be ≥ 0.95 m clear (${fx(clear)} m)`);
    } else {
      const wall = D.WALLS.find((w) => w.level === 'first' && (w.kind === 'grid' || w.kind === 'exterior') && isHoriz(w) === (side === 'N' || side === 'S') && inRect(mid[0] + o[0] * (w.t / 2), mid[1] + o[1] * (w.t / 2), wallRect(w), 0.01));
      check(!!wall, `Court ${side} side must be guarded or closed by a wall (none found)`);
      if (wall) {
        const kk = side === 'N' || side === 'S' ? 0 : 1;
        const win = wall.openings.some((op) => op.court && (op.type === 'window' || op.type === 'jaali') && (() => { const sp = D.openingSpan(wall, op); return Math.max(sp.p0[kk], sp.p1[kk]) > Math.min(ea[kk], eb[kk]) && Math.min(sp.p0[kk], sp.p1[kk]) < Math.max(ea[kk], eb[kk]); })());
        check(win, `The wall on the court's ${side} side must have a window or jaali onto the court`);
      }
    }
  }
  check(openSides.includes('N') && openSides.length >= 2, `The court must open on at least two sides, including the north walkway (open: ${openSides.join(', ')})`);
}
for (const w of D.WALLS) for (const o of w.openings) if (o.court) check((o.type === 'window' || o.type === 'jaali') && o.sill >= 0.85 && o.grille !== false, `Court opening ${o.id} needs a sill ≥ 0.85 m and a grille or jaali (first floor over the court)`);

return C;
}
