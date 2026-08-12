# Short-Term Roadmap

Date: 2026-08-12

## Current Baseline

- Conduit Web3D exists as local package foundation for reusable rendering infrastructure.
- Renderer, environment lighting, postprocessing, asset loading, material snapshots, model preparation, and node discovery have started moving into Conduit.
- Feature Lab is available for isolated visual and gameplay diagnostics.
- Existing important lab scenes include model viewing, turret tracking, engine VFX, ship combat, planet LOD, postprocessing, and studio lighting.
- Combat rendering now has a shared weapon mount layout concept for turrets, muzzles, launchers, railguns, lasers, missiles, and generic hardpoints.
- Planet rendering now uses a more shared visual profile basis across WebGL and WebGPU, with fewer renderer-specific visual constants.

## Guiding Rules

- Keep the game playable after each larger step.
- Prefer small commits with one clear purpose.
- Do not duplicate game logic inside Feature Lab scenes.
- Shared rendering and asset utilities go to Conduit only when they are game-independent.
- Game rules, ships, combat decisions, production, economy, and persistence stay in the game layer.
- Avoid separate WebGL/WebGPU tuning paths where a shared visual profile is possible.

## Next 1: Planet Tech Diagnostics

- Treat `docs/planet-rendering-target-architecture.md` as the leading Planet Tech document.
- Make Planet LOD the canonical workbench for all planet classes.
- Surface climate, biome, coverage, seed, scale and active profile data in the lab before more visual tuning.
- Keep WebGL and WebGPU on the same `PlanetDefinition`, render profile and visual profile inputs.
- Avoid per-renderer class tuning unless the shared data cannot express the required look.

## Next 2: Combat And VFX Parity In Game

- Confirm that turret tracking in the real game uses the same production code as the lab scene.
- Confirm that engine VFX in the real game uses discovered `engine_*` nodes before bounding-box fallback.
- Confirm that weapon VFX in the real game uses the same mount layout as the Weapon Fire test scene.
- Add a small in-game debug toggle for node markers if needed.
- Keep dummy geometry only as a real asset load fallback.

## Next 3: Asset Catalog Cleanup

- Introduce or tighten a shared model asset catalog used by both game and Feature Lab.
- Make GLB/OBJ discovery, labels, orientation corrections, and fallback metadata live in one place.
- Ensure dummy models and real models use the same forward/up convention where possible.
- Add station node checks for future `spawn_01`, `dock_01`, and `rally_origin`.

## Next 4: Conduit Web3D Extraction

- Continue removing old re-export shims once call sites are migrated.
- Move generic model node helpers, material override helpers, and debug drawing helpers into Conduit where clean.
- Keep combat-specific interpretation of nodes in the game.
- Add a small public API surface only after the internal usage is stable.

## Next 5: Gameplay Foundation

- Implement capital ship build orders instead of instant station placement.
- Extend shipyard production with spawn point and rally point behavior.
- Keep produced ships on HOLD and out of automatic fleet grouping.
- Add first persistent research and resource state behind repository interfaces.
- Add save triggers after build, production, fleet changes, research completion, and battle results.

## Next 6: Planet Rendering Follow-Up

- Leave current surfaces mostly stable unless a class is clearly wrong.
- Use shared `PlanetClassVisualProfile` data as the main tuning point.
- Avoid per-renderer planet constants unless there is a technical limitation.
- Later add a focused pass for gas giant cloud depth, ice giant banding, and ocean shoreline sharpness.

## Not Now

- No real backend.
- No login.
- No network multiplayer.
- No full matchmaking server.
- No large Conduit rewrite.
- No separate long-term WebGL and WebGPU planet art pipelines.
