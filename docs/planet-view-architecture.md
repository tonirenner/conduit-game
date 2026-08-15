# Planet View Architecture

## Decision

The planet renderer is no longer one geometry system that is refined from system scale down to the ground.

A planet is rendered through three purpose-built views that share the same deterministic planet data:

```text
PlanetDefinition / terrain seed / climate / biome
                |
                +--> OrbitView
                +--> RegionalView
                +--> SurfaceView
```

The player sees one continuous planet. Internally the renderer switches representation.

## Why

The Planet LOD experiments established several useful boundaries:

- Reducing hundreds of patch draws to a handful of instanced draws is useful, but does not remove the close-range frame-time collapse by itself.
- Simplifying the terrain shader, disabling atmosphere, disabling height displacement and limiting rendered instances does not recover the close-range frame time reliably.
- The global CubeSphere remains a good orbital representation but becomes the wrong data structure when it is forced to manage very dense near-surface LOD.
- The correct optimization is therefore to stop refining the global planet and hand the camera to a renderer designed for the current scale.

## Shared Source Of Truth

All views must derive terrain identity from the same data:

```text
PlanetDefinition
  -> render.terrainSeed
  -> PlanetTerrainSampler
  -> climate / biome / land mask / elevation profile
```

A view may change geometry, material detail, coordinate frame, caches and GPU representation. It must not invent a second planet.

A mountain visible in orbit must remain the same mountain in RegionalView and SurfaceView.

## Views

### OrbitView

Purpose:

- whole-planet silhouette
- system and orbit gameplay
- clouds, atmosphere, rings, moons
- low-frequency terrain identity

Technique:

- global CubeSphere
- deliberately bounded LOD
- no attempt to reach meter-scale terrain
- orbit terrain stops refining once the RegionalView overlap is reached

The orbit renderer may stay alive for atmosphere/cloud continuity after its solid surface has handed off.

### RegionalView

Purpose:

- approach to a selected part of the planet
- preserve orbital macro terrain while introducing stronger local relief
- bridge global curvature to local surface rendering

Technique:

- one camera-facing curved regional patch
- deterministic `PlanetTerrainSampler`
- height/color/normal/AO textures
- optional deterministic hydraulic meso erosion
- geometry edge morph back to the global sphere during OrbitView overlap

RegionalView is not the final ground renderer. It is a transition-scale renderer.

### SurfaceView

Purpose:

- RTS ground gameplay
- units, buildings, resource sites and local terrain
- stable meter-space simulation/rendering

Technique target:

- local tangent/reference frame
- `1 unit = 1 meter`
- floating origin
- fixed reusable GPU grid / clipmap rings
- camera movement changes clipmap origin and data, not the global planet quadtree
- CPU `PlanetTerrainSampler` remains the gameplay/picking truth

The first implementation may use a fixed local tangent grid as a visual handoff scaffold. It must preserve this API boundary so it can be replaced by GPU clipmap rings without changing the view controller.

## Transition Policy

Transitions use overlap bands, never one exact altitude switch.

Initial tuning values:

```text
Orbit -> Regional
  preload regional:     9,750 km
  blend start:          9,000 km
  blend complete:       7,500 km
  release regional up: 10,000 km

Regional -> Surface
  preload surface:      1,250 km
  blend start:          1,000 km
  blend complete:         250 km
  release surface up:   1,500 km
```

The exact numbers are tuning values, not architecture.

### Stability rules

1. Preload the incoming view before it receives visible weight.
2. Keep the outgoing view alive until the incoming view fully covers it.
3. Use smoothstep weights inside an overlap band.
4. Use different enter/release thresholds (hysteresis) so camera jitter cannot create/destroy a view every frame.
5. Anchor RegionalView and SurfaceView from the same normalized planet direction as the camera.
6. Never reset camera target or orientation during a view switch.
7. Do not rebuild a view merely because its blend weight changed.
8. Orbit LOD is clamped to the handoff scale once RegionalView takes over.

## Ownership

The view controller owns lifecycle and transitions:

```text
PlanetViewRuntime
  OrbitView       -> production Planet
  RegionalView    -> RegionalSurfaceHandoffTerrain
  SurfaceView     -> local tangent terrain / later clipmap
```

The Feature Lab should test this production-like runtime rather than maintaining a second collection of renderer experiments.

## Cleanup Rule

The old `PlanetInstancedCubeSphereDebugV*`, batching experiments and performance-isolation UI are diagnostic history, not the target architecture.

Once the new view runtime is wired into Planet LOD and builds cleanly, those files should be removed instead of kept as alternate production paths.

The useful lessons remain in this document; the experimental code does not.
