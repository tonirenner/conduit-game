import type { PlanetDefinition } from '../../planet/model/PlanetDefinition';

export type StarClass =
	| 'red_dwarf'
	| 'orange_dwarf'
	| 'yellow_dwarf'
	| 'white_star'
	| 'blue_star'
	| 'red_giant';

export type StarDefinition = {
	id: string;
	name: string;
	seed: number;
	class: StarClass;
	mass: number;
	radius: number;
	luminosity: number;
	temperature: number;
	color: string;
};

export type AsteroidBeltDefinition = {
	id: string;
	name: string;
	seed: number;
	innerRadius: number;
	outerRadius: number;
	density: number;
	metalRichness: number;
	iceRichness: number;
};

export type JumpPointDefinition = {
	id: string;
	name: string;
	targetSystemId?: string;
	orbitRadius: number;
	stability: number;
};

export type StarSystemDefinition = {
	id: string;
	name: string;
	seed: number;
	star: StarDefinition;
	planets: PlanetDefinition[];
	asteroidBelts: AsteroidBeltDefinition[];
	jumpPoints: JumpPointDefinition[];
};
