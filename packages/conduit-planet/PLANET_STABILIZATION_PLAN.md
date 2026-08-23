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
    └─ SurfaceMaterialSemantics
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
- [x] curved regional backdrop during approach.

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
  visual handoff: accepted

Regional → Surface
  lifecycle: working
  camera continuity: working
  physical terrain identity: shared
  visual/material continuity: OPEN
```

The Regional → Surface discontinuity is documented in:

`PLANET_REGIONAL_SURFACE_HANDOFF_FINDING.md`.

Do not mark this handoff visually stable until the material/ownership pop is removed.

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

## 8. Profile/material-semantics consolidation – Phase 6 active

This is the current active phase.

### Completed

- [x] introduced canonical `SurfaceMaterialSemantics`,
- [x] `SurfaceRenderProfile` derives composition influences from the shared semantics,
- [x] active `SurfaceTerrainMaterial` uses the same shared semantics,
- [x] exported shared semantics through the rendering boundary,
- [x] added regression coverage for profile/semantics consistency.

This removes the previous duplicate independent calculations for water/ice/lava/toxic/metal/rock/organic influence.

### Current target

```text
PlanetDefinition
    ↓
SurfaceMaterialSemantics
    ├─ SurfaceRenderProfile
    ├─ SurfaceView broad material evaluation
    └─ RegionalView broad material evaluation   ← next
```

Regional does **not** need Surface microdetail. It does need matching broad color/material identity in the overlap band.

### Remaining Phase 6 work

- [ ] align `CurvedRegionalTileTerrain` broad material evaluation with canonical Surface material semantics,
- [ ] remove duplicate palette resolution where the same meaning is represented more than once,
- [ ] audit `PlanetRenderProfile.enableRings` vs direct definition checks,
- [ ] audit actual `cloudPalette` consumption,
- [ ] remove remaining `as any` profile/seed probes where contracts can be made explicit,
- [ ] preserve renderer-specific values only when they are genuinely representation-specific.

---

## 9. Regional → Surface handoff repair

This follows the broad material-semantics alignment, not before it.

Current runtime behavior:

- Surface fades in through `regionalSurfaceStartMeters` → `regionalSurfaceEndMeters`,
- Regional remains fully opaque while Surface is only a finite local patch,
- Regional is hidden when Surface reaches the depth-ownership threshold,
- current threshold is effectively a final ownership cut around `surfaceWeight >= 0.985`.

Observed problem:

```text
Regional broad/simple material
        ↓
Surface richer/different material
        ↓
visible material/renderer pop
        + final ownership cut
```

Fix order:

1. [ ] make Regional use canonical broad material semantics,
2. [ ] compare representative classes/seeds in overlap,
3. [ ] redesign final opacity/depth ownership so Regional can release without a visible pop or dark horizon,
4. [ ] validate descent and ascent,
5. [ ] only then retune altitude bands if needed.

Do not attempt to hide the problem only by widening the blend range.

---

## 10. Transitional / legacy areas

### `Planet.ts`

Still owns too much:

- classic CubeSphere surface stack,
- old surface runtime material,
- planet body/depth body,
- atmosphere,
- clouds,
- rings,
- moons,
- giant rendering,
- toxic haze,
- old near-surface layer.

For modern WebGPU solid planets, `PlanetViewRuntime` constructs `Planet`, then hides/freezes obsolete surface pieces while using the new Orbit/Regional/Surface renderers.

**Status:** runtime-reachable and transitional; do not delete yet.

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

Resolve the legacy undeclared `render.moonSeed` probe before cleanup.

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

- [x] shared Surface material semantics foundation,
- [ ] Regional broad material alignment,
- [ ] remaining profile duplicate cleanup.

### Phase 7 – Reduce `Planet.ts` entanglement

- [ ] pending.

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

Current coverage already exists for many migrated terrain/climate/composition semantics, but the broader runtime matrix remains open:

- [ ] Orbit/Regional/Surface height continuity,
- [ ] Regional/Surface broad material continuity,
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

## 13. Current known inconsistencies

- [ ] Regional broad material semantics still differ from Surface,
- [ ] Regional → Surface final ownership uses a visible hard threshold strategy,
- [ ] `Planet.ts` still creates hidden legacy surface infrastructure on modern WebGPU solid planets,
- [ ] `DEFAULT_PLANET_RENDER_FEATURES.nearSurfaceTerrain` legacy behavior still needs retirement review,
- [ ] undeclared `render.moonSeed` probe,
- [ ] `enableRings` vs direct definition checks,
- [ ] duplicate palette/profile responsibilities still need final cleanup,
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

**Phase 6: make `CurvedRegionalTileTerrain` consume the shared broad Surface material semantics without adding Surface microdetail.**

After that, repair the Regional → Surface opacity/depth ownership transition documented in `PLANET_REGIONAL_SURFACE_HANDOFF_FINDING.md`.

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
