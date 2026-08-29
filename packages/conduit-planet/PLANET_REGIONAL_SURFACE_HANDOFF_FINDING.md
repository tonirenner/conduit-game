# Conduit Planet – Regional → Surface handoff finding

Status: broad material continuity aligned; ownership transition still open

## Symptom

The RegionalView → SurfaceView transition is visibly discontinuous in motion.

Observed behaviour from the captured approach video:

- Regional terrain kept a relatively smooth, bright, low-detail appearance.
- Surface terrain faded in with a materially different response and noticeably stronger local detail.
- During the overlap the two representations did not visually read as the same surface at two LODs.
- Near the end of the handoff the image changed abruptly instead of completing as a seamless blend.

This is primarily a renderer handoff issue, not a canonical terrain-height mismatch.

## Progress – broad material identity aligned

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

### Deliberately still different

Regional still uses a lightweight `THREE.MeshStandardMaterial` and does not yet copy SurfaceView's expensive near-field detail path.

Differences that remain intentionally representation-specific:

- fragment-scale micro normals,
- local cavity AO,
- fine procedural roughness variation,
- emissive lava crack detail,
- Surface-specific tangent-space near detail.

These should appear progressively with proximity rather than redefine the broad material identity.

## Remaining primary cause – Regional is released with a hard visibility switch

`PlanetViewRuntime` intentionally keeps Regional fully opaque during the Regional → Surface overlap:

```ts
const regionalOpacity = weights.surface > 0.001
    ? 1
    : weights.regional;
```

Then Regional is hidden when Surface reaches the depth-ownership threshold:

```ts
if (weights.surface >= 0.985) {
    regional.group.visible = false;
}
```

This avoids exposing the finite Surface clipmap horizon while Surface is still only a local patch, but it means the final transition is not a true crossfade.

At `surfaceWeight ~= 0.985`, the complete Regional representation disappears in one frame.

Even after broad albedo alignment, differences in roughness, normals, micro detail, depth ownership, or local geometry density can therefore remain visible as a final pop.

## Secondary contributor – different detail scales

Regional terrain is geometry-first and intentionally restrained in material detail. SurfaceView adds high-frequency fragment detail and local tangent-space shading.

The appearance of:

- micro-normal detail,
- cavity response,
- fragment-scale roughness variation,
- emissive lava detail

must be treated as an LOD/detail transition, not as a second material identity.

## What is NOT the root cause

Both Regional and Surface geometry use the canonical `PlanetTerrainSampler`.

The broad material layer now also shares `evaluateSurfaceTerrainMaterial()` and `SurfaceMaterialSemantics`.

Therefore the remaining diagnosis is focused on representation-specific shading/detail and renderer ownership rather than separate terrain or composition models.

## Relevant files

```text
packages/conduit-planet/src/view/PlanetViewRuntime.ts
packages/conduit-planet/src/view/PlanetViewTransition.ts
packages/conduit-planet/src/rendering/SurfaceMaterialSemantics.ts
packages/conduit-planet/src/rendering/regional/CurvedRegionalTileTerrain.ts
packages/conduit-planet/src/rendering/surface/SurfaceClipmapTerrain.ts
packages/conduit-planet/src/rendering/surface/SurfaceTerrainMaterial.ts
```

## Current handoff band

```text
regionalSurfaceStartMeters = 90_000
regionalSurfaceEndMeters   = 20_000
surfacePreloadMeters        = 140_000
surfaceReleaseMeters        = 220_000
surface depth ownership     = 0.985
```

Surface fades in across roughly 90 km → 20 km altitude, while Regional remains fully opaque beneath it until the Surface weight reaches 0.985.

## Next repair step

Do not widen the transition band as the first response.

The next step is to inspect the remaining broad shading mismatch between the lightweight Regional material and Surface base material, especially normals / roughness / depth behaviour. After that, replace the hard global Regional visibility release with a progressive or spatial/depth-aware ownership handoff.

Target architecture:

```text
Canonical Surface Material Evaluation
├─ Orbit: low-frequency / cheap representation
├─ Regional: shared broad material + medium detail
└─ Surface: shared broad material + near-field micro detail
```

The three views should differ in detail frequency and geometry budget, not in the underlying material identity.

## Safety constraints

Do not change as part of this handoff repair unless proven necessary:

- canonical terrain heights,
- landing/collision,
- atmosphere reconstruction,
- camera/reference-frame logic,
- regional seam stitching,
- Surface clipmap topology.
