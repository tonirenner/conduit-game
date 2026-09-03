# Conduit Planet – Phase 7 Planet.ts Responsibility Map

Status: active extraction

## Goal

Reduce `Planet.ts` entanglement without changing accepted renderer behaviour.

The file is transitional infrastructure. Phase 7 does not treat size alone as a reason to delete or move code. Every responsibility is classified by ownership and consumer risk first.

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

`Planet` remains exported through the rendering package barrel. Public/API compatibility must therefore be considered before removing or changing its methods.

Repository code search has not been reliable enough to prove absence of external consumers, so compatibility wrappers remain the default extraction strategy.

## Responsibility matrix

| Responsibility | Current owner | Extraction risk | Phase 7 action |
| --- | --- | --- | --- |
| renderer-family routing | `Planet` constructor / `rendererKind` | high | preserve |
| classic CubeSphere terrain | `Planet` | high | defer to CubeSphere isolation |
| classic surface material | `Planet` | high | defer |
| planet body/depth occluder | `Planet` | medium/high | defer with classic stack |
| WebGL/WebGPU atmosphere | `Planet` + atmosphere layers | high | protect baseline |
| WebGL/WebGPU clouds | `Planet` + cloud layers | medium/high | preserve for now |
| gas/ice giant renderer | `Planet` + `GasGiantLayer` | high | preserve |
| rings | `PlanetOrbitingLayerController` | low | **extracted** |
| moons | `PlanetOrbitingLayerController` | low | **extracted** |
| toxic haze | `Planet` + `ToxicHazeLayer` | medium | preserve for now |
| legacy near-surface terrain | `Planet` + `NearSurfaceTerrainLayer` | medium | Phase 8 retirement target |
| render tuning state | `PlanetRenderTuning` + setters | medium | later candidate |
| render quality routing | `Planet.setRenderQuality()` | medium | candidate after controller audit |
| sun-direction fanout | `Planet.setSunDirection()` | medium | candidate after controller audit |
| per-frame shared update | `Planet.update()` | high | keep until more ownership is extracted |
| debug visibility routing | `PlanetDebugVisibility` helper + `Planet` wrapper pending | low/medium | helper/test complete; wrapper wiring next controlled rewrite |
| definition/debug stats | `PlanetDiagnostics` + thin `Planet` wrapper | low | **extracted** |
| render feature stats | `PlanetDiagnostics` + thin `Planet` wrapper | low | **extracted** |
| terrain texture stats | `PlanetDiagnostics` + thin `Planet` wrapper | low | **extracted** |
| terrain stats | `Planet` / CubeSphere | medium | keep with classic terrain owner |
| baked-terrain toggles | `Planet` | medium | preserve |

## Completed extraction 1 – runtime diagnostics

`src/runtime/PlanetDiagnostics.ts` now owns pure snapshot assembly for:

```text
PlanetDefinitionStats
PlanetRenderFeatureStats
PlanetTerrainTextureStats
```

The public `Planet` methods remain compatibility wrappers:

```text
Planet.getPlanetDefinitionStats()
Planet.getRenderFeatureStats()
Planet.getTerrainTextureStats()
```

`Planet` still supplies actual runtime values such as current raymarch step counts; the diagnostics module only formats/combines them.

Regression coverage: `tests/PlanetDiagnostics.test.ts`.

`getTerrainStats()` intentionally remains with `Planet` because it directly exposes live CubeSphere LOD/horizon state.

## Completed extraction 2 – rings and moons

`src/runtime/PlanetOrbitingLayerController.ts` now owns:

```text
RingSystemLayer creation
MoonSystemLayer creation
ring/moon per-frame update
ring/moon debug visibility
ring/moon disposal
```

It consumes the explicit Phase 6 runtime contracts:

```text
getPlanetRingLayerRuntimeProfile(...)
getPlanetMoonSystemSeed(...)
```

`Planet` keeps only one small controller reference and calls it from the same lifecycle positions where the individual layers were previously handled.

Construction order is preserved:

```text
solid planet:
terrain/body → clouds → atmosphere → toxic haze → rings/moons

giant:
giant layer → rings/moons
```

Regression coverage: `tests/PlanetOrbitingLayerController.test.ts`.

## Staged extraction 3 – debug visibility routing

`src/runtime/PlanetDebugVisibility.ts` now owns the pure visibility-routing rules for:

```text
surface objects
atmosphere objects
cloud objects
gas layer
ring/moon callbacks
near-surface terrain
toxic haze
```

The helper receives only `Object3D` targets and small callbacks; it does not own or import concrete planet layer classes.

Regression coverage: `tests/PlanetDebugVisibility.test.ts`.

The remaining step is intentionally batched with the next controlled `Planet.ts` rewrite: replace the current method body with a thin compatibility wrapper. This avoids repeated full-file rewrites solely for small fanout changes.

## Protected visual baseline

Phase 7 must preserve:

```text
Orbit → Regional: visually accepted
Regional → Surface: depth/checker repair preserved
Atmosphere: accepted reconstruction baseline
```

No extraction is allowed to alter those behaviours as collateral cleanup.

## Explicitly deferred

Do not extract or rewrite yet:

- atmosphere reconstruction/profile behaviour,
- classic surface material creation,
- CubeSphere LOD,
- Surface/Regional/Orbit handoffs,
- camera/reference-frame logic,
- near-surface retirement,
- gas giant rendering,
- WebGL fallback behaviour.

## Next action

Audit `setSunDirection()` and `setRenderQuality()` and decide whether they can share the next controlled `Planet.ts` rewrite with the debug-visibility wrapper.

Do not move the full `Planet.update()` lifecycle yet.
