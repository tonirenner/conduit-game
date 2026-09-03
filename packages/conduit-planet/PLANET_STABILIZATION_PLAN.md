# Conduit Planet – Stabilization & Migration Plan

> Main working document for cleanup, migration and stabilization of `packages/conduit-planet`.
>
> **Core rule:** no meaningful `PlanetDefinition` value or useful established behavior is removed merely because the current renderer does not consume it yet. Migrate, preserve as domain-only, or explicitly retire.

---

## 1. Current target architecture

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
    └─ shared masks / material inputs
    ↓
scale-specific renderers
    ├─ OrbitView
    ├─ RegionalView
    └─ SurfaceView
```

Ownership principle:

```text
Definition = domain truth
Profile / MaterialSemantics = derived render configuration
Canonical sampler/domain functions = physical/climate truth
Renderer = representation-specific consumer
```

Do not create competing terrain, climate, composition or planet-definition models inside renderers.

---

## 2. Hard migration rules

### Definition is truth

A renderer may derive values from `PlanetDefinition`, but may not invent a second authoritative interpretation.

### No silent definition loss

Before removing a value or behavior:

```text
What does it represent?
→ where was it used?
→ is the behavior still wanted?
   ├─ yes: migrate first
   └─ no: explicitly document retirement
```

### Cleanup and feature work stay separable

Avoid mixing unrelated:

- deletion/cleanup,
- visual tuning,
- terrain generation changes,
- camera changes,
- new adaptive geometry.

### WebGPU first

Priority:

```text
1. WebGPU correctness
2. WebGPU architecture/stability
3. definition/material coverage
4. performance
5. WebGL follow-up
```

WebGL may remain fallback/reference behavior, but must not force duplicate domain logic into the modern path.

---

## 3. Current view baseline

### OrbitView

- [x] fixed instanced terrain for modern WebGPU solid planets,
- [x] pre-baked terrain LUT,
- [x] bounded global complexity,
- [x] classic CubeSphere hidden/frozen on the modern path.

### RegionalView

- [x] active `CurvedRegionalTileTerrain`,
- [x] canonical `PlanetTerrainSampler` geometry,
- [x] uniform edge resolution per build to avoid T-junctions,
- [x] curved regional backdrop during approach,
- [x] broad material evaluation shared with SurfaceView.

### SurfaceView

- [x] active `SurfaceClipmapTerrain`,
- [x] local tangent/reference-frame rendering,
- [x] fixed reusable clipmap rings,
- [x] canonical physical terrain samples,
- [x] fragment-side material detail,
- [x] material roughness / metalness / micro-normal / cavity-AO.

### Transition status

```text
Orbit → Regional
  lifecycle: stable
  geometry: stable
  depth ownership: stable
  visual handoff: accepted

Regional → Surface
  lifecycle: working
  camera continuity: working
  physical terrain identity: shared
  broad material identity: shared
  checker/depth artifact: repaired
  final detail/shading continuity: not yet formally accepted
```

The Regional → Surface work is documented in:

`PLANET_REGIONAL_SURFACE_HANDOFF_FINDING.md`.

The important depth rule is now explicit:

```text
never allow two nearly coplanar terrain representations
simultaneously to own/write depth during a handoff
```

Do not disturb the accepted Orbit → Regional ownership behavior during unrelated cleanup.

---

## 4. Atmosphere baseline

- [x] WebGPU atmosphere uses the screen-space/post-process source architecture,
- [x] atmosphere is independent from terrain-view ownership,
- [x] per-planet metadata/source state remains intact,
- [x] previous shell experiments are not the target architecture.

Protect atmosphere/camera reconstruction during unrelated terrain/material cleanup.

---

## 5. Canonical terrain status

`PlanetTerrainSampler` is the authoritative physical near/regional surface sampler.

Completed definition migration:

- [x] `surface.oceanLevel`,
- [x] `surface.terrainRoughness`,
- [x] `surface.hasTectonics`,
- [x] `surface.hasVolcanism`,
- [x] `surface.hasIceCaps`,
- [x] shared canonical volcanic mask,
- [x] shared canonical ice-cap mask,
- [x] geometry-only relief remains separated from climate/biome thresholds.

Physical displacement/collision truth must remain outside surface materials.

---

## 6. Climate / biome / weather status

Phase 4 canonical migration is complete for:

- [x] climate seed,
- [x] temperature,
- [x] humidity,
- [x] aridity,
- [x] biome seed,
- [x] weather seed,
- [x] wind strength,
- [x] storm activity,
- [x] seasonality,
- [x] cloud persistence.

`ashLoad` is intentionally excluded from the general climate migration and remains a later volcanic/atmospheric/material integration concern.

Current integration gaps:

- [ ] compose seasonality + cloud persistence into one canonical live weather evaluation,
- [ ] wire that composition into an active production weather/cloud consumer,
- [ ] decide how `physical.axialTilt` affects seasonal forcing,
- [ ] connect `ashLoad` deliberately to volcanic/atmospheric visuals.

The canonical simulation clock is documented in `docs/SIMULATION_TIME.md`.

---

## 7. Composition status – Phase 5 complete

Canonical composition keys:

```text
rock
metal
ice
water
gas
organic
volatiles
```

All are preserved as domain truth and now have explicit visual semantics where appropriate.

### Solid-surface material semantics

- [x] metal → exposed metalness / color / roughness response,
- [x] ice → canonical ice-cap material response,
- [x] water → material variation only after canonical water classification,
- [x] volatiles/toxic → restrained toxic/mineral surface response,
- [x] lava/volcanism → canonical volcanic-mask response outside full Lava worlds,
- [x] rock → mineral/rock base-material weighting,
- [x] organic → intentionally restricted carbon-world material semantics.

### Giant semantics

- [x] gas → continuous Gas/Ice Giant visual density influence.

Detailed audit: `PLANET_PHASE5_COMPOSITION_AUDIT.md`.

---

## 8. Profile/material-semantics consolidation – Phase 6 complete

Phase 6 is complete.

### Completed

- [x] canonical `SurfaceMaterialSemantics`,
- [x] `SurfaceRenderProfile` consumes shared composition semantics,
- [x] active Surface material evaluator consumes the same semantics,
- [x] Regional broad material evaluation uses the same canonical path,
- [x] canonical `SurfacePalette` mapping,
- [x] duplicate Surface/Planet profile palette derivation removed,
- [x] climate/surface values forwarded through the profile chain rather than re-derived,
- [x] ring runtime ownership routed through `PlanetRenderProfile.enableRings`,
- [x] declared `render.ringSeed` consumed without `as any`,
- [x] undeclared `render.moonSeed` probe removed,
- [x] explicit deterministic moon-system seed contract added,
- [x] regression coverage for profile/material/layer-runtime contracts.

Canonical chain:

```text
PlanetDefinition
    ↓
PlanetRenderProfile
    ↓
SurfaceRenderProfile / SurfaceMaterialSemantics / layer runtime profiles
    ↓
renderer consumers
```

Detailed audit: `PLANET_PHASE6_PROFILE_AUDIT.md`.

### Explicit deferred item

`PlanetRenderProfile.cloudPalette` is retained but currently intentionally unused because neither active cloud renderer exposes a palette contract. Introducing one would be visual feature work, not Phase-6 cleanup.

It does not block Phase 6 completion.

---

## 9. Current active phase – Phase 7: reduce `Planet.ts` entanglement

`Planet.ts` remains transitional, but the first low-risk responsibilities have now been extracted.

### Completed Phase 7 extractions

#### Runtime diagnostics

`src/runtime/PlanetDiagnostics.ts` owns pure assembly of:

```text
PlanetDefinitionStats
PlanetRenderFeatureStats
PlanetTerrainTextureStats
```

The existing public `Planet` methods remain thin compatibility wrappers. Live CubeSphere terrain stats remain with `Planet` because they directly expose classic terrain runtime state.

#### Rings and moons

`src/runtime/PlanetOrbitingLayerController.ts` now owns:

```text
RingSystemLayer construction
MoonSystemLayer construction
ring/moon update
ring/moon debug visibility
ring/moon disposal
```

The controller consumes the canonical Phase 6 ring/moon runtime contracts and preserves construction order and deterministic behavior.

`Planet.ts` no longer owns individual `RingSystemLayer` / `MoonSystemLayer` instances.

### Responsibilities intentionally still in `Planet`

- classic CubeSphere surface stack,
- old surface runtime material,
- planet body/depth occluder,
- atmosphere,
- clouds,
- gas/ice giant renderer,
- toxic haze,
- old near-surface layer,
- render tuning,
- shared quality/sun/update fanout,
- CubeSphere terrain diagnostics.

For modern WebGPU solid planets, `PlanetViewRuntime` still constructs `Planet`, then hides/freezes obsolete surface pieces while using the new Orbit/Regional/Surface renderers.

### Phase 7 rule

Continue one narrow responsibility at a time. Do not use file size alone as a reason to move ownership.

Before each extraction:

```text
Planet.ts responsibility
    ↓
active modern consumer?
legacy/WebGL consumer?
public/debug API consumer?
shared layer ownership?
    ↓
extract / preserve / retire later
```

### Current Phase 7 next audit

Audit these low/medium-risk fanout responsibilities before moving them:

```text
setDebugLayerVisibility()
setSunDirection()
setRenderQuality()
```

Prefer a narrow controller/helper boundary. Do not move the full `Planet.update()` lifecycle yet.

Detailed map: `PLANET_PHASE7_RESPONSIBILITY_MAP.md`.

### Protect during Phase 7

Do not alter as collateral damage:

- accepted Orbit → Regional handoff,
- Regional → Surface depth fix,
- atmosphere reconstruction,
- canonical terrain sampling,
- camera/reference-frame logic,
- ring/moon deterministic behavior,
- WebGL fallback behavior unless explicitly addressed.

---

## 10. Transitional / legacy areas

### `NearSurfaceTerrainLayer.ts`

Older independent tangent terrain path.

**Status:** retirement candidate after API/default/reference audit.

### Old regional prototype chain

```text
GpuRegionalSurfaceTerrain
→ HydraulicRegionalSurfaceTerrain
→ RegionalSurfaceHandoffTerrain
```

Not active. Mine useful erosion/normal/AO/handoff algorithms before deletion.

### Classic CubeSphere stack

Still reachable through legacy/WebGL/public API paths.

**Status:** isolate/retire later; must not block modern WebGPU architecture.

### Old surface materials

Still useful as behavioral/reference material until migration matrix and fallback ownership are closed.

### `OpenWorldsAtmosphereLayer.ts`

Likely obsolete experiment; remove only after import/export/runtime confirmation.

---

## 11. Known definition fields still needing explicit integration decisions

### Physical

```text
mass
gravity
density
rotationSpeed
axialTilt
```

Preserve. `rotationSpeed` and `axialTilt` have obvious future runtime uses; mass/gravity/density are gameplay/simulation values even if nonvisual.

### Orbit

```text
semiMajorAxis
eccentricity
orbitalPeriod
starIrradiance
temperature
```

Preserve. `orbitalPeriod` is already used by the season-cycle foundation.

### Atmosphere

`pressure` still needs explicit runtime/scattering/weather ownership.

### Render seeds

Audit remaining consumption for palette/cloud/atmosphere seeds and remove compatibility probes only after explicit ownership exists.

### Rings/moons

Ring runtime seed/enable ownership is explicit. The current lightweight MoonSystem uses a deterministic system seed derived from `PlanetDefinition.seed`; individual `PlanetMoonDefinition` rendering remains a future renderer migration concern.

---

## 12. Stabilization phase status

### Phase 0 – Baseline freeze

- [x] complete.

### Phase 1 – Definition usage audit

- [x] sufficiently complete to drive migration.
- [ ] continue updating the matrix when later consumers are discovered.

### Phase 2 – Old → new material migration audit

- [x] behavioral comparison established.
- [ ] keep old material files until remaining useful responsibilities are classified/migrated.

### Phase 3 – Terrain definition migration

- [x] complete.

### Phase 4 – Climate / Biome / Weather definition migration

- [x] complete for the planned definition semantics.
- [ ] end-to-end live weather composition remains later integration work.

### Phase 5 – Composition migration

- [x] complete.

### Phase 6 – Profile/material-semantics consolidation

- [x] complete.

### Phase 7 – Reduce `Planet.ts` entanglement

- [x] responsibility/consumer map established,
- [x] runtime diagnostics extracted,
- [x] ring/moon orchestration extracted,
- [ ] shared debug/quality/sun fanout audit active,
- [ ] remaining medium/high-risk responsibilities deferred until ownership is proven.

### Phase 8 – Retire `NearSurfaceTerrainLayer`

- [ ] pending.

### Phase 9 – Retire old regional renderer chain

- [ ] pending after useful algorithm extraction.

### Phase 10 – Retire obsolete atmosphere prototypes

- [ ] pending.

### Phase 11 – Retire superseded old surface materials

- [ ] pending after fallback/reference responsibilities close.

### Phase 12 – Isolate/retire CubeSphere legacy

- [ ] pending.

### Phase 13 – Public API cleanup

- [ ] pending.

### Phase 14 – Regression suite

Current coverage already exists for many migrated terrain/climate/composition/profile/runtime semantics, but the broader runtime matrix remains open:

- [ ] Orbit/Regional/Surface height continuity,
- [ ] Regional/Surface broad material continuity characterization,
- [ ] all solid classes through full descent/ascent,
- [ ] gas/ice giants,
- [ ] atmosphere/cloud/ring/moon combinations,
- [ ] multiple planet instances.

### Phase 15 – Performance stabilization

- [ ] pending formal per-view measurements.

### Phase 16 – Adaptive geometry / tessellation-like refinement

- [ ] only after stabilization.

The extra Surface clipmap near-detail ring is LOD refinement, not true tessellation.

### Phase 17 – WebGL follow-up

- [ ] after modern WebGPU stack is stable.

---

## 13. Current known inconsistencies / deferred work

- [ ] Regional → Surface final detail/shading continuity still needs formal visual acceptance,
- [ ] `Planet.ts` still creates hidden legacy surface infrastructure on modern WebGPU solid planets,
- [ ] `DEFAULT_PLANET_RENDER_FEATURES.nearSurfaceTerrain` legacy behavior still needs retirement review,
- [ ] `cloudPalette` has no active cloud-renderer contract and is explicitly deferred,
- [ ] live seasonality + cloud persistence are not yet composed through one proven production weather consumer,
- [ ] `physical.rotationSpeed` is not yet the canonical planet rotation driver,
- [ ] `physical.axialTilt` is not yet part of seasonal forcing,
- [ ] atmosphere pressure ownership remains incomplete,
- [ ] WebGL compatibility must remain a later isolated follow-up.

---

## 14. CI policy

Planet CI is pinned to a known Bun version rather than `latest` after Bun 1.4.0 produced a runner segmentation fault (`exit 139`) during package tests.

A Bun runtime crash is infrastructure/tooling failure, not a test assertion failure. Still distinguish:

```text
verified CI result
vs
no failure mail / operational signal
vs
connector returns no statuses
```

Do not claim CI green unless a successful check/result is actually visible.

---

## 15. Current next action

**Phase 7: audit the remaining low/medium-risk shared fanout before another extraction.**

Current candidates:

```text
setDebugLayerVisibility()
setSunDirection()
setRenderQuality()
```

Do not move the full `Planet.update()` lifecycle until more layer ownership is explicitly separated.

---

## 16. Working rule for future sessions

When continuing planet work:

1. read this file first,
2. read `docs/planet-view-architecture.md` for current renderer ownership,
3. update status/docs after meaningful migration steps,
4. preserve the accepted atmosphere/camera baseline unless directly relevant,
5. make one narrowly scoped migration at a time,
6. do not delete behavior before migration/reference review,
7. keep WebGPU first and WebGL follow-up isolated,
8. distinguish domain truth from derived render semantics and representation-specific detail.
