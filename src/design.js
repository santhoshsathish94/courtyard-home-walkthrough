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
// Stacked use: car parking (stilts) · home · terrace garden. The stilt storey is
// 2.85 m floor to floor (2.40 m clear under the beams, enough for cars), so the
// main stair is one short straight flight; the home keeps a 3.05 m clear height.
export const LEVELS = { ground: 0.0, first: 2.85, terrace: 6.05, mumtyRoof: 8.65 };
export const SLAB = 0.15;                 // RCC slab thickness
export const BEAM = { w: 0.23, d: 0.45 }; // beam width / overall depth (incl. slab)
export const DEEP_BEAM = BEAM.d;          // no deep beams: every span ≤ 4.6 m
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
// First-floor slab (outer edges). North, south and east edges sit on the
// compound-wall line. On the west, the north-west bay steps out to the road line
// (more room for bedroom 3); south of it a cantilevered strip carries the open
// west stair to the terrace behind a full-height jaali. The rooms stop 5 ft short
// of the south edge: the row-4 columns stand free at the edge of a covered south
// balcony (4 ft clear past each column). All 16 columns keep their grid positions.
export const HOUSE = { x0: -5.95, x1: 7.00, z0: -4.88, z1: 4.88 };
export const WALL_T = { exterior: 0.30, grid: 0.23, partition: 0.15, parapet: 0.23 };
export const WEST_BAY = { x0: -6.98, x1: HOUSE.x0, z0: HOUSE.z0, z1: -1.00 };
export const WEST_STRIP = { x0: -6.98, x1: HOUSE.x0, z0: WEST_BAY.z1, z1: HOUSE.z1 };
export const SOUTH_WALL = { z0: 3.13, z1: 3.36 };   // inner / outer face of the rooms' south wall
export const BALCONY = { x0: WEST_STRIP.x0, x1: HOUSE.x1, z0: SOUTH_WALL.z1, z1: HOUSE.z1, rail: 1.05 };

// --------------------------------------------- 16-column structural grid ----
// Four column lines (A–D, west → east: bays 4.60 / 3.45 / 4.60 m) × four rows
// (1–4, north → south) make a nine-square plan. The four centre columns (B2, C2,
// B3, C3) frame the open court.
export const GRID = {
  x: { A: -5.80, B: -1.20, C: 2.25, D: 6.85 },
  z: { 1: -4.73, 2: -1.15, 3: 1.65, 4: 4.73 },
  column: 0.30,
};
export const COLUMNS = [];
// Columns hide inside the walls (230 × 450 mm in 9-inch walls, 300 mm in the
// 300 mm walls), the usual Indian RCC practice. C2 and C3 stand free at the
// court's open corners as round, fair-faced concrete columns; row 4 stands free
// along the south balcony's edge as square ones.
const colSize = (xl, zl) => {
  const extX = xl === 'A' || xl === 'D', extZ = zl === '1' || zl === '4';
  if (extX && extZ) return [0.30, 0.30];
  if (extZ) return [0.45, 0.30];
  if (extX) return [0.30, 0.45];
  return [0.23, 0.45];
};
// A1 sits in the north wall (the bay extends west of it); A2 sits in the 300 mm
// wall between the bay and the balcony. C2/C3 move 40 mm outward so their round
// sections clear the court's glass-guard corners.
const COL_SIZE = { A1: [0.45, 0.30], A2: [0.30, 0.30] };
const COL_SHIFT = { C2: [0.04, -0.04], C3: [0.04, 0.04] };
const ROUND = new Set(['C2', 'C3']);
for (const [xl, x] of Object.entries(GRID.x)) {
  for (const [zl, z] of Object.entries(GRID.z)) {
    const id = `${xl}${zl}`, [dx, dz] = COL_SHIFT[id] || [0, 0];
    if (ROUND.has(id)) { COLUMNS.push({ id, x: x + dx, z: z + dz, w: 0.30, d: 0.30, round: true, expressed: true }); continue; }
    const [w, d] = COL_SIZE[id] || colSize(xl, zl);
    COLUMNS.push({ id, x: x + dx, z: z + dz, w, d, ...(zl === '4' ? { expressed: true } : {}) });
  }
}
// Inner wall faces used throughout (derived from the grid and wall thicknesses).
export const FACE = {
  A: GRID.x.A + WALL_T.exterior / 2,   // −5.65
  Bw: GRID.x.B - WALL_T.grid / 2,      // −1.315
  Be: GRID.x.B + WALL_T.grid / 2,      // −1.085
  Cw: GRID.x.C - WALL_T.grid / 2,      //  2.135
  Ce: GRID.x.C + WALL_T.grid / 2,      //  2.365
  D: GRID.x.D - WALL_T.exterior / 2,   //  6.70
  N: GRID.z[1] + WALL_T.exterior / 2,  // −4.58
  S: GRID.z[4] - WALL_T.exterior / 2,  //  4.58
  R2n: GRID.z[2] - WALL_T.grid / 2,    // −1.265
  R2s: GRID.z[2] + WALL_T.grid / 2,    // −1.035
  R3n: GRID.z[3] - WALL_T.grid / 2,    //  1.535
  R3s: GRID.z[3] + WALL_T.grid / 2,    //  1.765
  SB: SOUTH_WALL.z0,                   //  3.13: the rooms' south face (balcony beyond)
};
const { A: fA, Bw: fBw, Be: fBe, Cw: fCw, Ce: fCe, D: fD, N: fN, R2n, R2s, R3n, R3s, SB } = FACE;
const xBay = WEST_BAY.x0 + WALL_T.exterior;   // −6.68: inner face of the bay's west wall

// ------------------------------------------------- nadumuttam (open court) ----
// The centre square, open from the ground garden to the sky. Its north, east and
// south sides open (behind a glass guard) to the north walkway, the family space
// and the south walkway; its west side is the master bedroom wall with a high jaali.
export const COURT = { x0: fBe, x1: fCw, z0: R2s, z1: R3n };            // 3.22 × 2.57 m
export const COURT_LANDING = null;
export const COURT_VOID = [{ id: 'court', ...COURT }];

// --------------------------------------------------------------- stairs ----
//  - main:  stilts → first floor along the north wall, from inside the front gate.
//           15 × 190 mm risers on 250 mm treads in flights of 5 + 10 with a 1.22 m
//           mid landing, 4 ft wide. The common bath sits three steps up over the
//           first flight and the mid landing; the open stairwell over the second
//           flight arrives at the outdoor landing in front of the west-facing main
//           door on column line C.
//  - west:  first floor → terrace, open to the sky in the strip west of column
//           line A: 17 × 188 mm risers in flights of 9 + 8 with a 1.0 m mid landing,
//           rising north from the south balcony's west end to the north-west bay
//           roof. The strip is 1.03 m wide (the column line stays where it is), so
//           this stair is 0.98 m clear inside its jaali.
// Each run has an axis (x or z), a lane (its cross-axis extent) and a direction
// along the axis. foot, landing, opening and the flight fields (xs, xe, x0, x1)
// are along-axis coordinates; run.rect / run.pt / run.loc convert to plan (x, z).
export const STAIR = {
  width: 1.22,
  waist: 0.15,
  lane: { z0: fN, z1: fN + 1.22 },               // main stair lane: −4.58 … −3.36
  runs: [
    { id: 'main', from: 'ground', to: 'first', axis: 'x', lane: [fN, fN + 1.22], dir: 1, start: -4.00, risers: 15, tread: 0.25, flights: [5, 10], midLanding: 1.22, foot: [-6.78, -4.00], landing: [0.47, fCw], opening: [-1.78, 0.47] },
    { id: 'west', from: 'first', to: 'terrace', axis: 'z', lane: [-6.93, HOUSE.x0], dir: -1, start: 3.75, risers: 17, tread: 0.25, flights: [9, 8], midLanding: 1.00, foot: [3.75, 4.78], landing: [-2.00, WEST_BAY.z1] },
  ],
  trim: { z0: fN + 1.22, z1: fN + 1.22 + BEAM.w }, // trimmer beam south of the main lane
};
// Derived geometry of run i. Each flight runs from xs (its first riser) to xe (its
// last riser) in the run direction; mids are the intermediate landings.
export function stairRun(i) {
  const s = STAIR, r = s.runs[i], q = (v) => Math.round(v * 1e6) / 1e6;
  const y0 = LEVELS[r.from], y1 = LEVELS[r.to], riser = (y1 - y0) / r.risers;
  const axis = r.axis || 'x', lane = r.lane || [s.lane.z0, s.lane.z1];
  const flights = [], mids = [];
  let x = r.start, y = y0;
  r.flights.forEach((n, k) => {
    const xe = q(x + r.dir * (n - 1) * r.tread);
    flights.push({ n, xs: x, xe, x0: Math.min(x, xe), x1: Math.max(x, xe), ys: y, ye: q(y + n * riser) });
    y = q(y + n * riser); x = xe;
    if (k < r.flights.length - 1) { const xm = q(x + r.dir * r.midLanding); mids.push({ x0: Math.min(x, xm), x1: Math.max(x, xm), y }); x = xm; }
  });
  const pt = (a, c) => (axis === 'x' ? [a, c] : [c, a]);
  const loc = (px, pz) => (axis === 'x' ? [px, pz] : [pz, px]);
  const rect = (a0, a1) => {
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    return axis === 'x' ? { x0: lo, x1: hi, z0: lane[0], z1: lane[1] } : { x0: lane[0], x1: lane[1], z0: lo, z1: hi };
  };
  return { ...r, axis, lane, width: lane[1] - lane[0], y0, y1, riser, flights, mids, top: x, lo: Math.min(r.start, x), hi: Math.max(r.start, x), pt, loc, rect };
}
export const STAIR_RUNS = STAIR.runs.map((_, i) => stairRun(i));
// Height of the walking line at plan position (x, z) for the run starting at y0.
// Returns null when (x, z) is not on that run's flights or landings.
export function stairWalkY(x, z, y0) {
  const run = STAIR_RUNS.find((r) => Math.abs(r.y0 - y0) < 1e-6);
  if (!run) return null;
  const [a, c] = run.loc(x, z);
  if (c < run.lane[0] || c > run.lane[1]) return null;
  for (const f of run.flights) if (a >= f.x0 && a <= f.x1) return f.ys + ((f.ye - f.ys) * (a - f.xs) * run.dir) / Math.max(1e-9, f.x1 - f.x0);
  for (const m of run.mids) if (a > m.x0 && a < m.x1) return m.y;
  return null;
}
// Treads for the run starting at y0: n − 1 per flight (the last riser of a flight
// lands on the mid landing or the floor). a0/a1 = along-axis extent; x0…z1 = plan rect.
export function stairTreads(y0) {
  const run = STAIR_RUNS.find((q) => Math.abs(q.y0 - y0) < 1e-6), out = [];
  if (!run) return out;
  run.flights.forEach((f, fi) => {
    for (let k = 1; k < f.n; k++) {
      const a = f.xs + run.dir * (k - 1) * run.tread, b = f.xs + run.dir * k * run.tread;
      out.push({ flight: fi + 1, k, a0: Math.min(a, b), a1: Math.max(a, b), ...run.rect(a, b), top: f.ys + k * run.riser });
    }
  });
  return out;
}
const MAIN = STAIR_RUNS[0], WSTAIR = STAIR_RUNS[1];
const laneZ0 = STAIR.lane.z0, laneZ1 = STAIR.lane.z1;
// Raised floor: the common bath stands three steps (0.45 m) up, over the main stair's
// first flight and mid landing, which keep 2.2 m headroom below its slab.
const RB = 0.45;
export const RAISED = [{ id: 'cbath-floor', x0: -4.03, x1: MAIN.opening[0], z0: fN, z1: -3.05, y: LEVELS.first + RB }];
// Steps up to it from the short access: n risers of `rise`, the first at z1, rising north.
export const STEPS = [{ id: 'cbath-steps', x0: -3.50, x1: -2.08, z0: -3.05, z1: -2.55, n: 3, rise: RB / 3 }];
export function stepTreads(st) {
  const T = (st.z1 - st.z0) / (st.n - 1);
  return Array.from({ length: st.n - 1 }, (_, k) => ({ x0: st.x0, x1: st.x1, z0: st.z1 - (k + 1) * T, z1: st.z1 - k * T, top: LEVELS.first + (k + 1) * st.rise }));
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
//   court: true for openings that look into the open court (they carry a grille).
// Heights are relative to the wall's own floor level.
const Wl = (id, level, a, b, t, kind, openings = [], extra = {}) => ({ id, level, a, b, t, kind, openings, ...extra });
const H1 = LEVELS.terrace - LEVELS.first - SLAB;     // 3.05 m first-floor clear height
const pIn = WALL_T.parapet / 2;
// No stair head (mumty): the main stair stops at the first floor and the west stair
// is open to the sky.
export const MUMTY = null;
const doorW = 1.22;                                   // owner's brief: no door under 4 ft
const swz = (SOUTH_WALL.z0 + SOUTH_WALL.z1) / 2;      // 3.245: the rooms' south wall line

export const WALLS = [
  // ---------------- first floor: exterior walls ----------------
  Wl('ff-N', 'first', [WEST_BAY.x0, GRID.z[1]], [HOUSE.x1, GRID.z[1]], WALL_T.exterior, 'exterior', [
    { id: 'bed3-n-win', type: 'window', s: 1.58, w: 1.00, sill: 1.60, head: 2.30 },
    { id: 'cbath-n-win', type: 'window', s: 3.48, w: 1.00, sill: 1.95, head: 2.55 },
    { id: 'stair-n-jaali', type: 'jaali', s: 6.10, w: 1.25, sill: 0.30, head: 2.75 },
    { id: 'porch-n-jaali', type: 'jaali', s: 7.65, w: 1.20, sill: 0.30, head: 2.75 },
    { id: 'hall-n-win', type: 'window', s: 10.85, w: 1.50, sill: 0.90, head: 2.40 },
  ]),
  Wl('ff-E', 'first', [GRID.x.D, fN], [GRID.x.D, SB], WALL_T.exterior, 'exterior', [
    { id: 'ne-e-win', type: 'window', s: 0.13, w: 0.90, sill: 0.90, head: 2.40 },
    { id: 'pooja-e-exhaust', type: 'jaali', s: 1.93, w: 0.80, sill: 2.00, head: 2.60, role: 'exhaust', hood: true },
    { id: 'living-e-win', type: 'window', s: 3.88, w: 1.40, sill: 0.95, head: 2.40 },
    { id: 'kitchen-e-exhaust', type: 'jaali', s: 6.55, w: 0.70, sill: 2.00, head: 2.60, role: 'exhaust', hood: true },
  ]),
  // The rooms' south wall, 5 ft in from the slab edge, opens onto the covered balcony.
  Wl('ff-S', 'first', [HOUSE.x0, swz], [HOUSE.x1, swz], WALL_T.grid, 'exterior', [
    { id: 'mbath-s-win', type: 'window', s: 1.75, w: 0.80, sill: 1.60, head: 2.30 },
    { id: 'lib-bal-slider', type: 'slider', s: 5.03, w: 1.60, sill: 0, head: 2.40 },
    { id: 'kit-bal-slider', type: 'slider', s: 8.40, w: 1.22, sill: 0, head: 2.40 },
    { id: 'kitchen-s-win', type: 'window', s: 10.40, w: 1.40, sill: 1.05, head: 2.10 },
  ]),
  // West wall: the west stair and its jaali shade it, so its window is flush (no hood
  // or frame projecting into the stair). Its low jaali is the cross-ventilation inlet.
  Wl('ff-W', 'first', [GRID.x.A, GRID.z[2]], [GRID.x.A, SOUTH_WALL.z1], WALL_T.exterior, 'exterior', [
    { id: 'master-w-win', type: 'window', s: 0.75, w: 1.00, sill: 0.75, head: 2.10, lowJaali: [0.15, 0.60], role: 'inlet', hood: true, flush: true },
  ]),
  // North-west bay: steps out to the road line, so bedroom 3 gets the extra width.
  Wl('ff-bay-W', 'first', [WEST_BAY.x0 + WALL_T.exterior / 2, GRID.z[1]], [WEST_BAY.x0 + WALL_T.exterior / 2, GRID.z[2]], WALL_T.exterior, 'exterior', [
    { id: 'bed3-w-win', type: 'window', s: 1.13, w: 1.20, sill: 0.75, head: 2.25 },
  ]),
  Wl('ff-bay-S', 'first', [WEST_BAY.x0, GRID.z[2]], [GRID.x.A, GRID.z[2]], WALL_T.exterior, 'exterior'),
  // ---------------- first floor: walls on grid lines (0.23 m) ----------------
  // Row 2, west bay: between bedroom 3 / the short access and the master bedroom.
  Wl('ff-2w', 'first', [GRID.x.A, GRID.z[2]], [GRID.x.B, GRID.z[2]], WALL_T.grid, 'grid'),
  // Line B, centre bay: the master bedroom's east wall = the court's west side.
  Wl('ff-B-c', 'first', [GRID.x.B, GRID.z[2]], [GRID.x.B, GRID.z[3]], WALL_T.grid, 'grid', [
    { id: 'master-court-jaali', type: 'jaali', s: 0.60, w: 1.20, sill: 1.80, head: 2.60, court: true },
  ]),
  // Row 3, west bay: the master bedroom opens into its ensuite and, through an arch,
  // into the dressing.
  Wl('ff-3w', 'first', [GRID.x.A, GRID.z[3]], [GRID.x.B, GRID.z[3]], WALL_T.grid, 'grid', [
    { id: 'mbath-door', type: 'door', s: 0.40, w: doorW, head: 2.10, swing: 'N', leaves: 2, room: 'mbath', defaultOpen: false },
    { id: 'master-arch', type: 'arch', s: 3.10, w: doorW, head: 2.20 },
  ]),
  // Line B, south strip: the master suite's door, at the west end of the south walkway.
  Wl('ff-B-s', 'first', [GRID.x.B, GRID.z[3]], [GRID.x.B, swz], WALL_T.grid, 'grid', [
    { id: 'master-door', type: 'door', s: 0.24, w: doorW, head: 2.10, swing: 'W', hinge: 'S', room: 'dress' },
  ]),
  // Line C, north bay: the 5 ft main door faces west onto the landing at the top of the
  // main stair and opens outward; inside is the living / hall with the pooja ahead.
  Wl('ff-C-n', 'first', [GRID.x.C, fN], [GRID.x.C, -2.825], WALL_T.grid, 'grid', [
    { id: 'main-door', type: 'door', s: 0.06, w: 1.52, head: 2.20, swing: 'W', leaves: 2, main: true, room: 'hall' },
  ]),
  // ---------------- first floor: partitions ----------------
  Wl('ff-bed3-e', 'first', [-4.105, fN], [-4.105, R2n], WALL_T.partition, 'partition', [
    { id: 'bed3-door', type: 'door', s: 1.95, w: doorW, head: 2.10, swing: 'W', hinge: 'S', room: 'bed3' },
  ]),
  // The common bath's walls stand on its raised floor.
  Wl('ff-cbath-e', 'first', [-1.855, fN], [-1.855, -3.05], WALL_T.partition, 'partition', [], { base: RB, h: H1 - RB }),
  Wl('ff-cbath-s', 'first', [-4.03, -3.125], [MAIN.opening[0], -3.125], WALL_T.partition, 'partition', [
    { id: 'cbath-door', type: 'door', s: 0.63, w: doorW, head: 2.10, swing: 'S', leaves: 2, room: 'cbath', defaultOpen: false },
  ], { base: RB, h: H1 - RB }),
  Wl('ff-p-ens', 'first', [-2.975, R3s], [-2.975, SB], WALL_T.partition, 'partition'),
  // The main stairwell and its landing are outside the main door: full-height oak fins
  // close them off from the walkway while letting light and air through.
  Wl('ff-stair-screen', 'first', [MAIN.opening[0], -3.31], [MAIN.top, -3.31], 0.10, 'screen'),
  Wl('ff-porch-w', 'first', [MAIN.top + 0.05, -3.26], [MAIN.top + 0.05, -2.975], 0.10, 'screen'),
  Wl('ff-porch-s', 'first', [MAIN.top, -2.90], [fCw, -2.90], WALL_T.partition, 'partition'),

  // ---------------- ground: a board-formed concrete wall with terracotta jaali screens
  // the entry walk and the stair from the neighbour while letting air through ----------------
  Wl('gf-N', 'ground', [WEST_BAY.x0 + WALL_T.exterior / 2, GRID.z[1]], [GRID.x.C, GRID.z[1]], WALL_T.exterior, 'exterior', [
    { id: 'stair-gf-jaali-1', type: 'jaali', s: 1.38, w: 3.90, sill: 0.45, head: 2.30 },
    { id: 'stair-gf-jaali-2', type: 'jaali', s: 5.98, w: 2.75, sill: 0.45, head: 2.30 },
  ]),

  // ---------------- terrace: parapets and court guard. The west stair arrives on the
  // north-west bay roof through the gap in its south edge ----------------
  Wl('tr-N', 'terrace', [WEST_BAY.x0, HOUSE.z0 + pIn], [HOUSE.x1, HOUSE.z0 + pIn], WALL_T.parapet, 'parapet'),
  Wl('tr-W-bay', 'terrace', [WEST_BAY.x0 + pIn, HOUSE.z0 + 2 * pIn], [WEST_BAY.x0 + pIn, WEST_BAY.z1], WALL_T.parapet, 'parapet'),
  Wl('tr-W', 'terrace', [HOUSE.x0 + pIn, WEST_BAY.z1], [HOUSE.x0 + pIn, HOUSE.z1 - 2 * pIn], WALL_T.parapet, 'parapet'),
  Wl('tr-S', 'terrace', [HOUSE.x0, HOUSE.z1 - pIn], [4.40, HOUSE.z1 - pIn], WALL_T.parapet, 'parapet'),
  // At the wash area the washer and counter stand against the parapet, so the guard
  // rises to 1.8 m with a jaali above the 1.0 m solid parapet (child safety).
  Wl('tr-S-wash', 'terrace', [4.40, HOUSE.z1 - pIn], [HOUSE.x1, HOUSE.z1 - pIn], WALL_T.parapet, 'parapet', [], { h: 1.80, jaaliAbove: PARAPET_H }),
  Wl('tr-E', 'terrace', [HOUSE.x1 - pIn, HOUSE.z0 + 2 * pIn], [HOUSE.x1 - pIn, 2.00], WALL_T.parapet, 'parapet'),
  Wl('tr-E-wash', 'terrace', [HOUSE.x1 - pIn, 2.00], [HOUSE.x1 - pIn, HOUSE.z1 - 2 * pIn], WALL_T.parapet, 'parapet', [], { h: 1.80, jaaliAbove: PARAPET_H }),
  // Court guard walls on all four sides of the open court.
  Wl('tr-court-N', 'terrace', [fBw, GRID.z[2]], [fCe, GRID.z[2]], WALL_T.parapet, 'guard'),
  Wl('tr-court-W', 'terrace', [GRID.x.B, R2s], [GRID.x.B, R3n], WALL_T.parapet, 'guard'),
  Wl('tr-court-S', 'terrace', [fBw, GRID.z[3]], [fCe, GRID.z[3]], WALL_T.parapet, 'guard'),
  Wl('tr-court-E', 'terrace', [GRID.x.C, R2s], [GRID.x.C, R3n], WALL_T.parapet, 'guard'),];
for (const w of WALLS) {
  if (w.h === undefined) w.h = w.level === 'first' ? H1 : w.level === 'ground' ? LEVELS.first - BEAM.d : PARAPET_H;
  for (const o of w.openings) {
    if (o.sill === undefined) o.sill = 0;
    if (o.type === 'door' && o.defaultOpen === undefined) o.defaultOpen = true;
  }
}

// Guards on open slab edges, as explicit bands on the slab: glass on a low kerb.
//  - ff-court-guard: the court's open north (walkway), east (family) and south
//    (south walkway) sides.
//  - balcony-rail: the south balcony's open south edge, between the row-4 columns.
//  - balcony-screen: a 1.8 m jaali screen at its east end (the kitchen counter stands
//    just inside; also privacy from the neighbour).
//  - west-jaali: a full-height terracotta jaali on the road side of the west stair
//    strip, from the first floor to parapet height above the terrace.
const gt = 0.10;
export const GUARDS = [
  { id: 'ff-court-guard', level: 'first', court: true, h: PARAPET_H, kerb: 0.12, t: gt, bands: [
    { id: 'N', x0: COURT.x0, x1: COURT.x1 + gt, z0: COURT.z0 - gt, z1: COURT.z0 },
    { id: 'E', x0: COURT.x1, x1: COURT.x1 + gt, z0: COURT.z0, z1: COURT.z1 },
    { id: 'S', x0: COURT.x0, x1: COURT.x1 + gt, z0: COURT.z1, z1: COURT.z1 + gt },
  ] },
  { id: 'balcony-rail', level: 'first', h: BALCONY.rail, kerb: 0.08, t: 0.06, bands: [
    { id: 'S', x0: BALCONY.x0 + 0.05, x1: BALCONY.x1, z0: BALCONY.z1 - 0.06, z1: BALCONY.z1 },
  ] },
  { id: 'balcony-screen', level: 'first', jaali: true, h: 1.80, kerb: 0.08, t: 0.06, bands: [
    { id: 'E', x0: BALCONY.x1 - 0.06, x1: BALCONY.x1, z0: BALCONY.z0, z1: BALCONY.z1 - 0.06 },
  ] },
  { id: 'west-jaali', level: 'first', jaali: true, h: LEVELS.terrace - LEVELS.first + PARAPET_H, kerb: 0.08, t: 0.05, bands: [
    { id: 'W', x0: WEST_STRIP.x0, x1: WEST_STRIP.x0 + 0.05, z0: WEST_STRIP.z0, z1: WEST_STRIP.z1 },
  ] },
];

// ------------------------------------------------------------------ rooms ----
const R = (id, level, name, x0, x1, z0, z1, use, extra = {}) => ({ id, level, name, x0, x1, z0, z1, use, ...extra });
export const ROOMS = [
  // First floor, nine squares around the court (owner's plan), then the balcony:
  //   NW  bedroom 3, common bath (3 steps up), short access   N  stairwell, landing, north walkway   NE  living / hall + pooja
  //   W   master bedroom                                    C  court                              E   family space
  //   SW  master ensuite + dressing                         S  south walkway                      SE  kitchen
  //   south: the covered balcony; the west stair rises from its west end to the terrace.
  R('bed3', 'first', 'Bedroom 3', xBay, -4.18, fN, -1.30, 'bedroom', { dir: 'NW' }),
  R('cbath', 'first', 'Common bath', -4.03, -1.93, fN, -3.20, 'bath', { dir: 'NW', floorY: RB, ventilation: 'high north window + exhaust fan' }),
  R('lobby', 'first', 'Short access', -4.03, fBw, -3.05, R2n, 'lobby', { dir: 'NW' }),
  R('stair', 'first', 'Stair', MAIN.opening[0], MAIN.opening[1], laneZ0, laneZ1, 'stair'),
  R('porch', 'first', 'Landing', MAIN.top + 0.10, fCw, fN, -2.975, 'porch', { dir: 'N' }),
  R('walkway', 'first', 'North walkway', fBe, fCw, -2.825, COURT.z0 - gt, 'hall', { dir: 'N' }),
  R('hall', 'first', 'Living / hall', fCe, fD, fN, GRID.z[2], 'hall', { dir: 'NE' }),
  R('family', 'first', 'Family space', fCe, fD, GRID.z[2], 1.00, 'family', { dir: 'E' }),
  R('kitchen', 'first', 'Open kitchen', fCe, fD, 1.00, SB, 'kitchen', { dir: 'SE' }),
  R('library', 'first', 'South walkway', fBe, fCw, R3s, SB, 'library', { dir: 'S' }),
  R('master', 'first', 'Master bedroom', fA, fBw, R2s, R3n, 'bedroom', { dir: 'W' }),
  R('mbath', 'first', 'Master ensuite', fA, -3.05, R3s, SB, 'bath', { dir: 'SW' }),
  R('dress', 'first', 'Dressing', -2.90, fBw, R3s, SB, 'dressing', { dir: 'SW' }),
  R('balcony', 'first', 'South balcony', HOUSE.x0, HOUSE.x1 - 0.06, SOUTH_WALL.z1, GRID.z[4] - 0.15, 'balcony', { dir: 'S' }),
  R('wstair', 'first', 'West stair', WSTAIR.lane[0], WSTAIR.lane[1], WSTAIR.lo, WSTAIR.hi, 'stair'),
  R('court', 'first', 'Nadumuttam', COURT.x0, COURT.x1, COURT.z0, COURT.z1, 'void'),
  // ground floor (open stilt parking + garden)
  R('g-stair', 'ground', 'Stair', MAIN.lo, MAIN.hi, laneZ0, laneZ1, 'stair'),
  R('g-court', 'ground', 'Courtyard garden', COURT.x0, COURT.x1, COURT.z0, COURT.z1, 'garden'),
  R('g-car', 'ground', 'Car', -6.00, -0.70, 1.95, 4.45, 'parking', { vehicle: 'car' }),
  R('g-bikes', 'ground', 'Two-wheelers', -5.00, -3.00, -0.50, 1.00, 'parking', { vehicle: 'two-wheeler' }),
  // terrace
  R('t-wash', 'terrace', 'Wash + drying', 4.60, 6.40, 2.60, 4.40, 'utility'),
];
// ---------------------------------------------------------------- beams ----
// One beam per bay on every grid line, overlapping at the columns. Perimeter beams
// match the 300 mm exterior walls; interior beams are 230 mm. Every span ≤ 4.6 m.
// The main stairwell cuts line B's north beam at first-floor level: it cantilevers
// from row 2 to pick up a trimmer beam along the south edge of the stair lane
// (structural design must confirm). A secondary beam carries the rooms' south wall
// between the column lines. The north-west bay and the west stair strip are
// cantilevers off line A. y0 = soffit, y1 = top of slab.
const bx = GRID.x, bz = GRID.z, hb = BEAM.w / 2, he = WALL_T.exterior / 2;
const XL = ['A', 'B', 'C', 'D'], ZL = ['1', '2', '3', '4'];
const CUT = { first: 'B', terrace: null };
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
      if (xl === CUT[lvl] && j === 0) { add(`line${xl}-12`, x - h, x + h, STAIR.trim.z0, zb, zb - STAIR.trim.z0); continue; }
      add(`line${xl}-${ZL[j]}${ZL[j + 1]}`, x - h, x + h, j === 0 ? za - he : za, j === 2 ? zb + he : zb, zb - za);
    }
  }
  // North-west bay: cantilevers from A1 and A2 and an edge beam under its west wall.
  add('bay-1', WEST_BAY.x0, bx.A, bz[1] - he, bz[1] + he, bx.A - WEST_BAY.x0);
  add('bay-2', WEST_BAY.x0, bx.A, bz[2] - he, bz[2] + he, bx.A - WEST_BAY.x0);
  add('bay-edge', WEST_BAY.x0, WEST_BAY.x0 + BEAM.w, HOUSE.z0, WEST_BAY.z1, bz[2] - bz[1]);
  if (lvl !== 'first') continue;
  add('stair-trim', bx.A, bx.C, STAIR.trim.z0, STAIR.trim.z1, Math.max(bx.B - bx.A, bx.C - bx.B));
  for (let i = 0; i < 3; i++) {
    const xa = bx[XL[i]], xb = bx[XL[i + 1]];
    add(`south-wall-${XL[i]}${XL[i + 1]}`, i === 0 ? xa - he : xa, i === 2 ? xb + he : xb, SOUTH_WALL.z0, SOUTH_WALL.z1, xb - xa);
  }
  // West stair strip (first-floor slab only; the stair above it is open to the sky).
  for (const zl of ['3', '4']) {
    const h = zl === '4' ? he : hb;
    add(`strip-${zl}`, WEST_STRIP.x0, bx.A, bz[zl] - h, bz[zl] + h, bx.A - WEST_STRIP.x0);
  }
  add('strip-edge', WEST_STRIP.x0, WEST_STRIP.x0 + BEAM.w, WEST_STRIP.z0, WEST_STRIP.z1, Math.max(bz[3] - bz[2], bz[4] - bz[3]));
}
// ------------------------------------------------------- terrace & roof ----
export const TERRACE = {
  fall: 0.06,                     // the finish rises 60 mm from the court guard to the parapets (≥ 1:100)
  // Light steel frame carrying PV over the west wing, tilted to face south.
  solar: { x0: -5.40, x1: -2.10, z0: -0.60, z1: 4.40, h: 2.40, tiltDeg: 11,
    posts: [[-5.40, -0.60], [-2.10, -0.60], [-5.40, 1.90], [-2.10, 1.90], [-5.40, 4.40], [-2.10, 4.40]] },
  tank: { x: 1.30, z: -3.90, r: 0.55, h: 1.30, stand: 1.50, litres: 1000 },   // on a steel stand over the landing
  planters: [
    { x0: -5.40, x1: -3.00, z0: -4.05, z1: -3.60, h: 0.45 },
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
// The first floor roofs the front strip and the stair strip takes its own rain to
// the garden, so no yard intercept at the gate is needed. Nothing discharges to the
// road. Points are [x, y, z]; channels must fall and connect node to node.
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
  [-0.60, COURT.z1, 0, -1], [0.60, COURT.z1, 0, -1], [1.60, COURT.z1, 0, -1],
  [COURT.x1, -0.30, -1, 0], [COURT.x1, 0.90, -1, 0],
];

// -------------------------------------------------------------- airflow ----
// Conceptual stack and cross ventilation; an illustration, not CFD. Cool air
// enters LOW on the west, through the master bedroom's low jaali (shaded by the
// west stair and its jaali) and the shaded stilts, crosses the court and the open
// family space, and leaves HIGH through the open court and the leeward east vents.
const yF = LEVELS.first, yT = LEVELS.terrace;
const wEntry = [[GRID.x.A, yF + 0.38, 0.10], [-4.60, yF + 0.80, 0.30], [-2.60, yF + 1.40, 0.30], [GRID.x.B, yF + 2.20, 0.30], [-0.40, yF + 2.30, 0.30]];
const toFamily = [[0.80, yF + 2.30, 0.40], [2.60, yF + 2.30, 0.40], [3.90, yF + 2.10, 0.40]];
export const AIRFLOW = {
  windFrom: 'SW',
  inlets: [
    { id: 'master-w-low', opening: 'master-w-win', at: [GRID.x.A, yF + 0.38, 0.10] },
    { id: 'stilt-sw', at: [-6.60, 0.80, 2.60] },
  ],
  exhausts: [
    { id: 'court-sky', at: [-0.40, yT + 2.30, 0.15] },
    { id: 'kitchen-e-high', opening: 'kitchen-e-exhaust', at: [GRID.x.D, yF + 2.30, 2.32] },
    { id: 'pooja-e-high', opening: 'pooja-e-exhaust', at: [GRID.x.D, yF + 2.30, -2.25] },
  ],
  paths: [
    { id: 'w-court', from: 'master-w-low', to: 'court-sky', pts: [...wEntry, [-0.40, yF + 2.40, 0.20], [-0.40, yT + 0.60, 0.15], [-0.40, yT + 2.30, 0.15]] },
    { id: 'stilt-court', from: 'stilt-sw', to: 'court-sky', pts: [[-6.60, 0.80, 2.60], [-5.00, 0.90, 1.00], [-2.50, 1.00, 0.50], [-0.60, 1.30, 0.20], [-0.40, 2.40, 0.15], [-0.40, yF + 1.80, 0.15], [-0.40, yT + 2.30, 0.15]] },
    { id: 'w-kitchen', from: 'master-w-low', to: 'kitchen-e-high', pts: [...wEntry, ...toFamily, [5.20, yF + 2.20, 1.60], [GRID.x.D, yF + 2.30, 2.32], [6.95, yF + 2.40, 2.32]] },
    { id: 'w-pooja', from: 'master-w-low', to: 'pooja-e-high', pts: [...wEntry, ...toFamily, [5.40, yF + 2.20, -1.60], [GRID.x.D, yF + 2.30, -2.25], [6.95, yF + 2.40, -2.25]] },
  ],
};

// ------------------------------------------------------------ furniture ----
// Boxes used by the 3D builder (detailed by type), the plans and collision.
// `face` = the direction a seat faces; `head` = the bed-head wall; `back` = the
// side against a wall. Counter `sink`/`stove` = world-coordinate ranges along it.
// `dy` lifts an item onto a raised floor.
const F = (id, level, type, x0, x1, z0, z1, h, extra = {}) => ({ id, level, type, x0, x1, z0, z1, h, ...extra });
export const FURNITURE = [
  // living / hall (NE): the closed oak pooja on the east wall faces the main door
  // (idols face west); the sofa set sits along the north wall.
  F('pooja-unit', 'first', 'poojaunit', 6.08, fD, -3.40, -1.80, 1.95, { face: 'W', back: 'E' }),
  F('sofa', 'first', 'sofa', 3.25, 5.25, -4.53, -3.68, 0.80, { back: 'N', face: 'S' }),
  F('coffee-table', 'first', 'coffeetable', 3.85, 4.65, -3.20, -2.70, 0.38),
  // family space (E): an oonjal facing the court, with two cane chairs
  F('oonjal', 'first', 'swing', 5.85, 6.35, -0.95, 0.45, 0.45, { hang: true, passable: true, face: 'W' }),
  F('family-chair-1', 'first', 'chair', 3.10, 3.70, -0.85, -0.25, 0.85, { face: 'E' }),
  F('family-chair-2', 'first', 'chair', 3.10, 3.70, 0.05, 0.65, 0.85, { face: 'E' }),
  // kitchen (SE): a breakfast bar facing the family space, the stove on the east
  // counter under the exhaust, fridge and sink along the south wall, and a sliding
  // door to the balcony (service deck).
  F('kit-bar', 'first', 'bar', 3.95, 6.10, 0.95, 1.45, 0.90, { back: 'S', seat: 'N', stools: 3 }),
  F('kit-counter-e', 'first', 'counter', 6.10, fD, 0.95, SB, 0.85, { stove: [2.00, 2.70], back: 'E' }),
  F('kit-counter-s', 'first', 'counter', 4.45, 6.10, 2.53, SB, 0.85, { sink: [4.75, 5.45], back: 'S' }),
  F('fridge', 'first', 'fridge', 3.75, 4.45, 2.43, SB, 1.80, { back: 'S' }),
  // master bedroom (W): the bed against the court wall (the court jaali is high above
  // the headboard), a wardrobe on the north wall
  F('master-bed', 'first', 'bed', -3.315, fBw, -0.58, 0.94, 0.50, { head: 'E' }),
  F('master-wardrobe', 'first', 'wardrobe', fA, -4.00, R2s, -0.435, 2.10, { back: 'N' }),
  // bedroom 3 (NW)
  F('bed3-bed', 'first', 'bed', -6.45, -5.05, fN, -2.58, 0.50, { head: 'N' }),
  F('bed3-side', 'first', 'sidetable', -5.00, -4.60, fN, -4.18, 0.55),
  F('bed3-wardrobe', 'first', 'wardrobe', -4.78, -4.18, -3.95, -2.80, 2.10, { back: 'E' }),
  // baths: fixtures along one wall, leaving a clear strip to the shower
  F('cb-shower', 'first', 'shower', -4.03, -3.13, fN, -3.20, 0.04, { passable: true, dy: RB }),
  F('cb-wc', 'first', 'wc', -3.05, -2.45, fN, -3.93, 0.42, { back: 'N', dy: RB }),
  F('cb-basin', 'first', 'basin', -2.40, -1.93, fN, -4.13, 0.85, { back: 'N', dy: RB }),
  F('mb-shower', 'first', 'shower', fA, -4.85, R3s, SB, 0.04, { passable: true }),
  F('mb-basin', 'first', 'basin', -4.80, -4.25, 2.58, SB, 0.85, { back: 'S' }),
  F('mb-wc', 'first', 'wc', -4.20, -3.60, 2.48, SB, 0.42, { back: 'S' }),
  // ground
  F('water-point', 'ground', 'waterpot', -6.70, -6.20, -3.15, -2.65, 0.95),
  F('car', 'ground', 'car', -5.40, -0.90, 2.25, 4.15, 1.50),
  F('scooter', 'ground', 'scooter', -4.80, -3.10, 0.30, 0.90, 1.10),
  F('cycle', 'ground', 'cycle', -4.80, -3.10, -0.30, -0.05, 0.95),
  F('tulsi', 'ground', 'tulsi', 0.50, 1.00, 0.90, 1.40, 0.85),
  F('uruli', 'ground', 'uruli', 0.40, 1.10, -0.70, 0.00, 0.25),
  F('store-understair', 'ground', 'store', -0.60, MAIN.hi, fN, laneZ1, 1.20),
  // terrace
  F('wash-counter', 'terrace', 'counter', 5.95, 6.55, 2.80, 4.40, 0.85, { sink: [3.40, 4.00], back: 'E' }),
  F('washer', 'terrace', 'washer', 5.10, 5.70, 3.95, 4.55, 0.85),
  F('t-chair-1', 'terrace', 'chair', -0.60, 0.00, 2.40, 3.00, 0.85, { face: 'N' }),
  F('t-chair-2', 'terrace', 'chair', 0.60, 1.20, 2.40, 3.00, 0.85, { face: 'N' }),
];export const COURT_TREE = { x: -0.40, z: 0.55, h: 4.6, canopy: 0.85 };
export const PALM = null;

// --------------------------------------------------- viewpoints (jumps) ----
// pos/look are [x, y, z]. For walk viewpoints, y = floor level + eye height.
export const VIEWPOINTS = [
  { id: 'overview', label: 'Overview', mode: 'orbit', pos: [-17.5, 13.5, 15.5], look: [0.6, 3.0, 0] },
  { id: 'gate', label: 'Front gate (road)', mode: 'walk', pos: [-9.0, EYE - ROAD.drop, -3.88], look: [-4.0, 1.4, -3.95] },
  { id: 'entrance', label: 'Covered entry + stair', mode: 'walk', pos: [-6.10, EYE, -3.97], look: [-2.0, 1.6, -3.97] },
  { id: 'court-garden', label: 'Courtyard garden', mode: 'walk', pos: [3.60, EYE, 0.70], look: [-0.6, 3.2, 0.2] },
  { id: 'arrival', label: 'Landing + main door', mode: 'walk', pos: [1.05, yF + EYE, -3.75], look: [6.4, yF + 1.3, -2.6] },
  { id: 'foyer', label: 'Living / hall + pooja (NE)', mode: 'walk', pos: [3.00, yF + EYE, -2.30], look: [6.4, yF + 1.1, -2.6] },
  { id: 'hall', label: 'North walkway + nadumuttam', mode: 'walk', pos: [-0.40, yF + EYE, -2.20], look: [0.6, yF + 0.6, 0.6] },
  { id: 'living', label: 'Family space (E)', mode: 'walk', pos: [2.80, yF + EYE, -0.55], look: [6.2, yF + 0.9, -0.2] },
  { id: 'kitchen', label: 'Kitchen (SE)', mode: 'walk', pos: [3.10, yF + EYE, 2.00], look: [6.2, yF + 0.9, 2.3] },
  { id: 'library', label: 'South walkway (S)', mode: 'walk', pos: [1.70, yF + EYE, 2.40], look: [-1.2, yF + 1.0, 2.40] },
  { id: 'master', label: 'Master bedroom (W)', mode: 'walk', pos: [-4.70, yF + EYE, 0.60], look: [-1.6, yF + 0.8, 0.2] },
  { id: 'suite', label: 'Master suite entry + dressing', mode: 'walk', pos: [-1.75, yF + EYE, 2.30], look: [-2.4, yF + 1.2, 0.2], open: ['mbath-door'] },
  { id: 'bed3', label: 'Bedroom 3 (NW)', mode: 'walk', pos: [-4.70, yF + EYE, -2.00], look: [-6.4, yF + 0.9, -3.8] },
  { id: 'bath', label: 'Short access + common bath', mode: 'walk', pos: [-2.79, yF + EYE, -1.55], look: [-2.79, yF + 1.5, -4.4], open: ['cbath-door'] },
  { id: 'balcony', label: 'South balcony', mode: 'walk', pos: [5.90, yF + EYE, 3.95], look: [-3.0, yF + 1.0, 3.95] },
  { id: 'terrace-stair', label: 'West stair to the terrace', mode: 'walk', pos: [-6.44, yF + EYE, 4.40], look: [-6.44, yF + 2.6, 0.0] },
  { id: 'terrace', label: 'Terrace garden', mode: 'walk', pos: [0.50, yT + EYE, -2.40], look: [-1.0, yT + 0.5, 0.8] },
];
// -------------------------------------------------------------- gates ----
// Two openings in the straight west (road) wall:
//  - the car gate: a slatted timber leaf sliding north behind the compound wall;
//  - the front (pedestrian) gate: a single 4 ft timber leaf swinging inward against
//    the north side of the covered entry walk, which leads straight to the stair.
export const GATES = [
  { id: 'gate', label: 'Car gate', type: 'sliding', z0: 1.75, z1: 4.45, leafH: 1.50, pierW: 0.30, pierH: 1.80, t: 0.06, track: 0.10 },
  { id: 'gate-ped', label: 'Front gate', type: 'swing', z0: -4.49, z1: -3.27, hinge: 'N', leafH: 1.50, pierW: 0.30, pierH: 1.80, t: 0.05 },
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
// First-floor envelope: the house (incl. the south balcony), the north-west bay and the west stair strip.
export const FF_RECTS = [HOUSE, WEST_BAY, WEST_STRIP];
export const inFirstFloor = (x, z) => FF_RECTS.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
// Terrace envelope: the house and the north-west bay.
export const TERRACE_RECTS = [HOUSE, WEST_BAY];
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
// Slab openings per floor level (rectangles open to below). The raised bath's slab
// (RAISED) replaces the first-floor slab over the main stair's low end.
export const SLAB_OPENINGS = {
  first: [...COURT_VOID, { id: 'stair', ...MAIN.rect(MAIN.opening[0], MAIN.opening[1]) }],
  terrace: [...COURT_VOID],
};
