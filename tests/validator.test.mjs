// Mutation tests for the semantic validator: each case re-introduces a known
// design regression (several are bugs found in the previous model) and asserts
// that the validator rejects it. The unmodified design must pass cleanly.
// Run: node --test tests/validator.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as D0 from '../src/design.js';
import { validate } from '../scripts/checks.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const MUTABLE = ['WALLS', 'COLUMNS', 'BEAMS', 'ROOMS', 'FURNITURE', 'STAIR', 'DRAINAGE', 'AIRFLOW', 'TERRACE', 'PLOT', 'COURT', 'GUARDS', 'FF_RECTS'];
function run(mutator) {
  const M = { ...D0 };
  for (const k of MUTABLE) M[k] = structuredClone(D0[k]);
  if (mutator) mutator(M);
  return validate({ D: M, root, sources: false });
}
const op = (M, id) => M.WALLS.flatMap((w) => w.openings).find((o) => o.id === id);
function expectFailure(name, mutator, pattern) {
  test(name, () => {
    const C = run(mutator);
    assert.ok(C.failures.some((f) => pattern.test(f)), `expected a failure matching ${pattern}; got:\n  ${C.failures.slice(0, 8).join('\n  ') || '(no failures)'}`);
  });
}

test('baseline design passes every design check', () => {
  const C = run();
  assert.deepEqual(C.failures, []);
  assert.ok(C.count > 1000, `expected a substantial number of checks, ran ${C.count}`);
});

expectFailure('column standing in the stair', (M) => { Object.assign(M.COLUMNS.find((c) => c.id === 'C2'), { x: -1.0, z: -4.1 }); }, /Column C2 must not stand in the court void or the stair/);
expectFailure('beam crossing the stairwell', (M) => { M.BEAMS.push({ id: 'first-bad', level: 'first', x0: -2.0, x1: -1.0, z0: -4.3, z1: -4.07, y0: 2.75, y1: 3.2 }); }, /Beam first-bad must not cross the stair opening/);
expectFailure('low beam over a landing kills headroom', (M) => { M.BEAMS.push({ id: 'first-low', level: 'first', x0: -2.8, x1: -2.0, z0: -4.5, z1: -3.7, y0: 2.9, y1: 3.3 }); }, /Stair headroom/);
expectFailure('raised bath floor too low for the stair below', (M) => { M.RAISED = D0.RAISED.map((r) => ({ ...r, y: r.y - 0.15 })); }, /Stair headroom/);
expectFailure('steps not reaching the raised floor', (M) => { M.STEPS = D0.STEPS.map((s) => ({ ...s, n: 2 })); }, /Steps cbath-steps must rise exactly to the raised floor/);
expectFailure('shallow treads', (M) => { M.stairRun = (i) => ({ ...D0.stairRun(i), tread: 0.23 }); }, /tread ≥ 250 mm|2R \+ T/);
expectFailure('too many risers in one flight', (M) => { M.stairRun = (i) => { const r = D0.stairRun(i); return i === 1 ? { ...r, flights: [{ ...r.flights[0], n: 17 }], mids: [] } : r; }; }, /≤ 15 risers per flight/);
expectFailure('stair narrower than 4 ft', (M) => { M.stairRun = (i) => { const r = D0.stairRun(i); return i === 0 ? { ...r, lane: [r.lane[0], r.lane[0] + 0.9], width: 0.9 } : r; }; }, /Run main: stair width ≥ 1\.22 m/);
expectFailure('terrace stair narrower than 0.9 m', (M) => { M.stairRun = (i) => { const r = D0.stairRun(i); return i === 1 ? { ...r, lane: [r.lane[0] + 0.2, r.lane[1]], width: 0.78 } : r; }; }, /Run west: stair width ≥ 0\.90 m/);
expectFailure('door narrower than 4 ft', (M) => { op(M, 'bed3-door').w = 0.9; }, /Door bed3-door clear width ≥ 1\.22 m/);
expectFailure('main door narrower than 5 ft', (M) => { op(M, 'main-door').w = 1.2; }, /Door main-door clear width ≥ 1\.52 m/);
expectFailure('bath door opening inward', (M) => { op(M, 'cbath-door').swing = 'N'; }, /Bath door cbath-door must open outward/);
expectFailure('bedroom door opening outward', (M) => { op(M, 'bed3-door').swing = 'E'; }, /door bed3-door must open inward/);
expectFailure('bedroom door leaf not resting on a wall', (M) => { op(M, 'bed3-door').hinge = 'N'; }, /door bed3-door must open against a wall/);
expectFailure('main door opening into the hall', (M) => { op(M, 'main-door').swing = 'E'; }, /Main door main-door must open outward/);
expectFailure('drain channel running uphill', (M) => { M.DRAINAGE.channels[0].to[1] = 0.05; }, /Channel court-overflow must fall/);
expectFailure('drain discharging past the boundary', (M) => { const c = M.DRAINAGE.channels.find((x) => x.id === 'to-recharge'); c.to = [9.6, -0.2, -2.55]; }, /must stay inside the compound/);
expectFailure('airflow path through a solid wall', (M) => { M.AIRFLOW.paths[0].pts.splice(1, 0, [-2.5, 3.2 + 1.2, 5.2]); }, /crosses wall ff-S/);
expectFailure('inlet raised off the floor', (M) => { op(M, 'master-w-win').lowJaali = [1.4, 1.9]; }, /low-level jaali/);
expectFailure('missing rain hood on an exhaust', (M) => { delete op(M, 'pooja-e-exhaust').hood; }, /pooja-e-exhaust \(exhaust\) must have a rain hood/);
expectFailure('planter against the parapet (climbing hazard)', (M) => { Object.assign(M.TERRACE.planters[0], { z0: -4.60, z1: -4.15 }); }, /planter-1 is .* guard must be/);
expectFailure('furniture blocking a doorway', (M) => { Object.assign(M.FURNITURE.find((f) => f.id === 'bed3-wardrobe'), { z0: -2.40, z1: -1.80 }); }, /keep the approach to bed3-door clear/);
expectFailure('invented plot dimensions', (M) => { M.PLOT.vertices = [[-8.35, -5.6], [8.35, -5.6], [8.35, 5.6], [-8.35, 5.6]]; }, /Plot side N must equal/);
expectFailure('plot area no longer matching the stated 1,620 sq ft', (M) => { M.PLOT.statedAreaSqFt = 1700; }, /within 0\.5 % of the stated/);
expectFailure('room squeezed below minimum size', (M) => { M.ROOMS.find((r) => r.id === 'bed3').z1 = -2.0; }, /Bedroom 3 \(bed3\) area ≥ 7\.5/);
expectFailure('window cut through a column', (M) => { op(M, 'living-e-win').s = 3.28; }, /living-e-win must not cut column D2/);
expectFailure('room made unreachable', (M) => { op(M, 'bed3-door').type = 'window'; Object.assign(op(M, 'bed3-door'), { sill: 0.9 }); }, /bed3 must be reachable/);
expectFailure('closed court side without a court opening', (M) => { const w = M.WALLS.find((x) => x.id === 'ff-B-c'); w.openings = w.openings.filter((o) => o.id !== 'master-court-jaali'); }, /wall on the court's W side must have a window or jaali/);
expectFailure('sliding gate parked across the opening', (M) => { M.gateLeaves = (g) => { const L = D0.gateLeaves(g); if (L[0].sliding) L[0].open = L[0].closed; return L; }; }, /must clear the whole opening when open/);
expectFailure('front gate swinging out onto the road', (M) => { M.gateLeaves = (g) => { const L = D0.gateLeaves(g); if (L[0].swing) L[0].openDir = [-1, 0]; return L; }; }, /Front gate gate-ped-leaf must open inward/);
expectFailure('beam span too long for its depth', (M) => { M.BEAMS.find((x) => x.id === 'first-row1-BC').span = 5.2; }, /first-row1-BC: span\/depth ≤ 11/);
expectFailure('car bay blocked at the gate', (M) => { M.FURNITURE.push({ id: 'junk', level: 'ground', type: 'store', x0: -6.2, x1: -6.0, z0: 1.9, z1: 4.3, h: 1.2 }); }, /car bay must be reachable/);
expectFailure('sink drawn off its counter', (M) => { M.FURNITURE.find((f) => f.id === 'kit-counter-s').sink = [0.25, 0.95]; }, /kit-counter-s sink range .* must lie along the counter/);
expectFailure('scupper spouting back onto the terrace', (M) => { M.SCUPPERS = D0.SCUPPERS.map((s, i) => (i ? s : [s[0], s[1], -s[2], -s[3]])); }, /must sit on the void edge and spout into the court/);
expectFailure('stair strip projecting past the plot line', (M) => { M.FF_RECTS = D0.FF_RECTS.map((r) => (r === D0.WEST_STRIP ? { ...r, x0: -7.3 } : r)); }, /First-floor corner .* must stay inside the plot line/);
expectFailure('open door leaf blocking a route', (M) => { op(M, 'master-door').hinge = 'N'; }, /master must be reachable from the stair arrival/);
