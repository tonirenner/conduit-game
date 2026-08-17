# Conduit Planet – Phase 3: `surface.hasIceCaps`

## Scope

This step wires only `PlanetDefinition.surface.hasIceCaps` into the canonical WebGPU-first surface path.

No terrain retuning, material retuning, climate rewrite, biome rewrite, ocean change, tectonic change or volcanic change is included.

## Previous state

`surface.hasIceCaps` already existed in `PlanetDefinition` and was copied into `SurfaceRenderProfile`.

`SurfaceRenderProfile.iceInfluence` also mixed class/composition/flag information, but the canonical `PlanetTerrainSampler` did not expose a shared polar ice-cap mask. Materials therefore had no canonical local mask to consume.

## Migration decision

`surface.hasIceCaps` is treated as a hard domain gate for a canonical normalized surface mask:

```text
hasIceCaps = false
    → iceCapMask = 0 everywhere

hasIceCaps = true
    → iceCapMask derived from:
       absolute latitude
       + global climate temperature
       + composition.ice
```

This is intentionally a surface/climate/material mask, not a terrain-height control.

## Canonical flow

```text
PlanetDefinition.surface.hasIceCaps
PlanetDefinition.climate.temperature01
PlanetDefinition.composition.ice
        ↓
PlanetTerrainSampler
        ↓
PlanetSurfaceSample.iceCapMask [0..1]
        ↓
future Surface material / snow / ice / climate consumers
```

## Behavior

- north and south caps are symmetric,
- the equator remains clear,
- colder planets extend caps further toward the equator,
- ice-richer compositions extend caps further toward the equator,
- the flag remains the hard gate even for cold or ice-rich planets.

The current calibrated cap start is derived as:

```ts
capStart = clamp(
    0.88
    - (1 - temperature01) * 0.24
    - composition.ice * 0.16,
    0.46,
    0.90,
);
```

The mask then reaches full coverage over a smooth polar transition band.

## Intentionally unchanged

This migration does not modify:

- `rawTerrain`,
- continent layout,
- `landMask`,
- ocean classification,
- canonical terrain height,
- geometry relief,
- tectonic relief,
- volcanic relief/mask,
- terrain normals,
- climate sample,
- biome selection,
- `SurfaceTerrainMaterial`.

In particular, ice caps do **not** automatically create extra mountains or ice-sheet displacement in this step.

If physical ice-sheet thickness is desired later, it should be introduced as an explicit canonical layer consuming `iceCapMask`, rather than silently overloading the boolean definition flag.

## Material integration target

The existing class-only ice shading in `SurfaceTerrainMaterial` should later consume `PlanetSurfaceSample.iceCapMask` (or an equivalent propagated attribute) so terrestrial/ocean/etc. planets with caps can display polar ice without becoming `class === 'ice'`.

The existing `SurfaceRenderProfile.iceInfluence` remains useful as a broad global material tendency. It should not replace the local canonical `iceCapMask`.

## Tests

Added `tests/PlanetIceCaps.test.ts` covering:

1. hard gate: disabled flag gives zero mask everywhere,
2. north/south polar symmetry and clear equator,
3. colder/ice-richer definitions produce broader caps,
4. toggling only `hasIceCaps` leaves raw terrain, water, geometry, climate, biome and volcanic mask unchanged.

## Risk

Architectural risk: **low**.

Visible risk: **none yet in the material**, because this step only exposes the canonical mask. A later material migration will make the new mask visible.

## Phase 3 status

```text
[x] surface.oceanLevel
[x] surface.terrainRoughness
[x] surface.hasTectonics
[x] surface.hasVolcanism
[x] surface.hasIceCaps
```

This completes the current Phase-3 `PlanetSurfaceDefinition` migration set identified in the stabilization plan.
