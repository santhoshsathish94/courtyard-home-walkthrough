# Courtyard Home — Design Review & Completion Log

This file tracks the conceptual 3D model. It is not a construction drawing or structural approval.

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

### Pass 5 — Final review and release
- [x] Run source-level review of the wall-top tile caps, SW low-level inlets, high-level exhausts, entrance gate, surface drains and recharge geometry.
- [x] Add compass-plan indicators for wall-top tile caps, ground surface channels and recharge garden.
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
- [ ] Obtain architect/structural/civil review before treating the model as buildable.

## Critical dimension check before any build-ready review

The UI labels the plot as **W33 · S46 · E33 · N51 ft** and **1,620 sq ft**, while the current 3D compound-wall envelope is approximately **16.7 m × 11.2 m** (about **2,020 sq ft** as a bounding rectangle). The model footprint and room proportions therefore must not be treated as dimensionally validated. Reconcile the actual four boundary lengths, corner angles/setbacks and surveyed plot area before resizing or issuing plans; do not distort the current room layout by guessing.

## Current conceptual material map

| Zone | Proposed finish |
|---|---|
| Compound wall | Locally sourced rough rubble stone with simple coping |
| Main interior floors | Kadappa / Kota-type natural stone |
| Wet and selected balcony zones | Shahabad or another suitable slip-resistant natural stone |
| Walls | Lime-finish plaster |
| Exposed service-wall tops | Individual terracotta clay tiles on short holders directly above the wall |
| Jaali and screens | Terracotta; reclaimed timber where suitable |
| Terrace | Weatherproof sloped finish with accessible drainage and planted beds |

## Current rainwater concept

1. Individual clay tiles sit directly on short holders at the top of the exposed east service wall; there is no continuous roof deck, long rafter frame, fascia, overhead gutter or tall downpipe.
2. Tile holders now sit at the terrace parapet top (0.95 m above terrace level). Rain falls directly from the outward-sloping tile edges onto the exterior splash apron and shallow east surface channel.
3. The north collector falls east into the east-side channel; the east channel falls south into a short branch to the south-east recharge garden. The courtyard overflow has a separate shallow fall toward the same garden.
4. First-floor balcony and courtyard sill channels remain illustrative local surface drains; their actual discharge and separation from greywater must be designed from surveyed levels.
5. Final falls, channel cross-sections, splash control, overflow route and recharge capacity must be verified with site levels and local rainfall data.

## Important limitations

- Model dimensions and structure are conceptual; no structural calculations, soil data, foundation design or approval drawings are included.
- Surface channels are illustrative. A 3D blue strip does not prove a workable gradient or hydraulic capacity.
- Confirm setbacks, FSI, height, stilt use, fire access, rainwater-harvesting requirements and local planning rules for the actual site before construction.
