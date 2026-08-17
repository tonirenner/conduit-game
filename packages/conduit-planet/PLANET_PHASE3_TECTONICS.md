# Conduit Planet – Phase 3: `surface.hasTectonics`

> Companion document to `PLANET_PHASE3_TERRAIN_MIGRATION.md`.
>
> WebGPU-first migration of one `PlanetDefinition.surface` value at a time. No WebGL parity work is required in this step.

## Status

`surface.hasTectonics`: **migrated into the canonical terrain geometry path**.

Phase 3 sequence after this step:

```text
[x] surface.oceanLevel
[x] surface.terrainRoughness
[x] surface.hasTectonics
[ ] surface.hasVolcanism
[ ] surface.hasIceCaps
```

## Previous state

`PlanetDefinition.surface.hasTectonics` existed as generated domain intent and was represented in profile-level semantics, but the current canonical terrain path did not meaningfully consume it.

A repo-wide inspection found no existing tectonic geometry implementation that could simply be reconnected. Existing `TerrainGeometryRelief` ridges are generic meso relief and are not equivalent to tectonic plate/fault structure.

The field therefore remained effectively `UNWIRED` in the modern terrain architecture.

## Migration decision

`surface.hasTectonics` enables a **separate deterministic geometry-only ridge/fault contribution**.

It does not reinterpret or replace the existing generic terrain ridges.

Responsibility split:

```text
mountainScale
    → macro elevation amplitude

terrainRoughness
    → strength of generic meso/local geometry relief

hasTectonics
    → enables deterministic tectonic boundary/fault relief

material roughness
    → PBR optical response
```

Canonical flow:

```text
PlanetDefinition.surface.hasTectonics
        ↓
PlanetTerrainSampler.hasTectonics
        ↓
getTerrainGeometryReliefRawHeight(..., hasTectonics)
        ↓
tectonic ridge/fault contribution
        ↓
geometryReliefRawHeight
        ↓
Regional / Surface / landing / physical terrain normals
```

## Geometry model

The tectonic contribution uses only the existing deterministic `terrainSeed` configuration.

No new seed or parallel terrain source was introduced.

The first implementation intentionally stays narrow:

1. a low-frequency seeded field establishes broad plate-boundary bands,
2. distance to those bands creates narrow fault/ridge zones,
3. a second seeded ridged field adds uplift structure,
4. a signed seeded field permits modest local uplift/subsidence variation,
5. the contribution is masked by canonical land/mountain/erosion context.

This creates tectonic physical structure without altering the underlying canonical terrain masks.

## Changed production code

### `src/terrain/TerrainGeometryRelief.ts`

`getTerrainGeometryReliefRawHeight()` now accepts:

```ts
hasTectonics = false
```

The previous generic roughness relief remains separate:

```text
roughnessRelief = generic meso/local detail × terrainRoughness
```

Tectonic relief is then added only when enabled:

```text
tectonicRelief = hasTectonics
    ? deterministic fault/ridge contribution
    : 0
```

The default is `false` so direct callers that have not explicitly migrated do not silently acquire new tectonic geometry.

### `src/near-view/PlanetTerrainSampler.ts`

Added:

```ts
readonly hasTectonics: boolean;
```

initialized directly from:

```ts
definition.surface.hasTectonics
```

The same value is passed during both normal surface sampling and the neighboring samples used for physical terrain-normal derivation.

Therefore geometry and normals cannot disagree about tectonic structure.

## Important independence from `terrainRoughness`

Tectonics is not implemented as another multiplier on `terrainRoughness`.

This is deliberate.

At:

```text
terrainRoughness = 0
hasTectonics = false
```

additional geometry relief is zero.

At:

```text
terrainRoughness = 0
hasTectonics = true
```

generic roughness relief remains zero, while deterministic tectonic fault/ridge geometry may still exist.

This preserves the meaning of both definition values instead of making `hasTectonics` merely an alias for rough terrain.

## Intentionally unchanged

No change was made to `terrain/noise.ts` canonical terrain output.

Therefore toggling `hasTectonics` does not change:

- `rawTerrain.height`,
- continent layout,
- `landMask`,
- `mountainMask`,
- `erosionMask`,
- `riverMask`,
- ocean classification inputs,
- climate inputs,
- biome thresholds.

It changes only the additional physical geometry layer and therefore the resulting metric elevation/surface normal where tectonic relief is present.

No material-side fault coloring, lava, emissive cracks or volcanic semantics were added. Those are separate responsibilities.

## Characterization tests

Added:

`tests/PlanetTectonics.test.ts`

Coverage:

### Determinism and gate

For identical seed, terrain and direction:

```text
hasTectonics=false → no tectonic contribution
hasTectonics=true  → deterministic tectonic contribution
repeated sample    → identical result
```

The test samples a deterministic set of sphere directions rather than relying on one hand-picked coordinate to intersect a fault band.

### Independence from terrain roughness

With `terrainRoughness=0`, enabling tectonics can still create tectonic relief while the generic roughness layer stays disabled.

### Canonical terrain invariance

Two otherwise identical definitions with tectonics off/on must retain identical:

- `rawTerrain`,
- `landMask`,
- `isWater`,
- biome,
- climate.

At least one sampled location must show a geometry-relief difference.

## Performance impact

The tectonic contribution adds procedural CPU noise evaluation when canonical terrain samples are requested on a tectonic planet.

It adds:

- no draw calls,
- no textures,
- no shader pass,
- no additional renderer-owned terrain truth.

The implementation remains inside the existing canonical sampler/relief path.

Performance tuning, if later necessary, should optimize this function or cache canonical samples rather than duplicating tectonic logic in Regional or Surface renderers.

## Risk assessment

Risk: **moderate visual, low architectural**.

Expected visible change applies only to definitions with `surface.hasTectonics=true` and appears as additional ridge/fault physical relief.

The change can affect metric elevation, collision/landing height and physical terrain normals by design because tectonics is modeled as real geometry.

It must not affect continent/biome/ocean identity.

## Commits

```text
01eeb20f0ed27896ab4bcbd548146843ae8cf4e9
Add canonical tectonic terrain relief

db2d867d3eea7e77580ecacb1b691a67ff3e16c7
Apply tectonics in canonical terrain sampler

db53bb336a529c01ccca4f7b822330a7afa3e747
Cover canonical tectonic terrain relief
```

## Next value

`surface.hasVolcanism`

Before implementation, distinguish clearly between:

```text
hasVolcanism
    → physical volcanic terrain/masks possible on any suitable solid planet

class === 'lava'
    → broad planetary archetype/material state
```

A volcanic terrestrial/rocky planet must not need to become a lava-class planet merely to express volcanic activity.
