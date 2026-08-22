# Conduit Planet – Phase 4 Climate Migration

> Status: **complete**
>
> Goal: make generated `PlanetDefinition.climate` values authoritative inputs to canonical climate/weather sampling without changing terrain geometry or creating renderer-owned climate truth.

---

## Rules

- WebGPU first; WebGL follows later.
- `PlanetDefinition.climate` is the global climate domain truth.
- `getClimateSample()` owns canonical static local climate/biome evaluation.
- `getWeatherSample()` owns canonical fast local dynamic weather evaluation.
- Slow orbital/seasonal effects are layered separately from static climate truth.
- Climate/weather migration must not change terrain seed output, geometry relief, collision or land/water classification.
- Existing legacy/direct call signatures stay compatible where practical.

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
- [x] `climate.seasonality`
- [x] `climate.cloudPersistence`

`climate.ashLoad` is intentionally **not** part of the general climate/weather migration. It belongs to later volcanic/atmospheric visual-material integration.

---

# Canonical responsibilities

## `climate.seed`

Owns deterministic spatial identity of the local temperature field.

## `climate.temperature01`

Owns the generated global temperature baseline. Latitude, altitude, polar cooling and local procedural variation remain local modifiers.

Characterization: `tests/PlanetClimateDefinition.test.ts`.

---

## `climate.humidity`

Owns the global humidity baseline layered on top of local coast/ocean/rain-band/altitude moisture structure.

Characterization: `tests/PlanetClimateHumidity.test.ts`.

---

## `climate.aridity`

Owns the global dryness baseline downstream of temperature and humidity. It does not feed backward into either.

Characterization: `tests/PlanetClimateAridity.test.ts`.

---

## `climate.biomeSeed`

Owns deterministic ecological variation inside already plausible biome boundaries.

It does not modify temperature, humidity, aridity, vegetation, snow, terrain geometry or hard ocean/coast/mountain/snow/tundra gates.

Detailed notes: `PLANET_PHASE4_BIOME_SEED.md`.

Characterization: `tests/PlanetBiomeSeed.test.ts`.

---

## `climate.weatherSeed`

Owns deterministic spatial identity of dynamic weather fields:

- jet-band phase,
- pressure systems,
- pressure detail,
- storm cells,
- swirl structure.

## `climate.windStrength`

Owns global wind intensity only. Local wind structure remains derived from latitude, jet bands and pressure deviation.

Characterization: `tests/PlanetWeatherWind.test.ts`.

---

## `climate.stormActivity`

Owns the global storm tendency layered on top of local storm ingredients:

```text
cloud potential
+ instability
+ storm cells
+ low pressure
- high pressure
```

Changing only storm activity does not alter pressure topology or wind generation. `cloudBoost` and `swirl` may react downstream through final `stormPotential`.

Characterization: `tests/PlanetWeatherStormActivity.test.ts`.

---

## `climate.seasonality`

Owns the strength of slow orbital-seasonal weather modulation.

Season phase comes from the canonical game `SimulationClock` and each planet's `orbit.orbitalPeriod`:

```text
SimulationClock elapsedSeconds
+ orbitalPeriod in Earth-year units
→ normalized seasonPhase 0..1
```

`01.01.3030 00:00:00` is phase zero only; it is deliberately not named as a terrestrial season.

Current seasonal effects are layered on dynamic storm/cloud/swirl response and are mirrored between hemispheres. Static canonical climate/terrain truth remains time-independent.

Detailed notes: `PLANET_PHASE4_SEASONALITY.md`.

Characterization:

- `tests/PlanetSeasonality.test.ts`
- root `tests/PlanetSeasonCycle.test.ts`
- root `tests/SimulationClock.test.ts`

---

## `climate.cloudPersistence`

Owns temporal persistence of storm-cell/cloud structure, **not cloud amount**.

Fast weather time is split conceptually:

```text
weatherTime
├─ pressure / jet / wind time   → unchanged
└─ cloud/storm structure time   → persistence-scaled
```

Mapping:

```text
structureSpeed = 1.6 - clamp(cloudPersistence, 0, 1) * 1.2
cloudStructureTime = weatherTime * structureSpeed
```

Semantics:

- `0.0` → faster-changing structures (`1.6x`)
- `0.5` → exact historical timing (`1.0x`)
- `1.0` → slower-changing structures (`0.4x`)

Pressure topology, wind, static climate and baseline cloud coverage remain unchanged.

Detailed notes: `PLANET_PHASE4_CLOUD_PERSISTENCE.md`.

Characterization: `tests/PlanetCloudPersistence.test.ts`.

---

# Canonical dependency flow after Phase 4

```text
PlanetDefinition.climate
        ↓
PlanetTerrainSampler
        ↓
ClimateSample
        ↓
getWeatherSample()
        ↓
weatherSeed / windStrength / stormActivity
        ↓
seasonal layer + cloud-persistence time layer
        ↑
SimulationClock + planet orbitalPeriod
```

Terrain geometry, landing/collision and land/water classification remain outside the dynamic climate/weather dependency graph.

---

# Phase 4 completion criteria

Completed:

- generated climate baselines are consumed by canonical climate sampling,
- biome identity has a dedicated deterministic seed,
- dynamic weather has a dedicated deterministic seed,
- global wind and storm controls have isolated responsibilities,
- simulation-driven orbital season phase exists,
- cloud persistence controls temporal structure rather than cloud quantity,
- characterization tests protect terrain/climate/weather responsibility boundaries.

Phase 4 is closed. The next stabilization work can continue with the definition-usage cleanup plan without reopening climate/weather ownership.
