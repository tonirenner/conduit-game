# Documentation Guide

This directory contains current architecture documents, domain/lore documents, and historical implementation notes. Not every file is equally authoritative.

## Current architecture

Use these first when working on the active codebase:

- `planet-view-architecture.md` – active Orbit / Regional / Surface ownership model and transition rules.
- `planet-rendering-target-architecture.md` – current planet rendering target and shared data/material contracts.
- `conduit-web3d-architecture.md` – reusable Web3D package boundaries.
- `SIMULATION_TIME.md` – canonical simulation clock and cycle ownership.
- `climate-system-review.md` – current climate / biome / weather integration status.

The package-local working plan remains the main migration tracker:

- `packages/conduit-planet/PLANET_STABILIZATION_PLAN.md`

## Current project summary

- `chatgpt-current-state.md` – compact handoff/current-state summary.

If this summary conflicts with the stabilization plan or current source code, prefer the stabilization plan and source code.

## Historical / implementation record

These preserve earlier decisions and experiments. They are reference material, not the current planet-rendering contract:

- `current-game-architecture.md` – captures an older pre-settings/persistence architecture state.
- `planet-system-roadmap.md` – older roadmap built around the previous CubeSphere-centric planet plan.
- `implementation-notes.md` – dated implementation log.

In particular, older references to a single CubeSphere refining all the way to the ground, `RegionalSurfaceHandoffTerrain`, `LocalSurfaceTerrain`, or the previous Regional GPU/Hydraulic/Handoff chain describe superseded architecture.

## Domain / lore

These are independent from renderer cleanup and should not be rewritten as part of technical stabilization:

- `Conduit_Lore_Dossier_v0_2.md`
- `Conduit_Lore_Dossier_v0_2.pdf`
- `lore-gameplay-summary.md`
- `fog-of-war-architecture.md` unless the gameplay system itself changes.

## Documentation rule

For planet work, keep this ownership model consistent across all current documents:

```text
PlanetDefinition = domain truth
Derived profiles / material semantics = render configuration
Canonical samplers = physical / climate / terrain truth
OrbitView / RegionalView / SurfaceView = representation-specific consumers
```

A renderer may add representation-specific detail, but must not create a second planet definition, terrain identity, composition model, or climate model.
