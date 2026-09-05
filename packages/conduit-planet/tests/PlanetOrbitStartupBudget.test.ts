import { describe, expect, test } from 'bun:test';
import { ORBIT_TERRAIN_VOLUME_RESOLUTION } from '../src/rendering/orbit/OrbitTerrainVolume';

describe('OrbitView startup budget', () => {
	test('keeps synchronous terrain LUT sampling within the immediate-focus budget', () => {
		const sampleCount = ORBIT_TERRAIN_VOLUME_RESOLUTION ** 3;

		expect(ORBIT_TERRAIN_VOLUME_RESOLUTION).toBeLessThanOrEqual(32);
		expect(sampleCount).toBeLessThanOrEqual(32_768);
	});
});
