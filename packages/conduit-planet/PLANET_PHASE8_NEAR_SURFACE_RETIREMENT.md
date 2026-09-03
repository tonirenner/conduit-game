# Conduit Planet – Phase 8 NearSurfaceTerrainLayer Retirement

Status: active retirement audit

## Finding

`NearSurfaceTerrainLayer` is an older independent tangent-patch terrain representation.

It is not part of the target Orbit → Regional → Surface architecture.

The modern WebGPU `PlanetViewRuntime` already constructs `Planet` with:

```ts
nearSurfaceTerrain: false
```

and uses `SurfaceClipmapTerrain` for the actual local surface representation.

## Why the old layer should retire

`NearSurfaceTerrainLayer` owns competing terrain/render interpretation:

- samples legacy `getTerrainSample(...)` directly rather than the canonical `PlanetTerrainSampler`,
- owns a separate tangent-patch rebuild lifecycle,
- owns separate near-surface visibility thresholds,
- owns independent class/palette color logic,
- owns its own material/roughness/metalness semantics,
- overlaps the responsibility now owned by `SurfaceClipmapTerrain`.

Keeping both as active near-surface representations risks two physical/material truths.

## Current ownership / API state

Confirmed:

- the concrete `NearSurfaceTerrainLayer` class is not exported by the package root,
- `Planet` is its construction/lifecycle owner,
- `PlanetRenderFeatures.nearSurfaceTerrain` still exists and currently defaults to `true`,
- the modern WebGPU `PlanetViewRuntime` explicitly overrides that feature to `false`,
- diagnostics expose a near-surface status block but can preserve the same public shape with an inactive fallback.

## Retirement strategy

Do not remove the public feature field in Phase 8. Public feature cleanup belongs to Phase 13.

Retire in controlled steps:

```text
A. confirm no required legacy/game runtime explicitly depends on nearSurfaceTerrain=true
B. change DEFAULT_PLANET_RENDER_FEATURES.nearSurfaceTerrain to false
C. validate legacy/WebGL/debug paths still behave acceptably
D. remove NearSurfaceTerrainLayer construction/update/disposal from Planet
E. delete NearSurfaceTerrainLayer.ts
F. preserve compatibility diagnostics as inactive/zeroed state
G. retain nearSurfaceTerrain feature field temporarily as deprecated no-op
H. remove/deprecate the public feature field during Phase 13 API cleanup
```

## Protected replacement

The replacement is not another ad-hoc patch layer.

Canonical modern near-surface ownership remains:

```text
PlanetTerrainSampler
    ↓
SurfaceClipmapTerrain
    ↓
SurfaceTerrainMaterial
```

Do not migrate the old layer's independent palette or legacy terrain sampling into the modern path.

## Useful behavior review

Before deletion, the following ideas were reviewed:

- tangent-basis construction: already superseded by canonical local reference-frame/surface systems,
- regular grid indexing: already shared through `TerrainGeometryUtils`,
- local patch rebuild: superseded by reusable clipmap rings,
- old palette colors: superseded by `SurfaceMaterialSemantics` / `SurfacePalette`,
- proximity visibility threshold: superseded by `PlanetViewTransition` lifecycle.

No unique behavior currently requires migration from this layer.

## Phase 8 next action

Confirm explicit runtime consumers of `nearSurfaceTerrain: true` before flipping the default and removing the implementation.
