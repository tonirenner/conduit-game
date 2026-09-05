# Conduit Planet – Stabilization & Migration Plan

> Current working plan for `packages/conduit-planet` and the production Game migration.
>
> Core rule: domain truth is preserved or explicitly retired. Modern-path defects are repaired in the modern path; the Game does not roll back to the old planet renderer.

---

## 1. Target architecture

```text
PlanetDefinition
    ↓
PlanetGeneration
    ↓
PlanetRenderProfile / SurfaceRenderProfile / SurfaceMaterialSemantics
    ↓
PlanetTerrainSampler + Climate / Biome / Weather
    ↓
OrbitView    → InstancedOrbitTerrain
RegionalView → CurvedRegionalTileTerrain
SurfaceView  → current: SurfaceClipmapTerrain
               target: adaptive CPU patch tessellation + workers
```

Ownership:

```text
Definition = domain truth
Profiles / material semantics = derived render configuration
Canonical sampler/domain systems = physical/climate truth
Renderer = representation-specific consumer
```

Do not create competing terrain, climate, composition or definition models inside renderers.

---

## 2. Protected modern baseline

### Orbit → Regional

- [x] fixed instanced WebGPU orbit terrain,
- [x] canonical regional terrain,
- [x] single-depth-owner handoff,
- [x] checker/diamond artifact repaired,
- [x] visual handoff accepted.

### Regional → Surface

- [x] canonical physical terrain identity,
- [x] shared broad material identity,
- [x] camera/reference-frame continuity,
- [x] checker/depth artifact repaired,
- [x] horizon-aware Regional release,
- [ ] final detail/shading continuity still needs formal visual acceptance,
- [ ] current 11-ring clipmap must be treated as a performance risk until measured against the new patch target.

Hard transition rule:

```text
never allow two nearly coplanar terrain representations
simultaneously to own/write depth during a handoff
```

### Atmosphere

- [x] WebGPU atmosphere is a depth-aware screen-space postprocess,
- [x] `WebGPUAtmosphereLayer` is metadata/source state only,
- [x] accepted camera-ray reconstruction protected.

Required WebGPU screen conversion:

```wgsl
let ndc = vec2<f32>(
    uv.x * 2.0 - 1.0,
    1.0 - uv.y * 2.0
);
```

---

## 3. Migration phases

### Phase 3 – Terrain definition migration

- [x] complete.
- [x] ocean level, roughness, tectonics, volcanism and ice caps integrated.
- [x] `PlanetTerrainSampler` is physical/displacement truth.

### Phase 4 – Climate / biome / weather semantics

- [x] planned semantic/API migration complete.
- [ ] compose live seasonality + cloud persistence later.
- [ ] `ashLoad` remains deliberate volcanic/atmospheric follow-up.

### Phase 5 – Composition

- [x] complete for rock, metal, ice, water, gas, organic and volatiles.

### Phase 6 – Profile/material consolidation

- [x] complete.
- [x] canonical `SurfaceMaterialSemantics` and `SurfacePalette`.
- [x] Surface/Regional paths consume shared semantics.
- [x] ring and moon-system runtime contracts explicit.
- [ ] `cloudPalette` deferred until clouds expose a real palette contract.

### Phase 7 – `Planet.ts` entanglement

**Status: complete.**

Extracted:

```text
PlanetDiagnostics
PlanetOrbitingLayerController
PlanetDebugVisibility
```

`setSunDirection()`, `setRenderQuality()` and the full `update()` lifecycle intentionally remain where shared runtime ownership is still real.

### Phase 8 – old NearSurface terrain

**Status: isolated; production Game no longer relies on it as its rendering target.**

- [x] modern runtime uses `SurfaceClipmapTerrain`,
- [x] default `nearSurfaceTerrain` is OFF,
- [x] old Game constructor signature is intercepted by the production rendering bridge and routed forward to `SystemPlanetViewRuntime`,
- [ ] after visual Game acceptance, remove the obsolete NearSurface implementation/compatibility trigger.

### Phase 9 – old regional prototypes

**Status: complete.**

Removed:

```text
GpuRegionalSurfaceTerrain
HydraulicRegionalSurfaceTerrain
RegionalSurfaceHandoffTerrain
```

Retained useful algorithm:

```text
terrain/erosion/RegionalHydraulicErosion.ts
```

### Phase 10 – obsolete atmosphere prototype

**Status: complete.**

`OpenWorldsAtmosphereLayer.ts` removed. Useful scattering concepts already live in the active depth-aware postprocess.

### Phase 11–13 – later cleanup

Not production blockers:

- old fallback surface materials,
- hidden/classic CubeSphere ownership,
- obsolete public compatibility exports/flags.

Clean these after the modern Game path is visually accepted and the new Surface path has replaced the clipmap safely.

---

## 4. Production Game migration – FORWARD ONLY

**No A/B mode. No legacy runtime switch. No rollback strategy.**

```text
modern runtime problem
    ↓
fix modern runtime
    ↓
continue forward
```

### Current status

```text
Phase 7 complete                    ✅
Phase 8 old NearSurface isolated    ✅
Phase 9 old regional chain retired  ✅
production transition regression   ✅
production browser build gate       ✅
Game runtime wiring                 ✅
shared Lab/Game camera logic        ✅
visual Game path works              ✅
load performance acceptable         ❌
surface runtime performance         ❌
new tessellation target             ⏳
old compatibility removal           ⏳
```

### Runtime wiring

The existing `GamePrototypeScene` planet constructor contract is routed through:

```text
GamePrototypeScene
    ↓
PlanetRenderingBridge
    ↓
SystemPlanetViewRuntime
    ↓
PlanetViewRuntime
    ├─ OrbitView
    ├─ RegionalView
    └─ SurfaceView
```

This avoids a risky mechanical rewrite of the very large `GamePrototypeScene.ts` while changing the actual Game planet surface/view ownership to the modern runtime.

The bridge has no user-facing A/B switch. The old explicit Game `nearSurfaceTerrain: true` constructor signature is treated only as the migration hook and is routed to the modern WebGPU runtime; it is not used to construct the old NearSurface renderer.

### Build gate

CI hard-validates the real browser bundle:

```text
bun test packages/conduit-planet/tests
bun test tests/SimulationClock.test.ts tests/PlanetSeasonCycle.test.ts
bun ./scripts/build.ts
```

---

## 5. Production planet camera contract

Detailed contract: `PLANET_GAME_CAMERA_CONTRACT.md`.

The Lab and Game use the same production controller implementation:

```text
PlanetApproachCameraController
PlanetFreeLookCameraController
PlanetCameraInteractionController
```

The old Lab controller files are re-export shims to those shared production classes, so behavior cannot silently drift.

Required Game behavior:

```text
normal System camera
    ↓ double-click planet
existing planet focus
    ↓
shared Lab camera behavior
    ├─ Orbit → Regional → Surface
    ├─ mouse free-look
    ├─ wheel radial zoom
    ├─ WASD tangent flight over the sphere
    ├─ Q/E altitude
    └─ Shift faster
    ↓ ESC or second double-click on same planet
existing Game camera restore
    ↓
exact previously saved System camera
```

The shared controllers are planet-center-relative, so surface flight works for planets positioned anywhere in SystemView rather than only for a planet at world origin.

On focus exit the Game's existing saved-camera restore remains authoritative; the planet controller releases ownership without overwriting that restored state.

---

## 6. Current visual issue

Tracked in `PLANET_GLOBAL_LIGHTING_ISSUE.md`:

- [ ] Tag/Nacht terminator too hard across planet classes,
- [ ] add/strengthen twilight transition,
- [ ] review nightside residual light / atmospheric airlight,
- [ ] inspect vertical band/seam independently from the terminator.

This remains one global lighting/atmosphere problem, not a per-class workaround target.

**Priority note:** visual lighting work is temporarily behind the current performance/tessellation program. Do not let it interrupt the loading or Surface architecture work unless it blocks validation.

---

## 7. New immediate priority – loading, tessellation, runtime performance

### Priority A – staged planet loading

**Problem observed in production:**

- SystemView loading improved after moving to lazy full runtime creation,
- first planet focus still stalls because the modern runtime initializes too much synchronously,
- entering deep Surface can produce multi-second frame times.

**Target behavior:**

```text
double-click planet
    ↓
Orbit visible immediately
    ↓
Regional prepared incrementally
    ↓
Surface prepared only near its preload band
```

Required work:

- [ ] split `PlanetViewRuntime` initialization into stages,
- [ ] keep Orbit cheap and immediately available,
- [ ] defer Regional construction until relevant,
- [ ] defer Surface construction until near Surface preload distance,
- [ ] move heavy geometry generation off the main thread where practical,
- [ ] cache prepared resources instead of rebuilding on every focus,
- [ ] record first-focus, first-Regional and first-Surface stall times.

### Priority B – replace fixed Surface clipmap with adaptive CPU tessellation

**Current Surface topology is no longer the target architecture.**

Current implementation:

```text
SurfaceClipmapTerrain
11 fixed rings
24 cells per grid edge
camera-relative clipmap
```

This remains the migration baseline only until the replacement proves correct.

Target architecture:

```text
camera / surface anchor
    ↓
visible curved surface region
    ↓
CPU patch-LOD selection
    ↓
Worker pool generates / updates patch geometry
    ↓
cache + recycle vertex/index buffers
    ↓
main thread installs only completed patches
    ↓
GPU handles material / lighting / atmosphere
```

Design rules:

- CPU owns topology and LOD decisions,
- workers perform heavy tessellation/sampling work,
- GPU remains responsible for shading, not mesh generation,
- only visible/relevant patches exist at high detail,
- unchanged patches are reused,
- camera movement must not trigger full terrain rebuilds,
- patch borders must preserve crack-free continuity,
- canonical `PlanetTerrainSampler` remains terrain truth,
- Regional/Surface material semantics remain shared,
- protected single-depth-owner handoff remains unchanged.

Migration rule:

```text
build new patch path
→ validate continuity + performance
→ make it the SurfaceView owner
→ remove SurfaceClipmapTerrain
```

Do not delete the clipmap before the new patch path is proven.

### Priority C – formal performance characterization

Measure before aggressive tuning.

Required metrics:

- [ ] total CPU frame time,
- [ ] GPU frame time where available,
- [ ] terrain geometry build time,
- [ ] `PlanetTerrainSampler` cost,
- [ ] active patch/ring count,
- [ ] vertex/index count,
- [ ] draw calls,
- [ ] material/shader cost,
- [ ] atmosphere cost,
- [ ] clouds cost,
- [ ] GTAO/SSR/Bloom cost,
- [ ] first-focus initialization time,
- [ ] first-Surface initialization time,
- [ ] memory growth while moving over the surface.

Performance acceptance is based on measured frame time, not only visual smoothness.

---

## 8. Regression program

### Broad regression

- [ ] formal Orbit/Regional/Surface height-continuity characterization,
- [ ] final Regional/Surface material-continuity characterization,
- [ ] all solid classes through descent/ascent,
- [ ] gas/ice giants,
- [ ] atmosphere/cloud/ring/moon combinations,
- [ ] multiple planet instances.

### Surface replacement regression

- [ ] crack-free patch borders,
- [ ] no topology popping that exposes holes,
- [ ] stable local horizon while moving,
- [ ] identical canonical terrain samples across Regional/new Surface,
- [ ] correct depth ownership through handoff,
- [ ] deterministic patch generation for the same seed/location/LOD,
- [ ] worker cancellation when patches become irrelevant.

### WebGL follow-up

- [ ] only after the modern WebGPU Game path and new Surface architecture are stable.

---

## 9. Known definition/runtime follow-ups

- [ ] `physical.rotationSpeed` as canonical rotation driver,
- [ ] `physical.axialTilt` in seasonal forcing,
- [ ] atmosphere pressure ownership,
- [ ] compose seasonality + cloud persistence into one production weather evaluation,
- [ ] integrate `ashLoad`,
- [ ] decide future `cloudPalette` renderer contract,
- [ ] individual `PlanetMoonDefinition` rendering beyond the current lightweight MoonSystem.

Mass/gravity/density remain valid gameplay/simulation domain truth even when nonvisual.

---

## 10. Current next action

**Performance-first program.**

Order:

```text
1. instrument staged loading / Surface frame cost
2. reduce synchronous focus initialization
3. design adaptive CPU patch tessellation contract
4. implement worker-backed patch generation
5. integrate patch SurfaceView beside the clipmap baseline
6. validate continuity + depth ownership
7. switch SurfaceView to patch path
8. remove SurfaceClipmapTerrain
9. return to global lighting / terminator cleanup
```

Any defect found in this work is fixed in the modern runtime. Do not restore the old planet path.

---

## 11. CI policy

Bun remains pinned to `1.3.14`; Bun 1.4.0 previously segfaulted (`139`) in CI.

Never infer success from empty combined statuses. Use the actual workflow run/job result.

---

## 12. Working rule

1. preserve accepted camera/atmosphere/depth baseline,
2. fix modern-path defects forward,
3. make loading and Surface performance the current top priority,
4. keep canonical domain truth independent from tessellation strategy,
5. do not let non-blocking visual polish or legacy cleanup delay the performance program,
6. replace fixed clipmap Surface with worker-backed adaptive patches only after measured validation,
7. update this plan after meaningful migration milestones.
