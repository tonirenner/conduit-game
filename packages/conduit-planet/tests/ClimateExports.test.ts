import { describe, expect, test } from 'bun:test';

import {
	CLIMATE_DEBUG_MODES,
	WEATHER_DEBUG_MODES,
	getClimateDebugColor,
	getClimateSample,
	getWeatherDebugColor,
	getWeatherSample,
} from '@conduit/planet/climate';

describe('@conduit/planet/climate', () => {
	test('exports both climate and weather APIs', () => {
		expect(CLIMATE_DEBUG_MODES.length).toBeGreaterThan(0);
		expect(WEATHER_DEBUG_MODES.length).toBeGreaterThan(0);
		expect(getClimateSample).toBeFunction();
		expect(getClimateDebugColor).toBeFunction();
		expect(getWeatherSample).toBeFunction();
		expect(getWeatherDebugColor).toBeFunction();
	});
});
