# Conduit Planet – Phase 6 Profile Consolidation Audit

Status: in progress

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

### Layer runtime contracts extracted

`PlanetLayerRuntimeProfile.ts` now defines the intended runtime contracts for rings and the lightweight moon renderer.

Rings:

```text
enabled = PlanetRenderProfile.enableRings
          with PlanetDefinition fallback for legacy profile-less construction
seed    = PlanetDefinition.render.ringSeed
```

The declared `ringSeed` is therefore the canonical ring renderer seed; no `as any` access is required.

Moon system:

```text
seed = (PlanetDefinition.seed ^ 0x4411aa) >>> 0
```

This deliberately preserves the existing visible deterministic behavior. No new `render.moonSeed` field is introduced. The current `MoonSystemLayer` is a lightweight procedural representation based on moon count rather than a renderer of the individual `PlanetMoonDefinition` entries, so its system-level seed remains an explicit derivation from the planet seed until that renderer is replaced/migrated.

Regression coverage exists in `tests/PlanetLayerRuntimeProfile.test.ts`.

## Confirmed remaining profile work

### Route `Planet.ts` through the extracted layer contracts

`Planet.createRingSystem()` still directly checks `definition.rings.enabled` and reads `ringSeed` through an old `as any` expression.

`Planet.createMoonSystem()` still probes the undeclared `render.moonSeed` before falling back to the planet-seed derivation.

The semantic decisions are now resolved; the remaining work is a narrow runtime migration to:

```text
getPlanetRingLayerRuntimeProfile(...)
getPlanetMoonSystemSeed(...)
```

This should be done in one controlled `Planet.ts` rewrite and must not be combined with visual tuning or structural splitting.

### `cloudPalette` is intentionally not wired during Phase 6

`PlanetRenderProfile.cloudPalette` currently has no runtime consumer in either cloud renderer.

Both `CloudLayer` and `WebGPUCloudLayer` expose the same semantic profile inputs:

- cloud coverage,
- atmosphere density,
- cloud persistence,
- storm activity,
- wind strength,
- ash load.

Their visual cloud colors are currently renderer/shader-owned; neither layer has a palette input contract.

Therefore Phase 6 must **not** force `cloudPalette` into the layers merely to make the field appear consumed, because doing so would be a visual redesign rather than profile cleanup.

Current decision:

```text
cloudPalette = retained but explicitly unused
```

A later cloud-visual consolidation phase must choose one of two explicit outcomes:

1. introduce a shared semantic cloud-palette contract for both WebGL and WebGPU cloud renderers, or
2. retire `cloudPalette` from `PlanetRenderProfile` after repository/API compatibility has been checked.

### Remaining PlanetRenderProfile ownership audit

Known actively consumed fields:

- `rendererKind`
- `enableTerrain`
- `enableOcean`
- `enableClouds`
- `enableAtmosphere`
- `surfacePalette`
- `terrainRoughness`
- `mountainScale`
- `oceanLevel`
- `cloudCoverage`
- `atmosphereDensity`
- climate temperature/humidity/aridity/wind/storm/cloud-persistence/ash-load through derived consumers
- `atmospherePalette`

`enableRings` is semantically resolved but awaits the `Planet.ts` runtime migration described above.

`cloudPalette` is the one intentionally retained unconsumed field identified in this audit.

## Planet.ts safety rule

`Planet.ts` is a large transitional runtime file. Do not combine profile fixes with structural splitting or visual changes.

When it is touched:

1. fetch the complete current blob,
2. make the narrow layer-runtime migration only,
3. validate the edited ring/moon regions afterwards,
4. preserve the visually accepted view-handoff behavior.

## Next profile work

Recommended order:

1. migrate `Planet.ts` ring/moon construction to `PlanetLayerRuntimeProfile`,
2. characterize that migration with runtime/config tests where practical,
3. re-audit `PlanetRenderProfile` after the migration,
4. mark `cloudPalette` as deferred rather than blocking Phase 6,
5. close Phase 6 if no further duplicate render ownership remains.
