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
- [x] `surface.terrainRoughness`
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

## Characterization tests

Added `tests/PlanetOceanLevel.test.ts`.

Coverage:

- different `oceanLevel` values alter only water classification for identical terrain,
- `hasOcean=false` remains the hard gate,
- threshold values are clamped to `0..1`.

## Risk assessment

Risk: **low / localized**.

Expected visible difference:

- generated terrestrial planets may expose more or less ocean than before,
- generated ocean planets should generally classify substantially more terrain as water,
- dry planets remain unchanged because `hasOcean=false` gates water classification.

## Commits

```text
d47544591994021f203a24c0667033e88e29f0c8
Use planet ocean level for canonical water mask

59e32f4d22d7063b59633f956fafd0b60f906d6a
Cover canonical ocean level water threshold

9425d66f791330546e2bea04a55ba41ee4174dea
Document phase 3 ocean level migration
```

---

# 2. `surface.terrainRoughness`

## Previous state

`surface.terrainRoughness` was generated per planet and copied into `PlanetRenderProfile` / `SurfaceRenderProfile`, while the modern canonical near/regional terrain path did not use it to control physical terrain detail.

The old WebGPU material also carried a `profileTerrainRoughness` uniform, but that path mixed material and terrain concerns and is not the target architecture.

The generated ranges clearly express an intended physical terrain character:

```text
Ocean:       ~0.10 .. 0.34
Toxic:       ~0.16 .. 0.48
Ice:         ~0.18 .. 0.56
Desert:      ~0.22 .. 0.58
Terrestrial: ~0.32 .. 0.74
Carbon:      ~0.34 .. 0.82
Rocky:       ~0.50 .. 0.92
Metal-rich:  ~0.52 .. 0.96
Barren:      ~0.62 .. 1.00
Lava:        ~0.72 .. 1.00
```

This is a good fit for **terrain surface irregularity**, but not for blindly scaling all elevation or PBR roughness.

## Migration decision

`surface.terrainRoughness` controls the strength of the **additional geometry-only meso/local relief layer**.

It does **not** directly control:

- canonical low-frequency terrain / continent layout,
- macro mountain height,
- ocean threshold,
- climate or biome classification,
- PBR material roughness,
- fragment micro-normal strength.

Responsibility split:

```text
mountainScale
    → macro relief / elevation character

terrainRoughness
    → strength of additional meso + local physical geometry relief

material roughness
    → PBR light response

micro normals
    → fragment-scale visual detail
```

Canonical flow:

```text
PlanetDefinition.surface.terrainRoughness
        ↓
PlanetTerrainSampler.terrainRoughness
        ↓
getTerrainGeometryReliefRawHeight(..., terrainRoughness)
        ↓
geometryReliefRawHeight
        ↓
Regional / Surface / landing / terrain normals
```

## Changed production code

### `src/terrain/TerrainGeometryRelief.ts`

`getTerrainGeometryReliefRawHeight()` now accepts an optional normalized roughness argument:

```ts
getTerrainGeometryReliefRawHeight(
    normal,
    terrain,
    config,
    terrainRoughness = 1,
)
```

The value is clamped to `0..1` and scales the final additional geometry relief:

```ts
const roughnessStrength = clamp(terrainRoughness, 0, 1);

return geometryOnlyRelief
    * config.heightScale
    * roughnessStrength;
```

The default remains `1` so existing direct callers retain their previous behavior until explicitly migrated.

### `src/near-view/PlanetTerrainSampler.ts`

Added:

```ts
readonly terrainRoughness: number;
```

Initialized from the definition:

```ts
this.terrainRoughness = THREE.MathUtils.clamp(
    definition.surface.terrainRoughness,
    0,
    1,
);
```

The same value is used for both normal terrain sampling and the neighboring height samples used to derive physical terrain normals.

This is important: geometry and normals cannot disagree about terrain roughness.

## Geometry behavior

At `terrainRoughness = 0`:

```text
canonical raw terrain remains
additional meso/local geometry relief = 0
```

At `terrainRoughness = 0.5`:

```text
same canonical terrain
same relief pattern
half additional relief amplitude
```

At `terrainRoughness = 1`:

```text
same behavior as the previous full-strength GeometryRelief layer
```

This preserves deterministic topology/pattern identity while varying only the amplitude of secondary physical detail.

## Intentionally unchanged

### Canonical raw terrain

No changes were made to `terrain/noise.ts`.

Therefore `terrainRoughness` does not alter:

- continent generation,
- landMask,
- mountainMask,
- erosionMask,
- riverMask,
- canonical `rawTerrain.height`.

### Climate and biome

Climate/Biome continue to consume canonical raw terrain values. Geometry-only roughness cannot move biome thresholds.

### `mountainScale`

No new roughness factor was added to `PlanetElevationProfile.maxElevationMeters`.

`mountainScale` remains responsible for macro elevation character and will not be duplicated by `terrainRoughness`.

### Material PBR roughness

No changes were made to `SurfaceTerrainMaterial` roughness values.

The name overlap is intentional domain terminology but the responsibilities remain separate:

```text
surface.terrainRoughness = physical terrain shape character
material roughness       = optical/PBR surface response
```

### Micro normals / cavity

No fragment-side tuning changed. That remains a material migration concern, not Phase-3 terrain-definition wiring.

## Characterization tests

Added:

`tests/PlanetTerrainRoughness.test.ts`

Coverage:

### Linear secondary-relief scaling

For identical terrain/config/direction:

```text
roughness 0.0 → relief 0
roughness 0.5 → half of full relief
roughness 1.0 → full relief
```

### Domain clamping

```text
-0.5 → same as 0
 1.5 → same as 1
```

### Canonical terrain invariance

Two otherwise identical planet definitions with roughness `0` and `1` must retain identical:

- `rawTerrain`,
- `landMask`,
- biome,
- climate.

Only `geometryReliefRawHeight` is expected to change.

## Risk assessment

Risk: **low-to-moderate visual, low architectural**.

Reason:

Generated planets previously received the GeometryRelief layer at full strength regardless of their definition. They now scale it according to their generated `terrainRoughness`.

Expected visual effect:

- ocean/toxic/ice planets become smoother in meso/local physical relief,
- terrestrial/desert planets become moderately smoother,
- rocky/metal-rich/barren/lava planets remain comparatively rough,
- continent layout and broad mountain identity remain stable.

No new terrain samples, draw calls, textures or shader work were added.

## Commits

```text
32959792880893aabf35f49a996caad4cfbc63d2
Drive geometry relief from terrain roughness

877ad84c822ecab59592253ab1fdbfb27a845f30
Apply terrain roughness in canonical sampler

211ab86cbcf7efab91ca72167a6ffa0802a97be3
Cover terrain roughness geometry relief
```

---

## Test status

Characterization tests are committed, but no local/CI execution is claimed unless an actual runner reports success.

The pre-Phase-3 stable branch remains available as an exact rollback point.

---

# 3. Next value: `surface.hasTectonics`

Status: **not started**.

Before code changes, define tectonics as a deterministic canonical terrain influence rather than a material-only effect.

Likely responsibility boundary:

```text
hasTectonics
    → enables tectonic ridge/fault contribution to geometry/masks
    → should not globally rescale all terrain
    → should remain deterministic from existing terrain seed initially
```

Required next step:

1. inspect old tectonic/profile behavior,
2. identify whether useful fault/ridge semantics already exist,
3. add a narrow geometry/mask contribution,
4. keep climate/biome thresholds stable unless explicitly intended,
5. add characterization tests,
6. document before proceeding to volcanism.
