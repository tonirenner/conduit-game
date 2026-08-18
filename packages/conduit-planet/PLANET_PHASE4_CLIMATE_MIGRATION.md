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
- [x] `climate.humidity`
- [x] `climate.aridity`
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

# 2. `climate.humidity`

## Previous state

The local humidity model already combined useful spatial context:

```text
humidity noise
+ coastline influence
+ ocean moisture
+ latitude rain bands
- altitude drying
```

However, generated `PlanetDefinition.climate.humidity` was not part of that calculation. Two planets with different global humidity tendencies therefore still shared the same local humidity result when sampled at the same terrain context.

## Migration decision

`climate.humidity` is the global humidity baseline, not a replacement for the local humidity field.

The historical local structure remains intact:

```text
localHumidity
    = humidityNoise
    + coast moisture
    + ocean moisture
    + rain-band moisture
    - altitude drying
```

The generated definition contributes an additive normalized bias around the neutral midpoint `0.5`:

```text
globalHumidityBias = (clamp(humidity, 0, 1) - 0.5) * 0.70
finalHumidity = clamp(localHumidity + globalHumidityBias, 0, 1)
```

This gives globally dry/wet planets coherent tendencies while preserving local geography-driven variation.

## Downstream behavior

The generated `climate.aridity` definition value is **not** wired in this step.

Existing local aridity already depends on the calculated local humidity:

```text
local aridity ~ 1 - humidity + temperature + dry noise - coast influence
```

Therefore changing global humidity legitimately changes the downstream calculated aridity, vegetation, cloud potential and biome outcomes. This is not equivalent to consuming `PlanetDefinition.climate.aridity`; that value remains a separate Phase-4 migration responsibility.

## Intentionally unchanged

Changing only `climate.humidity` does not change:

- `climate.seed` or temperature noise identity,
- local temperature,
- terrain seed output,
- `rawTerrain`,
- `geometryReliefRawHeight`,
- `geometryRawHeight`,
- land/water classification,
- collision / landing height,
- terrain normals.

The old three-argument `getClimateSample()` path also remains unchanged because the global humidity bias is applied only when a `PlanetClimateDefinition` is supplied.

## Characterization tests

Added:

`tests/PlanetClimateHumidity.test.ts`

Coverage:

1. higher `climate.humidity` monotonically produces equal-or-wetter local samples,
2. changing humidity alone leaves local temperature unchanged,
3. coast/ocean moisture remains stronger than dry inland context at a neutral global humidity baseline,
4. changing only global humidity leaves canonical terrain geometry, land mask and water classification unchanged.

## Risk assessment

Risk: **moderate visual/domain, low architectural**.

Expected effects:

- wet planets gain more humid local regions and cloud/vegetation potential,
- dry planets retain the same local humidity structure but shift downward globally,
- coastlines and oceans still provide local moisture,
- biome changes can occur because biome is downstream of canonical climate,
- terrain geometry remains identical.

---

# 3. `climate.aridity`

## Previous state

Local aridity was already derived from meaningful local climate context:

```text
1 - humidity
+ temperature contribution
+ dry-noise variation
- coastline moderation
```

But generated `PlanetDefinition.climate.aridity` was not consumed. Therefore two planets with different global dryness tendencies could still produce identical local aridity when temperature, humidity and terrain context matched.

## Migration decision

`climate.aridity` is the global dryness baseline, layered on top of the existing local aridity model.

The existing local calculation remains authoritative for geography-driven variation:

```text
localAridity
    = 1 - localHumidity
    + temperature influence
    + dry-noise variation
    - coast moderation
```

The generated definition contributes an additive normalized bias around the neutral midpoint `0.5`:

```text
globalAridityBias = (clamp(aridity, 0, 1) - 0.5) * 0.65
finalAridity = clamp(localAridity + globalAridityBias, 0, 1)
```

This preserves wet coasts and humid regions as relatively less dry while allowing globally arid planets to shift the complete dryness field upward.

## Direction of dependency

Aridity is downstream of temperature and humidity.

Changing only `climate.aridity` must therefore **not** alter:

- local temperature,
- local humidity.

It may legitimately change:

- vegetation,
- cloud potential,
- savanna/desert/dry-hills biome selection.

This keeps the climate dependency graph one-directional instead of allowing a derived dryness value to feed backward into moisture or temperature.

## Intentionally unchanged

Changing only global aridity does not alter:

- `climate.seed`,
- temperature noise identity,
- global/local humidity,
- terrain seed output,
- `rawTerrain`,
- `geometryReliefRawHeight`,
- `geometryRawHeight`,
- land/water classification,
- collision / landing height,
- terrain normals.

The three-argument legacy/debug `getClimateSample()` path remains unchanged because no global aridity bias exists without a supplied `PlanetClimateDefinition`.

## Characterization tests

Added:

`tests/PlanetClimateAridity.test.ts`

Coverage:

1. higher `climate.aridity` monotonically produces equal-or-drier local samples,
2. changing aridity alone leaves temperature and humidity identical,
3. coast/humidity moderation remains active even with a non-neutral global dryness baseline,
4. changing only global aridity leaves canonical terrain geometry, land mask and water classification unchanged.

## Risk assessment

Risk: **moderate visual/domain, low architectural**.

Expected effects:

- globally arid planets produce more dry-hills/savanna/desert outcomes where thresholds permit,
- humid coastal regions remain relatively moderated,
- vegetation and cloud potential can fall in dry regions,
- terrain geometry remains identical.

---

# Next step: `climate.biomeSeed`

Use `biomeSeed` only for deterministic spatial variation inside biome/climate classification. It must not modify terrain geometry or become a second terrain seed.

Likely first responsibility:

- offset one or more biome-transition/local ecological variation fields,
- preserve temperature/humidity/aridity baselines,
- keep deterministic results for identical definition + direction,
- allow otherwise identical climate definitions with different `biomeSeed` values to produce different local biome boundaries.

Do not wire `weatherSeed` in the same change.
