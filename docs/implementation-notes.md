# Implementation Notes

## 2026-08-09

### Architecture Baseline

- Added `docs/current-game-architecture.md`.
- Documented current entry points, game-state ownership, render flow, input flow, persistent data candidates, risks, and target architecture.

### Startup / Settings

- Changed default startup so `/` enters the game prototype.
- Kept planet viewer available through `?view=planet`; `?game=0` remains a compatibility/debug escape hatch.
- Added `GameSettings`, `SettingsRepository`, `LocalSettingsRepository`, and `SettingsStore`.
- Added top-right Settings UI with renderer, quality, post-processing toggles, render scale, UI toggles, UI scale, and developer link to Planet Viewer.
- Renderer and post-processing settings are read at startup from the central settings store.

### Post-Processing

- Fixed Three r185 SSR options usage and avoided `float(null)`.
- Made GTAO, SSR, Bloom, and exposure profiles more restrained.
- Changed AO application from full multiplication to strength-controlled blending.
- Changed SSR contribution to be opacity-scaled before adding it to the working color.
- Tuned the PostProcessing profiles down again after visual inspection: less SSR reach/opacity, tighter Bloom thresholds, lower Bloom strength, and neutral exposure.
- Reduced the PostProcessing Feature Lab emissive/light defaults so the test scene exercises Bloom without forcing an artificial glow field.
- Changed SSR material assumptions from mirror-like to rough/subtle reflections and raised SSR resolution scales to reduce blocky plane reflections.

### Combat VFX

- Added separate visual handling for beam weapons and launcher weapons.
- Frigates use railgun-style turret fire; carriers use missile/launcher-style projectiles.
- Launcher projectiles use launcher muzzle nodes and do not rotate yaw turrets.
- Added Feature Lab carrier launcher pods with `launcher_muzzle` nodes for isolated combat testing.

### Singleplayer Persistence Foundation

- Added `PlayerProfile`, `PlayerResources`, `ResearchState`, `StoryProgress`, and `PersistentGameState`.
- Added `PlayerRepository` and `GameWorldRepository` interfaces with localStorage implementations.
- Added `loadOrCreateSingleplayerState()` bootstrap.
- Added `generateSingleplayerHomeRegion()` to create five persistent player-owned systems:
  - Home System
  - Resource System
  - Research Reach
  - Frontier Line
  - Outer System
- Wired `GamePrototypeScene` to accept an initial world and periodically report world changes for local saving.

### Verification

- Build/tests intentionally not run after the PhpStorm crash recovery, per user request.

### Feature Lab Foundation

- Added `?view=test` startup mode for an isolated development Feature Lab.
- Added common scene interface, context, registry, lab navigation, scene switching, pause/time-scale controls, reset, and health-status reporting.
- Added shared debug primitives for lines, points, labels, bounding boxes, and cleanup.
- Expanded the Model Viewer to inspect real `/models` assets (`frigate.glb`, `orbital_hanger.glb`, `capital_ship.obj`) plus dummy ships and dummy stations.
- Model Viewer now loads GLB/OBJ assets, normalizes scale, shows bounds, reports mesh/triangle/node counts, and labels interesting nodes such as turret, muzzle, launcher, engine, spawn, dock, and rally nodes.
- Added per-asset orientation overrides in the Model Viewer; `capital_ship.obj` now uses the same X-axis rotation and Z mirror as the runtime Capital Ship while `frigate.glb` stays unchanged.
- Added a local axis overlay to the Model Viewer: cyan is game forward (`-Z`), green is up (`+Y`), red is right (`+X`).
- Replaced the old cone nose on dummy ship models with a short tapered bow mesh so fallback ships read less like a box with a pyramid stuck on the front.
- Planet LOD test now exposes all `PlanetClass` values through a class dropdown: barren, rocky, terrestrial, ocean, desert, ice, lava, toxic, carbon, metal_rich, gas_giant, ice_giant.
- Aligned planet WebGL/WebGPU render inputs by using the same default ambient/exposure tuning instead of brightening WebGPU separately.
- Fixed atmosphere profile propagation so both WebGL and WebGPU receive atmosphere color and semantic palette values.
- Lava planets now force the `lava` atmosphere palette and a red atmosphere tint through the shared `PlanetRenderProfile` path.
- Reduced WebGL/WebGPU lava atmosphere divergence by using the same lava alpha/scattering/opacity factors in both atmosphere layers.
- Reviewed the climate system in `docs/climate-system-review.md`.
- Cloud layers now receive generated climate cloud persistence, storm activity, wind strength, and ash load from `PlanetRenderProfile`.
- WebGL and WebGPU cloud profiles now use the same effective coverage/density/alpha calculation from those climate values.
- Planet LOD test now displays generated climate values for the selected class/seed.
- Added initial registered scenes:
  - Model Viewer
  - Turret Tracking
  - Engine VFX
  - Ship vs Ship Combat
  - Planet LOD
  - PostProcessing
- Added direct startup support such as `?view=test&scene=combat-turret-tracking`.
- Added Settings developer link to Feature Lab.
- Test scenes use existing production systems where available:
  - `CombatVfxSystem`
  - `EngineVfxSystem`
  - `FleetSimulation`
  - `Planet`
- Feature Lab uses isolated in-memory state and does not write to `PlayerProfile` or persistent singleplayer saves.
