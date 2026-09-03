# Conduit Planet – Phase 8 NearSurfaceTerrainLayer Retirement

Status: isolated legacy compatibility path

## Finding

`NearSurfaceTerrainLayer` is an older independent tangent-patch terrain representation.

It is not part of the target Orbit → Regional → Surface architecture.

The modern WebGPU `PlanetViewRuntime` constructs `Planet` with:

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
- `PlanetRenderFeatures.nearSurfaceTerrain` still exists for compatibility,
- `DEFAULT_PLANET_RENDER_FEATURES.nearSurfaceTerrain` is now `false`,
- the modern WebGPU `PlanetViewRuntime` explicitly keeps the feature disabled,
- the Planet LOD/approach lab uses `PlanetViewRuntime` and therefore the canonical Surface clipmap,
- the current production/game `GamePrototypeScene` still constructs `Planet` directly and explicitly sets `nearSurfaceTerrain: true`,
- diagnostics expose a near-surface status block and can preserve the same public shape after final retirement.

## Important consumer finding

The actual game is the remaining known intentional consumer of the legacy layer:

```text
GamePrototypeScene
    ↓
new Planet(...)
    ↓
nearSurfaceTerrain: true
    ↓
NearSurfaceTerrainLayer
```

This explains why the game still shows the old planet/surface stack while the Planet LOD lab exercises the new view architecture.

The layer must therefore not be deleted before the production planet rollout migrates `GamePrototypeScene` to the new runtime.

## Phase 8 isolation state

Completed:

```text
[x] canonical modern path already disables the old layer
[x] package root does not export the concrete layer
[x] default feature value changed from true to false
[x] explicit compatibility opt-in remains possible
[x] regression test covers default-off + explicit opt-in behavior
[x] remaining game consumer identified
```

This is sufficient to classify Phase 8 as **isolated**, rather than pretending the implementation is already fully retired.

## Final retirement strategy

Do not remove the public feature field in Phase 8. Public feature cleanup belongs to Phase 13.

Final removal is tied to the production rollout:

```text
A. migrate GamePrototypeScene planet ownership to PlanetViewRuntime / the production view runtime
B. remove its explicit nearSurfaceTerrain: true compatibility opt-in
C. verify game descent/ascent and representative planet classes
D. remove NearSurfaceTerrainLayer construction/update/disposal from Planet
E. delete NearSurfaceTerrainLayer.ts
F. preserve compatibility diagnostics as inactive/zeroed state
G. retain nearSurfaceTerrain feature field temporarily as deprecated no-op if needed
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

The following ideas were reviewed before isolation:

- tangent-basis construction: already superseded by canonical local reference-frame/surface systems,
- regular grid indexing: already shared through `TerrainGeometryUtils`,
- local patch rebuild: superseded by reusable clipmap rings,
- old palette colors: superseded by `SurfaceMaterialSemantics` / `SurfacePalette`,
- proximity visibility threshold: superseded by `PlanetViewTransition` lifecycle.

No unique behavior currently requires migration from this layer.

## Phase 8 result

For stabilization purposes Phase 8 is **isolated**:

- new/default consumers no longer activate the layer,
- modern planet-view architecture does not depend on it,
- only the explicitly identified old game integration keeps it alive until the production rollout.

The actual file deletion happens as part of that game migration, not as an unsafe prerequisite to it.
