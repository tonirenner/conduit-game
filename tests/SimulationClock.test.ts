import { describe, expect, test } from 'bun:test';
import {
	formatSimulationDateTime,
	SIMULATION_EPOCH_ISO,
	SimulationClock,
} from '../src/game/simulation/SimulationClock';

describe('SimulationClock', () => {
	test('starts at the canonical 3030 epoch', () => {
		const clock = new SimulationClock();

		expect(clock.getDateTime().toISOString()).toBe(SIMULATION_EPOCH_ISO);
		expect(formatSimulationDateTime(clock.getDateTime())).toBe('01.01.3030 00:00:00');
	});

	test('advances simulation time at the configured time scale', () => {
		const clock = new SimulationClock();
		clock.setTimeScale(60);
		clock.advance(2);

		expect(clock.getElapsedSeconds()).toBe(120);
		expect(formatSimulationDateTime(clock.getDateTime())).toBe('01.01.3030 00:02:00');
	});

	test('can pause and resume without losing elapsed time', () => {
		const clock = new SimulationClock();
		clock.advance(10);
		clock.pause();
		clock.advance(25);
		expect(clock.getElapsedSeconds()).toBe(10);

		clock.resume();
		clock.advance(5);
		expect(clock.getElapsedSeconds()).toBe(15);
	});

	test('converts elapsed simulation seconds into calendar date and time', () => {
		const clock = new SimulationClock();
		clock.setElapsedSeconds(86_400 + 3_661);

		expect(formatSimulationDateTime(clock.getDateTime())).toBe('02.01.3030 01:01:01');
	});

	test('provides normalized cycle phases for future orbital and seasonal consumers', () => {
		const clock = new SimulationClock();
		clock.setElapsedSeconds(75);

		expect(clock.getCyclePhase(100)).toBeCloseTo(0.75, 12);
		expect(clock.getCyclePhase(100, 0.5)).toBeCloseTo(0.25, 12);
	});
});
