import type { PlanetClass } from '@conduit/planet/model';

export type HydraulicErosionResult = { delta: Float32Array; strength: number };

type Profile = { strength: number; droplets: number; steps: number; inertia: number; erosion: number; deposition: number; evaporation: number };

const PROFILE: Partial<Record<PlanetClass, Profile>> = {
	terrestrial: { strength: 1.0, droplets: 0.075, steps: 22, inertia: 0.18, erosion: 0.24, deposition: 0.19, evaporation: 0.035 },
	ocean: { strength: 0.92, droplets: 0.070, steps: 22, inertia: 0.16, erosion: 0.23, deposition: 0.20, evaporation: 0.032 },
	desert: { strength: 0.82, droplets: 0.060, steps: 20, inertia: 0.22, erosion: 0.20, deposition: 0.16, evaporation: 0.046 },
	toxic: { strength: 0.58, droplets: 0.045, steps: 18, inertia: 0.20, erosion: 0.17, deposition: 0.16, evaporation: 0.050 },
	carbon: { strength: 0.46, droplets: 0.038, steps: 17, inertia: 0.24, erosion: 0.15, deposition: 0.14, evaporation: 0.054 },
	rocky: { strength: 0.28, droplets: 0.025, steps: 15, inertia: 0.28, erosion: 0.11, deposition: 0.12, evaporation: 0.060 },
	barren: { strength: 0.22, droplets: 0.022, steps: 14, inertia: 0.30, erosion: 0.10, deposition: 0.11, evaporation: 0.064 },
	metal_rich: { strength: 0.18, droplets: 0.018, steps: 13, inertia: 0.32, erosion: 0.09, deposition: 0.10, evaporation: 0.068 },
	ice: { strength: 0.16, droplets: 0.016, steps: 13, inertia: 0.26, erosion: 0.08, deposition: 0.10, evaporation: 0.060 },
	lava: { strength: 0, droplets: 0, steps: 0, inertia: 0, erosion: 0, deposition: 0, evaporation: 1 },
};

const FALLBACK: Profile = { strength: 0.34, droplets: 0.030, steps: 16, inertia: 0.24, erosion: 0.13, deposition: 0.13, evaporation: 0.058 };

export function applyRegionalHydraulicErosion(height: Float32Array, resolution: number, planetClass: PlanetClass, seed: number): HydraulicErosionResult {
	const p = PROFILE[planetClass] ?? FALLBACK;
	const delta = new Float32Array(height.length);
	if (p.strength <= 0 || resolution < 8) return { delta, strength: 0 };

	let min = Infinity, max = -Infinity;
	for (const v of height) { if (v < min) min = v; if (v > max) max = v; }
	const range = Math.max(1e-6, max - min);
	const h = new Float32Array(height.length);
	for (let i = 0; i < h.length; i++) h[i] = (height[i] - min) / range;
	const original = h.slice();
	const rng = makeRng(seed ^ Math.imul(resolution, 0x9e3779b1));
	const droplets = Math.min(10_000, Math.max(900, Math.round(resolution * resolution * p.droplets)));

	for (let d = 0; d < droplets; d++) {
		let x = 1 + rng() * (resolution - 3), y = 1 + rng() * (resolution - 3);
		let dx = 0, dy = 0, sediment = 0, water = 1;
		for (let s = 0; s < p.steps; s++) {
			const ix = Math.floor(x), iy = Math.floor(y);
			if (ix < 1 || iy < 1 || ix >= resolution - 1 || iy >= resolution - 1) break;
			const i = iy * resolution + ix;
			const gx = (h[i + 1] - h[i - 1]) * 0.5;
			const gy = (h[i + resolution] - h[i - resolution]) * 0.5;
			dx = dx * p.inertia - gx * (1 - p.inertia);
			dy = dy * p.inertia - gy * (1 - p.inertia);
			const len = Math.hypot(dx, dy) || 1;
			dx /= len; dy /= len;
			const before = h[i];
			x += dx; y += dy;
			const nx = Math.floor(x), ny = Math.floor(y);
			if (nx < 1 || ny < 1 || nx >= resolution - 1 || ny >= resolution - 1) break;
			const ni = ny * resolution + nx;
			const fall = before - h[ni];
			const capacity = Math.max(0.0002, Math.max(0, fall) * water * 4);
			if (sediment > capacity || fall < 0) {
				const amount = Math.min(sediment, Math.max(-fall, (sediment - capacity) * p.deposition)) * p.strength;
				h[i] += amount; sediment -= amount;
			} else {
				const amount = Math.min((capacity - sediment) * p.erosion, Math.max(0, fall + 0.0025)) * p.strength;
				h[i] = Math.max(0, h[i] - amount); sediment += amount;
			}
			water *= 1 - p.evaporation;
			if (water < 0.08) break;
		}
	}

	for (let i = 0; i < h.length; i++) {
		delta[i] = (h[i] - original[i]) * range;
		height[i] += delta[i];
	}
	return { delta, strength: p.strength };
}

function makeRng(seed: number): () => number {
	let state = seed >>> 0 || 1;
	return () => {
		state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
		return (state >>> 0) / 4294967296;
	};
}
