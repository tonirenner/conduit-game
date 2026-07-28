import {
	type AsteroidBeltDefinition,
	type StarClass,
	type StarDefinition,
	type StarSystemDefinition,
} from '../model/StarSystemDefinition';

import { SeededRandom } from '../../planet/generation/SeededRandom';
import { generatePlanetDefinition } from '../../planet/generation/PlanetGenerator';

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
	const planets = Array.from({
		length: planetCount,
	}).map((_, index) => {
		const semiMajorAxis = 0.28 + index * random.range(0.42, 1.45);

		return generatePlanetDefinition(
			random.childSeed(),
			{
				id: `planet-${seed}-${index + 1}`,
				name: `${star.name} ${roman(index + 1)}`,
				semiMajorAxis,
				starIrradiance: star.luminosity,
				forceGasGiant: index > 3 && random.chance(0.35),
				forceRings: index > 3 && random.chance(0.20),
			},
		);
	});

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

function generateStar(random: SeededRandom): StarDefinition {
	const starClass = random.pick<StarClass>([
		'red_dwarf',
		'orange_dwarf',
		'yellow_dwarf',
		'white_star',
		'blue_star',
	]);

	const profile = getStarProfile(starClass);

	return {
		id: `star-${random.childSeed()}`,
		name: random.pick([
			'Aster',
			'Helion',
			'Vega',
			'Kora',
			'Nyx',
			'Solun',
			'Eryx',
		]),
		seed: random.childSeed(),
		class: starClass,
		...profile,
	};
}

function getStarProfile(starClass: StarClass): Omit<StarDefinition, 'id' | 'name' | 'seed' | 'class'> {
	switch (starClass) {
		case 'red_dwarf':
			return {
				mass: 0.35,
				radius: 0.45,
				luminosity: 0.08,
				temperature: 3300,
				color: '#ff8a5c',
			};

		case 'orange_dwarf':
			return {
				mass: 0.75,
				radius: 0.78,
				luminosity: 0.42,
				temperature: 4700,
				color: '#ffd0a0',
			};

		case 'yellow_dwarf':
			return {
				mass: 1.0,
				radius: 1.0,
				luminosity: 1.0,
				temperature: 5800,
				color: '#fff4d0',
			};

		case 'white_star':
			return {
				mass: 1.7,
				radius: 1.45,
				luminosity: 7.0,
				temperature: 8500,
				color: '#e6f3ff',
			};

		case 'blue_star':
			return {
				mass: 3.2,
				radius: 2.3,
				luminosity: 35.0,
				temperature: 14500,
				color: '#b8d7ff',
			};

		case 'red_giant':
			return {
				mass: 1.3,
				radius: 28.0,
				luminosity: 120.0,
				temperature: 3800,
				color: '#ff7440',
			};
	}
}

function generateAsteroidBelts(random: SeededRandom): AsteroidBeltDefinition[] {
	const count = random.int(0, 2);

	return Array.from({
		length: count,
	}).map((_, index) => ({
		id: `belt-${random.childSeed()}`,
		name: `Belt ${index + 1}`,
		seed: random.childSeed(),
		innerRadius: random.range(1.6, 7.0),
		outerRadius: random.range(7.0, 14.0),
		density: random.range(0.12, 0.85),
		metalRichness: random.range(0.05, 0.65),
		iceRichness: random.range(0.02, 0.72),
	}));
}

function generateJumpPoints(random: SeededRandom) {
	const count = random.int(1, 4);

	return Array.from({
		length: count,
	}).map((_, index) => ({
		id: `jump-${random.childSeed()}`,
		name: `Jump Point ${index + 1}`,
		orbitRadius: random.range(5.0, 22.0),
		stability: random.range(0.35, 1.0),
	}));
}

function roman(value: number): string {
	const numerals = [
		'I',
		'II',
		'III',
		'IV',
		'V',
		'VI',
		'VII',
		'VIII',
		'IX',
		'X',
		'XI',
		'XII',
	];

	return numerals[value - 1] ?? `${value}`;
}
