# Courtyard Home — Design Review & Completion Log

This file tracks the conceptual 3D model. It is not a construction drawing or structural approval.

## Clover cycle

Each pass follows **Context → Direction → Action → Success → Growth**. Repeat until the model is internally consistent, then perform one final whole-house review.

### Pass 1 — Context and direction
- [x] Preserve the 1,620 sq ft west-road plot concept and three-level arrangement.
- [x] Keep the nadumuttam open to sky and the terrace predominantly open.
- [x] Keep the west-side solar array clear of the new east service eave.
- [x] Use a restrained natural palette: local rubble stone, lime finish, natural stone floors, terracotta and reclaimed timber.

### Pass 2 — Roof and rainwater
- [x] Replace broad terrace roof wings with one selective east service eave.
- [x] Set the eave fall toward its east collection gutter.
- [x] Align gutter, downpipe and first-floor south-east balcony channel.
- [x] Connect the terrace east collector into the eave gutter at the downpipe drop.
- [x] Extend the downpipe to the ground-level inspection chamber and recharge garden.
- [x] Keep the central open-to-sky courtyard unobstructed.
- [x] Connect the courtyard-tree basin overflow to the planted recharge garden with a visible surface channel.
- [ ] Confirm real roof catchments, gradients, gutter/downpipe sizing, overflow and recharge capacity with a local engineer after site levels and rainfall design data are known.

### Pass 3 — Compound wall and materials
- [x] Add a hand-laid irregular local-stone character to the compound wall.
- [x] Keep the west entrance opening clear.
- [x] Clarify the material legend and reduce the visible palette to a small set of natural finishes.
- [ ] Confirm locally available stone type, block sizes, reclaimed timber condition and final floor finish samples before procurement.

### Pass 4 — Openings, comfort and usability
- [x] Retain north, south, west and east window/jaali openings already represented in the model.
- [x] Retain chajjas above exposed first-floor openings.
- [x] Retain terrace jaali screens and open courtyard ventilation.
- [ ] Review daylight, privacy, cross-ventilation and wind-driven rain on site with actual orientation, neighboring buildings and seasonal wind data.
- [ ] Walk through every room and verify door swings, furniture clearances, stair comfort, child safety and maintenance access against measured dimensions.

### Pass 5 — Final review and release
- [x] Run source-level review of the roof/eave, solar, compound wall, balcony drain, downpipe and recharge geometry references.
- [x] Add compass-plan indicators for the east eave, ground collector channels and recharge garden.
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
- [ ] Check rendered geometry for clashes, gaps, floating objects and incorrect labels.
- [ ] Verify drainage visually and confirm no ponding or road discharge is implied.
- [ ] Verify the published GitHub Pages build after the final commit; automated page access was unavailable during this review.
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
| Selective roof/eaves | Terracotta clay tiles with reclaimed timber |
| Jaali and screens | Terracotta; reclaimed timber where suitable |
| Terrace | Weatherproof sloped finish with accessible drainage and planted beds |

## Current rainwater concept

1. Selective east eave drains to the east gutter and terrace east collector.
2. Terrace collector joins the gutter at the east service downpipe.
3. South-east first-floor balcony channel joins the same downpipe.
4. Downpipe discharges into a covered ground-level inspection chamber.
5. Chamber is adjacent to the planted recharge garden and connected ground channel.
6. The open courtyard-tree basin overflow now has a separate visible surface channel to the recharge garden.
7. North perimeter collector turns down the east edge; final gradients, separation of clean roof water from greywater, and overflow must be designed from actual levels.

## Important limitations

- Model dimensions and structure are conceptual; no structural calculations, soil data, foundation design or approval drawings are included.
- Surface channels are illustrative. A 3D blue strip does not prove a workable gradient or hydraulic capacity.
- Confirm setbacks, FSI, height, stilt use, fire access, rainwater-harvesting requirements and local planning rules for the actual site before construction.
