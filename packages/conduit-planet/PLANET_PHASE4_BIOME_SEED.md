# Conduit Planet – Phase 4 Biome Seed Migration

## Scope

This step wires only `PlanetDefinition.climate.biomeSeed` into the canonical local biome decision.

It does not change terrain geometry, temperature, humidity, aridity, vegetation, snow, pressure, wind or cloud-potential sampling.

## Previous state

Biome identity was a deterministic function of climate thresholds only. Two planets with identical local climate values therefore always produced the same biome layout at the same directions, even when their generated `biomeSeed` values differed.

## Migration decision

`climate.biomeSeed` owns **ecological spatial variation**, not climate physics.

A coarse deterministic FBM field is derived from `biomeSeed` and used only inside the land-biome decision. The field produces a small ecological bias of approximately `±0.06` humidity-equivalent variation.

This bias can move locations near ecological boundaries between plausible neighboring land biomes, for example:

```text
grassland ↔ temperate forest
savanna ↔ dry hills / grassland
boreal forest ↔ grassland
desert ↔ savanna
```

It cannot alter the actual `ClimateSample.temperature`, `humidity`, `aridity`, `vegetation`, `snow`, `pressure`, `windBand` or `cloudPotential` values.

## Hard gates

The following biome decisions intentionally remain independent from `biomeSeed`:

```text
deepOcean
shallowOcean
coast
snow / ice
mountain
tundra hard-temperature gate
```

The seed only applies after those geographic/physical gates have been resolved.

## Canonical flow

```text
PlanetDefinition.climate.biomeSeed
        ↓
deterministic coarse ecology FBM
        ↓
small ecologyBias
        ↓
getBiome(...)
        ↓
plausible land-biome threshold variation
```

Climate values remain canonical inputs and are not rewritten by the ecology field.

## Legacy compatibility

The optional `PlanetClimateDefinition` argument on `getClimateSample()` remains intact.

Direct three-argument callers receive an ecology bias of zero and therefore retain the historical biome decision behavior.

## Characterization tests

Added `tests/PlanetBiomeSeed.test.ts`.

Coverage:

- different biome seeds can change ecological biome identity while all climate scalars stay exactly equal,
- ocean/coast/mountain hard gates are seed-independent,
- changing only `biomeSeed` does not alter canonical terrain, geometry relief, land mask or water classification through `PlanetTerrainSampler`.

## Architectural boundary

`biomeSeed` is deliberately not used to modify:

- terrain noise,
- terrain relief,
- climate seed,
- temperature,
- humidity,
- aridity,
- weather,
- materials directly.

Materials should later consume the canonical biome output rather than calculate their own biome noise.

## Phase 4 status

```text
[x] climate.seed
[x] climate.temperature01
[x] climate.humidity
[x] climate.aridity
[x] climate.biomeSeed
[ ] climate.weatherSeed / Weather
```

Next isolated step: `climate.weatherSeed` / weather integration.
