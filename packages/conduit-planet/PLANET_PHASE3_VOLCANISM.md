# Conduit Planet – Phase 3 `surface.hasVolcanism`

> WebGPU-first migration note. This step wires the existing `PlanetDefinition.surface.hasVolcanism` value into the canonical terrain path without turning volcanism into a planet-class or material shortcut.

## Previous state

`surface.hasVolcanism` already existed in `PlanetDefinition` and affected generated climate ash load, but the canonical `PlanetTerrainSampler` did not use it for physical terrain. Lava visual behavior was primarily class/material driven.

That left a semantic gap: a non-`lava` planet could be defined as volcanically active but have no canonical volcanic terrain identity.

## Migration decision

`surface.hasVolcanism` now owns **local deterministic volcanic activity**, independently from `class === 'lava'`.

Canonical flow:

```text
PlanetDefinition.surface.hasVolcanism
        ↓
PlanetTerrainSampler.hasVolcanism
        ↓
getTerrainVolcanicMask(...)
        ├─→ PlanetSurfaceSample.volcanicMask
        └─→ volcanic geometry relief
```

The volcanic mask is normalized to `0..1`, sparse, land-bound and deterministic from the existing terrain seed/config.

It represents **where volcanic activity exists**, not whether the surface material globally looks like lava.

## Geometry behavior

`TerrainGeometryRelief` adds a separate volcanic contribution when enabled:

- broad low-frequency activity provinces,
- finer deterministic vent/cone structure,
- positive volcanic uplift,
- modest localized caldera/vent depression.

This contribution is intentionally independent from:

- `surface.terrainRoughness`,
- `surface.hasTectonics`,
- `surface.mountainScale`,
- material PBR roughness.

Therefore a planet may have `terrainRoughness = 0` and still possess volcanic terrain if `hasVolcanism = true`.

## Canonical volcanic mask

Added:

```ts
getTerrainVolcanicMask(
    normal,
    terrain,
    config,
    hasVolcanism,
): number
```

Properties:

```text
hasVolcanism = false → 0 everywhere
hasVolcanism = true  → deterministic 0..1 local activity
water/non-land terrain → activity suppressed by landMask
```

`PlanetSurfaceSample` now exposes:

```ts
volcanicMask: number;
```

This is deliberately created now so future Surface/Regional material migration can consume the **same** spatial volcanic truth for basalt, ash, vents, lava-flow accents or emissive heat instead of inventing a second procedural hotspot field.

## Intentionally unchanged

### Canonical raw terrain

Volcanism does not modify `TerrainSample` itself. It does not change:

- continent layout,
- `rawTerrain.height`,
- `landMask`,
- `mountainMask`,
- `erosionMask`,
- `riverMask`.

It is an additional physical relief/mask layer.

### Climate and biome

Local terrain sampling still uses the existing canonical raw terrain inputs for climate and biome classification.

The generated global `climate.ashLoad` behavior remains unchanged. It already accounts for `surface.hasVolcanism` during planet generation and represents a different responsibility: global atmospheric/climate ash tendency rather than local volcanic geography.

### Lava material

No lava-class material tuning was changed.

`class === 'lava'` can still drive broad lava-world material identity. `hasVolcanism` is intentionally class-independent so terrestrial, rocky, toxic or other solid worlds can contain volcanic regions without becoming globally lava shaded.

A later material phase should consume `PlanetSurfaceSample.volcanicMask` (or an equivalent transported canonical attribute/mask), not recreate volcanic hotspots in `SurfaceTerrainMaterial`.

### Orbit / Regional parity

No Orbit or Regional material retuning is part of this commit. This is the canonical physical/mask source that later view-alignment work must consume.

## Terrain normals

Neighbor samples used for physical terrain normals receive the same `hasVolcanism` value as the primary sample. Geometry and normals therefore agree about volcanic relief.

## Characterization tests

Added:

`tests/PlanetVolcanism.test.ts`

Coverage:

1. volcanic mask is deterministic, normalized and zero when disabled,
2. volcanic relief exists independently from terrain roughness and tectonics,
3. toggling `hasVolcanism` leaves canonical `rawTerrain`, `landMask`, water classification, climate and biome unchanged,
4. `PlanetSurfaceSample.volcanicMask` is zero for inactive planets and spatially active for enabled planets.

The existing `PlanetTerrainRoughness.test.ts` fixture explicitly disables volcanism so its zero-relief assertion continues to characterize terrain roughness alone.

## Risk assessment

Risk: **low architectural, moderate local visual**.

No draw calls, textures or shader passes were added. The cost is additional CPU procedural sampling when canonical terrain samples are evaluated for volcanically active planets.

Expected physical effect is localized rather than global: active worlds gain sparse volcanic provinces and vent/caldera relief while continents, oceans, climate and biomes retain their existing identity.

## Commits

```text
13d21c8  Add canonical volcanic terrain relief
c3c92a9  Apply volcanism in canonical terrain sampler
c97b390  Isolate roughness characterization from volcanism
b256c83  Cover canonical volcanic terrain relief
```

## Phase 3 position

```text
[x] surface.oceanLevel
[x] surface.terrainRoughness
[x] surface.hasTectonics
[x] surface.hasVolcanism
[ ] surface.hasIceCaps
```

Next definition value: `surface.hasIceCaps`.
