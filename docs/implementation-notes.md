# Implementation Notes

## 2026-08-09

### Architecture Baseline

- Added `docs/current-game-architecture.md`.
- Documented current entry points, game-state ownership, render flow, input flow, persistent data candidates, risks, and target architecture.

### Startup / Settings

- Changed default startup so `/` enters the game prototype.
- Kept planet viewer available through `?view=planet`; `?game=0` remains a compatibility/debug escape hatch.
- Added `GameSettings`, `SettingsRepository`, `LocalSettingsRepository`, and `SettingsStore`.
- Added top-right Settings UI with renderer, quality, post-processing toggles, render scale, UI toggles, UI scale, and developer link to Planet Viewer.
- Renderer and post-processing settings are read at startup from the central settings store.

### Post-Processing

- Fixed Three r185 SSR options usage and avoided `float(null)`.
- Made GTAO, SSR, Bloom, and exposure profiles more restrained.
- Changed AO application from full multiplication to strength-controlled blending.
- Changed SSR contribution to be opacity-scaled before adding it to the working color.

### Singleplayer Persistence Foundation

- Added `PlayerProfile`, `PlayerResources`, `ResearchState`, `StoryProgress`, and `PersistentGameState`.
- Added `PlayerRepository` and `GameWorldRepository` interfaces with localStorage implementations.
- Added `loadOrCreateSingleplayerState()` bootstrap.
- Added `generateSingleplayerHomeRegion()` to create five persistent player-owned systems:
  - Home System
  - Resource System
  - Research Reach
  - Frontier Line
  - Outer System
- Wired `GamePrototypeScene` to accept an initial world and periodically report world changes for local saving.

### Verification

- Build/tests intentionally not run after the PhpStorm crash recovery, per user request.
