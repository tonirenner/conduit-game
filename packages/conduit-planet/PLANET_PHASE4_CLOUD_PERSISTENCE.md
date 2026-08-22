# Conduit Planet – Phase 4 Cloud Persistence

## Goal

Make `PlanetDefinition.climate.cloudPersistence` authoritative for the lifetime/speed of cloud and storm structures without turning it into a cloud-coverage control.

## Semantics

`cloudPersistence` controls **temporal persistence**, not cloud amount.

```text
weatherTime
├─ pressure / jet / wind time        -> unchanged
└─ cloud/storm structure time        -> persistence-scaled
```

The normalized mapping is:

```text
structureSpeed = 1.6 - clamp(cloudPersistence, 0, 1) * 1.2
cloudStructureTime = weatherTime * structureSpeed
```

Therefore:

- `cloudPersistence = 0.0` -> structure speed `1.6x`
- `cloudPersistence = 0.5` -> structure speed `1.0x` (historical neutral behavior)
- `cloudPersistence = 1.0` -> structure speed `0.4x`

High-persistence worlds keep recognizable storm-cell/swirl structures for longer. Low-persistence worlds reorganize them faster.

## Architecture

`Weather.ts` now accepts an optional `cloudStructureTime` while pressure, jet bands and wind continue to use canonical weather time.

`CloudPersistence.ts` owns the definition-driven time mapping and exposes:

```ts
getCloudStructureTime(weatherTime, definition)
getPersistentWeatherSample(normal, climate, weatherTime, definition)
```

The canonical weather evaluator remains stateless. Persistence does not require renderer state or frame-to-frame caches.

## Intentionally unchanged

Changing only `cloudPersistence` does not alter:

- `ClimateSample`
- temperature / humidity / aridity
- pressure topology
- low/high pressure masks
- wind bands
- wind strength
- terrain geometry
- land/water classification
- baseline cloud coverage

It may alter the instantaneous position/shape of storm-cell and swirl structures because those structures advance at a different temporal rate.

## Compatibility

`cloudPersistence = 0.5` reproduces the historical cloud-structure timing exactly.

Existing `getWeatherSample()` callers remain valid; the additional options argument is optional.

## Characterization tests

`tests/PlanetCloudPersistence.test.ts` covers:

1. neutral midpoint preserves historical timing,
2. high persistence evolves slower and low persistence faster,
3. pressure and wind remain identical when only persistence changes,
4. cloud/storm structures actually diverge over time,
5. canonical climate truth remains unchanged.

## Phase 4 result

With cloud persistence migrated, every generated `PlanetDefinition.climate` field except `ashLoad` has an explicit canonical climate/weather responsibility. `ashLoad` belongs to volcanic/atmospheric material rendering rather than the general climate/weather migration and remains a separate later visual integration concern.
