// =============================================================================
// DESIGN DATA: the single source of truth for the 3D model, the 2D plans,
// walk-mode collision and the Node validator (scripts/validate.mjs).
//
// Units: metres. Axes: +x = east (the road is on −x, the west), +z = south
// (north = −z), +y = up. Origin = centre of the plot.
//
// CONCEPT VISUALISATION ONLY, not a construction drawing. The structure,
// drainage, setbacks and plot geometry all need survey data and professional design.
// =============================================================================

export const FT = 0.3048;
export const fmtFtIn = (m) => {
  const totalIn = Math.round((m / FT) * 12);
  const ft = Math.floor(totalIn / 12), inch = totalIn - ft * 12;
  return inch ? `${ft}′-${inch}″` : `${ft}′`;
};

// ---------------------------------------------------------------- levels ----
export const LEVELS = { ground: 0.0, first: 3.20, terrace: 6.40, mumtyRoof: 9.00 };
export const SLAB = 0.15;                 // RCC slab thickness
export const BEAM = { w: 0.23, d: 0.45 }; // beam width / overall depth (incl. slab)
export const PARAPET_H = 1.0;             // terrace parapet + court guard height
export const EYE = 1.62;

// ------------------------------------------------------------------ plot ----
// Supplied: N 51 ft, S 46 ft, W 33 ft, E 33 ft, area 1,620 sq ft, road on the west.
// No quadrilateral with these four sides can enclose 1,620 sq ft: the maximum is
// 1,595.9 sq ft (Brahmagupta, cyclic case). The boundary below keeps all four
// supplied lengths exact by ASSUMING the N and S sides are parallel (an isosceles
// trapezoid, which is also the maximum-area case). Corner angles are NOT surveyed.
const halfN = (51 * FT) / 2, halfS = (46 * FT) / 2;
const legOffset = halfN - halfS;                                     // 0.762 m
const plotDepth = Math.sqrt((33 * FT) ** 2 - legOffset ** 2);        // 10.0295 m
const hz = plotDepth / 2;
export const PLOT = {
  sidesFt: { N: 51, S: 46, W: 33, E: 33 },
  statedAreaSqFt: 1620,
  maxPossibleAreaSqFt: 1595.9,
  vertices: [[-halfN, -hz], [halfN, -hz], [halfS, hz], [-halfS, hz]], // (x, z) clockwise from NW
  depth: plotDepth,
  assumption: 'Schematic boundary: N and S drawn parallel so all four stated side lengths are exact. Corner angles, bearing and levels are not surveyed.',
};
export const PLOT_HZ = hz;
// x of the west / east boundary line at a given z.
export const boundaryX = (side, z) => {
  const t = (z + hz) / plotDepth;
  const half = halfN + (halfS - halfN) * t;
  return side === 'W' ? -half : half;
};

// Compound wall: local rubble stone on the boundary, inside the plot.
export const COMPOUND = { t: 0.30, h: 1.50, coping: 0.08 };
// West gate: two reclaimed-timber leaves opening inward; z range along the W boundary.
export const GATE = { z0: 1.70, z1: 4.20, leafH: 1.55, openDeg: 90, pierW: 0.42, pierH: 1.85, t: 0.06 };
export const ROAD = { width: 6.0, drop: 0.15 };   // indicative only

// ----------------------------------------------------------------- house ----
// First-floor envelope (outer faces). Margins to the boundary are design choices
// (≈0.6 m N/S, 1.2–1.9 m on the W front, 0.6–1.3 m E). Local setback rules have not been verified.
export const HOUSE = { x0: -5.85, x1: 6.45, z0: -4.40, z1: 4.40 };
export const WALL_T = { exterior: 0.30, grid: 0.23, partition: 0.15, parapet: 0.23 };

// --------------------------------------------- 12-column structural grid ----
export const GRID = {
  x: { A: -5.70, B: -2.20, C: 2.60, D: 6.30 },
  z: { 1: -4.25, 2: 0.0, 3: 4.25 },
  column: 0.30,
};
export const COLUMNS = [];
// Columns hide inside the walls (230 × 450 mm in 9-inch walls, 300 mm at the corners),
// the usual Indian RCC practice, so no column projects into a room.
const colSize = (xl, zl) => {
  const extX = xl === 'A' || xl === 'D', extZ = zl === '1' || zl === '3';
  if (extX && extZ) return [0.30, 0.30];
  if (extZ) return [0.45, 0.30];
  if (extX) return [0.30, 0.45];
  return [0.23, 0.45];
};
for (const [xl, x] of Object.entries(GRID.x)) {
  for (const [zl, z] of Object.entries(GRID.z)) {
    const [w, d] = colSize(xl, zl);
    COLUMNS.push({ id: `${xl}${zl}`, x, z, w, d });
  }
}
// Inner wall faces used throughout (derived from the grid and wall thicknesses).
export const FACE = {
  A: GRID.x.A + WALL_T.exterior / 2,   // −5.55
  Bw: GRID.x.B - WALL_T.grid / 2,      // −2.315
  Be: GRID.x.B + WALL_T.grid / 2,      // −2.085
  Cw: GRID.x.C - WALL_T.grid / 2,      //  2.485
  Ce: GRID.x.C + WALL_T.grid / 2,      //  2.715
  D: GRID.x.D - WALL_T.exterior / 2,   //  6.15
  N: GRID.z[1] + WALL_T.exterior / 2,  // −4.10
  S: GRID.z[3] - WALL_T.exterior / 2,  //  4.10
};
const { A: fA, Bw: fBw, Be: fBe, Cw: fCw, Ce: fCe, D: fD, N: fN, S: fS } = FACE;

// ------------------------------------------------- nadumuttam (open court) ----
// 2.4 m × 2.4 m void from the ground garden to the sky, in the centre bay.
export const COURT = { x0: -1.00, x1: 1.40, z0: -1.35, z1: 1.05 };

// --------------------------------------------------------------- stair ----
// Dog-leg in the centre bay, south of the court. 18 equal risers per storey and
// 8 treads per flight. Flight 1 rises east in the north lane; flight 2 rises
// west in the south lane. The next storey repeats directly above.
export const STAIR = {
  risers: 18,
  riser: (LEVELS.first - LEVELS.ground) / 18,   // 0.1778 m
  tread: 0.27,
  laneN: { z0: 2.20, z1: 3.10 },                // clear flight width 0.90 m
  laneS: { z0: 3.20, z1: 4.10 },
  floorLanding: { x0: fBe, x1: -1.025 },        // start/arrival landing (west end), 1.06 m
  flight: { x0: -1.025, x1: 1.135 },            // 8 treads × 0.27 m
  midLanding: { x0: 1.135, x1: fCw },           // 1.35 m
  box: { x0: fBe, x1: fCw, z0: 2.20, z1: fS },
  opening: { x0: -1.025, x1: fCw, z0: 2.20, z1: fS }, // slab opening per floor; the floor landing stays solid
  waist: 0.15,
  storeys: [{ from: 'ground', to: 'first' }, { from: 'first', to: 'terrace' }],
};
// Height of the walking line at plan position (x, z) for a storey starting at y0.
// Returns null when (x, z) is not on that storey's flights or mid landing.
// A smooth line through the nosings (±0.08 m of each tread) keeps the eye steady.
export function stairWalkY(x, z, y0) {
  const s = STAIR, half = s.risers / 2;
  const inN = z >= s.laneN.z0 && z <= s.laneN.z1, inS = z >= s.laneS.z0 && z <= s.laneS.z1;
  const inGap = z > s.laneN.z1 && z < s.laneS.z0;
  if (x >= s.midLanding.x0 && x <= s.midLanding.x1 && (inN || inS || inGap)) return y0 + half * s.riser;
  if (x < s.flight.x0 || x > s.flight.x1) return null;
  const run = (x - s.flight.x0) / (s.flight.x1 - s.flight.x0);
  if (inN) return y0 + run * half * s.riser;
  if (inS) return y0 + half * s.riser + (1 - run) * half * s.riser;
  return null;
}
// Treads for one storey starting at y0: 9 risers per flight (8 treads + landing riser).
export function stairTreads(y0) {
  const s = STAIR, T = s.tread, r = s.riser, half = s.risers / 2, out = [];
  for (let k = 1; k < half; k++) {
    out.push({ flight: 1, k, x0: s.flight.x0 + (k - 1) * T, x1: s.flight.x0 + k * T, z0: s.laneN.z0, z1: s.laneN.z1, top: y0 + k * r });
  }
  for (let k = 1; k < half; k++) {
    out.push({ flight: 2, k, x0: s.flight.x1 - k * T, x1: s.flight.x1 - (k - 1) * T, z0: s.laneS.z0, z1: s.laneS.z1, top: y0 + (half + k) * r });
  }
  return out;
}

// ------------------------------------------------------- walls & openings ----
// Each opening is { id, type, s, w, sill, head } plus optional fields:
//   s = start distance from wall point a, w = width.
//   type = door | arch | window | jaali.
//   swing: side the door leaf opens to ('N'|'S'|'E'|'W').
//   hinge: the end the leaf is hinged at ('N'|'S'|'E'|'W').
//   leaves: number of door leaves. defaultOpen: initial door state.
//   vent: jaali transom above the head.
//   lowJaali: [y0, y1] low inlet band under a window.
//   role: inlet | exhaust.
// Heights are relative to the wall's own floor level.
const Wl = (id, level, a, b, t, kind, openings = [], extra = {}) => ({ id, level, a, b, t, kind, openings, ...extra });
const H1 = LEVELS.terrace - LEVELS.first - SLAB;     // 3.05 m first-floor clear height
const HM = LEVELS.mumtyRoof - LEVELS.terrace - SLAB; // 2.45 m stair-head clear height
const xs = HOUSE.x0, xe = HOUSE.x1;
const pIn = WALL_T.parapet / 2;

export const WALLS = [
  // ---------------- first floor: exterior walls (0.30 m, on grid lines) ----------------
  Wl('ff-N', 'first', [xs, GRID.z[1]], [xe, GRID.z[1]], WALL_T.exterior, 'exterior', [
    { id: 'kids-n-win', type: 'window', s: 0.85, w: 1.40, sill: 0.75, head: 2.25, vent: true },
    { id: 'living-n-win1', type: 'window', s: 4.45, w: 1.60, sill: 0.60, head: 2.25, vent: true },
    { id: 'living-n-win2', type: 'window', s: 6.65, w: 1.20, sill: 0.60, head: 2.25, vent: true },
    { id: 'library-n-win', type: 'window', s: 8.95, w: 1.00, sill: 0.90, head: 2.25, vent: true },
    { id: 'pooja-n-win', type: 'window', s: 10.85, w: 0.80, sill: 0.95, head: 2.10 },
  ]),
  Wl('ff-E', 'first', [GRID.x.D, fN], [GRID.x.D, fS], WALL_T.exterior, 'exterior', [
    { id: 'pooja-e-exhaust', type: 'jaali', s: 0.30, w: 1.00, sill: 2.15, head: 2.80, role: 'exhaust', hood: true },
    { id: 'parents-e-win', type: 'window', s: 2.60, w: 1.20, sill: 0.75, head: 2.25, vent: true },
    { id: 'parents-e-exhaust', type: 'jaali', s: 4.40, w: 0.75, sill: 2.15, head: 2.80, role: 'exhaust', hood: true },
    { id: 'kitchen-e-win', type: 'window', s: 6.10, w: 1.20, sill: 1.05, head: 2.25 },
    { id: 'kitchen-e-exhaust', type: 'jaali', s: 7.50, w: 0.55, sill: 2.15, head: 2.80, role: 'exhaust', hood: true },
  ]),
  Wl('ff-S', 'first', [xs, GRID.z[3]], [xe, GRID.z[3]], WALL_T.exterior, 'exterior', [
    { id: 'master-s-win', type: 'window', s: 0.60, w: 1.00, sill: 0.75, head: 2.25, lowJaali: [0.15, 0.60], role: 'inlet', hood: true },
    { id: 'stair-s-jaali', type: 'jaali', s: 3.90, w: 4.30, sill: 0.60, head: 2.80 },
    { id: 'kitchen-s-win', type: 'window', s: 9.30, w: 0.80, sill: 1.05, head: 2.25, vent: true },
  ]),
  Wl('ff-W', 'first', [GRID.x.A, fN], [GRID.x.A, fS], WALL_T.exterior, 'exterior', [
    { id: 'kids-w-win', type: 'window', s: 0.60, w: 1.10, sill: 0.75, head: 2.25, vent: true },
    { id: 'ensuite-w-jaali', type: 'jaali', s: 3.00, w: 0.80, sill: 1.80, head: 2.40 },
    { id: 'master-w-win', type: 'window', s: 5.80, w: 1.20, sill: 0.75, head: 2.25, lowJaali: [0.15, 0.60], role: 'inlet', hood: true },
  ]),
  // ---------------- first floor: interior walls on grid lines (0.23 m) ----------------
  Wl('ff-B', 'first', [GRID.x.B, fN], [GRID.x.B, fS], WALL_T.grid, 'grid', [
    { id: 'kids-door', type: 'door', s: 1.75, w: 0.80, head: 2.10, swing: 'W', hinge: 'S', vent: true, room: 'kids' },
    { id: 'bath-door', type: 'door', s: 2.95, w: 0.80, head: 2.10, swing: 'E', hinge: 'S', vent: true, room: 'bath', defaultOpen: false },
    { id: 'master-door', type: 'door', s: 5.05, w: 0.80, head: 2.10, swing: 'W', hinge: 'N', vent: true, room: 'master' },
  ]),
  Wl('ff-C', 'first', [GRID.x.C, fN], [GRID.x.C, fS], WALL_T.grid, 'grid', [
    { id: 'library-arch', type: 'arch', s: 0.50, w: 1.00, head: 2.40 },
    { id: 'parents-door', type: 'door', s: 4.35, w: 0.80, head: 2.10, swing: 'E', hinge: 'S', vent: true, room: 'parents' },
    { id: 'kitchen-arch', type: 'arch', s: 5.42, w: 0.80, head: 2.10, vent: true },
  ]),
  // ---------------- first floor: partitions (0.15 m) ----------------
  Wl('ff-p-kids-bath', 'first', [fA, -1.425], [fBw, -1.425], WALL_T.partition, 'partition', [
    { id: 'ensuite-door-kids', type: 'door', s: 1.025, w: 0.70, head: 2.10, swing: 'N', hinge: 'E', room: 'ensuite', defaultOpen: false },
  ]),
  Wl('ff-p-bath-master', 'first', [fA, 0.825], [fBw, 0.825], WALL_T.partition, 'partition', [
    { id: 'ensuite-door-master', type: 'door', s: 1.025, w: 0.70, head: 2.10, swing: 'S', hinge: 'E', room: 'ensuite', defaultOpen: false },
  ]),
  Wl('ff-p-ensuite-bath', 'first', [-3.75, -1.35], [-3.75, 0.75], WALL_T.partition, 'partition'),
  Wl('ff-p-pooja-parents', 'first', [fCe, -2.225], [fD, -2.225], WALL_T.partition, 'partition'),
  Wl('ff-p-library-pooja', 'first', [4.525, fN], [4.525, -2.30], WALL_T.partition, 'partition', [
    { id: 'pooja-door', type: 'door', s: 0.50, w: 0.75, head: 2.10, swing: 'W', hinge: 'N', leaves: 2, jali: true, vent: true, room: 'pooja' },
  ]),
  Wl('ff-p-parents-kitchen', 'first', [fCe, 1.225], [fD, 1.225], WALL_T.partition, 'partition'),
  // Full-height teak jaali screen guarding the flights and the mid landing. The floor
  // landing stays open to the south verandah.
  Wl('ff-stair-screen', 'first', [STAIR.flight.x0, 2.165], [fCw, 2.165], 0.06, 'screen'),

  // ---------------- ground: stair-hall enclosure (the house entrance) ----------------
  Wl('gf-stair-N', 'ground', [fBw, 2.085], [fCe, 2.085], WALL_T.grid, 'grid', [
    { id: 'stair-gf-n-jaali', type: 'jaali', s: 1.60, w: 2.50, sill: 1.00, head: 2.30 },
  ]),
  Wl('gf-stair-W', 'ground', [GRID.x.B, 2.20], [GRID.x.B, fS], WALL_T.grid, 'grid', [
    { id: 'main-door', type: 'door', s: 0.35, w: 1.05, head: 2.20, swing: 'W', hinge: 'N', leaves: 2, vent: true, main: true, room: 'stair' },
  ]),
  Wl('gf-stair-E', 'ground', [GRID.x.C, 2.20], [GRID.x.C, fS], WALL_T.grid, 'grid', [
    { id: 'stair-gf-e-jaali', type: 'jaali', s: 0.45, w: 1.20, sill: 1.40, head: 2.30 },
  ]),
  Wl('gf-stair-S', 'ground', [fBe, GRID.z[3]], [fCw, GRID.z[3]], WALL_T.exterior, 'exterior', [
    { id: 'stair-gf-s-jaali', type: 'jaali', s: 0.40, w: 3.40, sill: 1.30, head: 2.40 },
  ]),
  Wl('gf-thinnai-back', 'ground', [-4.40, 1.475], [-2.40, 1.475], 0.15, 'low', [], { h: 0.95 }),
  // Perforated terracotta spine between the two flights (ground to terrace handrail).
  Wl('stair-spine', 'ground', [STAIR.flight.x0, 3.15], [STAIR.flight.x1, 3.15], 0.10, 'spine', [], { h: LEVELS.terrace + 1.0 }),

  // ---------------- terrace: parapets, court guard and stair head (mumty) ----------------
  Wl('tr-N', 'terrace', [xs, HOUSE.z0 + pIn], [xe, HOUSE.z0 + pIn], WALL_T.parapet, 'parapet'),
  Wl('tr-S', 'terrace', [xs, HOUSE.z1 - pIn], [fBw, HOUSE.z1 - pIn], WALL_T.parapet, 'parapet'),
  Wl('tr-S2', 'terrace', [fCe, HOUSE.z1 - pIn], [4.20, HOUSE.z1 - pIn], WALL_T.parapet, 'parapet'),
  // At the wash area the washer and counter stand against the parapet, so the guard
  // rises to 1.8 m with a terracotta jaali above the 1.0 m solid parapet (child safety).
  Wl('tr-S2-wash', 'terrace', [4.20, HOUSE.z1 - pIn], [xe, HOUSE.z1 - pIn], WALL_T.parapet, 'parapet', [], { h: 1.80, jaaliAbove: PARAPET_H }),
  Wl('tr-W', 'terrace', [xs + pIn, HOUSE.z0 + 2 * pIn], [xs + pIn, HOUSE.z1 - 2 * pIn], WALL_T.parapet, 'parapet'),
  Wl('tr-E', 'terrace', [xe - pIn, HOUSE.z0 + 2 * pIn], [xe - pIn, 2.00], WALL_T.parapet, 'parapet'),
  Wl('tr-E-wash', 'terrace', [xe - pIn, 2.00], [xe - pIn, HOUSE.z1 - 2 * pIn], WALL_T.parapet, 'parapet', [], { h: 1.80, jaaliAbove: PARAPET_H }),
  Wl('tr-court-N', 'terrace', [COURT.x0 - 2 * pIn, COURT.z0 - pIn], [COURT.x1 + 2 * pIn, COURT.z0 - pIn], WALL_T.parapet, 'guard'),
  Wl('tr-court-S', 'terrace', [COURT.x0 - 2 * pIn, COURT.z1 + pIn], [COURT.x1 + 2 * pIn, COURT.z1 + pIn], WALL_T.parapet, 'guard'),
  Wl('tr-court-W', 'terrace', [COURT.x0 - pIn, COURT.z0], [COURT.x0 - pIn, COURT.z1], WALL_T.parapet, 'guard'),
  Wl('tr-court-E', 'terrace', [COURT.x1 + pIn, COURT.z0], [COURT.x1 + pIn, COURT.z1], WALL_T.parapet, 'guard'),
  Wl('tr-mumty-N', 'terrace', [fBw, 2.085], [fCe, 2.085], WALL_T.grid, 'mumty', [
    { id: 'mumty-door', type: 'door', s: 0.37, w: 0.80, head: 2.10, swing: 'N', hinge: 'W', room: 'terrace' },
    { id: 'mumty-n-exhaust', type: 'jaali', s: 2.415, w: 1.80, sill: 1.70, head: 2.30, role: 'exhaust', hood: true },
  ], { h: HM }),
  Wl('tr-mumty-W', 'terrace', [GRID.x.B, 2.20], [GRID.x.B, HOUSE.z1 - 2 * pIn], WALL_T.grid, 'mumty', [], { h: HM }),
  Wl('tr-mumty-E', 'terrace', [GRID.x.C, 2.20], [GRID.x.C, HOUSE.z1 - 2 * pIn], WALL_T.grid, 'mumty', [
    { id: 'mumty-e-exhaust', type: 'jaali', s: 0.40, w: 1.30, sill: 1.70, head: 2.30, role: 'exhaust', hood: true },
  ], { h: HM }),
  Wl('tr-mumty-S', 'terrace', [fBw, HOUSE.z1 - pIn], [fCe, HOUSE.z1 - pIn], WALL_T.parapet, 'mumty', [], { h: HM }),
];
for (const w of WALLS) {
  if (w.h === undefined) w.h = w.level === 'first' ? H1 : w.level === 'ground' ? LEVELS.first - BEAM.d : PARAPET_H;
  for (const o of w.openings) {
    if (o.sill === undefined) o.sill = 0;
    if (o.type === 'door' && o.defaultOpen === undefined) o.defaultOpen = true;
  }
}

// Guard around the court void on the first floor: vertical teak balusters on a kerb, 1.0 m high.
export const GUARDS = [
  { id: 'ff-court-guard', level: 'first', x0: COURT.x0, x1: COURT.x1, z0: COURT.z0, z1: COURT.z1, h: PARAPET_H, kerb: 0.12, t: 0.10 },
];

// ------------------------------------------------------------------ rooms ----
const R = (id, level, name, x0, x1, z0, z1, use, extra = {}) => ({ id, level, name, x0, x1, z0, z1, use, ...extra });
export const ROOMS = [
  R('kids', 'first', 'Kids', fA, fBw, fN, -1.50, 'bedroom', { dir: 'NW' }),
  R('ensuite', 'first', 'Shared bath', fA, -3.825, -1.35, 0.75, 'bath', { dir: 'W' }),
  // No exterior wall: jaali transom to the open court plus an exhaust duct to the terrace.
  R('bath', 'first', 'Common bath', -3.675, fBw, -1.35, 0.75, 'bath', { dir: 'W', ventilation: 'transom-to-court+duct' }),
  R('master', 'first', 'Master', fA, fBw, 0.90, fS, 'bedroom', { dir: 'SW' }),
  R('living', 'first', 'Living', fBe, fCw, fN, COURT.z0, 'living', { dir: 'N' }),
  R('library', 'first', 'Library alcove', fCe, 4.45, fN, -2.30, 'study', { dir: 'NE' }),
  R('pooja', 'first', 'Pooja', 4.60, fD, fN, -2.30, 'pooja', { dir: 'NE' }),
  R('parents', 'first', 'Parents', fCe, fD, -2.15, 1.15, 'bedroom', { dir: 'E' }),
  R('kitchen', 'first', 'Kitchen + dining', fCe, fD, 1.30, fS, 'kitchen', { dir: 'SE' }),
  R('ver-w', 'first', 'Verandah', fBe, COURT.x0, COURT.z0, COURT.z1, 'verandah'),
  R('ver-e', 'first', 'Verandah', COURT.x1, fCw, COURT.z0, COURT.z1, 'verandah'),
  R('ver-s', 'first', 'Verandah', fBe, fCw, COURT.z1, 2.13, 'verandah'),
  R('court', 'first', 'Nadumuttam', COURT.x0, COURT.x1, COURT.z0, COURT.z1, 'void'),
  R('stair', 'first', 'Stair', STAIR.box.x0, STAIR.box.x1, STAIR.box.z0, STAIR.box.z1, 'stair'),
  // ground floor (open stilt garden)
  R('g-stair', 'ground', 'Stair hall', STAIR.box.x0, STAIR.box.x1, STAIR.box.z0, STAIR.box.z1, 'stair'),
  R('g-court', 'ground', 'Courtyard garden', COURT.x0 - 0.15, COURT.x1 + 0.15, COURT.z0 - 0.15, COURT.z1 + 0.15, 'garden'),
  R('g-thinnai-n', 'ground', 'Thinnai', -4.40, -2.40, 1.55, 2.35, 'thinnai'),
  R('g-thinnai-s', 'ground', 'Thinnai', -5.40, -2.50, 3.90, 4.715, 'thinnai'),
  R('g-parking', 'ground', 'Cycle + two-wheeler', -5.40, -2.50, -3.80, -1.00, 'parking'),
  // terrace
  R('t-mumty', 'terrace', 'Stair head', STAIR.box.x0, STAIR.box.x1, STAIR.box.z0, STAIR.box.z1, 'stair'),
  R('t-wash', 'terrace', 'Wash + drying', 4.40, 6.22, 2.40, 4.17, 'utility'),
];

// ---------------------------------------------------------------- beams ----
// Primary beams run on grid lines; none cross the court void or the stairwell.
// Trimmers frame both openings. y0 = soffit, y1 = top of slab.
const bx = GRID.x, bz = GRID.z, hb = BEAM.w / 2;
export const BEAMS = [];
for (const lvl of ['first', 'terrace']) {
  const top = LEVELS[lvl], y0 = top - BEAM.d;
  const add = (id, x0, x1, z0, z1) => BEAMS.push({ id: `${lvl}-${id}`, level: lvl, x0, x1, z0, z1, y0, y1: top });
  // Perimeter beams match the 300 mm exterior walls; interior beams are 230 mm.
  const he = WALL_T.exterior / 2;
  add('row1', bx.A - he, bx.D + he, bz[1] - he, bz[1] + he);
  add('row3', bx.A - he, bx.D + he, bz[3] - he, bz[3] + he);
  add('row2-west', bx.A, bx.B, bz[2] - hb, bz[2] + hb);
  add('row2-east', bx.C, bx.D, bz[2] - hb, bz[2] + hb);
  for (const k of ['A', 'B', 'C', 'D']) {
    const hw = k === 'A' || k === 'D' ? he : hb;
    add(`col${k}`, bx[k] - hw, bx[k] + hw, bz[1], bz[3]);
  }
  add('court-trim-N', fBe, fCw, COURT.z0 - BEAM.w, COURT.z0);
  add('court-trim-S', fBe, fCw, COURT.z1, COURT.z1 + BEAM.w);
  add('court-edge-W', COURT.x0 - BEAM.w, COURT.x0, COURT.z0, COURT.z1);
  add('court-edge-E', COURT.x1, COURT.x1 + BEAM.w, COURT.z0, COURT.z1);
  add('stair-trim-N', fBe, fCw, STAIR.opening.z0 - BEAM.w, STAIR.opening.z0);
  add('stair-trim-W', STAIR.opening.x0 - BEAM.w, STAIR.opening.x0, STAIR.opening.z0, STAIR.opening.z1);
}

// ------------------------------------------------------- terrace & roof ----
export const TERRACE = {
  fall: 0.06,                     // the finish rises 60 mm from the court guard to the parapets (≥ 1:100)
  // Light steel frame carrying PV over the west wing, tilted to face south.
  solar: { x0: -5.40, x1: -2.50, z0: -3.90, z1: 3.60, h: 2.40, tiltDeg: 11,
    posts: [[-5.40, -3.90], [-2.50, -3.90], [-5.40, -0.15], [-2.50, -0.15], [-5.40, 3.60], [-2.50, 3.60]] },
  tank: { x: 0.20, z: 3.15, r: 0.56, h: 1.30, litres: 1000 },
  planters: [
    { x0: -1.70, x1: 1.70, z0: -3.55, z1: -3.10, h: 0.45 },
    { x0: 2.40, x1: 5.60, z0: -3.55, z1: -3.10, h: 0.45 },
    { x0: 5.15, x1: 5.60, z0: -2.60, z1: 1.60, h: 0.45 },
  ],
  washCanopy: { x0: 4.40, x1: 6.22, z0: 2.40, z1: 4.17, h: 2.30, posts: [[4.45, 2.45], [6.17, 2.45], [4.45, 4.12]] },
};
// Stair head (mumty) on the terrace; its roof carries the 1,000 L tank.
export const MUMTY = { x0: fBw, x1: fCe, z0: 2.085 - WALL_T.grid / 2, z1: HOUSE.z1, roofTop: LEVELS.mumtyRoof };
// Individual clay coping tiles on every wall top exposed to rain.
export const COPING = { tile: 0.24, gap: 0.012, h: 0.035, overhang: 0.03, on: ['parapet', 'guard', 'compound'] };

// ------------------------------------------------------------- drainage ----
// Rain concept:
//   1. The terrace falls to the open court and scuppers drop rain into the court
//      rain garden (permeable).
//   2. An overflow weir feeds a stone channel, then a silt trap, then a recharge
//      pit in the NW front yard.
//   3. A grated channel inside the west compound wall catches yard runoff before
//      it reaches the road.
// Nothing discharges to the road. Points are [x, y, z]; channels must fall and
// connect node to node.
const gateLine = (z) => boundaryX('W', z) + COMPOUND.t + 0.30;
const J1 = [gateLine(-0.60), -0.067, -0.60];
const J2 = [gateLine(-1.85), -0.080, -1.85];
export const DRAINAGE = {
  courtBasin: { x0: COURT.x0 - 0.15, x1: COURT.x1 + 0.15, z0: COURT.z0 - 0.15, z1: COURT.z1 + 0.15, kerbTop: 0.10, floor: -0.10, weir: [COURT.x0 - 0.15, -0.020, -0.60] },
  siltTrap: { x: -6.55, z: -1.85, size: 0.45 },
  rechargePit: { x: -6.55, z: -2.85, r: 0.55, depth: 2.0, topY: -0.06 },
  channels: [
    { id: 'court-overflow', from: [COURT.x0 - 0.15, -0.020, -0.60], to: J1, w: 0.22 },
    { id: 'gate-intercept-s', from: [gateLine(4.40), -0.015, 4.40], to: J1, w: 0.20, grated: true },
    { id: 'gate-intercept-n', from: J1, to: J2, w: 0.22, grated: true },
    { id: 'to-silt-trap', from: J2, to: [-6.55, -0.090, -1.85], w: 0.22 },
    { id: 'to-recharge', from: [-6.55, -0.090, -1.85], to: [-6.55, -0.100, -2.30], w: 0.22 },
  ],
  terminal: [-6.55, -0.100, -2.30],
};
// Scupper positions in the court guard at terrace level, two per side.
export const SCUPPERS = [
  [COURT.x0 + 0.70, COURT.z0], [COURT.x1 - 0.70, COURT.z0],
  [COURT.x0 + 0.70, COURT.z1], [COURT.x1 - 0.70, COURT.z1],
  [COURT.x0, COURT.z0 + 0.70], [COURT.x0, COURT.z1 - 0.70],
  [COURT.x1, COURT.z0 + 0.70], [COURT.x1, COURT.z1 - 0.70],
];

// -------------------------------------------------------------- airflow ----
// Conceptual stack and cross ventilation; an illustration, not CFD. Cool air
// enters LOW at the south-west and crosses the house through doorways. Warm air
// leaves HIGH through the open court, the stair stack (mumty jaali) and the
// leeward NE vents.
const yF = LEVELS.first, yT = LEVELS.terrace;
const swEntry = [[-4.75, yF + 0.38, 4.60], [-4.50, yF + 0.70, 3.40], [-3.30, yF + 1.20, 1.50], [-2.20, yF + 1.50, 1.35]];
export const AIRFLOW = {
  windFrom: 'SW',
  inlets: [
    { id: 'master-s-low', opening: 'master-s-win', at: [-4.75, yF + 0.38, GRID.z[3]] },
    { id: 'master-w-low', opening: 'master-w-win', at: [GRID.x.A, yF + 0.38, 2.30] },
    { id: 'stilt-sw', at: [-6.60, 0.80, 3.10] },
  ],
  exhausts: [
    { id: 'court-sky', at: [0.20, yT + 2.30, -0.15] },
    { id: 'mumty-e', opening: 'mumty-e-exhaust', at: [GRID.x.C, yT + 2.00, 3.25] },
    { id: 'parents-e-high', opening: 'parents-e-exhaust', at: [GRID.x.D, yF + 2.47, 0.675] },
    { id: 'pooja-e-high', opening: 'pooja-e-exhaust', at: [GRID.x.D, yF + 2.47, -3.30] },
  ],
  paths: [
    { id: 'sw-court', from: 'master-s-low', to: 'court-sky', pts: [...swEntry, [-1.40, yF + 1.60, 0.90], [-0.40, yF + 1.90, 0.30], [0.20, yF + 2.40, -0.10], [0.20, yT + 0.60, -0.15], [0.20, yT + 2.30, -0.15]] },
    { id: 'sw-stair', from: 'master-w-low', to: 'mumty-e', pts: [[-6.05, yF + 0.38, 2.30], [-4.80, yF + 0.70, 1.90], [-3.30, yF + 1.20, 1.45], [-2.20, yF + 1.45, 1.35], [-1.60, yF + 1.55, 1.65], [-1.55, yF + 1.80, 2.70], [-0.30, yF + 2.40, 2.75], [1.00, yT + 0.80, 2.75], [1.80, yT + 1.70, 3.10], [GRID.x.C, yT + 2.00, 3.25], [3.20, yT + 2.05, 3.25]] },
    { id: 'stilt-court', from: 'stilt-sw', to: 'court-sky', pts: [[-6.60, 0.80, 3.10], [-5.10, 0.90, 1.20], [-3.20, 1.00, 0.70], [-1.60, 1.10, 0.40], [-0.20, 1.30, 0.10], [0.20, 2.40, -0.10], [0.20, yF + 1.80, -0.15], [0.20, yT + 2.30, -0.15]] },
    { id: 'court-parents', from: 'master-s-low', to: 'parents-e-high', pts: [...swEntry, [-0.60, yF + 1.60, 1.60], [1.90, yF + 1.60, 0.80], [GRID.x.C, yF + 1.70, 0.65], [4.20, yF + 2.10, 0.66], [GRID.x.D, yF + 2.47, 0.675], [6.90, yF + 2.55, 0.675]] },
    { id: 'living-pooja', from: 'master-s-low', to: 'pooja-e-high', pts: [...swEntry, [-1.50, yF + 1.60, 0.20], [-1.50, yF + 1.70, -1.80], [1.50, yF + 1.80, -3.00], [GRID.x.C, yF + 1.85, -3.20], [3.80, yF + 1.90, -3.20], [4.525, yF + 1.90, -3.20], [5.50, yF + 2.20, -3.30], [GRID.x.D, yF + 2.47, -3.30], [6.90, yF + 2.55, -3.30]] },
  ],
};

// ------------------------------------------------------------ furniture ----
// Boxes used by the 3D builder (detailed by type), the plans and collision.
// `face` = the direction a seat faces; `head` = the bed-head wall.
const F = (id, level, type, x0, x1, z0, z1, h, extra = {}) => ({ id, level, type, x0, x1, z0, z1, h, ...extra });
export const FURNITURE = [
  // living, library alcove, pooja
  F('diwan', 'first', 'diwan', -1.80, 0.20, -4.05, -3.30, 0.42),
  F('oonjal', 'first', 'swing', -0.60, 0.90, -2.55, -2.05, 0.45, { hang: true, passable: true }),
  F('cane-1', 'first', 'chair', -1.95, -1.40, -3.10, -2.55, 0.85, { face: 'E' }),
  F('cane-2', 'first', 'chair', 1.30, 1.85, -3.10, -2.55, 0.85, { face: 'W' }),
  F('living-cabinet', 'first', 'cabinet', 0.55, 1.85, fN, -3.75, 0.80),
  F('lib-seat', 'first', 'bookseat', 3.00, 4.40, fN, -3.68, 0.45),
  F('lib-shelf', 'first', 'bookshelf', 3.25, 4.40, -2.60, -2.30, 2.10),
  F('altar', 'first', 'altar', 5.70, fD, -3.80, -2.60, 0.85, { face: 'W' }),
  // parents
  F('parents-bed', 'first', 'bed', 3.90, 5.40, -0.85, 1.15, 0.50, { head: 'S' }),
  F('parents-wardrobe', 'first', 'wardrobe', 4.20, 6.10, -2.15, -1.55, 2.10),
  F('parents-side', 'first', 'sidetable', 5.45, 5.90, 0.70, 1.15, 0.55),
  F('parents-chair', 'first', 'chair', 2.80, 3.30, -2.10, -1.60, 0.85, { face: 'E' }),
  // kitchen and dining
  F('kit-counter-e', 'first', 'counter', 5.55, fD, 1.30, fS, 0.85, { sink: [2.25, 2.95], back: 'E' }),
  F('kit-counter-s', 'first', 'counter', 3.45, 5.55, 3.50, fS, 0.85, { stove: [4.40, 5.20], back: 'S' }),
  F('fridge', 'first', 'fridge', 2.75, 3.40, 3.45, fS, 1.80),
  F('dining', 'first', 'table', 3.55, 4.75, 1.70, 2.50, 0.75, { chairs: 4 }),
  // kids
  F('kids-bed', 'first', 'bed', -4.265, fBw, -4.05, -3.10, 0.45, { head: 'E', single: true }),
  F('kids-desk', 'first', 'desk', fA, -5.00, -3.60, -2.30, 0.75, { face: 'W' }),
  F('kids-wardrobe', 'first', 'wardrobe', fA, -4.60, -2.10, -1.50, 2.10),
  // master
  F('master-bed', 'first', 'bed', -4.315, fBw, 2.25, 3.75, 0.50, { head: 'E' }),
  F('master-wardrobe', 'first', 'wardrobe', fA, -4.60, 0.90, 1.50, 2.10),
  F('master-side', 'first', 'sidetable', -2.80, -2.35, 1.80, 2.20, 0.55),
  // baths
  F('en-shower', 'first', 'shower', fA, -4.70, -1.35, -0.45, 0.04, { passable: true }),
  F('en-basin', 'first', 'basin', fA, -5.10, -0.40, 0.00, 0.85),
  F('en-wc', 'first', 'wc', fA, -4.95, 0.05, 0.75, 0.42),
  F('cb-shower', 'first', 'shower', -3.675, -2.85, -1.35, -0.80, 0.04, { passable: true }),
  F('cb-basin', 'first', 'basin', -3.675, -3.25, -0.60, -0.10, 0.85),
  F('cb-wc', 'first', 'wc', -3.675, -3.15, 0.10, 0.75, 0.42),
  // ground
  F('thinnai-n', 'ground', 'thinnai', -4.40, -2.40, 1.55, 2.35, 0.45, { back: 'N' }),
  F('thinnai-s', 'ground', 'thinnai', -5.40, -2.50, 3.90, 4.715, 0.45, { back: 'S' }),
  F('water-point', 'ground', 'waterpot', -6.45, -5.95, 0.75, 1.25, 0.95),
  F('scooter', 'ground', 'scooter', -4.70, -3.00, -3.30, -2.65, 1.10),
  F('cycle', 'ground', 'cycle', -4.90, -3.20, -2.05, -1.80, 0.95),
  F('tulsi', 'ground', 'tulsi', 0.80, 1.30, 0.30, 0.80, 0.85),
  F('uruli', 'ground', 'uruli', -0.65, 0.05, 0.25, 0.95, 0.25),
  F('store-understair', 'ground', 'store', -0.40, fCw, 3.22, fS, 1.20),
  F('store-midlanding', 'ground', 'store', STAIR.midLanding.x0, fCw, 2.20, 3.22, 1.20),
  // terrace
  F('wash-counter', 'terrace', 'counter', 5.62, 6.22, 2.60, 4.17, 0.85, { sink: [3.00, 3.60], back: 'E' }),
  F('washer', 'terrace', 'washer', 4.90, 5.50, 3.57, 4.17, 0.85),
  F('t-chair-1', 'terrace', 'chair', -0.20, 0.40, -2.80, -2.20, 0.85, { face: 'N' }),
  F('t-chair-2', 'terrace', 'chair', 0.80, 1.40, -2.80, -2.20, 0.85, { face: 'N' }),
];
export const COURT_TREE = { x: 0.10, z: -0.45, h: 4.6, canopy: 0.85 };
export const PALM = { x: -6.90, z: -4.05, h: 7.5 };

// --------------------------------------------------- viewpoints (jumps) ----
// pos/look are [x, y, z]. For walk viewpoints, y = floor level + eye height.
export const VIEWPOINTS = [
  { id: 'overview', label: 'Overview', mode: 'orbit', pos: [-17.5, 13.5, 15.5], look: [0.3, 3.2, 0] },
  { id: 'gate', label: 'West gate', mode: 'walk', pos: [-8.9, EYE - ROAD.drop, 3.10], look: [-2.0, 1.4, 3.10] },
  { id: 'thinnai', label: 'Thinnai + main door', mode: 'walk', pos: [-5.40, EYE, 3.10], look: [-2.2, 1.3, 3.05] },
  { id: 'court-garden', label: 'Courtyard garden', mode: 'walk', pos: [-1.75, EYE, -1.90], look: [0.4, 3.6, -0.1] },
  { id: 'stair', label: 'Stair hall', mode: 'walk', pos: [-1.65, EYE, 2.65], look: [1.2, 1.4, 2.65] },
  { id: 'verandah', label: 'Verandah + nadumuttam', mode: 'walk', pos: [-1.55, yF + EYE, 1.65], look: [0.4, yF + 0.6, -0.4] },
  { id: 'living', label: 'Living (N)', mode: 'walk', pos: [1.90, yF + EYE, -1.75], look: [-1.2, yF + 1.2, -3.6] },
  { id: 'library', label: 'Library alcove', mode: 'walk', pos: [1.55, yF + EYE, -3.45], look: [4.4, yF + 1.3, -3.2] },
  { id: 'pooja', label: 'Pooja (NE)', mode: 'walk', pos: [3.85, yF + EYE, -3.25], look: [6.2, yF + 1.0, -3.2] },
  { id: 'kitchen', label: 'Kitchen + dining (SE)', mode: 'walk', pos: [3.05, yF + EYE, 1.75], look: [5.6, yF + 1.0, 3.4] },
  { id: 'parents', label: 'Parents (E)', mode: 'walk', pos: [3.10, yF + EYE, 0.55], look: [5.6, yF + 1.0, -1.2] },
  { id: 'master', label: 'Master (SW)', mode: 'walk', pos: [-2.75, yF + EYE, 1.55], look: [-5.2, yF + 0.9, 3.2] },
  { id: 'kids', label: 'Kids (NW)', mode: 'walk', pos: [-2.75, yF + EYE, -1.95], look: [-5.2, yF + 1.0, -3.6] },
  { id: 'bath', label: 'Common bath', mode: 'walk', pos: [-1.60, yF + EYE, -0.75], look: [-3.4, yF + 1.1, -0.2], open: ['bath-door'] },
  { id: 'terrace', label: 'Terrace garden', mode: 'walk', pos: [-1.55, yT + EYE, 1.65], look: [2.8, yT + 0.6, -2.6] },
];

// -------------------------------------------------------------- helpers ----
export const polygonArea = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
};
export const pointInPolygon = ([x, z], pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
export const plotAreaSqFt = () => polygonArea(PLOT.vertices) / (FT * FT);
export const sideLengthsFt = () => {
  const v = PLOT.vertices, d = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]) / FT;
  return { N: d(v[0], v[1]), E: d(v[1], v[2]), S: d(v[2], v[3]), W: d(v[3], v[0]) };
};
// Maximum area of a quadrilateral with the stated sides (Brahmagupta).
export const maxQuadAreaSqFt = () => {
  const { N, S, W, E } = PLOT.sidesFt, s = (N + S + W + E) / 2;
  return Math.sqrt((s - N) * (s - S) * (s - W) * (s - E));
};
export const roomArea = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
export const wallLength = (w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
// Opening end points in plan (x, z) along its wall.
export function openingSpan(wall, op) {
  const [ax, az] = wall.a, len = wallLength(wall);
  const ux = (wall.b[0] - ax) / len, uz = (wall.b[1] - az) / len;
  return { p0: [ax + ux * op.s, az + uz * op.s], p1: [ax + ux * (op.s + op.w), az + uz * (op.s + op.w)], len, ux, uz };
}
// Door leaves: hinge point, closed direction and open direction (unit vectors in
// plan) for each leaf of a door opening. Used by the 3D model, the plans and the validator.
export function doorLeaves(wall, op) {
  const { p0, p1, ux, uz } = openingSpan(wall, op);
  const n = op.leaves || 1, lw = op.w / n;
  const sw = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[op.swing];
  // Offset the hinge to the wall face on the swing side.
  const face = wall.t / 2;
  const off = [sw[0] * face, sw[1] * face];
  const atStart = { N: uz > 0 ? p0 : p1, S: uz > 0 ? p1 : p0, W: ux > 0 ? p0 : p1, E: ux > 0 ? p1 : p0 };
  const leaves = [];
  if (n === 1) {
    const h = atStart[op.hinge] || p0, other = h === p0 ? p1 : p0;
    const cd = [(other[0] - h[0]) / op.w, (other[1] - h[1]) / op.w];
    leaves.push({ hinge: [h[0] + off[0], h[1] + off[1]], closedDir: cd, openDir: sw, w: lw });
  } else {
    leaves.push({ hinge: [p0[0] + off[0], p0[1] + off[1]], closedDir: [ux, uz], openDir: sw, w: lw });
    leaves.push({ hinge: [p1[0] + off[0], p1[1] + off[1]], closedDir: [-ux, -uz], openDir: sw, w: lw });
  }
  return leaves;
}
// Distance from point p to the closest point of the plot boundary polygon.
export function distanceToBoundary([x, z]) {
  const v = PLOT.vertices;
  let best = Infinity;
  for (let i = 0; i < v.length; i++) {
    const [ax, az] = v[i], [bx2, bz2] = v[(i + 1) % v.length];
    const dx = bx2 - ax, dz = bz2 - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
}
// The court guard occupies a band of slab just outside the void edge.
export function guardBands(g) {
  const t = g.t;
  return [
    { id: `${g.id}-N`, x0: g.x0 - t, x1: g.x1 + t, z0: g.z0 - t, z1: g.z0 },
    { id: `${g.id}-S`, x0: g.x0 - t, x1: g.x1 + t, z0: g.z1, z1: g.z1 + t },
    { id: `${g.id}-W`, x0: g.x0 - t, x1: g.x0, z0: g.z0, z1: g.z1 },
    { id: `${g.id}-E`, x0: g.x1, x1: g.x1 + t, z0: g.z0, z1: g.z1 },
  ];
}
// Gate leaves: hinged at the inner faces of the piers, closing along the (slanted)
// west boundary and opening inward, perpendicular to it.
export function gateLeaves() {
  const p0 = [boundaryX('W', GATE.z0) + COMPOUND.t, GATE.z0], p1 = [boundaryX('W', GATE.z1) + COMPOUND.t, GATE.z1];
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const u = [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len];
  const inward = [u[1], -u[0]];          // perpendicular toward +x (into the plot)
  return [
    { id: 'gate-n', hinge: p0, closedDir: u, openDir: inward, w: len / 2 },
    { id: 'gate-s', hinge: p1, closedDir: [-u[0], -u[1]], openDir: inward, w: len / 2 },
  ];
}
// Slab openings per floor level (rectangles open to below).
export const SLAB_OPENINGS = {
  first: [{ id: 'court', ...COURT }, { id: 'stair', ...STAIR.opening }],
  terrace: [{ id: 'court', ...COURT }, { id: 'stair', ...STAIR.opening }],
};
