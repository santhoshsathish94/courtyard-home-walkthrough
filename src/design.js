// =============================================================================
// DESIGN DATA: the single source of truth for the 3D model, the 2D plans,
// walk-mode collision and the Node validator (scripts/validate.mjs).
//
// Units: metres. Axes: +x = east (the road is on −x, the west), +z = south
// (north = −z), +y = up. Origin = centre of the 46 × 33 ft rectangle that the
// plot extends from (only the north-east corner reaches further east).
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
export const DEEP_BEAM = BEAM.d;          // no deep beams: every span ≤ 4.2 m
export const PARAPET_H = 1.0;             // terrace parapet + court guard height
export const EYE = 1.62;

// ------------------------------------------------------------------ plot ----
// Owner's brief: the road (west) side is straight, 33 ft, square to the north and
// south sides; south 46 ft; north 52 ft (only the north-east corner is extended).
// The east side follows: √(33² + 6²) = 33.54 ft. Area = 33 × (46 + 52) / 2 =
// 1,617 sq ft, which matches the stated 1,620 sq ft within 0.2 %.
// Corner angles and levels are not surveyed.
const W_FT = 33, S_FT = 46, N_FT = 52;
const plotDepth = W_FT * FT;                 // 10.0584 m (W side)
const hz = plotDepth / 2;
const xW = -(S_FT * FT) / 2;                 // −7.0104: straight road boundary
const xSE = (S_FT * FT) / 2;                 //  7.0104
const xNE = xW + N_FT * FT;                  //  8.8392
export const PLOT = {
  sidesFt: { N: N_FT, S: S_FT, W: W_FT, E: Math.hypot(W_FT, N_FT - S_FT) },
  derivedSides: ['E'],
  statedAreaSqFt: 1620,
  vertices: [[xW, -hz], [xNE, -hz], [xSE, hz], [xW, hz]], // (x, z) clockwise from NW
  depth: plotDepth,
  assumption: 'Owner-confirmed outline: straight 33 ft road side square to the 52 ft north and 46 ft south sides; the east side (33′-6½″) is derived. Corner angles, bearing and levels are not surveyed.',
};
export const PLOT_HZ = hz;
// x of the west / east boundary line at a given z.
export const boundaryX = (side, z) => {
  if (side === 'W') return xW;
  const t = (z + hz) / plotDepth;
  return xNE + (xSE - xNE) * t;
};

// Compound wall: smooth lime-plastered masonry on the boundary, inside the plot.
// Rows 1 and 4 and line D of the structure stand in (merge with) this wall.
export const COMPOUND = { t: 0.23, h: 1.50, coping: 0.08 };
export const ROAD = { width: 6.0, drop: 0.15 };   // indicative only

// ----------------------------------------------------------------- house ----
// First-floor envelope (outer faces). North, south and east faces sit on the
// compound-wall line; the west façade steps in 1.2 m so a full-width balcony can
// project to (not over) the road boundary.
export const HOUSE = { x0: -5.80, x1: 6.85, z0: -4.88, z1: 4.88 };
export const WALL_T = { exterior: 0.30, grid: 0.23, partition: 0.15, parapet: 0.23 };
// West balcony: a cantilevered first-floor deck with a glass railing and a thin
// concrete "frame" roof at terrace level.
export const BALCONY = { x0: -6.98, x1: HOUSE.x0, z0: -1.15, z1: HOUSE.z1, rail: 1.05 };

// --------------------------------------------- 16-column structural grid ----
// Four column lines (A–D, west → east) × four rows (1–4, north → south) make a
// nine-square plan. The four centre columns (B2, C2, B3, C3) frame the open court.
export const GRID = {
  x: { A: -5.65, B: -1.55, C: 2.65, D: 6.70 },
  z: { 1: -4.73, 2: -1.15, 3: 1.65, 4: 4.73 },
  column: 0.30,
};
export const COLUMNS = [];
// Columns hide inside the walls (230 × 450 mm in 9-inch walls, 300 mm at the
// corners), the usual Indian RCC practice. C2 is the exception: one round,
// exposed concrete column at the court's open corner (hall / living / kitchen).
const colSize = (xl, zl) => {
  const extX = xl === 'A' || xl === 'D', extZ = zl === '1' || zl === '4';
  if (extX && extZ) return [0.30, 0.30];
  if (extZ) return [0.45, 0.30];
  if (extX) return [0.30, 0.45];
  return [0.23, 0.45];
};
// C3 slides 110 mm south to sit flush inside the bedroom wall; C2 moves 40 mm
// north-east so its round section clears the court's glass guard corner.
const COL_SHIFT = { C3: [0, 0.11], C2: [0.04, -0.04] };
for (const [xl, x] of Object.entries(GRID.x)) {
  for (const [zl, z] of Object.entries(GRID.z)) {
    const id = `${xl}${zl}`, [dx, dz] = COL_SHIFT[id] || [0, 0];
    if (id === 'C2') { COLUMNS.push({ id, x: x + dx, z: z + dz, w: 0.30, d: 0.30, round: true, expressed: true }); continue; }
    const [w, d] = colSize(xl, zl);
    COLUMNS.push({ id, x: x + dx, z: z + dz, w, d });
  }
}
// Inner wall faces used throughout (derived from the grid and wall thicknesses).
export const FACE = {
  A: GRID.x.A + WALL_T.exterior / 2,   // −5.50
  Bw: GRID.x.B - WALL_T.grid / 2,      // −1.665
  Be: GRID.x.B + WALL_T.grid / 2,      // −1.435
  Cw: GRID.x.C - WALL_T.grid / 2,      //  2.535
  Ce: GRID.x.C + WALL_T.grid / 2,      //  2.765
  D: GRID.x.D - WALL_T.exterior / 2,   //  6.55
  N: GRID.z[1] + WALL_T.exterior / 2,  // −4.58
  S: GRID.z[4] - WALL_T.exterior / 2,  //  4.58
  R2n: GRID.z[2] - WALL_T.grid / 2,    // −1.265
  R2s: GRID.z[2] + WALL_T.grid / 2,    // −1.035
  R3n: GRID.z[3] - WALL_T.grid / 2,    //  1.535
  R3s: GRID.z[3] + WALL_T.grid / 2,    //  1.765
};
const { A: fA, Bw: fBw, Be: fBe, Cw: fCw, Ce: fCe, D: fD, N: fN, S: fS, R2n, R2s, R3n, R3s } = FACE;

// ------------------------------------------------- nadumuttam (open court) ----
// The centre square, open from the ground garden to the sky. Its west and south
// edges are the master-suite and bedroom-2 walls (with windows onto the court);
// its north and east edges open to the hall and the kitchen behind a glass guard.
// A small landing in its south-east corner gives bedroom 2 its door.
export const COURT = { x0: fBe, x1: fCw, z0: R2s, z1: R3n };            // 3.97 × 2.57 m
export const COURT_LANDING = { x0: 1.35, x1: fCw, z0: 0.55, z1: R3n };
export const COURT_VOID = [
  { id: 'court', x0: COURT.x0, x1: COURT_LANDING.x0, z0: COURT.z0, z1: COURT.z1 },
  { id: 'court-e', x0: COURT_LANDING.x0, x1: COURT.x1, z0: COURT.z0, z1: COURT_LANDING.z0 },
];

// --------------------------------------------------------------- stair ----
// One straight stair along the north wall, rising west → east. 18 equal risers per
// storey in two flights of 9 with a mid landing. The main run climbs from the stilt
// garden to the first-floor entrance foyer; the terrace run is stacked above it,
// starting 0.92 m further east from a pocket off the utility lobby.
export const STAIR = {
  risers: 18,
  riser: (LEVELS.first - LEVELS.ground) / 18,   // 0.1778 m
  tread: 0.26,
  width: 0.90,
  waist: 0.15,
  perFlight: 9,
  midLanding: 0.90,
  lane: { z0: fN, z1: fN + 0.90 },               // −4.58 … −3.68
  runs: [
    { id: 'main', from: 'ground', to: 'first', x0: -3.95, foot: [-4.95, -3.95], landing: [1.11, fCw] },
    { id: 'upper', from: 'first', to: 'terrace', x0: -3.03, foot: [-3.95, -3.03], landing: [2.03, 3.135] },
  ],
  // Slab openings in the lane; the floor elsewhere stays solid.
  openings: { first: { x0: -3.03, x1: 1.11 }, terrace: { x0: -2.15, x1: 2.03 } },
  trim: { z0: fN + 0.90, z1: fN + 0.90 + BEAM.w }, // trimmer beam south of the lane
};
// Derived extents of run i: flights f1/f2, mid landing and levels.
export function stairRun(i) {
  const s = STAIR, r = s.runs[i], n = (s.perFlight - 1) * s.tread, q = (v) => Math.round(v * 1e6) / 1e6;
  const f1 = { x0: r.x0, x1: q(r.x0 + n) };
  const mid = { x0: f1.x1, x1: q(f1.x1 + s.midLanding) };
  const f2 = { x0: mid.x1, x1: q(mid.x1 + n) };
  return { ...r, y0: LEVELS[r.from], y1: LEVELS[r.to], f1, mid, f2, x1: f2.x1 };
}
export const STAIR_RUNS = STAIR.runs.map((_, i) => stairRun(i));
// Height of the walking line at plan position (x, z) for the run starting at y0.
// Returns null when (x, z) is not on that run's flights or mid landing.
export function stairWalkY(x, z, y0) {
  const s = STAIR, run = STAIR_RUNS.find((r) => Math.abs(r.y0 - y0) < 1e-6);
  if (!run || z < s.lane.z0 || z > s.lane.z1) return null;
  const H = s.perFlight * s.riser;
  if (x >= run.f1.x0 && x <= run.f1.x1) return y0 + (H * (x - run.f1.x0)) / (run.f1.x1 - run.f1.x0);
  if (x > run.mid.x0 && x < run.mid.x1) return y0 + H;
  if (x >= run.f2.x0 && x <= run.f2.x1) return y0 + H + (H * (x - run.f2.x0)) / (run.f2.x1 - run.f2.x0);
  return null;
}
// Treads for the run starting at y0: 8 per flight (the 9th riser lands on the
// mid landing or the floor).
export function stairTreads(y0) {
  const s = STAIR, T = s.tread, r = s.riser, run = STAIR_RUNS.find((q) => Math.abs(q.y0 - y0) < 1e-6), out = [];
  if (!run) return out;
  for (let k = 1; k < s.perFlight; k++) {
    out.push({ flight: 1, k, x0: run.f1.x0 + (k - 1) * T, x1: run.f1.x0 + k * T, z0: s.lane.z0, z1: s.lane.z1, top: y0 + k * r });
  }
  for (let k = 1; k < s.perFlight; k++) {
    out.push({ flight: 2, k, x0: run.f2.x0 + (k - 1) * T, x1: run.f2.x0 + k * T, z0: s.lane.z0, z1: s.lane.z1, top: y0 + (s.perFlight + k) * r });
  }
  return out;
}

// ------------------------------------------------------- walls & openings ----
// Each opening is { id, type, s, w, sill, head } plus optional fields:
//   s = start distance from wall point a, w = width.
//   type = door | arch | window | jaali | slider.
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
const laneS = STAIR.lane.z1;                         // −3.68
// Stair head (mumty) on the terrace: encloses the terrace opening and the top landing.
export const MUMTY = { x0: -3.015, x1: 3.365, z0: HOUSE.z0, z1: STAIR.trim.z1, roofTop: LEVELS.mumtyRoof };
const mzS = (STAIR.trim.z0 + STAIR.trim.z1) / 2;     // −3.565: mumty south wall line

export const WALLS = [
  // ---------------- first floor: exterior walls (0.30 m, on grid lines) ----------------
  Wl('ff-N', 'first', [xs, GRID.z[1]], [xe, GRID.z[1]], WALL_T.exterior, 'exterior', [
    { id: 'cbath-n-win', type: 'window', s: 0.50, w: 0.80, sill: 1.60, head: 2.30 },
    { id: 'stair-n-jaali-1', type: 'jaali', s: 2.10, w: 1.80, sill: 0.30, head: 2.75 },
    { id: 'stair-n-jaali-2', type: 'jaali', s: 4.60, w: 2.10, sill: 0.30, head: 2.75 },
    { id: 'foyer-n-jaali', type: 'jaali', s: 7.05, w: 1.10, sill: 0.30, head: 2.75 },
    { id: 'living-n-win', type: 'window', s: 9.25, w: 2.40, sill: 1.95, head: 2.65 },
  ]),
  Wl('ff-E', 'first', [GRID.x.D, fN], [GRID.x.D, fS], WALL_T.exterior, 'exterior', [
    { id: 'pooja-e-exhaust', type: 'jaali', s: 0.28, w: 0.80, sill: 2.00, head: 2.60, role: 'exhaust', hood: true },
    { id: 'living-e-win', type: 'window', s: 1.58, w: 1.20, sill: 0.60, head: 2.40 },
    { id: 'kitchen-e-win', type: 'window', s: 3.98, w: 1.00, sill: 1.05, head: 2.10 },
    { id: 'kitchen-e-exhaust', type: 'jaali', s: 5.18, w: 0.70, sill: 2.00, head: 2.60, role: 'exhaust', hood: true },
    { id: 'bed3-e-win', type: 'window', s: 6.60, w: 1.20, sill: 0.75, head: 2.40 },
  ]),
  Wl('ff-S', 'first', [xs, GRID.z[4]], [xe, GRID.z[4]], WALL_T.exterior, 'exterior', [
    { id: 'master-s-win', type: 'window', s: 0.90, w: 1.20, sill: 0.75, head: 2.25, lowJaali: [0.15, 0.60], role: 'inlet', hood: true },
    { id: 'bed2-s-win', type: 'window', s: 5.30, w: 2.00, sill: 0.75, head: 2.40 },
    { id: 'bed3-s-win', type: 'window', s: 9.60, w: 1.60, sill: 0.75, head: 2.40 },
  ]),
  Wl('ff-W', 'first', [GRID.x.A, fN], [GRID.x.A, fS], WALL_T.exterior, 'exterior', [
    { id: 'cbath-w-win', type: 'window', s: 1.38, w: 0.80, sill: 1.60, head: 2.30 },
    { id: 'mbath-w-win', type: 'window', s: 3.88, w: 0.80, sill: 1.60, head: 2.30 },
    { id: 'master-slider', type: 'slider', s: 6.83, w: 1.80, sill: 0, head: 2.40 },
  ]),
  // ---------------- first floor: walls on grid lines (0.23 m) ----------------
  // Line B, north bay: utility lobby | hall, joined by a wide arch.
  Wl('ff-B-n', 'first', [GRID.x.B, -3.555], [GRID.x.B, GRID.z[2]], WALL_T.grid, 'grid', [
    { id: 'lobby-arch', type: 'arch', s: 0.15, w: 1.10, head: 2.40 },
  ]),
  // Row 2, west bay: lobby | master dressing. The master suite is entered here.
  Wl('ff-2w', 'first', [GRID.x.A, GRID.z[2]], [GRID.x.B, GRID.z[2]], WALL_T.grid, 'grid', [
    { id: 'master-door', type: 'door', s: 3.085, w: 0.80, head: 2.10, swing: 'S', hinge: 'E', room: 'mdress' },
  ]),
  // Line B, centre bay: the master dressing wall = the court's west edge.
  Wl('ff-B-c', 'first', [GRID.x.B, GRID.z[2]], [GRID.x.B, GRID.z[3]], WALL_T.grid, 'grid', [
    { id: 'master-court-win', type: 'window', s: 0.35, w: 1.70, sill: 0.90, head: 2.25, court: true },
  ]),
  // Row 3: the bedroom wing's north wall = the court's south edge.
  Wl('ff-3', 'first', [GRID.x.A, GRID.z[3]], [GRID.x.D, GRID.z[3]], WALL_T.grid, 'grid', [
    { id: 'master-arch', type: 'arch', s: 2.90, w: 1.00, head: 2.40 },
    { id: 'bed2-court-win', type: 'window', s: 4.55, w: 2.30, sill: 0.90, head: 2.25, court: true },
    { id: 'bed2-door', type: 'door', s: 7.27, w: 0.80, head: 2.10, swing: 'S', hinge: 'E', room: 'bed2' },
    { id: 'bed3-door', type: 'door', s: 8.53, w: 0.80, head: 2.10, swing: 'S', hinge: 'W', room: 'bed3' },
  ]),
  Wl('ff-B-s', 'first', [GRID.x.B, GRID.z[3]], [GRID.x.B, fS], WALL_T.grid, 'grid'),
  Wl('ff-C-s', 'first', [GRID.x.C, GRID.z[3]], [GRID.x.C, fS], WALL_T.grid, 'grid'),
  // Line C, north bay: entrance foyer | living (only as far as the foyer).
  Wl('ff-C-lane', 'first', [GRID.x.C, fN], [GRID.x.C, -3.0], WALL_T.grid, 'grid'),
  // ---------------- first floor: partitions (0.15 m) ----------------
  Wl('ff-p-cbath', 'first', [-4.025, fN], [-4.025, R2n], WALL_T.partition, 'partition', [
    { id: 'cbath-door', type: 'door', s: 1.38, w: 0.75, head: 2.10, swing: 'E', hinge: 'S', room: 'cbath', defaultOpen: false },
  ]),
  Wl('ff-p-mbath-e', 'first', [-3.525, R2s], [-3.525, R3n], WALL_T.partition, 'partition', [
    { id: 'mbath-door', type: 'door', s: 0.935, w: 0.70, head: 2.10, swing: 'E', hinge: 'N', room: 'mbath', defaultOpen: false },
  ]),
  // Full-height slender fins guard the stairwell from the lobby and hall while
  // letting light and air through.
  Wl('ff-stair-screen', 'first', [STAIR.openings.first.x0, -3.605], [STAIR.openings.first.x1, -3.605], 0.10, 'screen'),
  // Entrance foyer at the top of the main stair: the main door opens outward into it.
  Wl('ff-foyer-w', 'first', [1.185, laneS], [1.185, -3.0], WALL_T.partition, 'partition'),
  Wl('ff-entry', 'first', [1.11, -3.0], [fCw, -3.0], WALL_T.partition, 'partition', [
    { id: 'main-door', type: 'door', s: 0.20, w: 1.00, head: 2.20, swing: 'N', leaves: 2, main: true, room: 'hall' },
  ]),

  // ---------------- ground: a board-formed concrete wall with terracotta jaali screens
  // the stair's north side from the neighbour while letting air through ----------------
  Wl('gf-N', 'ground', [GRID.x.A, GRID.z[1]], [GRID.x.C, GRID.z[1]], WALL_T.exterior, 'exterior', [
    { id: 'stair-gf-jaali-1', type: 'jaali', s: 0.40, w: 3.25, sill: 0.45, head: 2.45 },
    { id: 'stair-gf-jaali-2', type: 'jaali', s: 4.55, w: 3.15, sill: 0.45, head: 2.45 },
  ]),

  // ---------------- terrace: parapets, court guard and stair head (mumty) ----------------
  Wl('tr-N', 'terrace', [xs, HOUSE.z0 + pIn], [MUMTY.x0, HOUSE.z0 + pIn], WALL_T.parapet, 'parapet'),
  Wl('tr-mumty-N', 'terrace', [MUMTY.x0, HOUSE.z0 + pIn], [MUMTY.x1, HOUSE.z0 + pIn], WALL_T.parapet, 'mumty', [
    { id: 'mumty-n-exhaust', type: 'jaali', s: 2.00, w: 1.80, sill: 1.70, head: 2.30, role: 'exhaust', hood: true },
  ], { h: HM }),
  Wl('tr-N2', 'terrace', [MUMTY.x1, HOUSE.z0 + pIn], [xe, HOUSE.z0 + pIn], WALL_T.parapet, 'parapet'),
  Wl('tr-S', 'terrace', [xs, HOUSE.z1 - pIn], [4.40, HOUSE.z1 - pIn], WALL_T.parapet, 'parapet'),
  // At the wash area the washer and counter stand against the parapet, so the guard
  // rises to 1.8 m with a jaali above the 1.0 m solid parapet (child safety).
  Wl('tr-S-wash', 'terrace', [4.40, HOUSE.z1 - pIn], [xe, HOUSE.z1 - pIn], WALL_T.parapet, 'parapet', [], { h: 1.80, jaaliAbove: PARAPET_H }),
  Wl('tr-W', 'terrace', [xs + pIn, HOUSE.z0 + 2 * pIn], [xs + pIn, HOUSE.z1 - 2 * pIn], WALL_T.parapet, 'parapet'),
  Wl('tr-E', 'terrace', [xe - pIn, HOUSE.z0 + 2 * pIn], [xe - pIn, 2.00], WALL_T.parapet, 'parapet'),
  Wl('tr-E-wash', 'terrace', [xe - pIn, 2.00], [xe - pIn, HOUSE.z1 - 2 * pIn], WALL_T.parapet, 'parapet', [], { h: 1.80, jaaliAbove: PARAPET_H }),
  // Court guard walls follow the L-shaped void (the landing corner stays roofed).
  Wl('tr-court-N', 'terrace', [fBw, GRID.z[2]], [fCe, GRID.z[2]], WALL_T.parapet, 'guard'),
  Wl('tr-court-W', 'terrace', [GRID.x.B, R2s], [GRID.x.B, R3n], WALL_T.parapet, 'guard'),
  Wl('tr-court-S', 'terrace', [fBw, GRID.z[3]], [COURT_LANDING.x0 + WALL_T.parapet, GRID.z[3]], WALL_T.parapet, 'guard'),
  Wl('tr-court-E', 'terrace', [GRID.x.C, R2s], [GRID.x.C, COURT_LANDING.z0 + WALL_T.parapet], WALL_T.parapet, 'guard'),
  Wl('tr-court-LN', 'terrace', [COURT_LANDING.x0, COURT_LANDING.z0 + pIn], [fCw, COURT_LANDING.z0 + pIn], WALL_T.parapet, 'guard'),
  Wl('tr-court-LW', 'terrace', [COURT_LANDING.x0 + pIn, COURT_LANDING.z0 + WALL_T.parapet], [COURT_LANDING.x0 + pIn, R3n], WALL_T.parapet, 'guard'),
  Wl('tr-mumty-W', 'terrace', [-2.90, HOUSE.z0 + 2 * pIn], [-2.90, MUMTY.z1], WALL_T.grid, 'mumty', [], { h: HM }),
  Wl('tr-mumty-E', 'terrace', [3.25, HOUSE.z0 + 2 * pIn], [3.25, MUMTY.z1], WALL_T.grid, 'mumty', [], { h: HM }),
  Wl('tr-mumty-S', 'terrace', [MUMTY.x0, mzS], [MUMTY.x1, mzS], WALL_T.grid, 'mumty', [
    { id: 'mumty-door', type: 'door', s: 5.215, w: 0.80, head: 2.10, swing: 'S', hinge: 'E', room: 'terrace' },
  ], { h: HM }),
];
for (const w of WALLS) {
  if (w.h === undefined) w.h = w.level === 'first' ? H1 : w.level === 'ground' ? LEVELS.first - BEAM.d : PARAPET_H;
  for (const o of w.openings) {
    if (o.sill === undefined) o.sill = 0;
    if (o.type === 'door' && o.defaultOpen === undefined) o.defaultOpen = true;
  }
}

// Guards on open slab edges, as explicit bands on the slab: glass on a low kerb.
//  - ff-court-guard: the court's open north (hall) and east (kitchen) sides and the
//    bedroom-2 landing.
//  - balcony-rail: the west balcony's three free edges.
const gt = 0.10;
export const GUARDS = [
  { id: 'ff-court-guard', level: 'first', court: true, h: PARAPET_H, kerb: 0.12, t: gt, bands: [
    { id: 'N', x0: COURT.x0, x1: COURT.x1 + gt, z0: COURT.z0 - gt, z1: COURT.z0 },
    { id: 'E', x0: COURT.x1, x1: COURT.x1 + gt, z0: COURT.z0, z1: COURT_LANDING.z0 + gt },
    { id: 'LN', x0: COURT_LANDING.x0, x1: COURT.x1, z0: COURT_LANDING.z0, z1: COURT_LANDING.z0 + gt },
    { id: 'LW', x0: COURT_LANDING.x0, x1: COURT_LANDING.x0 + gt, z0: COURT_LANDING.z0 + gt, z1: COURT.z1 },
  ] },
  { id: 'balcony-rail', level: 'first', h: BALCONY.rail, kerb: 0.08, t: 0.06, bands: [
    { id: 'W', x0: BALCONY.x0, x1: BALCONY.x0 + 0.06, z0: BALCONY.z0, z1: BALCONY.z1 },
    { id: 'N', x0: BALCONY.x0 + 0.06, x1: BALCONY.x1, z0: BALCONY.z0, z1: BALCONY.z0 + 0.06 },
    { id: 'S', x0: BALCONY.x0 + 0.06, x1: BALCONY.x1, z0: BALCONY.z1 - 0.06, z1: BALCONY.z1 },
  ] },
];

// ------------------------------------------------------------------ rooms ----
const R = (id, level, name, x0, x1, z0, z1, use, extra = {}) => ({ id, level, name, x0, x1, z0, z1, use, ...extra });
export const ROOMS = [
  // First floor, nine squares around the court:
  //   NW  common bath + utility lobby (+ terrace-stair pocket)   N  hall + stair   NE  living + pooja
  //   W   master bath + dressing                                 C  court          E   open kitchen
  //   SW  master bedroom                                         S  bedroom 2      SE  bedroom 3
  R('cbath', 'first', 'Common bath', fA, -4.10, fN, R2n, 'bath', { dir: 'NW' }),
  R('lobby', 'first', 'Utility lobby', -3.95, fBw, -3.53, R2n, 'lobby', { dir: 'NW' }),
  R('stair', 'first', 'Stair', STAIR_RUNS[1].foot[0], STAIR.openings.first.x1, STAIR.lane.z0, STAIR.lane.z1, 'stair'),
  R('foyer', 'first', 'Entrance foyer', 1.26, fCw, fN, -3.075, 'foyer', { dir: 'N' }),
  R('hall', 'first', 'Hall', fBe, GRID.x.C, -2.925, COURT.z0 - gt, 'hall', { dir: 'N' }),
  R('living', 'first', 'Living + pooja', fCe, fD, fN, GRID.z[2], 'living', { dir: 'NE' }),
  R('kitchen', 'first', 'Open kitchen', fCe, fD, GRID.z[2], R3n, 'kitchen', { dir: 'E' }),
  R('mdress', 'first', 'Dressing', -3.45, fBw, R2s, R3n, 'dressing', { private: true, suite: 'master', dir: 'W' }),
  R('mbath', 'first', 'Master bath', fA, -3.60, R2s, R3n, 'bath', { dir: 'W' }),
  R('master', 'first', 'Master bedroom', fA, fBw, R3s, fS, 'bedroom', { dir: 'SW' }),
  R('bed2', 'first', 'Bedroom 2', fBe, fCw, R3s, fS, 'bedroom', { dir: 'S' }),
  R('bed3', 'first', 'Bedroom 3', fCe, fD, R3s, fS, 'bedroom', { dir: 'SE' }),
  R('balcony', 'first', 'Balcony', BALCONY.x0, BALCONY.x1, BALCONY.z0, BALCONY.z1, 'balcony', { dir: 'W' }),
  R('court', 'first', 'Nadumuttam', COURT.x0, COURT.x1, COURT.z0, COURT.z1, 'void'),
  // ground floor (open stilt garden)
  R('g-stair', 'ground', 'Stair', STAIR_RUNS[0].f1.x0, STAIR_RUNS[0].x1, STAIR.lane.z0, STAIR.lane.z1, 'stair'),
  R('g-court', 'ground', 'Courtyard garden', COURT.x0, COURT.x1, COURT.z0, COURT.z1, 'garden'),
  R('g-car', 'ground', 'Car', -6.00, -0.70, 1.95, 4.45, 'parking', { vehicle: 'car' }),
  R('g-bikes', 'ground', 'Two-wheelers', -5.00, -3.00, -0.50, 1.00, 'parking', { vehicle: 'two-wheeler' }),
  // terrace
  R('t-mumty', 'terrace', 'Stair head', -2.785, 3.135, HOUSE.z0 + 2 * pIn, STAIR.lane.z1, 'stair'),
  R('t-wash', 'terrace', 'Wash + drying', 4.60, 6.40, 2.60, 4.40, 'utility'),
];

// ---------------------------------------------------------------- beams ----
// One beam per bay on every grid line, overlapping at the columns. Perimeter beams
// match the 300 mm exterior walls; interior beams are 230 mm. Every span ≤ 4.2 m.
// The stairwell cuts line B's north beam: it cantilevers from B2 to pick up the
// trimmer beam along the south edge of the stair lane (structural design must
// confirm). Edge beams frame the bedroom-2 landing and the balcony cantilever.
// y0 = soffit, y1 = top of slab.
const bx = GRID.x, bz = GRID.z, hb = BEAM.w / 2, he = WALL_T.exterior / 2;
const XL = ['A', 'B', 'C', 'D'], ZL = ['1', '2', '3', '4'];
export const BEAMS = [];
for (const lvl of ['first', 'terrace']) {
  const top = LEVELS[lvl];
  const add = (id, x0, x1, z0, z1, span) => BEAMS.push({ id: `${lvl}-${id}`, level: lvl, x0, x1, z0, z1, y0: top - BEAM.d, y1: top, d: BEAM.d, span });
  for (const zl of ZL) {
    const h = zl === '1' || zl === '4' ? he : hb, z = bz[zl];
    for (let i = 0; i < 3; i++) {
      const xa = bx[XL[i]], xb = bx[XL[i + 1]];
      add(`row${zl}-${XL[i]}${XL[i + 1]}`, i === 0 ? xa - he : xa, i === 2 ? xb + he : xb, z - h, z + h, xb - xa);
    }
  }
  for (const xl of XL) {
    const h = xl === 'A' || xl === 'D' ? he : hb, x = bx[xl];
    for (let j = 0; j < 3; j++) {
      const za = bz[ZL[j]], zb = bz[ZL[j + 1]];
      if (xl === 'B' && j === 0) { add('lineB-12', x - h, x + h, STAIR.trim.z0, zb, zb - STAIR.trim.z0); continue; }
      add(`line${xl}-${ZL[j]}${ZL[j + 1]}`, x - h, x + h, j === 0 ? za - he : za, j === 2 ? zb + he : zb, zb - za);
    }
  }
  add('stair-trim', bx.A, lvl === 'terrace' ? MUMTY.x1 : bx.C, STAIR.trim.z0, STAIR.trim.z1, Math.max(bx.B - bx.A, bx.C - bx.B));
  add('landing-N', COURT_LANDING.x0, bx.C, COURT_LANDING.z0, COURT_LANDING.z0 + BEAM.w, bx.C - COURT_LANDING.x0);
  add('landing-W', COURT_LANDING.x0, COURT_LANDING.x0 + BEAM.w, COURT_LANDING.z0, bz[3], bz[3] - COURT_LANDING.z0);
  for (const zl of ['2', '3', '4']) {
    const h = zl === '4' ? he : hb, z0 = Math.max(BALCONY.z0, bz[zl] - h);
    add(`balcony-${zl}`, BALCONY.x0, bx.A, z0, z0 + 2 * h, bx.A - BALCONY.x0);
  }
  add('balcony-edge', BALCONY.x0, BALCONY.x0 + BEAM.w, BALCONY.z0, BALCONY.z1, Math.max(bz[3] - bz[2], bz[4] - bz[3]));
  if (lvl === 'terrace') {
    add('mumty-W', -2.90 - hb, -2.90 + hb, bz[1], MUMTY.z1, MUMTY.z1 - bz[1]);
    add('mumty-E', 3.25 - hb, 3.25 + hb, bz[1], MUMTY.z1, MUMTY.z1 - bz[1]);
  }
}

// ------------------------------------------------------- terrace & roof ----
export const TERRACE = {
  fall: 0.06,                     // the finish rises 60 mm from the court guard to the parapets (≥ 1:100)
  // Light steel frame carrying PV over the west wing, tilted to face south.
  solar: { x0: -5.40, x1: -2.10, z0: -0.60, z1: 4.40, h: 2.40, tiltDeg: 11,
    posts: [[-5.40, -0.60], [-2.10, -0.60], [-5.40, 1.90], [-2.10, 1.90], [-5.40, 4.40], [-2.10, 4.40]] },
  tank: { x: 1.60, z: -4.15, r: 0.55, h: 1.30, litres: 1000 },
  planters: [
    { x0: 3.70, x1: 6.10, z0: -4.10, z1: -3.65, h: 0.45 },
    { x0: 5.65, x1: 6.10, z0: -2.60, z1: 1.20, h: 0.45 },
  ],
  washCanopy: { x0: 4.60, x1: 6.62, z0: 2.60, z1: 4.65, h: 2.30, posts: [[4.65, 2.65], [6.57, 2.65], [4.65, 4.60]] },
};
// Flat stone coping (with drip overhangs) on every wall top exposed to rain.
export const COPING = { tile: 0.24, gap: 0.012, h: 0.035, overhang: 0.03, on: ['parapet', 'guard', 'compound'] };

// ------------------------------------------------------------- drainage ----
// Rain concept:
//   1. The terrace falls to the open court; scuppers on the void edges drop rain
//      into the court rain garden (permeable).
//   2. An overflow weir on the garden's east edge feeds a stone channel to a silt
//      trap and a recharge pit in the north-east garden (the extended corner).
// The west balcony and the first floor roof the front strip, so no yard intercept
// at the gate is needed. Nothing discharges to the road. Points are [x, y, z];
// channels must fall and connect node to node.
const WEIR = [COURT.x1, -0.020, 0.20];
const N1 = [7.35, -0.070, 0.20];
const N2 = [7.35, -0.085, -1.60];
export const DRAINAGE = {
  courtBasin: { ...COURT, kerbTop: 0.10, floor: -0.10, weir: WEIR },
  siltTrap: { x: N2[0], z: N2[2], size: 0.45 },
  rechargePit: { x: 7.55, z: -3.00, r: 0.45, depth: 2.0, topY: -0.06 },
  channels: [
    { id: 'court-overflow', from: WEIR, to: N1, w: 0.22 },
    { id: 'to-silt-trap', from: N1, to: N2, w: 0.22 },
    { id: 'to-recharge', from: N2, to: [7.45, -0.100, -2.55], w: 0.22 },
  ],
  terminal: [7.45, -0.100, -2.55],
};
// Scuppers in the terrace court guard: [x, z, dx, dz], (dx, dz) = outflow direction
// into the void.
export const SCUPPERS = [
  [-0.60, COURT.z0, 0, 1], [1.40, COURT.z0, 0, 1],
  [COURT.x0, -0.30, 1, 0], [COURT.x0, 0.90, 1, 0],
  [-0.60, COURT.z1, 0, -1], [0.60, COURT.z1, 0, -1],
  [COURT.x1, -0.30, -1, 0],
  [COURT_LANDING.x0, 1.05, -1, 0],
  [1.95, COURT_LANDING.z0, 0, -1],
];

// -------------------------------------------------------------- airflow ----
// Conceptual stack and cross ventilation; an illustration, not CFD. Cool air
// enters LOW at the south-west (the master bedroom's low jaali and the shaded
// stilts), crosses the court and the open half of the house, and leaves HIGH
// through the open court, the stair stack (mumty jaali) and the leeward east vents.
const yF = LEVELS.first, yT = LEVELS.terrace;
const swEntry = [[-4.30, yF + 0.38, GRID.z[4]], [-4.20, yF + 0.70, 3.90], [-3.00, yF + 1.10, 2.60], [-2.25, yF + 1.40, GRID.z[3]], [-2.25, yF + 1.60, 0.20]];
export const AIRFLOW = {
  windFrom: 'SW',
  inlets: [
    { id: 'master-s-low', opening: 'master-s-win', at: [-4.30, yF + 0.38, GRID.z[4]] },
    { id: 'stilt-sw', at: [-6.60, 0.80, 2.60] },
  ],
  exhausts: [
    { id: 'court-sky', at: [-0.40, yT + 2.30, 0.15] },
    { id: 'mumty-n', opening: 'mumty-n-exhaust', at: [-0.10, yT + 2.00, HOUSE.z0 + pIn] },
    { id: 'kitchen-e-high', opening: 'kitchen-e-exhaust', at: [GRID.x.D, yF + 2.30, 0.95] },
    { id: 'pooja-e-high', opening: 'pooja-e-exhaust', at: [GRID.x.D, yF + 2.30, -3.90] },
  ],
  paths: [
    { id: 'sw-court', from: 'master-s-low', to: 'court-sky', pts: [...swEntry, [-0.60, yF + 2.20, 0.20], [-0.40, yT + 0.60, 0.15], [-0.40, yT + 2.30, 0.15]] },
    { id: 'stilt-court', from: 'stilt-sw', to: 'court-sky', pts: [[-6.60, 0.80, 2.60], [-5.00, 0.90, 1.00], [-2.50, 1.00, 0.50], [-0.60, 1.30, 0.20], [-0.40, 2.60, 0.15], [-0.40, yF + 1.80, 0.15], [-0.40, yT + 2.30, 0.15]] },
    { id: 'sw-kitchen', from: 'master-s-low', to: 'kitchen-e-high', pts: [...swEntry, [-0.60, yF + 2.00, 0.20], [0.80, yF + 1.90, 0.30], [2.60, yF + 1.90, 0.35], [4.80, yF + 2.10, 0.45], [GRID.x.D, yF + 2.30, 0.95], [6.95, yF + 2.40, 0.95]] },
    { id: 'sw-pooja', from: 'master-s-low', to: 'pooja-e-high', pts: [...swEntry, [-0.60, yF + 2.00, 0.20], [0.60, yF + 1.80, -1.60], [2.60, yF + 1.85, -2.40], [4.80, yF + 1.95, -3.40], [6.00, yF + 2.15, -3.85], [GRID.x.D, yF + 2.30, -3.90], [6.95, yF + 2.40, -3.90]] },
    { id: 'sw-stair', from: 'master-s-low', to: 'mumty-n', pts: [...swEntry, [-2.20, yF + 1.70, -2.00], [-1.00, yF + 2.00, -3.20], [-0.60, yF + 2.30, -3.90], [-0.40, yT + 0.80, -4.10], [-0.10, yT + 2.00, HOUSE.z0 + pIn], [-0.10, yT + 2.10, -5.00]] },
  ],
};

// ------------------------------------------------------------ furniture ----
// Boxes used by the 3D builder (detailed by type), the plans and collision.
// `face` = the direction a seat faces; `head` = the bed-head wall; `back` = the
// side against a wall. Counter `sink`/`stove` = world-coordinate ranges along it.
const F = (id, level, type, x0, x1, z0, z1, h, extra = {}) => ({ id, level, type, x0, x1, z0, z1, h, ...extra });
export const FURNITURE = [
  // living + pooja (NE). The pooja is a closed oak cabinet with jaali doors; the idols face west.
  F('tv-unit', 'first', 'tvunit', 3.85, 5.25, fN, -4.18, 0.45, { back: 'N' }),
  F('coffee-table', 'first', 'coffeetable', 4.00, 5.10, -3.35, -2.85, 0.38),
  F('sofa', 'first', 'sofa', 3.55, 5.55, -2.55, -1.70, 0.80, { back: 'S', face: 'N' }),
  F('pooja-unit', 'first', 'poojaunit', 5.95, fD, -4.50, -3.30, 1.95, { face: 'W', back: 'E' }),
  // hall: an oonjal facing the court
  F('oonjal', 'first', 'swing', -0.40, 1.10, -2.55, -2.05, 0.45, { hang: true, passable: true, face: 'S' }),
  // open kitchen: a U open to the court walkway. North leg = breakfast counter with
  // stools (no separate dining table), east leg = stove under the exhaust, south leg =
  // sink, with the fridge at its mouth.
  F('kit-bar', 'first', 'bar', 3.70, 5.95, -0.75, -0.15, 0.90, { back: 'S', seat: 'N', stools: 3 }),
  F('fridge', 'first', 'fridge', 3.70, 4.40, 0.835, R3n, 1.80, { back: 'S' }),
  F('kit-counter-s', 'first', 'counter', 4.40, 5.95, 0.935, R3n, 0.85, { sink: [4.75, 5.45], back: 'S' }),
  F('kit-counter-e', 'first', 'counter', 5.95, fD, -0.75, R3n, 0.85, { stove: [0.40, 1.20], back: 'E' }),
  // entrance foyer
  F('shoe-bench', 'first', 'shoebench', 1.95, fCw, fN, -4.15, 0.45, { back: 'E' }),
  // utility lobby: a shared wash basin outside the baths
  F('lobby-basin', 'first', 'basin', -3.95, -3.40, -2.25, -1.55, 0.85, { back: 'W' }),
  // master suite: dressing with wardrobes either side of the bath door, then the bedroom
  F('md-wardrobe-n', 'first', 'wardrobe', -3.45, -2.85, R2s, -0.15, 2.10, { back: 'W' }),
  F('md-wardrobe-s', 'first', 'wardrobe', -3.45, -2.85, 0.75, R3n, 2.10, { back: 'W' }),
  F('master-bed', 'first', 'bed', -3.70, fBw, 2.55, 4.05, 0.50, { head: 'E' }),
  F('master-side', 'first', 'sidetable', -2.10, fBw, 4.10, 4.50, 0.55),
  // bedroom 2 (S)
  F('bed2-bed', 'first', 'bed', fBe, 0.565, 2.60, 4.10, 0.50, { head: 'W' }),
  F('bed2-side', 'first', 'sidetable', fBe, -1.035, 4.15, 4.55, 0.55),
  F('bed2-wardrobe', 'first', 'wardrobe', 1.935, fCw, 2.60, fS, 2.10, { back: 'E' }),
  // bedroom 3 (SE)
  F('bed3-bed', 'first', 'bed', 4.55, fD, 3.40, 4.40, 0.45, { head: 'E', single: true }),
  F('bed3-side', 'first', 'sidetable', 6.15, fD, 2.95, 3.35, 0.55),
  F('bed3-desk', 'first', 'desk', 4.60, 5.90, R3s, 2.30, 0.75, { face: 'N' }),
  F('bed3-wardrobe', 'first', 'wardrobe', fCe, 3.365, 2.70, fS, 2.10, { back: 'W' }),
  // baths
  F('mb-shower', 'first', 'shower', fA, -4.50, R2s, -0.135, 0.04, { passable: true }),
  F('mb-wc', 'first', 'wc', fA, -4.95, 0.35, 1.00, 0.42, { back: 'W' }),
  F('mb-basin', 'first', 'basin', -4.40, -3.85, 1.05, R3n, 0.85, { back: 'S' }),
  F('cb-shower', 'first', 'shower', fA, -4.10, fN, -3.60, 0.04, { passable: true }),
  F('cb-basin', 'first', 'basin', fA, -5.05, -3.45, -2.95, 0.85, { back: 'W' }),
  F('cb-wc', 'first', 'wc', fA, -4.95, -2.20, -1.55, 0.42, { back: 'W' }),
  // west balcony: an oonjal looking out over the front garden
  F('bal-swing', 'first', 'swing', -6.55, -6.05, -0.55, 0.65, 0.45, { hang: true, passable: true, face: 'W' }),
  // ground
  F('thinnai', 'ground', 'thinnai', -3.85, -2.35, -3.55, -3.15, 0.45, { back: 'N' }),
  F('water-point', 'ground', 'waterpot', -6.70, -6.20, -3.35, -2.85, 0.95),
  F('car', 'ground', 'car', -5.40, -0.90, 2.25, 4.15, 1.50),
  F('scooter', 'ground', 'scooter', -4.80, -3.10, 0.30, 0.90, 1.10),
  F('cycle', 'ground', 'cycle', -4.80, -3.10, -0.30, -0.05, 0.95),
  F('tulsi', 'ground', 'tulsi', 0.50, 1.00, 0.90, 1.40, 0.85),
  F('uruli', 'ground', 'uruli', 0.40, 1.10, -0.70, 0.00, 0.25),
  F('store-understair', 'ground', 'store', -0.50, STAIR_RUNS[0].x1, fN, STAIR.lane.z1, 1.20),
  // terrace
  F('wash-counter', 'terrace', 'counter', 5.95, 6.55, 2.80, 4.40, 0.85, { sink: [3.40, 4.00], back: 'E' }),
  F('washer', 'terrace', 'washer', 5.10, 5.70, 3.95, 4.55, 0.85),
  F('t-chair-1', 'terrace', 'chair', -0.60, 0.00, 2.40, 3.00, 0.85, { face: 'N' }),
  F('t-chair-2', 'terrace', 'chair', 0.60, 1.20, 2.40, 3.00, 0.85, { face: 'N' }),
];
export const COURT_TREE = { x: -0.40, z: 0.55, h: 4.6, canopy: 0.85 };
export const PALM = null;

// --------------------------------------------------- viewpoints (jumps) ----
// pos/look are [x, y, z]. For walk viewpoints, y = floor level + eye height.
export const VIEWPOINTS = [
  { id: 'overview', label: 'Overview', mode: 'orbit', pos: [-17.5, 13.5, 15.5], look: [0.6, 3.2, 0] },
  { id: 'gate', label: 'Front gate (road)', mode: 'walk', pos: [-9.0, EYE - ROAD.drop, -3.95], look: [-4.0, 1.5, -3.95] },
  { id: 'entrance', label: 'Stair foot + thinnai', mode: 'walk', pos: [-5.40, EYE, -4.13], look: [-2.0, 1.5, -4.13] },
  { id: 'court-garden', label: 'Courtyard garden', mode: 'walk', pos: [3.60, EYE, 0.70], look: [-0.6, 3.4, 0.2] },
  { id: 'arrival', label: 'First-floor foyer', mode: 'walk', pos: [1.75, yF + EYE, -4.10], look: [1.8, yF + 1.2, -1.5] },
  { id: 'hall', label: 'Hall + nadumuttam', mode: 'walk', pos: [0.20, yF + EYE, -2.85], look: [0.4, yF + 0.6, 0.4] },
  { id: 'living', label: 'Living + pooja (NE)', mode: 'walk', pos: [3.20, yF + EYE, -1.35], look: [6.2, yF + 0.9, -3.9] },
  { id: 'kitchen', label: 'Open kitchen (U)', mode: 'walk', pos: [3.15, yF + EYE, 0.25], look: [6.2, yF + 0.9, 0.4] },
  { id: 'master', label: 'Master suite (SW)', mode: 'walk', pos: [-2.30, yF + EYE, 2.20], look: [-5.6, yF + 1.0, 3.4] },
  { id: 'bed2', label: 'Bedroom 2 (S)', mode: 'walk', pos: [1.40, yF + EYE, 2.30], look: [-1.0, yF + 0.8, 3.4] },
  { id: 'bed3', label: 'Bedroom 3 (SE)', mode: 'walk', pos: [3.30, yF + EYE, 2.30], look: [5.8, yF + 0.8, 3.6] },
  { id: 'bath', label: 'Utility lobby + bath', mode: 'walk', pos: [-2.80, yF + EYE, -2.80], look: [-4.6, yF + 1.1, -2.8], open: ['cbath-door'] },
  { id: 'balcony', label: 'West balcony', mode: 'walk', pos: [-6.40, yF + EYE, 3.00], look: [-6.4, yF + 1.0, -1.0] },
  { id: 'terrace', label: 'Terrace garden', mode: 'walk', pos: [0.50, yT + EYE, -2.60], look: [-1.0, yT + 0.5, 0.8] },
];

// -------------------------------------------------------------- gates ----
// Two openings in the straight west (road) wall:
//  - the car gate: a slatted timber leaf sliding north behind the compound wall;
//  - the front (pedestrian) gate: a single timber leaf swinging inward against the
//    north side of the entrance path, which leads straight to the stair foot.
export const GATES = [
  { id: 'gate', label: 'Car gate', type: 'sliding', z0: 1.75, z1: 4.45, leafH: 1.50, pierW: 0.30, pierH: 1.80, t: 0.06, track: 0.10 },
  { id: 'gate-ped', label: 'Front gate', type: 'swing', z0: -4.45, z1: -3.45, hinge: 'N', leafH: 1.50, pierW: 0.30, pierH: 1.80, t: 0.05 },
];
export const GATE = GATES[0];

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
// First-floor walkable envelope: the house plus the west balcony.
export const inFirstFloor = (x, z) => [HOUSE, BALCONY].some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
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
// A guard occupies explicit bands of slab next to the open edges it protects.
export function guardBands(g) {
  return g.bands.map((b) => ({ ...b, id: `${g.id}-${b.id}` }));
}
// Gate leaves.
//  sliding: { sliding, closed: [p0, p1], open: [q0, q1], dir, w } — the leaf runs on a
//           track just inside the compound wall and parks north of the opening.
//  swing:   { swing, hinge, closedDir, openDir, w } — hinged at the inner wall face.
export function gateLeaves(g = GATE) {
  if (g.type === 'swing') {
    const zH = g.hinge === 'S' ? g.z1 : g.z0, zF = g.hinge === 'S' ? g.z0 : g.z1;
    const x = boundaryX('W', zH) + COMPOUND.t;
    return [{ id: `${g.id}-leaf`, swing: true, hinge: [x, zH], closedDir: [0, Math.sign(zF - zH)], openDir: [1, 0], w: Math.abs(zF - zH) }];
  }
  const at = (z) => [boundaryX('W', z) + COMPOUND.t + g.track, z];
  const p0 = at(g.z0), p1 = at(g.z1);
  const w = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const u = [(p1[0] - p0[0]) / w, (p1[1] - p0[1]) / w];
  const shift = w + 0.10;
  const q0 = [p0[0] - u[0] * shift, p0[1] - u[1] * shift];
  return [{ id: g.id === 'gate' ? 'gate-leaf' : `${g.id}-leaf`, sliding: true, closed: [p0, p1], open: [q0, [q0[0] + u[0] * w, q0[1] + u[1] * w]], dir: u, w }];
}
// Slab openings per floor level (rectangles open to below).
const laneRect = (o) => ({ id: 'stair', x0: o.x0, x1: o.x1, z0: STAIR.lane.z0, z1: STAIR.lane.z1 });
export const SLAB_OPENINGS = {
  first: [...COURT_VOID, laneRect(STAIR.openings.first)],
  terrace: [...COURT_VOID, laneRect(STAIR.openings.terrace)],
};
