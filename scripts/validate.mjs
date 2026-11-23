import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
assert.deepEqual([...new Set(duplicateIds)], [], 'HTML IDs must be unique');

const referencedIds = [...html.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
const missingIds = [...new Set(referencedIds)].filter((id) => !ids.includes(id));
assert.deepEqual(missingIds, [], 'Every getElementById reference must exist in the document');

const moduleMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(moduleMatch, 'A module script must exist');
const moduleWithoutImports = moduleMatch[1].replace(/^\s*import .*?;\s*$/gm, '');
assert.doesNotThrow(() => new Function(moduleWithoutImports), 'Module body must parse after imports are removed');

assert.match(html, /addWallTopTileRun\(7\.3, -4\.95, 4\.95, 1\)/, 'Individual wall-top clay tiles must remain');
assert.doesNotMatch(html, /function addEastServiceEave|const rainPipe\s*=|const fascia\s*=/, 'Long roof frame and downpipe must not return');
assert.match(html, /SW low-level breeze inlet/, 'SW low-level air inlet must remain');
assert.match(html, /High-level leeward exhaust/, 'High-level air exhaust must remain');
assert.match(html, /WEST ROAD ENTRANCE GATE/, 'West entrance gate must remain');
assert.match(html, /function addSlopedWaterRun/, 'Sloped surface-water geometry must remain');
assert.match(html, /SW low inlet → cross-flow → high exhaust/, 'Ventilation must be visible on the first-floor plan');
assert.doesNotMatch(html, /addNorthRoofWing|addWestRoofWing|addSouthRoofWing/, 'Removed broad roof wings must not return');
assert.match(html, /aria-controls="controls-body"/, 'Controls toggle must expose its controlled panel');
assert.match(html, /window\.addEventListener\('blur'/, 'Held movement must clear when the window loses focus');
assert.match(html, /requestPointerLock\?\.\(\)/, 'Desktop Walk mode must support pointer-lock recovery');
assert.match(html, /width=device-width, initial-scale=1\.0/, 'Mobile zoom must remain enabled');

console.log('Courtyard walkthrough validation passed.');
console.log('Checked ' + ids.length + ' unique IDs, ' + new Set(referencedIds).size + ' DOM references, module syntax and key interaction invariants.');
