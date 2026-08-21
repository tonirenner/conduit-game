import {
	formatSimulationDateTime,
	SimulationClock,
} from './SimulationClock';

export const simulationClock = new SimulationClock();

const DISPLAY_ID = 'conduit-simulation-clock';

export function startSimulationClockRuntime(): void {
	if (document.getElementById(DISPLAY_ID)) {
		return;
	}

	const display = document.createElement('div');
	display.id = DISPLAY_ID;
	display.style.position = 'fixed';
	display.style.top = '12px';
	display.style.right = '12px';
	display.style.zIndex = '9999';
	display.style.padding = '7px 10px';
	display.style.fontFamily = 'monospace';
	display.style.fontSize = '12px';
	display.style.letterSpacing = '0.04em';
	display.style.color = '#d8ecff';
	display.style.background = 'rgba(0, 0, 0, 0.48)';
	display.style.border = '1px solid rgba(120, 180, 255, 0.32)';
	display.style.borderRadius = '6px';
	display.style.pointerEvents = 'none';
	display.style.backdropFilter = 'blur(4px)';
	document.body.appendChild(display);

	let lastTimestamp: number | null = null;

	const frame = (timestamp: number) => {
		if (lastTimestamp !== null) {
			const realDeltaSeconds = Math.max(0, (timestamp - lastTimestamp) / 1000);
			simulationClock.advance(realDeltaSeconds);
		}

		lastTimestamp = timestamp;
		const snapshot = simulationClock.getSnapshot();
		const scale = Number.isInteger(snapshot.timeScale)
			? snapshot.timeScale.toFixed(0)
			: snapshot.timeScale.toFixed(2);
		const paused = snapshot.paused ? ' | PAUSED' : '';

		display.textContent =
			`SIM ${formatSimulationDateTime(snapshot.dateTime)} | x${scale}${paused}`;

		requestAnimationFrame(frame);
	};

	requestAnimationFrame(frame);
}

startSimulationClockRuntime();
