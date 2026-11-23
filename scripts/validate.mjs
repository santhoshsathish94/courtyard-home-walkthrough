// CLI: semantic validation of the design data and web sources.
// Run: node scripts/validate.mjs
import { fileURLToPath } from 'node:url';
import * as D from '../src/design.js';
import { validate } from './checks.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const C = validate({ D, root });
console.log('Courtyard walkthrough validation');
for (const f of C.facts) console.log('  · ' + f);
for (const w of C.warnings) console.log('  ! ' + w);
if (C.failures.length) {
  console.error(`\n${C.failures.length} of ${C.count} checks failed:`);
  for (const f of [...new Set(C.failures)]) console.error('  ✗ ' + f);
  process.exit(1);
}
const m = C.meta;
console.log(`\nAll ${C.count} checks passed (${m.ids} HTML ids, ${m.refs} DOM references, ${m.modules} modules).`);