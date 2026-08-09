# Current State Summary for ChatGPT

## Project Context

Three.js/WebGPU prototype is being moved toward a persistent singleplayer game foundation with optional future PvE/PvP lobby architecture. Current work focuses on stabilization, settings, persistence foundations, Feature Lab test scenes, asset inspection, combat VFX, engine VFX, and restrained post-processing.

## Startup Flow

- `/` starts the normal game directly.
- `/?view=planet` starts the planet/debug viewer.
- `/?view=test` starts the Feature Lab.
- Direct Feature Lab scene startup works, for example:
  - `/?view=test&scene=ship-model-viewer`
  - `/?view=test&scene=combat-turret-tracking`
  - `/?view=test&scene=ship-engine-vfx`

## Settings / Persistence

- Added central settings store in `src/game/settings/GameSettings.ts`.
- Settings UI is top-right via `src/game/ui/SettingsMenu.ts`.
- Settings use localStorage.
- Added dummy local player/profile persistence:
  - `src/game/domain/PlayerProfile.ts`
  - `src/game/persistence/PlayerRepository.ts`
  - `src/game/persistence/SingleplayerBootstrap.ts`
- Singleplayer bootstrap creates five persistent owned systems.

## Feature Lab

Feature Lab foundation exists under `src/game/dev/`.

Registered scenes:

- Model Viewer
- Turret Tracking
- Engine VFX
- Ship vs Ship Combat
- Planet LOD
- PostProcessing

The lab uses isolated in-memory state and should not write to persistent singleplayer saves.

## Model Viewer

File: `src/game/dev/scenes/ships/ShipModelTestScene.ts`

The Model Viewer can inspect:

- Real assets:
  - `/models/frigate.glb`
  - `/models/orbital_hanger.glb`
  - `/models/capital_ship.obj` + `.mtl`
- Dummy ships:
  - frigate, carrier, fighter, constructor, scout
- Dummy stations:
  - shipyard, shipyard_small, shipyard_large, refinery, research, headquarters

It normalizes scale, centers models, shows bounding box, counts meshes/triangles/nodes, and labels interesting nodes like turret, muzzle, launcher, engine, spawn, dock, rally.

Important orientation detail:

- `frigate.glb` is already correct.
- `capital_ship.obj` needs per-asset orientation correction in the viewer:
  - `rotation.x = Math.PI * 0.5`
  - `mirrorZ = true`

## Dummy Models

File: `src/game/rendering/DummyAssetFactory.ts`

- Dummy ship front was changed from a four-sided cone/pyramid to a short tapered bow mesh.
- This affects all dummy ship fallback models.
- Real GLB/OBJ assets should still be exclusive when present; dummy meshes are fallback/debug only.

## Combat VFX

File: `src/game/rendering/CombatVfxSystem.ts`

- Combat VFX now differentiates beam weapons and launcher weapons.
- `laser` and `railgun` use yaw turret tracking and beam/line effects.
- `missile` and `rocket` use launcher muzzle nodes and do not rotate yaw turrets.
- Supported launcher node names include:
  - `launcher_muzzle`
  - `rocket_muzzle`
  - `launcher_01_muzzle`
  - `rocket_muzzle_01`
  - `missile_muzzle_01`

Weapon mapping in `src/game/simulation/FleetSimulation.ts`:

- carrier -> `missile`
- frigate -> `railgun`
- fighter/scout/constructor -> `laser`

Ship vs Ship Combat test currently uses Carrier vs Frigate so both missile and railgun VFX are visible.

## Engine VFX

File: `src/game/rendering/EngineVfxSystem.ts`

- Engine VFX prefers real engine nodes named `engine_01`, `engine_02`, etc.
- Fallback engine points are only used when no engine nodes exist.
- Plumes were changed to textured planes instead of visible cone shapes.
- Effects were tuned more subtle.

## PostProcessing

File: `src/postprocessing/PostProcessingPipeline.ts`

- Fixed Three r185 SSR `float(null)` crash by using SSR options object with concrete nodes.
- GTAO, SSR, Bloom, and exposure were tuned down.
- SSR material assumptions changed from mirror-like to rough/subtle:
  - lower metalness
  - higher roughness
  - higher SSR resolution scale to reduce blocky plane reflections
- Bloom is intended only for bright emissive details, not large glow fields.

PostFX test scene:

- `src/game/dev/scenes/rendering/PostFxTestScene.ts`
- Emissive and lighting defaults were reduced after visual inspection.

## Planet LOD Scene

File: `src/game/dev/scenes/planets/PlanetLodTestScene.ts`

The Planet LOD scene has a planet class dropdown covering all current `PlanetClass` values:

- barren
- rocky
- terrestrial
- ocean
- desert
- ice
- lava
- toxic
- carbon
- metal_rich
- gas_giant
- ice_giant

## Planet WebGL/WebGPU Alignment

Files:

- `src/planet/Planet.ts`
- `src/planet/rendering/PlanetRenderProfile.ts`
- `src/planet/AtmosphereLayer.ts`
- `src/planet/WebGPUAtmosphereLayer.ts`

Current alignment work:

- WebGL and WebGPU planets now use the same default ambient/exposure tuning.
- Atmosphere color and semantic atmosphere palette are passed to both WebGL and WebGPU atmosphere layers.
- Lava planets force the `lava` atmosphere palette and a red atmosphere tint.
- WebGL/WebGPU lava atmosphere alpha, scattering and opacity factors were aligned.

## Known Open Visual Issues / Next Work

- Continue checking model forward consistency across real assets and dummy assets.
- Add more direct weapon test scenes:
  - Railgun test
  - Rocket launcher test
  - Multi-turret test
- Add launcher nodes to real assets later.
- Improve actual ship GLB node conventions:
  - `turret_01_yaw`
  - `muzzle_01`
  - `engine_01`
  - `launcher_01_muzzle`
- SSR on flat planes is improved but should still be visually reviewed in browser.
- Build/tests were intentionally not run recently per user request.
