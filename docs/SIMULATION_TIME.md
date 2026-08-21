# Conduit simulation time

## Epoch

The canonical simulation epoch is:

```text
3030-01-01T00:00:00.000Z
```

All elapsed simulation time is measured forward from this epoch.

## Runtime

`src/game/simulation/SimulationClock.ts` contains the renderer-independent clock primitive.

`src/game/simulation/SimulationClockRuntime.ts` owns the current browser runtime clock and displays it in the prototype UI.

Default behavior:

```text
1 real second = 1 simulation second
```

The default time scale is `1`. The clock supports arbitrary non-negative time scales and explicit pause/resume.

## Display

The browser prototype displays the canonical simulation date in UTC-like simulation time:

```text
SIM 01.01.3030 00:00:00 | x1
```

This display is not the authority. It reads the shared `simulationClock` runtime instance.

## Intended consumers

The same elapsed simulation time is intended to become the shared source for:

- planet orbital phase,
- season phase,
- dynamic weather time,
- planet rotation / day-night cycles,
- moon orbital phase,
- future time-based gameplay systems,
- save/load timestamps and UI date display.

Renderer animation time must not become a second simulation clock.

## Cycle phases

`SimulationClock.getCyclePhase(periodSeconds, phaseOffset)` exposes a normalized deterministic `0..1` phase for periodic systems.

The clock deliberately does not know whether a period represents a year, day, moon orbit or other gameplay cycle. Domain systems convert their own period units into seconds and consume the shared elapsed time.

For Phase 4 seasonality, the next step is to derive a planet-specific season phase from the canonical simulation clock and the planet's `orbitalPeriod`, then let `climate.seasonality` control only the strength of seasonal effects.

## CI

`tests/SimulationClock.test.ts` covers:

- epoch correctness,
- time-scale advancement,
- pause/resume,
- calendar conversion,
- normalized cycle phases.
