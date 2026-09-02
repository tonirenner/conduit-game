# Conduit Planet – Phase 7 Planet.ts Responsibility Map

Status: active mapping

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

| Responsibility | Current owner in `Planet.ts` | Modern WebGPU solid path | Legacy/WebGL relevance | Extraction risk | Phase 7 action |
| --- | --- | --- | --- | --- | --- |
| renderer-family routing | constructor / `rendererKind` | yes | yes | high | preserve for now |
| classic CubeSphere terrain | `planet`, `createPlanet()` | hidden/frozen | active fallback | high | defer to CubeSphere isolation phase |
| classic surface material | `surfaceMaterial` factory/tuning | hidden as terrain source but still constructed | active | high | defer |
| planet body/depth occluder | `planetBody`, `depthOccluder` | hidden | legacy support | medium/high | defer until classic stack isolation |
| WebGL atmosphere | `AtmosphereLayer` | no | yes | high | preserve |
| WebGPU atmosphere | `WebGPUAtmosphereLayer` | yes | no | high | preserve; atmosphere baseline protected |
| WebGL clouds | `CloudLayer` | no | yes | medium/high | preserve |
| WebGPU clouds | `WebGPUCloudLayer` | yes | no | medium/high | preserve |
| gas/ice giant renderer | `GasGiantLayer` | dedicated giant path | renderer-dependent | high | preserve |
| rings | `RingSystemLayer` | shared layer | shared | low/medium | good orchestration extraction candidate |
| moons | `MoonSystemLayer` | shared layer | shared | low/medium | good orchestration extraction candidate |
| toxic haze | `ToxicHazeLayer` | solid-class special layer | shared | medium | preserve until class-layer extraction |
| legacy near-surface terrain | `NearSurfaceTerrainLayer` | explicitly disabled by `PlanetViewRuntime` | potentially legacy | medium | Phase 8 retirement target, do not mix now |
| render feature merging | `features` | yes | yes | low | already delegated to render-profile helper |
| surface profile derivation | `surfaceProfile` | shared setup | shared | low | already delegated |
| terrain seed profile | `terrainSeedConfig` | legacy/shared setup | yes | medium | preserve until classic stack extraction |
| render tuning state | `PlanetRenderTuning` + setters | mostly classic surface stack | yes | medium | separate later if consumer/API review supports |
| render quality routing | `setRenderQuality()` | shared layer routing | shared | medium | candidate for layer controller, not first extract |
| sun-direction fanout | `setSunDirection()` | shared | shared | medium | candidate for layer controller |
| per-frame layer update | `update()` | shared | shared | high | keep until layer controller shape is proven |
| debug visibility routing | `setDebugLayerVisibility()` | debug/runtime API | shared | low/medium | strong first extraction candidate |
| definition/debug stats | `getPlanetDefinitionStats()` | diagnostics | diagnostics | low | strongest first extraction candidate |
| render feature stats | `getRenderFeatureStats()` | diagnostics | diagnostics | low | strong extraction candidate |
| terrain stats | `getTerrainStats()` | classic terrain diagnostics | diagnostics/legacy | medium | keep tied to classic stack for now |
| terrain texture stats | `getTerrainTextureStats()` | diagnostics/classic material | diagnostics | low/medium | diagnostic extraction candidate with texture dependency |
| baked-terrain toggles | `setBakedTerrainEnabled()` | classic material | active legacy | medium | preserve |
| debug layer object ownership | many private fields | shared | shared | medium | do not expose internals merely to shrink file |

## First extraction choice

The safest coherent responsibility is **diagnostics**, not rendering.

Candidate extraction boundary:

```text
PlanetRuntimeDiagnostics
```

It can own pure assembly/formatting of diagnostic snapshots while `Planet` remains the source of runtime objects/state.

Initial scope should focus on data formatting that does not mutate rendering:

```text
getPlanetDefinitionStats()
getRenderFeatureStats()
getTerrainTextureStats()   (only if dependency stays simple)
```

`getTerrainStats()` should remain with the classic CubeSphere owner initially because it directly exposes classic terrain runtime methods and typed LOD state.

## Why diagnostics first

- no visual output changes,
- no terrain/camera/atmosphere changes,
- no lifecycle changes,
- no ownership transfer of Three.js objects,
- public `Planet` methods can remain as compatibility wrappers,
- immediately removes a large block of formatting logic from the god-object,
- creates a pattern for later extraction without changing API callers.

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

Extract diagnostic snapshot assembly behind compatibility-preserving `Planet` methods.

The public methods stay on `Planet`; only implementation responsibility moves.
