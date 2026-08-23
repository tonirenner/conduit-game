# Conduit Simulation Time

## Canonical epoch

The shared simulation epoch is:

```text
3030-01-01T00:00:00.000Z
```

All elapsed simulation time is measured forward from this epoch.

## Clock ownership

`src/game/simulation/SimulationClock.ts` contains the renderer-independent clock primitive.

`src/game/simulation/SimulationClockRuntime.ts` owns the current browser runtime instance and displays it in the prototype UI.

Default behavior:

```text
1 real second = 1 simulation second
```

The clock supports:

- arbitrary non-negative time scale,
- pause/resume,
- direct elapsed-time access,
- deterministic normalized cycle phases.

The browser display is a consumer of the shared clock, not the authority.

## Runtime display

Current prototype display:

```text
SIM DD.MM.YYYY HH:MM:SS | xN
```

with a paused marker when applicable.

The current browser runtime starts from the epoch on page load. Save/load persistence of elapsed simulation time is not wired yet.

The runtime currently advances through its own `requestAnimationFrame` loop. Background-tab throttling therefore slows effective simulation progression today; future authoritative simulation/save/server ownership may move advancement out of the display runtime.

## Cycle phases

`SimulationClock.getCyclePhase(periodSeconds, phaseOffset)` exposes a normalized deterministic phase in `[0, 1)`.

The clock deliberately does not know what a period means. Domain systems convert their own units to seconds and consume elapsed simulation time.

Examples:

- planet orbit / season,
- rotation / day-night,
- moon orbit,
- recurring gameplay systems.

Renderer animation time must not become a second simulation clock.

## Planet season cycle

`src/game/simulation/PlanetSeasonCycle.ts` is the current planet-specific bridge between simulation time and seasonal weather.

`PlanetGenerator` produces `orbitalPeriod` in Earth-year units. `PlanetSeasonCycle` converts that value using 365.25 Earth days per year and derives a normalized phase from the shared `SimulationClock`.

Conceptually:

```text
SimulationClock.elapsedSeconds
    + PlanetDefinition.orbitalPeriod
    + optional phase offset
        ↓
planet season/orbital phase [0..1)
```

`climate.seasonality` controls the **strength** of seasonal weather response; it does not define time or orbital phase.

Current seasonal forcing is intentionally simplified:

- phase 0 has no astronomical season name attached,
- hemisphere is based on `normal.y`,
- `axialTilt` is not yet applied,
- eccentricity is not directly evaluated by the cycle function,
- static terrain/vegetation/snow/ice coverage is not dynamically rewritten by the season cycle.

## Intended shared consumers

The same canonical elapsed simulation time is intended to own:

- planet orbital phase,
- seasonal weather phase,
- dynamic weather time,
- planet rotation / day-night cycles,
- moon orbital phase,
- time-based gameplay systems,
- save/load timestamps,
- UI date display.

Do not create independent renderer-local clocks for these systems.

## Current integration gaps

The clock and planet season-cycle foundation exist, but not every visual runtime consumer is wired to them yet.

In particular:

- the clock display does not show active planet year/season phase,
- live clouds/weather are not yet proven to consume one composed seasonality + cloud-persistence weather path,
- planet rotation still has legacy renderer-specific behavior and is not yet fully driven by `physical.rotationSpeed`,
- save/load restoration of elapsed simulation time is not yet implemented.

## Tests

`tests/SimulationClock.test.ts` covers:

- epoch correctness,
- time-scale advancement,
- pause/resume,
- calendar conversion,
- normalized cycle phases.

`tests/PlanetSeasonCycle.test.ts` covers the planet-period conversion and phase behavior.
