# Planet Rendering Target Architecture

The current rendering architecture is defined by `docs/planet-view-architecture.md`.

The previous plan to refine one CubeSphere continuously from orbit down to the physical surface is retired. Planet rendering is now explicitly scale-specific.

## Goal

Planets are deterministic, class-driven game objects whose simulation data, orbital rendering, regional terrain, local surface, resources and later POIs come from the same source data.

```text
PlanetDefinition
  -> Climate / Biome / Resource Data
  -> PlanetTerrainSampler
  -> OrbitView / RegionalView / SurfaceView
  -> Game State / Diagnostics
```

The persistent source of truth is the planet definition and deterministic sampling data, never a mesh.

## Core Principles

- Planet classes define identity first; seeds create deterministic variation.
- Climate, biome, resources and terrain are shared game/render inputs.
- Different distance scales use different render representations.
- A view switch may change geometry, coordinate frame, caches and shader detail, but must not change terrain identity.
- Feature Lab validates the actual view runtime instead of maintaining alternate renderer architectures.

## View Stack

### OrbitView

Use the production `Planet` renderer and global CubeSphere for:

- full-planet silhouette
- orbit/system gameplay
- atmosphere, clouds, rings and moons
- low-frequency terrain identity

Orbit terrain has a bounded useful LOD. Once RegionalView owns the visible ground, CubeSphere LOD stops refining.

### RegionalView

Use `RegionalSurfaceHandoffTerrain` for the approach scale:

- curved camera-local planet patch
- shared `PlanetTerrainSampler`
- regional height/color/normal/AO
- deterministic hydraulic meso erosion where appropriate
- edge morph into the orbital sphere during overlap

RegionalView exists to bridge scales. It is not the final ground renderer.

### SurfaceView

Use a local tangent/reference frame for ground gameplay:

- meter-space simulation/rendering
- floating origin
- units, buildings and resource sites
- fixed reusable GPU terrain grids
- ultimately clipmap rings rather than a planet-wide quadtree

`LocalSurfaceTerrain` is the first stable handoff scaffold. The target implementation is a GPU clipmap that can replace it behind the same view boundary.

## Continuous Handoff

The current initial transition bands are:

```text
Orbit -> Regional: 9,000 km -> 7,500 km
Regional -> Surface: 1,000 km -> 250 km
```

Incoming views preload before the visible blend starts. Lifecycle uses hysteresis so camera jitter does not repeatedly create and destroy renderers.

The controller never changes camera target/orientation during a handoff. Incoming and outgoing views overlap and use smooth weights.

## Shared Surface Contract

```text
PlanetDefinition
  -> render.terrainSeed
  -> PlanetTerrainSampler
  -> elevation / land-water / climate / biome / normal
```

All views must sample the same macro terrain. Regional and Surface may add representation-specific detail, but they must preserve the same large terrain features.

CPU `PlanetTerrainSampler` remains authoritative for gameplay queries and deterministic reconstruction. GPU detail is visual acceleration, not a second simulation world.

## Atmosphere

Atmosphere is conceptually independent from terrain view ownership.

OrbitView may keep atmosphere/cloud layers alive after the solid CubeSphere surface has handed off. Later near-atmosphere work should add altitude-aware Rayleigh/Mie scattering without forcing the orbital terrain representation to remain active.

## Planet Classes

Solid-surface classes use all three views.

Gas and ice giants remain OrbitView-only unless a dedicated atmospheric/deep-cloud view is introduced later. They do not instantiate RegionalView or SurfaceView terrain.

## WebGL / WebGPU

Both backends share:

- `PlanetDefinition`
- terrain seed and sampling
- climate/biome data
- class visual profiles
- transition policy

Backend-specific shader/material implementations may differ. View ownership and terrain identity do not.

## Performance Lessons Locked Into The Design

The Planet LOD experiments established that:

- many draw calls are undesirable, but reducing the CubeSphere to a handful of instanced draws did not by itself solve near-surface frame time;
- disabling atmosphere, displacement and complex terrain shading did not remove the close-range collapse;
- limiting rendered patch instances did not scale frame time enough to justify pushing the global CubeSphere farther;
- continuing to refine and manage the planet-wide terrain hierarchy at close range is the wrong architecture.

Therefore the optimization boundary is the view handoff itself.

## Cleanup

The historical `PlanetInstancedCubeSphereDebugV*`, BatchedMesh experiments, performance-isolation harness and macro-height debug volume are not part of the target renderer and should not return as alternate production paths.

Useful diagnostics should measure the three production views and their handoff state directly.

## Next Work

1. Validate Orbit -> Regional handoff across solid planet classes and seeds.
2. Validate Regional -> Surface handoff and camera continuity.
3. Replace `LocalSurfaceTerrain` internals with fixed GPU clipmap rings while keeping its external view contract.
4. Add local meter-space reference/floating-origin integration for gameplay objects.
5. Add the richer altitude-aware atmosphere transition independently of terrain LOD.
6. Move the proven Regional/Surface implementations from Feature Lab ownership into the `conduit-planet` package once their contracts stop changing.
