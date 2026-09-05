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
SurfaceView  → SurfaceClipmapTerrain
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
- [ ] final detail/shading continuity still needs formal visual acceptance.

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

Clean these after the modern Game path is visually accepted.

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
visual Game acceptance              ⏳
performance characterization        ⏳
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

CI now hard-validates the real browser bundle:

```text
bun test packages/conduit-planet/tests
bun test tests/SimulationClock.test.ts tests/PlanetSeasonCycle.test.ts
bun ./scripts/build.ts
```

The first production migration run with this build gate completed successfully.

---

## 5. Production planet camera contract

Detailed contract: `PLANET_GAME_CAMERA_CONTRACT.md`.

The Lab and Game now use the same production controller implementation:

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

This is one global lighting/atmosphere problem, not a per-class workaround target.

---

## 7. Remaining regression/performance work

### Phase 14 – broader regression

- [ ] formal Orbit/Regional/Surface height-continuity characterization,
- [ ] final Regional/Surface material-continuity characterization,
- [ ] all solid classes through descent/ascent,
- [ ] gas/ice giants,
- [ ] atmosphere/cloud/ring/moon combinations,
- [ ] multiple planet instances.

### Phase 15 – performance

- [ ] formal per-view measurements,
- [ ] multi-planet SystemView measurements,
- [ ] hidden legacy `Planet`/CubeSphere construction-cost review,
- [ ] memory/draw-call sanity.

### Phase 16 – adaptive geometry

- [ ] only after stabilization.

### Phase 17 – WebGL follow-up

- [ ] after modern WebGPU Game path is stable.

---

## 8. Known definition/runtime follow-ups

- [ ] `physical.rotationSpeed` as canonical rotation driver,
- [ ] `physical.axialTilt` in seasonal forcing,
- [ ] atmosphere pressure ownership,
- [ ] compose seasonality + cloud persistence into one production weather evaluation,
- [ ] integrate `ashLoad`,
- [ ] decide future `cloudPalette` renderer contract,
- [ ] individual `PlanetMoonDefinition` rendering beyond the current lightweight MoonSystem.

Mass/gravity/density remain valid gameplay/simulation domain truth even when nonvisual.

---

## 9. Current next action

**Visual production Game acceptance.**

Test in the real Game:

```text
1. enter SystemView
2. double-click a planet
3. descend Orbit → Regional → Surface
4. mouse + WASD + Q/E + Shift + wheel
5. ESC → previous System camera
6. repeat and exit with second double-click
7. switch/focus another planet
8. observe multi-planet FPS / obvious stalls
```

Any defect found here is fixed in the modern runtime. Do not restore the old planet path.

After this acceptance:

```text
remove obsolete Game NearSurface compatibility
→ retire old implementation
→ continue global lighting + performance work
```

---

## 10. CI policy

Bun remains pinned to `1.3.14`; Bun 1.4.0 previously segfaulted (`139`) in CI.

Never infer success from empty combined statuses. Use the actual workflow run/job result.

---

## 11. Working rule

1. preserve accepted camera/atmosphere/depth baseline,
2. fix modern-path defects forward,
3. keep domain truth separate from render semantics,
4. do not let non-blocking legacy cleanup delay production validation,
5. update this plan after meaningful migration milestones.
