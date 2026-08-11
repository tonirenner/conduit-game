import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AppRenderer, RendererMode } from '@conduit/web3d/renderer';
import type { GameSettings } from '../settings/GameSettings';

export type FeatureTestCategory =
	| 'Combat'
	| 'Ships'
	| 'Stations'
	| 'Planets'
	| 'Environment'
	| 'Rendering';

export type FeatureTestContext = {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	controls: OrbitControls;
	renderer: AppRenderer;
	rendererMode: RendererMode;
	settings: GameSettings;
	updateSettings: (patch: Partial<GameSettings>) => GameSettings;
	uiRoot: HTMLElement;
	report: (entry: FeatureLabStatusEntry) => void;
	clearReport: () => void;
};

export type FeatureLabStatus = 'pass' | 'warn' | 'fail' | 'info';

export type FeatureLabStatusEntry = {
	status: FeatureLabStatus;
	label: string;
	detail?: string;
};

export type FeatureTestScene = {
	readonly id: string;
	readonly name: string;
	readonly category: FeatureTestCategory;
	readonly description?: string;
	init: (context: FeatureTestContext) => void | Promise<void>;
	update: (deltaSeconds: number) => void;
	dispose: () => void;
	reset?: () => void | Promise<void>;
};

export type FeatureTestRegistration = {
	id: string;
	name: string;
	category: FeatureTestCategory;
	description?: string;
	create: () => FeatureTestScene;
};
