# Conduit Planet – Phase 5 Composition Audit

> Status: complete
>
> Goal: map every canonical `PlanetDefinition.composition` value before changing rendering or cleanup code.
>
> Rule: composition remains domain truth. Rendering may consume derived influences, but must not create a second composition model.

---

## Canonical composition keys

```ts
rock
metal
ice
water
gas
organic
volatiles
```

`normalizeComposition()` keeps these values normalized as one composition vector.

---

## Current usage matrix

| Key | Generation / classification | Physical / climate | Resources | Terrain / surface | Active rendering responsibility |
| --- | --- | --- | --- | --- | --- |
| `rock` | Strong class-resolution input; generated for all classes | Contributes directly to physical density/mass/gravity | Contributes to metal resource score | No geometry control | Continuous solid-surface mineral/rock exposure and roughness bias |
| `metal` | Strong `metal_rich` classification input | Strong physical density contribution | Direct metal + rare-material resource input | No geometry control | Continuous exposed-surface metal color, roughness and metalness |
| `ice` | Strong ice/ice-giant classification input | Density input; climate generation input | Water/fuel/volatile resource input | Modulates shared canonical `iceCapMask` extent when caps exist | Canonical cap mask drives polar ice albedo/roughness and suppresses metal underneath |
| `water` | Ocean/terrestrial/classification input | Density + climate humidity input | Direct water resource input | Water classification stays owned by `hasOcean` + `oceanLevel` + land mask | Continuous water abundance only changes already-classified water appearance |
| `gas` | Gas/ice-giant classification input | Low-density physical contribution; atmosphere-adjacent generation | Strong fuel/volatile resource input | No solid-surface role | Continuous giant cloud-shell density, particle opacity, band contrast and atmosphere opacity |
| `organic` | Carbon-world classification input | Small physical-density contribution | Rare-material/fuel/research input | No geometry role | Continuous carbon-surface deposit tint and compactness only on carbon worlds |
| `volatiles` | Toxic/ice-giant/atmosphere-potential classification input | Density + climate/storm generation input | Rare/fuel/volatile resource input | No geometry role | Continuous toxic/mineral deposit influence on valid solid surfaces |

---

## Architectural findings

### 1. Composition remains domain truth

Composition is not cleanup-only data. It drives:

```text
composition
├─ PlanetClass resolution
├─ physical density / mass / gravity
├─ climate generation
├─ atmosphere-adjacent classification
├─ resource generation
└─ visual material variation
```

Phase 5 therefore keeps composition in `PlanetDefinition` and only derives bounded rendering influences from it.

### 2. Terrain geometry remains composition-independent

The migration deliberately does not make composition a second terrain generator.

Explicit domain owners remain:

- `surface.hasOcean` + `surface.oceanLevel` for water classification,
- `surface.hasIceCaps` for whether polar caps exist,
- `surface.hasVolcanism` + canonical `volcanicMask` for volcanic domains,
- tectonics/roughness/mountain scale for terrain behavior.

### 3. Existing SurfaceRenderProfile influence semantics are active

The pre-existing derived influence block is now represented in active SurfaceView shading:

```text
metalInfluence ✅
iceInfluence ✅
waterInfluence ✅
toxicInfluence ✅
lavaInfluence ✅
```

The later RenderProfile cleanup may centralize derivation so `SurfaceTerrainMaterial` does not independently repeat the formulas, but that architectural refactor was intentionally kept out of Phase 5.

### 4. Remaining composition keys have explicit visual semantics

`rock`, `organic`, and `gas` are no longer ambiguous:

- `rock` is a solid-surface base-mineral influence,
- `organic` is restricted to carbon-world surface material until a canonical biome/material contract exists,
- `gas` belongs exclusively to gas/ice-giant rendering and never to solid terrain.

---

## Completed migrations

### `metalInfluence`

```text
metal_rich → 1.0
otherwise  → clamp(composition.metal)
```

Affects exposed solid-surface albedo, roughness and metalness. Water remains non-metallic.

### `iceInfluence`

The polar formula is shared through canonical `getPlanetIceCapMask()`.

```text
ice class → 1.0
otherwise → clamp(composition.ice + (hasIceCaps ? 0.25 : 0))
```

The final response is gated by the canonical cap mask. Ice brightens/cools albedo, lowers roughness modestly and suppresses exposed metal beneath the cap.

Characterization: `tests/PlanetCompositionIceSurface.test.ts`.

### `waterInfluence`

Canonical classification remains:

```text
surface.hasOcean
+ surface.oceanLevel
+ terrain landMask
→ isWater
```

Only after `isWater` is true does composition affect color and roughness. Land is unchanged and water metalness remains zero.

Characterization: `tests/PlanetWaterComposition.test.ts`.

### `toxicInfluence`

```text
toxic class → 1.0
otherwise   → clamp(composition.volatiles)
```

Restricted to solid-surface shading, weighted toward erosion/deposition structure. It cannot create toxic atmosphere or alter terrain/climate truth.

Characterization: `tests/PlanetCompositionToxicSurface.test.ts`.

### `lavaInfluence`

```text
lava class OR surface.hasVolcanism
→ lavaInfluence = 1

non-lava world
→ local response = lavaInfluence * canonical volcanicMask
```

`SurfaceClipmapTerrain` forwards the sampler-owned volcanic mask. No second volcanic pattern is generated in the material.

Characterization: `tests/PlanetLavaInfluenceSurface.test.ts`.

### `rock`

```text
composition.rock
× local mountain/slope/erosion exposure
→ mineral base-material response
```

Higher rock abundance produces a restrained neutral-mineral tint and a small roughness increase on exposed solid terrain. It remains a material layer below lava/toxic/ice/metal overrides and does not alter terrain geometry.

Characterization: `tests/PlanetCompositionRockSurface.test.ts`.

### `organic`

Organic abundance is intentionally not treated as generic vegetation.

```text
class === carbon
→ composition.organic affects carbon deposits

other classes
→ no direct Surface material effect yet
```

This avoids inventing a second biome/ecology model inside the material system. A future biome-material contract may expand organic semantics deliberately.

Characterization: `tests/PlanetCompositionOrganicSurface.test.ts`.

### `gas`

Gas abundance is routed only through the giant renderer:

```text
PlanetDefinition.composition.gas
→ Planet
→ GasGiantLayer.gasInfluence
→ getGasGiantVisualProfile(kind, gasInfluence)
```

Increasing gas abundance modestly increases cloud-shell opacity, cloud-particle opacity, band contrast and giant atmosphere opacity while preserving:

- `gas_giant` / `ice_giant` class,
- geometry,
- shell count,
- particle count,
- renderer kind.

Characterization: `tests/PlanetCompositionGasGiant.test.ts`.

---

## Safety invariants

Phase 5 does not change:

- terrain height,
- geometry normals,
- collision/landing,
- land/water classification,
- canonical climate samples,
- biome classification,
- weather topology,
- planet class generation,
- resource generation.

Allowed visual outputs changed only where explicitly mapped:

- albedo,
- roughness,
- metalness,
- giant cloud/atmosphere density presentation,
- existing material micro response.

---

## Phase 5 status

- [x] Composition audit
- [x] `metalInfluence` active surface shading
- [x] `iceInfluence` active surface shading
- [x] `waterInfluence` active surface shading
- [x] `toxicInfluence` active surface shading
- [x] `lavaInfluence` active surface shading
- [x] decide and wire `rock` visual semantics
- [x] decide and wire `organic` visual semantics
- [x] decide and wire `gas` visual semantics
- [x] gas/ice-giant composition alignment
- [x] Phase 5 regression characterization coverage

---

## Completion

Phase 5 composition migration is complete.

The next stabilization work should move to architecture cleanup rather than adding more composition semantics. The strongest next target is RenderProfile consolidation so derived material influences have one canonical derivation path instead of being mirrored between profile and active Surface material code.
