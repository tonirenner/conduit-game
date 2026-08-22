# Conduit Planet – Phase 5 Metal Composition Influence

## Goal

Make `PlanetDefinition.composition.metal` a real solid-surface material input without changing terrain geometry, climate, collision, water semantics or planet classification.

## Canonical responsibility

`composition.metal` describes the bulk material abundance generated for the planet. Surface rendering may use that abundance as a restrained material influence, but it must not reinterpret it as literal exposed pure metal everywhere.

The surface influence follows the existing `SurfaceRenderProfile` semantics:

```text
metal_rich class -> 1.0
other classes    -> clamp(composition.metal, 0, 1)
```

The active WebGPU surface material consumes the influence during CPU-side surface material evaluation. The resulting per-vertex color, roughness and metalness are then carried into the existing node material through the canonical terrain material attributes.

## Shading behavior

For solid non-lava terrain:

```text
exposedMetal
    = metalInfluence
    * (0.34 + rockMask * 0.66)
```

This deliberately favors rocky / exposed terrain rather than uniformly coating the planet.

The influence then:

- shifts albedo slightly toward a muted mineral-metal tint,
- lowers roughness conservatively,
- increases PBR metalness conservatively.

Water remains exactly non-metallic. Lava keeps its dedicated material path and is not modified by this migration.

## Non-goals

This step does not change:

- terrain height or relief,
- tectonics or volcanism geometry,
- collision / landing,
- climate or biome selection,
- ocean classification,
- resource generation,
- PlanetClass resolution,
- micro-normal topology,
- atmosphere or weather.

## Characterization

Added `tests/PlanetSurfaceMetalInfluence.test.ts`.

Coverage verifies:

1. more `composition.metal` increases metalness,
2. more `composition.metal` lowers roughness,
3. solid-surface albedo changes only subtly,
4. water remains non-metallic regardless of metal abundance,
5. `metal_rich` remains the full influence case even if the raw composition value is overridden in the fixture.

## Phase 5 status

- [x] Composition audit
- [x] `metalInfluence`
- [ ] `iceInfluence`
- [ ] `waterInfluence`
- [ ] `toxicInfluence`
- [ ] `lavaInfluence`
- [ ] explicit `rock` / `organic` / `gas` visual semantics

## Next step

`iceInfluence` is the next isolated surface-material migration. It should consume the already canonical `PlanetTerrainSampler.iceCapMask` where local spatial distribution is needed rather than inventing a second polar threshold in the material system.
