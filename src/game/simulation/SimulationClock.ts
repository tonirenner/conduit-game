export const SIMULATION_EPOCH_ISO = '3030-01-01T00:00:00.000Z';

const SIMULATION_EPOCH_MS = Date.parse(SIMULATION_EPOCH_ISO);

export type SimulationClockSnapshot = {
	elapsedSeconds: number;
	dateTime: Date;
	timeScale: number;
	paused: boolean;
};

export class SimulationClock {
	private elapsedSeconds = 0;
	private timeScale = 1;
	private paused = false;

	advance(realDeltaSeconds: number): void {
		if (this.paused) {
			return;
		}

		if (!Number.isFinite(realDeltaSeconds) || realDeltaSeconds < 0) {
			throw new Error('SimulationClock.advance() expects a finite non-negative delta.');
		}

		this.elapsedSeconds += realDeltaSeconds * this.timeScale;
	}

	setElapsedSeconds(value: number): void {
		if (!Number.isFinite(value) || value < 0) {
			throw new Error('Simulation elapsed time must be finite and non-negative.');
		}

		this.elapsedSeconds = value;
	}

	getElapsedSeconds(): number {
		return this.elapsedSeconds;
	}

	setTimeScale(value: number): void {
		if (!Number.isFinite(value) || value < 0) {
			throw new Error('Simulation time scale must be finite and non-negative.');
		}

		this.timeScale = value;
	}

	getTimeScale(): number {
		return this.timeScale;
	}

	pause(): void {
		this.paused = true;
	}

	resume(): void {
		this.paused = false;
	}

	togglePaused(): boolean {
		this.paused = !this.paused;
		return this.paused;
	}

	isPaused(): boolean {
		return this.paused;
	}

	getDateTime(): Date {
		return new Date(SIMULATION_EPOCH_MS + this.elapsedSeconds * 1000);
	}

	getCyclePhase(periodSeconds: number, phaseOffset = 0): number {
		if (!Number.isFinite(periodSeconds) || periodSeconds <= 0) {
			throw new Error('Simulation cycle period must be finite and greater than zero.');
		}

		const phase = this.elapsedSeconds / periodSeconds + phaseOffset;
		return ((phase % 1) + 1) % 1;
	}

	getSnapshot(): SimulationClockSnapshot {
		return {
			elapsedSeconds: this.elapsedSeconds,
			dateTime: this.getDateTime(),
			timeScale: this.timeScale,
			paused: this.paused,
		};
	}
}

export function formatSimulationDateTime(date: Date): string {
	const day = pad2(date.getUTCDate());
	const month = pad2(date.getUTCMonth() + 1);
	const year = String(date.getUTCFullYear()).padStart(4, '0');
	const hour = pad2(date.getUTCHours());
	const minute = pad2(date.getUTCMinutes());
	const second = pad2(date.getUTCSeconds());

	return `${day}.${month}.${year} ${hour}:${minute}:${second}`;
}

function pad2(value: number): string {
	return String(value).padStart(2, '0');
}
