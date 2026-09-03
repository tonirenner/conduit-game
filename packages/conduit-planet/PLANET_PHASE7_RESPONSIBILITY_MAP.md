# Conduit Planet – Phase 7 Planet.ts Responsibility Map

Status: complete

## Goal

Reduce `Planet.ts` entanglement without changing accepted renderer behaviour.

Phase 7 deliberately extracted only responsibilities with a clear ownership boundary. Higher-risk shared rendering/lifecycle code remains in `Planet` until a later phase has a stronger replacement boundary.

## Confirmed ownership context

### Modern WebGPU solid planets

`PlanetViewRuntime` constructs `Planet` and keeps it as the owner of shared/non-terrain layers while replacing the visible solid terrain representations with:

```text
InstancedOrbitTerrain
→ CurvedRegionalTileTerrain
→ SurfaceClipmapTerrain
```

On this path the classic `PlanetTerrain`, `PlanetBody` and `PlanetDepthOccluder` are hidden/frozen.

### Legacy / WebGL

`Planet` still owns the classic CubeSphere/surface-material path and therefore cannot be reduced as if the modern WebGPU path were its only consumer.

### Public package boundary

`Planet` remains exported through the rendering package barrel. Public/API compatibility remains a later Phase 13 concern.

## Completed extraction 1 – runtime diagnostics

`src/runtime/PlanetDiagnostics.ts` owns pure snapshot assembly for:

```text
PlanetDefinitionStats
PlanetRenderFeatureStats
PlanetTerrainTextureStats
```

The public `Planet` methods remain compatibility wrappers. Live CubeSphere terrain stats intentionally remain with the classic terrain owner.

Regression coverage: `tests/PlanetDiagnostics.test.ts`.

## Completed extraction 2 – rings and moons

`src/runtime/PlanetOrbitingLayerController.ts` owns:

```text
RingSystemLayer creation
MoonSystemLayer creation
ring/moon per-frame update
ring/moon debug visibility
ring/moon disposal
```

It consumes the canonical ring/moon runtime contracts established in Phase 6 and preserves deterministic behavior and construction order.

Regression coverage: `tests/PlanetOrbitingLayerController.test.ts`.

## Completed extraction 3 – debug visibility routing

`src/runtime/PlanetDebugVisibility.ts` owns the mechanical visibility-routing rules for:

```text
surface objects
atmosphere objects
cloud objects
gas layer
ring/moon callbacks
near-surface terrain
toxic haze
```

`Planet.setDebugLayerVisibility()` is now a thin compatibility wrapper that supplies the current runtime targets.

The helper imports no concrete planet layer classes and owns no Three.js objects.

Regression coverage: `tests/PlanetDebugVisibility.test.ts`.

## Audited and intentionally preserved in Planet

### `setSunDirection()`

Preserved because it is more than mechanical fanout. It currently bridges:

```text
surface material API
legacy uSunDirection uniform
WebGL/WebGPU clouds
WebGL/WebGPU atmosphere
```

Extracting it now would introduce an abstraction without establishing clearer ownership.

### `setRenderQuality()`

Preserved because it coordinates:

```text
render tuning
surface raymarch budget
cloud quality / raymarch budget
atmosphere quality / raymarch budget
```

This is a real shared policy boundary and should move only with a proven shared layer-quality controller.

### `update()`

Preserved because it remains the high-risk cross-layer lifecycle owner. Phase 7 does not move it merely to shrink the file.

## Responsibility result

| Responsibility | Result |
| --- | --- |
| diagnostics | extracted |
| rings/moons | extracted |
| debug visibility routing | extracted |
| sun-direction fanout | audited, preserve |
| render-quality routing | audited, preserve |
| full update lifecycle | audited, preserve |
| atmosphere/cloud ownership | preserve |
| classic CubeSphere/material stack | defer |
| legacy near-surface terrain | Phase 8 |
| old regional renderer chain | Phase 9 |

## Protected visual baseline

Phase 7 preserved:

```text
Orbit → Regional: visually accepted
Regional → Surface: depth/checker repair preserved
Atmosphere: accepted reconstruction baseline
```

No terrain sampling, camera/reference frame, atmosphere reconstruction, or view-transition thresholds were changed by the extraction work.

## Phase 7 result

Phase 7 is complete.

`Planet.ts` is still transitional, but the low-risk responsibilities that had clean ownership boundaries are no longer embedded in the god-object. Remaining responsibilities are intentionally deferred rather than moved into artificial abstractions.

Next active phase: **Phase 8 – isolate/retire `NearSurfaceTerrainLayer`**.
