export class FpsOverlay {
	private readonly root = document.createElement('div');
	private visible = false;
	private rafId = 0;
	private lastTimestamp = performance.now();
	private accumulatedMs = 0;
	private frames = 0;

	constructor() {
		this.root.style.position = 'fixed';
		this.root.style.top = '58px';
		this.root.style.right = '14px';
		this.root.style.zIndex = '79';
		this.root.style.minWidth = '82px';
		this.root.style.padding = '5px 8px';
		this.root.style.border = '1px solid rgba(143,231,255,0.28)';
		this.root.style.borderRadius = '5px';
		this.root.style.background = 'rgba(3, 11, 18, 0.78)';
		this.root.style.color = '#bfefff';
		this.root.style.font = '11px/1.25 monospace';
		this.root.style.textAlign = 'right';
		this.root.style.pointerEvents = 'none';
		this.root.style.backdropFilter = 'blur(6px)';
		this.root.style.display = 'none';
		this.root.textContent = 'FPS -- · -- ms';
		document.body.appendChild(this.root);
		this.rafId = requestAnimationFrame(this.tick);
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		this.root.style.display = visible ? 'block' : 'none';
		if (visible) {
			this.lastTimestamp = performance.now();
			this.accumulatedMs = 0;
			this.frames = 0;
		}
	}

	dispose(): void {
		cancelAnimationFrame(this.rafId);
		this.root.remove();
	}

	private readonly tick = (timestamp: number): void => {
		this.rafId = requestAnimationFrame(this.tick);

		const deltaMs = Math.max(0, timestamp - this.lastTimestamp);
		this.lastTimestamp = timestamp;

		if (!this.visible) return;

		this.accumulatedMs += deltaMs;
		this.frames++;

		if (this.accumulatedMs < 350) return;

		const averageMs = this.accumulatedMs / Math.max(1, this.frames);
		const fps = averageMs > 0 ? 1000 / averageMs : 0;
		this.root.textContent = `${fps.toFixed(0)} FPS · ${averageMs.toFixed(1)} ms`;
		this.accumulatedMs = 0;
		this.frames = 0;
	};
}
