# Global Planet Lighting / Atmosphere Issue

Status: open visual issue.

## Scope

This affects all planet classes, not only Ocean worlds.

Observed problem:

- the day/night terminator is currently too hard,
- the transition reads too much like a direct light on/off boundary instead of a soft twilight region,
- nightside illumination is too abrupt,
- a visible vertical band/seam-like artifact can appear near the transition and must be investigated separately from the terminator softness.

## Target fix

Treat this as one global planet-lighting / atmosphere task rather than per-class tuning.

Planned work:

1. soften the terminator using a broader lighting transition around `N·L`,
2. add a restrained twilight / atmospheric scattering band,
3. add minimal physically plausible nightside ambient / airlight rather than fully blacking the surface immediately,
4. inspect the vertical band independently for seam, face, coordinate-space, LUT or sampling causes,
5. verify the result across representative solid and giant planet classes before accepting the change globally.

## Guardrails

- do not solve this with class-specific color hacks,
- do not disturb the accepted Orbit → Regional → Surface depth ownership logic,
- do not alter the protected WebGPU atmosphere screen-ray reconstruction as collateral work,
- first determine whether the vertical band is lighting-related or a separate rendering seam before changing terrain/material sampling.

Short label:

`Global planet lighting: soften terminator + inspect vertical seam artifact`
