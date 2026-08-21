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
- [x] `climate.stormActivity`
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

## Migration decision

### `weatherSeed`

`weatherSeed` owns the deterministic spatial identity of dynamic weather fields.

One set of deterministic seed offsets shifts the existing procedural fields for:

- latitude/jet-band phase,
- broad pressure systems,
- pressure detail,
- storm cells,
- swirl structure.

The existing frequencies, time evolution and climate dependencies remain unchanged.

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

Changing only `windStrength` does not alter pressure, storm potential, cloud boost, swirl or canonical ClimateSample values.

Characterization coverage: `tests/PlanetWeatherWind.test.ts`.

---

# 6. `climate.stormActivity`

## Previous state

Local storm potential already had meaningful dynamic inputs:

```text
cloud potential
+ atmospheric instability
+ seeded storm cells
+ low-pressure boost
- high-pressure suppression
```

But generated `PlanetDefinition.climate.stormActivity` was not consumed by `getWeatherSample()`. Two otherwise equal planets with very different generated storm tendency could therefore still produce identical storm potential.

## Migration decision

`climate.stormActivity` is a **global storm tendency** layered on top of the existing local storm physics.

The existing local structure remains unchanged:

```text
localStormPotential
    = cloudPotential
    + instability
    + stormCells
    + lowPressure
    - highPressure
```

The generated definition contributes a normalized bias around the neutral midpoint:

```text
globalStormBias
    = (clamp(stormActivity, 0, 1) - 0.5) * 0.60

stormPotential
    = clamp(localStormPotential + globalStormBias, 0, 1)
```

This means a globally stormy planet still needs the existing local weather structure to decide *where* storms form, while the definition controls how readily those systems become storm-active.

## Dependency direction

`stormActivity` must not feed backward into pressure topology or wind generation.

Changing only `stormActivity` therefore leaves unchanged:

- pressure,
- low/high pressure masks,
- wind-band position,
- final wind strength,
- climate temperature/humidity/aridity,
- terrain/biome truth.

It may legitimately change downstream weather presentation values that already consume final `stormPotential`:

- `cloudBoost`,
- `swirl`.

That is intentional one-directional weather dependency rather than a second pressure/storm simulation.

## API compatibility

No signature change was required. `stormActivity` is read only when the optional `PlanetClimateDefinition` is supplied to `getWeatherSample()`.

The historical three-argument path remains unchanged.

## Characterization tests

Added `tests/PlanetWeatherStormActivity.test.ts`.

Coverage:

1. higher `stormActivity` monotonically increases/equalizes storm potential,
2. changing only storm activity leaves pressure, pressure masks, wind band and wind strength identical,
3. cloud boost and swirl may react only downstream of final storm potential.

## Risk assessment

Risk: **moderate visual/domain, low architectural**.

Expected effects:

- low-storm planets keep the same pressure/cell topology but fewer systems reach high storm potential,
- storm-active planets more readily turn suitable local weather into strong storm systems,
- wind and pressure remain independently controlled,
- no terrain/climate geometry semantics change.

---

# Next step: `climate.seasonality`

Wire `seasonality` only as a deterministic time-varying modulation of weather/climate intensity. It should not redefine the static global climate baseline or mutate terrain/biome truth directly.

Before implementation, define the time scale clearly so seasonal cycles remain deterministic and renderer-independent.

Do not wire `cloudPersistence` in the same change.
