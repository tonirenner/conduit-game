# Conduit Web3D Architecture Analysis

Date: 2026-08-11

## Goal

Conduit Web3D should become a reusable technical Web3D layer between the game/application and Three.js. It should not become a full game framework and should not hide Three.js completely.

Target dependency direction:

```text
Application / Game
  -> @conduit/web3d
  -> three
```

`@conduit/web3d` must not import from `src/game`, `src/planet`, or any concrete gameplay module.

## Current Package State

The project started as a single Bun/TypeScript app and now has an internal workspace package:

- root package: `planet-lod`
- local package: `@conduit/web3d`
- dependency: `three`
- source root: `src`
- package root:

```text
packages/conduit-web3d/
  package.json
  src/
    renderer/
    environment/
    lighting/
    materials/
    assets/
    debug/
    performance/
    postprocessing/
    index.ts
```

Current package shape:

```json
{
  "name": "@conduit/web3d",
  "type": "module",
  "private": true,
  "peerDependencies": {
    "three": "^0.185.1"
  }
}
```

## Good Early Extraction Candidates

### Renderer

Original files:

- `src/render/RendererFactory.ts`
- `src/render/RenderQuality.ts`

Current files:

- `packages/conduit-web3d/src/renderer/RendererFactory.ts`
- `packages/conduit-web3d/src/renderer/RenderQuality.ts`

Assessment:

- `RendererFactory` is mostly generic: renderer selection, WebGPU fallback, size, pixel ratio, color space and tone mapping defaults.
- `RenderQuality` is generic camera-movement based DPR control.

Conduit target:

```text
@conduit/web3d/renderer
  createWeb3DRenderer()
  renderFrame()
  RenderQuality
```

Notes:

- Rename app-specific types like `AppRenderer` to neutral names such as `Web3DRenderer`.
- Keep Three.js access exposed.
- Do not move app boot logic from `main.ts`.

### Environment

Original files:

- `src/game/rendering/DynamicEnvironmentProbe.ts`
- EXR/PMREM loading logic inside `src/game/dev/scenes/rendering/StudioLightingTestScene.ts`
- profile constants in `src/game/rendering/ShipMaterialLightingProfile.ts`

Current files:

- `packages/conduit-web3d/src/environment/DynamicEnvironmentProbe.ts`
- `packages/conduit-web3d/src/environment/ExrEnvironmentLoader.ts`
- `packages/conduit-web3d/src/environment/SceneEnvironmentManager.ts`
- profile constants remain in `src/game/rendering/ShipMaterialLightingProfile.ts`

Assessment:

- `DynamicEnvironmentProbe` is almost generic. It only has a comment mentioning the current skydome/backdrop behavior.
- EXR environment loading is extracted.
- `SceneEnvironmentManager` now owns reusable scene environment application: EXR environment map, optional visible background, environment intensity, environment/background rotation, tone mapping, exposure, snapshot/restore, and cleanup.
- `GAME_ENVIRONMENT_PROBE_PROFILE` is game-specific as a concrete preset, but the profile type itself is generic.

Conduit target:

```text
@conduit/web3d/environment
  DynamicEnvironmentProbe
  loadExrEnvironment()
  SceneEnvironmentManager
```

Game target:

```text
src/game/rendering/GameRenderingProfiles.ts
  GAME_ENVIRONMENT_PROBE_PROFILE
```

Notes:

- Conduit should provide the mechanism.
- The game should own the concrete space-look preset values.
- `DynamicEnvironmentProbe` should accept `renderer: THREE.WebGLRenderer` or a typed renderer interface instead of `unknown` where possible.

### Lighting

Current files:

- `packages/conduit-web3d/src/lighting/StudioLightingRig.ts`

Assessment:

- Studio-style Key/Fill setup is generic enough for model viewers, material labs, product viewers, and game asset inspection.
- Concrete intensity/color presets still live in the app/game.

Conduit target:

```text
@conduit/web3d/lighting
  StudioLightingRig
  directionFromAngles()
```

Notes:

- `StudioLightingRig` provides reusable light objects and direction math only.
- It does not know about ships, weapons, game state, or Feature Lab UI.

### Materials

Current files:

- `src/game/rendering/ShipMaterialLightingProfile.ts`
- `packages/conduit-web3d/src/materials/MaterialSnapshot.ts`
- `packages/conduit-web3d/src/materials/MaterialAdjustmentProfile.ts`
- model preparation now uses `packages/conduit-web3d/src/assets/ModelPreparation.ts`
- material cloning/traversal logic in `GamePrototypeScene.ts`

Assessment:

- `applyShipMaterialLightingProfile()` is technically generic but currently named for ships and stored under `game/rendering`.
- The concrete `FRIGATE_MATERIAL_LIGHTING_PROFILE` is asset/game-specific.
- Snapshot/restore and safe traversal over material arrays are reusable and are now partly extracted.
- `prepareModelForRuntime()` covers UV2 fallback, optional geometry/material cloning, shadow flags, frustum culling, bounds recompute, and material snapshot capture.

Conduit target:

```text
@conduit/web3d/materials
  MaterialAdjustmentProfile
  applyMaterialAdjustmentProfile()
  prepareModelForRuntime()
  cloneMaterialOrArray()
  captureMaterialSnapshot()
  restoreMaterialSnapshot()
```

Game target:

```text
src/game/rendering/GameRenderingProfiles.ts
  FRIGATE_MATERIAL_LIGHTING_PROFILE
```

Notes:

- Conduit should not know "Frigate".
- Preserve GLB material maps and only apply runtime multipliers/overrides.
- Material snapshot/restore must support material arrays and missing maps without throwing.

### Assets

Current files:

- GLTF/OBJ/MTL loading inside `GamePrototypeScene.ts`
- `packages/conduit-web3d/src/assets/AssetLoaders.ts`
- `packages/conduit-web3d/src/assets/ModelPreparation.ts`
- `packages/conduit-web3d/src/assets/NodeDiscovery.ts`
- EXR loading inside `StudioLightingTestScene.ts`

Assessment:

- Loader setup is now shared for Game and Feature Lab.
- Model preparation and named-node discovery are now shared by Model Viewer, Studio Lighting, Engine VFX, and Combat VFX.

Conduit target:

```text
@conduit/web3d/assets
  loadGltf()
  loadObjMtl()
  AssetCache
  cloneLoadedObject()
  prepareModelForRuntime()
  findNamedNodes()
  findNodesByKind()
```

Notes:

- Do not move game asset catalogs or gameplay decisions into Conduit.
- Conduit can provide loaders and cache; the game decides which URL maps to which ship/station.
- Node discovery is intentionally technical only. Engine thrust behavior, turret behavior, weapon choice, station spawning, and production rules stay in the game.

### Debug

Current files:

- `src/game/dev/DebugPrimitives.ts`
- parts of `ShipModelTestScene.ts` for bounds/node labels

Assessment:

- `DebugPrimitives` is generic Three.js helper code.
- Disposal currently only collects `map`; a Conduit version should collect all texture slots.

Conduit target:

```text
@conduit/web3d/debug
  createDebugLine()
  createDebugPoint()
  createDebugLabel()
  createBoundingBoxHelper()
  disposeObject3D()
```

Notes:

- Feature Lab can import these from Conduit.
- Keep game-specific test scene registry outside Conduit.

### Camera

Current files:

- camera setup and orbit control usage in `FeatureLab.ts`
- model framing in `ShipModelTestScene.ts`
- model framing in `StudioLightingTestScene.ts`

Assessment:

- Generic framing/focus helpers are good candidates.
- Game-specific Homeworld navigation/orbit/pan logic must stay in the game.

Conduit target:

```text
@conduit/web3d/camera
  frameObject()
  focusBounds()
  createOrbitCameraPreset()
```

### Postprocessing

Original file:

- `src/postprocessing/PostProcessingPipeline.ts`

Current files:

- `packages/conduit-web3d/src/postprocessing/PostProcessingPipeline.ts`
- `packages/conduit-web3d/src/postprocessing/index.ts`

Assessment:

- It is mostly generic and now lives in `@conduit/web3d/postprocessing`.
- It has fragile WebGPU/TSL version-specific code and fallbacks.
- It now supports runtime option updates for enabled state, quality, GTAO, SSR, Bloom, and exposure.
- Effect toggles and quality changes invalidate/rebuild the WebGPU pipeline; exposure updates directly.

Conduit API:

```text
@conduit/web3d/postprocessing
  PostProcessingPipeline
  PostProcessingQuality
  PostProcessingPipelineUpdateOptions
```

Remaining work:

- Keep quality profiles generic.
- Split preset/profile data from the pipeline class once live Feature Lab tuning needs direct access.
- Add finer-grained live sliders for AO/SSR/Bloom profile internals once the public profile API is split out.

## Later / Riskier Candidates

### Generic Effects

Current files:

Current files:

- `src/game/rendering/EngineVfxSystem.ts`
- `src/game/rendering/CombatVfxSystem.ts`
- `src/game/rendering/DummyAssetFactory.ts`

Assessment:

- These are mixed.
- Low-level visuals may become generic later.
- Current systems know ships, combat events, weapon semantics, engine node conventions and fallback decisions.

Possible split:

```text
Conduit:
  ThrusterEffect
  BeamEffect
  ProjectileTrailEffect
  MuzzleFlashEffect

Game:
  EngineVfxSystem
  CombatVfxSystem
  weapon selection
  ship state interpretation
```

Do not extract these first.

### Planet Renderer

Current files:

- `src/planet/*`

Assessment:

- The planet renderer is mostly rendering code, but it has significant domain concepts: planet classes, climate, composition, procedural generation and system/game scale assumptions.
- It should not be moved early.

Possible later split:

```text
Conduit:
  generic LOD sphere / cube sphere infrastructure
  generic horizon/frustum helpers
  generic render texture bake helper

Game/Planet package:
  planet classes
  climate
  composition
  gas giant style
  gameplay resource interpretation
```

## Modules That Must Stay In Game

These are gameplay/domain modules and should not move into Conduit:

- `src/game/model/GameWorld.ts`
- `src/game/generation/GameWorldGenerator.ts`
- `src/game/simulation/FleetSimulation.ts`
- `src/game/simulation/FleetGroupSystem.ts`
- `src/game/simulation/ProductionSystem.ts`
- `src/game/build/*`
- `src/game/navigation/TacticalNavigation.ts`
- `src/game/domain/PlayerProfile.ts`
- `src/game/persistence/*`
- `src/game/ui/*`
- `src/game/rendering/GamePrototypeScene.ts`
- `src/game/ui/SystemMinimap.ts`

## Mixed Modules Requiring Split Before Extraction

### `GamePrototypeScene.ts`

Responsibilities currently mixed:

- game state rendering
- camera modes
- input handling
- ship/station model loading
- material processing
- environment probe setup
- build placement visuals
- HUD text
- minimap integration
- selection rendering

Extraction strategy:

- Do not move this file.
- Pull out generic helpers it uses:
  - material profile application
  - asset loading/cache
  - environment probe
  - object disposal/framing helpers

### `FeatureLab.ts`

Responsibilities currently mixed:

- generic test scene host
- game settings store
- game-specific scene registry
- UI shell

Extraction strategy:

- Keep current Feature Lab in game for now.
- Later extract only a generic `SceneLabHost` or `DebugSceneHost` if another app needs it.

### `StudioLightingTestScene.ts`

Responsibilities currently mixed:

- generic EXR environment loading
- generic material snapshot/restore
- generic lighting controls
- specific Frigate URL
- game settings toggles for PostFX

Extraction strategy:

- Keep the scene in game/dev.
- Move helpers out first:
  - EXR environment loader
  - material snapshot/restore
  - framing helper

## Proposed Initial Workspace Layout

```text
packages/
  conduit-web3d/
    package.json
    tsconfig.json
    src/
      index.ts
      renderer/
        RendererFactory.ts
        RenderQuality.ts
      environment/
        DynamicEnvironmentProbe.ts
        ExrEnvironmentLoader.ts
      materials/
        MaterialAdjustmentProfile.ts
        MaterialTraversal.ts
      debug/
        DebugPrimitives.ts
      camera/
        CameraFraming.ts
```

Root package changes later:

```json
{
  "workspaces": [
    "packages/*"
  ],
  "dependencies": {
    "@conduit/web3d": "workspace:*",
    "three": "^0.185.1"
  }
}
```

## Suggested Extraction Order

1. Create `packages/conduit-web3d` with package metadata and public `src/index.ts`.
2. Move `RenderQuality` first. It is small and generic.
3. Move `DebugPrimitives`, but improve texture disposal to collect all material texture fields.
4. Move generic material traversal/profile helpers.
5. Move `DynamicEnvironmentProbe`.
6. Extract `ExrEnvironmentLoader` from `StudioLightingTestScene`.
7. Update `StudioLightingTestScene` and `GamePrototypeScene` imports to use `@conduit/web3d`.
8. PostProcessing extraction should wait until live reconfiguration and WebGPU/TSL fallback behavior are stable.

## Public API Candidates

Initial barrel exports:

```ts
export * from './renderer/RenderQuality';
export * from './environment/DynamicEnvironmentProbe';
export * from './environment/ExrEnvironmentLoader';
export * from './materials/MaterialAdjustmentProfile';
export * from './materials/MaterialTraversal';
export * from './debug/DebugPrimitives';
export * from './camera/CameraFraming';
```

Example usage:

```ts
import {
  DynamicEnvironmentProbe,
  applyMaterialAdjustmentProfile,
  frameObject,
} from '@conduit/web3d';
```

## Technical Risks

- Package path resolution with Bun must be verified after adding workspaces.
- Three.js addons imports must remain compatible with the current bundler setup.
- WebGPU renderer typing is currently loose in some places; extracting too early may expose bad API types.
- PostProcessing relies on internal/dynamic TSL APIs and should not be the first extraction.
- Game-specific profile constants must not live in Conduit.
- Asset URLs must stay application-owned; Conduit should load URLs, not decide which assets exist.

## Current Recommendation

Start with a small internal workspace package and move only low-risk infrastructure:

1. `RenderQuality`
2. `DebugPrimitives`
3. generic material helpers
4. `DynamicEnvironmentProbe`
5. EXR environment loader

This gives the game immediate structure without risking planet rendering, combat, input, or the current playable prototype.

## Implementation Progress

### 2026-08-11 Initial Package Extraction

Created local workspace package:

```text
packages/conduit-web3d/
```

Root project changes:

- root `package.json` now declares workspaces and depends on `@conduit/web3d` via `workspace:*`
- root `tsconfig.json` maps `@conduit/web3d` and subpaths to `packages/conduit-web3d/src`

Extracted to `@conduit/web3d`:

- `renderer/RenderQuality`
- `renderer/RendererFactory`
- `debug/DebugPrimitives`
- `assets/AssetLoaders`
- `materials/MaterialAdjustmentProfile`
- `materials/MaterialSnapshot`
- `environment/DynamicEnvironmentProbe`
- `environment/ExrEnvironmentLoader`
- `camera/CameraFraming`

Reusable helpers now included:

- `loadGltfObject()` and `loadObjMtlObject()` centralize generic GLB/OBJ/MTL loading.
- `ensureUv2FromUv()` provides the shared AO-map fallback for models that only export `uv`.
- `configureObjectMaterials()` handles single materials and material arrays consistently.
- `normalizeObjectToSize()` provides shared viewer-style centering and size normalization.

Game/app files now using Conduit directly:

- `src/main.ts` imports `RenderQuality` from `@conduit/web3d/renderer`
- `src/main.ts` imports renderer creation/fallback/render frame helpers from `@conduit/web3d/renderer`
- `src/game/rendering/GamePrototypeScene.ts` imports `DynamicEnvironmentProbe` from `@conduit/web3d/environment`
- Feature Lab scenes import debug helpers from `@conduit/web3d/debug`
- `StudioLightingTestScene` uses Conduit EXR loading, material snapshots, object disposal and camera framing
- `GamePrototypeScene`, `ShipModelTestScene`, and `StudioLightingTestScene` use Conduit GLTF/OBJ/MTL asset loading, UV2 fallback, material traversal helpers, and object normalization
- `ShipMaterialLightingProfile` keeps game-specific Frigate/Game probe constants but reuses Conduit material profile application

Compatibility shims removed:

- `src/render/RenderQuality.ts`
- `src/render/RendererFactory.ts`
- `src/game/dev/DebugPrimitives.ts`
- `src/game/rendering/DynamicEnvironmentProbe.ts`

The app and Feature Lab now import these modules directly from `@conduit/web3d`.

Still intentionally not extracted:

- `PostProcessingPipeline`
- `GamePrototypeScene`
- planet renderer
- combat/engine VFX systems
- Feature Lab host

Next recommended step:

1. Verify package resolution with the normal dev server after each extraction step.
2. Consider replacing app-level module promise caches with `AssetPromiseCache` only where it reduces duplication without hiding asset-specific fallback behavior.
3. Continue extracting only generic object/material preparation helpers. Asset-specific orientation, scale profiles, weapon nodes, engine nodes, and gameplay rules stay in the Game.
