# Conduit Planet – Material Migration Matrix

> Phase 2 working document for mapping the legacy planet surface material behavior into the modern `rendering/surface/SurfaceTerrainMaterial.ts` architecture.
>
> **Policy:** WebGPU first. The modern WebGPU material architecture is the target. WebGL is retained as behavioral reference/fallback and follows later.
>
> **Safety rule:** No useful visual behavior is removed merely because the current SurfaceView does not yet implement it. Useful legacy semantics are classified and migrated before old materials are retired.

---

## 1. Compared material paths

### Legacy WebGL reference

- `src/PlanetSurfaceMaterial.ts`
- GLSL `ShaderMaterial`
- old CubeSphere/TerrainPatch contract
- procedural terrain/color logic in shader
- integrated lighting, water, aerial perspective and profile controls

### Legacy WebGPU reference

- `src/PlanetSurfaceNodeMaterial.ts`
- `MeshBasicNodeMaterial` + TSL/WGSL
- old CubeSphere/TerrainPatch contract
- procedural terrain re-evaluation in material
- optional baked terrain atlas
- class palettes, water/coast, fake environment response, day/night lighting and optional surface raymarch self-shadowing

### Legacy lightweight orbit material

- `src/PlanetOrbitSurfaceNodeMaterial.ts`
- cheap old-patch WebGPU orbit shader
- vertex displacement from TerrainPatch attributes
- cheap day/night lighting + water fresnel hint

### Modern WebGPU SurfaceView target

- `src/rendering/surface/SurfaceTerrainMaterial.ts`
- `MeshStandardNodeMaterial`
- physical PBR channels
- geometry/displacement truth remains outside the material
- CPU material evaluator + fragment-side procedural micro detail
- roughness / metalness / emissive / micro-normal / local AO

---

## 2. Architectural decision

The following legacy responsibilities must **not** be copied into the new material:

| Legacy behavior | Decision | Reason |
|---|---|---|
| procedural terrain height generation inside material | **REPLACED** | `PlanetTerrainSampler` owns terrain truth |
| GPU vertex displacement from old TerrainPatch attributes | **REPLACED** | SurfaceClipmap geometry owns physical shape |
| material-side independent land/continent generation | **REPLACED** | canonical terrain masks must come from sampler/geometry |
| baked terrain atlas controlling physical terrain | **REPLACED / REVIEW** | new views must converge on canonical terrain data |
| old surface raymarch height function as a second terrain model | **DO NOT MIGRATE AS-IS** | duplicates terrain truth and can diverge |
| fake atmosphere embedded in surface shader | **REPLACED** | active atmosphere is screen-space post-process |

The following legacy responsibilities **are valuable and must be migrated or intentionally superseded**:

- class visual identity,
- water/coast/shelf/island semantics,
- polar/height ice and snow semantics,
- class-specific material behavior,
- composition/profile influence,
- climate/biome influence,
- environment/reflection response,
- useful day/night readability controls,
- profile-driven roughness/metalness/material weighting,
- useful terrain self-shadow concepts if they can use canonical terrain data.

---

## 3. High-level behavior matrix

Legend:

- **DONE** – modern implementation already provides the useful responsibility.
- **PARTIAL** – useful implementation exists but legacy behavior/definition influence is not fully migrated.
- **MISSING** – behavior exists in legacy material and remains useful, but modern Surface material does not yet provide it.
- **REPLACED** – legacy behavior is intentionally superseded by another modern subsystem.
- **DROP** – implementation detail should not be migrated.

| Behavior | WebGL old | WebGPU old | Modern Surface | Status | Migration decision |
|---|---:|---:|---:|---|---|
| class palette identity | yes | yes | yes | PARTIAL | retain modern physical palette, finish per-class tuning |
| canonical terrain displacement | shader-related | shader/vertex | external | REPLACED | sampler/geometry remains authority |
| terrain seed visual detail | implicit procedural | explicit seed offset | detail offset | DONE/PARTIAL | keep modern seeded material detail; later use `paletteSeed`/material seed contract |
| base color by elevation | yes | yes | yes | DONE | retain |
| mountain/rock material mask | yes | yes | yes | DONE | modern adds erosion+slope; retain |
| erosion-aware surface shading | limited | limited | yes | DONE | modern better |
| river-aware shading | no/limited | no/limited | yes | DONE | modern better |
| slope-aware material | limited | limited | yes | DONE | modern better |
| PBR roughness | simulated lighting | not true PBR | yes | DONE | modern is target |
| PBR metalness | palette/fake reflection | fake environment | yes | DONE/PARTIAL | connect composition/profile influence |
| emissive channel | lava color/glow | lava glow | yes | DONE | modern Lava baseline retained |
| procedural micro-normal | procedural terrain normal | visual normal concepts | yes | DONE | modern better separation |
| local cavity/AO | lighting tricks | visual shading | yes | DONE | modern AO + GTAO split retained |
| water color depth gradient | yes | yes | simple | PARTIAL | migrate richer water depth/shelf semantics |
| coast transition | yes | yes | sampler water boolean + simple color | MISSING/PARTIAL | migrate canonical coastline masks |
| continental shelf | yes | yes | no | MISSING | migrate through shared coastline profile/masks |
| island threshold behavior | limited | yes | no | MISSING | migrate for ocean class where useful |
| polar ice | subtle | yes | class-only ice | MISSING/PARTIAL | connect `hasIceCaps`, latitude and climate |
| height snow | yes | yes | ice class brightening only | MISSING | migrate as climate/material mask |
| vegetation pattern | yes | yes | simple terrestrial/ocean land mask | PARTIAL | replace with canonical biome/climate vegetation |
| dry-region pattern | yes | yes | class palette only | MISSING/PARTIAL | use climate aridity/biome |
| toxic chemical staining | palette-specific | yes | generic toxic palette | MISSING | migrate useful class identity |
| carbon ridge veins/dust | palette-specific | yes | micro detail only | MISSING/PARTIAL | migrate material-specific patterning |
| metallic mineral visual response | palette | yes | metalness + palette | PARTIAL | composition-driven mineral/metal weighting |
| lava basalt + cracks | yes | yes | yes | DONE | modern implementation is baseline |
| sparse lava hotspots | old coarse | yes | yes | DONE | modern implementation preferred |
| ice cracks | yes/limited | yes | yes | DONE/PARTIAL | modern cracks exist; later climate/ice-cap integration |
| fake ocean fresnel | yes | yes | PBR material | REPLACED/PARTIAL | prefer physical PBR; add explicit water material if needed |
| fake environment reflection | limited | extensive | PBR lighting only | MISSING/REVIEW | integrate real environment response, not fake hard-coded probe |
| class visual profile night readability | yes | yes | no explicit profile | MISSING/REVIEW | migrate only if still needed after PBR/atmosphere |
| direct custom day/night lighting | yes | yes | standard lighting | REPLACED | prefer engine lighting; preserve readability via proper lights/environment |
| terminator tuning | yes | yes | external lighting | REPLACED | do not duplicate sun model in material |
| surface-integrated atmosphere haze | yes | fake in node material | no | REPLACED | screen-space atmosphere owns this |
| surface raymarch self-shadow | no/limited | yes | GTAO + material AO | REVIEW | do not copy old independent terrain function; possible future canonical terrain shadowing |
| baked terrain texture blend | old path | yes | no | REVIEW/DROP | only retain if useful as cache, never as second terrain truth |
| runtime forced lava URL hook | no/yes variants | yes | class definition | DROP | dev UI should select class/definition, not shader URL override |

---

## 4. Profile/definition input migration

### 4.1 `SurfaceRenderProfile`

Legacy WebGPU consumes these directly:

```text
oceanLevel
mountainScale
terrainRoughness
waterInfluence
iceInfluence
lavaInfluence
toxicInfluence
metalInfluence
raymarchOcclusionStrength
palette
```

The modern Surface material currently consumes primarily:

```text
PlanetDefinition.class
PlanetDefinition.physical.radius
canonical terrain attributes from SurfaceClipmap
seed/detail offset
```

Therefore the following are Phase-2 migration gaps:

| Profile/definition concept | Modern state | Decision |
|---|---|---|
| `terrainRoughness` | class constants dominate | integrate into derived material profile |
| `waterInfluence` | mostly binary water | integrate after canonical ocean-level work |
| `iceInfluence` | class-specific only | integrate with ice caps/climate |
| `lavaInfluence` | Lava class baseline | support volcanic influence on non-Lava surfaces later |
| `toxicInfluence` | Toxic class only | integrate composition/volatile influence where useful |
| `metalInfluence` | class constants | integrate composition metal fraction |
| `mountainScale` | geometry profile, not material | material may consume derived rock/slope masks only; do not duplicate geometry scaling |
| `oceanLevel` | not canonical yet | terrain migration first; material consumes canonical water/coast masks afterward |
| `raymarchOcclusionStrength` | old raymarch-specific | do not migrate directly; evaluate canonical alternative later |
| class visual profile | not explicit | review night/environment values after PBR integration |

### 4.2 `PlanetClassVisualProfile`

Legacy fields:

```text
nightAlbedo
ambientBoost
directLightScale
shadowFill
visibilityFloor
visibilityFillColor
environmentReflection
environmentPeak
```

Classification:

- `environmentReflection` / `environmentPeak`: **useful semantic**, but should map to real PBR/environment behavior instead of fake tint math.
- `nightAlbedo`, `ambientBoost`, `shadowFill`, `visibilityFloor`, `visibilityFillColor`: **review**, because they mostly compensated for the old unlit/custom-lighting architecture.
- `directLightScale`: **review/drop as direct scalar**; prefer physical lighting/material parameters.

Do not blindly copy these constants into `MeshStandardNodeMaterial`.

---

## 5. Class-by-class migration matrix

### 5.1 Barren

Legacy useful behavior:

- warm low/high rock palette,
- pale mountain material,
- dusty/coast-height variation,
- relatively high night readability.

Modern:

- base palette exists,
- elevation + rock mask exists,
- strong micro-normal and cavity profile exists.

Status: **PARTIAL**.

TODO:

- [ ] restore subtle dusty/mineral broad variation without hard-coded coast dependency,
- [ ] evaluate class environment response under real PBR.

### 5.2 Rocky

Legacy useful behavior:

- gray/tan elevation gradient,
- light mountain peaks,
- strong terrain readability.

Modern:

- palette exists,
- strongest coarse micro-normal/cavity class profile,
- slope/erosion-aware rock mask.

Status: **MOSTLY MIGRATED**.

TODO:

- [ ] tune broad-scale color variation,
- [ ] connect `terrainRoughness`/composition.

### 5.3 Terrestrial

Legacy useful behavior:

- coast/water transitions,
- grass/hills/dry hills/rock/snow elevation bands,
- polar tint,
- procedural vegetation/dry patterns,
- water fresnel/specular and environment response.

Modern:

- earthlike palette,
- very simple vegetation accent from land mask,
- canonical erosion/river/slope masks available,
- PBR channels available.

Status: **SIGNIFICANT MIGRATION GAP**.

TODO:

- [ ] replace old arbitrary vegetation/dry procedural patterns with canonical biome/climate masks,
- [ ] restore height/climate snow semantics,
- [ ] restore coast/shelf behavior through canonical masks,
- [ ] implement proper PBR water/environment response.

### 5.4 Ocean

Legacy useful behavior:

- deep/shallow water color variation,
- continental shelf,
- island mask,
- polar ice,
- coastal transition,
- strong water environment/specular response.

Modern:

- generic water color path,
- ocean land palette,
- no shelf/island-specific material path yet.

Status: **MAJOR MIGRATION GAP**.

TODO:

- [ ] canonical shelf/coast/island masks,
- [ ] richer water depth response,
- [ ] polar ice linked to climate/ice caps,
- [ ] physical reflection/specular material.

### 5.5 Desert

Legacy useful behavior:

- warm sand elevation gradient,
- darker basin/low material,
- class-specific lower relief visual identity,
- restrained detail.

Modern:

- matching base palette,
- soft sand micro-normal profile,
- low cavity strength.

Status: **MOSTLY MIGRATED, VISUAL TUNING REMAINS**.

TODO:

- [ ] broad dune/wind pattern layer using physical scale,
- [ ] climate/aridity influence,
- [ ] composition influence.

### 5.6 Ice

Legacy useful behavior:

- plate/shade layering,
- height + mountain + polar whitening,
- blue crack material,
- restrained reflection/environment response.

Modern:

- ice base palette,
- brightening,
- procedural cracks,
- smoother roughness/micro-normal profile.

Status: **PARTIAL / GOOD FOUNDATION**.

TODO:

- [ ] connect polar latitude + `hasIceCaps`,
- [ ] connect climate temperature/snow,
- [ ] real environment reflection/refraction review.

### 5.7 Lava

Legacy useful behavior:

- dark basalt,
- emissive cracks/hotspots,
- suppressed environment reflection.

Modern:

- physical-scale basalt detail,
- thin emissive cracks,
- sparse hotspots,
- material-dependent roughness,
- emissive channel,
- micro-normal,
- AO/cavity.

Status: **MIGRATED / MODERN BASELINE PREFERRED**.

Rule: do not regress to old coarse mountain-mask lava cracks.

### 5.8 Toxic

Legacy useful behavior:

- green/gray lowlands,
- rusty highlands,
- pale chemical staining,
- distinct highland chemistry.

Modern:

- toxic class palette,
- soft irregular micro detail,
- no distinct chemical-region pattern.

Status: **PARTIAL**.

TODO:

- [ ] migrate chemical stain/highland semantics using climate/composition/terrain masks,
- [ ] integrate volatile/toxic influence rather than class-only behavior.

### 5.9 Carbon

Legacy useful behavior:

- very dark base,
- warmer highlands,
- ridge veins,
- carbon/dust variation.

Modern:

- dark palette,
- strong fine micro-normal/cavity,
- no explicit ridge-vein broad material mask.

Status: **PARTIAL**.

TODO:

- [ ] migrate broad ridge/mineral vein pattern at physical scale,
- [ ] retain modern micro-detail rather than old coast-derived artifact masks.

### 5.10 Metal-rich

Legacy useful behavior:

- dark metallic base,
- lighter mineral highlands,
- strong fake environment reflection.

Modern:

- metal-rich palette,
- true `metalness` channel,
- smoother micro-normal profile.

Status: **PARTIAL, MODERN PBR ARCHITECTURE BETTER**.

TODO:

- [ ] drive metalness/mineral pattern from `composition.metal` / derived influence,
- [ ] add real environment response,
- [ ] avoid copying fake hard-coded environment tint implementation.

---

## 6. Water/coast migration detail

This is the largest shared material gap.

Legacy contains reusable semantic concepts through `OCEAN_COASTLINE_PROFILE`:

```text
waterHintStart / waterHintEnd
shelfStart / shelfEnd
shelfFadeStart / shelfFadeEnd
islandStart / islandEnd
islandHeightInfluence
shelfTintStrength
waveStrength
```

Current modern Surface material mostly receives:

```text
isWater
landMask
riverMask
```

Target architecture:

```text
PlanetTerrainSampler / derived surface masks
    ├─ waterMask
    ├─ waterDepth/coastDistance
    ├─ shelfMask
    ├─ coastMask
    ├─ island/land mask where relevant
    └─ river/wetness
             ↓
SurfaceTerrainMaterial
```

**Do not recreate coastline truth independently inside the material.**

---

## 7. Lighting and atmosphere migration

### Legacy integrated lighting

The old materials manually implement:

- sun direction,
- day/night blend,
- terminator softness,
- night tint,
- mountain grazing lift,
- custom water specular,
- rim/horizon haze,
- fake environment response,
- class visibility floors.

### Modern decision

`SurfaceTerrainMaterial` uses `MeshStandardNodeMaterial` and should stay compatible with the normal Three/WebGPU lighting pipeline.

Therefore:

- atmosphere/horizon haze → **screen-space atmosphere**, not Surface material,
- direct day/night lighting → **renderer lights**, not bespoke class shader,
- water/metal environment response → **PBR/environment integration**,
- class readability compensation → only reintroduce if required after physically coherent lighting is in place.

This prevents the new PBR material from becoming another monolithic planet shader.

---

## 8. Surface raymarch self-shadow review

Legacy WebGPU implements a material-side terrain raymarch shadow based on another procedural height function.

Decision: **DO NOT PORT AS-IS.**

Reasons:

1. it creates a second terrain definition inside the material,
2. it can diverge from `PlanetTerrainSampler`,
3. current GTAO + material AO already cover broad/local occlusion roles,
4. future terrain self-shadowing should consume canonical terrain data or shadow maps.

Potential future alternatives:

- actual directional-light shadow mapping,
- canonical terrain height cache/LUT sampled by a dedicated shadow technique,
- horizon/self-shadow approximation derived from canonical relief.

Legacy code remains reference until this decision is final, but it is not a blocker for retiring the old material architecture.

---

## 9. Old baked terrain atlas review

Legacy WebGPU can blend a baked terrain atlas containing height/masks.

Useful concept: **cache expensive terrain evaluation**.

Non-useful architecture: allowing the material atlas to become independent physical terrain truth.

Decision:

- retain the idea of GPU-readable canonical terrain caches/LUTs where useful,
- do not migrate `bakedTerrainBlend` as a visual correctness knob into modern SurfaceView,
- Orbit already demonstrates the preferred pattern: pre-baked data derived from canonical terrain generation.

Status: **CONCEPT MIGRATED, OLD IMPLEMENTATION NOT REQUIRED FOR SurfaceView**.

---

## 10. Migration priority derived from this matrix

Before retiring old surface materials, complete in this order:

1. **Terrain definition integration first**
   - ocean level,
   - terrain roughness,
   - tectonics,
   - volcanism,
   - ice caps.

2. **Climate/Biome integration**
   - temperature,
   - humidity,
   - aridity,
   - biome seed,
   - vegetation/snow masks.

3. **Water/coast material semantics**
   - coast,
   - shelf,
   - water depth,
   - islands,
   - wetness/river relationship.

4. **Per-class broad material tuning**
   - Desert,
   - Rocky/Barren,
   - Ice,
   - Terrestrial/Ocean,
   - Toxic,
   - Carbon,
   - Metal-rich.

5. **Composition-driven material response**
   - metal,
   - ice,
   - water,
   - organic,
   - volatiles.

6. **Real PBR environment response**
   - water,
   - metal-rich,
   - ice.

7. **Review legacy readability hacks**
   - only migrate those still demonstrably useful.

Lava does not block this sequence; its modern baseline is already preferred.

---

## 11. Retirement gates for old materials

### `PlanetSurfaceNodeMaterial.ts`

May be retired from the modern WebGPU path when:

- [ ] modern `Planet.ts`/ViewRuntime no longer constructs it unnecessarily,
- [ ] water/coast semantics are migrated,
- [ ] non-Lava class material migration is sufficiently complete,
- [ ] composition/profile influences have a modern destination,
- [ ] environment response has a modern PBR plan,
- [ ] old raymarch behavior is explicitly retired/replaced,
- [ ] repo/public export usage is checked.

### `PlanetSurfaceMaterial.ts`

WebGL follows later.

Do **not** delete merely because WebGPU migration finishes. It remains WebGL reference/fallback until the explicit WebGL-follow-up phase.

### `PlanetOrbitSurfaceNodeMaterial.ts`

May be retired after:

- [ ] repo/public export audit,
- [ ] confirmation that `InstancedOrbitTerrain` owns all modern WebGPU OrbitView needs,
- [ ] any desired cheap far-view material behavior is transferred to the new Orbit material path.

---

## 12. Phase 2 completion result

Phase 2 mapping conclusion:

- modern Surface material architecture is structurally better and should remain the target,
- Lava / Roughness / Metalness / Emissive / Micro-Normal / Cavity-AO are already successfully migrated,
- the largest useful legacy gaps are **water/coast semantics, climate/biome-driven material variation, non-Lava class-specific broad patterning, composition influence and real environment response**,
- old integrated terrain generation, fake atmosphere, custom day/night shader and duplicate terrain raymarch must not be blindly copied,
- the old materials must remain available as reference until the migration gates above are closed.

**Phase 2 status: MAPPING COMPLETE. Implementation migration remains scheduled in later stabilization phases.**
