# Conduit Planet – Stabilization & Migration Plan

> Main current working document for `packages/conduit-planet`.
>
> Core rule: meaningful `PlanetDefinition` values and established behavior are migrated, preserved as domain-only, or explicitly retired. Nothing is deleted merely because one current renderer does not consume it.

---

## 1. Target architecture

```text
PlanetDefinition
    ↓
PlanetGeneration
    ↓
derived render configuration
    ├─ PlanetRenderProfile
    ├─ SurfaceRenderProfile
    ├─ SurfaceMaterialSemantics
    └─ layer runtime profiles
    ↓
canonical domain systems
    ├─ PlanetTerrainSampler
    ├─ Climate / Biome / Weather
    └─ shared terrain/material masks
    ↓
scale-specific renderers
    ├─ OrbitView    → InstancedOrbitTerrain
    ├─ RegionalView → CurvedRegionalTileTerrain
    └─ SurfaceView  → SurfaceClipmapTerrain
```

Ownership principle:

```text
Definition = domain truth
Profile / MaterialSemantics = derived render configuration
Canonical sampler/domain functions = physical/climate truth
Renderer = representation-specific consumer
```

Do not create competing terrain, climate, composition or definition models inside renderers.

---

## 2. Protected modern baseline

### Orbit → Regional

- [x] fixed instanced WebGPU orbit terrain,
- [x] pre-baked terrain LUT,
- [x] canonical regional terrain,
- [x] single-depth-owner handoff,
- [x] checker/diamond artifact repaired,
- [x] visual handoff accepted.

### Regional → Surface

- [x] canonical physical terrain identity,
- [x] broad material identity shared,
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
- [x] atmosphere remains independent from terrain-view ownership,
- [x] accepted camera-ray reconstruction protected.

Required WebGPU screen conversion:

```wgsl
let ndc = vec2<f32>(
    uv.x * 2.0 - 1.0,
    1.0 - uv.y * 2.0
);
```

Do not change these accepted baselines as collateral cleanup.

---

## 3. Completed migration phases

### Phase 3 – Terrain definition migration

- [x] complete.
- [x] ocean level, roughness, tectonics, volcanism, ice caps integrated.
- [x] `PlanetTerrainSampler` remains physical/displacement truth.

### Phase 4 – Climate / biome / weather definition migration

- [x] planned semantic/API migration complete.
- [ ] live seasonality + cloud-persistence composition remains later integration work.
- [ ] `ashLoad` remains deliberate volcanic/atmospheric follow-up.

### Phase 5 – Composition migration

- [x] complete for rock, metal, ice, water, gas, organic and volatiles.
- [x] solid-surface material semantics centralized.
- [x] gas/ice giant composition response integrated.

### Phase 6 – Profile/material consolidation

- [x] complete.
- [x] canonical `SurfaceMaterialSemantics` and `SurfacePalette`.
- [x] Surface/Regional material paths consume shared semantics.
- [x] ring enable/seed and moon-system seed contracts explicit.
- [ ] `cloudPalette` intentionally deferred until clouds expose a real palette contract.

### Phase 7 – `Planet.ts` entanglement

**Status: complete.**

Extracted:

```text
PlanetDiagnostics
PlanetOrbitingLayerController
PlanetDebugVisibility
```

`setSunDirection()`, `setRenderQuality()` and the full `update()` lifecycle intentionally remain in `Planet` because they still bridge real shared runtime ownership.

### Phase 8 – `NearSurfaceTerrainLayer`

**Status: isolated pending Game migration.**

- [x] modern `PlanetViewRuntime` uses `SurfaceClipmapTerrain`,
- [x] default `nearSurfaceTerrain` is OFF,
- [x] current Game legacy consumer identified,
- [ ] delete old NearSurface implementation after the Game has moved forward to the modern runtime.

Current old consumer:

```text
GamePrototypeScene
    ↓ direct new Planet(...)
nearSurfaceTerrain: true
```

### Phase 9 – old regional prototype chain

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

Removed `OpenWorldsAtmosphereLayer.ts`. Useful scattering concepts are already represented by the active depth-aware `PlanetAtmospherePostProcess`.

---

## 4. Phase 11+ cleanup – not a production blocker

### Phase 11 – old surface materials

Still required by fallback/classic renderer ownership. Do not delete until those consumers close.

### Phase 12 – CubeSphere legacy

- [ ] retire/isolate after the modern Game migration.
- [ ] remove hidden classic surface construction from modern WebGPU ownership when safe.

### Phase 13 – public API cleanup

- [ ] remove obsolete compatibility fields/exports after their consumers are gone.
- [ ] remove `nearSurfaceTerrain` compatibility once the old path is deleted.

These phases must not delay moving the actual Game forward.

---

## 5. Production Game migration – FORWARD ONLY

The modern planet stack becomes the Game planet runtime directly.

**There is no A/B rollout, runtime comparison switch, or legacy fallback strategy.**

Migration rule:

```text
modern PlanetViewRuntime has a problem
    ↓
fix the modern runtime
    ↓
continue forward
```

Do not solve production issues by switching the Game back to the old planet renderer.

Target sequence:

```text
Phase 7 complete                    ✅
Phase 8 NearSurface isolated        ✅
Phase 9 old regional chain retired  ✅
production regression sanity
production performance sanity
    ↓
GamePrototypeScene migrates directly
from legacy Planet surface ownership
to SystemPlanetViewRuntime / PlanetViewRuntime
    ↓
MODERN PLANET STACK = GAME PATH
    ↓
retire remaining old Game planet path
```

Current migration preparation:

- [x] `SystemPlanetViewRuntime` game-facing adapter created,
- [x] adapter preserves the small API shape required by Game selection/camera/update code,
- [x] `PlanetProductionRolloutGate.test.ts` protects normalized view weights and single-depth-owner policy,
- [x] current Game legacy consumer identified,
- [ ] first multi-planet/system-view performance sanity pass,
- [ ] migrate `GamePrototypeScene` storage/factory directly to `SystemPlanetViewRuntime`,
- [ ] visual Game validation on the modern path,
- [ ] fix findings in the modern path,
- [ ] remove the old Game NearSurface consumer and then retire its implementation.

The Planet LOD lab already exercises the modern view runtime. Validation now focuses on real Game/SystemView conditions and multiple planet instances.

---

## 6. Current visual issues

Tracked separately in `PLANET_GLOBAL_LIGHTING_ISSUE.md`:

- [ ] Tag/Nacht terminator is too hard across planet classes,
- [ ] add/strengthen twilight transition,
- [ ] review nightside residual light / atmospheric airlight,
- [ ] inspect the vertical band/seam artifact independently from the terminator.

This is a global lighting/atmosphere issue, not a per-class workaround target.

---

## 7. Regression and performance follow-up

### Phase 14 – broader regression suite

- [ ] formal Orbit/Regional/Surface height continuity characterization,
- [ ] Regional/Surface broad material continuity characterization,
- [ ] all solid classes through descent/ascent,
- [ ] gas/ice giants,
- [ ] atmosphere/cloud/ring/moon combinations,
- [ ] multiple planet instances.

### Phase 15 – performance stabilization

- [ ] formal per-view measurements,
- [ ] multi-planet SystemView measurements,
- [ ] hidden legacy `Planet`/CubeSphere construction cost review,
- [ ] memory/draw-call sanity.

### Phase 16 – adaptive geometry

- [ ] only after stabilization.

### Phase 17 – WebGL follow-up

- [ ] after the modern WebGPU Game path is stable.

---

## 8. Known definition/runtime follow-ups

- [ ] `physical.rotationSpeed` as canonical rotation driver,
- [ ] `physical.axialTilt` in seasonal forcing,
- [ ] atmosphere pressure ownership,
- [ ] compose seasonality + cloud persistence into one production weather evaluation,
- [ ] integrate `ashLoad`,
- [ ] decide future `cloudPalette` renderer contract,
- [ ] individual `PlanetMoonDefinition` rendering beyond the current deterministic lightweight MoonSystem.

Mass/gravity/density remain valid gameplay/simulation domain truth even when nonvisual.

---

## 9. CI policy

Planet CI is pinned to a known Bun version because Bun 1.4.0 previously produced runner segmentation fault `139`.

Always distinguish:

```text
verified successful CI result
vs
no failure signal
vs
connector statuses: []
```

Never claim green unless a successful check/result is actually visible.

---

## 10. Current next action

**Move the real Game forward to the modern planet runtime.**

Priority:

```text
1. multi-planet performance sanity
2. wire GamePrototypeScene directly to SystemPlanetViewRuntime
3. visual Game validation
4. fix modern-path findings
5. delete obsolete Game NearSurface usage
```

No A/B switch. No compatibility detour. No rollback path as a development strategy.

---

## 11. Working rule for future sessions

1. read this file first,
2. preserve accepted atmosphere/camera/depth baseline,
3. make one narrowly scoped migration at a time,
4. update the relevant audit after meaningful changes,
5. do not delete domain behavior before migration/reference review,
6. keep WebGPU first and WebGL follow-up isolated,
7. distinguish domain truth from render semantics,
8. prioritize the production Game migration over non-blocking cleanup,
9. when the modern path exposes a defect, repair the modern path rather than restoring the old one.
