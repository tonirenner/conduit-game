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

## Fleet Move Commands

Files:

- `src/game/rendering/GamePrototypeScene.ts`
- `src/game/simulation/FleetSimulation.ts`

Current behavior:

- Right-click in SystemView creates the Homeworld-style move draft again.
- Mouse wheel changes draft height.
- Enter confirms the draft and issues the move command.
- Fleet move commands clear stale per-ship order overrides for the ships in that fleet.
- This fixes cases where Home Fleet showed a fleet move order but some/all ships ignored it because older individual ship overrides still existed.

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
- In the normal game, Combat VFX no longer rotates the whole ship toward targets; movement/render sync owns ship orientation, Combat VFX only aims turret nodes.
- Frigate GLB muzzle names like `turret_01_muzzle_left` / `turret_01_muzzle_right` are recognized as beam origins.
- Supported launcher node names include:
  - `launcher_muzzle`
  - `rocket_muzzle`
  - `launcher_01_muzzle`
  - `rocket_muzzle_01`
  - `missile_muzzle_01`
  - `rocket_launcher_01`

Weapon mapping in `src/game/simulation/FleetSimulation.ts`:

- carrier -> `missile`
- frigate -> `railgun`
- fighter/scout/constructor -> `laser`

Ship vs Ship Combat test currently uses Carrier vs Frigate so both missile and railgun VFX are visible.

## Engine VFX

File: `src/game/rendering/EngineVfxSystem.ts`

- Engine VFX prefers real engine nodes and now recognizes names like `engine_01`, `engine_main_01`, and `Engine_-1.65`.
- Fallback engine points are only used when no engine nodes exist.
- Frigate GLB engine VFX now uses the real `engine_main_01` node instead of the old bounds fallback.
- Engine plume direction is derived away from the local ship/model center, so Frigate exhaust at negative local Z emits backward instead of into the hull.
- Engine anchors use the outer side of an engine mesh/node bounding box, not only the node origin.
- Existing fallback VFX can be replaced when a higher-quality async real model/node layout becomes available.
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
- Latest tuning lowered High/Ultra SSR opacity and distance again, and tightened Bloom thresholds/strength.
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

Planet LOD now displays scale diagnostics:

- real physical radius in km
- lab render radius and km per render unit
- SystemView/game render radius and km per render unit
- visual compression multiplier versus raw `1 render unit = 1 km`

The shared SystemView planet radius formula lives in `src/game/spatial/SpatialRenderScale.ts`.

## Game Scale Diagnostics

Files:

- `src/game/spatial/SpatialRenderScale.ts`
- `src/game/rendering/GamePrototypeScene.ts`

SystemView keeps simulation values physical but renders planets with a compressed/cinematic scale.

Current HUD behavior:

- In SystemView, HUD shows `scale | system 1u=1km`.
- It also shows the first planet's real radius, current rendered radius, km per render unit, and compression multiplier.
- Planet render radius is calculated centrally via `getSystemPlanetRenderRadius()`.

## SystemView Planet Quality Alignment

Files:

- `src/game/rendering/GamePrototypeScene.ts`
- `src/planet/PlanetSurfaceMaterial.ts`
- `src/planet/PlanetSurfaceNodeMaterial.ts`

Current planet alignment work:

- SystemView no longer applies the previous aggressive solid-planet brightness/procedural-strength override.
- SystemView planet render tuning is closer to PlanetViewer defaults, with only restrained per-class adjustments.
- SystemView idle cloud raymarch budget now matches the default PlanetViewer budget.
- Ocean island/coast masks were tightened in both WebGL and WebGPU materials:
  - reduced terrain-height influence on `oceanIslandMask`
  - narrower island transition thresholds
  - narrower/weaker shelf tint

Known remaining difference:

- PlanetViewer can use baked terrain textures; SystemView still uses the procedural/live material path.

## Gas / Ice Giant Rendering

Files:

- `src/planet/GasGiantLayer.ts`
- `src/planet/Planet.ts`
- `src/game/rendering/GamePrototypeScene.ts`
- `src/game/dev/scenes/planets/PlanetLodTestScene.ts`

Current giant rendering work:

- Gas/Ice Giants no longer get the generic solid-planet AtmosphereLayer on top of their dedicated `GasGiantLayer` atmosphere.
- SystemView and Planet LOD now enable giant cloud particles for `gas_giant` and `ice_giant`.
- `GasGiantLayer` has denser cloud shells, stronger shell opacity, stronger atmospheric shell opacity, and more particle veil density.
- `GasGiantLayer` now uses horizontally seamless FBM for turbulent bands/cloud alpha so equirectangular textures wrap cleanly.
- Final body/cloud textures get a small horizontal seam blend after Canvas strokes, reducing visible left/right texture discontinuities.
- Giant cloud particles now fade down with camera distance relative to planet radius, so close views keep depth while far views avoid noisy bright particle speckles.
- The current volumetric look is still an approximation: layered transparent shells plus particle veil. A true volume-cloud gas giant would need a later raymarch/3D texture path.

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
- Ocean land/water transitions were sharpened in both surface paths by narrowing shelf/coast/island masks and reducing the bright cyan shelf tint.

## Climate System

Review file: `docs/climate-system-review.md`

Current climate work:

- Global climate is generated in `PlanetGenerator.ts`.
- Local biome/weather sampling exists in `Climate.ts` and `Weather.ts`.
- Cloud layers now receive global climate values from `PlanetRenderProfile`:
  - cloud persistence
  - storm activity
  - wind strength
  - ash load
- WebGL and WebGPU cloud profile calculations now use the same effective coverage/density/alpha logic.
- Planet LOD scene displays generated climate values for the selected planet class/seed.

Known limitation:

- Local biome sampling is still not fully planet-specific; `getClimateSample()` should later accept a shared `ClimateProfile`.

## Known Open Visual Issues / Next Work

- Initial `@conduit/web3d` workspace package exists under `packages/conduit-web3d`.
- First extracted Conduit modules:
  - `assets/AssetLoaders`
  - `renderer/RendererFactory`
  - `renderer/RenderQuality`
  - `debug/DebugPrimitives`
  - `materials/MaterialAdjustmentProfile`
  - `materials/MaterialSnapshot`
  - `environment/DynamicEnvironmentProbe`
  - `environment/ExrEnvironmentLoader`
  - `camera/CameraFraming`
- Old local re-export shims for `RendererFactory`, `RenderQuality`, `DebugPrimitives`, and `DynamicEnvironmentProbe` were removed after all app imports moved to `@conduit/web3d`.
- GamePrototypeScene, ShipModelTestScene and StudioLightingTestScene now use Conduit GLTF/OBJ/MTL asset loaders.
- Shared Conduit helpers now cover generic UV2 fallback, material traversal for material arrays, and object normalization used by both Game and Feature Lab model views.
- Asset-specific orientation/scale profiles, gameplay nodes, engine FX logic, turret behavior, combat state, and production rules remain in the Game.
- Frigate GLB import now keeps exported normals/tangents instead of recomputing vertex normals in the Game loader.
- Frigate instance material cloning no longer forces the old `envMapIntensity` `1.45`; it applies the shared Frigate material lighting profile.
- Frigate Game rendering and Studio Lighting now share `FRIGATE_MATERIAL_LIGHTING_PROFILE` in `src/game/rendering/ShipMaterialLightingProfile.ts`.
- Game dynamic environment probe now uses `GAME_ENVIRONMENT_PROBE_PROFILE`:
  - environmentIntensity `1.15`
  - HDR peak intensity scale `0.32`
  - HDR peak size scale `1.7`
  - HDR peak opacity scale `0.72`
- Feature Lab now has `rendering-studio-lighting` / `Studio Lighting` for Frigate GLB material tuning against `/models/warm_studio_hangar_4k.exr`.
- Studio Lighting `Blender Match` preset:
  - roughnessMultiplier `1.14`
  - metalnessMultiplier `1.0`
  - environmentIntensity `1.35`
  - envMapIntensity `0.95`
  - normalScale `1.0`
  - aoMapIntensity `1.0`
  - exposure `1.03`
  - GTAO on, SSR off, Bloom on
  - warm key light at `1.6`, weak cool fill light at `0.85`
  - includes `Floor Visible` and `Model Y Offset` controls for framing/material inspection
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
