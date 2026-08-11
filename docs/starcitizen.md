# StarEngine / Star Citizen Reference Notes

This document is a reference note for our own WebGPU/Three.js space game. It is not a verified internal Star Citizen implementation document and should not be treated as an exact technical blueprint.

Sources used as external reference:

- Star Citizen Genesis / StarEngine video reference: https://www.youtube.com/watch?v=i6FpClCJj4o
- 80.lv summary of the StarEngine showcase: https://80.lv/articles/star-citizen-s-engine-offers-explorble-planets-without-loading-screens
- Planet Tech v4 public notes/wiki summary: https://starcitizen.tools/Planet_Tech_v4

## What Is Useful For Us

The relevant idea is not to copy Star Citizen feature-for-feature. The useful part is the architecture direction:

- large worlds are split into local coordinate spaces
- rendering happens near the camera to avoid float precision issues
- planets are generated from deterministic, artist-directed rules
- climate, biome, material and object placement are connected systems
- high-detail rendering is streamed or generated only where needed
- large world content is organized into hierarchical containers
- atmosphere, clouds, water and terrain are part of one planet presentation stack

## Planet Generation Principle

StarEngine/Genesis-style planet generation appears to be artist-driven procedural generation:

- a planet class defines the broad identity
- rules define height, humidity, temperature, erosion, material zones and biome selection
- seeds add deterministic variation
- hand-authored points of interest can override or enrich generated regions
- the same data can drive terrain material, object placement, resource distribution and gameplay

For our project, this maps to:

- `PlanetClass`
- `ClimateProfile`
- `BiomeProfile`
- `ResourceProfile`
- `PlanetRenderProfile`
- later: `PlanetPoiContainer`

## Large World / Floating Origin

The important principle is to separate simulation coordinates from render coordinates.

Long-term target:

```text
Persistent/System Coordinates
  -> local system coordinates
  -> camera-relative render coordinates
  -> Three.js/WebGPU float coordinates
```

We should not try to render astronomical distances directly in Three.js units. The game state can store large values; rendering should remain local and stable.

## Object Container Streaming

The useful concept is hierarchical world loading:

```text
Universe
  System
    Planet
      Orbit Container
      Surface Region
      POI
      Interior
```

For now this can be in-memory and deterministic. Later it can become async streaming and persistent save/load.

For our current game, first candidates are:

- star systems
- asteroid/debris fields
- station areas
- planet orbit areas
- resource nodes
- later surface POIs

## Planet Rendering Takeaways

The 80.lv summary lists features such as physically based atmospheres, planet surface generation at different LODs, real-time biome generation, terrain displacement, volumetric clouds and gas giant scale clouds.

For our renderer, the realistic equivalent is:

- keep WebGL/WebGPU render output technically aligned where possible
- improve deterministic climate/biome masks
- sharpen ocean-land transitions
- add class-specific atmosphere profiles
- render gas/ice giants with layered cloud bands rather than hard terrain-like surfaces
- build patch/chunk LOD later instead of relying on one sphere material forever

## What Not To Copy Directly

These items are too large or not directly compatible with our current stack:

- HLSL hull/domain hardware tessellation as written in many StarEngine explanations
- full ECS/network architecture
- server-side object container streaming
- nested physics grids for ship interiors
- room pressure simulation
- planet surface walking

They can remain long-term inspiration, not immediate implementation scope.

## Practical Mapping To Our Project

Current useful work:

- improve `ClimateProfile` so planet classes produce stronger, more coherent identities
- make Ocean land masks sharper and less frayed
- make Lava atmosphere visibly redder/hotter
- make Gas Giant and Ice Giant render paths distinct from rocky planets
- use Feature Lab Planet LOD scene to expose all planet classes, render scale, LOD and climate diagnostics
- keep Conduit Web3D focused on reusable rendering infrastructure

Near-term target:

```text
PlanetDefinition
  seed
  class
  radius
  climateProfile
  biomeProfile
  resourceProfile

PlanetRenderer
  surface layer
  atmosphere layer
  cloud/gas layer
  LOD profile
  diagnostics
```

Long-term target:

```text
PersistentGameState
  -> System Container
    -> Planet Container
      -> Orbit Render
      -> Surface/POI Containers
      -> Resource/Station Gameplay State
```

## Priority For Our Game

1. Make the current planet classes visually coherent.
2. Fix Ocean transition quality.
3. Improve Gas/Ice Giant layered cloud presentation.
4. Keep planet climate data consistent between Game and Feature Lab.
5. Introduce patch/chunk LOD only after current single-planet renderer is stable.
6. Add object-container style streaming only when systems become content-heavy.
