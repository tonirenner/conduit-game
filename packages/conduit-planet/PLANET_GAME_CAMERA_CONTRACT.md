# Production Planet Camera / Interaction Contract

This document defines the required Game interaction when the modern planet runtime becomes the production path.

## Core rule

The Game must reuse the same planet approach/free-look control behavior that is proven in the Planet LOD lab. Do not build a second simplified Game-specific planet camera.

The shared control behavior should remain one implementation so Lab and Game cannot drift apart.

## System / strategic camera behavior

Normal SystemView camera behavior remains unchanged while no planet is focused.

The existing Game interaction stays the entry point:

```text
System / strategic camera
    ↓ double-click planet
planet focus mode
```

Before planet focus takes ownership, the current Game camera position, target, FOV and relevant control state must be preserved so it can be restored exactly on exit.

## Planet focus mode

Double-clicking a planet enters the modern planet camera flow and hands control to the same approach/free-look logic used by the Planet LOD lab.

Required behavior:

```text
Orbit
  ↓
Regional approach
  ↓
Surface approach / flight
```

Controls while planet focus owns the camera:

```text
Mouse drag  = free look
Mouse wheel = radial altitude / zoom
W / S       = forward / backward along the spherical surface
A / D       = strafe along the spherical surface
Q / E       = descend / ascend radially
Shift       = accelerated movement
```

WASD movement must follow planetary curvature and preserve the local horizon/orientation behavior already implemented by `PlanetFreeLookCameraController`.

The modern `PlanetViewRuntime` remains responsible for Orbit → Regional → Surface renderer transitions while the camera changes scale.

## Exit behavior

Planet focus exits through either:

```text
1. double-click the same focused planet again
2. press Escape
```

Both exit paths must use the same restoration logic.

Required result:

```text
planet focus mode
    ↓ double-click same planet OR Escape
restore previously saved System / strategic camera
```

Restoration means returning to the Game camera state that existed immediately before entering planet focus, rather than constructing a new generic camera position.

The existing SystemView interaction model remains authoritative after restoration.

## Non-goals

Do not:

- add an A/B camera mode,
- keep a legacy planet-camera fallback,
- implement separate Lab and Game versions of the approach/free-look controller,
- replace the existing double-click interaction with a new button/UI flow,
- return to an arbitrary default SystemView camera when a saved pre-focus camera exists.

## Production migration requirement

The production Game migration is not complete merely when `SystemPlanetViewRuntime` renders the modern planet stack.

It is complete only when the interaction contract is also active:

```text
existing Game System camera
    ↓ double-click planet
shared Lab approach/free-look controls
    ↓ Orbit → Regional → Surface
    ↓ double-click same planet / Escape
exact previous Game camera restored
```

If this behavior exposes a defect during Game integration, fix the shared modern camera/runtime path rather than reintroducing the old planet-control path.
