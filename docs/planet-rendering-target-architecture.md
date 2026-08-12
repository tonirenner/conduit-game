# Planet Rendering Target Architecture

This document translates the StarEngine/Genesis-style references into a realistic target architecture for this WebGPU/Three.js project.

## Goal

Planets should become deterministic, class-driven game objects whose simulation data, visual rendering, resources and later points of interest are derived from the same source data.

The target is not to copy Star Citizen directly. The target is to build a practical version that fits our current stack:

```text
PlanetDefinition
  -> Climate / Biome / Resource Data
  -> Game State
  -> Planet Renderer
  -> Feature Lab Diagnostics
```

## Core Principles

- Planet classes define identity first; seeds only create variation.
- Climate data should drive both rendering and gameplay.
- WebGL and WebGPU paths should use the same generated inputs wherever possible.
- Rendering stays camera-local and scale-aware.
- High detail should be introduced through LOD and layered effects, not one monolithic shader.
- Feature Lab scenes are the validation surface for every rendering feature.

## Data Model Target

```ts
type PlanetDefinition = {
	id: string;
	seed: number;
	classId: PlanetClassId;
	radiusMeters: number;
	climate: ClimateProfile;
	biomes: BiomeProfile;
	resources: PlanetResourceProfile;
};
```

The important part is ownership: the planet definition is game/simulation data. Meshes, materials and render layers are derived from it and should not become the persistent source of truth.

## Climate And Biomes

Current problem areas:

- Ocean land transitions can look frayed.
- Some classes still share too much visual behavior.
- Lava atmosphere profile is not strong enough in the Game view.
- Gas/Ice Giants still behave too much like surface planets.

Target:

- `ClimateProfile` produces stable temperature, humidity and elevation bands.
- `BiomeProfile` maps climate bands to material zones.
- Ocean masks use stronger thresholding and coast smoothing.
- Lava, Ice, Desert, Ocean, Rock, Gas Giant and Ice Giant get distinct atmosphere/color/cloud rules.

## Render Layers

Each planet should be rendered as a stack of layers:

```text
Planet
  surface
  ocean/water if applicable
  atmosphere
  clouds or gas bands
  rim/scattering
  debug overlays in Feature Lab only
```

Rocky planets:

- surface material
- optional water/ocean mask
- optional clouds
- atmosphere/rim

Gas and Ice Giants:

- no terrain-like hard land/ocean interpretation
- layered cloud bands
- soft depth and color variation
- class-specific atmosphere/rim
- far-distance particles/cloud layers must be subtle

## WebGL / WebGPU Alignment

The two renderer paths should share:

- same `PlanetDefinition`
- same climate sampling
- same biome masks
- same color ramps
- same atmosphere profile constants
- same LOD profile decisions where possible

Only the final implementation details should differ:

- WebGL: classic Three.js materials/shaders
- WebGPU: TSL/NodeMaterial equivalents

When a visual difference appears, the Feature Lab Planet LOD scene should show the selected renderer path, planet class, seed, climate values and active LOD profile.

## LOD Direction

Current renderer can stay sphere/layer based while visuals stabilize.

Longer-term target:

```text
far
  simple sphere
  simplified atmosphere
  low-frequency color/cloud data

medium
  higher material detail
  cloud/atmosphere layers
  stronger biome definition

near/orbit
  full material detail
  sharper masks
  local displacement/normal detail
  optional patch/chunk subdivision later
```

True terrain patch/chunk LOD should wait until:

- planet class visuals are stable
- scale diagnostics are trusted
- WebGL/WebGPU inputs are aligned
- Feature Lab can compare LOD levels reliably

## Object Container Direction

Object-container style streaming is a long-term architecture target, not immediate rendering work.

Initial container candidates:

- star system container
- planet orbit container
- asteroid/debris field container
- station container
- resource node container
- later surface POI container

For now, containers can be deterministic in-memory structures. Persistence and async streaming can come later.

## Feature Lab Requirements

Planet LOD scene should continue to grow into the main validation tool:

- list all planet classes
- editable seed
- current render scale
- camera distance
- radius in meters/render units
- climate sample output
- active LOD profile
- WebGL/WebGPU path indicator
- toggles for atmosphere/clouds/ocean/gas layers
- debug mask views for height, humidity, temperature and biome

Current diagnostic direction:

- Planet LOD owns the first practical Planet Tech workbench.
- Climate/biome debug sampling must use the same planet seed and terrain profile as the production `Planet` instance.
- The debug map is not a second renderer. It is a data view for climate, height, land mask and biome inputs.
- Dominant biome percentages, ocean/coast/land coverage and warnings should make class problems visible before shader tuning starts.

## Near-Term Work

1. Make Planet LOD scene the canonical comparison tool for all planet classes.
2. Surface climate/biome diagnostics per selected class and seed.
3. Document which values are planet-class defaults and which are render-quality overrides.
4. Improve Ocean masks and coastline sharpness.
5. Strengthen Lava atmosphere/rim profile.
6. Split Gas/Ice Giant visual logic from rocky/ocean planet assumptions.
7. Keep far-distance gas/cloud particles subtle.

## Current Implementation Direction

Planet class look tuning should live in one shared profile layer:

```text
PlanetClassVisualProfile
  -> WebGL uniforms
  -> WebGPU/TSL uniforms
```

Class-specific color identity, dry-surface visibility, shadow fill, direct-light scale, and environment contribution should be changed in that profile first. The WebGL and WebGPU shader paths may still implement the math differently, but they should consume the same profile values instead of duplicating independent hardcoded look constants.

The current dry-class tuning order is:

1. Adjust `PlanetClassVisualProfile` first.
2. Compare WebGPU and WebGL in Planet LOD with the same class/seed.
3. Only touch shader math if a shared profile value cannot express the difference.

Carbon currently has strong visibility/fill compensation because its WebGPU path was still reading as nearly black. Rocky is already close enough for a first pass. Metal-Rich now gets the strongest matte night/fill lift of the dry classes, while keeping reduced environment peak/reflection to avoid a chrome look.

## Current Planet Tech Checkpoint

The first Planet Tech implementation step is diagnostics-focused:

- `PlanetDefinition` already contains class, composition, physical, orbit, atmosphere, surface, climate, rings, moons and render seeds.
- `PlanetRenderProfile` already derives renderer kind, feature toggles and palette choices from `PlanetDefinition`.
- `PlanetClassVisualProfile` is the shared class-look tuning layer for WebGL and WebGPU.
- `PlanetClimateDiagnostics` now samples the current `PlanetDefinition` with its production terrain seed/profile and reports:
  - terrain profile
  - average temperature, humidity and aridity
  - ocean/coast/land coverage
  - dominant biome shares
  - simple warnings for class/data mismatches
- `PlanetLodTestScene` now shows a climate debug map for the selected planet class/seed.
- `PlanetLodTestScene` now has runtime lab toggles for surface, ocean data, atmosphere, clouds, gas particles, rings, moons, near-surface terrain and toxic haze.
- Surface, atmosphere, clouds, gas layer, rings, moons and debug terrain can be isolated as render layers. Ocean is still part of the surface shader/profile data, so its lab toggle recreates the temporary diagnostic planet with ocean data disabled.
- `OceanCoastlineProfile` now holds the shared water, shelf and island thresholds consumed by both WebGL GLSL and WebGPU TSL surface materials.

This keeps the next visual passes grounded in data. If Ocean, Lava, Gas Giant or Ice Giant reads wrong, the first question should be whether the class definition/profile data is wrong, before renderer-specific shader math is changed.

## Long-Term Work

1. Patch/chunk LOD for terrain.
2. GPU-assisted culling for dense procedural fields.
3. Object-container streaming.
4. Planet-scale volumetric cloud approximations.
5. Surface POIs and resource distribution derived from the same planet data.
