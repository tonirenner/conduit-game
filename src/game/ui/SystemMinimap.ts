import * as THREE from 'three';
import type {
	FactionId,
	OrbitalStationType,
} from '../model/GameWorld';

export type MinimapPointKind =
	| 'planet'
	| 'station'
	| 'ship'
	| 'wormhole';

export type MinimapPoint = {
	id: string;
	kind: MinimapPointKind;
	x: number;
	z: number;
	factionId?: FactionId;
	stationType?: OrbitalStationType;
	selected?: boolean;
	size?: number;
};

export type MinimapViewport = {
	x: number;
	z: number;
	width: number;
	height: number;
	rotationRadians?: number;
};

export type SystemMinimapData = {
	title: string;
	points: MinimapPoint[];
	viewport: MinimapViewport;
	center: {
		x: number;
		z: number;
	};
	worldHalfExtent: number;
};

export type SystemMinimapOptions = {
	onNavigate: (renderX: number, renderZ: number) => void;
};

export class SystemMinimap {
	private readonly root: HTMLDivElement;
	private readonly header: HTMLDivElement;
	private readonly canvas: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D;
	private visible = false;
	private data: SystemMinimapData | null = null;
	private lastSignature = '';

	constructor(
		private readonly options: SystemMinimapOptions,
	) {
		this.root = document.createElement('div');
		this.header = document.createElement('div');
		this.canvas = document.createElement('canvas');

		const context = this.canvas.getContext('2d');

		if (!context) {
			throw new Error('SystemMinimap requires Canvas2D.');
		}

		this.context = context;
		this.configureDom();
		this.bindInput();
		document.body.appendChild(this.root);
	}

	setVisible(visible: boolean): void {
		if (this.visible === visible) {
			return;
		}

		this.visible = visible;
		this.root.style.display = visible ? 'block' : 'none';
	}

	setData(data: SystemMinimapData): void {
		this.data = data;
		this.header.textContent = data.title;

		const signature = this.createSignature(data);

		if (signature === this.lastSignature) {
			return;
		}

		this.lastSignature = signature;
		this.draw();
	}

	dispose(): void {
		this.root.remove();
	}

	private configureDom(): void {
		const rootStyle = this.root.style;

		rootStyle.position = 'fixed';
		rootStyle.right = '14px';
		rootStyle.bottom = '14px';
		rootStyle.zIndex = '38';
		rootStyle.width = '230px';
		rootStyle.height = '230px';
		rootStyle.padding = '7px';
		rootStyle.border = '1px solid rgba(143,231,255,0.36)';
		rootStyle.borderRadius = '8px';
		rootStyle.background = 'rgba(3, 11, 18, 0.90)';
		rootStyle.backdropFilter = 'blur(8px)';
		rootStyle.boxShadow = '0 10px 30px rgba(0,0,0,0.34)';
		rootStyle.pointerEvents = 'auto';
		rootStyle.userSelect = 'none';
		rootStyle.display = 'none';

		const headerStyle = this.header.style;

		headerStyle.height = '18px';
		headerStyle.padding = '0 2px 5px';
		headerStyle.color = '#9beaff';
		headerStyle.font = '10px/18px monospace';
		headerStyle.letterSpacing = '0.04em';
		headerStyle.whiteSpace = 'nowrap';
		headerStyle.overflow = 'hidden';
		headerStyle.textOverflow = 'ellipsis';

		this.canvas.width = 216;
		this.canvas.height = 198;

		const canvasStyle = this.canvas.style;

		canvasStyle.display = 'block';
		canvasStyle.width = '216px';
		canvasStyle.height = '198px';
		canvasStyle.borderRadius = '5px';
		canvasStyle.cursor = 'crosshair';
		canvasStyle.background = 'rgba(4,14,24,0.94)';

		this.root.appendChild(this.header);
		this.root.appendChild(this.canvas);
	}

	private bindInput(): void {
		this.canvas.addEventListener('pointerdown', (event) => {
			if (!this.data || event.button !== 0) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();

			const rect = this.canvas.getBoundingClientRect();
			const normalizedX =
				(event.clientX - rect.left) / Math.max(1, rect.width);
			const normalizedY =
				(event.clientY - rect.top) / Math.max(1, rect.height);

			const worldX = this.minimapToWorldX(normalizedX);
			const worldZ = this.minimapToWorldZ(normalizedY);

			this.options.onNavigate(worldX, worldZ);
		});
	}

	private draw(): void {
		if (!this.data) {
			return;
		}

		const ctx = this.context;
		const width = this.canvas.width;
		const height = this.canvas.height;

		ctx.clearRect(0, 0, width, height);

		const gradient = ctx.createRadialGradient(
			width * 0.5,
			height * 0.5,
			4,
			width * 0.5,
			height * 0.5,
			Math.max(width, height) * 0.68,
		);

		gradient.addColorStop(0, 'rgba(13,35,54,0.96)');
		gradient.addColorStop(1, 'rgba(2,8,15,0.98)');

		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);

		this.drawGrid(ctx, width, height);

		for (const point of this.data.points) {
			this.drawPoint(ctx, point);
		}

		this.drawViewport(ctx);

		ctx.strokeStyle = 'rgba(143,231,255,0.26)';
		ctx.lineWidth = 1;
		ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
	}

	private drawGrid(
		ctx: CanvasRenderingContext2D,
		width: number,
		height: number,
	): void {
		ctx.save();
		ctx.strokeStyle = 'rgba(143,231,255,0.08)';
		ctx.lineWidth = 1;

		for (let index = 1; index < 4; index++) {
			const x = (width / 4) * index;
			const y = (height / 4) * index;

			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
			ctx.stroke();

			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(width, y);
			ctx.stroke();
		}

		ctx.restore();
	}

	private drawPoint(
		ctx: CanvasRenderingContext2D,
		point: MinimapPoint,
	): void {
		const x = this.worldToCanvasX(point.x);
		const y = this.worldToCanvasY(point.z);
		const size = point.size ?? this.getPointSize(point);

		ctx.save();

		switch (point.kind) {
			case 'planet':
				ctx.fillStyle = 'rgba(174,209,255,0.86)';
				ctx.beginPath();
				ctx.arc(x, y, size, 0, Math.PI * 2);
				ctx.fill();
				break;

			case 'wormhole':
				ctx.strokeStyle = 'rgba(177,121,255,0.96)';
				ctx.lineWidth = point.selected ? 2.2 : 1.5;
				ctx.beginPath();
				ctx.arc(x, y, size + 1.5, 0, Math.PI * 2);
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(x, y, Math.max(1, size - 1.5), 0, Math.PI * 2);
				ctx.stroke();
				break;

			case 'station':
				ctx.fillStyle =
					point.factionId === 'opponent'
						? 'rgba(255,110,99,0.96)'
						: 'rgba(119,235,255,0.96)';

				ctx.fillRect(
					x - size,
					y - size,
					size * 2,
					size * 2,
				);
				break;

			case 'ship':
				ctx.fillStyle =
					point.factionId === 'opponent'
						? 'rgba(255,92,83,0.98)'
						: point.factionId === 'neutral'
							? 'rgba(190,190,190,0.88)'
							: 'rgba(99,255,176,0.98)';

				ctx.beginPath();
				ctx.moveTo(x, y - size - 1);
				ctx.lineTo(x + size, y + size);
				ctx.lineTo(x - size, y + size);
				ctx.closePath();
				ctx.fill();
				break;
		}

		if (point.selected) {
			ctx.strokeStyle = 'rgba(255,255,255,0.94)';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.arc(x, y, size + 4, 0, Math.PI * 2);
			ctx.stroke();
		}

		ctx.restore();
	}

	private drawViewport(ctx: CanvasRenderingContext2D): void {
		if (!this.data) {
			return;
		}

		const viewport = this.data.viewport;
		const centerX = this.worldToCanvasX(viewport.x);
		const centerY = this.worldToCanvasY(viewport.z);
		const pxPerWorldX =
			this.canvas.width / (this.data.worldHalfExtent * 2);
		const pxPerWorldY =
			this.canvas.height / (this.data.worldHalfExtent * 2);

		const width = Math.max(12, viewport.width * pxPerWorldX);
		const height = Math.max(9, viewport.height * pxPerWorldY);

		ctx.save();
		ctx.translate(centerX, centerY);
		ctx.rotate(-(viewport.rotationRadians ?? 0));
		ctx.strokeStyle = 'rgba(255,255,255,0.72)';
		ctx.lineWidth = 1;
		ctx.setLineDash([4, 3]);
		ctx.strokeRect(
			-width * 0.5,
			-height * 0.5,
			width,
			height,
		);
		ctx.restore();
	}

	private getPointSize(point: MinimapPoint): number {
		switch (point.kind) {
			case 'planet':
				return 3.6;
			case 'wormhole':
				return 3.2;
			case 'station':
				return 3.2;
			case 'ship':
				return 2.5;
		}
	}

	private worldToCanvasX(worldX: number): number {
		if (!this.data) {
			return 0;
		}

		const normalized =
			(worldX - this.data.center.x) /
				(this.data.worldHalfExtent * 2) +
			0.5;

		return THREE.MathUtils.clamp(normalized, 0, 1) * this.canvas.width;
	}

	private worldToCanvasY(worldZ: number): number {
		if (!this.data) {
			return 0;
		}

		const normalized =
			(worldZ - this.data.center.z) /
				(this.data.worldHalfExtent * 2) +
			0.5;

		return (1 - THREE.MathUtils.clamp(normalized, 0, 1)) * this.canvas.height;
	}

	private minimapToWorldX(normalizedX: number): number {
		if (!this.data) {
			return 0;
		}

		return (
			this.data.center.x +
			(normalizedX - 0.5) *
				this.data.worldHalfExtent *
				2
		);
	}

	private minimapToWorldZ(normalizedY: number): number {
		if (!this.data) {
			return 0;
		}

		return (
			this.data.center.z +
			(0.5 - normalizedY) *
				this.data.worldHalfExtent *
				2
		);
	}

	private createSignature(data: SystemMinimapData): string {
		return [
			data.title,
			data.worldHalfExtent.toFixed(2),
			data.viewport.x.toFixed(1),
			data.viewport.z.toFixed(1),
			data.viewport.width.toFixed(1),
			data.viewport.height.toFixed(1),
			data.viewport.rotationRadians?.toFixed(2) ?? '0',
			...data.points.map((point) => (
				[
					point.id,
					point.kind,
					point.x.toFixed(1),
					point.z.toFixed(1),
					point.factionId ?? '',
					point.selected ? '1' : '0',
				].join(':')
			)),
		].join('|');
	}
}
