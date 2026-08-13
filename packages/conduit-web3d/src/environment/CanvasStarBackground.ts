export function createStarBackground(): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');

	if (!context) {
		throw new Error('2D context für Sternenhintergrund konnte nicht erstellt werden.');
	}

	canvas.setAttribute('aria-hidden', 'true');

	canvas.style.position = 'fixed';
	canvas.style.inset = '0';
	canvas.style.width = '100%';
	canvas.style.height = '100%';
	canvas.style.zIndex = '0';
	canvas.style.pointerEvents = 'none';
	canvas.style.background = '#02030a';

	function createRandom(seed: number): () => number {
		let state = seed >>> 0;

		return () => {
			state = Math.imul(1664525, state) + 1013904223;

			return ((state >>> 0) / 4294967296);
		};
	}

	function resize(): void {
		const width = window.innerWidth;
		const height = window.innerHeight;
		const dpr = Math.min(window.devicePixelRatio, 2);

		canvas.width = Math.floor(width * dpr);
		canvas.height = Math.floor(height * dpr);

		context.setTransform(dpr, 0, 0, dpr, 0, 0);

		draw(width, height);
	}

	function draw(width: number, height: number): void {
		context.clearRect(0, 0, width, height);

		drawBackground(width, height);
		drawNebula(width, height);
		drawStars(width, height);
		drawBrightStars(width, height);
	}

	function drawBackground(width: number, height: number): void {
		const gradient = context.createRadialGradient(
			width * 0.52,
			height * 0.42,
			0,
			width * 0.50,
			height * 0.50,
			Math.max(width, height) * 0.82,
		);

		gradient.addColorStop(0.0, '#050817');
		gradient.addColorStop(0.45, '#02040d');
		gradient.addColorStop(1.0, '#010208');

		context.fillStyle = gradient;
		context.fillRect(0, 0, width, height);
	}

	function drawNebula(width: number, height: number): void {
		const blueGlow = context.createRadialGradient(
			width * 0.72,
			height * 0.28,
			0,
			width * 0.72,
			height * 0.28,
			Math.max(width, height) * 0.42,
		);

		blueGlow.addColorStop(0.0, 'rgba(45, 90, 180, 0.055)');
		blueGlow.addColorStop(0.48, 'rgba(24, 44, 100, 0.025)');
		blueGlow.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

		context.fillStyle = blueGlow;
		context.fillRect(0, 0, width, height);

		const violetGlow = context.createRadialGradient(
			width * 0.18,
			height * 0.72,
			0,
			width * 0.18,
			height * 0.72,
			Math.max(width, height) * 0.36,
		);

		violetGlow.addColorStop(0.0, 'rgba(90, 55, 140, 0.040)');
		violetGlow.addColorStop(0.55, 'rgba(40, 25, 80, 0.018)');
		violetGlow.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

		context.fillStyle = violetGlow;
		context.fillRect(0, 0, width, height);
	}

	function drawStars(width: number, height: number): void {
		const random = createRandom(0x5eed1234);
		const area = width * height;

		const starCount = Math.floor(area / 3900);

		for (let i = 0; i < starCount; i++) {
			const x = random() * width;
			const y = random() * height;

			const sizeRoll = random();
			const radius = 0.18 + Math.pow(sizeRoll, 2.6) * 0.82;

			const alpha =
				      0.16 +
				      Math.pow(random(), 2.1) * 0.52;

			const colorRoll = random();

			let color = `rgba(255,255,255,${alpha})`;

			if (colorRoll < 0.14) {
				color = `rgba(210,225,255,${alpha})`;
			} else if (colorRoll > 0.92) {
				color = `rgba(255,235,205,${alpha})`;
			}

			context.fillStyle = color;
			context.beginPath();
			context.arc(x, y, radius, 0, Math.PI * 2);
			context.fill();
		}
	}

	function drawBrightStars(width: number, height: number): void {
		const random = createRandom(0xc0ffee42);
		const area = width * height;

		const brightStarCount = Math.max(6, Math.floor(area / 125000));

		for (let i = 0; i < brightStarCount; i++) {
			const x = random() * width;
			const y = random() * height;

			const radius = 0.55 + random() * 1.15;
			const alpha = 0.38 + random() * 0.34;

			const glowRadius = radius * (4.5 + random() * 3.5);

			const glow = context.createRadialGradient(
				x,
				y,
				0,
				x,
				y,
				glowRadius,
			);

			glow.addColorStop(0.0, `rgba(220,235,255,${alpha * 0.38})`);
			glow.addColorStop(0.42, `rgba(120,160,255,${alpha * 0.11})`);
			glow.addColorStop(1.0, 'rgba(0,0,0,0)');

			context.fillStyle = glow;
			context.beginPath();
			context.arc(x, y, glowRadius, 0, Math.PI * 2);
			context.fill();

			context.fillStyle = `rgba(235,245,255,${alpha})`;
			context.beginPath();
			context.arc(x, y, radius, 0, Math.PI * 2);
			context.fill();
		}
	}

	window.addEventListener('resize', resize);

	canvas.addEventListener('force-redraw', resize);

	resize();

	return canvas;
}
