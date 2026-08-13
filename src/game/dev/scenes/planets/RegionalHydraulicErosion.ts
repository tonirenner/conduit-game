import type { PlanetClass } from '@conduit/planet/model';

export type HydraulicErosionResult = {
	delta: Float32Array;
	strength: number;
};

type HydraulicErosionProfile = {
	strength: number;
	dropletsPerPixel: number;
	maxSteps: number;
	inertia: number;
	capacity: number;
	erosionRate: number;
	depositionRate: number;
	evaporation: number;
};

const PROFILES: Partial<Record<PlanetClass, HydraulicErosionProfile>> = {
	terrestrial: { strength: 1.0, dropletsPerPixel: 0.075, maxSteps: 22, inertia: 0.18, capacity: 4.2, erosionRate: 0.24, depositionRate: 0.19, evaporation: 0.035 },
	ocean: { strength: 0.92, dropletsPerPixel: 0.070, maxSteps: 22, inertia: 0.16, capacity: 4.0, erosionRate: 0.23, depositionRate: 0.20, evaporation: 0.032 },
	desert: { strength: 0.82, dropletsPerPixel: 0.060, maxSteps: 20, inertia: 0.22, capacity: 3.8, erosionRate: 0.20, depositionRate: 0.16, evaporation: 0.046 },
	toxic: { strength: 0.58, dropletsPerPixel: 0.045, maxSteps: 18, inertia: 0.20, capacity: 3.3, erosionRate: 0.17, depositionRate: 0.16, evaporation: 0.050 },
	carbon: { strength: 0.46, dropletsPerPixel: 0.038, maxSteps: 17, inertia: 0.24, capacity: 3.0, erosionRate: 0.15, depositionRate: 0.14, evaporation: 0.054 },
	rocky: { strength: 0.28, dropletsPerPixel: 0.025, maxSteps: 15, inertia: 0.28, capacity: 2.5, erosionRate: 0.11, depositionRate: 0.12, evaporation: 0.060 },
	barren: { strength: 0.22, dropletsPerPixel: 0.022, maxSteps: 14, inertia: 0.30, capacity: 2.3, erosionRate: 0.10, depositionRate: 0.11, evaporation: 0.064 },
	metal_rich: { strength: 0.18, dropletsPerPixel: 0.018, maxSteps: 13, inertia: 0.32, capacity: 2.1, erosionRate: 0.09, depositionRate: 0.10, evaporation: 0.068 },
	ice: { strength: 0.16, dropletsPerPixel: 0.016, maxSteps: 13, inertia: 0.26, capacity: 2.0, erosionRate: 0.08, depositionRate: 0.10, evaporation: 0.060 },
	lava: { strength: 0, dropletsPerPixel: 0, maxSteps: 0, inertia: 0, capacity: 0, erosionRate: 0, depositionRate: 0, evaporation: 1 },
};

const DEFAULT_PROFILE: HydraulicErosionProfile = {
	strength: 0.34,
	dropletsPerPixel: 0.030,
	maxSteps: 16,
	inertia: 0.24,
	capacity: 2.8,
	erosionRate: 0.13,
	depositionRate: 0.13,
	evaporation: 0.058,
};

export function applyRegionalHydraulicErosion(
	heightMeters: Float32Array,
	resolution: number,
	planetClass: PlanetClass,
	seed: number,
	waterMask?: Uint8Array,
): HydraulicErosionResult {
	const profile = PROFILES[planetClass] ?? DEFAULT_PROFILE;
	const delta = new Float32Array(heightMeters.length);
	if (profile.strength <= 0 || resolution < 8) return { delta, strength: 0 };

	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (const value of heightMeters) {
		min = Math.min(min, value);
		max = Math.max(max, value);
	}
	const range = Math.max(1, max - min);
	const normalized = new Float32Array(heightMeters.length);
	for (let i = 0; i < heightMeters.length; i++) normalized[i] = (heightMeters[i] - min) / range;
	const original = normalized.slice();

	const dropletCount = Math.min(10_000, Math.max(900, Math.round(resolution * resolution * profile.dropletsPerPixel)));
	const rng = createRng(seed ^ (resolution * 0x9e3779b1));

	for (let dropletIndex = 0; dropletIndex < dropletCount; dropletIndex++) {
		let x = 1 + rng() * (resolution - 3);
		let y = 1 + rng() * (resolution - 3);
		let dirX = 0;
		let dirY = 0;
		let speed = 1;
		let water = 1;
		let sediment = 0;

		for (let step = 0; step < profile.maxSteps; step++) {
			const cellX = Math.floor(x);
			const cellY = Math.floor(y);
			if (cellX < 1 || cellX >= resolution - 1 || cellY < 1 || cellY >= resolution - 1) break;
			const index = cellY * resolution + cellX;
			if (waterMask?.[index]) break;

			const left = normalized[index - 1];
			const right = normalized[index + 1];
			const down = normalized[index - resolution];
			const up = normalized[index + resolution];
			const gradX = (right - left) * 0.5;
			const gradY = (up - down) * 0.5;

			dirX = dirX * profile.inertia - gradX * (1 - profile.inertia);
			dirY = dirY * profile.inertia - gradY * (1 - profile.inertia);
			const dirLength = Math.hypot(dirX, dirY);
			if (dirLength < 1e-6) {
				const angle = rng() * Math.PI * 2;
				dirX = Math.cos(angle);
				dirY = Math.sin(angle);
			} else {
				dirX /= dirLength;
				dirY /= dirLength;
			}

			const oldHeight = normalized[index];
			x += dirX;
			y += dirY;
			const nextX = Math.floor(x);
			const nextY = Math.floor(y);
			if (nextX < 1 || nextX >= resolution - 1 || nextY < 1 || nextY >= resolution - 1) break;
			const nextIndex = nextY * resolution + nextX;
			const newHeight = normalized[nextIndex];
			const deltaHeight = newHeight - oldHeight;

			const capacity = Math.max(0.00025, -deltaHeight * speed * water * profile.capacity);
			if (sediment > capacity || deltaHeight > 0) {
				const deposit = deltaHeight > 0
					? Math.min(sediment, deltaHeight)
					: (sediment - capacity) * profile.depositionRate;
				normalized[index] += deposit * profile.strength;
				sediment -= deposit;
			} else {
				const erode = Math.min((capacity - sediment) * profile.erosionRate, Math.max(0, -deltaHeight + 0.0025));
				const amount = erode * profile.strength;
				normalized[index] = Math.max(0, normalized[index] - amount);
				const brush = amount * 0.16;
				normalized[index - 1] = Math.max(0, normalized[index - 1] - brush);
				normalized[index + 1] = Math.max(0, normalized[index + 1] - brush);
				normalized[index - resolution] = Math.max(0, normalized[index - resolution] - brush);
				normalized[index + resolution] = Math.max(0, normalized[index + resolution] - brush);
				sediment += amount + brush * 4;
			}

			speed = Math.sqrt(Math.max(0.05, speed * speed + (-deltaHeight) * 4));
			water *= 1 - profile.evaporation;
			if (water < 0.08) break;
		}
	}

	for (let i = 0; i < normalized.length; i++) {
		const change = normalized[i] - original[i];
		delta[i] = change * range;
		heightMeters[i] += delta[i];
	}

	return { delta, strength: profile.strength };
}

function createRng(seed: number): () => number {
	let state = seed >>> 0 || 1;
	return () => {
		state = Math.imul(state ^ (state >>> 16), 0x45d9f3b) >>> 0;
		state = Math.imul(state ^ (state >>> 16), 0x45d9f3b) >>> 0;
		state ^= state >>> 16;
		return (state >>> 0) / 4294967296;
	};
}
