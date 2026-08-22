# Conduit Planet – Phase 5 Composition Audit

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

| Key | Generation / classification | Physical / climate | Resources | Terrain / surface | Rendering | Current gap |
| --- | --- | --- | --- | --- | --- | --- |
| `rock` | Strong class-resolution input; generated for all classes | Contributes directly to physical density/mass/gravity | Contributes to metal resource score | No canonical geometry control | Not consumed by current surface material except indirectly through `PlanetClass` | No continuous rocky/mineral material influence |
| `metal` | Strong `metal_rich` classification input | Strong physical density contribution | Direct metal + rare-material resource input | No canonical geometry control | Active Surface shading now derives the same `metalInfluence` semantics as `SurfaceRenderProfile` | Regional/orbit alignment remains later work |
| `ice` | Strong ice/ice-giant classification input | Density input; climate generation input | Water/fuel/volatile resource input | Canonically affects shared `iceCapMask` extent when `hasIceCaps` is true | Active Surface shading now consumes the shared canonical ice-cap mask plus composition-derived ice influence | Regional/orbit alignment remains later work |
| `water` | Ocean/terrestrial/classification input | Density + climate humidity input | Direct water resource input | Ocean presence/threshold still belongs to `surface.hasOcean` + `surface.oceanLevel` | Active Surface water shading now uses continuous water abundance only after canonical water classification | Regional/orbit alignment remains later work |
| `gas` | Gas/ice-giant classification input | Low-density physical contribution; atmosphere-adjacent generation | Strong fuel/volatile resource input | No solid-surface geometry role intended | Gas giant visuals are currently fixed class profiles | Gas abundance does not continuously alter gas-giant visual profile |
| `organic` | Carbon-world classification input | Small physical-density contribution | Rare-material/fuel/research input | No geometry role intended | No current surface material influence | Carbon/organic abundance is effectively collapsed to class selection for visuals |
| `volatiles` | Toxic/ice-giant/atmosphere-potential classification input | Density + climate/storm generation input | Rare/fuel/volatile resource input | No geometry role intended | Active Surface shading now derives the same `toxicInfluence` semantics as `SurfaceRenderProfile` | Regional/orbit alignment remains later work |

---

## Architectural findings

### 1. Domain usage is already meaningful

Composition is not dead data. It currently drives several important generated truths:

```text
composition
├─ PlanetClass resolution
├─ physical density / mass / gravity
├─ climate generation
├─ atmosphere-adjacent classification
└─ resource generation
```

Therefore Phase 5 is **not** a schema cleanup or deletion phase.

### 2. Terrain geometry should remain mostly composition-independent

The current architecture is correct here. Rock/metal/water/gas/organic/volatiles should not directly rewrite terrain noise simply because their abundance changes.

Existing exceptions are explicit domain semantics:

- `surface.hasOcean` + `surface.oceanLevel` own water classification,
- `surface.hasIceCaps` owns whether caps exist,
- `composition.ice` only modulates the canonical ice-cap extent,
- tectonics/volcanism/roughness remain surface-definition responsibilities.

Do not move these responsibilities back into raw composition.

### 3. Main integration gap: derived rendering influences stop before the active material

`createSurfaceRenderProfile()` already derives:

```text
waterInfluence
iceInfluence
lavaInfluence
toxicInfluence
metalInfluence
```

from `PlanetDefinition`.

The active WebGPU `SurfaceTerrainMaterial` still receives the full `PlanetDefinition`, but Phase 5 is now migrating those same influence semantics into the active material one value at a time. `metalInfluence`, `iceInfluence`, `waterInfluence` and `toxicInfluence` are complete for SurfaceView.

The long-term RenderProfile cleanup can later centralize the derivation without mixing that architectural refactor into the composition migration.

### 4. `rock`, `organic`, and `gas` need explicit visual decisions

There are no equivalent surface-profile influence fields for these values today.

That does **not** automatically mean they should all become shader uniforms.

Recommended semantics:

- `rock`: candidate for mineral/rock color + roughness bias on solid surfaces,
- `organic`: candidate for carbon/organic tint or ecological material variation where physically plausible,
- `gas`: should affect gas/ice-giant visual composition rather than solid-surface terrain,
- do not force any of them into geometry.

---

## Completed migrations

### `metalInfluence`

Surface shading now derives:

```text
metal_rich → 1.0
otherwise  → clamp(composition.metal)
```

It affects only exposed solid-surface albedo, roughness and metalness. Water remains non-metallic; geometry/climate/collision are unchanged.

### `iceInfluence`

The previous sampler-owned polar formula was extracted to shared canonical `getPlanetIceCapMask()` surface-domain logic.

Both `PlanetTerrainSampler` and active Surface shading consume that same mask. The material derives the existing profile semantics:

```text
ice class → 1.0
otherwise → clamp(composition.ice + (hasIceCaps ? 0.25 : 0))
```

The final local ice response is gated by the canonical cap mask. Polar ice brightens/cools albedo, lowers local roughness modestly and suppresses exposed metal beneath the ice. Equatorial terrain outside the cap is not painted with composition ice, and water remains unchanged.

Characterization: `tests/PlanetCompositionIceSurface.test.ts`.

### `waterInfluence`

Canonical water classification remains unchanged:

```text
surface.hasOcean
+ surface.oceanLevel
+ terrain landMask
→ isWater
```

Only after `isWater` is true does active Surface shading derive the existing profile semantics:

```text
toxic class → 0
otherwise   → clamp(composition.water * (hasOcean ? 1.0 : 0.35))
```

The value modulates only already-classified water albedo and roughness. Higher water abundance produces a slightly clearer/deeper blue-green response and a calmer/lower-roughness surface. Metalness remains zero. Land material is intentionally unchanged by this step.

Characterization: `tests/PlanetWaterComposition.test.ts`.

### `toxicInfluence`

Toxic class/atmosphere semantics remain authoritative. Surface shading derives the existing profile semantics only as a material influence:

```text
toxic class → 1.0
otherwise   → clamp(composition.volatiles)
```

The influence is restricted to solid-surface shading. Volatile-rich material receives a restrained mineral/toxic tint and a small roughness increase, weighted toward erosion/river deposition structure. It does not create a toxic atmosphere, alter climate, or change terrain. Ice is layered after the toxic tint so canonical ice cover visually overrides deposits, and water stays outside this path.

Characterization: `tests/PlanetCompositionToxicSurface.test.ts`.

---

## Recommended migration order

### Step 1 — close the existing SurfaceRenderProfile → SurfaceTerrainMaterial gap

Use the already-derived influences first:

```text
metalInfluence ✅
iceInfluence ✅
waterInfluence ✅
toxicInfluence ✅
lavaInfluence
```

One influence at a time, with characterization tests.

### Step 2 — lava influence alignment

Do not let composition abundance implicitly enable volcanism. `surface.hasVolcanism` / lava class remain the domain gate; `lavaInfluence` may only shade an already-valid volcanic material domain.

### Step 3 — decide explicit semantics for `rock`, `organic`, `gas`

Do this only after the existing profile contract is actually consumed.

---

## Safety invariants for Phase 5

Composition-render migration must not change:

- terrain height,
- terrain normals from geometry,
- collision/landing,
- land/water classification,
- canonical climate samples,
- biome classification,
- weather topology,
- planet class generation,
- resource generation.

Material outputs allowed to change:

- albedo,
- roughness,
- metalness,
- micro-normal/cavity strength when explicitly tied to material composition,
- emissive only for already-valid emissive material domains.

---

## Phase 5 status

- [x] Composition audit
- [x] `metalInfluence` active surface shading
- [x] `iceInfluence` active surface shading
- [x] `waterInfluence` active surface shading
- [x] `toxicInfluence` active surface shading
- [ ] `lavaInfluence` active surface shading
- [ ] decide `rock` visual semantics
- [ ] decide `organic` visual semantics
- [ ] decide `gas` visual semantics
- [ ] gas/ice-giant composition alignment
- [ ] Phase 5 regression pass

---

## Next step

Wire **only `lavaInfluence`** into active Surface shading.

Keep `surface.hasVolcanism` and lava-class semantics authoritative. Do not make composition or material shading enable volcanism or alter canonical volcanic geometry/masks.
