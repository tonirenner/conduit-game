# Conduit Planet – Stabilization & Migration Plan

> Internal working document for cleanup, migration, stabilization and progress tracking of `packages/conduit-planet`.
>
> **Core rule:** No meaningful `PlanetDefinition` value or established behavior may be removed simply because the new renderer does not consume it yet. Existing/legacy implementations are treated as reference material until their responsibilities have been migrated or consciously retired.

---

## 1. Goal

The package is currently in a successful transition from several older planet rendering generations toward a clear purpose-built architecture:

```text
PlanetDefinition
    ↓
PlanetGeneration
    ↓
derived profiles
    ├─ TerrainProfile
    ├─ SurfaceProfile
    ├─ ClimateProfile
    ├─ AtmosphereProfile
    └─ CloudProfile
    ↓
canonical systems
    ├─ PlanetTerrainSampler
    ├─ Climate / Biome / Weather
    └─ Material Evaluation
    ↓
renderers
    ├─ OrbitView
    ├─ RegionalView
    └─ SurfaceView
```

The stabilization work must:

1. preserve the current working visual baseline,
2. preserve all useful domain/definition values,
3. migrate useful behavior from legacy code before deletion,
4. remove superseded render paths only after reference checks,
5. consolidate duplicated definitions/profiles,
6. add regression coverage,
7. only then continue with larger geometry features such as adaptive tessellation/subdivision.

---

## 2. Hard migration rules

### 2.1 Definition is truth

`PlanetDefinition` is the domain truth. Renderers may derive values from it, but must not create a competing planet definition.

```text
Definition
    ↓
Derived Render/Profile Values
    ↓
Renderer
```

### 2.2 No silent definition loss

A definition/profile value that is currently unused is **not** considered dead by default.

Before removing any value:

```text
What does this value represent?
        ↓
Was it used by an older implementation?
        ↓
Does that behavior still make sense?
        ├─ YES → migrate it first
        └─ NO  → explicitly document retirement
```

### 2.3 Cleanup commits and feature commits stay separate

Do not mix:

- cleanup/deletion,
- visual tuning,
- terrain generation changes,
- camera changes,
- new tessellation/subdivision work.

This keeps regressions attributable.

### 2.4 Delete only after migration/reference check

Before deleting a file/module:

```text
What could this file do?
        ↓
Does the new system provide the same useful responsibility?
        ├─ YES → deletion candidate
        └─ NO
            ↓
Is the responsibility still wanted?
            ├─ YES → migrate first
            └─ NO  → explicitly retire
```

---

## 3. Current known-good baseline

This baseline should be treated as frozen while cleanup/stabilization is performed.

### View architecture

- [x] OrbitView uses fixed instanced terrain.
- [x] Orbit terrain uses a pre-baked 3D terrain LUT.
- [x] RegionalView uses curved regional geometry.
- [x] SurfaceView uses local tangent clipmap terrain.
- [x] Orbit → Regional handoff is stable.
- [x] Regional → Surface handoff is stable.
- [x] Return Surface → Regional → Orbit is supported.
- [x] Camera ownership/handoff works between OrbitControls and non-orbit free-look.

### Atmosphere

- [x] Current WebGPU atmosphere uses the screen-space/post-process source architecture.
- [x] Atmosphere remains attached per planet instance through metadata/source state.
- [x] Previous shell-based atmosphere experiments are not the target architecture.

### Terrain

- [x] `PlanetTerrainSampler` is the canonical near/regional surface sampler.
- [x] Geometry relief is separated from canonical biome thresholds.
- [x] Regional geometry seam/T-junction issue was fixed by safe uniform tile resolution per altitude band.
- [x] Surface clipmap has a local additional near-detail ring.
- [x] Surface material does not own physical displacement/collision truth.

### Surface material phases

- [x] Phase 1 – material-dependent Roughness.
- [x] Phase 2 – fragment-side material/texturing infrastructure.
- [x] Phase 2 – Lava baseline complete.
- [x] Phase 3 – material-dependent Micro-Normals.
- [x] Phase 4 – local Cavity/AO layered with global GTAO.

### Lava baseline

- [x] dark basalt crust dominates,
- [x] fragment-side cracks,
- [x] localized emissive crack cores,
- [x] sparse hotspots,
- [x] physically scaled detail frequencies,
- [x] rough basalt,
- [x] micro-normal response,
- [x] local cavity/AO.

**Do not casually retune this baseline during cleanup.**

---

## 4. Current target architecture

### New active core – protect first

These modules represent the current target direction and should not be removed as part of early cleanup:

```text
src/view/PlanetViewRuntime.ts
src/view/PlanetViewTransition.ts

src/rendering/orbit/InstancedOrbitTerrain.ts
src/rendering/orbit/OrbitTerrainVolume.ts

src/rendering/regional/CurvedRegionalTileTerrain.ts

src/rendering/surface/SurfaceClipmapTerrain.ts
src/rendering/surface/SurfaceTerrainMaterial.ts

src/near-view/PlanetTerrainSampler.ts
src/near-view/PlanetElevationProfile.ts

src/terrain/TerrainGeometryRelief.ts
src/terrain/TerrainGeometryUtils.ts
src/terrain/noise.ts
```

### Shared systems that remain valid

- planet definition/model,
- generation,
- composition,
- resources,
- climate concepts,
- weather concepts,
- atmosphere profiles,
- cloud profiles,
- rings,
- moons,
- gas/ice giant rendering.

The issue is generally not that these concepts are obsolete; several are simply not fully wired into the new surface architecture yet.

---

## 5. Known legacy / transitional areas

### 5.1 `Planet.ts`

Current responsibility is too broad. It still owns/constructs several older rendering paths while also owning valid shared layers.

Responsibilities include:

- classic CubeSphere terrain,
- old surface runtime material,
- planet body/depth body,
- atmosphere,
- clouds,
- rings,
- moons,
- gas giants,
- toxic haze,
- old `NearSurfaceTerrainLayer`.

For WebGPU solid-surface planets, `PlanetViewRuntime` currently creates `Planet`, then hides/freezes parts of the classic surface stack and renders the new Orbit/Regional/Surface representations instead.

**Status:** transitional, runtime-reachable, do not delete.

Desired future split:

```text
Planet
├─ definition/profile
├─ PlanetLayers
│  ├─ Atmosphere
│  ├─ Clouds
│  ├─ Rings
│  ├─ Moons
│  └─ Haze
└─ renderer
   ├─ SolidSurfacePlanetRenderer
   │  ├─ Orbit
   │  ├─ Regional
   │  └─ Surface
   └─ GasGiantRenderer
```

### 5.2 `NearSurfaceTerrainLayer.ts`

This is an older second near-surface terrain system with its own:

- tangent patch,
- geometry,
- colors,
- direct terrain sampling,
- rebuild lifecycle.

The new `PlanetViewRuntime` explicitly disables this feature for its modern path.

However, `DEFAULT_PLANET_RENDER_FEATURES.nearSurfaceTerrain` is still enabled by default for standalone legacy `Planet` usage.

**Status:** strong retirement candidate, but only after external/runtime references are checked and feature default/API is migrated.

### 5.3 Old regional prototype chain

```text
GpuRegionalSurfaceTerrain
    ↓
HydraulicRegionalSurfaceTerrain
    ↓
RegionalSurfaceHandoffTerrain
```

The active runtime uses `CurvedRegionalTileTerrain` instead.

Useful behavior contained in the old chain must be reviewed before deletion, especially:

- hydraulic erosion,
- derived normal rebuilding,
- AO/cavity map derivation,
- handoff/edge feathering ideas.

**Status:** renderer chain likely superseded; algorithms may still be valuable.

### 5.4 Classic CubeSphere stack

Includes approximately:

```text
CubeSphere
TerrainPatch
AsyncTerrainPatch
TerrainSource
CachedTerrainSource
TerrainHeightCache
TerrainWorkerPool
TerrainWorkerProtocol
LOD balancing
classic horizon/frustum patch logic
```

The modern WebGPU surface planet no longer uses this as the visible renderer, but `Planet.ts`, WebGL fallback behavior and public exports still make it runtime/API reachable.

**Status:** legacy but not yet safely removable.

### 5.5 Old surface materials

```text
PlanetSurfaceMaterial.ts
PlanetSurfaceNodeMaterial.ts
PlanetSurfaceMaterialFactory.ts
PlanetOrbitSurfaceNodeMaterial.ts
```

These contain significant established behavior and must be mined before removal.

The modern SurfaceView now has its own `SurfaceTerrainMaterial`, but the old material system is still useful as a behavioral reference for:

- palettes,
- class visual behavior,
- water/coast logic,
- lava,
- ice,
- atmosphere interactions,
- material response,
- raymarch concepts,
- profile usage.

**Status:** migrate/reference first, then deprecate.

### 5.6 Old atmosphere experiment

`OpenWorldsAtmosphereLayer.ts` represents a previous physical shell/raymarch approach.

The active WebGPU architecture uses `WebGPUAtmosphereLayer` as a source for the screen-space atmosphere pass.

**Status:** likely early deletion candidate after repository-wide import/export confirmation.

---

## 6. Definition values – preservation and migration matrix

This section is intentionally conservative. Values marked `TODO` are **integration work**, not deletion candidates.

### 6.1 Physical definition

```text
physical.radius
physical.mass
physical.gravity
physical.density
physical.rotationSpeed
physical.axialTilt
```

Status:

- `radius`: actively relevant to rendering/physical scale.
- remaining physical values: preserve as domain values even where visual renderer does not yet consume them.

Potential future uses:

- gravity for vehicle/player physics,
- rotation speed for day/night/weather/cloud movement,
- axial tilt for climate/seasonality/lighting,
- density/mass for gameplay/system simulation.

### 6.2 Orbit definition

```text
semiMajorAxis
eccentricity
orbitalPeriod
starIrradiance
temperature
```

Preserve all. They belong to planet/system simulation and climate generation even if the current isolated planet renderer does not directly consume every value.

### 6.3 Atmosphere definition

```text
type
density
pressure
cloudCoverage
haze
color
```

Mostly active through atmosphere/cloud profiles.

TODO:

- audit `pressure` usage,
- ensure type/pressure can influence future scattering/weather where appropriate.

### 6.4 Surface definition

```text
hasSolidSurface
hasOcean
hasIceCaps
hasVolcanism
hasTectonics
terrainRoughness
mountainScale
oceanLevel
```

Known status:

- `hasSolidSurface`: active.
- `hasOcean`: active.
- `mountainScale`: active through elevation/profile logic.
- `terrainRoughness`: generated/profiled, but not yet consistently consumed by the new Surface material/geometry stack.
- `oceanLevel`: currently not the canonical water threshold in `PlanetTerrainSampler`.
- `hasTectonics`: not meaningfully connected to new geometry/material stack yet.
- `hasVolcanism`: partly reflected by class/profile behavior, not fully connected to new terrain generation.
- `hasIceCaps`: not yet fully integrated in the new material/climate surface path.

**All must be preserved and intentionally integrated.**

### 6.5 Climate definition

```text
seed
biomeSeed
weatherSeed

temperature01
humidity
aridity
windStrength
stormActivity
seasonality
cloudPersistence
ashLoad
```

Generated climate values are useful and already influence some cloud behavior.

Known gap:

The canonical `PlanetTerrainSampler` currently calls procedural `getClimateSample()` without the generated `PlanetClimateDefinition`. Therefore the new terrain biome sampling does not yet fully reflect the generated planet climate values/seeds.

**Migration target:** climate sampling must accept the planet climate definition and biome seed while preserving deterministic spatial behavior.

### 6.6 Composition

```text
rock
metal
ice
water
gas
organic
volatiles
```

Preserve all.

Future/desired renderer influences:

- metal → mineral/material metalness and visual veins,
- ice → ice/snow probability/coverage,
- water → ocean/humidity/coast behavior,
- organic → vegetation potential,
- volatiles → atmosphere/cloud/weather/volcanic potential,
- rock → rock/base terrain material weighting,
- gas → gas giant / atmosphere/system identity.

Planet class should not be the only visual consequence of composition.

### 6.7 Resources

Resource profiles are gameplay/domain data. Preserve independently of renderer cleanup.

### 6.8 Rings and moons

Preserve definitions and rendering behavior.

Audit inconsistency:

`Planet.ts` currently probes `(definition.render as any)?.moonSeed`, while `PlanetRenderSeeds` does not define `moonSeed`.

TODO:

- determine intended moon seeding contract,
- remove `as any` workaround after contract is explicit.

### 6.9 Render seeds

```text
paletteSeed
terrainSeed
cloudSeed
atmosphereSeed
ringSeed
climateSeed
biomeSeed
weatherSeed
```

Known:

- `terrainSeed`: actively central.
- `ringSeed`: used.

Audit/integration required:

- `paletteSeed`,
- `cloudSeed`,
- `atmosphereSeed`,
- `climateSeed`,
- `biomeSeed`,
- `weatherSeed`.

Unused currently does not mean unwanted.

---

## 7. Profile consolidation

### `PlanetRenderProfile`

Audit every field for actual consumption:

```text
rendererKind

enableTerrain
enableOcean
enableClouds
enableAtmosphere
enableRings

surfacePalette
atmospherePalette
cloudPalette

terrainRoughness
mountainScale
oceanLevel
cloudCoverage
atmosphereDensity

climateTemperature
climateHumidity
climateAridity
climateWindStrength
climateStormActivity
climateCloudPersistence
climateAshLoad
```

Known issues to resolve:

- `enableRings` vs direct `definition.rings.enabled` checks,
- duplicate palette resolution between profile layers,
- `cloudPalette` generation vs actual cloud consumption,
- profile values that are calculated but bypassed by newer renderers.

### `SurfaceRenderProfile`

Contains valuable already-derived values:

```text
waterInfluence
iceInfluence
lavaInfluence
toxicInfluence
metalInfluence

terrainRoughness
mountainScale
oceanLevel

climateTemperature
climateHumidity
climateAridity
climateWindStrength
climateStormActivity
climateCloudPersistence
climateAshLoad

raymarchOcclusionStrength
```

The modern `SurfaceClipmapTerrain` / `SurfaceTerrainMaterial` path currently receives `PlanetDefinition` directly rather than consistently consuming this profile.

**Do not delete the profile values until their useful semantics have been migrated.**

Desired principle:

```text
Definition = truth
Profile    = derived rendering configuration
Renderer   = consumer
```

Avoid duplicate independent values in Definition, Profile and Shader.

---

## 8. Material migration plan

Compare old and new surface materials behavior-by-behavior.

### Matrix to complete

- [ ] Base color / palette behavior
- [ ] Planet class mapping
- [ ] Composition influence
- [ ] Climate influence
- [ ] Biome influence
- [ ] Water
- [ ] Ocean level
- [ ] Coastline/shelf/islands
- [ ] Ice
- [ ] Snow
- [ ] Desert
- [ ] Rocky
- [ ] Barren
- [ ] Terrestrial
- [ ] Ocean
- [ ] Toxic
- [ ] Carbon
- [ ] Metal-rich
- [x] Lava baseline
- [x] Roughness architecture
- [x] Metalness channel architecture
- [x] Emissive channel architecture
- [x] Micro-Normals architecture
- [x] local Cavity/AO architecture
- [ ] Tectonic visual influence
- [ ] Volcanism influence outside forced Lava class
- [ ] Environment/reflection behavior
- [ ] Old raymarch-specific behavior: classify as migrate/obsolete

Rule: old shader/material files remain reference sources until this matrix is closed.

---

## 9. Terrain migration plan

Make `PlanetTerrainSampler` the canonical physical terrain API for landable solid planets.

Desired responsibility:

```text
PlanetTerrainSampler
├─ canonical terrain noise
├─ geometry relief
├─ physical elevation
├─ land/water decision
├─ normals
├─ climate sampling
├─ biome sampling
└─ stable masks for render/gameplay consumers
```

### TODO

- [ ] integrate `surface.oceanLevel` instead of relying on a fixed land-mask threshold alone,
- [ ] define how `terrainRoughness` affects geometry vs material,
- [ ] connect `hasTectonics` to canonical terrain/relief semantics,
- [ ] connect `hasVolcanism` to canonical terrain/relief/material semantics,
- [ ] connect `hasIceCaps` to climate/material masks,
- [ ] preserve Geometry-only relief separation from biome thresholds unless consciously changed,
- [ ] ensure Orbit/Regional/Surface all converge on the same physical height contract.

---

## 10. Climate / biome migration

Current issue:

`PlanetDefinition.climate` is richly generated, but the procedural `getClimateSample()` used by the canonical terrain sampler does not yet consume the generated planet climate definition/seeds.

Desired API shape (conceptual):

```text
getClimateSample(
    direction,
    terrainSample,
    planetClimateDefinition,
    biomeSeed
)
```

Required properties:

- deterministic,
- same planet seed → same result,
- climate controls global tendencies,
- spatial noise adds local variation,
- altitude and latitude remain meaningful,
- coastline/ocean remain meaningful,
- geometry-only detail must not accidentally shift biome classification.

### TODO

- [ ] connect base temperature,
- [ ] connect humidity,
- [ ] connect aridity,
- [ ] connect seasonality where relevant,
- [ ] connect biome seed,
- [ ] ensure two planets of same class but different climate/seed can look materially different.

---

## 11. Weather migration

`Weather.ts` already provides useful concepts:

- pressure,
- low/high pressure,
- wind bands,
- wind strength,
- storm potential,
- cloud boost,
- swirl.

Desired model:

```text
Planet climate = global tendencies
Weather seed   = spatial identity
Time           = temporal evolution
Weather sample = local current state
```

### TODO

- [ ] connect `weatherSeed`,
- [ ] connect generated wind/storm climate strengths,
- [ ] determine cloud integration path,
- [ ] preserve deterministic behavior for fixed seed + time.

---

## 12. Cleanup execution order

### Phase 0 – Baseline freeze

- [x] establish known-good visual/runtime baseline,
- [x] do not mix feature changes into cleanup.

### Phase 1 – Complete definition usage matrix

- [ ] audit every `PlanetDefinition` field repo-wide,
- [ ] document old consumer,
- [ ] document current consumer,
- [ ] assign new target consumer,
- [ ] mark integrate / preserve-domain-only / intentionally retire.

### Phase 2 – Complete old → new material migration matrix

- [ ] compare old WebGL surface material,
- [ ] compare old WebGPU node surface material,
- [ ] compare old orbit material,
- [ ] transfer missing useful semantics into new material system.

### Phase 3 – Integrate terrain definition values

- [ ] ocean level,
- [ ] terrain roughness,
- [ ] tectonics,
- [ ] volcanism,
- [ ] ice caps.

### Phase 4 – Integrate Climate/Biome/Weather

- [ ] generated climate → terrain climate sampling,
- [ ] biome seed,
- [ ] weather seed,
- [ ] preserve climate/cloud behavior.

### Phase 5 – Integrate composition

- [ ] material influence,
- [ ] climate influence where meaningful,
- [ ] avoid class-only visual identity.

### Phase 6 – Consolidate profiles

- [ ] remove duplicate calculations only after new consumers are wired,
- [ ] make profiles clearly derived configuration,
- [ ] eliminate `as any` profile/seed probes where possible.

### Phase 7 – Entangle less in `Planet.ts`

- [ ] separate shared planet layers from classic surface renderer,
- [ ] let modern `PlanetViewRuntime` avoid constructing hidden legacy surface geometry/material where possible,
- [ ] preserve gas giant and WebGL behavior.

### Phase 8 – Retire `NearSurfaceTerrainLayer`

- [ ] verify external references,
- [ ] change/deprecate feature default/API,
- [ ] test standalone Planet usage,
- [ ] remove only when SurfaceClipmap covers responsibility.

### Phase 9 – Retire old regional renderer chain

- [ ] extract useful erosion/normal/AO algorithms,
- [ ] confirm no active imports/exports,
- [ ] remove renderer prototypes.

### Phase 10 – Retire superseded atmosphere prototype(s)

- [ ] confirm no runtime/import/public API use,
- [ ] remove only obsolete shell implementation(s),
- [ ] preserve atmosphere profile logic still used by current post-process source.

### Phase 11 – Retire old surface materials

Only after material migration matrix is complete and `Planet.ts` no longer constructs them for the modern WebGPU path.

- [ ] deprecate public exports,
- [ ] search external package/game usage,
- [ ] preserve WebGL fallback if still required,
- [ ] remove in small commits.

### Phase 12 – Isolate/retire CubeSphere legacy

- [ ] determine WebGL requirement,
- [ ] determine public API requirement,
- [ ] verify diagnostics/tests/users,
- [ ] optionally move to a clear legacy/fallback area first,
- [ ] remove only after modern path fully owns required responsibilities.

### Phase 13 – Public API cleanup

- [ ] internal usage removed first,
- [ ] deprecate exports,
- [ ] repo-wide usage search,
- [ ] remove exports,
- [ ] remove files later.

### Phase 14 – Regression suite

Add tests/smoke checks for:

- [ ] deterministic planet generation,
- [ ] deterministic terrain samples,
- [ ] deterministic climate/biome samples,
- [ ] weather determinism,
- [ ] Orbit/Regional/Surface height continuity,
- [ ] all solid planet classes,
- [ ] gas/ice giants,
- [ ] atmosphere on/off,
- [ ] clouds on/off,
- [ ] rings/moons,
- [ ] Orbit → Regional → Surface,
- [ ] Surface → Regional → Orbit,
- [ ] multiple planet instances.

### Phase 15 – Performance stabilization

Track separately by view:

```text
Orbit
Regional
Surface
```

Measure:

- CPU frame time,
- GPU frame time,
- draw calls,
- vertex/index count,
- textures/memory,
- terrain samples/rebuilds,
- shader cost,
- allocations/rebuild churn.

### Phase 16 – Adaptive geometry / tessellation-like refinement

Only after stabilization.

Goal:

```text
SurfaceClipmap
    ↓
camera position + view direction
    ↓
small local high-detail region
    ↓
adaptive subdivision / GPU-compute refinement if worthwhile
```

The existing extra near-detail clipmap ring is an LOD refinement experiment, **not** true tessellation.

---

## 13. Early deletion candidates – NOT yet approved

These are candidates, not permission to delete.

### Likely superseded

- `OpenWorldsAtmosphereLayer.ts`
- `rendering/regional/GpuRegionalSurfaceTerrain.ts`
- `rendering/regional/HydraulicRegionalSurfaceTerrain.ts`
- `rendering/regional/RegionalSurfaceHandoffTerrain.ts`

Before deletion:

- repo-wide import check,
- public export check,
- useful algorithm extraction,
- runtime smoke test.

### Later candidates

- `NearSurfaceTerrainLayer.ts`
- `PlanetOrbitSurfaceNodeMaterial.ts`
- classic CubeSphere stack,
- old surface materials.

These require deeper migration first.

---

## 14. Known inconsistencies / audit list

- [ ] `DEFAULT_PLANET_RENDER_FEATURES.nearSurfaceTerrain === true` while modern `PlanetViewRuntime` explicitly disables it.
- [ ] `Planet.ts` still constructs classic terrain/material for modern WebGPU solid planets, then runtime hides/freezes it.
- [ ] `Planet.ts` probes an undeclared `render.moonSeed` via `as any`.
- [ ] `PlanetRenderProfile.enableRings` vs direct `definition.rings.enabled` usage.
- [ ] `surfacePalette` resolved in more than one place.
- [ ] `cloudPalette` exists but requires actual consumer audit.
- [ ] `surface.oceanLevel` is not yet the canonical Surface water threshold.
- [ ] generated climate values are not fully consumed by `PlanetTerrainSampler` climate/biome sampling.
- [ ] climate/biome/weather seeds need a complete usage audit.
- [ ] `SurfaceRenderProfile` contains useful derived influences that modern SurfaceView does not yet consistently consume.
- [ ] old regional hydraulic erosion belongs conceptually to terrain generation, not necessarily to a renderer subclass.

---

## 15. Progress log

### 2026-08-16 – Initial stabilization audit

- [x] Reviewed package architecture around current Orbit/Regional/Surface runtime.
- [x] Identified modern active core.
- [x] Identified classic CubeSphere/Planet surface stack as transitional legacy.
- [x] Identified old `NearSurfaceTerrainLayer` as competing near-surface implementation.
- [x] Identified old Regional GPU → Hydraulic → Handoff prototype chain.
- [x] Identified older OpenWorlds atmosphere shell as superseded candidate.
- [x] Identified definition/profile values that currently appear under-consumed by the modern renderer.
- [x] Established rule that unused definitions must be integrated or explicitly retired, never silently deleted.
- [x] Added this document as the persistent migration/progress reference.

### Current next action

**Phase 1: build the complete field-by-field `PlanetDefinition` usage/migration matrix before any cleanup deletion.**

No cleanup deletion should begin until that matrix is sufficiently complete to identify behavior that must be migrated first.

---

## 16. Working note for future sessions

When continuing work on `conduit-planet`:

1. read this file first,
2. update the Progress Log after meaningful migration/cleanup steps,
3. mark checklist items rather than relying only on chat history,
4. keep current known-good visual baseline stable during cleanup,
5. do not remove definition values just because they are not currently consumed,
6. use old implementations as migration references before deletion,
7. prefer one narrowly scoped cleanup/migration change at a time.
