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
// West gate: one reclaimed-timber leaf sliding north on a track inside the compound wall,
// so a car can turn in from the road and nothing swings into the parking or the columns.
// z0/z1 = clear opening along the W boundary.
export const GATE = { z0: 1.30, z1: 4.25, leafH: 1.55, pierW: 0.42, pierH: 1.85, t: 0.06, track: 0.10, type: 'sliding' };
export const ROAD = { width: 6.0, drop: 0.15 };   // indicative only

// ----------------------------------------------------------------- house ----
// First-floor envelope (outer faces). Margins to the boundary are design choices
// (≈0.6 m N/S, 1.2–1.9 m on the W front, 0.6–1.3 m E). Local setback rules have not been verified.
export const HOUSE = { x0: -5.85, x1: 6.45, z0: -4.40, z1: 4.40 };
export const WALL_T = { exterior: 0.30, grid: 0.23, partition: 0.15, parapet: 0.23 };

// --------------------------------------------- 12-column structural grid ----
// Four column lines (A–D, west → east) × three rows (1–3, north → south).
// Row 2 carries the bedroom wing's north wall, which is also the court's south edge;
// line B carries the master suite's east wall, which is also the court's west edge.
export const GRID = {
  x: { A: -5.70, B: -2.20, C: 2.19, D: 6.30 },
  z: { 1: -4.25, 2: 1.465, 3: 4.25 },
  column: 0.30,
};
// Beams spanning rows 1–2 (5.7 m) are 230 × 550 mm; all others 230 × 450 mm.
export const DEEP_BEAM = 0.55;
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
// C2 sits where the bedroom partition meets row 2; it is shifted 110 mm south so it
// hides in that partition instead of projecting into the family space.
const COL_SHIFT = { C2: [0, 0.11] };
for (const [xl, x] of Object.entries(GRID.x)) {
  for (const [zl, z] of Object.entries(GRID.z)) {
    const [w, d] = colSize(xl, zl), [dx, dz] = COL_SHIFT[`${xl}${zl}`] || [0, 0];
    COLUMNS.push({ id: `${xl}${zl}`, x: x + dx, z: z + dz, w, d });
  }
}
// Inner wall faces used throughout (derived from the grid and wall thicknesses).
export const FACE = {
  A: GRID.x.A + WALL_T.exterior / 2,   // −5.55
  Bw: GRID.x.B - WALL_T.grid / 2,      // −2.315
  Be: GRID.x.B + WALL_T.grid / 2,      // −2.085
  Cw: GRID.x.C - WALL_T.grid / 2,      //  2.075
  Ce: GRID.x.C + WALL_T.grid / 2,      //  2.305
  D: GRID.x.D - WALL_T.exterior / 2,   //  6.15
  N: GRID.z[1] + WALL_T.exterior / 2,  // −4.10
  S: GRID.z[3] - WALL_T.exterior / 2,  //  4.10
  R2n: GRID.z[2] - WALL_T.grid / 2,    //  1.35  (court side of the bedroom wing)
  R2s: GRID.z[2] + WALL_T.grid / 2,    //  1.58
};
const { A: fA, Bw: fBw, Be: fBe, Cw: fCw, Ce: fCe, D: fD, N: fN, S: fS, R2n, R2s } = FACE;

// ------------------------------------------------- nadumuttam (open court) ----
// Open from the ground garden to the sky. Its west and south edges are the bedroom
// walls (with windows onto the court); its north and east edges open to the hall,
// the stair and the family/kitchen space behind a 1.0 m guard.
export const COURT = { x0: fBe, x1: 0.85, z0: -1.05, z1: R2n };

// --------------------------------------------------------------- stair ----
// Dog-leg in the north-centre bay (between lines B and C). 18 equal risers per storey,
// 8 treads per flight. Flight 1 rises east in the south lane (next to the hall); flight 2
// rises west in the north lane. Every storey starts and arrives on the west floor landing,
// and the next storey repeats directly above.
export const STAIR = {
  risers: 18,
  riser: (LEVELS.first - LEVELS.ground) / 18,   // 0.1778 m
  tread: 0.27,
  lane1: { z0: -3.10, z1: -2.20 },              // flight 1, clear width 0.90 m
  lane2: { z0: fN, z1: -3.20 },                 // flight 2
  spineZ: -3.15,                                // perforated spine between the lanes
  floorLanding: { x0: fBe, x1: -1.085 },        // start/arrival landing (west end), 1.00 m
  flight: { x0: -1.085, x1: 1.075 },            // 8 treads × 0.27 m
  midLanding: { x0: 1.075, x1: fCw },           // 1.00 m
  box: { x0: fBe, x1: fCw, z0: fN, z1: -2.20 },
  opening: { x0: -1.085, x1: fCw, z0: fN, z1: -2.20 }, // slab opening per floor; the floor landing stays solid
  waist: 0.15,
  storeys: [{ from: 'ground', to: 'first' }, { from: 'first', to: 'terrace' }],
};
// Height of the walking line at plan position (x, z) for a storey starting at y0.
// Returns null when (x, z) is not on that storey's flights or mid landing.
// A smooth line through the nosings (±0.08 m of each tread) keeps the eye steady.
export function stairWalkY(x, z, y0) {
  const s = STAIR, half = s.risers / 2;
  const in1 = z >= s.lane1.z0 && z <= s.lane1.z1, in2 = z >= s.lane2.z0 && z <= s.lane2.z1;
  if (x >= s.midLanding.x0 && x <= s.midLanding.x1 && z >= s.box.z0 && z <= s.box.z1) return y0 + half * s.riser;
  if (x < s.flight.x0 || x > s.flight.x1) return null;
  const run = (x - s.flight.x0) / (s.flight.x1 - s.flight.x0);
  if (in1) return y0 + run * half * s.riser;
  if (in2) return y0 + half * s.riser + (1 - run) * half * s.riser;
  return null;
}
// Treads for one storey starting at y0: 9 risers per flight (8 treads + landing riser).
export function stairTreads(y0) {
  const s = STAIR, T = s.tread, r = s.riser, half = s.risers / 2, out = [];
  for (let k = 1; k < half; k++) {
    out.push({ flight: 1, k, x0: s.flight.x0 + (k - 1) * T, x1: s.flight.x0 + k * T, z0: s.lane1.z0, z1: s.lane1.z1, top: y0 + k * r });
  }
  for (let k = 1; k < half; k++) {
    out.push({ flight: 2, k, x0: s.flight.x1 - k * T, x1: s.flight.x1 - (k - 1) * T, z0: s.lane2.z0, z1: s.lane2.z1, top: y0 + (half + k) * r });
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
//   court: true for windows that look into the open court (they carry a grille).
// Heights are relative to the wall's own floor level.
const Wl = (id, level, a, b, t, kind, openings = [], extra = {}) => ({ id, level, a, b, t, kind, openings, ...extra });
const H1 = LEVELS.terrace - LEVELS.first - SLAB;     // 3.05 m first-floor clear height
const HM = LEVELS.mumtyRoof - LEVELS.terrace - SLAB; // 2.45 m stair-head clear height
const xs = HOUSE.x0, xe = HOUSE.x1;
const pIn = WALL_T.parapet / 2;
const yMumtyS = STAIR.box.z1 + WALL_T.grid / 2;     // −2.085: south face line of the stair box walls

export const WALLS = [
  // ---------------- first floor: exterior walls (0.30 m, on grid lines) ----------------
  Wl('ff-N', 'first', [xs, GRID.z[1]], [xe, GRID.z[1]], WALL_T.exterior, 'exterior', [
    { id: 'mbath-n-win', type: 'window', s: 0.55, w: 0.80, sill: 1.50, head: 2.25 },
    { id: 'cbath-n-win', type: 'window', s: 2.25, w: 0.80, sill: 1.50, head: 2.25 },
    { id: 'stair-n-jaali', type: 'jaali', s: 4.15, w: 3.40, sill: 0.30, head: 2.70 },
    { id: 'living-n-win', type: 'window', s: 8.55, w: 1.80, sill: 0.45, head: 2.25, vent: true },
  ]),
  Wl('ff-E', 'first', [GRID.x.D, fN], [GRID.x.D, fS], WALL_T.exterior, 'exterior', [
    { id: 'pooja-e-exhaust', type: 'jaali', s: 0.25, w: 0.80, sill: 2.00, head: 2.60, role: 'exhaust', hood: true },
    { id: 'living-e-win', type: 'window', s: 1.40, w: 1.00, sill: 0.60, head: 2.25, vent: true },
    { id: 'kitchen-e-win', type: 'window', s: 2.85, w: 0.90, sill: 1.05, head: 2.25 },
    { id: 'kitchen-e-exhaust', type: 'jaali', s: 4.25, w: 0.80, sill: 2.00, head: 2.60, role: 'exhaust', hood: true },
    { id: 'kids-e-win', type: 'window', s: 6.30, w: 1.20, sill: 0.75, head: 2.25, vent: true },
  ]),
  Wl('ff-S', 'first', [xs, GRID.z[3]], [xe, GRID.z[3]], WALL_T.exterior, 'exterior', [
    { id: 'master-s-win', type: 'window', s: 0.95, w: 1.20, sill: 0.75, head: 2.25, lowJaali: [0.15, 0.60], role: 'inlet', hood: true },
    { id: 'parents-s-win', type: 'window', s: 5.25, w: 1.20, sill: 0.75, head: 2.25, vent: true },
    { id: 'kids-s-win', type: 'window', s: 9.25, w: 1.00, sill: 0.75, head: 2.25, vent: true },
  ]),
  Wl('ff-W', 'first', [GRID.x.A, fN], [GRID.x.A, fS], WALL_T.exterior, 'exterior', [
    { id: 'mbath-w-jaali', type: 'jaali', s: 0.40, w: 0.80, sill: 1.60, head: 2.25 },
    { id: 'dress-w-win', type: 'window', s: 2.40, w: 0.80, sill: 0.90, head: 2.25 },
    { id: 'master-w-win', type: 'window', s: 4.20, w: 1.00, sill: 0.75, head: 2.25, lowJaali: [0.15, 0.60], role: 'inlet', hood: true },
  ]),
  // ---------------- first floor: walls on grid lines (0.23 m) ----------------
  // Line B: common-bath door off the stair landing, master-suite door off the hall,
  // and the master bedroom's window onto the court.
  Wl('ff-B', 'first', [GRID.x.B, fN], [GRID.x.B, fS], WALL_T.grid, 'grid', [
    { id: 'cbath-door', type: 'door', s: 0.15, w: 0.75, head: 2.10, swing: 'E', hinge: 'N', room: 'cbath', defaultOpen: false },
    { id: 'master-door', type: 'door', s: 2.05, w: 0.80, head: 2.10, swing: 'W', hinge: 'N', vent: true, room: 'master' },
    { id: 'master-court-win', type: 'window', s: 4.00, w: 1.20, sill: 0.90, head: 2.25, court: true },
  ]),
  // Row 2: the bedroom wing's north wall = the court's south edge.
  Wl('ff-row2', 'first', [fBe, GRID.z[2]], [fD, GRID.z[2]], WALL_T.grid, 'grid', [
    { id: 'parents-court-win', type: 'window', s: 0.235, w: 2.40, sill: 0.90, head: 2.25, court: true },
    { id: 'parents-door', type: 'door', s: 3.26, w: 0.80, head: 2.10, swing: 'S', hinge: 'E', vent: true, room: 'parents' },
    { id: 'kids-door', type: 'door', s: 4.49, w: 0.80, head: 2.10, swing: 'S', hinge: 'W', vent: true, room: 'kids' },
  ]),
  // Line C: the stair's east wall (a tall jaali to the living) and the parents/kids partition.
  Wl('ff-C-n', 'first', [GRID.x.C, fN], [GRID.x.C, -2.14], WALL_T.grid, 'grid', [
    { id: 'stair-e-jaali', type: 'jaali', s: 0.20, w: 1.40, sill: 0.90, head: 2.70 },
  ]),
  Wl('ff-C-s', 'first', [GRID.x.C, R2s], [GRID.x.C, fS], WALL_T.grid, 'grid'),
  // ---------------- first floor: partitions (0.15 m) ----------------
  Wl('ff-p-nw', 'first', [fA, -2.125], [fBw, -2.125], WALL_T.partition, 'partition', [
    { id: 'mbath-door', type: 'door', s: 0.70, w: 0.70, head: 2.10, swing: 'S', hinge: 'E', room: 'mbath', defaultOpen: false },
  ]),
  // Shared wet wall: both baths plumb into one stack.
  Wl('ff-p-baths', 'first', [-3.975, fN], [-3.975, -2.20], WALL_T.partition, 'partition'),
  // Terracotta jaali screen guarding the flights and the mid landing; the floor landing
  // stays open to the hall.
  Wl('ff-stair-screen', 'first', [STAIR.flight.x0, -2.17], [fCw, -2.17], 0.06, 'screen'),

  // ---------------- ground: stair-hall enclosure (the house entrance) ----------------
  Wl('gf-stair-N', 'ground', [fBe, GRID.z[1]], [fCw, GRID.z[1]], WALL_T.exterior, 'exterior', [
    { id: 'stair-gf-n-jaali', type: 'jaali', s: 1.085, w: 2.50, sill: 1.00, head: 2.30 },
  ]),
  Wl('gf-stair-W', 'ground', [GRID.x.B, fN], [GRID.x.B, STAIR.box.z1], WALL_T.grid, 'grid', [
    { id: 'main-door', type: 'door', s: 0.475, w: 1.00, head: 2.20, swing: 'W', hinge: 'N', leaves: 2, vent: true, main: true, room: 'g-stair' },
  ]),
  Wl('gf-stair-E', 'ground', [GRID.x.C, fN], [GRID.x.C, STAIR.box.z1], WALL_T.grid, 'grid', [
    { id: 'stair-gf-e-jaali', type: 'jaali', s: 0.40, w: 1.20, sill: 1.40, head: 2.30 },
  ]),
  Wl('gf-stair-S', 'ground', [fBw, yMumtyS], [fCe, yMumtyS], WALL_T.grid, 'grid', [
    { id: 'stair-gf-s-jaali', type: 'jaali', s: 1.515, w: 2.50, sill: 1.30, head: 2.40 },
  ]),
  // Perforated terracotta spine between the two flights (ground to terrace handrail).
  Wl('stair-spine', 'ground', [STAIR.flight.x0, STAIR.spineZ], [STAIR.flight.x1, STAIR.spineZ], 0.10, 'spine', [], { h: LEVELS.terrace + 1.0 }),

  // ---------------- terrace: parapets, court guard and stair head (mumty) ----------------
  Wl('tr-N', 'terrace', [xs, HOUSE.z0 + pIn], [fBw, HOUSE.z0 + pIn], WALL_T.parapet, 'parapet'),
  Wl('tr-N2', 'terrace', [fCe, HOUSE.z0 + pIn], [xe, HOUSE.z0 + pIn], WALL_T.parapet, 'parapet'),
  Wl('tr-S', 'terrace', [xs, HOUSE.z1 - pIn], [4.20, HOUSE.z1 - pIn], WALL_T.parapet, 'parapet'),
  // At the wash area the washer and counter stand against the parapet, so the guard
  // rises to 1.8 m with a terracotta jaali above the 1.0 m solid parapet (child safety).
  Wl('tr-S-wash', 'terrace', [4.20, HOUSE.z1 - pIn], [xe, HOUSE.z1 - pIn], WALL_T.parapet, 'parapet', [], { h: 1.80, jaaliAbove: PARAPET_H }),
  Wl('tr-W', 'terrace', [xs + pIn, HOUSE.z0 + 2 * pIn], [xs + pIn, HOUSE.z1 - 2 * pIn], WALL_T.parapet, 'parapet'),
  Wl('tr-E', 'terrace', [xe - pIn, HOUSE.z0 + 2 * pIn], [xe - pIn, 2.00], WALL_T.parapet, 'parapet'),
  Wl('tr-E-wash', 'terrace', [xe - pIn, 2.00], [xe - pIn, HOUSE.z1 - 2 * pIn], WALL_T.parapet, 'parapet', [], { h: 1.80, jaaliAbove: PARAPET_H }),
  Wl('tr-court-N', 'terrace', [COURT.x0 - 2 * pIn, COURT.z0 - pIn], [COURT.x1 + 2 * pIn, COURT.z0 - pIn], WALL_T.parapet, 'guard'),
  Wl('tr-court-S', 'terrace', [COURT.x0 - 2 * pIn, COURT.z1 + pIn], [COURT.x1 + 2 * pIn, COURT.z1 + pIn], WALL_T.parapet, 'guard'),
  Wl('tr-court-W', 'terrace', [COURT.x0 - pIn, COURT.z0], [COURT.x0 - pIn, COURT.z1], WALL_T.parapet, 'guard'),
  Wl('tr-court-E', 'terrace', [COURT.x1 + pIn, COURT.z0], [COURT.x1 + pIn, COURT.z1], WALL_T.parapet, 'guard'),
  Wl('tr-mumty-N', 'terrace', [fBw, HOUSE.z0 + pIn], [fCe, HOUSE.z0 + pIn], WALL_T.parapet, 'mumty', [], { h: HM }),
  Wl('tr-mumty-W', 'terrace', [GRID.x.B, HOUSE.z0 + 2 * pIn], [GRID.x.B, STAIR.box.z1], WALL_T.grid, 'mumty', [], { h: HM }),
  Wl('tr-mumty-E', 'terrace', [GRID.x.C, HOUSE.z0 + 2 * pIn], [GRID.x.C, STAIR.box.z1], WALL_T.grid, 'mumty', [
    { id: 'mumty-e-exhaust', type: 'jaali', s: 0.40, w: 1.30, sill: 1.70, head: 2.30, role: 'exhaust', hood: true },
  ], { h: HM }),
  Wl('tr-mumty-S', 'terrace', [fBw, yMumtyS], [fCe, yMumtyS], WALL_T.grid, 'mumty', [
    { id: 'mumty-door', type: 'door', s: 0.30, w: 0.80, head: 2.10, swing: 'N', hinge: 'W', room: 'terrace' },
    { id: 'mumty-s-exhaust', type: 'jaali', s: 2.20, w: 1.80, sill: 1.70, head: 2.30, role: 'exhaust', hood: true },
  ], { h: HM }),
];
for (const w of WALLS) {
  if (w.h === undefined) w.h = w.level === 'first' ? H1 : w.level === 'ground' ? LEVELS.first - BEAM.d : PARAPET_H;
  for (const o of w.openings) {
    if (o.sill === undefined) o.sill = 0;
    if (o.type === 'door' && o.defaultOpen === undefined) o.defaultOpen = true;
  }
}

// Guard on the court's open sides (north = hall, east = family/kitchen): vertical teak
// balusters on a kerb, 1.0 m high. The west and south sides are bedroom walls.
export const GUARDS = [
  { id: 'ff-court-guard', level: 'first', x0: COURT.x0, x1: COURT.x1, z0: COURT.z0, z1: COURT.z1, h: PARAPET_H, kerb: 0.12, t: 0.10, sides: ['N', 'E'] },
];

// ------------------------------------------------------------------ rooms ----
const R = (id, level, name, x0, x1, z0, z1, use, extra = {}) => ({ id, level, name, x0, x1, z0, z1, use, ...extra });
const guardT = GUARDS[0].t;
export const ROOMS = [
  // first floor: the bedroom "L" (west + south) wraps the court; the open half (north + east) holds the rest.
  R('master', 'first', 'Master suite', fA, fBw, -2.05, fS, 'bedroom', { dir: 'SW' }),
  R('mbath', 'first', 'Master bath', fA, -4.05, fN, -2.20, 'bath', { dir: 'NW' }),
  R('cbath', 'first', 'Common bath', -3.90, fBw, fN, -2.20, 'bath', { dir: 'NW' }),
  R('parents', 'first', 'Parents', fBe, fCw, R2s, fS, 'bedroom', { dir: 'S' }),
  R('kids', 'first', 'Kids', fCe, fD, R2s, fS, 'bedroom', { dir: 'SE' }),
  R('hall', 'first', 'Hall', fBe, fCw, -2.14, COURT.z0 - guardT, 'hall', { dir: 'N' }),
  R('living', 'first', 'Living + pooja', fCe, fD, fN, -1.45, 'living', { dir: 'NE' }),
  R('kitchen', 'first', 'Open kitchen', 3.35, fD, -1.45, R2n, 'kitchen', { dir: 'E' }),
  R('family', 'first', 'Family', COURT.x1 + guardT, 3.35, COURT.z0 - guardT, R2n, 'family', { dir: 'E' }),
  R('court', 'first', 'Nadumuttam', COURT.x0, COURT.x1, COURT.z0, COURT.z1, 'void'),
  R('stair', 'first', 'Stair', STAIR.box.x0, STAIR.box.x1, STAIR.box.z0, STAIR.box.z1, 'stair'),
  // ground floor (open stilt garden)
  R('g-stair', 'ground', 'Stair hall', STAIR.box.x0, STAIR.box.x1, STAIR.box.z0, STAIR.box.z1, 'stair'),
  R('g-court', 'ground', 'Courtyard garden', COURT.x0 - 0.15, COURT.x1 + 0.15, COURT.z0 - 0.15, COURT.z1 + 0.15, 'garden'),
  R('g-thinnai-n', 'ground', 'Thinnai', -4.60, -2.95, -4.05, -3.55, 'thinnai'),
  R('g-thinnai-s', 'ground', 'Thinnai', -4.60, -2.95, -2.70, -2.25, 'thinnai'),
  R('g-car', 'ground', 'Car', -5.45, -0.85, 1.80, 4.05, 'parking', { vehicle: 'car' }),
  R('g-bikes', 'ground', 'Two-wheelers', -5.20, -3.30, -0.45, 0.95, 'parking', { vehicle: 'two-wheeler' }),
  // terrace
  R('t-mumty', 'terrace', 'Stair head', STAIR.box.x0, STAIR.box.x1, STAIR.box.z0, STAIR.box.z1, 'stair'),
  R('t-wash', 'terrace', 'Wash + drying', 4.40, 6.22, 2.40, 4.17, 'utility'),
];

// ---------------------------------------------------------------- beams ----
// Primary beams run on grid lines; none cross the court void or the stairwell.
// The court's west and south edges are primary beams (lines B and row 2); trimmers
// frame its north and east edges and the stair opening. y0 = soffit, y1 = top of slab.
const bx = GRID.x, bz = GRID.z, hb = BEAM.w / 2;
export const BEAMS = [];
for (const lvl of ['first', 'terrace']) {
  const top = LEVELS[lvl];
  const add = (id, x0, x1, z0, z1, d = BEAM.d, span = null) => BEAMS.push({ id: `${lvl}-${id}`, level: lvl, x0, x1, z0, z1, y0: top - d, y1: top, d, span });
  // Perimeter beams match the 300 mm exterior walls; interior beams are 230 mm.
  const he = WALL_T.exterior / 2;
  add('row1', bx.A - he, bx.D + he, bz[1] - he, bz[1] + he, BEAM.d, Math.max(bx.B - bx.A, bx.C - bx.B, bx.D - bx.C));
  add('row2', bx.A, bx.D, bz[2] - hb, bz[2] + hb, BEAM.d, Math.max(bx.B - bx.A, bx.C - bx.B, bx.D - bx.C));
  add('row3', bx.A - he, bx.D + he, bz[3] - he, bz[3] + he, BEAM.d, Math.max(bx.B - bx.A, bx.C - bx.B, bx.D - bx.C));
  for (const k of ['A', 'B', 'C', 'D']) {
    const hw = k === 'A' || k === 'D' ? he : hb;
    add(`col${k}-12`, bx[k] - hw, bx[k] + hw, bz[1], bz[2], DEEP_BEAM, bz[2] - bz[1]);
    add(`col${k}-23`, bx[k] - hw, bx[k] + hw, bz[2], bz[3], BEAM.d, bz[3] - bz[2]);
  }
  add('court-trim-N', fBe, fCw, COURT.z0 - BEAM.w, COURT.z0, BEAM.d, fCw - fBe);
  add('court-edge-E', COURT.x1, COURT.x1 + BEAM.w, COURT.z0, COURT.z1, BEAM.d, COURT.z1 - COURT.z0);
  add('stair-trim-S', fBe, fCw, STAIR.opening.z1, STAIR.opening.z1 + BEAM.w, BEAM.d, fCw - fBe);
  add('stair-trim-W', STAIR.opening.x0 - BEAM.w, STAIR.opening.x0, STAIR.opening.z0, STAIR.opening.z1, BEAM.d, STAIR.opening.z1 - STAIR.opening.z0);
}

// ------------------------------------------------------- terrace & roof ----
export const TERRACE = {
  fall: 0.06,                     // the finish rises 60 mm from the court guard to the parapets (≥ 1:100)
  // Light steel frame carrying PV over the west wing, tilted to face south.
  solar: { x0: -5.40, x1: -2.50, z0: -3.90, z1: 3.60, h: 2.40, tiltDeg: 11,
    posts: [[-5.40, -3.90], [-2.50, -3.90], [-5.40, -0.15], [-2.50, -0.15], [-5.40, 3.60], [-2.50, 3.60]] },
  tank: { x: 0.00, z: -3.15, r: 0.56, h: 1.30, litres: 1000 },
  planters: [
    { x0: 2.60, x1: 5.60, z0: -3.55, z1: -3.10, h: 0.45 },
    { x0: 5.15, x1: 5.60, z0: -2.60, z1: 1.60, h: 0.45 },
    { x0: -1.70, x1: 0.60, z0: 3.10, z1: 3.55, h: 0.45 },
  ],
  washCanopy: { x0: 4.40, x1: 6.22, z0: 2.40, z1: 4.17, h: 2.30, posts: [[4.45, 2.45], [6.17, 2.45], [4.45, 4.12]] },
};
// Stair head (mumty) on the terrace; its roof carries the 1,000 L tank.
export const MUMTY = { x0: fBw, x1: fCe, z0: HOUSE.z0, z1: yMumtyS + WALL_T.grid / 2, roofTop: LEVELS.mumtyRoof };
// Flat stone coping (with drip overhangs) on every wall top exposed to rain.
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
// enters LOW at the south-west (master suite and the shaded stilts), crosses the
// court and the open half of the house, and leaves HIGH through the open court,
// the stair stack (mumty jaali) and the leeward east vents.
const yF = LEVELS.first, yT = LEVELS.terrace;
const swEntry = [[-4.30, yF + 0.38, GRID.z[3]], [-4.10, yF + 0.70, 3.40], [-3.40, yF + 1.10, 1.80], [-2.70, yF + 1.40, 0.70], [GRID.x.B, yF + 1.50, 0.50]];
export const AIRFLOW = {
  windFrom: 'SW',
  inlets: [
    { id: 'master-s-low', opening: 'master-s-win', at: [-4.30, yF + 0.38, GRID.z[3]] },
    { id: 'master-w-low', opening: 'master-w-win', at: [GRID.x.A, yF + 0.38, 0.60] },
    { id: 'stilt-sw', at: [-6.60, 0.80, 2.60] },
  ],
  exhausts: [
    { id: 'court-sky', at: [-0.60, yT + 2.30, 0.15] },
    { id: 'mumty-e', opening: 'mumty-e-exhaust', at: [GRID.x.C, yT + 2.00, -3.10] },
    { id: 'kitchen-e-high', opening: 'kitchen-e-exhaust', at: [GRID.x.D, yF + 2.30, 0.55] },
    { id: 'pooja-e-high', opening: 'pooja-e-exhaust', at: [GRID.x.D, yF + 2.30, -3.45] },
  ],
  paths: [
    { id: 'sw-court', from: 'master-s-low', to: 'court-sky', pts: [...swEntry, [-1.20, yF + 1.80, 0.30], [-0.60, yF + 2.60, 0.15], [-0.60, yT + 0.60, 0.15], [-0.60, yT + 2.30, 0.15]] },
    { id: 'sw-stair', from: 'master-w-low', to: 'mumty-e', pts: [[GRID.x.A, yF + 0.38, 0.60], [-5.00, yF + 0.60, 0.40], [-3.60, yF + 1.00, -0.80], [-2.80, yF + 1.30, -1.55], [GRID.x.B, yF + 1.50, -1.65], [-1.60, yF + 1.70, -1.80], [-0.60, yF + 2.20, -2.50], [0.40, yF + 2.90, -2.80], [1.20, yT + 0.40, -2.90], [1.80, yT + 1.60, -3.05], [GRID.x.C, yT + 2.00, -3.10], [2.80, yT + 2.05, -3.10]] },
    { id: 'stilt-court', from: 'stilt-sw', to: 'court-sky', pts: [[-6.60, 0.80, 2.60], [-5.20, 0.90, 1.00], [-3.20, 1.00, 0.60], [-1.60, 1.10, 0.40], [-0.60, 1.40, 0.20], [-0.60, 2.40, 0.15], [-0.60, yF + 1.80, 0.15], [-0.60, yT + 2.30, 0.15]] },
    { id: 'sw-kitchen', from: 'master-s-low', to: 'kitchen-e-high', pts: [...swEntry, [-1.20, yF + 1.60, 0.40], [0.90, yF + 1.70, 0.45], [2.80, yF + 1.80, 0.50], [4.80, yF + 2.10, 0.55], [GRID.x.D, yF + 2.30, 0.55], [6.90, yF + 2.40, 0.55]] },
    { id: 'sw-pooja', from: 'master-s-low', to: 'pooja-e-high', pts: [...swEntry, [-1.00, yF + 1.60, 0.20], [0.60, yF + 1.70, -0.40], [1.80, yF + 1.80, -1.20], [3.20, yF + 1.85, -2.40], [4.80, yF + 1.90, -3.30], [5.80, yF + 2.10, -3.45], [GRID.x.D, yF + 2.30, -3.45], [6.90, yF + 2.40, -3.45]] },
  ],
};

// ------------------------------------------------------------ furniture ----
// Boxes used by the 3D builder (detailed by type), the plans and collision.
// `face` = the direction a seat faces; `head` = the bed-head wall.
// Counter `sink`/`stove` = world-coordinate ranges along the counter's length.
const F = (id, level, type, x0, x1, z0, z1, h, extra = {}) => ({ id, level, type, x0, x1, z0, z1, h, ...extra });
export const FURNITURE = [
  // living + pooja (NE). The pooja is a closed teak cabinet with jaali doors; the idols face west.
  F('sofa', 'first', 'diwan', 2.55, 4.55, -4.05, -3.30, 0.42),
  F('oonjal', 'first', 'swing', 2.75, 4.25, -2.75, -2.25, 0.45, { hang: true, passable: true }),
  F('living-chair', 'first', 'chair', 4.85, 5.40, -2.55, -2.00, 0.85, { face: 'W' }),
  F('pooja-unit', 'first', 'poojaunit', 5.45, fD, -4.05, -3.05, 1.95, { face: 'W' }),
  // open kitchen: U with the mouth to the north. West leg = breakfast counter with stools
  // (no separate dining table), south leg = sink + fridge, east leg = stove under the exhaust.
  F('kit-bar', 'first', 'bar', 2.95, 4.25, -1.00, 0.70, 0.90, { back: 'E', seat: 'W', stools: 3 }),
  F('fridge', 'first', 'fridge', 3.65, 4.35, 0.70, R2n, 1.80),
  F('kit-counter-s', 'first', 'counter', 4.35, 5.55, 0.75, R2n, 0.85, { sink: [4.60, 5.30], back: 'S' }),
  F('kit-counter-e', 'first', 'counter', 5.55, fD, -1.45, R2n, 0.85, { stove: [0.15, 0.95], back: 'E' }),
  // parents (S)
  F('parents-bed', 'first', 'bed', fBe, -0.085, 2.10, 3.60, 0.50, { head: 'W' }),
  F('parents-side', 'first', 'sidetable', fBe, -1.685, 1.62, 2.02, 0.55),
  F('parents-side2', 'first', 'sidetable', fBe, -1.685, 3.68, 4.08, 0.55),
  F('parents-wardrobe', 'first', 'wardrobe', 1.475, fCw, 2.55, fS, 2.10),
  // kids (SE)
  F('kids-bed', 'first', 'bed', 4.15, fD, 2.95, fS, 0.45, { head: 'E', single: true }),
  F('kids-desk', 'first', 'desk', 4.40, 5.80, R2s, 2.18, 0.75, { face: 'N' }),
  F('kids-wardrobe', 'first', 'wardrobe', fCe, 2.905, 2.55, fS, 2.10),
  // master suite (W + SW): a wardrobe wall divides the dressing zone from the bedroom.
  F('master-bed', 'first', 'bed', fA, -3.55, 2.15, 3.65, 0.50, { head: 'W' }),
  F('master-side', 'first', 'sidetable', fA, -5.10, 1.72, 2.10, 0.55),
  F('master-side2', 'first', 'sidetable', fA, -5.10, 3.70, 4.08, 0.55),
  F('master-wardrobe', 'first', 'wardrobe', fA, -3.25, -0.85, -0.25, 2.10, { back: 'S' }),
  F('master-chair', 'first', 'chair', -2.95, -2.40, 0.60, 1.15, 0.85, { face: 'E' }),
  // baths
  F('mb-shower', 'first', 'shower', fA, -4.05, fN, -3.45, 0.04, { passable: true }),
  F('mb-wc', 'first', 'wc', fA, -4.95, -2.90, -2.25, 0.42),
  F('mb-basin', 'first', 'basin', fA, -5.05, -3.40, -2.95, 0.85),
  F('cb-shower', 'first', 'shower', -3.90, -3.00, fN, -3.30, 0.04, { passable: true }),
  F('cb-wc', 'first', 'wc', -3.90, -3.30, -3.00, -2.30, 0.42),
  F('cb-basin', 'first', 'basin', -3.15, -2.65, -2.65, -2.20, 0.85),
  // ground
  F('thinnai-n', 'ground', 'thinnai', -4.60, -2.95, -4.05, -3.55, 0.45, { back: 'N' }),
  F('thinnai-s', 'ground', 'thinnai', -4.60, -2.95, -2.70, -2.25, 0.45, { back: 'S' }),
  F('water-point', 'ground', 'waterpot', -5.45, -4.95, -1.95, -1.45, 0.95),
  F('car', 'ground', 'car', -5.40, -0.90, 2.05, 3.85, 1.50),
  F('scooter', 'ground', 'scooter', -5.10, -3.40, 0.15, 0.80, 1.10),
  F('cycle', 'ground', 'cycle', -5.10, -3.40, -0.30, -0.05, 0.95),
  F('tulsi', 'ground', 'tulsi', 0.25, 0.75, 0.70, 1.20, 0.85),
  F('uruli', 'ground', 'uruli', -0.10, 0.60, -0.70, 0.00, 0.25),
  F('store-understair', 'ground', 'store', -0.40, fCw, fN, -3.22, 1.20),
  F('store-midlanding', 'ground', 'store', STAIR.midLanding.x0, fCw, -3.22, STAIR.box.z1, 1.20),
  // terrace
  F('wash-counter', 'terrace', 'counter', 5.62, 6.22, 2.60, 4.17, 0.85, { sink: [3.00, 3.60], back: 'E' }),
  F('washer', 'terrace', 'washer', 4.90, 5.50, 3.57, 4.17, 0.85),
  F('t-chair-1', 'terrace', 'chair', -0.20, 0.40, 2.20, 2.80, 0.85, { face: 'N' }),
  F('t-chair-2', 'terrace', 'chair', 0.80, 1.40, 2.20, 2.80, 0.85, { face: 'N' }),
];
export const COURT_TREE = { x: -1.30, z: 0.55, h: 4.6, canopy: 0.85 };
export const PALM = { x: -6.90, z: -4.05, h: 7.5 };

// --------------------------------------------------- viewpoints (jumps) ----
// pos/look are [x, y, z]. For walk viewpoints, y = floor level + eye height.
export const VIEWPOINTS = [
  { id: 'overview', label: 'Overview', mode: 'orbit', pos: [-17.5, 13.5, 15.5], look: [0.3, 3.2, 0] },
  { id: 'gate', label: 'West gate', mode: 'walk', pos: [-8.9, EYE - ROAD.drop, 2.75], look: [-2.0, 1.4, 2.4] },
  { id: 'entrance', label: 'Thinnai + main door', mode: 'walk', pos: [-5.20, EYE, -3.125], look: [-2.2, 1.3, -3.125] },
  { id: 'court-garden', label: 'Courtyard garden', mode: 'walk', pos: [1.90, EYE, 0.10], look: [-0.6, 3.4, 0.1] },
  { id: 'stair', label: 'Stair hall', mode: 'walk', pos: [-1.60, EYE, -2.70], look: [1.2, 1.4, -2.65] },
  { id: 'hall', label: 'Hall + nadumuttam', mode: 'walk', pos: [-1.55, yF + EYE, -1.60], look: [0.2, yF + 0.6, 0.4] },
  { id: 'living', label: 'Living + pooja (NE)', mode: 'walk', pos: [2.70, yF + EYE, -1.90], look: [5.6, yF + 1.0, -3.6] },
  { id: 'kitchen', label: 'Open kitchen (U)', mode: 'walk', pos: [2.00, yF + EYE, -0.20], look: [5.5, yF + 0.9, 0.4] },
  { id: 'family', label: 'Family + court view', mode: 'walk', pos: [2.60, yF + EYE, 1.00], look: [-1.0, yF + 1.0, -0.2] },
  { id: 'parents', label: 'Parents (S)', mode: 'walk', pos: [1.40, yF + EYE, 2.20], look: [-1.0, yF + 1.0, 3.0] },
  { id: 'kids', label: 'Kids (SE)', mode: 'walk', pos: [2.85, yF + EYE, 2.30], look: [5.5, yF + 1.0, 3.3] },
  { id: 'master', label: 'Master suite (SW)', mode: 'walk', pos: [-2.85, yF + EYE, -1.55], look: [-4.6, yF + 1.0, 2.6] },
  { id: 'bath', label: 'Common bath', mode: 'walk', pos: [-1.55, yF + EYE, -3.55], look: [-3.2, yF + 1.1, -3.0], open: ['cbath-door'] },
  { id: 'terrace', label: 'Terrace garden', mode: 'walk', pos: [-1.55, yT + EYE, -1.60], look: [2.8, yT + 0.6, 1.6] },
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
// The court guard occupies a band of slab just outside the void edge, on its open
// sides only (g.sides; default all four).
export function guardBands(g) {
  const t = g.t, sides = g.sides || ['N', 'S', 'W', 'E'];
  const ex0 = sides.includes('W') ? t : 0, ex1 = sides.includes('E') ? t : 0;
  const all = {
    N: { x0: g.x0 - ex0, x1: g.x1 + ex1, z0: g.z0 - t, z1: g.z0 },
    S: { x0: g.x0 - ex0, x1: g.x1 + ex1, z0: g.z1, z1: g.z1 + t },
    W: { x0: g.x0 - t, x1: g.x0, z0: g.z0, z1: g.z1 },
    E: { x0: g.x1, x1: g.x1 + t, z0: g.z0, z1: g.z1 },
  };
  return sides.map((k) => ({ id: `${g.id}-${k}`, ...all[k] }));
}
// Gate leaf: slides along a track just inside the (slanted) west compound wall.
// closed = [p0, p1] spanning the opening; open = the same leaf parked north of it.
// dir = unit vector along the leaf (south-going), w = leaf length.
export function gateLeaves() {
  const at = (z) => [boundaryX('W', z) + COMPOUND.t + GATE.track, z];
  const p0 = at(GATE.z0), p1 = at(GATE.z1);
  const w = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const u = [(p1[0] - p0[0]) / w, (p1[1] - p0[1]) / w];
  const shift = w + 0.10;
  const q0 = [p0[0] - u[0] * shift, p0[1] - u[1] * shift];
  return [{ id: 'gate-leaf', sliding: true, closed: [p0, p1], open: [q0, [q0[0] + u[0] * w, q0[1] + u[1] * w]], dir: u, w }];
}
// Slab openings per floor level (rectangles open to below).
export const SLAB_OPENINGS = {
  first: [{ id: 'court', ...COURT }, { id: 'stair', ...STAIR.opening }],
  terrace: [{ id: 'court', ...COURT }, { id: 'stair', ...STAIR.opening }],
};
