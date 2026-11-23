# Courtyard Home — Design Review & Completion Log

This file tracks the conceptual 3D model. It is not a construction drawing or structural approval.

> **Status (Pass 6, 2026-11-23):** the model has been re-fitted to the real plot geometry and rebuilt from one design-data file.
>
> **Data and consumers:** `src/design.js` holds the design data. The 3D model, plans, walk collision and an automated validator all read from it.
>
> **History:** Passes 1–5 below are kept as history. Items in them that refer to the old 16.7 × 11.2 m envelope (the east service-wall tiles, the SE recharge garden and the stair-landing column) are superseded by Pass 6.
>
> **Where to look:** the handoff record is `CONTEXT.md`.

## Clover cycle

Each pass follows **Context → Direction → Action → Success → Growth**. Repeat until the model is internally consistent, then perform one final whole-house review.

### Pass 1 — Context and direction
- [x] Preserve the 1,620 sq ft west-road plot concept and three-level arrangement.
- [x] Keep the nadumuttam open to sky and the terrace predominantly open.
- [x] Keep the west-side solar array clear of the exposed east-wall tile caps.
- [x] Use a restrained natural palette: local rubble stone, lime finish, natural stone floors, terracotta and reclaimed timber.

### Pass 2 — Roof and rainwater
- [x] Remove the continuous east roof deck, long rafters, fascia, overhead gutter and tall downpipe.
- [x] Replace them with individual clay-tile rain caps resting directly on the exposed east service wall, supported by short local holders.
- [x] Set tile-holder elevation to the actual 0.95 m terrace parapet top rather than the erroneous first-floor wall height.
- [x] Keep the terrace predominantly open and the central nadumuttam unobstructed.
- [x] Route rain from the wall-top tile edge directly outward to a shallow exterior stone drip channel and splash apron.
- [x] Remove the redundant terrace perimeter gutter run; retain only the small open-courtyard sill channel.
- [x] Add subtle visible falls to surface-water runs so water is not represented as a flat stagnant strip.
- [x] Correct drainage fall orientation: north collector falls east, east collector falls south, and courtyard overflow falls toward the recharge garden.
- [x] Join the north and east surface channels at the north-east corner and add a falling branch into the recharge garden.
- [x] Overlap the east-to-recharge branch with its collector and match the courtyard overflow branch start level to its upstream channel outlet.
- [x] Remove a duplicated terrace courtyard channel and replace flat blue strips with sloped water surfaces where the run has a defined direction.
- [x] Connect the courtyard-tree basin overflow to the planted recharge garden with a shallow surface channel.
- [ ] Confirm exposed wall locations, tile projection, surface-channel falls, splash control, overflow and recharge capacity with a local engineer after site levels and rainfall design data are known.

### Pass 3 — Compound wall and materials
- [x] Add a hand-laid irregular local-stone character to the compound wall.
- [x] Keep the west entrance opening clear.
- [x] Clarify the material legend and reduce the visible palette to a small set of natural finishes.
- [ ] Confirm locally available stone type, block sizes, reclaimed timber condition and final floor finish samples before procurement.

### Pass 4 — Openings, comfort and usability
- [x] Add a dedicated low-level terracotta-jaali inlet at the south-west corner of the first-floor plan.
- [x] Add high-level jaali exhaust openings at the north side and stairwell to express warm-air escape above occupied level.
- [x] Rework breeze-path particles to show low SW entry, cross-room movement and rising exhaust; route the particles to the actual north and south high-level openings. Keep this as a conceptual airflow illustration, not CFD.
- [x] Add matching low-inlet and high-exhaust markers and airflow direction note to the first-floor compass plan.
- [x] Add rain hoods above the low SW inlet and high-level exhausts without closing the jaali openings.
- [x] Keep existing shaded window openings and courtyard void; preserve daylight and cross-ventilation paths.
- [x] Add two visibly hinged inward-opening timber gate leaves and stone gate piers at the west-road compound entrance.
- [x] Add small projecting rain hoods directly above the SW low-level inlet and both high-level exhaust openings.
- [ ] Check inlet/outlet free area, insect screens, rain protection, privacy and actual prevailing wind with an architect on site.
- [ ] Review daylight, privacy, cross-ventilation and wind-driven rain with actual neighbouring buildings and seasonal wind data.
- [ ] Walk through every room and verify door swings, furniture clearances, stair comfort, child safety and maintenance access against measured dimensions.
- [ ] Check stair riser/tread dimensions, landing headroom, handrails/guards and the full circulation route in a browser walkthrough; current stair geometry is conceptual only.

### Pass 5 — Final review and release
- [x] Run source-level review of the wall-top tile caps, SW low-level inlets, high-level exhausts, entrance gate, surface drains and recharge geometry.
- [x] Add compass-plan indicators for wall-top tile caps, ground surface channels and recharge garden.
- [x] Align ground-plan north/east channel extents with the 3D geometry and show the SE branch plus courtyard overflow/recharge link.
- [x] Display all four stated boundary side lengths and label the boundary geometry as schematic, not surveyed.
- [x] Compile-check the module script after removing its three import declarations; JavaScript syntax passed.
- [x] Restore desktop mouse-look when the user clicks the canvas after Escape releases pointer lock; clear held movement on window blur.
- [x] Restore browser pinch-zoom accessibility by removing the restrictive viewport scale lock.
- [x] Add a GitHub Actions workflow to run source validation on pushes and pull requests.
- [x] Execute the automated GitHub Actions source-validation workflow successfully on the corrected validator revision.
- [x] Add a Node-based source validator for duplicate IDs, DOM references, module syntax and key design/interaction invariants.
- [x] Prevent Walk-mode keyboard controls from hijacking focused buttons and form controls; prevent movement keys from scrolling the page.
- [x] Make the Layers & Sun control a semantic button with an announced expanded/collapsed state.
- [ ] Inspect orbit, walk and plan modes at ground, first-floor and terrace levels in a real browser.
- [ ] Check rendered geometry for clashes, gaps, floating objects and incorrect labels, especially the 12-column grid against stair and courtyard openings.
- [ ] Verify drainage visually and confirm no ponding or road discharge is implied.
- [ ] Verify the published GitHub Pages build after the final commit; automated page access was unavailable during this review.
- [x] Show the 3 × 4 conceptual column grid on the ground plan, highlighting the centreline positions for review.
- [ ] Resolve structural coordination: the 12-column grid places centreline columns at the courtyard edge and stair opening; verify these against actual slab openings and stair geometry before accepting the beam layout.
- [x] Identify and flag the definite conceptual clash at the ground-floor stair landing: the centre column at (X=0, Z=4.85) intersects the landing footprint. Keep the column as an unresolved warning marker; do not move or remove it without a coordinated structural redesign.
- [ ] Obtain architect/structural/civil review before treating the model as buildable.

### Pass 6 — Re-fit to the real plot and single-source rebuild (2026-11-23)
- [x] Reconciled the plot.
  - No four-sided plot with sides N 51, S 46, W 33 and E 33 ft can reach 1,620 sq ft; the maximum is 1,595.9 sq ft.
  - The model keeps all four sides exact as a trapezoid with N parallel to S, which is also the maximum-area case.
  - The UI and plans disclose this and label the corner angles as unsurveyed.
- [x] Removed the invented land.
  - The compound wall now follows the real boundary.
  - The first floor is re-fitted to 12.30 × 8.80 m (108 m²) with 0.6–1.9 m margins.
- [x] Resolved the structure.
  - There are 12 columns on a 4 × 3 grid (spans ≤ 4.8 m).
  - The columns are sized 230 × 450 mm to hide inside the walls.
  - No column stands in the court or stair.
  - No beam crosses either opening; trimmers frame both.
  - The old stair-landing column clash and the beam crossing the stairwell are gone, and the validator now rejects both regressions.
- [x] Rebuilt the stair: a dog-leg of 18 × 178 mm risers, 270 mm treads (2R+T 626 mm) and 0.90 m flights, with a 1.35 m mid landing.
  - Computed headroom is ≥ 2.45 m on every flight and landing.
  - A terracotta jaali spine carries the handrails.
- [x] Rooms meet common minimum sizes.
  - The library becomes an alcove, because the real plot cannot hold a separate room.
  - Bath doors open outward. Bedroom doors open inward and rest against a wall.
  - The main door opens outward.
  - Furniture keeps every doorway approach clear, and every room is reachable (checked by flood-fill with body clearance).
- [x] Airflow is now data-driven.
  - Low SW jaali inlets (with rain hoods) feed five paths. Each passes only through real openings and exits high: the court sky, the stair-head jaali, and the high E jaalis of the parents' room and pooja.
- [x] Rain is now data-driven.
  - The terrace falls to the court; eight scuppers drop rain into the court rain garden.
  - The overflow weir feeds a stone channel and silt trap, ending at a recharge pit in the NW yard.
  - A grated intercept inside the gate means no water reaches the road. All channels fall at 1:96 to 1:121.
- [x] Child safety:
  - 1.0 m guards with balusters less than 100 mm apart
  - planters kept ≥ 0.6 m from guards
  - a 1.8 m jaali screen where the washer stands against the parapet
  - safety bars on low windows
- [x] The validator was replaced. The old one pinned exact source coordinates. The new `scripts/checks.mjs` checks every earlier intent semantically, plus many new ones. Mutation tests (`tests/validator.test.mjs`) prove it rejects 18 known regressions.
- [x] Browser tests: Playwright drives the real UI in desktop and phone emulation. They cover:
  - loading
  - the gate → stair → first floor → terrace walk
  - doors
  - plans
  - overlays
  - keyboard and touch walking
- [x] three.js is vendored, so the site has no CDN dependency.
- [x] Inspected orbit, walk and plan modes at ground, first-floor and terrace levels in a real browser, and fixed the issues found:
  - missing furniture
  - a clipped sky
  - overlapping plan labels
  - a frame-rate-dependent walking speed
- [ ] Professional review (unchanged): site survey or FMB sketch, setbacks, soil and percolation tests, structural design, drainage sizing and approvals.

### Pass 7 — North stair, half-open first floor, three-bedroom "L" (cycle 3a, 2026-11-23)
Owner's brief: stairs on the north (vastu), a SW entrance and car parking, a half-open first floor (small pooja, open living, open kitchen with a U counter, no dining table), three bedrooms in the S + W "L" with no corridors, and a court open to the hall/stair/kitchen whose other walls are bedroom walls with windows. Top priority: **modern house with traditional values, not a traditional-looking house** (styling is the next pass).

- [x] **Topology.** The L's corner (SW) has no frontage on open space, so it belongs to the master suite. The suite is entered from the north end of the W arm via the hall strip, and a wardrobe wall divides the dressing zone. The third bedroom (kids) takes the east end of the S arm; the kitchen moves to the east centre. Every bedroom door opens off the open space.
- [x] **Stair.** Dog-leg in the north centre, between grid lines B and C. The floor landing is at the west end on every storey; the common bath opens off it, and a 0.99 m hall strip runs along the court's north edge.
- [x] **Court.** 2.94 × 2.40 m. Its W edge is the master's wall (court window) and its S edge is the parents' wall (2.4 m court window). The N and E sides have a 1.0 m teak guard facing the hall and the family/kitchen space. The validator encodes this rule.
- [x] **Kitchen.** U with its mouth facing north. West leg = breakfast counter with three stools (faces the family space and the court); south leg = sink + fridge (SW corner); east leg = stove under the high exhaust jaali (the cook faces east).
- [x] **Living + pooja (NE).** The pooja is a closed teak cabinet with jaali doors, the idols facing west, and an exhaust jaali above it on the east wall.
- [x] **Ground.** Car bay under the master suite. A 2.95 m sliding reclaimed-timber gate (swinging leaves would hit columns A2/A3 and the car). Two-wheelers under the master's north half. A porch with twin thinnai and a foot-wash in front of the west-facing main door.
- [x] **Structure.** Grid x A −5.70 · B −2.20 · C 2.19 · D 6.30; rows −4.25 · 1.465 · 4.25. The court's W and S edges are primary beams (line B, row 2); trimmers frame the N/E edges and the stair. The 5.7 m bays use 230 × 550 beams (span/depth ≤ 11). Column C2 is shifted 110 mm to hide in the bedroom partition.
- [x] **Verification.** The validator (3,800+ checks) and mutation tests (23 regressions, including the new rules) pass. Playwright, desktop + phone: 18/18. The walk route now goes road → gate → front yard → between the thinnai → main door → stair → first-floor hall → terrace.
- [ ] Modern restyle (Pass 8): material palette, openings, railings, furniture.

### Pass 8 — Modern house, traditional values (cycle 3b)
- [x] **Windows.** Slim dark-aluminium frames with mullions, clear glass and stone sills; safety rails on the room side for low and court-facing windows. No iron bars or teak shutters.
- [x] **Shade and wall tops.** Thin flat concrete chajjas (no sloped clay hoods) and flat granite coping on the parapets, guards and compound wall (no clay coping tiles).
- [x] **Surfaces.** Smooth white lime walls. Board-formed concrete on the stilt-level stair hall and the thinnai. Honed light stone floors through the open half, warm terrazzo in the bedrooms, large light tiles in the baths.
- [x] **Joinery.** Flush light-oak doors with slim dark pulls, and a grooved dark-teak main door. Oak slat screen at the stair, slat transoms indoors, terracotta brick jaali (hit-and-miss) outside.
- [x] **Court guard.** Black steel flats, oak handrail, light stone kerb.
- [x] **Furniture.** Sage flat-front kitchen with a quartz top and an oak breakfast counter; low grey sofa; oak beds with linen headboards; flat oak wardrobes; oak and cane chairs. The pooja cabinet stays teak.
- [x] **Façade depth (cycle 3c).** Dark box frames around the main windows; exposed-concrete stilt columns, beams and soffit; pendants over the breakfast counter and a chimney hood; neutral bounce light so ceilings read white.
- [ ] Next: west-facing shading fins, lighting moods, richer landscape on the stilt level.

## Critical dimension check before any build-ready review

**Resolved in Pass 6.** Before, the compound wall was 16.7 × 11.2 m (about 2,020 sq ft), larger than the plot.

**Now:** the boundary is drawn from the four supplied side lengths. It is a trapezoid of 1,595.9 sq ft with N parallel to S, and the house fits inside it with margins.

**Still unknown:** the supplied area (1,620 sq ft) cannot coexist with those sides. Confirm the actual side lengths, corner angles and surveyed area before any build-ready drawings. The design data has one place to change the boundary: `PLOT` in `src/design.js`. The validator then re-checks fit, margins, drainage and circulation.

## Current conceptual material map

| Zone | Proposed finish |
|---|---|
| Compound wall | Local rubble stone with a flat granite coping; granite gate piers; sliding reclaimed-teak batten gate on a steel track |
| Stilt level and stair | Board-formed concrete stair hall and thinnai (black granite seats); honed light stone paving; stone treads; granite column bases |
| Rooms | Honed light stone through the open half (hall, living, family, kitchen); warm terrazzo in the bedrooms; large light tiles in the baths |
| Walls and ceilings | Smooth white lime plaster |
| Jaali and screens | Terracotta brick jaali, hit-and-miss (exterior vents, low inlets, stair spine, wash screen); oak slat screen at the stair; slat transoms and pooja-cabinet doors |
| Terrace | Terracotta pavers falling to the court; flat stone coping on parapets; thin concrete wash canopy |
| Joinery and windows | Flush light-oak doors and a grooved dark-teak main door; slim dark-aluminium windows with clear glass and room-side safety rails; thin flat concrete chajjas |

## Current rainwater concept

1. The terrace finish rises 60 mm from the court guard to the parapets (≥ 1:100), so rain runs to the open court.
2. Eight clay scuppers in the court guard drop rain into the court rain garden, a permeable planted basin 0.10 m below grade.
3. Overflow passes a weir on the west kerb. It then runs through a shallow stone channel west (1:121), north through the grated intercept, then the silt trap, then the recharge pit in the NW yard.
4. A grated channel inside the west gate intercepts yard runoff before the road. No water discharges to the road. There are no downpipes or gutters.
5. Channel sections, pit size and its distance from footings (currently ≥ 1.0 m from column centres) must be confirmed with rainfall data and soil percolation tests.

## Important limitations

- Model dimensions and structure are conceptual. There are no structural calculations, soil data, foundation design or approval drawings.
- The validator checks design consistency and common good-practice rules. It does not check code compliance or engineering adequacy.
- Airflow paths are illustrative, not CFD. Drainage falls are shown, but hydraulic capacity is not designed.
- Confirm the following for the actual site before construction:
  - setbacks, FSI and height
  - stilt use and fire access
  - rainwater-harvesting requirements
  - local planning rules
