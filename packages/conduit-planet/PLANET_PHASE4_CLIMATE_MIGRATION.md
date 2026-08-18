# Conduit Planet – Phase 4 Climate Migration

> Working document for the climate/biome canonicalization phase.
>
> Target: make generated `PlanetDefinition.climate` values authoritative inputs to local climate sampling without changing terrain geometry or creating renderer-owned climate truth.

---

## Rules

- WebGPU first; WebGL follows later.
- `PlanetDefinition.climate` is the global climate domain truth.
- `getClimateSample()` remains the canonical local climate/biome evaluator.
- `PlanetTerrainSampler` supplies terrain context and the generated climate definition.
- Climate migration must not change terrain seed output, geometry relief, collision or land/water classification.
- One climate value/responsibility at a time.
- Existing direct three-argument `getClimateSample()` callers remain compatible while migration is in progress.

---

## Phase 4 progress

- [x] `climate.seed`
- [x] `climate.temperature01`
- [ ] `climate.humidity`
- [ ] `climate.aridity`
- [ ] `climate.biomeSeed`
- [ ] `climate.weatherSeed` / weather integration

---

# 1. `climate.seed` + `climate.temperature01`

## Previous state

`getClimateSample(normal, height, landMask)` was planet-independent.

Every planet used the same fixed procedural offsets for the local temperature field:

```text
temperature FBM offsets: 12.4 / 4.1 / 8.8
```

The generated values:

```ts
PlanetDefinition.climate.seed
PlanetDefinition.climate.temperature01
```

were not supplied to the canonical terrain climate sample.

Consequences:

- planets shared the same local temperature-noise identity for equal terrain directions,
- generated global temperature intent was not the baseline of local temperature sampling,
- climate/biome output could disagree with the already-generated planet definition.

## Migration decision

### `climate.seed`

`climate.seed` owns the deterministic spatial identity of the local climate field.

For this first Phase-4 step it affects **temperature noise only**.

The seed is converted into three deterministic offsets and added to the existing temperature FBM offsets. This preserves the existing frequency/amplitude structure while giving each planet its own spatial temperature pattern.

No random state is consumed during sampling; identical inputs remain exactly deterministic.

### `climate.temperature01`

`climate.temperature01` is treated as the generated **global temperature baseline**.

The existing local temperature model remains responsible for:

- latitude / equator warmth,
- altitude cooling,
- polar cooling,
- local procedural temperature variation.

The generated global temperature contributes an additive normalized bias around the historical neutral midpoint `0.5`:

```text
global bias = (clamp(temperature01, 0, 1) - 0.5) * 0.85
```

This keeps the local latitude/altitude shape intact while allowing cold and hot planets to shift the full field coherently.

## Canonical flow

```text
PlanetDefinition.climate
    ├─ seed
    └─ temperature01
          ↓
PlanetTerrainSampler
          ↓
getClimateSample(normal, rawHeight, landMask, definition.climate)
          ↓
local ClimateSample.temperature
          ↓
existing dependent climate semantics
    aridity / snow / vegetation / cloudPotential / biome
```

Because the existing dependent quantities are calculated after temperature, they automatically see the canonicalized local temperature rather than a disconnected post-process value.

## Production changes

### `src/climate/Climate.ts`

`getClimateSample()` now accepts an optional fourth argument:

```ts
getClimateSample(
    normal,
    height,
    landMask,
    climate?: PlanetClimateDefinition,
)
```

The optional argument deliberately preserves the existing three-argument API for direct legacy/debug callers.

When a climate definition is present:

- `climate.seed` offsets the temperature FBM field,
- `climate.temperature01` biases the generated local temperature,
- the resulting temperature continues through the existing aridity/snow/vegetation/biome logic.

Humidity/aridity global definition values are **not yet wired** in this step.

### `src/near-view/PlanetTerrainSampler.ts`

The canonical sampler now calls:

```ts
getClimateSample(
    normalDirection,
    rawTerrain.height,
    rawTerrain.landMask,
    definition.climate,
)
```

Climate continues to consume the canonical raw terrain height rather than geometry-only relief. Therefore tectonic, volcanic and roughness relief cannot move biome thresholds indirectly.

## Intentionally unchanged

This step does not alter:

- `terrainSeed`,
- `rawTerrain`,
- continent layout,
- `landMask`,
- `geometryReliefRawHeight`,
- `geometryRawHeight`,
- water classification,
- collision / landing height,
- terrain normals,
- `surface.iceCapMask`,
- material shader logic.

`surface.iceCapMask` already uses the global definition temperature directly and remains a separate canonical surface mask.

## Characterization tests

Added:

`tests/PlanetClimateDefinition.test.ts`

Coverage:

1. same climate definition + same input is deterministic,
2. changing only `climate.seed` changes spatial temperature identity,
3. higher `climate.temperature01` monotonically produces equal-or-warmer local samples,
4. changing climate seed/temperature leaves canonical terrain geometry, land mask and water classification unchanged.

## Risk assessment

Risk: **moderate visual, low architectural**.

Expected visible/domain effects:

- terrestrial planets no longer share an identical local temperature-noise layout,
- cold planets can produce more tundra/snow/ice-oriented climate samples,
- hot planets can produce warmer/drier biome outcomes,
- terrain shape and view transitions remain unchanged.

This may legitimately change biome identity at some locations because biome is downstream of canonical climate. That is intended climate behavior, not a geometry regression.

---

# Next step: `climate.humidity`

Wire the generated global humidity tendency into the existing local humidity field while preserving:

- coast/ocean moisture influence,
- rain bands,
- altitude drying,
- local noise variation,
- deterministic terrain independence.

Do not wire `aridity` or `biomeSeed` in the same change.
