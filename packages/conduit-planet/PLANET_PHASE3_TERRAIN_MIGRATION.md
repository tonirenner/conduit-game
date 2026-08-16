# Conduit Planet – Phase 3 Terrain Definition Migration

> Working document for Phase 3 of `PLANET_STABILIZATION_PLAN.md`.
>
> Target: wire existing `PlanetDefinition.surface` values into the canonical WebGPU-first terrain path without losing definition semantics or creating parallel terrain truth.

---

## Rules

- WebGPU first; WebGL follows later.
- `PlanetDefinition` remains domain truth.
- `PlanetTerrainSampler` remains canonical physical/land-water terrain authority for Regional/Surface/landing consumers.
- Geometry, collision and material must not invent independent ocean/terrain thresholds.
- One definition value at a time.
- Do not mix visual retuning with definition migration.
- Stable rollback point before Phase 3: branch `planet-stable-pre-phase3-2026-08-16`, commit `61e6d020dfbd6e730883c6d0e3acfc7101a03e59`.

---

## Phase 3 progress

- [x] `surface.oceanLevel`
- [ ] `surface.terrainRoughness`
- [ ] `surface.hasTectonics`
- [ ] `surface.hasVolcanism`
- [ ] `surface.hasIceCaps`

---

# 1. `surface.oceanLevel`

## Previous state

`PlanetDefinition.surface.oceanLevel` was generated and copied into render profiles, but the canonical `PlanetTerrainSampler` ignored it.

Water classification was hardcoded as:

```ts
isWater = definition.surface.hasOcean && rawTerrain.landMask < 0.54;
```

This meant every ocean-capable solid planet effectively shared the same water threshold regardless of its generated definition.

The generated values already encode class-specific intent:

```text
Ocean planets:       roughly 0.72 .. 0.92
Terrestrial planets: roughly 0.38 .. 0.64
Dry/no-ocean classes: commonly negative values, with hasOcean=false
```

The fixed `0.54` therefore behaved like a legacy Earth-like preset rather than the canonical definition value.

## Migration decision

Interpret `surface.oceanLevel` as the **normalized canonical land-mask threshold used to classify water coverage**.

It is intentionally **not** interpreted as meters above a physical datum.

Canonical rule:

```text
hasOcean = false
    → never water

hasOcean = true
    → water when landMask < clamp(surface.oceanLevel, 0, 1)
```

Implementation owner:

```text
PlanetDefinition.surface.oceanLevel
        ↓
PlanetTerrainSampler.oceanLandMaskThreshold
        ↓
PlanetSurfaceSample.isWater
        ↓
Regional / Surface material / landing-water semantics
```

## Changed production code

`src/near-view/PlanetTerrainSampler.ts`

Added:

```ts
readonly oceanLandMaskThreshold: number;
```

Initialized once from the definition:

```ts
this.oceanLandMaskThreshold = THREE.MathUtils.clamp(
    definition.surface.oceanLevel,
    0,
    1,
);
```

Water classification now uses:

```ts
isWater:
    this.definition.surface.hasOcean &&
    rawTerrain.landMask < this.oceanLandMaskThreshold
```

## Intentionally unchanged

### Terrain geometry

No terrain height, displacement, relief or normals were changed.

Therefore this migration does **not** alter:

- terrain seed output,
- mountain geometry,
- erosion geometry,
- Regional/Surface height continuity,
- collision surface radius,
- terrain normal calculation.

Only land/water classification changes according to the already-generated definition.

### `PlanetElevationProfile.oceanLevelMeters`

`PlanetElevationProfile` currently contains:

```ts
oceanLevelMeters: 0
```

This field was **not** connected during this step.

Reason: a metric sea-surface altitude is a different responsibility from the normalized land-mask coverage threshold currently represented by `PlanetDefinition.surface.oceanLevel`.

Do not silently map one onto the other without first defining a physical water-surface model.

Possible future model:

```text
normalized ocean coverage threshold
    → decides which terrain belongs to ocean basin

metric ocean surface radius/elevation
    → decides physical water-plane height
```

Those may eventually be related, but they are not treated as equivalent in this migration.

### Climate/Biome

Climate still receives the canonical raw terrain `landMask` directly and is not changed in this step.

Climate/Biome integration belongs to Phase 4 and must later decide whether it should additionally consume canonical `isWater`/coast distance rather than duplicate a threshold.

### Surface material coastline detail

No coast/shelf/island visual tuning was changed.

Phase 2 already identified that detailed water/coast semantics should ultimately consume canonical terrain masks rather than calculate an independent ocean truth inside the material.

---

## Characterization tests

Added:

`tests/PlanetOceanLevel.test.ts`

Coverage:

### Definition threshold affects water coverage

Two otherwise identical terrestrial definitions use the same terrain seed and direction:

```text
oceanLevel = 0.30 → sample is land
oceanLevel = 0.80 → same sample is water
```

The raw `landMask` must remain identical, proving this step does not mutate terrain generation.

### `hasOcean` remains the hard gate

Even with:

```text
oceanLevel = 1.0
```

`hasOcean=false` must yield `isWater=false`.

### Domain clamping

The canonical threshold is clamped to the normalized land-mask domain:

```text
-0.5 → 0
 1.5 → 1
```

---

## Risk assessment

Risk: **low / localized**.

Expected visible difference:

- generated terrestrial planets may expose more or less ocean than before,
- generated ocean planets should generally classify substantially more terrain as water,
- dry planets remain unchanged because `hasOcean=false` gates water classification.

Expected non-differences:

- no new vertices,
- no LOD changes,
- no atmosphere changes,
- no shader architecture changes,
- no terrain noise changes,
- no camera changes,
- no performance-sensitive per-frame architecture change.

The threshold is calculated once in the sampler constructor.

---

## Commits

Production migration:

```text
d47544591994021f203a24c0667033e88e29f0c8
Use planet ocean level for canonical water mask
```

Characterization tests:

```text
59e32f4d22d7063b59633f956fafd0b60f906d6a
Cover canonical ocean level water threshold
```

Documentation:

This file records the Phase-3 decision and progress.

---

## Test status

Tests were added to the repository, but no local/CI execution is claimed by this documentation step.

When convenient, run the package test suite before considering the Phase-3 batch fully stabilized.

The pre-Phase-3 stable branch remains available as an exact rollback point.

---

# 2. Next value: `surface.terrainRoughness`

Status: **not started**.

Before code changes, define responsibility explicitly because `terrainRoughness` can plausibly affect multiple scales:

```text
macro geometry roughness
meso terrain detail / erosion
surface material roughness
micro-normal strength
```

Do not multiply all four by the same value blindly.

Required next step:

1. inspect old consumers,
2. identify intended semantic range,
3. separate geometry influence from PBR roughness,
4. add characterization tests,
5. migrate one narrow responsibility first.
