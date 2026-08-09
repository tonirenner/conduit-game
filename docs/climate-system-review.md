# Climate System Review

## Current State

The climate system has two layers:

- Global planet climate generated in `PlanetGenerator.ts`
- Local sampled climate/biomes in `Climate.ts` and `Weather.ts`

Global climate is stored on `PlanetDefinition.climate` and forwarded through `PlanetRenderProfile` / `SurfaceRenderProfile`.

Local climate is sampled from:

- latitude
- terrain height
- land mask
- procedural noise
- local pressure/rain bands

## What Works

- Planet classes get plausible global climate profiles.
- Lava, toxic, ocean, terrestrial, desert, ice, gas giant and ice giant have distinct generation modifiers.
- `SurfaceRenderProfile` already carries global climate values.
- WebGL and WebGPU cloud profile paths are now closer: both can receive global cloud persistence, storm activity, wind strength and ash load.
- Planet LOD Feature Lab now displays generated climate values for quick visual inspection.

## Issues Found

- Local biome climate in `Climate.ts` is not yet driven by `PlanetDefinition.climate`.
- CPU climate debug canvas uses generic terrain/climate and does not represent the selected/generated planet.
- WebGL cloud shader contains its own GLSL climate/weather approximation, separate from `Climate.ts` / `Weather.ts`.
- WebGPU clouds are simpler than WebGL clouds and still do not reproduce the full weather-cell logic.
- Global generated values like `seasonality`, `ashLoad`, `stormActivity` currently affect rendering only lightly.

## Changes Made

- `Planet.applyRenderProfile()` now passes climate cloud values into cloud layers:
  - `cloudPersistence`
  - `stormActivity`
  - `windStrength`
  - `ashLoad`
- `CloudLayer` uses those values to influence coverage, density, alpha, weather influence and storm influence.
- `WebGPUCloudLayer` uses the same effective coverage/density/alpha calculation and adjusts cloud drift by wind/storm.
- Planet LOD test now shows:
  - surface palette
  - atmosphere palette
  - temperature
  - humidity
  - aridity
  - wind
  - storm
  - cloud persistence
  - ash load
  - seasonality

## Recommended Next Steps

- Introduce a shared `ClimateProfile` input for `getClimateSample()` so local biome sampling is planet-specific.
- Pass selected planet climate into `createClimateDebugCanvas()` so debug maps match the current Planet LOD scene.
- Move duplicated GLSL cloud climate math toward shared generated constants/uniforms.
- Add Feature Lab climate debug modes for biome, temperature, humidity, aridity, cloud potential and weather.
- Add lightweight unit tests for class climate ranges, especially lava, ocean, desert, ice and toxic.
