# Conduit Planet – Phase 9 Legacy Regional Renderer Retirement

Status: retirement approved

## Scope

Legacy prototype chain:

```text
GpuRegionalSurfaceTerrain
    ↓
HydraulicRegionalSurfaceTerrain
    ↓
RegionalSurfaceHandoffTerrain
```

Target/current regional renderer:

```text
PlanetTerrainSampler
    ↓
CurvedRegionalTileTerrain
    ↓
SurfaceTerrainMaterial broad evaluation
    ↓
PlanetViewTransition depth/handoff policy
```

## Consumer / API finding

Confirmed:

- the active `PlanetViewRuntime` imports and constructs `CurvedRegionalTileTerrain`, not the old chain,
- none of the old regional classes are exported through `src/rendering/index.ts`,
- the old chain is prototype/reference code rather than the target renderer,
- repository code-search endpoints are currently unreliable/incomplete and therefore zero search hits are not treated as proof by themselves.

The retirement decision is based on the active architecture and package boundary, not on an unreliable zero-hit search result.

## Useful behavior review

### `GpuRegionalSurfaceTerrain`

Useful ideas already superseded or migrated:

- canonical `PlanetTerrainSampler` sampling → already the active physical source,
- curved local regional geometry → superseded by `CurvedRegionalTileTerrain`,
- altitude-dependent regional resolution → current tiled regional lifecycle owns its own fixed/bounded representation,
- baked color/height/normal/AO/roughness maps → superseded by canonical broad Surface material evaluation plus Surface micro-detail,
- depth handoff threshold → superseded by centralized `PlanetViewTransition` / depth-ownership rules.

No unique runtime responsibility needs migration from this class.

### `HydraulicRegionalSurfaceTerrain`

The valuable algorithm was already separated from the renderer:

```text
src/terrain/erosion/RegionalHydraulicErosion.ts
```

That algorithm is retained. Deleting the renderer wrapper does not delete the hydraulic-erosion implementation.

The old wrapper modified a temporary regional displacement texture and rebuilt normal/AO maps. That representation-specific behavior is not part of the canonical modern terrain path.

### `RegionalSurfaceHandoffTerrain`

The class implemented prototype-specific transition workarounds:

- edge feathering toward zero displacement,
- altitude-dependent relief exaggeration,
- derived normal/AO rebuild after feathering.

These existed to hide the border of the old regional displacement patch.

The current architecture instead uses:

```text
CurvedRegionalTileTerrain
PlanetViewTransition
single-depth-owner handoff policy
SurfaceClipmapTerrain
```

The accepted Orbit → Regional and repaired Regional → Surface transitions must not reintroduce the old feather/morph workaround.

## Retirement decision

Delete the three legacy renderer classes:

```text
GpuRegionalSurfaceTerrain.ts
HydraulicRegionalSurfaceTerrain.ts
RegionalSurfaceHandoffTerrain.ts
```

Retain:

```text
terrain/erosion/RegionalHydraulicErosion.ts
CurvedRegionalTileTerrain.ts
SurfaceClipmapTerrain.ts
PlanetViewTransition.ts
```

## Regression expectation

Removal must not change the active runtime or visual output because the old chain is not part of `PlanetViewRuntime`.

If package CI reveals an internal direct-path import, migrate/remove that stale import rather than restoring the obsolete renderer architecture.

## Phase 9 result

Once the three prototype files are removed and the package remains structurally consistent, Phase 9 is complete.
