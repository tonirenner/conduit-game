import {
	type AsteroidBeltDefinition,
	type StarClass,
	type StarDefinition,
	type StarSystemDefinition,
} from '../model/StarSystemDefinition';

import { SeededRandom, generatePlanetDefinition } from '@conduit/planet/generation';
import type { PlanetClass } from '@conduit/planet/model';
import {
	ASTRONOMICAL_UNIT_METERS,
	SOLAR_RADIUS_METERS,
} from '../../game/spatial/SpatialUnits';

export type StarSystemGenerationOptions = {
	id?: string;
	name?: string;
	planetCount?: number;
};

export function generateStarSystemDefinition(
	seed: number,
	options: StarSystemGenerationOptions = {},
): StarSystemDefinition {
	const random = new SeededRandom(seed);
	const star = generateStar(random);
	const planetCount = options.planetCount ?? random.int(4, 11);
	const planets: StarSystemDefinition['planets'] = [];
	const habitableOrbitScale = Math.max(0.35, Math.sqrt(star.luminosity));
	let previousSemiMajorAxis = 0;

	for (let index = 0; index < planetCount; index++) {
		const planetClass = selectPlanetClassForOrbit(
			random,
			index,
			planetCount,
			planets.map((planet) => planet.class),
			planets[index - 1]?.class ?? null,
		);

		const minimumSpacing =
			      random.range(0.18, 0.42) *
			      habitableOrbitScale *
			      ASTRONOMICAL_UNIT_METERS;

		const semiMajorAxis = Math.max(
			previousSemiMajorAxis + minimumSpacing,
			getSemiMajorAxisForPlanetClass(
				random,
				planetClass,
				habitableOrbitScale,
			),
		);

		previousSemiMajorAxis = semiMajorAxis;

		planets.push(generatePlanetDefinition(random.childSeed(), {
			id: `planet-${seed}-${index + 1}`,
			name: `${star.name} ${roman(index + 1)}`,
			semiMajorAxis,
			starIrradiance: star.luminosity,
			forcePlanetClass: planetClass,
			forceRings:
				planetClass === 'gas_giant' || planetClass === 'ice_giant'
				? random.chance(0.42)
				: index > 2 && random.chance(0.16),
		}));
	}

	return {
		id: options.id ?? `system-${seed}`,
		name: options.name ?? `${star.name} System`,
		seed,
		star,
		planets,
		asteroidBelts: generateAsteroidBelts(random),
		jumpPoints: generateJumpPoints(random),
	};
}

function selectPlanetClassForOrbit(
	random: SeededRandom,
	index: number,
	planetCount: number,
	existingClasses: PlanetClass[],
	previousClass: PlanetClass | null,
): PlanetClass {
	const orbit01 = planetCount <= 1 ? 0 : index / (planetCount - 1);
	const innerClasses: PlanetClass[] = ['barren', 'rocky', 'metal_rich', 'lava', 'desert'];
	const middleClasses: PlanetClass[] = ['terrestrial', 'ocean', 'desert', 'toxic', 'rocky', 'carbon'];
	const outerClasses: PlanetClass[] = ['ice', 'ice_giant', 'gas_giant', 'rocky', 'carbon'];
	const farOuterClasses: PlanetClass[] = ['gas_giant', 'ice_giant', 'ice', 'barren', 'carbon'];

	let candidates =
		    orbit01 < 0.28 ? innerClasses :
		    orbit01 < 0.62 ? middleClasses :
		    orbit01 < 0.82 ? outerClasses : farOuterClasses;

	if (index >= 4 && !previousClass?.includes('giant') && random.chance(0.32)) {
		candidates = [
			...candidates,
			random.chance(0.42) ? 'ice_giant' : 'gas_giant',
		];
	}

	const previousFamily = previousClass ? getPlanetClassFamily(previousClass) : null;
	const filtered = previousFamily
	                 ? candidates.filter(
			(candidate) =>
				candidate !== previousClass &&
				getPlanetClassFamily(candidate) !== previousFamily,
		)
	                 : candidates;

	const diversityFiltered = filtered.filter((candidate) => {
		const exactCount = existingClasses.filter((existingClass) => existingClass === candidate).length;
		const familyCount = existingClasses.filter(
			(existingClass) => getPlanetClassFamily(existingClass) === getPlanetClassFamily(candidate),
		).length;
		return exactCount < 1 && familyCount < 2;
	});

	if (diversityFiltered.length > 0) return random.pick(diversityFiltered);
	return random.pick(filtered.length > 0 ? filtered : candidates);
}

function getPlanetClassFamily(planetClass: PlanetClass): string {
	switch (planetClass) {
		case 'barren':
		case 'rocky':
		case 'metal_rich':
		case 'desert':
			return 'dry_solid';
		case 'terrestrial':
		case 'ocean':
			return 'wet_solid';
		case 'ice':
		case 'carbon':
			return 'outer_solid';
		case 'gas_giant':
		case 'ice_giant':
			return 'giant';
		case 'lava':
			return 'hot_solid';
		case 'toxic':
			return 'volatile_solid';
	}
}

function getSemiMajorAxisForPlanetClass(
	random: SeededRandom,
	planetClass: PlanetClass,
	habitableOrbitScale: number,
): number {
	const scaledRange = (min: number, max: number): number =>
		random.range(
		min * habitableOrbitScale,
		max * habitableOrbitScale,
		) * ASTRONOMICAL_UNIT_METERS;

	switch (planetClass) {
		case 'lava': return scaledRange(0.22, 0.48);
		case 'barren':
		case 'metal_rich': return scaledRange(0.34, 0.78);
		case 'rocky': return scaledRange(0.48, 1.25);
		case 'desert': return scaledRange(0.58, 1.05);
		case 'toxic': return scaledRange(0.68, 1.18);
		case 'terrestrial': return scaledRange(0.86, 1.22);
		case 'ocean': return scaledRange(0.92, 1.34);
		case 'carbon': return scaledRange(1.10, 2.75);
		case 'ice': return scaledRange(1.65, 3.60);
		case 'ice_giant': return scaledRange(2.30, 5.20);
		case 'gas_giant': return scaledRange(2.55, 6.40);
	}
}

function generateStar(random: SeededRandom): StarDefinition {
	const starClass = random.pick<StarClass>([
		                                         'red_dwarf', 'orange_dwarf', 'yellow_dwarf', 'white_star', 'blue_star',
	                                         ]);
	const profile = getStarProfile(starClass);

	return {
		id: `star-${random.childSeed()}`,
		name: random.pick(['Aster', 'Helion', 'Vega', 'Kora', 'Nyx', 'Solun', 'Eryx']),
		seed: random.childSeed(),
		class: starClass,
		...profile,
	};
}

function getStarProfile(
	starClass: StarClass,
): Omit<StarDefinition, 'id' | 'name' | 'seed' | 'class'> {
	switch (starClass) {
		case 'red_dwarf':
			return { mass: 0.35, radius: 0.45 * SOLAR_RADIUS_METERS, luminosity: 0.08, temperature: 3300, color: '#ff8a5c' };
		case 'orange_dwarf':
			return { mass: 0.75, radius: 0.78 * SOLAR_RADIUS_METERS, luminosity: 0.42, temperature: 4700, color: '#ffd0a0' };
		case 'yellow_dwarf':
			return { mass: 1.0, radius: 1.0 * SOLAR_RADIUS_METERS, luminosity: 1.0, temperature: 5800, color: '#fff4d0' };
		case 'white_star':
			return { mass: 1.7, radius: 1.45 * SOLAR_RADIUS_METERS, luminosity: 7.0, temperature: 8500, color: '#e6f3ff' };
		case 'blue_star':
			return { mass: 3.2, radius: 2.3 * SOLAR_RADIUS_METERS, luminosity: 35.0, temperature: 14500, color: '#b8d7ff' };
		case 'red_giant':
			return { mass: 1.3, radius: 28.0 * SOLAR_RADIUS_METERS, luminosity: 120.0, temperature: 3800, color: '#ff7440' };
	}
}

function generateAsteroidBelts(random: SeededRandom): AsteroidBeltDefinition[] {
	const count = random.int(0, 2);
	return Array.from({ length: count }).map((_, index) => ({
		id: `belt-${random.childSeed()}`,
		name: `Belt ${index + 1}`,
		seed: random.childSeed(),
		innerRadius: random.range(1.6, 7.0) * ASTRONOMICAL_UNIT_METERS,
		outerRadius: random.range(7.0, 14.0) * ASTRONOMICAL_UNIT_METERS,
		density: random.range(0.12, 0.85),
		metalRichness: random.range(0.05, 0.65),
		iceRichness: random.range(0.02, 0.72),
	}));
}

function generateJumpPoints(random: SeededRandom) {
	const count = random.int(1, 4);
	return Array.from({ length: count }).map((_, index) => ({
		id: `jump-${random.childSeed()}`,
		name: `Jump Point ${index + 1}`,
		orbitRadius: random.range(5.0, 22.0) * ASTRONOMICAL_UNIT_METERS,
		stability: random.range(0.35, 1.0),
	}));
}

function roman(value: number): string {
	const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
	return numerals[value - 1] ?? `${value}`;
}
