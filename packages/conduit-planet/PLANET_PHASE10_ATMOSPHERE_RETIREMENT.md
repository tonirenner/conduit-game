# Conduit Planet – Phase 10 Obsolete Atmosphere Prototype Retirement

Status: retirement approved

## Legacy prototype

`OpenWorldsAtmosphereLayer.ts` implemented a WebGPU BackSide sphere shell with additive TSL/WGSL atmosphere raymarching.

That architecture is no longer the accepted atmosphere path.

## Active architecture

Current WebGPU atmosphere ownership is:

```text
WebGPUAtmosphereLayer
    ↓ metadata source only
object.userData.conduitAtmosphere
    ↓
PlanetAtmospherePostProcess
    ↓ depth-aware screen-space composition
```

`WebGPUAtmosphereLayer` intentionally renders no atmosphere shell.

## Useful behavior review

The old `OpenWorldsAtmosphereLayer` contained physically useful ideas:

- Rayleigh scattering,
- Mie scattering / anisotropic phase response,
- altitude-dependent density,
- ozone-like absorption,
- optical depth accumulation,
- planet self-shadowing,
- sun-ray attenuation,
- generated atmosphere tint/profile inputs.

These concepts are already represented in the active `PlanetAtmospherePostProcess` implementation.

The active postprocess additionally owns the architecture-specific behavior required by the current game:

- screen-space camera-ray reconstruction,
- scene-depth-limited atmosphere integration,
- terrain/aerial-perspective compositing,
- sky/limb rendering when scene depth is background,
- multi-planet atmosphere slots,
- no BackSide shell overdraw.

Therefore deleting the old shell class does not discard a unique atmosphere responsibility.

## Protected baseline

The accepted WebGPU reconstruction remains untouched, including the required WebGPU screen-Y conversion:

```wgsl
let ndc = vec2<f32>(
    uv.x * 2.0 - 1.0,
    1.0 - uv.y * 2.0
);
```

Phase 10 must not rewrite or retune the active postprocess as collateral cleanup.

## API / runtime finding

- `Planet` constructs `WebGPUAtmosphereLayer`, not `OpenWorldsAtmosphereLayer`.
- `WebGPUAtmosphereLayer` is a metadata carrier for the global postprocess.
- `OpenWorldsAtmosphereLayer` is not exported by the rendering package barrel.
- The old shell is therefore prototype/reference code, not an active package/runtime contract.

## Retirement decision

Delete:

```text
src/OpenWorldsAtmosphereLayer.ts
```

Retain:

```text
src/AtmosphereLayer.ts              # WebGL/fallback ownership
src/WebGPUAtmosphereLayer.ts        # WebGPU postprocess metadata source
conduit-web3d PlanetAtmospherePostProcess.ts
rendering/AtmosphereVisualProfile.ts
```

## Phase 10 result

Once the old shell file is removed, Phase 10 is complete without changing the accepted atmosphere output path.
