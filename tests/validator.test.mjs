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

expectFailure('column standing in the stair landing', (M) => { Object.assign(M.COLUMNS.find((c) => c.id === 'C2'), { x: -1.6, z: -3.0 }); }, /Column C2 must not stand in the court void or the stair/);
expectFailure('beam crossing the stairwell', (M) => { M.BEAMS.push({ id: 'first-bad', level: 'first', x0: -2.2, x1: 2.19, z0: -3.0, z1: -2.77, y0: 2.75, y1: 3.2 }); }, /Beam first-bad must not cross the stair opening/);
expectFailure('low beam over a flight kills headroom', (M) => { M.BEAMS.push({ id: 'terrace-low', level: 'terrace', x0: -2.085, x1: -1.1, z0: -2.8, z1: -2.57, y0: 5.0, y1: 6.4 }); }, /Stair headroom/);
expectFailure('shallow treads', (M) => { M.STAIR.tread = 0.23; }, /Tread ≥ 250 mm|2R \+ T/);
expectFailure('bath door opening inward', (M) => { op(M, 'cbath-door').swing = 'W'; }, /Bath door cbath-door must open outward/);
expectFailure('bedroom door opening outward', (M) => { op(M, 'kids-door').swing = 'N'; }, /Bedroom door kids-door must open inward/);
expectFailure('bedroom door leaf not resting on a wall', (M) => { op(M, 'master-door').s = 6.0; }, /Bedroom door master-door must open against a wall/);
expectFailure('drain channel running uphill', (M) => { M.DRAINAGE.channels[0].to[1] = 0.05; }, /Channel court-overflow must fall/);
expectFailure('drain discharging to the road', (M) => { const c = M.DRAINAGE.channels.find((x) => x.id === 'gate-intercept-s'); c.from = [-8.5, 0.02, 3.0]; }, /must stay inside the compound/);
expectFailure('airflow path through a solid wall', (M) => { M.AIRFLOW.paths[0].pts.splice(1, 0, [-2.5, 3.2 + 1.2, 4.6]); }, /crosses wall ff-S/);
expectFailure('inlet raised off the floor', (M) => { op(M, 'master-s-win').lowJaali = [1.4, 1.9]; }, /low-level jaali/);
expectFailure('missing rain hood on an exhaust', (M) => { delete op(M, 'pooja-e-exhaust').hood; }, /pooja-e-exhaust \(exhaust\) must have a rain hood/);
expectFailure('planter against the parapet (climbing hazard)', (M) => { Object.assign(M.TERRACE.planters[0], { z0: -4.17, z1: -3.72 }); }, /planter-1 is .* guard must be/);
expectFailure('furniture blocking a doorway', (M) => { Object.assign(M.FURNITURE.find((f) => f.id === 'kids-desk'), { x0: 2.45, x1: 3.85 }); }, /keep the approach to kids-door clear/);
expectFailure('invented plot dimensions', (M) => { M.PLOT.vertices = [[-8.35, -5.6], [8.35, -5.6], [8.35, 5.6], [-8.35, 5.6]]; }, /Plot side N must equal/);
expectFailure('room squeezed below minimum size', (M) => { M.ROOMS.find((r) => r.id === 'kids').z1 = 2.6; }, /Kids \(kids\) area ≥ 7\.5/);
expectFailure('window cut through a column', (M) => { op(M, 'kids-e-win').s = 5.2; }, /kids-e-win must not cut column D2/);
expectFailure('room made unreachable', (M) => { op(M, 'parents-door').type = 'window'; Object.assign(op(M, 'parents-door'), { sill: 0.9 }); }, /parents must be reachable/);
// Cycle 3 rules (court edges, sliding gate, deep beams, car bay, counter fittings).
expectFailure('court-side bedroom wall without a court window', (M) => { const w = M.WALLS.find((x) => x.id === 'ff-row2'); w.openings = w.openings.filter((o) => o.id !== 'parents-court-win'); }, /bedroom wall on the court's S side must have a window/);
expectFailure('sliding gate parked across the opening', (M) => { M.gateLeaves = () => { const L = D0.gateLeaves(); L[0].open = L[0].closed; return L; }; }, /must clear the whole opening when open/);
expectFailure('long-span beam left at 450 mm', (M) => { const b = M.BEAMS.find((x) => x.id === 'first-colB-12'); b.d = 0.45; b.y0 = b.y1 - 0.45; }, /first-colB-12: span\/depth ≤ 11/);
expectFailure('car bay blocked at the gate', (M) => { M.FURNITURE.push({ id: 'junk', level: 'ground', type: 'store', x0: -5.75, x1: -5.55, z0: 1.75, z1: 4.05, h: 1.2 }); }, /car bay must be reachable/);
expectFailure('sink drawn off its counter', (M) => { M.FURNITURE.find((f) => f.id === 'kit-counter-s').sink = [0.25, 0.95]; }, /kit-counter-s sink range .* must lie along the counter/);