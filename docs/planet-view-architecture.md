# Planet View Architecture

## Status

This document describes the **current active planet view architecture**.

The renderer no longer refines one global geometry system from orbit all the way to the ground. Solid planets use three purpose-built representations that share the same deterministic planet data:

```text
PlanetDefinition
    ↓
PlanetTerrainSampler / derived render semantics
    ├─ OrbitView
    ├─ RegionalView
    └─ SurfaceView
```

The player should see one continuous planet even though geometry, coordinate frame and material detail change internally.

## Shared source of truth

All views must preserve the same macro planet identity:

```text
PlanetDefinition
  → terrain / climate / composition semantics
  → PlanetTerrainSampler
  → elevation / masks / climate / biome
```

A view may change geometry density, coordinate frame, caches and shader detail. It must not invent a second terrain, composition or climate model.

A mountain, coastline or volcanic region must remain the same feature when ownership moves between views.

## Active views

### OrbitView

Active implementation:

```text
InstancedOrbitTerrain
+ OrbitTerrainVolume
```

Purpose:

- whole-planet silhouette,
- system/orbit gameplay,
- low-frequency terrain identity,
- bounded and predictable rendering cost.

The modern WebGPU solid-surface path uses fixed instanced terrain with a pre-baked terrain LUT. The classic `CubeSphere` stack is retained only as transitional/legacy infrastructure and is hidden/frozen for this path.

Atmosphere, clouds, rings and moons are independent layers and may remain active across terrain ownership changes.

### RegionalView

Active implementation:

```text
CurvedRegionalTileTerrain
```

Purpose:

- approach scale,
- preserve global curvature,
- bridge orbital terrain to local SurfaceView,
- sample canonical physical terrain directly.

Technique:

- curved camera-local regional cap,
- canonical `PlanetTerrainSampler` elevation,
- fixed tile layout merged into one geometry/draw path,
- altitude-driven uniform edge resolution to avoid T-junctions.

RegionalView is not the final ground renderer.

Important current limitation: Regional broad material/color semantics are still simpler than SurfaceView. This is an active consolidation task because differing material semantics are currently visible during Regional → Surface transition.

### SurfaceView

Active implementation:

```text
SurfaceClipmapTerrain
+ SurfaceTerrainMaterial
```

Purpose:

- local ground gameplay,
- meter-space terrain representation,
- units/buildings/resources,
- high local material detail without refining the whole planet.

Technique:

- local tangent/reference frame,
- fixed reusable clipmap rings,
- canonical `PlanetTerrainSampler` for physical terrain samples,
- representation-specific fragment microdetail,
- material-dependent roughness, metalness, micro-normal and cavity/AO.

Surface material detail is visual. Terrain displacement/collision authority remains outside the material.

## Material semantics

Current ownership principle:

```text
PlanetDefinition
    ↓
SurfaceMaterialSemantics / SurfaceRenderProfile
    ↓
renderer material evaluation
```

Composition values must not be independently reinterpreted in each renderer.

The active Surface renderer and `SurfaceRenderProfile` now share canonical composition-derived semantics for:

- water,
- ice,
- lava/volcanism,
- toxic/volatiles,
- metal,
- rock,
- organic/carbon.

RegionalView is the next consumer to be aligned to the same broad semantics. Microdetail does not need to match RegionalView; broad color/material identity does.

## Transition policy

Transitions use preload + overlap + hysteresis. They are not one exact altitude switch.

Current tuning:

```text
Orbit → Regional
  preload regional:       9,750 km
  visible blend start:    9,000 km
  visible blend complete: 7,500 km
  release regional up:   10,000 km

Regional → Surface
  preload surface:          140 km
  visible blend start:       90 km
  visible blend complete:    20 km
  release surface up:       220 km
```

These values are tuning parameters, not architecture.

### Current transition status

```text
Orbit → Regional
  geometry continuity: good
  visual handoff: stable

Regional → Surface
  lifecycle/camera continuity: working
  geometry identity: shared canonical terrain
  visual/material continuity: NOT yet accepted
```

The known Regional → Surface problem is documented in:

```text
packages/conduit-planet/PLANET_REGIONAL_SURFACE_HANDOFF_FINDING.md
```

The current runtime keeps Regional fully opaque while Surface fades in, then hides Regional once Surface reaches a depth-ownership threshold. That avoids exposing the finite Surface patch/horizon, but the remaining material mismatch plus final ownership cut is visible as a renderer/material pop.

Do not solve this only by widening the blend band. First align broad material semantics; then improve ownership/fade behavior.

## Stability rules

1. Preload an incoming view before it receives visible weight.
2. Keep the outgoing representation available until the incoming view can cover the visible scene.
3. Use hysteresis for renderer lifecycle.
4. Never reset camera orientation/target merely because view ownership changes.
5. RegionalView and SurfaceView anchor from the same normalized camera/planet direction.
6. Blend weights alone should not force geometry rebuilds.
7. Orbit terrain cost remains bounded; do not restore planet-wide near-surface refinement.
8. All views converge on canonical physical terrain identity.
9. Broad material identity should converge across overlapping views.
10. Representation-specific microdetail may appear progressively with proximity.

## Runtime ownership

```text
PlanetViewRuntime
  ├─ OrbitView    → InstancedOrbitTerrain (WebGPU solid planets)
  ├─ RegionalView → CurvedRegionalTileTerrain
  └─ SurfaceView  → SurfaceClipmapTerrain
```

`Planet.ts` remains transitional because it still owns valid shared layers and legacy surface infrastructure. It should not be treated as the final ownership shape for modern solid planets.

## Gas and ice giants

Gas and ice giants do not instantiate RegionalView/SurfaceView terrain. They remain dedicated giant-renderer paths unless a future atmospheric/deep-cloud gameplay view is deliberately introduced.

## Cleanup rule

Old renderer experiments remain useful only as migration/reference sources. In particular, the previous regional chain:

```text
GpuRegionalSurfaceTerrain
→ HydraulicRegionalSurfaceTerrain
→ RegionalSurfaceHandoffTerrain
```

is not the active renderer architecture.

Useful erosion/normal/AO/handoff ideas may be migrated, but the old chain must not return as a competing production path.
