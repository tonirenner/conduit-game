# Conduit Planet – PlanetDefinition Usage & Migration Matrix

> Phase 1 companion document for `PLANET_STABILIZATION_PLAN.md`.
>
> **Policy:** WebGPU first. WebGL follows after the WebGPU architecture is stabilized.
>
> **Preservation rule:** No meaningful definition value is removed because it is currently unused. `UNWIRED` means migration/integration work, not deletion.

---

## 1. Status legend

| Status | Meaning |
|---|---|
| `ACTIVE` | Meaningfully consumed by the current target architecture. |
| `PARTIAL` | Consumed, but only part of its intended semantics reaches the current renderer/runtime. |
| `DOMAIN` | Valid domain/gameplay data; does not need a visual consumer to justify its existence. |
| `UNWIRED` | Generated/present but not yet meaningfully consumed by the target architecture. Must be reviewed/migrated. |
| `LEGACY` | Primarily consumed by the older renderer/path. Preserve until migration is complete. |
| `INCONSISTENT` | Current implementation has competing/duplicate contracts that need consolidation. |

Target consumer names in this document describe architectural ownership, not necessarily a final class/file name.

---

## 2. Root `PlanetDefinition`

| Field | Generated / source | Current / old consumers | Target responsibility | Status | Migration note |
|---|---|---|---|---|---|
| `id` | `PlanetGenerator`, optional override | Gameplay/UI/identity potential | Domain identity / persistence | `DOMAIN` | Preserve exactly; renderer should not depend on it for visuals. |
| `name` | `PlanetGenerator`, optional override | UI/debug/test scene | Domain/UI | `DOMAIN` | Preserve. |
| `seed` | Generator input | fallback seeding in layers; class/system generation | Root deterministic identity | `ACTIVE` | Keep as root seed; derived subsystem seeds should remain explicit. |
| `class` | `PlanetClassResolver` or forced option | render profile, terrain profile, materials, atmosphere, gas giant routing, tests | High-level classification only; should not replace composition/climate detail | `ACTIVE` | Current visuals still rely too heavily on class; composition/climate must add variation. |
| `composition` | generator + normalization | class resolution, resources, `SurfaceRenderProfile` influences | Domain composition + derived terrain/material/climate influences | `PARTIAL` | Detailed migration in section 8. |
| `physical` | generator | physical-scale conversion; generation/system semantics | Physics/system + render scale inputs | `PARTIAL` | Only radius is strongly wired into current planet renderer. |
| `orbit` | generator | climate generation; system/gameplay | Star-system simulation + climate forcing | `PARTIAL` | Mostly domain/system data, not direct surface-render settings. |
| `atmosphere` | generator | render profile, atmosphere, clouds, climate generation | Atmosphere + cloud + weather profiles | `ACTIVE/PARTIAL` | Pressure/type semantics need stronger downstream use. |
| `surface` | generator | render profile, elevation profile, terrain sampler, old/new material paths | Canonical terrain/surface definition | `PARTIAL` | Several fields are under-consumed; high priority. |
| `climate` | generator | cloud render profile and debug/domain; new terrain biome sampler only indirectly | Canonical global climate input for biome/weather/material | `PARTIAL` | Major gap: generated climate is not fully fed into canonical climate sampling. |
| `resources` | resource generator | gameplay/domain | Resource/gameplay model | `DOMAIN` | Never remove due to render cleanup. |
| `rings` | generator | `Planet.ts` checks enabled and uses seed; current renderer procedurally invents most visual structure | Ring renderer should consume ring definition | `PARTIAL` | Major migration gap; detailed below. |
| `moons` | generator | `Planet.ts` uses length only; current `MoonSystemLayer` generates visual moon properties independently | Moon renderer/system should consume actual moon definitions | `PARTIAL` | Major migration gap; detailed below. |
| `render` | generator | terrain seed, ring seed; several values currently under-used | Explicit deterministic visual/subsystem seeds | `PARTIAL` | Audit/migrate all seeds; avoid undeclared `moonSeed` probing. |

---

## 3. `PlanetPhysicalDefinition`

Fields: `radius`, `mass`, `gravity`, `density`, `rotationSpeed`, `axialTilt`.

| Field | Current consumers | Target consumer | Status | Decision / migration |
|---|---|---|---|---|
| `physical.radius` | `getPlanetRadiusMeters`, elevation scaling, Orbit/Regional/Surface physical scale, generation | Canonical physical size; all render views and gameplay | `ACTIVE` | Keep. Current physical-meter conversion is correct architectural ownership. |
| `physical.mass` | generated/domain; no meaningful current visual use identified | Orbital/physics/gameplay simulation | `DOMAIN` | Preserve; do not force into renderer. |
| `physical.gravity` | generated/domain; no meaningful current surface-render use identified | Player/vehicle/landing/physics | `DOMAIN` | Preserve. Later landing/gameplay should read this rather than invent gravity. |
| `physical.density` | generated/domain | Simulation/resource/science/gameplay | `DOMAIN` | Preserve. Not a renderer-cleanup candidate. |
| `physical.rotationSpeed` | generated; current clouds/rings/moons use hard-coded animation rates rather than this planet value | Planet rotation, day/night, atmosphere/cloud/weather frame | `UNWIRED` | Migrate physical rotation semantics into planet/system time model; do not blindly rotate local terrain views. |
| `physical.axialTilt` | generated; no meaningful current target-render use identified | Planet orientation, seasons, climate/insolation | `UNWIRED` | Integrate with system orientation/climate before considering visual seasons. |

### Phase-1 conclusion – physical

No field is removable. `mass`, `gravity`, `density` are legitimate domain-only data. `rotationSpeed` and `axialTilt` are currently under-used and should eventually influence the time/orientation/climate model.

---

## 4. `PlanetOrbitDefinition`

Fields: `semiMajorAxis`, `eccentricity`, `orbitalPeriod`, `starIrradiance`, `temperature`.

| Field | Current consumers | Target consumer | Status | Decision / migration |
|---|---|---|---|---|
| `orbit.semiMajorAxis` | generation/options/system semantics | Star-system orbit simulation | `DOMAIN` | Preserve. |
| `orbit.eccentricity` | climate generation (wind/seasonality tendencies) | Star-system orbit + climate forcing | `ACTIVE/PARTIAL` | Already useful during generation; later dynamic seasonal model may consume it directly. |
| `orbit.orbitalPeriod` | domain/system | Star-system time/orbit simulation | `DOMAIN` | Preserve. |
| `orbit.starIrradiance` | generation input / climate/temperature context | Lighting/climate/system | `PARTIAL` | Preserve; later sun-energy/atmosphere/climate coupling can use it. |
| `orbit.temperature` | climate generation / class/composition generation context | Global climate baseline | `ACTIVE` during generation | Preserve. Generated `climate.temperature01` remains the downstream normalized climate value. |

No orbit field should be removed during renderer cleanup.

---

## 5. `PlanetAtmosphereDefinition`

Fields: `type`, `density`, `pressure`, `cloudCoverage`, `haze`, `color`.

| Field | Current consumers | Target consumer | Status | Decision / migration |
|---|---|---|---|---|
| `atmosphere.type` | `PlanetRenderProfile.enableAtmosphere`; generation semantics | Atmosphere presence/model selection | `PARTIAL` | Preserve. Later scattering/weather model may distinguish thin/breathable/toxic/dense beyond on/off. |
| `atmosphere.density` | Render profile → WebGPU atmosphere/cloud profiles; climate generation | Screen-space atmosphere + cloud/weather derived config | `ACTIVE` | Keep current WebGPU post-process architecture. |
| `atmosphere.pressure` | generated/domain; no strong current visual consumption identified | Weather/atmospheric scattering/gameplay | `UNWIRED` | Integrate deliberately; pressure is not redundant with density. |
| `atmosphere.cloudCoverage` | render profile, cloud enablement/profile, climate generation | Cloud model | `ACTIVE` | Preserve. |
| `atmosphere.haze` | `Planet.getAtmosphereRenderProfileValues` → current WebGPU atmosphere source | Atmosphere aerosol/Mie response | `ACTIVE` | Preserve. |
| `atmosphere.color` | atmosphere render profile/source | Atmosphere tint/profile | `ACTIVE` | Preserve as definition input; palette/profile may transform it. |

### Atmosphere architecture rule

The current WebGPU screen-space/post-process atmosphere is the target baseline. Definition migration must feed that system rather than revive the superseded atmosphere shell renderer.

---

## 6. `PlanetSurfaceDefinition` – high-priority migration

Fields: `hasSolidSurface`, `hasOcean`, `hasIceCaps`, `hasVolcanism`, `hasTectonics`, `terrainRoughness`, `mountainScale`, `oceanLevel`.

| Field | Current consumers | Target consumer | Status | Decision / migration |
|---|---|---|---|---|
| `surface.hasSolidSurface` | `PlanetRenderProfile`, renderer routing | `PlanetViewRuntime` / renderer selection | `ACTIVE` | Keep. |
| `surface.hasOcean` | Render/Surface profiles; `PlanetTerrainSampler.isWater`; materials | Terrain sampler + material/ocean layer | `ACTIVE` | Keep, but water threshold must also use `oceanLevel`. |
| `surface.hasIceCaps` | `SurfaceRenderProfile.iceInfluence`; old material semantics | Climate/biome masks + new Surface material | `PARTIAL` | Migrate explicit polar/thermal ice-cap influence into canonical climate/material masks. |
| `surface.hasVolcanism` | `SurfaceRenderProfile.lavaInfluence`; climate ash generation; class behavior | Terrain relief + material volcanic masks + climate | `PARTIAL` | Preserve semantics outside pure `lava` class. Volcanic worlds should not require `class === lava`. |
| `surface.hasTectonics` | profile flag; little meaningful new-render consumption | Canonical terrain relief + material fault/ridge masks | `UNWIRED` | Integrate into terrain/relief first; material can consume resulting masks. |
| `surface.terrainRoughness` | `PlanetRenderProfile`, `SurfaceRenderProfile`; not consistently used by modern Surface geometry/material | Derived terrain/material profile | `PARTIAL` | Define ownership: macro/meso relief vs material roughness are different concepts. Do not directly equate terrain roughness with PBR roughness. |
| `surface.mountainScale` | Render profile; `PlanetElevationProfile` scales max elevation | Canonical elevation profile / terrain sampler | `ACTIVE` | Keep. Audit Orbit LUT displacement parity against canonical sampler. |
| `surface.oceanLevel` | copied into render/surface profiles; canonical sampler currently still uses a fixed land-mask threshold | `PlanetTerrainSampler` canonical water/shore contract | `UNWIRED` | High priority. Replace fixed-only threshold semantics with definition-driven ocean level while preserving existing baseline through calibrated mapping. |

### Surface migration rule

Geometry truth remains in the canonical terrain/elevation path. Material systems may consume surface masks but must not create competing displacement/collision truth.

---

## 7. `PlanetClimateDefinition` – high-priority migration

Fields: `seed`, `biomeSeed`, `weatherSeed`, `temperature01`, `humidity`, `aridity`, `windStrength`, `stormActivity`, `seasonality`, `cloudPersistence`, `ashLoad`.

| Field | Current consumers | Target consumer | Status | Decision / migration |
|---|---|---|---|---|
| `climate.seed` | generated; climate identity/reference | Climate sampling deterministic offsets | `PARTIAL/UNWIRED` | Canonical climate sampler should use it or one explicit derived seed contract. |
| `climate.biomeSeed` | generated; debug/domain; canonical `getClimateSample()` currently does not accept it | Biome spatial variation | `UNWIRED` | High priority. Must affect distribution without changing terrain geometry. |
| `climate.weatherSeed` | generated; current `getWeatherSample()` does not accept it | Weather pressure/cell identity | `UNWIRED` | High priority. Fixed seed + time must be deterministic. |
| `climate.temperature01` | render profile; generated cloud/climate semantics; not fully used by canonical terrain biome sampler | Climate sampler + material/ice/vegetation | `PARTIAL` | Feed as global baseline, then combine latitude/elevation/local noise. |
| `climate.humidity` | render/surface profile; not fully used by canonical terrain biome sampler | Climate/biome/material/cloud | `PARTIAL` | Global humidity bias + local spatial variation. |
| `climate.aridity` | render/surface profile; cloud shadow/profile calculations; not fully used by terrain biome sampler | Climate/biome/desert material | `PARTIAL` | Must influence biome/material distribution. |
| `climate.windStrength` | cloud profile/drift | Clouds + weather | `ACTIVE/PARTIAL` | Also feed weather wind field rather than only cloud animation/profile. |
| `climate.stormActivity` | cloud profile/density/storm influence | Clouds + weather | `ACTIVE/PARTIAL` | Feed canonical weather storm potential. |
| `climate.seasonality` | generated; no meaningful target renderer/runtime consumption identified | Climate/time model | `UNWIRED` | Preserve. Combine later with axial tilt/orbit phase. |
| `climate.cloudPersistence` | cloud profile | Cloud model | `ACTIVE` | Preserve. |
| `climate.ashLoad` | cloud profile, generated from volcanism/class | Clouds + atmosphere/material deposition potential | `ACTIVE/PARTIAL` | Current cloud use is valid; later surface/atmosphere can consume it too. |

### Climate canonicalization target

Conceptual ownership:

```text
PlanetClimateDefinition = global tendencies
climate/biome seed       = spatial identity
terrain + latitude       = local physical context
ClimateSample            = deterministic local result
```

The existing procedural `getClimateSample()` should be evolved, not replaced with class-only material hacks.

---

## 8. `PlanetMaterialComposition`

Fields: `rock`, `metal`, `ice`, `water`, `gas`, `organic`, `volatiles`.

| Field | Current consumers | Target consumer | Status | Decision / migration |
|---|---|---|---|---|
| `composition.rock` | class resolution, resource generation | Terrain/material weighting | `PARTIAL` | Add class-independent rock/mineral influence where useful. |
| `composition.metal` | class resolution, resources, `SurfaceRenderProfile.metalInfluence` | New Surface material metal/mineral masks | `PARTIAL` | Do not make whole surface uniformly metallic; use deposits/veins/probability. |
| `composition.ice` | class resolution, resources, `SurfaceRenderProfile.iceInfluence`, climate generation | Climate/ice/snow material masks | `PARTIAL` | Combine with temperature and `hasIceCaps`. |
| `composition.water` | class resolution, resources, humidity generation, `SurfaceRenderProfile.waterInfluence` | Ocean/climate/coast/biome | `PARTIAL` | Water abundance should influence more than boolean `hasOcean`. |
| `composition.gas` | class resolution/system identity | Gas/ice giant and atmosphere/domain | `PARTIAL/DOMAIN` | Preserve; solid-surface materials need not consume it directly. |
| `composition.organic` | class/resources generation; little current modern surface use | Vegetation/organic biome potential | `UNWIRED` | Integrate only where climate/surface permits; avoid automatic green tint. |
| `composition.volatiles` | class/resources/climate generation, `SurfaceRenderProfile.toxicInfluence` | Atmosphere/cloud/weather/volatile surface behavior | `PARTIAL` | Preserve and feed derived profiles. |

### Composition rule

Planet class remains a useful broad archetype, but visual identity should be `class + composition + climate + seed`, not class alone.

---

## 9. `PlanetResourceProfile`

Fields: `metal`, `rareMaterials`, `fuel`, `water`, `volatiles`, `researchValue`, `extractionDifficulty`.

All resource fields are `DOMAIN`.

They are generated by `PlanetResourceGenerator` from planet properties and belong to gameplay/economy/scanning/mining systems. They do **not** need a rendering consumer to remain valid.

Potential optional visual coupling later (mineral deposits, ice, volatile vents) must be derived and should never make resource gameplay values shader-owned.

**Decision:** preserve all resource fields unchanged during planet renderer cleanup.

---

## 10. `PlanetRingDefinition` – major under-consumption found

Fields: `enabled`, `seed`, `innerRadius`, `outerRadius`, `density`, `opacity`, `composition.{ice,rock,dust}`, `bands[]`.

Current architecture finding:

`Planet.ts` currently checks ring enablement and passes a radius/seed plus a renderer-kind-dependent hard-coded opacity to `RingSystemLayer`. `RingSystemLayer` then procedurally chooses most ring structure itself when options are omitted.

Therefore most generated ring definition values are currently not authoritative in rendering.

| Field | Current consumer | Target consumer | Status | Migration |
|---|---|---|---|---|
| `rings.enabled` | `Planet.ts` | Ring layer creation | `ACTIVE` | Consolidate with `PlanetRenderProfile.enableRings` to avoid duplicate truth. |
| `rings.seed` | generated; `Planet.ts` currently prefers `render.ringSeed` | Ring deterministic identity | `INCONSISTENT` | Define one rule: domain ring seed vs render variation seed. Preserve both only if semantics differ. |
| `rings.innerRadius` | not passed to current `RingSystemLayer` | Ring geometry | `UNWIRED` | Must become authoritative. |
| `rings.outerRadius` | not passed | Ring geometry | `UNWIRED` | Must become authoritative. |
| `rings.density` | not meaningfully consumed | particle/opacity/band density | `UNWIRED` | Integrate into render profile/particle distribution. |
| `rings.opacity` | current renderer uses a hard-coded renderer-kind opacity instead | ring material/profile | `UNWIRED/INCONSISTENT` | Definition should be base value; renderer may apply quality/view scaling. |
| `rings.composition.ice` | not meaningfully consumed | particle palette/material | `UNWIRED` | Use for icy brightness/color/roughness. |
| `rings.composition.rock` | not meaningfully consumed | particle palette/material | `UNWIRED` | Use for rocky/dark fraction. |
| `rings.composition.dust` | not meaningfully consumed | particle size/opacity/haze fraction | `UNWIRED` | Use for fine diffuse component. |
| `rings.bands[].offset` | not consumed | band radial placement | `UNWIRED` | Use generated band structure rather than inventing all bands inside renderer. |
| `rings.bands[].width` | not consumed | band width | `UNWIRED` | Integrate. |
| `rings.bands[].density` | not consumed | local particle density | `UNWIRED` | Integrate. |
| `rings.bands[].color` | not consumed | local band color | `UNWIRED` | Integrate. |

**Decision:** ring definition is valuable and must be migrated into `RingSystemLayer` (or successor), not deleted.

---

## 11. `PlanetMoonDefinition` – major under-consumption found

Fields per moon: `id`, `name`, `seed`, `class`, `radius`, `orbitRadius`, `orbitPeriod`, `composition`.

Current architecture finding:

`Planet.ts` currently uses only `definition.moons.length` when constructing `MoonSystemLayer`. The layer then procedurally generates moon radii, orbit radii, colors, orbit speeds and spin using a shared seed. It does not receive the actual moon definitions.

| Field | Current consumer | Target consumer | Status | Migration |
|---|---|---|---|---|
| `moons[].id` | domain/UI potential | Moon identity/persistence | `DOMAIN` | Preserve. |
| `moons[].name` | domain/UI potential | UI/scanning/system | `DOMAIN` | Preserve. |
| `moons[].seed` | not passed to renderer | moon deterministic surface/visual identity | `UNWIRED` | Pass actual moon definition to moon rendering/system. |
| `moons[].class` | not consumed by current moon renderer | moon visual/terrain archetype | `UNWIRED` | Use for material/surface renderer selection. |
| `moons[].radius` | current moon renderer invents radius | moon physical/render scale | `UNWIRED` | Make definition authoritative. |
| `moons[].orbitRadius` | current moon renderer invents orbit radius | moon orbit | `UNWIRED` | Make definition authoritative. |
| `moons[].orbitPeriod` | current moon renderer invents orbit speed | moon orbit simulation | `UNWIRED` | Convert period to animation/system angular velocity. |
| `moons[].composition` | not consumed | moon material/resources/class detail | `UNWIRED` | Feed moon surface/material generation as appropriate. |

### Moon seed inconsistency

`Planet.ts` probes `(definition.render as any)?.moonSeed`, but `PlanetRenderSeeds` does not define `moonSeed`.

**Decision:** remove the implicit/undeclared contract only after actual `PlanetMoonDefinition.seed` ownership is wired. The generated moon definitions should be the authoritative moon identities.

---

## 12. `PlanetRenderSeeds`

Fields: `paletteSeed`, `terrainSeed`, `cloudSeed`, `atmosphereSeed`, `ringSeed`, `climateSeed`, `biomeSeed`, `weatherSeed`.

| Field | Current consumers | Target consumer | Status | Migration |
|---|---|---|---|---|
| `render.paletteSeed` | no strong modern consumer identified | Material palette variation | `UNWIRED` | Feed deterministic palette variation without changing class identity. |
| `render.terrainSeed` | terrain config, `PlanetTerrainSampler`, Orbit volume, old materials, erosion | Canonical terrain identity | `ACTIVE` | Keep as authoritative terrain visual seed. |
| `render.cloudSeed` | no strong modern WebGPU cloud noise seed contract identified | WebGPU cloud field identity | `UNWIRED` | Add deterministic cloud spatial identity; current cloud shader should not look identical across same-profile planets. |
| `render.atmosphereSeed` | no meaningful current atmosphere post-process use identified | Only if atmosphere needs spatial stochastic variation | `UNWIRED/REVIEW` | Preserve. May remain low-impact if atmosphere is intentionally smooth; document semantics rather than delete. |
| `render.ringSeed` | `Planet.ts` uses it for `RingSystemLayer` | Ring visual variation | `ACTIVE/PARTIAL` | Clarify relation to `rings.seed`. |
| `render.climateSeed` | mirrors generated climate seed; canonical climate sampler not fully seeded by it | Climate spatial identity | `UNWIRED/INCONSISTENT` | Consolidate with `climate.seed`; avoid two competing equal-purpose seeds. |
| `render.biomeSeed` | mirrors generated biome seed; canonical sampler not using it | Biome spatial identity | `UNWIRED/INCONSISTENT` | Consolidate with `climate.biomeSeed`; one semantic owner, aliases only if compatibility requires. |
| `render.weatherSeed` | mirrors generated weather seed; current weather sampler not using it | Weather spatial identity | `UNWIRED/INCONSISTENT` | Consolidate with `climate.weatherSeed`. |

### Seed design target

Prefer explicit semantic ownership:

```text
planet.seed               root generation identity
render.terrainSeed        terrain spatial identity
render.paletteSeed        visual palette variation
render.cloudSeed          cloud spatial identity
render.atmosphereSeed     optional atmospheric stochastic identity
rings.seed / ringSeed     clarify domain vs visual variation
climate.seed              global climate spatial identity
climate.biomeSeed         biome spatial identity
climate.weatherSeed       weather spatial identity
moons[].seed              each moon identity
```

Duplicate aliases should not survive indefinitely unless backward compatibility genuinely requires them.

---

## 13. Cross-cutting current architecture findings

### 13.1 Canonical terrain sampler

`PlanetTerrainSampler` is already the right target owner for physical surface sampling:

- terrain noise,
- geometry relief,
- physical elevation,
- normal,
- land/water state,
- climate/biome sample attachment.

But it currently still has two notable fixed/under-wired contracts:

1. water uses a fixed land-mask threshold rather than the generated `surface.oceanLevel` as authoritative input;
2. climate sampling does not yet consume the generated `PlanetClimateDefinition`/biome seed.

These are migration tasks, not reasons to replace the sampler.

### 13.2 Modern Surface material

`SurfaceTerrainMaterial` currently consumes primarily:

- planet class,
- physical radius for physical-scale detail frequencies,
- terrain/material attributes generated by SurfaceClipmap.

It has working generic class profiles plus strong Lava tuning, but does not yet consume the full existing `SurfaceRenderProfile` semantics (composition/climate influences, ocean level, tectonic/volcanic flags, etc.).

**Target:** feed useful derived semantics into the modern material system without giving material ownership of geometry/collision.

### 13.3 Current Orbit renderer

`InstancedOrbitTerrain` + `OrbitTerrainVolume` is the WebGPU-first target. Orbit volume is seeded with `render.terrainSeed` and class-specific terrain profile.

Future migration must ensure definition-driven elevation/ocean/material changes remain visually continuous across:

```text
Orbit → Regional → Surface
```

### 13.4 Legacy `Planet.ts`

`Planet.ts` currently bridges shared valid planet layers and older surface renderer architecture. Do not delete it early.

Migration goal remains to separate shared layers from classic terrain/material construction so modern WebGPU planets no longer create hidden legacy geometry/material just to obtain clouds/atmosphere/rings/moons.

---

## 14. Phase 1 priority backlog produced by the matrix

### P0 – definition truth / continuity

- [ ] Integrate `surface.oceanLevel` into canonical `PlanetTerrainSampler` water/shore semantics without abruptly changing the known-good visual baseline.
- [ ] Feed generated `PlanetClimateDefinition` into canonical local climate sampling.
- [ ] Feed `biomeSeed` into biome spatial variation.
- [ ] Feed `weatherSeed` and climate wind/storm values into weather sampling.
- [ ] Define `terrainRoughness` semantics separately from PBR roughness.
- [ ] Define canonical `hasTectonics` terrain/relief influence.
- [ ] Define canonical `hasVolcanism` influence outside pure Lava planets.
- [ ] Define canonical `hasIceCaps` climate/material influence.

### P1 – renderer definition completeness

- [ ] Migrate full `PlanetRingDefinition` into the ring renderer.
- [ ] Migrate actual `PlanetMoonDefinition[]` into the moon renderer instead of regenerating moon properties from count.
- [ ] Clarify `rings.seed` vs `render.ringSeed`.
- [ ] Remove undeclared `render.moonSeed` concept after moon-definition seeding is authoritative.
- [ ] Feed `paletteSeed` into deterministic material variation.
- [ ] Feed `cloudSeed` into WebGPU cloud spatial identity.

### P2 – richer differentiation

- [ ] Composition-driven surface material weighting.
- [ ] `organic` → vegetation potential through climate/biome, not direct tint.
- [ ] `metal` → localized mineral/metallic features rather than uniform metalness.
- [ ] `water` abundance → ocean/coast/humidity behavior beyond boolean `hasOcean`.
- [ ] `ice` abundance → ice/snow potential combined with temperature.
- [ ] `volatiles` → cloud/weather/atmosphere/vent behavior.
- [ ] Use `rotationSpeed`, `axialTilt`, `seasonality` in a future coherent planet-time/climate model.

### Domain-only – preserve, no renderer requirement

- `id`, `name`,
- `physical.mass`, `physical.gravity`, `physical.density`,
- orbital/system values where not directly rendered,
- all `resources.*`,
- moon identity/name fields.

These must not be deleted merely because WebGPU rendering does not consume them.

---

## 15. Phase 1 completion criteria

Phase 1 is considered complete when:

- [x] every root `PlanetDefinition` field has a disposition,
- [x] every `PlanetPhysicalDefinition` field has a disposition,
- [x] every `PlanetOrbitDefinition` field has a disposition,
- [x] every `PlanetAtmosphereDefinition` field has a disposition,
- [x] every `PlanetSurfaceDefinition` field has a disposition,
- [x] every `PlanetClimateDefinition` field has a disposition,
- [x] every `PlanetMaterialComposition` field has a disposition,
- [x] every `PlanetResourceProfile` field has a disposition,
- [x] every `PlanetRingDefinition` and band/composition field has a disposition,
- [x] every `PlanetMoonDefinition` field has a disposition,
- [x] every `PlanetRenderSeeds` field has a disposition,
- [x] no currently unused value has been classified as removable solely due to lack of a current consumer,
- [x] migration priorities have been extracted.

**Phase 1 documentation status: COMPLETE.**

No production renderer/terrain code was changed as part of this matrix audit.

---

## 16. Next phase

Per `PLANET_STABILIZATION_PLAN.md`:

**Phase 2 – old → new material migration matrix.**

Before deleting old surface material code, compare the old WebGL/WebGPU material behavior against `rendering/surface/SurfaceTerrainMaterial.ts` and classify each useful behavior as:

- already migrated,
- migrate,
- intentionally superseded,
- WebGL follow-up only.

WebGPU remains first priority.