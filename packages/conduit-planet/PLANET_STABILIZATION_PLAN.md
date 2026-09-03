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

## 3. Completed semantic migration

### Phase 3 – Terrain definition migration

- [x] complete.
- [x] ocean level, roughness, tectonics, volcanism, ice caps integrated.
- [x] `PlanetTerrainSampler` remains physical/displacement truth.

### Phase 4 – Climate / biome / weather definition migration

- [x] planned semantic/API migration complete.
- [x] climate seed, temperature, humidity, aridity, biome seed, weather seed, wind, storms, seasonality, cloud persistence.
- [ ] live seasonality + cloud-persistence composition remains later integration work.
- [ ] `ashLoad` remains deliberate volcanic/atmospheric follow-up.

### Phase 5 – Composition migration

- [x] complete for rock, metal, ice, water, gas, organic and volatiles.
- [x] solid-surface material semantics centralized.
- [x] gas/ice giant composition response integrated.

### Phase 6 – Profile/material consolidation

- [x] complete.
- [x] canonical `SurfaceMaterialSemantics`.
- [x] canonical `SurfacePalette`.
- [x] `SurfaceRenderProfile` and active Surface/Regional material paths consume shared semantics.
- [x] ring enable/seed runtime contract explicit.
- [x] deterministic moon-system seed contract explicit.
- [x] undeclared `render.moonSeed` probing removed.
- [ ] `cloudPalette` intentionally deferred because active cloud renderers expose no palette contract.

---

## 4. Phase 7 – `Planet.ts` entanglement

**Status: complete.**

Completed extractions:

```text
PlanetDiagnostics
    ├─ PlanetDefinitionStats
    ├─ PlanetRenderFeatureStats
    └─ PlanetTerrainTextureStats

PlanetOrbitingLayerController
    ├─ rings construction/update/visibility/disposal
    └─ moons construction/update/visibility/disposal

PlanetDebugVisibility
    └─ mechanical debug visibility routing
```

Intentionally preserved in `Planet` after audit:

- `setSunDirection()` because it bridges surface uniforms/material + WebGL/WebGPU cloud/atmosphere APIs,
- `setRenderQuality()` because it owns real shared quality policy,
- full `update()` lifecycle because it remains a high-risk shared owner,
- classic CubeSphere/surface fallback,
- clouds/atmosphere/gas giant/toxic haze ownership.

Detailed map: `PLANET_PHASE7_RESPONSIBILITY_MAP.md`.

---

## 5. Phase 8 – `NearSurfaceTerrainLayer`

**Status: isolated legacy compatibility path.**

Completed:

- [x] target `PlanetViewRuntime` already uses `SurfaceClipmapTerrain` and disables old NearSurface terrain,
- [x] concrete `NearSurfaceTerrainLayer` is not package-root API,
- [x] default `nearSurfaceTerrain` feature changed from `true` to `false`,
- [x] explicit legacy opt-in still supported temporarily,
- [x] regression test covers default-off + explicit opt-in,
- [x] remaining intentional consumer identified.

Important consumer:

```text
GamePrototypeScene
    ↓ direct new Planet(...)
nearSurfaceTerrain: true
    ↓
NearSurfaceTerrainLayer
```

This is the concrete reason the current game still uses the old planet/surface path.

Do not delete the implementation before the production game migration. Final file/API retirement follows that switch.

Detailed audit: `PLANET_PHASE8_NEAR_SURFACE_RETIREMENT.md`.

---

## 6. Phase 9 – old regional prototype chain

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

The active `rendering/regional` directory now contains only `CurvedRegionalTileTerrain.ts`.

The old edge-feather/relief-morph handoff workaround must not be reintroduced into the accepted modern depth/handoff architecture.

Detailed audit: `PLANET_PHASE9_REGIONAL_RETIREMENT.md`.

---

## 7. Phase 10 – obsolete atmosphere prototype

**Status: complete.**

Removed:

```text
OpenWorldsAtmosphereLayer.ts
```

Its useful physical concepts are already represented in the active `PlanetAtmospherePostProcess`:

- Rayleigh/Mie scattering,
- absorption,
- optical depth,
- planet self-shadowing,
- sun attenuation.

Retained active architecture:

```text
WebGPUAtmosphereLayer metadata
    ↓
PlanetAtmospherePostProcess
```

WebGL `AtmosphereLayer` remains fallback ownership.

Detailed audit: `PLANET_PHASE10_ATMOSPHERE_RETIREMENT.md`.

---

## 8. Phase 11+ cleanup – not a production rollout blocker

### Phase 11 – old surface materials

**Status: deferred/auditing.**

Current material factory still actively needs:

```text
PlanetSurfaceMaterial      → WebGL fallback
PlanetSurfaceNodeMaterial  → classic WebGPU Planet fallback
```

Do not delete them before fallback/CubeSphere ownership closes.

`PlanetOrbitSurfaceNodeMaterial` appears superseded but is still publicly exported; treat that as Phase 13 public-API cleanup rather than unsafe Phase-11 deletion.

### Phase 12 – CubeSphere legacy

- [ ] isolate/retire after production migration/performance findings.
- [ ] modern WebGPU `PlanetViewRuntime` still constructs hidden legacy surface infrastructure through `Planet`.

### Phase 13 – public API cleanup

- [ ] remove/deprecate obsolete compatibility fields/exports only after production migration.
- [ ] includes final `nearSurfaceTerrain` feature cleanup if no fallback remains.

These phases must not unnecessarily delay the modern Game switch.

---

## 9. Production game rollout gate – ACTIVE PRIORITY

The modern planet stack becomes the default Game path **before** the full roadmap is finished. It does not wait for adaptive geometry or WebGL follow-up.

Target sequence:

```text
Phase 7 complete                 ✅
Phase 8 legacy NearSurface isolated ✅
Phase 9 old regional chain retired ✅
    ↓
production regression gate
    ↓
production performance sanity gate
    ↓
GamePrototypeScene migrates from direct Planet
                    to PlanetViewRuntime adapter
    ↓
NEW PLANET STACK = DEFAULT GAME PATH
legacy Planet surface = fallback/reference only
```

Current rollout preparation:

- [x] `SystemPlanetViewRuntime` game-facing adapter created,
- [x] adapter preserves the small API shape needed by Game selection/camera/update code,
- [x] `PlanetProductionRolloutGate.test.ts` protects normalized view weights and single-depth-owner transition policy,
- [x] current Game legacy consumer explicitly identified,
- [ ] full modern descent/ascent visual smoke pass,
- [ ] representative solid-class smoke pass,
- [ ] gas/ice giant sanity pass,
- [ ] atmosphere/cloud/ring/moon sanity pass,
- [ ] first multi-planet/system-view performance sanity pass,
- [ ] migrate `GamePrototypeScene` planet factory/storage to the adapter,
- [ ] make modern path default,
- [ ] retain explicit fallback until later cleanup.

The existing Planet LOD lab already exercises the modern `PlanetViewRuntime`; the remaining rollout validation must now focus on game/system-view conditions and multiple planet instances.

---

## 10. Regression and performance follow-up

### Phase 14 – broader regression suite

Current automated coverage includes terrain/climate/composition/profile/runtime semantics and the production transition gate.

Still required over time:

- [ ] formal Orbit/Regional/Surface height continuity characterization,
- [ ] Regional/Surface broad material continuity characterization,
- [ ] all solid classes through descent/ascent,
- [ ] gas/ice giants,
- [ ] atmosphere/cloud/ring/moon combinations,
- [ ] multiple planet instances.

### Phase 15 – performance stabilization

- [ ] formal per-view measurements,
- [ ] multi-planet system-view measurements,
- [ ] hidden legacy `Planet`/CubeSphere construction cost review,
- [ ] memory/draw-call sanity before default Game rollout.

### Phase 16 – adaptive geometry

- [ ] only after stabilization.

The extra Surface clipmap near-detail ring is LOD refinement, not true tessellation.

### Phase 17 – WebGL follow-up

- [ ] after modern WebGPU production path is stable.

---

## 11. Known definition/runtime follow-ups

### Physical

Preserve:

```text
mass
gravity
density
rotationSpeed
axialTilt
```

Open integration work:

- [ ] `physical.rotationSpeed` as canonical rotation driver,
- [ ] `physical.axialTilt` in seasonal forcing,
- [ ] mass/gravity/density remain valid gameplay/simulation truth even when nonvisual.

### Atmosphere / weather

- [ ] pressure ownership in scattering/weather,
- [ ] compose seasonality + cloud persistence into one production weather evaluation,
- [ ] integrate `ashLoad` deliberately,
- [ ] decide future `cloudPalette` renderer contract.

### Moons

Current lightweight MoonSystem uses a deterministic parent-derived system seed. Individual `PlanetMoonDefinition` rendering remains future renderer migration work.

---

## 12. CI policy

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

## 13. Current next action

**Production rollout preparation.**

Priority:

```text
1. regression smoke/gate coverage
2. multi-planet performance sanity
3. wire GamePrototypeScene to SystemPlanetViewRuntime
4. visual Game validation
5. make modern planet runtime default
```

Do not spend production-gating time on Phase 11–13 cleanup unless a finding directly blocks the Game migration.

---

## 14. Working rule for future sessions

When continuing planet work:

1. read this file first,
2. read `docs/planet-view-architecture.md` for renderer ownership,
3. preserve accepted atmosphere/camera/depth baseline,
4. make one narrowly scoped migration at a time,
5. update the relevant phase audit after meaningful changes,
6. do not delete behavior before migration/reference review,
7. keep WebGPU first; isolate WebGL follow-up,
8. distinguish domain truth from derived render semantics and representation detail,
9. prioritize the production Game rollout gate over non-blocking cleanup.
