# Form Studio · Vancouver Tall

A browser tool for shaping early tall-building concepts: start from a plan silhouette, drag taper and twist profiles, pick a structural expression (core and columns, diagrid or perimeter bracing), add terraces, podiums and shared sky spaces, and export the result to Rhino (`.3dm`), JSON or PNG.

**Use it online:** https://ruijieliu6.github.io/form-studio/

Made by Ruijie Liu, with AI assistance, for ARCH 540 (UBC SALA, fall 2026). Part of the [Vancouver Tower Toolbench](https://ruijieliu6.github.io/vancouver-tower-toolbench/).

## What this public copy leaves out

The original tool can show the Vancouver Tall Challenge's supplied 3D base model as context. That model belongs to the competition, so it is **not included here**. In *Competition model* mode you design on the brief's 144.78 × 79.248 m site without surrounding buildings. Choose **Vancouver site** to place the building on a real downtown parcel with City of Vancouver data and nearby context.

## Limits

This is a concept-stage study tool. Areas, heights and structural layouts are geometric; nothing here is a zoning, code, structural or feasibility assessment.

## Data and software

- City of Vancouver Open Data (property parcels, view cones), under the Open Government Licence – Vancouver.
- Street map tiles and building footprints from OpenStreetMap, © OpenStreetMap contributors (ODbL).
- Three.js and OrbitControls (MIT), rhino3dm (MIT), Leaflet (BSD-2-Clause), Barlow font (SIL OFL). Licence texts are in `vendor/`.

## Run it locally

Any static web server works, for example `python3 -m http.server 8000` in this folder, then open http://localhost:8000.
