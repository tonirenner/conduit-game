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

`SurfaceMaterialSemantics` now owns the derived broad solid-surface composition influences:

- water
- ice
- lava/volcanism
- toxic/volatiles
- metal
- rock
- organic/carbon

`SurfaceRenderProfile` and the active Surface material evaluator consume the same semantics.

### Regional material continuity

`CurvedRegionalTileTerrain` now uses the same broad `evaluateSurfaceTerrainMaterial()` path as SurfaceView. Regional and Surface therefore share the broad material identity while retaining different detail budgets.

### Canonical surface palette mapping

`SurfacePalette.ts` now owns the `PlanetClass -> SurfacePaletteKind` mapping.

Both `PlanetRenderProfile` and `SurfaceRenderProfile` use that single mapping. The duplicate palette switch previously inside `SurfaceRenderProfile` has been removed.

### Surface profile derivation chain

`SurfaceRenderProfile` now forwards these already-derived values from `PlanetRenderProfile` rather than reading them independently from `PlanetDefinition` again:

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

## Confirmed remaining profile inconsistencies

### `enableRings` is derived but bypassed during construction

`PlanetRenderProfile.enableRings` exists and diagnostics report it, but `Planet.createRingSystem()` still checks:

```text
definition.rings.enabled
```

directly.

Target:

```text
renderProfile.enableRings
```

with a definition fallback only when `Planet` is constructed without a render profile.

This is a cleanup task, not a visual retune.

### `cloudPalette` has no proven runtime consumer in `Planet`

`PlanetRenderProfile.cloudPalette` is generated, but `Planet.applyRenderProfile()` currently forwards cloud coverage, atmosphere density and climate cloud controls without forwarding `cloudPalette`.

Do not delete the field yet. First decide whether semantic cloud palette remains wanted by the cloud layers. If wanted, wire it deliberately. If not, document retirement before removal.

### `ringSeed` uses an unnecessary `as any`

`PlanetRenderSeeds` officially declares:

```text
ringSeed: number
```

`Planet.createRingSystem()` still reads it through `(definition.render as any)?.ringSeed`.

This is safe cleanup when `Planet.ts` is next modified.

### `moonSeed` is not part of `PlanetRenderSeeds`

`Planet.createMoonSystem()` probes `(definition.render as any)?.moonSeed`, but the model does not declare `moonSeed`.

This is a real contract mismatch, not merely a typing cleanup.

Before changing it, decide whether moon generation should use:

- the individual `PlanetMoonDefinition.seed` values,
- a new explicit system-level `moonSeed`, or
- a deterministic derivation from `PlanetDefinition.seed`.

Do not silently add/remove the seed behavior during profile cleanup.

## Planet.ts safety rule

`Planet.ts` is a large transitional runtime file. Do not combine these profile fixes with structural splitting or visual changes.

When it is touched:

1. fetch the complete current blob,
2. make one narrow responsibility change,
3. validate the edited region afterwards,
4. keep the Regional -> Surface visual validation baseline unchanged.

## Handoff separation

The Regional -> Surface handoff repair is implemented but still awaits visual acceptance.

Do not tune handoff thresholds, material roughness, normals or micro-detail as part of this profile consolidation until the current handoff build has been visually reviewed.

## Next profile work

Recommended order:

1. safely route ring construction through `renderProfile.enableRings` and remove the unnecessary `ringSeed as any`,
2. audit whether `cloudPalette` has a desired semantic consumer,
3. resolve the `moonSeed` contract explicitly,
4. audit remaining `PlanetRenderProfile` fields for direct-definition bypasses,
5. only then consider Phase 6 complete.
