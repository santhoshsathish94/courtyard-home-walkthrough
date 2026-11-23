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
const MUTABLE = ['WALLS', 'COLUMNS', 'BEAMS', 'ROOMS', 'FURNITURE', 'STAIR', 'DRAINAGE', 'AIRFLOW', 'TERRACE', 'PLOT', 'COURT', 'GUARDS'];
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
expectFailure('low beam over a flight kills headroom', (M) => { M.BEAMS.push({ id: 'terrace-low', level: 'terrace', x0: -1.0, x1: -0.5, z0: -4.5, z1: -3.7, y0: 5.0, y1: 6.4 }); }, /Stair headroom/);
expectFailure('shallow treads', (M) => { M.STAIR.tread = 0.23; }, /Tread ≥ 250 mm|2R \+ T/);
expectFailure('bath door opening inward', (M) => { op(M, 'cbath-door').swing = 'W'; }, /Bath door cbath-door must open outward/);
expectFailure('bedroom door opening outward', (M) => { op(M, 'bed3-door').swing = 'N'; }, /door bed3-door must open inward/);
expectFailure('bedroom door leaf not resting on a wall', (M) => { op(M, 'bed2-door').hinge = 'W'; }, /door bed2-door must open against a wall/);
expectFailure('main door opening into the hall', (M) => { op(M, 'main-door').swing = 'S'; }, /Main door main-door must open outward/);
expectFailure('drain channel running uphill', (M) => { M.DRAINAGE.channels[0].to[1] = 0.05; }, /Channel court-overflow must fall/);
expectFailure('drain discharging past the boundary', (M) => { const c = M.DRAINAGE.channels.find((x) => x.id === 'to-recharge'); c.to = [9.6, -0.2, -2.55]; }, /must stay inside the compound/);
expectFailure('airflow path through a solid wall', (M) => { M.AIRFLOW.paths[0].pts.splice(1, 0, [-2.5, 3.2 + 1.2, 5.2]); }, /crosses wall ff-S/);
expectFailure('inlet raised off the floor', (M) => { op(M, 'master-s-win').lowJaali = [1.4, 1.9]; }, /low-level jaali/);
expectFailure('missing rain hood on an exhaust', (M) => { delete op(M, 'pooja-e-exhaust').hood; }, /pooja-e-exhaust \(exhaust\) must have a rain hood/);
expectFailure('planter against the parapet (climbing hazard)', (M) => { Object.assign(M.TERRACE.planters[0], { z0: -4.60, z1: -4.15 }); }, /planter-1 is .* guard must be/);
expectFailure('furniture blocking a doorway', (M) => { Object.assign(M.FURNITURE.find((f) => f.id === 'bed3-desk'), { x0: 2.88, x1: 4.18 }); }, /keep the approach to bed3-door clear/);
expectFailure('invented plot dimensions', (M) => { M.PLOT.vertices = [[-8.35, -5.6], [8.35, -5.6], [8.35, 5.6], [-8.35, 5.6]]; }, /Plot side N must equal/);
expectFailure('plot area no longer matching the stated 1,620 sq ft', (M) => { M.PLOT.statedAreaSqFt = 1700; }, /within 0\.5 % of the stated/);
expectFailure('room squeezed below minimum size', (M) => { M.ROOMS.find((r) => r.id === 'bed3').z1 = 2.6; }, /Bedroom 3 \(bed3\) area ≥ 7\.5/);
expectFailure('window cut through a column', (M) => { op(M, 'bed3-e-win').s = 5.2; }, /bed3-e-win must not cut column D3/);
expectFailure('room made unreachable', (M) => { op(M, 'bed2-door').type = 'window'; Object.assign(op(M, 'bed2-door'), { sill: 0.9 }); }, /bed2 must be reachable/);
expectFailure('court-side bedroom wall without a court window', (M) => { const w = M.WALLS.find((x) => x.id === 'ff-3'); w.openings = w.openings.filter((o) => o.id !== 'bed2-court-win'); }, /bedroom wall on the court's S side must have a window/);
expectFailure('sliding gate parked across the opening', (M) => { M.gateLeaves = (g) => { const L = D0.gateLeaves(g); if (L[0].sliding) L[0].open = L[0].closed; return L; }; }, /must clear the whole opening when open/);
expectFailure('front gate swinging out onto the road', (M) => { M.gateLeaves = (g) => { const L = D0.gateLeaves(g); if (L[0].swing) L[0].openDir = [-1, 0]; return L; }; }, /Front gate gate-ped-leaf must open inward/);
expectFailure('beam span too long for its depth', (M) => { M.BEAMS.find((x) => x.id === 'first-row1-BC').span = 5.2; }, /first-row1-BC: span\/depth ≤ 11/);
expectFailure('car bay blocked at the gate', (M) => { M.FURNITURE.push({ id: 'junk', level: 'ground', type: 'store', x0: -6.2, x1: -6.0, z0: 1.9, z1: 4.3, h: 1.2 }); }, /car bay must be reachable/);
expectFailure('sink drawn off its counter', (M) => { M.FURNITURE.find((f) => f.id === 'kit-counter-s').sink = [0.25, 0.95]; }, /kit-counter-s sink range .* must lie along the counter/);
expectFailure('scupper spouting back onto the terrace', (M) => { M.SCUPPERS = D0.SCUPPERS.map((s, i) => (i ? s : [s[0], s[1], -s[2], -s[3]])); }, /must sit on the void edge and spout into the court/);
expectFailure('balcony projecting past the plot line', (M) => { M.BALCONY = { ...D0.BALCONY, x0: -7.3 }; }, /First-floor corner .* must stay inside the plot line/);
expectFailure('thinnai moved away from the stair foot', (M) => { Object.assign(M.FURNITURE.find((f) => f.id === 'thinnai'), { x0: 3.4, x1: 4.9, z0: 2.0, z1: 2.4 }); }, /thinnai must sit by the stair foot/);
expectFailure('open door leaf blocking a route', (M) => { op(M, 'cbath-door').hinge = 'N'; }, /terrace-stair foot must be reachable/);
