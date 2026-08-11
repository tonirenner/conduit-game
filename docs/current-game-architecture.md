# Current Game Architecture

## Scope

This document captures the current prototype architecture before the singleplayer / PvE / PvP foundation work. The project is a Three.js application with a planet viewer and a tactical game prototype sharing the same renderer bootstrap.

## Entry Points

- `src/main.ts` owns application startup, renderer creation, global HUD creation, planet-viewer setup, and game-mode selection.
- Current mode selection is URL-driven:
  - no `?game=1`: planet viewer / debug planet mode
  - `?game=1`: game prototype
  - renderer and debug options are also URL-driven.
- `packages/conduit-web3d/src/renderer/RendererFactory.ts` creates either WebGL or WebGPU. WebGPU is opt-in through settings/URL boot parameters and falls back to WebGL when unavailable.
- `src/postprocessing/PostProcessingPipeline.ts` dynamically loads WebGPU/TSL post-processing. It currently supports GTAO, SSR, Bloom, tone mapping, and a normal-render fallback.

## Important Modules

### Domain / Game State

- `src/game/model/GameWorld.ts`
  - Main in-memory game-state type.
  - Contains strategic nodes, lanes, ships, fleets, stations, selected fleet, per-ship order overrides, and transient combat events.
  - Mostly plain serializable data, which is a good base for save/load.
- `src/game/generation/GameWorldGenerator.ts`
  - Creates the current prototype world from a seed.
  - Generates strategic nodes, lanes, initial fleets, initial player/opponent ships, and one combat test target.
  - Current generated ownership is mixed player / neutral / opponent, not yet the requested five owned persistent singleplayer systems.
- `src/system/generation/StarSystemGenerator.ts`
  - Creates procedural star-system definitions used by strategic nodes.
- `src/system/model/StarSystemDefinition.ts`
  - Defines system-level data consumed by system view rendering.

### Simulation

- `src/game/simulation/FleetSimulation.ts`
  - Updates fleet movement, wormhole approach, strategic travel, tactical movement, attack approach, automatic turret combat, hull damage, and ship destruction.
  - Also contains legacy station/shipyard helper functions that overlap with `ProductionSystem`.
- `src/game/simulation/FleetGroupSystem.ts`
  - Handles control groups, hotkeys, dissolving groups, and per-ship order overrides.
- `src/game/simulation/ProductionSystem.ts`
  - Handles station construction progress, ship production queues, and spawning produced ships into one-ship HOLD fleets.
- `src/game/navigation/TacticalNavigation.ts`
  - Holds move-draft state and confirmation/cancel logic.
- `src/game/build/BuildCatalog.ts`
  - Defines buildable stations and ships, costs, build times, placement rules, and production options.
- `src/game/build/StationPlacementValidator.ts`
  - Validates placement against star, planet, and station clearance.

### Rendering / Scene

- `src/game/rendering/GamePrototypeScene.ts`
  - Central game prototype controller.
  - Owns `GameWorld`, input binding, DOM UI creation, strategic view, system view, asset loading, selection, build placement, camera modes, minimap updates, combat VFX, engine VFX, and render-state synchronization.
  - This is currently the biggest technical risk because it mixes orchestration, UI, input, simulation ownership, and rendering.
- `src/game/rendering/DummyAssetFactory.ts`
  - Creates fallback ships/stations, placement ghosts, and simple turret placeholders.
- `src/game/rendering/EngineVfxSystem.ts`
  - Adds engine glow/plume render effects to ship objects.
  - Current frigate path waits for the real GLB before adding derived engine effects. Other roles use fallback layouts.
- `src/game/rendering/CombatVfxSystem.ts`
  - Consumes combat events and renders beams. Also rotates visible turrets/ships toward targets.
  - Current node names are generic (`turret_yaw`, `muzzle`), not yet the requested indexed names.
- `src/game/rendering/SystemMinimap.ts`
  - Canvas-based system minimap with points and viewport rectangle.
- `src/game/ui/BuildMenu.ts`
  - DOM build/production menu. It is UI-only but currently wired directly from `GamePrototypeScene`.
- `src/game/rendering/SystemNebulaBackdrop.ts`, `WormholeNodeVisual.ts`
- `packages/conduit-web3d/src/environment/DynamicEnvironmentProbe.ts`
  - Render-only environment, wormhole, and reflection-probe helpers.

### Planet Renderer

- `src/planet/Planet.ts`
  - Main planet runtime object.
- `src/planet/generation/*`
  - Planet procedural generation.
- `src/planet/rendering/*`
  - Render profiles and feature flags.
- `src/planet/WebGPUAtmosphereLayer.ts`, `WebGPUCloudLayer.ts`, `AtmosphereLayer.ts`, `CloudLayer.ts`
  - Atmosphere and cloud rendering for WebGPU/WebGL paths.
- `src/planet/PlanetSurfaceNodeMaterial.ts`, `PlanetSurfaceMaterial.ts`
  - WebGPU/TSL and WebGL planet surface materials.
- System view already reuses `Planet` for full planet objects, with lighter preview objects while async planet construction is pending.

### UI / Input

- `src/main.ts` creates the global planet/debug HUD.
- `GamePrototypeScene` creates and owns:
  - fleet menu
  - loading overlay
  - selection rectangle
  - build menu
  - minimap
  - all game pointer/keyboard handlers
- Input flow is currently DOM events -> `GamePrototypeScene` handlers -> simulation functions / local scene state.
- There is no central input router and no settings-aware command layer yet.

### Asset Loading

- `GamePrototypeScene` loads:
  - `public/models/frigate.glb`
  - `public/models/orbital_hanger.glb`
  - `public/models/capital_ship.obj` + `.mtl`
- Real model loading is async and cached through module-level promises.
- Dummy assets are intended as fallback only. This rule is partially respected and must remain strict: do not render dummy geometry on top of successfully loaded real GLB/OBJ models.

## Current Data Flow

1. `main.ts` reads URL parameters and creates renderer, scene, camera, controls, post-processing, and render quality.
2. In game mode, `GamePrototypeScene` creates a fresh generated `GameWorld` from the current seed.
3. Each frame:
   - `GamePrototypeScene.update()`
   - `updateFleetSimulation(world, dt)`
   - `updateProductionSystem(world, dt)`
   - render meshes are synchronized from world state
   - VFX systems consume transient state/events
   - UI/minimap/HUD are refreshed
   - `main.ts` renders through post-processing or direct renderer.
4. There is currently no repository layer and no save/load cycle. Reloading regenerates the world.

## Current Render Flow

1. `@conduit/web3d/renderer` creates WebGL or WebGPU renderer.
2. `main.ts` creates one Three scene and one camera.
3. Planet viewer and game prototype both render into the same scene infrastructure.
4. `GamePrototypeScene` has separate groups:
   - root group
   - backdrop group
   - strategic map group
   - system view group
5. System view uses floating-origin style shifting through render/system conversion helpers.
6. Post-processing is only active through `PostProcessingPipeline`; it falls back to normal rendering if WebGPU/TSL setup or lazy graph compilation fails.

## Simulation State vs Render State

### Simulation / Game-State

- `GameWorld.seed`
- strategic nodes and lanes
- generated star-system definitions
- ships, hull, position, velocity, node ownership, fleet membership
- fleet orders and hotkeys
- ship order overrides
- stations, construction progress, production queues
- selected fleet id

### Render/UI State

- Three meshes and groups
- model loading promises/cache
- placement ghost object
- selection rectangle DOM state
- active camera mode and saved camera positions
- minimap canvas rendering
- combat beams and engine plumes
- loading overlay animation
- generated background sprites/materials

### Mixed / Needs Separation

- `GamePrototypeScene.world` is simulation state but is owned by a rendering/controller class.
- selected ship ids are UI/control state, while selected fleet id is stored in `GameWorld`.
- combat events are generated by simulation but consumed as transient render events; they should remain non-persistent.
- build placement currently creates a station immediately after confirmation instead of issuing a builder order.

## Persistent Data Candidates

Must become persistent:

- player profile identity
- save version
- player resources
- research state
- story/mission/NPC state
- owned systems and their seeds
- current active system
- ships and persistent ship ids
- fleets and hotkeys
- stations, construction state, production queues, target planet bindings
- ship order state where appropriate
- unlocked ships/stations/weapons
- PvE/PvP battle results once available

Should not be persistent:

- Three meshes/materials/textures
- camera damping/intermediate drag state
- combat beam visuals
- engine plume visuals
- loading overlay state
- current post-processing render targets

Settings should be persistent separately from save-game state.

## Known Technical Risks

- `GamePrototypeScene` is a large orchestration class and should be reduced incrementally.
- `main.ts` still treats the planet viewer as the default and uses URL parameters for normal game options.
- There is no `SettingsStore` or repository abstraction.
- There is no `PlayerProfile` or persistent singleplayer save.
- `GameWorldGenerator` creates a temporary skirmish-like map, not a persistent player-owned region.
- Station placement immediately creates stations; capital ship build orders are not modeled.
- `FleetSimulation.ts` contains production/station helper functions that overlap with `ProductionSystem.ts`.
- Production currently creates one-ship HOLD fleets, which is acceptable for now but not the final fleet ownership model.
- Combat simulation and combat rendering are separated at the event boundary, but target/turret rendering logic still lives in `CombatVfxSystem`.
- Turret/muzzle node naming is not yet compatible with indexed GLB nodes like `turret_01_yaw` and `muzzle_01`.
- Engine VFX supports real frigate bounds but not generic `engine_01` node discovery yet.
- Current UI is functional but built from ad hoc DOM fragments with inline styles.
- Tests are not configured for domain systems.

## Proposed Target Architecture

Use the existing plain-data simulation foundation and add persistence/settings around it without a large rewrite.

Recommended module layout:

- `src/game/domain/`
  - player profile, research, resources, story, lobby, battle-result types
- `src/game/persistence/`
  - `PlayerRepository`
  - `GameWorldRepository`
  - localStorage / IndexedDB implementations
  - save version and future migrations
- `src/game/settings/`
  - `GameSettings`
  - `SettingsRepository`
  - `SettingsStore`
- `src/game/simulation/`
  - fleet movement
  - combat
  - production
  - build orders
  - resource production
  - research progression
- `src/game/rendering/`
  - Three-only scene synchronization and VFX
- `src/game/ui/`
  - DOM/HUD/settings/minimap/build panels
- `src/game/multiplayer/`
  - lobby/loadout/battle-result domain structures only for now
- `src/game/story/`
  - story and mission state types

Target data ownership:

```text
PlayerProfile
PersistentGameState
GameWorld
Simulation
Render State
```

Avoid:

```text
Mesh -> gameplay state
```

## Recommended Implementation Order

1. Keep the current game playable and document every larger step.
2. Make `/` start the game and move planet viewer to `?view=planet`.
3. Add `GameSettings` and a central settings store, then use it for renderer and post-processing options.
4. Tune post-processing profiles to be subtler.
5. Add `PlayerProfile` and repository interfaces with local persistence.
6. Add a `PersistentGameState` wrapper and generate/load five owned systems once.
7. Introduce build orders before changing station placement behavior.
8. Expand production with spawn/rally data while preserving one-ship HOLD behavior until fleet inventory is explicit.
9. Add research/resources as domain state plus pure update functions.
10. Add PvE/PvP lobby/loadout/battle-result domain types and tests without networking.
