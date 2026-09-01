# Conduit Planet – Regional → Surface handoff finding

Status: material continuity + progressive ownership + legacy depth-occluder fix implemented; visual validation pending

## Original symptom

The RegionalView → SurfaceView transition was visibly discontinuous in motion.

Observed behaviour from the captured approach video:

- Regional terrain kept a relatively smooth, bright, low-detail appearance.
- Surface terrain faded in with a materially different response and noticeably stronger local detail.
- During the overlap the two representations did not visually read as the same surface at two LODs.
- Near the end of the handoff the image changed abruptly instead of completing as a seamless blend.

The issue was primarily renderer/material ownership rather than a canonical terrain-height mismatch.

## Implemented repair 1 – shared broad material identity

`CurvedRegionalTileTerrain` no longer owns a separate class-only palette.

Regional now evaluates every sampled vertex through the same CPU broad material function used by SurfaceView:

```text
PlanetTerrainSampler sample
        ↓
evaluateSurfaceTerrainMaterial()
        ↓
broad surface color
```

This gives Regional the same broad material semantics for:

- water composition response,
- rock composition,
- carbon/organic response,
- canonical volcanic-mask response,
- toxic/volatile response,
- canonical ice-cap shading,
- metal-rich / composition-metal response.

The material influences themselves are derived through the shared `SurfaceMaterialSemantics` layer, so Regional and Surface no longer independently reinterpret composition/class/surface flags.

## Implemented repair 2 – progressive depth/visibility ownership

The old one-frame Regional hide at `surfaceWeight ~= 0.985` has been removed.

Ownership policy now lives in the pure `getRegionalSurfaceRelease()` transition function.

Policy:

```text
before Surface depth ownership
    Regional owns depth normally

Surface owns depth
    Regional stops depth-writing
    Surface wins locally without z-fighting
    Regional remains available as backdrop

Surface footprint safely covers visible horizon
    Regional opacity releases smoothly to zero
```

The release is coverage-aware. The current Surface clipmap has 11 rings and an outer half extent of about 2048 km, rather than the older 7-ring assumption that motivated the hard global cut.

A safety margin is applied to the physical horizon-distance check before Regional may fade away.

Characterization: `tests/PlanetRegionalSurfaceRelease.test.ts`.

## Implemented repair 3 – disable the legacy depth occluder in the modern view runtime

Visual validation after the progressive ownership change exposed a regular diamond/checker pattern exactly when Surface crossed its depth-ownership threshold.

The important finding was that `PlanetViewRuntime` disabled the legacy `PlanetTerrain` and `PlanetBody` for the modern WebGPU path, but left the invisible `PlanetDepthOccluder` active.

That created this transition:

```text
Surface weight <= 0.985
    Surface depth test/write disabled
    legacy depth occluder has no visible interaction with Surface

Surface weight > 0.985
    Surface depth test/write enabled
    Surface suddenly tests against the old spherical depth occluder
    near/coplanar depth competition can become visible per triangle
```

The modern view stack already has real depth ownership at every scale:

```text
OrbitView    -> InstancedOrbitTerrain writes depth
RegionalView -> CurvedRegionalTileTerrain writes depth while it owns the view
SurfaceView  -> SurfaceClipmapTerrain writes depth after ownership transfer
```

Therefore the old `PlanetDepthOccluder` is not required in the modern instanced Orbit/Regional/Surface path.

`PlanetViewRuntime.disableClassicOrbitVisuals()` now disables all three legacy solid-surface objects there:

```text
PlanetTerrain
PlanetBody
PlanetDepthOccluder
```

Standalone/legacy `Planet` and WebGL behavior are unchanged by this fix.

The Surface clipmap stitching/topology was deliberately not changed because the artifact timing pointed to the depth ownership transition rather than a proven ring-topology defect.

## Deliberately still different

Regional still uses a lightweight `THREE.MeshStandardMaterial` and does not copy SurfaceView's expensive near-field detail path.

Differences that remain intentionally representation-specific:

- fragment-scale micro normals,
- local cavity AO,
- fine procedural roughness variation,
- emissive lava crack detail,
- Surface-specific tangent-space near detail.

These should read as increasing detail with proximity, not as a different planetary material.

## Shared truth

Both Regional and Surface geometry use the canonical `PlanetTerrainSampler`.

Both now share broad material evaluation through:

```text
PlanetDefinition
    ↓
SurfaceMaterialSemantics
    ↓
evaluateSurfaceTerrainMaterial()
    ├─ Regional
    └─ Surface
```

The remaining differences are representation-specific detail budget and shading technique.

## Relevant files

```text
packages/conduit-planet/src/view/PlanetViewRuntime.ts
packages/conduit-planet/src/view/PlanetViewTransition.ts
packages/conduit-planet/src/rendering/SurfaceMaterialSemantics.ts
packages/conduit-planet/src/rendering/regional/CurvedRegionalTileTerrain.ts
packages/conduit-planet/src/rendering/surface/SurfaceClipmapTerrain.ts
packages/conduit-planet/src/rendering/surface/SurfaceTerrainMaterial.ts
packages/conduit-planet/tests/PlanetRegionalSurfaceRelease.test.ts
```

## Current handoff band

```text
regionalSurfaceStartMeters = 90_000
regionalSurfaceEndMeters   = 20_000
surfacePreloadMeters        = 140_000
surfaceReleaseMeters        = 220_000
surface depth ownership     = 0.985
```

The depth threshold remains unchanged for this repair.

## Next step

Visual validation with the same approach path that exposed the checker artifact.

Check specifically for:

- diamond/checker pattern at Surface depth takeover,
- remaining broad color pop,
- final ownership pop,
- dark horizon band,
- roughness/normal mismatch that still reads as a material swap,
- reverse Surface → Regional transition.

Only if the checker remains after the legacy depth occluder is gone should the Surface ring overlap/stitch/depth ordering be modified.

## Safety constraints preserved

This repair does not intentionally change:

- canonical terrain heights,
- landing/collision,
- atmosphere reconstruction,
- camera/reference-frame logic,
- regional seam stitching,
- Surface clipmap topology.
