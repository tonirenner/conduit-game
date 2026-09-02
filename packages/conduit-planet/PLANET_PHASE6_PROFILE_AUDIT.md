# Conduit Planet – Phase 6 Profile Consolidation Audit

Status: complete

## Goal

Keep the profile chain unambiguous:

```text
PlanetDefinition
    ↓
PlanetRenderProfile
    ↓
SurfaceRenderProfile / specialized visual profiles
    ↓
Renderer
```

`PlanetDefinition` remains domain truth. Profiles are derived renderer configuration. Concrete renderers must not independently reinterpret the same domain values unless the value is explicitly representation-specific.

## Completed in Phase 6

### Canonical material semantics

`SurfaceMaterialSemantics` owns the derived broad solid-surface composition influences:

- water
- ice
- lava/volcanism
- toxic/volatiles
- metal
- rock
- organic/carbon

`SurfaceRenderProfile`, RegionalView and the active Surface material evaluator consume the same semantics.

### Regional material continuity

`CurvedRegionalTileTerrain` uses the same broad `evaluateSurfaceTerrainMaterial()` path as SurfaceView. Regional and Surface therefore share broad material identity while retaining different detail budgets.

The Orbit -> Regional depth-ownership handoff has also been visually accepted after synchronizing Orbit removal with Regional depth ownership. The Regional -> Surface checker artifact caused by the legacy depth occluder has been repaired as well.

### Canonical surface palette mapping

`SurfacePalette.ts` owns the `PlanetClass -> SurfacePaletteKind` mapping.

Both `PlanetRenderProfile` and `SurfaceRenderProfile` use that single mapping. The duplicate palette switch previously inside `SurfaceRenderProfile` has been removed.

### Surface profile derivation chain

`SurfaceRenderProfile` forwards these already-derived values from `PlanetRenderProfile` instead of reading them independently from `PlanetDefinition` again:

- enabled / terrain ownership
- ocean enabled
- surface palette
- terrain roughness
- mountain scale
- ocean level
- climate temperature
- climate humidity
- climate aridity
- climate wind strength
- climate storm activity
- climate cloud persistence
- climate ash load

Surface-only domain flags that do not currently exist on `PlanetRenderProfile` remain sourced directly from the definition:

- ice caps
- volcanism
- tectonics

Regression coverage exists in `tests/PlanetRenderProfileConsolidation.test.ts`.

### Layer runtime contracts

`PlanetLayerRuntimeProfile.ts` defines the runtime contracts for rings and the lightweight moon renderer.

Rings:

```text
enabled = PlanetRenderProfile.enableRings
          with PlanetDefinition fallback for legacy profile-less construction
seed    = PlanetDefinition.render.ringSeed
```

`Planet.createRingSystem()` now consumes that helper, so ring ownership no longer bypasses the derived render profile and the declared `ringSeed` no longer needs an `as any` probe.

Moon system:

```text
seed = (PlanetDefinition.seed ^ 0x4411aa) >>> 0
```

`Planet.createMoonSystem()` now consumes the explicit helper and no longer probes an undeclared `render.moonSeed` field. This preserves the previous deterministic visible behavior exactly.

Regression coverage exists in `tests/PlanetLayerRuntimeProfile.test.ts`.

## `cloudPalette` decision

`PlanetRenderProfile.cloudPalette` currently has no runtime consumer in either cloud renderer.

Both `CloudLayer` and `WebGPUCloudLayer` expose semantic profile inputs for:

- cloud coverage,
- atmosphere density,
- cloud persistence,
- storm activity,
- wind strength,
- ash load.

Their visible cloud colors are currently renderer/shader-owned; neither layer has a palette input contract.

Phase 6 therefore deliberately does **not** force `cloudPalette` into those renderers merely to make the field appear consumed. That would be visual redesign, not profile cleanup.

Current decision:

```text
cloudPalette = retained, explicitly unused, deferred
```

A later cloud-visual consolidation phase must explicitly choose between:

1. introducing a shared semantic cloud-palette contract for both cloud renderers, or
2. retiring `cloudPalette` after repository/API compatibility review.

This deferred field does not block Phase 6 completion.

## Final ownership audit

Known profile responsibilities are now unambiguous:

- `rendererKind` selects the renderer family.
- `enableTerrain` / `enableOcean` feed derived surface ownership.
- `enableClouds` controls cloud-layer creation.
- `enableAtmosphere` controls atmosphere-layer creation.
- `enableRings` controls ring-layer creation through the extracted runtime profile helper.
- `surfacePalette` is canonical through `SurfacePalette.ts`.
- `atmospherePalette` is consumed through atmosphere render-profile evaluation.
- terrain roughness, mountain scale and ocean level flow through the derived surface profile.
- cloud coverage / atmosphere density / climate cloud controls flow into the cloud profiles.
- composition-derived surface material semantics are centralized in `SurfaceMaterialSemantics`.

Direct `PlanetDefinition` reads that remain in `Planet.ts` are domain or representation inputs rather than duplicate competing profile interpretations, for example terrain seeds, atmosphere haze/color, composition gas influence, moon count and surface-only flags.

## Safety validation

The controlled `Planet.ts` rewrite was limited to:

```text
getPlanetRingLayerRuntimeProfile(...)
getPlanetMoonSystemSeed(...)
```

Imports and both edited runtime regions were fetched again after the write and structurally validated.

No handoff thresholds, terrain geometry, atmosphere reconstruction, camera logic, surface materials or visual tuning were intentionally changed.

## Phase 6 result

```text
PlanetDefinition
    ↓
PlanetRenderProfile
    ↓
SurfaceRenderProfile / SurfaceMaterialSemantics / layer runtime profiles
    ↓
renderer consumers
```

The duplicated profile/material interpretations targeted by Phase 6 are consolidated.

**Phase 6 is complete.**

Next stabilization phase: reduce `Planet.ts` entanglement without changing the accepted renderer/view behavior.
