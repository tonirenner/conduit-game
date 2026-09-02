# Planet View Architecture

## Status

This document describes the **current active planet view architecture**.

Solid planets use three purpose-built representations that share the same deterministic planet data:

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

The instanced Orbit surface is opaque and writes depth. Because of that, it must be released before RegionalView starts writing depth.

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
- altitude-driven uniform edge resolution to avoid T-junctions,
- broad surface color through the same `evaluateSurfaceTerrainMaterial()` used by SurfaceView.

Regional intentionally stays cheaper than SurfaceView and does not copy fragment-scale micro normals, cavity AO or other near-field detail.

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
- 11 fixed reusable clipmap rings,
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

Regional and Surface now share broad material semantics for:

- water,
- ice,
- lava/volcanism,
- toxic/volatiles,
- metal,
- rock,
- organic/carbon.

They may differ in detail frequency and shading cost, but not in underlying broad material identity.

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

### Orbit → Regional depth ownership

Orbit is opaque and cannot safely overlap a depth-writing Regional surface when both are nearly coincident.

Policy:

```text
Regional opacity <= depth threshold
    Orbit remains visible and owns depth
    Regional acts as transparent overlay without depth test/write

Regional opacity > depth threshold
    Orbit is disabled in the same frame
    Regional becomes the sole terrain depth owner
```

The Regional threshold is owned by `REGIONAL_DEPTH_OWNERSHIP_OPACITY` in `CurvedRegionalTileTerrain` and reused by `PlanetViewRuntime`. Do not duplicate this threshold independently.

This rule exists specifically to prevent regular triangle/diamond z-fighting during the final Orbit → Regional overlap.

### Regional → Surface depth ownership

Surface uses a separate coverage-aware release policy through `getRegionalSurfaceRelease()`.

Policy:

```text
before Surface depth ownership
    Regional owns depth

Surface owns depth
    Regional stops depth-writing
    Surface wins locally
    Regional may remain as backdrop

Surface safely covers the visible horizon
    Regional opacity releases smoothly to zero
```

The legacy `PlanetDepthOccluder` is disabled in the modern WebGPU Orbit/Regional/Surface path so it cannot interfere with Surface depth ownership.

## Current transition status

```text
Orbit → Regional
  geometry continuity: working
  broad material continuity: working
  depth ownership: single-owner policy implemented
  visual validation after latest ownership fix: pending

Regional → Surface
  geometry identity: shared canonical terrain
  broad material continuity: aligned
  progressive ownership: implemented
  legacy depth occluder conflict: fixed
  remaining visual detail/shading acceptance: pending
```

The Regional → Surface history and findings are documented in:

```text
packages/conduit-planet/PLANET_REGIONAL_SURFACE_HANDOFF_FINDING.md
```

## Stability rules

1. Preload an incoming view before it receives visible weight.
2. Keep the outgoing representation available until the incoming view can cover the visible scene.
3. **Never allow two nearly coplanar terrain representations to write/test depth as owners at the same time.**
4. Synchronize outgoing visibility release with incoming depth ownership.
5. Use hysteresis for renderer lifecycle.
6. Never reset camera orientation/target merely because view ownership changes.
7. RegionalView and SurfaceView anchor from the same normalized camera/planet direction.
8. Blend weights alone should not force geometry rebuilds.
9. Orbit terrain cost remains bounded; do not restore planet-wide near-surface refinement.
10. All views converge on canonical physical terrain identity.
11. Broad material identity should converge across overlapping views.
12. Representation-specific microdetail may appear progressively with proximity.

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
