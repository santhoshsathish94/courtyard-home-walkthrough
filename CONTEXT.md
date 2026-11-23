# CONTEXT — Traditional Tamil Courtyard Home walkthrough

Clover handoff record (Context → Direction → Execution → Outcome → Growth). It is offered, not imposed: the owner decides whether to keep, correct or delete it. Earlier design history lives in `DESIGN-REVIEW.md` and git history. The previous local context file (`C:\personal\courtyard-home\CONTEXT.md`) belongs to an older, different house design and is **not** used here.

## Direction (owner, 2026-11-23)
Complete a polished, realistic, interactive 3D walkthrough of a traditional Tamil courtyard home, published at https://santhoshsathish94.github.io/courtyard-home-walkthrough/ from https://github.com/santhoshsathish94/courtyard-home-walkthrough.

**Preserve:**
- the 1,620 sq ft plot concept with west road access
- three levels: open stilt garden, first-floor family home, terrace garden
- a central open-to-sky nadumuttam
- thinnai, shaded verandahs and practical rooms
- natural ventilation, daylight and passive cooling: low SW intake, high warm-air exhaust
- functional rainwater flow, with subtle slopes and recharge
- an actual timber west gate
- a conceptual 12-column structure coordinated with the stair and court
- lime, natural stone, terracotta and reclaimed timber
- minimal architecture with no unnecessary roof structures

**Requirements:**
- geometry consistent across the 3D model, plans and walkthrough
- plausible airflow and rain paths
- realistic visuals
- every interaction working on desktop and mobile
- no invented plot dimensions or survey angles; reconcile the stated sides with the stated area
- concept clearly distinguished from validated construction design

**Done means:** GitHub Actions green, Pages deployed, and the live site verified.

## Context found (cycle 1, evidence from the repo and live site)
- **Code:** a single `index.html` (1,486 lines) using three.js r160 from the unpkg CDN. Geometry is hand-placed boxes, one mesh per box. The 2D plan duplicates coordinates by hand.
- **Validator:** `scripts/validate.mjs` string-matches exact coordinates in the HTML. It runs in Actions (green on a674cc4). Pages deploys from the `main` branch root (green).
- **Units and axes:** metres; +x east (the road is on −x), +z south (north is −z), +y up. Levels: ground 0.0, first floor 3.20, terrace 6.40.
- **The plot cannot be as stated** (computed here; see the reconciliation section).
- **The model contradicts the plot:**
  - The compound wall is 16.7 × 11.2 m ≈ 2,013 sq ft, inventing about 25 % more land.
  - The first floor is 14.6 × 10.0 m (146 m²) on a plot only 10.03 m deep, so it cannot fit with any wall or margin.
  - The north and east balconies project beyond the compound wall.
- **Structure:**
  - The 3 × 4 grid uses 7.15 m spans (heavy for a home).
  - The centre column at the stair landing clashes with the landing (this was already flagged).
  - The perimeter beam on z = 4.85 crosses the stairwell about 1.26 m above the mid landing, a head-strike clash.
- **Stair:** treads are 0.23 m, the landing is 0.8 m deep against 1.3 m-wide flights, and the first-floor arrival is a 0.4 m strip in front of the court railing.
- **Other model issues:**
  - The thinnai's tile roof sits under the first-floor slab (redundant).
  - The charupadi bench is placed against the court balustrade (a climbing aid at a 3.2 m drop).
  - Terrace planters sit against the parapets (they reduce effective guard height).
- **Live site:** loads (slowly, because of the CDN). The look is basic: flat colours, blob plants, one mesh per box.
- **Stale artefacts:** `render/` (Blender scripts) and `media/` (a 42 MB video) depict an older, different house and are not referenced by the site. `revisions/` holds archived HTML iterations.

## Plot reconciliation (known / inferred / unknown)
> Superseded in cycle 4: the owner confirmed a straight 33 ft road side, S 46 ft and N 52 ft (1,617 sq ft, E derived). See *Cycle 4* below.

- **Known (supplied):** N 51 ft, S 46 ft, W 33 ft, E 33 ft; area 1,620 sq ft; road on the west.
- **Verified by computation:**
  - The maximum area of any quadrilateral with these four sides (Brahmagupta, cyclic case) is **1,595.9 sq ft (148.3 m²)**, so 1,620 sq ft is unattainable.
  - With right angles at the road corners, the east side would be 33.38 ft (≠ 33) and the area 1,600.5 sq ft.
  - 1,620 sq ft would need W = E ≈ 33.5 ft. Either the sides are rounded, or the area comes from a different source.
- **Unknown:** corner angles, bearings, site levels, setbacks and regulations. A survey or FMB sketch is needed.
- **Assumption used for visualisation (labelled in the UI):** an isosceles trapezoid with N parallel to S. This is the only shape that keeps **all four supplied lengths exact**, and it is also the maximum-area case (1,595.9 sq ft, the closest to the stated area). Depth is 10.0295 m. The west and east sides lean 4.34° (0.762 m offset each).

## Design basis (as built in cycle 2; conceptual, not validated construction design)
> Superseded by cycles 3 and 4. The current design (16 columns, nine squares, straight north stair) is described under *Cycle 4* below.

Cycle 1 numbers were revised once the validator and the browser walk exposed conflicts. Each reason is noted. The authoritative values are in `src/design.js`.

- **Fit:**
  - The first floor is 12.30 × 8.80 m (108 m², ≈1,165 sq ft), 73 % of the plot.
  - Margins: about 0.6 m N/S, 1.2–1.9 m on the W (road), 0.6–1.3 m on the E.
  - The compound wall is 0.30 m rubble on the boundary.
  - The setbacks are a design choice.
- **Grid (12 columns):** A −5.70, B −2.20, C 2.60, D 6.30 (x); 1 −4.25, 2 0, 3 4.25 (z). Spans are ≤ 4.8 m.
  - B and C were widened by 0.10 m each. With the guard and stair screen in place, the verandahs were only about 0.8 m clear; now they are about 0.98 m.
  - Columns are 230 × 450 mm (300 × 300 at the corners) and hide inside the walls. 300 mm square columns in 230 mm walls projected into rooms.
- **Court:** 2.4 × 2.4 m, x −1.00…1.40, z −1.35…1.05. It was shifted 0.15 m north to give the south verandah room. The ground below is a planted rain garden.
- **Stair:** a dog-leg of 18 × 177.8 mm risers and 270 mm treads (2R+T 626 mm), with 0.90 m flights.
  - The floor landing is 1.06 m and the mid landing 1.35 m.
  - Computed headroom is ≥ 2.45 m everywhere.
  - The terracotta jaali spine carries the handrails.
- **Rooms:**
  - The library alcove has a window seat and shelves only. A chair blocked the route to the pooja.
  - Bath doors open outward. Bedroom doors open inward and rest on a wall.
  - The ensuite is shared between the kids and master rooms.
  - The common bath vents through a jaali transom to the court plus a duct.
- **Ground:**
  - The thinnai flank the path. The north thinnai was shortened to 2.0 m so a two-wheeler clears the open gate leaf to reach the parking.
  - The gate is 2.5 m, moved 0.1 m north; its south pier ran into the corner wall.
  - The water point moved north of the gate's swing.
- **Rain:**
  - The terrace falls ≥ 1:77 to the court, with 8 scuppers into the rain garden.
  - Overflow runs through a weir and a stone channel (1:121), then the grated gate intercept (1:96) and silt trap, to the recharge pit at (−6.55, −2.85).
  - The pit is ≥ 1.0 m from column centres, to be confirmed with soil data.
  - Nothing goes to the road.
- **Air:** low SW jaali inlets with rain hoods. Five paths cross the house through real openings only, leaving through the court sky, the stair-head E/N jaalis and the high E jaalis of the parents' room and pooja.
- **Safety:**
  - 1.0 m guards with balusters less than 100 mm apart.
  - Planters ≥ 0.6 m from guards.
  - A 1.8 m jaali screen where the washer and wash counter stand against the parapet.
  - Bars on low windows.

### Cycle 1 design basis (history; superseded where it differs from the above)
- **Fit:**
  - The first floor is a 12.30 × 8.80 m box (108 m², about 1,165 sq ft) inside the plot.
  - Margins are about 0.6 m north and south, 1.2–1.9 m on the west (front, road) and 0.6–1.3 m on the east.
  - The compound wall is 0.30 m local rubble stone on the boundary.
  - Setbacks are design choices, not verified against local rules.
- **12 columns:** a 4 × 3 grid. A = −5.70, B = −2.10, C = 2.50, D = 6.30 (x); 1 = −4.25, 2 = 0, 3 = 4.25 (z). Spans are ≤ 4.6 m.
  - B2 and C2 are the court pillars.
  - B3 and C3 frame the stair's corners.
  - No column or beam crosses the court void or the stairwell; trimmer beams frame both openings.
- **Court:** a 2.4 × 2.4 m void open from the sky to the ground garden. Verandahs (thalvaram) on all sides are the circulation. Guards are 1.0 m vertical timber balusters, with no seat at the edge.
- **Stair:** a dog-leg south of the court, 18 risers × 177.8 mm, treads 270 mm, flights 0.9 m wide.
  - The mid landing is 1.25 m deep; the floor landing is 0.96 m.
  - Headroom is checked numerically.
  - The main door is at the stair foot, facing the west gate, flanked by twin thinnai under the house (the shaded entrance verandah).
- **Rooms (keeping the existing intent):**

  | Placement | Rooms |
  |---|---|
  | West wing | kids (NW), Jack-and-Jill ensuite + common bath, master (SW, low SW air inlet) |
  | Centre | living (N, open to the court) + library alcove (NE), nadumuttam, stair (S) |
  | East wing | pooja (NE corner), parents (E), kitchen-dining (SE) |

  The library shrinks to an alcove off the living room, because the true plot cannot hold a separate library room at practical sizes.
- **Air:**
  - A low SW intake (stilt garden plus low jaali in the master bedroom).
  - Cross-flow through doorways with jaali transoms.
  - Warm air leaves through the open court and the stair stack (mumty jaali, facing leeward N and E), plus high NE ventilators.
  - Conceptual, not CFD.
- **Rain:**
  - The terrace falls about 1:100 to the court; scuppers drop rain into the court.
  - The court ground basin is a planted, permeable rain garden.
  - Its overflow runs through a stone channel (≥ 1:100) and a silt trap to the recharge pit in the NW front yard.
  - Nothing discharges to the road. Parapet tops have clay coping tiles. There are no downpipes or gutters.
- **Terrace:**
  - Terracotta pavers.
  - A 1.0 m parapet and a 1.0 m court guard.
  - Planters held away from the guards.
  - A solar canopy over the west wing.
  - A tank on the mumty roof, close to the baths and kitchen.
  - A wash/drying area beside the mumty.

## Execution plan (architecture, as built)
- **Single source of truth:** `src/design.js` holds plot, grid, levels, walls and openings, rooms, beams, stair, court, drainage, airflow, furniture and viewpoints as pure data.
- **Consumers:**
  - `src/build3d.js` builds the 3D model (merged per material and level) from that data.
  - `src/textures.js` generates procedural materials.
  - `src/plan.js` draws the plans and the minimap.
  - `src/walk.js` handles collision, floors and input.
  - `src/fx.js` animates airflow and rain.
  - `src/main.js` runs the app shell.
- **Validation:** `scripts/checks.mjs` (semantic validator) feeds both `scripts/validate.mjs` (the CLI) and `tests/validator.test.mjs` (mutation tests).
- **Browser tests:** `tests/e2e.spec.mjs`, with `playwright.config.mjs` and `scripts/serve.mjs`.
- **Vendoring:** three.js r160 is in `vendor/three/`, so the site has no CDN dependency. `.nojekyll` makes Pages serve files as they are.
- **CI:** `.github/workflows/validate.yml` runs the validator and mutation tests, then Playwright (desktop + phone).
- **Archive:** the previous single-file site is kept at `revisions/clover-single-file-v5-before-refit.html`.

## Outcome log
**Cycle 2 (2026-11-23): rebuild, observe, fix.** Evidence is local unless marked live.

- **Validator.** `node scripts/validate.mjs` runs 4,697 checks, all passing. It computes facts:
  - plot 1,595.9 sq ft against 1,620 stated
  - house 108.2 m²
  - stair headroom 2.45 m minimum
  - drainage falls 1:96 to 1:121
- **Verification control changed.** The coordinate-pinned validator was replaced by semantic checks, so its independence had to be shown separately:
  - All 25 original intents are kept.
  - `tests/validator.test.mjs` re-injects 18 known regressions (the old stair-landing column, a beam over the stairwell, an inward bath door, an uphill drain, road discharge, airflow through a solid wall, invented plot dimensions, and others). The validator rejects all of them, and the baseline passes.
  - That run exposed one weakness: the validator was trusting design.js helpers that read module internals. Plot geometry is now computed independently.
- **Browser review** (local server, real WebGL), with each bug found and fixed:
  - The init hung in hidden tabs (rAF, then throttled timers).
  - Reversed-coordinate boxes were silently dropped, which removed the counters, wardrobes and shelves.
  - The sky was clipped beyond the far plane, and the PMREM sky lay beyond its far plane.
  - The road was buried.
  - Bounce light made ceilings brown.
  - Plan labels overlapped.
  - Shelves crossed the windows.
  - The resume overlay hid "Exit walk".
  - Walking speed depended on frame rate: at 2 fps it was 10× slow.
- **Playwright** (Chromium with SwiftShader, desktop 1280×800 + Pixel 7 touch): 18/18 pass. Covered: load with no console errors, a real image, a full-screen canvas, the walk route road → gate → stair → first floor → terrace, every viewpoint at eye height, doors blocking and passing, a gate toggled by a real click or tap, plans via UI clicks, overlay and level controls, the about dialog, keyboard walking with blur stopping it, and joystick walking.
- **CI** (eb4ba6d): GitHub Actions "Validate courtyard walkthrough" passed. Design and source validation took 13 s; browser tests (desktop + touch phone) took 300 s on ubuntu-latest. "pages build and deployment" passed.
- **Live site** (?v=eb4ba6d), verified in a real browser:
  - The new build loads in about 5.5 s with no console errors (263 meshes, 35.7k triangles, 9 doors).
  - Vendored three.js is served.
  - Walk mode, the minimap and the plans work.
- **Follow-up fix:** the plans had overlapping labels (two-word names in narrow rooms, and the scale bar against the airflow caption). The fix is pushed as a separate commit and verified the same way.

## Growth (carry forward)
- **Prove a replaced check independently.** When a verification control is replaced, prove it with mutation tests. A validator that imports the subject's helpers can share its blind spots.
- **Don't rely on rAF or timers for init.** In hidden tabs, rAF pauses and timers may be throttled for a minute. Init must not depend on them, and test waits should use interval polling.
- **Normalise before you validate.** A size check placed before normalisation dropped geometry silently. Here the browser review caught it, not the validator: data checks cannot see rendering bugs.
- **Keep test helpers out of app behaviour.** The test-only `renderNow` helper moved the camera because it called `orbit.update()` in walk mode.
- **Test against the slowest renderer.** Make motion frame-rate independent and test with software GL, which behaves like a slow phone.

## Cycle 3 — owner direction (2026-11-23, 15:04–15:33)
Verbatim intent, in order of priority:
1. **"Modern house with traditional values, not a traditional looking house."** (top priority)
2. Stairs on the **north** side (vastu); **SW entrance** for easy car parking and entry.
3. First floor **half open**: small **pooja**, **open living**, **open kitchen with a U island**. No separate dining table; one leg of the U is for sitting, the other two hold the stove and the sink, plus the fridge.
4. The **S + W "L" holds 3 bedrooms**. No space wasted on corridors; circulation happens only in the open space.
5. The court opens to the hall, stairs and kitchen; **bedroom walls (with windows) form the court's other walls.**
6. Work in short Clover cycles; don't over-plan; fix in later cycles.

### Direction (cycle 3a: layout)
- **Topology finding.** With bedrooms on the court's S and W sides and open space on the N and E, the L's corner room (SW) has no frontage. So the SW belongs to the master suite (entered from the north end of the W arm), and the third bedroom sits at the far (east) end of the S arm. With the kitchen in the east centre, every bedroom door opens directly off open space and there are no corridors.
- **Plan ("pinwheel").** Dog-leg stair in the north centre (between grid lines B and C), with a 0.99 m hall strip along the court's north edge. The NW holds the master bath and the common bath (common bath door off the stair landing; one shared wet wall). The master suite runs W + SW (a wardrobe wall separates the dressing zone; court window). Parents on the S (court window, door east of the court), kids SE. A U kitchen sits east of the family space. Living + pooja cabinet NE (idols face W). On the ground: SW car bay behind a **sliding** timber gate (2.95 m), a porch with twin thinnai, and the main door facing west into the stair hall.
- **Structure.** Grid x A −5.70 · B −2.20 · C 2.19 · D 6.30; rows −4.25 · 1.465 · 4.25. Row 2 is the bedroom wing's north wall (the court's S edge); line B is the master's east wall (the court's W edge). Column C2 shifts 110 mm south to hide in the bedroom partition.

### Verification controls changed in cycle 3 (disclose to the owner)
- **Spans.** "Grid spans ≤ 5.0 m" became "grid spans ≤ 6.0 m and every beam span/depth ≤ 11". The 5.715 m north–south bays carry 230 × 550 beams; all others stay 230 × 450.
- **Verandahs.** "Verandahs wrap the court (≥ 3)" became the new brief: the court's open sides face the hall/family (≥ 0.95 m clear), and its other sides are bedroom walls with a court window (sill ≥ 0.85 m with a grille).
- **Gate.** "Swing leaves open inward" became "sliding leaf stays inside the compound, clears the opening, columns, furniture, recharge pit and silt trap". The clear width rule rose from 2.4 m to 2.7 m for a car.
- **Thinnai.** The flank rule now measures along the main door's own wall (the door faces west now).
- **Added:** car bay reachable by a 1.9 m wide car; counter sink/stove ranges must lie on their counter.

### Outcome log (cycle 3)
- **3a, local.** Validator: all checks pass (3,800+).
- **3a, browser review** found and fixed:
  - The hall and the gate yard were sealed off by the water point + column A2 + the parked car (the footwash moved to the porch).
  - The master was unreachable (the reading chair plus the wardrobe wall closed the dressing zone; master-bath fixtures left a 0.4 m gap).
  - A sink was floating in the court void because counter `sink`/`stove` are world ranges, not offsets (a validator check was added).
- **3a, published** (a5bb2c1). Actions "Validate courtyard walkthrough" and "pages build and deployment" both succeeded. The live site was checked in a real browser: no errors, 246 meshes, 7 doors, the new court and the sliding gate are served.

### Direction (cycle 3b: modern restyle; owner: "modern house with traditional values, not a traditional looking house")
Keep the values (court, cross-ventilation, jaali, thinnai, rainwater, natural materials). Drop the traditional *look*:
- iron bars and teak shutters
- sloped clay hoods
- clay coping tiles
- kaavi walls
- turned teak balusters
- striped fabrics

New palette:
- **Walls:** smooth white lime.
- **Stilt level:** board-formed concrete.
- **Floors:** honed light stone through the open half; warm terrazzo in the bedrooms.
- **Windows:** slim dark-aluminium frames with clear glass. Safety rails on the room side replace the iron grilles.
- **Shading and coping:** thin flat concrete chajjas; flat stone coping.
- **Joinery:** light oak flush doors; a grooved dark-teak main door.
- **Screens:** a timber-slat stair screen and transoms; terracotta *brick* jaali (hit-and-miss) outside.
- **Court guard:** black steel flats with an oak handrail.
- **Kitchen:** sage cabinets with a quartz top.
- **Furniture:** a low grey sofa; beds with linen headboards.

**Verification control changed (disclose):** the source checks for `addCopingTiles` and the plan label "Wall-top clay tiles" became `addCoping` and "Flat stone coping". COPING still has to cover the parapets, guards and the compound wall.

- **3b, published** (72178e5). Actions and Pages succeeded. The restyle made the scene lighter: 26.5k triangles, down from 35k (shutters, bars and clay tiles removed). Load time is unchanged at about 5.5 s.
- **3c (façade depth and details).**
  - Dark box frames project 280 mm around the main first-floor windows.
  - Exposed-concrete stilt columns, beams and slab soffit; plastered ceilings indoors.
  - Pendant lights over the breakfast counter, and a chimney hood whose duct rises to the high exhaust jaali.
  - The bounce colours are neutral now. A warm ground disc had tinted every ceiling tan.
  - The mobile view was checked at 412 × 915: the panel starts collapsed and the model fills the screen.

### Growth (cycle 3)
- **Decide quickly, then let the validator and the browser find the problems.** The topology analysis was worth doing once. After that, short build–look–fix loops found real issues that more analysis would have missed: blocked circulation, a misread data convention, the tan bounce light.
- **Data conventions must be checked, not remembered.** Counter `sink`/`stove` are world ranges; a validator rule now enforces it.
- **Close extra WebGL tabs before timing tests.** Two open walkthrough tabs tripled the local Playwright time (11 min against 3.8 min).
- **PowerShell `.Replace` with multi-line strings breaks on CRLF files.** Use a small Node script that normalises line endings, or the edit tool.

## Cycle 4 — owner direction (2026-11-23, 18:09)
"This is very old school. I asked for a modern house with traditional values." Plot clarified: the west road side is straight; only the NE corner is extended (S 46 ft, N 52 ft, W 33 ft). Push the columns out to the compound walls (16 columns, 4 × 4), use the 4 centre columns for the court, and make one simple straight stair on the north side rising west → east to a first-floor main door that opens into the hall. Of the 9 blocks around the court: 3 for hall + open kitchen + pooja, 4 for three bedrooms, 1 for the common bath. Good water, air and light flow.

### Decisions (cycle 4)
- **Plot.** A right trapezoid: W 33 ft straight (road), S 46 ft, N 52 ft, so E = √(33² + 6²) = 33′-6½″ (derived). Area 33 × (46 + 52) / 2 = **1,617 sq ft**, within 0.2 % of the stated 1,620. The earlier N 51 / E 33 brief could not reach 1,620 (max 1,596); 52 ft reconciles it. Survey must confirm.
- **Structure.** 16 columns on lines A −5.65, B −1.55, C 2.65, D 6.70 and rows −4.73, −1.15, 1.65, 4.73. Rows 1 and 4 and line D stand in (merge with) the compound walls. Line A is set in 1.2 m so a full-width west balcony projects to, but not over, the road boundary. C2, at the court's open corner, is a round exposed column; all others hide in walls. Every beam spans ≤ 4.2 m (230 × 450). The stairwell cuts line B's north beam, which cantilevers from B2 to pick up the stair trimmer. **A structural engineer must confirm this.**
- **Nine squares.** NW: common bath + utility lobby (shared basin) + terrace-stair pocket. N: hall + stair lane + entrance foyer. NE: living + closed oak pooja cabinet (idols face west). W: master bath + dressing. Centre: nadumuttam, 3.97 × 2.57 m, with a small SE landing for bedroom 2's door. E: open U kitchen. SW: master bedroom with a slider to the west balcony. S: bedroom 2. SE: bedroom 3.
- **Kitchen U.** It opens west to a walkway along the court. North leg: breakfast counter with stools (no dining table). East leg: stove under the high exhaust jaali. South leg: sink, with the fridge at the U's mouth.
- **Stair.** One straight stair in a 0.90 m lane along the north wall, 18 × 178 mm risers, 260 mm treads, two flights of 9 with a 0.90 m mid landing.
  - The main run climbs from the stilt garden to the foyer. The main door opens outward into the foyer.
  - The terrace run is stacked directly above, starting 0.92 m further east from a pocket off the utility lobby. Minimum headroom is 2.21 m.
  - It is a floating oak stair on a steel spine, with a terracotta-jaali wall behind it at ground level.
- **Gates.** A slatted oak car gate slides north behind the wall (2.7 m clear). A separate hinged front gate (1.0 m) opens inward, with a foot-wash tap. A straight entrance path leads to the stair foot and its thinnai bench.
- **Drainage.** The terrace drains through 9 scuppers into the court rain garden. A weir on its east edge feeds a channel to a silt trap and a recharge pit in the NE garden (the extended corner). The gate intercept was dropped because the balcony and first floor roof the front strip.
- **Airflow.** Low inlets: the master bedroom's south jaali and the stilts. High exhausts: the open court, the stair-head north jaali, and the kitchen and pooja east jaalis.

### Verification controls changed in cycle 4 (disclose to the owner)
- **Plot:** N, S and W must be exact. W must be straight, square to N and S. E is checked as derived. The area must be within 0.5 % of 1,620 sq ft. This replaces the four-exact-sides and Brahmagupta rules.
- **House in the plot:** "house ≥ 0.25 m from the compound wall" became "first floor (house + balcony) stays inside the plot line". The owner asked for columns on the compound walls.
- **Structure:**
  - 16 columns instead of 12.
  - An expressed (exposed) column may stand free of walls and rooms.
  - Beams must lie within the house or the balcony.
- **Stair rules** are rewritten for straight runs:
  - ≤ 15 risers per flight.
  - Mid, foot and top landings ≥ the flight width.
  - The slab openings end at the top riser.
  - Headroom ≥ 2.2 m including the stacked run.
- **Doors:**
  - The main door must open away from the room it serves.
  - Private rooms (the master dressing) open inward like bedrooms.
  - Sliding doors count as passable.
- **Circulation:**
  - The first-floor envelope includes the balcony.
  - Pedestrians are checked from the front gate, the car from the car gate, and two-wheelers from either gate.
  - The terrace-stair foot must be reachable.
  - **New:** every door leaf counts as open, so an open door may not block a route. This caught the common-bath door blocking the terrace stair.
- **Court and water:**
  - Court edges follow the L-shaped void.
  - Scuppers carry an explicit spout direction, which must point into the void.
  - The weir may sit on any basin edge.
- **Gates:** the car gate and front gate are checked separately. The front gate must open inward.
- **Thinnai:** one bench beside the stair foot. This replaces the twin thinnai flanking the main door, which is now on the first floor.
- **Plan labels:** "16 columns" and "Silt trap" replace "12 columns" and "Gate intercept".

### Outcome log (cycle 4)
- **4a (redesign).** `design.js` was rewritten from the brief, and the validator rules were updated. The first full run passed 5,264 checks. The builder, plans, walk and app shell were then adapted (straight runs, two gates, glass guards, balcony, slider, scuppers, new furniture).
- **Browser review.** Every viewpoint and all three plans were checked. Two walk-mode blockers were found and fixed:
  - the open common-bath door crossed the lobby; it is now hinged at the south jamb, and the validator rule above was added
  - the stair balustrade collider reached into the first-floor pocket; it now follows the flight
- **Polish:** a modern oak pooja cabinet, rugs, and a board-formed fin framing the balcony.

### Growth (cycle 4)
- **Move columns to the boundary and the plan opens up.** With the structure on the compound walls, the nine-square plan has no free-standing columns except the one deliberately exposed at the court.
- **Stacking straight runs needs exact numbers.** A 0.92 m offset gives 2.21 m headroom against a 2.20 m limit. The validator's headroom probe is what makes such a tight solution safe to keep.
- **Test with doors open.** A closed-door flood fill missed a real blockage. Treating every leaf as open is the stricter, more honest check.
- **Browser caches can serve stale ES modules even with no-store.** Disable the cache (CDP `Network.setCacheDisabled`) before re-checking a local fix.

## Open questions for the owner
1. Survey or FMB sketch: please confirm the north side (52 ft here; 51 ft in an earlier note), the derived east side (33′-6½″) and the corner angles.
2. Local setback and coverage rules. The first floor now reaches the compound-wall line on three sides, and the balcony reaches the road boundary. These need approval.
3. Structural confirmation of the cut line-B beam (a cantilever from B2 picking up the stair trimmer) and of the round exposed column C2.
4. `render/` and `media/` show an older house. Keep, archive or delete?
