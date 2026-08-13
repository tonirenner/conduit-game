import * as THREE from 'three';

import {
	CLIMATE_DEBUG_MODES,
	type ClimateDebugMode,
	getClimateDebugColor,
	getClimateSample,
} from '@conduit/planet/climate';

import {
	WEATHER_DEBUG_MODES,
	type WeatherDebugMode,
	getWeatherDebugColor,
	getWeatherSample,
} from '@conduit/planet/climate';

import { getTerrainSample } from '@conduit/planet/terrain';

export type ClimateDebugModeCombined =
	| ClimateDebugMode
	| WeatherDebugMode;

const DEBUG_MODES: ClimateDebugModeCombined[] = [
	...CLIMATE_DEBUG_MODES,
	...WEATHER_DEBUG_MODES,
];

export type ClimateDebugCanvas = {
	canvas: HTMLCanvasElement;
	redraw: () => void;
	toggle: () => void;
	cycleMode: () => void;
	setVisible: (visible: boolean) => void;
	setMode: (mode: ClimateDebugModeCombined) => void;
	getMode: () => ClimateDebugModeCombined;
};

export function createClimateDebugCanvas(options?: {
	width?: number;
	height?: number;
	visible?: boolean;
	mode?: ClimateDebugModeCombined;
}): ClimateDebugCanvas {
	const mapWidth = options?.width ?? 360;
	const mapHeight = options?.height ?? 180;

	let visible = options?.visible ?? false;
	let modeIndex = Math.max(
		0,
		DEBUG_MODES.indexOf(options?.mode ?? 'biome'),
	);

	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');

	if (!context) {
		throw new Error('2D context für Climate Debug konnte nicht erstellt werden.');
	}

	canvas.width = mapWidth;
	canvas.height = mapHeight;

	canvas.style.position = 'fixed';
	canvas.style.right = '12px';
	canvas.style.top = '12px';
	canvas.style.width = `${mapWidth}px`;
	canvas.style.height = `${mapHeight}px`;
	canvas.style.zIndex = '9998';
	canvas.style.border = '1px solid rgba(120, 180, 255, 0.35)';
	canvas.style.borderRadius = '6px';
	canvas.style.background = 'rgba(0, 0, 0, 0.68)';
	canvas.style.pointerEvents = 'none';
	canvas.style.imageRendering = 'pixelated';
	canvas.style.display = visible ? 'block' : 'none';
	canvas.style.boxShadow = '0 0 18px rgba(0, 0, 0, 0.45)';

	function getMode(): ClimateDebugModeCombined {
		return DEBUG_MODES[modeIndex];
	}

	function redraw(): void {
		const imageData = context.createImageData(mapWidth, mapHeight);
		const data = imageData.data;

		const normal = new THREE.Vector3();
		const mode = getMode();

		for (let y = 0; y < mapHeight; y++) {
			const v = y / (mapHeight - 1);
			const latitude = (0.5 - v) * Math.PI;

			const cosLatitude = Math.cos(latitude);
			const sinLatitude = Math.sin(latitude);

			for (let x = 0; x < mapWidth; x++) {
				const u = x / (mapWidth - 1);
				const longitude = (u * 2 - 1) * Math.PI;

				normal.set(
					cosLatitude * Math.cos(longitude),
					sinLatitude,
					cosLatitude * Math.sin(longitude),
				);

				const terrainSample = getTerrainSample(normal);

				const climateSample = getClimateSample(
					normal,
					terrainSample.height,
					terrainSample.landMask,
				);

				const color = isWeatherDebugMode(mode)
				              ? getWeatherDebugColor(
						getWeatherSample(normal, climateSample),
						mode,
					)
				              : getClimateDebugColor(
						climateSample,
						mode,
					);

				const index = (x + y * mapWidth) * 4;

				data[index + 0] = color[0];
				data[index + 1] = color[1];
				data[index + 2] = color[2];
				data[index + 3] = 255;
			}
		}

		context.putImageData(imageData, 0, 0);
		drawOverlay();
	}

	function drawOverlay(): void {
		const mode = getMode();

		context.fillStyle = 'rgba(0, 0, 0, 0.62)';
		context.fillRect(0, 0, mapWidth, 20);

		context.font = '11px monospace';
		context.fillStyle = '#d8ecff';
		context.fillText(`Debug: ${mode}`, 8, 14);

		context.fillStyle = 'rgba(0, 0, 0, 0.50)';
		context.fillRect(0, mapHeight - 18, mapWidth, 18);

		context.fillStyle = '#b7d8ff';
		context.fillText('C toggle | V mode', 8, mapHeight - 6);
	}

	function setVisible(nextVisible: boolean): void {
		visible = nextVisible;
		canvas.style.display = visible ? 'block' : 'none';

		if (visible) {
			redraw();
		}
	}

	function toggle(): void {
		setVisible(!visible);
	}

	function cycleMode(): void {
		modeIndex = (modeIndex + 1) % DEBUG_MODES.length;

		if (visible) {
			redraw();
		}
	}

	function setMode(nextMode: ClimateDebugModeCombined): void {
		const nextIndex = DEBUG_MODES.indexOf(nextMode);

		if (nextIndex < 0) {
			return;
		}

		modeIndex = nextIndex;

		if (visible) {
			redraw();
		}
	}

	redraw();

	return {
		canvas,
		redraw,
		toggle,
		cycleMode,
		setVisible,
		setMode,
		getMode,
	};
}

function isWeatherDebugMode(
	mode: ClimateDebugModeCombined,
): mode is WeatherDebugMode {
	return WEATHER_DEBUG_MODES.includes(mode as WeatherDebugMode);
}
