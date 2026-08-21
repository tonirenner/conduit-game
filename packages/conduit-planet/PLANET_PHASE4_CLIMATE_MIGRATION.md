# Conduit Planet – Phase 4 Climate Migration

> Working document for the climate/biome canonicalization phase.
>
> Target: make generated `PlanetDefinition.climate` values authoritative inputs to local climate/weather sampling without changing terrain geometry or creating renderer-owned climate truth.

---

## Rules

- WebGPU first; WebGL follows later.
- `PlanetDefinition.climate` is the global climate domain truth.
- `getClimateSample()` remains the canonical local climate/biome evaluator.
- `getWeatherSample()` remains the canonical local dynamic weather evaluator.
- `PlanetTerrainSampler` supplies terrain context and the generated climate definition.
- Climate/weather migration must not change terrain seed output, geometry relief, collision or land/water classification.
- One climate/weather value or responsibility at a time.
- Existing legacy/direct call signatures remain compatible while migration is in progress.

---

## Phase 4 progress

- [x] `climate.seed`
- [x] `climate.temperature01`
- [x] `climate.humidity`
- [x] `climate.aridity`
- [x] `climate.biomeSeed`
- [x] `climate.weatherSeed`
- [x] `climate.windStrength`
- [ ] `climate.stormActivity`
- [ ] `climate.seasonality`
- [ ] `climate.cloudPersistence`

---

# 1. `climate.seed` + `climate.temperature01`

## Migration decision

`climate.seed` owns deterministic spatial identity for the local temperature field. `climate.temperature01` is the generated global temperature baseline layered on top of latitude, altitude, polar cooling and local procedural variation.

The canonical path is:

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
```

The legacy three-argument `getClimateSample()` path remains available.

Characterization coverage: `tests/PlanetClimateDefinition.test.ts`.

---

# 2. `climate.humidity`

## Migration decision

`climate.humidity` is the global humidity baseline, not a replacement for local geography-driven moisture.

```text
localHumidity
    = humidityNoise
    + coast moisture
    + ocean moisture
    + rain-band moisture
    - altitude drying

globalHumidityBias
    = (clamp(humidity, 0, 1) - 0.5) * 0.70
```

Changing humidity may affect downstream aridity, vegetation, cloud potential and biome, but does not change temperature or terrain geometry.

Characterization coverage: `tests/PlanetClimateHumidity.test.ts`.

---

# 3. `climate.aridity`

## Migration decision

`climate.aridity` is the global dryness baseline layered on the existing local dryness model.

```text
localAridity
    = 1 - localHumidity
    + temperature influence
    + dry-noise variation
    - coast moderation

globalAridityBias
    = (clamp(aridity, 0, 1) - 0.5) * 0.65
```

Aridity stays downstream of temperature and humidity and does not feed backward into either.

Characterization coverage: `tests/PlanetClimateAridity.test.ts`.

---

# 4. `climate.biomeSeed`

## Migration decision

`biomeSeed` affects only deterministic ecological variation inside already-plausible land-biome boundaries. It does not modify temperature, humidity, aridity, vegetation, snow, terrain geometry or hard biome gates such as ocean/coast, mountain, snow/ice and tundra.

The ecological variation is intentionally small and coherent so it can shift forest/grassland/savanna/dry-hills/desert transitions without overriding climate physics.

Detailed migration notes: `PLANET_PHASE4_BIOME_SEED.md`.

Characterization coverage: `tests/PlanetBiomeSeed.test.ts`.

---

# 5. `climate.weatherSeed` + `climate.windStrength`

## Previous state

`getWeatherSample(normal, climate, time)` was planet-independent. Jet bands, pressure systems, storm cells and swirl fields used fixed procedural offsets, so planets with equal climate context shared the same weather topology at equal direction/time.

The generated values:

```ts
PlanetDefinition.climate.weatherSeed
PlanetDefinition.climate.windStrength
```

were not consumed by the canonical weather evaluator.

## Migration decision

### `weatherSeed`

`weatherSeed` owns the deterministic spatial identity of dynamic weather fields.

One set of deterministic seed offsets now shifts the existing procedural fields for:

- latitude/jet-band phase,
- broad pressure systems,
- pressure detail,
- storm cells,
- swirl structure.

The existing frequencies, time evolution and climate dependencies remain unchanged. No random state is consumed during sampling, so identical direction + climate + time + definition remains deterministic.

### `windStrength`

`climate.windStrength` owns global wind intensity only.

The historical local wind structure still comes from:

```text
latitude wind
+ jet bands
+ pressure deviation
```

The generated global value is blended after that local structure is calculated:

```text
finalWind = clamp(
    localWind * 0.65
    + clamp(definition.windStrength, 0, 1) * 0.45
)
```

This preserves spatial wind variation while making generated calm/windy planets meaningfully different.

Critically, changing only `windStrength` does **not** change:

- pressure,
- low/high pressure masks,
- wind-band position,
- storm potential,
- cloud boost,
- swirl,
- canonical ClimateSample values.

`stormActivity` remains a separate later control and is intentionally not folded into wind strength.

## API compatibility

`getWeatherSample()` now accepts an optional fourth argument:

```ts
getWeatherSample(
    normal,
    climate,
    time = 0,
    definition?: PlanetClimateDefinition,
)
```

Existing three-argument callers retain the historical behavior.

## Characterization tests

Added `tests/PlanetWeatherWind.test.ts`.

Coverage:

1. same weather seed/climate/time is deterministic,
2. changing only `weatherSeed` changes the spatial weather identity,
3. higher `windStrength` monotonically increases local wind intensity,
4. changing only wind strength leaves all non-wind WeatherSample fields identical,
5. weather sampling does not mutate/redefine the canonical ClimateSample.

## Risk assessment

Risk: **moderate visual/domain, low architectural**.

Expected effects:

- different planets no longer share the same pressure/jet/storm-cell map at equal direction and time,
- generated calm worlds remain spatially varied but globally calmer,
- generated windy worlds retain the same local structure at higher intensity,
- terrain, climate and biome truth remain unchanged.

---

# Next step: `climate.stormActivity`

Wire `stormActivity` only as the generated global storm tendency applied to existing local storm ingredients:

- cloud potential,
- instability,
- storm cells,
- low/high pressure.

It must not alter the pressure topology, climate temperature/humidity/aridity, wind-strength control or terrain geometry.

Do not wire `seasonality` or `cloudPersistence` in the same change.
