# Fog Of War Target Architecture

Date: 2026-08-12

## Goal

Fog of War should be a gameplay and information-state system first, not only a rendering effect.

The player should not simply see everything in a system. Visibility should come from owned systems, ships, stations, sensors, scouting, research and later mission/lobby rules.

## Core Principle

Fog of War owns knowledge. Rendering only visualizes that knowledge.

```text
Player / Faction
  -> FogOfWarState
  -> visibility queries
  -> Game UI / Minimap / Render filtering
```

Not:

```text
Shader hides objects without game-state knowing why
```

## State Model

Initial target:

```ts
type FogOfWarState = {
  factionId: string;
  knownSystemIds: string[];
  exploredObjectIds: string[];
  lastKnownObjects: Record<string, LastKnownObjectState>;
};

type LastKnownObjectState = {
  objectId: string;
  objectType: 'planet' | 'station' | 'ship' | 'fleet' | 'resource' | 'wormhole';
  systemId: string;
  position: { x: number; y: number; z: number };
  lastSeenAt: number;
};
```

Later this can grow into chunk/cell visibility, but object-level visibility is enough for the first prototype step.

## Visibility Types

Use separate concepts:

- `unknown`: player has no information
- `known`: discovered before, but not currently visible
- `visible`: currently inside sensor range
- `lastKnown`: stale position from previous visibility

This distinction matters for persistent singleplayer and later PvE/PvP results.

## Sensor Sources

Sensor coverage should be derived from gameplay objects:

- ships
- fleets
- stations
- owned systems
- research upgrades
- mission-specific reveal zones

Example:

```ts
type SensorSource = {
  id: string;
  factionId: string;
  systemId: string;
  position: Vector3Like;
  rangeMeters: number;
};
```

Scouts and sensor stations can later have stronger ranges. Research can scale the range or stale-intel duration.

## Domain API

First implementation should be pure and testable:

```ts
isSystemKnown(state, systemId): boolean
isObjectExplored(state, objectId): boolean
isObjectVisible(state, objectId, sensors, objectPosition): boolean
updateFogOfWar(state, sensors, observableObjects, time): FogOfWarState
```

No Three.js imports in the domain layer.

## Persistence

Fog of War belongs to persistent player/world state.

For singleplayer:

- known systems persist
- explored planets/stations persist
- last-known hostile fleet positions can persist
- temporary sensor coverage is recalculated from current ships/stations

For PvE/PvP:

- match fog should be separate temporary match state
- battle results can reveal intel or update persistent knowledge
- server-authoritative later

## Rendering And UI

Rendering should ask the fog system before showing information.

System View:

- unknown enemy ships hidden
- last-known contacts shown as stale markers, not real objects
- planets can be visible if system is owned or previously explored

Minimap:

- visible objects are bright
- explored but not visible objects are dim
- unknown objects are hidden
- sensor range circles can be drawn as debug or tactical UI

Strategic Map:

- known systems visible
- unknown systems hidden or shown as unexplored markers
- owned systems always visible

## Feature Lab

Add later:

```text
Feature Lab
  -> Fog Of War Test
```

Test setup:

- one player sensor ship
- enemy ship moving in and out of range
- planet/station markers
- minimap-style overlay
- toggles for sensor radius and stale-intel duration

## First Implementation Scope

1. Add `FogOfWarState` and types.
2. Add pure `FogOfWarSystem` functions.
3. Add domain tests.
4. Add state to `PersistentGameState`.
5. Add minimal minimap filtering.
6. Add optional debug sensor circles.

Do not start with shader fog, terrain fog, volumetric fog or full map-cell visibility.

## Not Now

- no server-authoritative fog yet
- no multiplayer networking
- no terrain-cell fog grid
- no volumetric fog rendering
- no complex stealth mechanics

Those can come after object-level visibility works.
