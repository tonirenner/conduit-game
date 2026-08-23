# Current State Summary for ChatGPT

> Compact handoff document. Prefer current source code and the authoritative documents linked below over older implementation notes.

## Documentation authority

Read in this order for current planet work:

1. `packages/conduit-planet/PLANET_STABILIZATION_PLAN.md`
2. `docs/planet-view-architecture.md`
3. `docs/planet-rendering-target-architecture.md`
4. package-local phase/audit documents relevant to the active task
5. `docs/SIMULATION_TIME.md` / `docs/climate-system-review.md` when time/climate is involved

`docs/planet-system-roadmap.md` and `docs/implementation-notes.md` are historical reference material, not the current renderer contract.

## Project shape

The application is a Three.js/Bun/TypeScript game prototype with reusable workspace packages:

```text
Game / application
├─ @conduit/web3d
└─ @conduit/planet
```

`@conduit/web3d` owns reusable generic Three/WebGPU infrastructure such as renderer, post-processing, environment, lighting, assets and debug helpers.

`@conduit/planet` owns planet domain/generation/climate/terrain/rendering responsibilities.

WebGPU is the active planet stabilization target. WebGL is a later compatibility/fallback pass and must not constrain the modern architecture.

## Startup / development surfaces

The normal game starts from `/`.

Useful development views include:

- `?view=planet` – planet/debug viewer,
- `?view=test` – Feature Lab,
- direct Feature Lab scene selection through `?view=test&scene=...`.

Feature Lab is for isolated testing and should not become a competing production renderer architecture.

## Game-side architecture

The game keeps simulation/domain state separate from Three.js render objects as the target rule:

```text
Domain / persistent state
→ simulation
→ render synchronization / VFX / UI
```

`GamePrototypeScene` remains a large orchestration point and is still a candidate for incremental separation rather than a large rewrite.

Singleplayer settings/profile/persistence foundations exist; renderer and post-processing settings are centrally managed rather than being only ad-hoc URL state.

## Conduit Web3D

`packages/conduit-web3d` is the reusable technical layer between the game and Three.js.

Important rule:

```text
Game → @conduit/web3d → three
```

`@conduit/web3d` should not depend on gameplay/domain modules or `@conduit/planet`.

The package includes reusable renderer/post-processing/environment/lighting/assets/material/debug helpers. Keep gameplay-specific ship behavior, combat state, production rules and asset-specific game semantics outside it.

## Planet target architecture

Solid planets use three scale-specific representations:

```text
PlanetDefinition
    ↓
canonical terrain/climate/material semantics
    ├─ OrbitView
    ├─ RegionalView
    └─ SurfaceView
```

### OrbitView

Active modern WebGPU path:

```text
InstancedOrbitTerrain
+ OrbitTerrainVolume
```

The classic CubeSphere surface stack remains transitional/legacy and is hidden/frozen for modern WebGPU solid planets.

### RegionalView

Active implementation:

```text
CurvedRegionalTileTerrain
```

It provides curved approach terrain from canonical `PlanetTerrainSampler` samples.

### SurfaceView

Active implementation:

```text
SurfaceClipmapTerrain
+ SurfaceTerrainMaterial
```

It provides local tangent/meter-space clipmap rendering with material-dependent roughness, metalness, micro-normal and cavity/AO detail.

Physical terrain displacement/collision truth does not belong to the material.

## Planet handoff status

```text
Orbit → Regional
  accepted/stable

Regional → Surface
  lifecycle/camera continuity: working
  canonical terrain identity: shared
  visual/material continuity: open
```

The visible Regional → Surface material/renderer pop is documented in:

`packages/conduit-planet/PLANET_REGIONAL_SURFACE_HANDOFF_FINDING.md`.

Current runtime keeps Regional as the curved backdrop while Surface fades in, then releases Regional at a high Surface ownership threshold. The material mismatch plus final ownership cut is visually noticeable.

Do not fix this only by widening the transition band.

## Canonical planet data rules

```text
PlanetDefinition = domain truth
Derived profiles / SurfaceMaterialSemantics = render configuration
PlanetTerrainSampler = physical terrain truth
Climate / Biome / Weather modules = climate/weather truth
Renderers = consumers
```

No renderer should independently recreate composition, climate or physical terrain semantics.

## Terrain migration status

Canonical migration is complete for the planned Phase 3 surface-definition values:

- ocean level,
- terrain roughness,
- tectonics,
- volcanism,
- ice caps.

Shared volcanic and ice-cap masks are used instead of renderer-local equivalents.

## Climate / weather status

Phase 4 definition migration is complete for:

- climate seed,
- temperature,
- humidity,
- aridity,
- biome seed,
- weather seed,
- wind strength,
- storm activity,
- seasonality,
- cloud persistence.

`ashLoad` remains a deliberate later volcanic/atmospheric/material integration concern.

Remaining runtime integration issue: seasonality and cloud persistence exist as canonical layers, but one composed production weather path applying both everywhere is still open.

## Simulation time

Canonical simulation epoch:

```text
3030-01-01T00:00:00.000Z
```

`SimulationClock` is the shared time authority foundation. `PlanetSeasonCycle` derives planet orbital/season phase from the generated orbital period.

Do not create renderer-local simulation clocks for weather/seasons/orbits/day-night.

Current gaps include save/load restoration of elapsed simulation time, canonical use of planet `rotationSpeed`, and `axialTilt` participation in season forcing.

## Composition status

Phase 5 is complete.

Explicit semantics now exist for all composition keys:

```text
rock
metal
ice
water
gas
organic
volatiles
```

Solid-surface composition affects broad material identity without changing physical terrain ownership. `composition.gas` is wired into the dedicated Gas/Ice Giant visual path.

## Current active phase

**Phase 6 – profile/material-semantics consolidation.**

Completed:

- shared `SurfaceMaterialSemantics`,
- `SurfaceRenderProfile` uses it,
- active Surface material uses it,
- regression coverage for semantic/profile consistency.

Next:

```text
SurfaceMaterialSemantics
→ CurvedRegionalTileTerrain broad material evaluation
```

Regional should match Surface broad color/material identity while remaining simpler and omitting Surface microdetail.

After that, repair the Regional → Surface depth/opacity ownership transition.

## Atmosphere

Current WebGPU atmosphere uses the screen-space/post-process source architecture.

This is a protected known-good area. Do not casually modify atmosphere/camera reconstruction while working on terrain/material cleanup.

## Legacy / cleanup constraints

Do not delete these blindly:

- `Planet.ts` – still transitional and runtime-reachable,
- classic CubeSphere stack – legacy/fallback/public API responsibilities remain,
- `NearSurfaceTerrainLayer` – retirement candidate after reference/API review,
- old Regional GPU/Hydraulic/Handoff chain – mine useful algorithms first,
- old surface materials – still behavioral/fallback reference,
- old atmosphere experiments – verify imports/exports before removal.

Cleanup is migration, not deletion-first.

## CI

Planet CI is pinned to Bun 1.3.14 after Bun 1.4.0 crashed the GitHub runner test process with a segmentation fault / exit 139.

Distinguish:

```text
actual successful CI result
vs
no failure mail
vs
connector returning no status entries
```

Do not claim verified green without a visible successful check.

## Current next action

1. align Regional broad material semantics with `SurfaceMaterialSemantics`,
2. regression-check representative planet classes,
3. repair Regional → Surface opacity/depth ownership,
4. continue Phase 6 profile cleanup,
5. only then proceed into `Planet.ts` disentangling/legacy retirement.
