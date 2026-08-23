# Planet Rendering Target Architecture

This document describes the current rendering target. The concrete view lifecycle and transition rules live in `docs/planet-view-architecture.md`.

The previous approach of refining one global CubeSphere from orbit to the physical surface is retired for the modern WebGPU path.

## Goal

Planets are deterministic, class-driven game objects whose simulation data, terrain, climate, composition, resources and visual representations come from the same domain definition.

```text
PlanetDefinition
  ↓
PlanetGeneration
  ↓
derived profiles / material semantics
  ↓
canonical terrain / climate / weather systems
  ↓
OrbitView / RegionalView / SurfaceView
```

The persistent source of truth is never a mesh.

## Core ownership rules

```text
PlanetDefinition = domain truth
Profile / MaterialSemantics = derived render configuration
Canonical samplers = physical/climate truth
Renderer = representation-specific consumer
```

Consequences:

- Planet class is identity, but not the only visual input.
- Composition values may continuously affect material identity.
- Terrain geometry and collision do not belong to surface shaders.
- Different view scales may add detail, but may not invent different macro terrain.
- Duplicate independent interpretation of definition values across renderers is a migration bug.

## Active solid-planet stack

### OrbitView

Active WebGPU implementation:

```text
InstancedOrbitTerrain
+ OrbitTerrainVolume
```

Responsibilities:

- whole-planet silhouette,
- system/orbit gameplay,
- stable low-frequency terrain identity,
- bounded geometry/draw cost.

The classic `CubeSphere` stack remains transitional for legacy/fallback paths, but is hidden/frozen on the modern WebGPU solid-planet runtime.

### RegionalView

Active implementation:

```text
CurvedRegionalTileTerrain
```

Responsibilities:

- preserve curvature during approach,
- show canonical regional relief,
- bridge global and local coordinate/render scales,
- provide a complete curved backdrop until SurfaceView can own the visible ground.

Regional geometry samples `PlanetTerrainSampler` directly.

Current limitation: broad material semantics are still simpler than SurfaceView. Aligning Regional to the shared material semantics is active work and is required before the Regional → Surface handoff can be considered visually stable.

### SurfaceView

Active implementation:

```text
SurfaceClipmapTerrain
+ SurfaceTerrainMaterial
```

Responsibilities:

- local meter-space ground rendering,
- fixed reusable clipmap geometry,
- canonical physical terrain sampling,
- high-frequency material detail,
- roughness / metalness / micro-normal / cavity-AO response.

The material may create visual microdetail, but not physical displacement truth.

## Shared material contract

Composition/material semantics are being consolidated so overlapping views describe the same broad surface before representation-specific detail is added.

Current canonical composition-derived material semantics cover:

```text
water
ice
lava / volcanism
toxic / volatiles
metal
rock
organic / carbon
```

`SurfaceRenderProfile` and active Surface material evaluation now derive those values through the shared `SurfaceMaterialSemantics` layer instead of independently reimplementing them.

Next target:

```text
SurfaceMaterialSemantics
  ├─ SurfaceView broad material evaluation
  └─ RegionalView broad material evaluation
```

Regional does not need Surface microdetail. It does need matching large-scale color/material identity inside the overlap band.

## Shared terrain contract

```text
PlanetDefinition
  → PlanetTerrainSampler
  → physical elevation
  → land/water classification
  → canonical masks
  → climate/biome samples
```

Current canonical terrain responsibilities include the migrated surface values for ocean level, terrain roughness, tectonics, volcanism and ice-cap masks.

Orbit may use baked/approximated data for performance, but that data must represent the same deterministic planet identity rather than a different terrain model.

## Climate and weather

Generated climate definition values are canonical domain inputs, not renderer-local tuning constants.

Phase 4 established canonical handling for:

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

`ashLoad` remains a later volcanic/atmospheric visual-material concern rather than general climate migration.

The simulation clock is the shared source for future/live time-dependent weather, seasons, rotation and orbital cycles. Renderer animation time must not become a competing simulation clock.

## Gas and ice giants

Gas and ice giants use the dedicated `GasGiantLayer` path rather than solid-surface terrain views.

`composition.gas` now influences the giant visual profile continuously while preserving giant class and geometry ownership.

A future atmospheric/deep-cloud gameplay view would be a deliberate fourth representation, not SurfaceView terrain applied to a giant.

## Atmosphere

Atmosphere ownership is independent of terrain-view ownership.

The current WebGPU target is the screen-space/post-process atmosphere source architecture. Previous physical shell experiments are reference/history, not the target production architecture.

Protect atmosphere/camera reconstruction while working on terrain transitions unless the task directly requires atmosphere changes.

## Current handoff status

```text
Orbit → Regional
  accepted/stable

Regional → Surface
  lifecycle works
  camera continuity works
  canonical terrain identity is shared
  visual/material continuity is still open
```

The current Regional → Surface discontinuity is documented in:

`packages/conduit-planet/PLANET_REGIONAL_SURFACE_HANDOFF_FINDING.md`.

The correct fix order is:

1. consolidate shared broad material semantics,
2. make Regional consume them,
3. then improve the depth/opacity ownership transition,
4. validate the same approach/return path across representative planet classes.

Do not hide a material mismatch merely by widening the transition band.

## WebGPU / WebGL policy

WebGPU is the active stabilization target.

Priority:

```text
1. WebGPU correctness
2. WebGPU architecture/stability
3. definition/material coverage
4. performance
5. WebGL follow-up
```

WebGL remains useful as fallback/reference behavior, but must not force duplicate domain logic or constrain the modern architecture.

## Performance boundary

The earlier LOD experiments established a durable design constraint: close-range performance is not solved by refining and optimizing the entire global CubeSphere harder.

Therefore:

- Orbit has bounded global complexity.
- Regional owns curved approach terrain.
- Surface owns dense local terrain.
- adaptive/tessellation-like refinement, if added later, belongs inside the local Surface strategy rather than reopening planet-wide near-surface refinement.

## Next work

Immediate order:

1. finish profile/material-semantics consolidation,
2. align Regional broad material evaluation with Surface,
3. repair Regional → Surface visual ownership/fade,
4. continue `Planet.ts` disentangling and legacy retirement according to `packages/conduit-planet/PLANET_STABILIZATION_PLAN.md`,
5. add broader regression/performance coverage before adaptive geometry work.
