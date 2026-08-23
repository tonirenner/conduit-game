# Climate System Review

## Status

This document describes the current climate / biome / weather architecture after the Phase 4 migration.

The canonical ownership model is:

```text
PlanetDefinition.climate
    ↓
Climate / Biome / Weather domain functions
    ↓
PlanetTerrainSampler and render consumers
```

Renderer-local climate approximations are not allowed to become a second climate model.

## Global climate

`PlanetDefinition.climate` contains the generated global tendencies and deterministic seeds:

```text
seed
biomeSeed
weatherSeed

temperature01
humidity
aridity
windStrength
stormActivity
seasonality
cloudPersistence
ashLoad
```

Phase 4 completed canonical migration for all values above **except `ashLoad`**, which is intentionally treated as a later volcanic/atmospheric visual-material integration concern.

## Local climate

`Climate.ts` now accepts the generated planet climate definition and uses it as global bias while preserving deterministic spatial variation from latitude, altitude, land/water context and local noise.

Canonical responsibilities include:

- `climate.seed` → climate spatial identity,
- `temperature01` → global temperature bias,
- `humidity` → global moisture bias,
- `aridity` → dry tendency,
- `biomeSeed` → ecological variation without changing hard physical gates.

`PlanetTerrainSampler` passes `definition.climate` into climate sampling, so local biome/climate output is planet-specific rather than generic-by-class only.

## Weather

`Weather.ts` provides local dynamic weather structure:

- pressure,
- low/high pressure tendency,
- wind bands,
- wind strength,
- storm potential,
- cloud boost,
- swirl.

Canonical inputs now include:

- `weatherSeed`,
- `windStrength`,
- `stormActivity`.

The legacy no-definition call path remains deterministic for compatibility.

## Seasonality

Simulation time and seasonal weather are separated by ownership:

```text
SimulationClock
    ↓
getPlanetSeasonCycle(...)
    ↓
season phase
    ↓
SeasonalWeather
```

`PlanetSeasonCycle` converts a planet's generated `orbitalPeriod` from Earth-year units into seconds and derives a normalized orbital/season phase from the shared simulation clock.

`SeasonalWeather` applies a restrained seasonal weather tendency using:

- phase,
- hemisphere,
- `climate.seasonality`.

Current scope is deliberately limited: seasonality modifies weather tendency, not static terrain geometry, vegetation, snow cover or climate classification.

`axialTilt` is not yet part of the seasonal forcing model.

## Cloud persistence

`cloudPersistence` represents temporal coherence/trägheit of cloud structures, **not more cloud coverage**.

`CloudPersistence.ts` transforms cloud-structure time while leaving canonical weather time for pressure/wind intact:

```text
low persistence  → cloud structures evolve faster
mid persistence  → legacy speed
high persistence → cloud structures evolve slower
```

This is stateless temporal scaling, not a cache/history simulation.

## Current composition gap

Seasonality and cloud persistence exist as canonical weather layers, but there is still a composition/integration concern for live runtime consumers:

- `getSeasonalWeatherSample()` applies seasonality to the regular weather path,
- `getPersistentWeatherSample()` applies cloud persistence,
- there is not yet one production-level composed weather API/consumer proven to apply both together everywhere.

A future cleanup should compose these effects in one canonical weather evaluation path and feed it from the shared simulation clock.

## Rendering integration

Cloud layers currently receive global render-profile climate values such as:

- cloud persistence,
- storm activity,
- wind strength,
- ash load.

This is useful visual tuning, but it does not replace the canonical climate/weather domain model.

The debug climate canvas is still an older diagnostic path and should not be treated as proof of the active planet-specific runtime behavior unless it is explicitly fed the selected definition/time.

## Tests

Current package/root tests cover the migrated Phase 4 semantics, including:

- global climate biases,
- biome seed isolation,
- weather seed/wind/storm behavior,
- seasonality neutrality and phase behavior,
- cloud persistence timing semantics,
- simulation-clock / planet-season cycle behavior.

## Remaining work

- compose seasonality + cloud persistence into one canonical live weather path,
- wire that composed path into an active production weather/cloud consumer,
- decide how `axialTilt` should affect seasonal forcing,
- integrate `ashLoad` deliberately with volcanism/atmosphere/material systems,
- update/debug-map consumers to use selected planet definition + simulation time rather than generic defaults.
