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

Repository code search did not return reliable consumer results during this audit, so absence of search hits is **not** treated as proof of no consumer.

## Responsibility matrix

| Responsibility | Current owner | Modern WebGPU solid path | Legacy/WebGL relevance | Extraction risk | Phase 7 action |
| --- | --- | --- | --- | --- | --- |
| renderer-family routing | `Planet` constructor / `rendererKind` | yes | yes | high | preserve for now |
| classic CubeSphere terrain | `Planet` | hidden/frozen | active fallback | high | defer to CubeSphere isolation phase |
| classic surface material | `Planet` | hidden as terrain source but still constructed | active | high | defer |
| planet body/depth occluder | `Planet` | hidden | legacy support | medium/high | defer until classic stack isolation |
| WebGL atmosphere | `Planet` / `AtmosphereLayer` | no | yes | high | preserve |
| WebGPU atmosphere | `Planet` / `WebGPUAtmosphereLayer` | yes | no | high | preserve; atmosphere baseline protected |
| WebGL clouds | `Planet` / `CloudLayer` | no | yes | medium/high | preserve |
| WebGPU clouds | `Planet` / `WebGPUCloudLayer` | yes | no | medium/high | preserve |
| gas/ice giant renderer | `Planet` / `GasGiantLayer` | dedicated giant path | renderer-dependent | high | preserve |
| rings | `Planet` / `RingSystemLayer` | shared layer | shared | low/medium | good orchestration extraction candidate |
| moons | `Planet` / `MoonSystemLayer` | shared layer | shared | low/medium | good orchestration extraction candidate |
| toxic haze | `Planet` / `ToxicHazeLayer` | solid-class special layer | shared | medium | preserve until class-layer extraction |
| legacy near-surface terrain | `Planet` / `NearSurfaceTerrainLayer` | explicitly disabled by `PlanetViewRuntime` | potentially legacy | medium | Phase 8 retirement target, do not mix now |
| render feature merging | delegated profile helper | yes | yes | low | already delegated |
| surface profile derivation | delegated render profile | shared setup | shared | low | already delegated |
| terrain seed profile | `Planet` | legacy/shared setup | yes | medium | preserve until classic stack extraction |
| render tuning state | `PlanetRenderTuning` + setters | mostly classic surface stack | yes | medium | separate later if consumer/API review supports |
| render quality routing | `Planet.setRenderQuality()` | shared layer routing | shared | medium | candidate for layer controller |
| sun-direction fanout | `Planet.setSunDirection()` | shared | shared | medium | candidate for layer controller |
| per-frame layer update | `Planet.update()` | shared | shared | high | keep until layer controller shape is proven |
| debug visibility routing | `Planet.setDebugLayerVisibility()` | debug/runtime API | shared | low/medium | later diagnostics/controller candidate |
| definition/debug stats | `PlanetDiagnostics` + thin `Planet` wrapper | diagnostics | diagnostics | low | **extracted** |
| render feature stats | `Planet` | diagnostics | diagnostics | low | next diagnostics candidate |
| terrain stats | `Planet` / CubeSphere | classic terrain diagnostics | diagnostics/legacy | medium | keep tied to classic stack for now |
| terrain texture stats | `Planet` | diagnostics/classic material | diagnostics | low/medium | next diagnostics candidate |
| baked-terrain toggles | `Planet` | classic material | active legacy | medium | preserve |

## Completed extraction 1 – definition diagnostics

`src/runtime/PlanetDiagnostics.ts` now owns the pure assembly of `PlanetDefinitionStats`.

The public API remains unchanged:

```text
Planet.getPlanetDefinitionStats()
        ↓ thin compatibility wrapper
createPlanetDefinitionStats(...)
```

The extraction moved definition/profile/climate/resource/default-value formatting out of the god-object without transferring ownership of any Three.js object or changing renderer behaviour.

Regression coverage: `tests/PlanetDiagnostics.test.ts`.

## Why diagnostics remains the active extraction boundary

- no visual output changes,
- no terrain/camera/atmosphere changes,
- no lifecycle changes,
- no ownership transfer of Three.js objects,
- public `Planet` methods remain compatible,
- creates a safe extraction pattern before moving layer orchestration.

## Next diagnostics extraction

Continue the same pattern with:

```text
getRenderFeatureStats()
getTerrainTextureStats()
```

`getTerrainStats()` remains with the classic CubeSphere owner initially because it directly exposes classic terrain runtime methods and typed LOD state.

## Second likely extraction

After diagnostics is stable, consider a shared auxiliary-layer controller for:

```text
rings
moons
cloud/atmosphere sun-direction fanout
quality/update fanout
```

Do not combine all of these immediately. Rings + moons are the lowest-risk coherent pair because their runtime contracts are already explicit from Phase 6.

## Explicitly deferred during early Phase 7

Do not extract or rewrite yet:

- atmosphere reconstruction/profile behaviour,
- classic surface material creation,
- CubeSphere LOD,
- Surface/Regional/Orbit handoffs,
- camera/reference-frame logic,
- near-surface retirement,
- gas giant rendering,
- WebGL fallback behaviour.

## Protected visual baseline

Phase 7 must preserve:

```text
Orbit → Regional: visually accepted
Regional → Surface: depth/checker repair preserved
Atmosphere: accepted reconstruction baseline
```

No extraction is allowed to alter those behaviours as collateral cleanup.

## Next action

Extract render-feature and terrain-texture diagnostic snapshot assembly behind the existing `Planet` compatibility methods.
