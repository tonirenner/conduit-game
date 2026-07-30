import * as THREE from 'three';

export type WormholeOwner =
	| 'player'
	| 'opponent'
	| 'enemy'
	| 'neutral';

export type WormholeNodeVisualOptions = {
	name: string;
	radius: number;
	owner?: WormholeOwner;
	selected?: boolean;
};

export class WormholeNodeVisual {
	public readonly group = new THREE.Group();

	private readonly halo: THREE.Sprite;
	private readonly core: THREE.Sprite;
	private readonly swirl: THREE.Sprite;
	private readonly baseScale: number;
	private selected = false;
	private time = 0;

	private readonly materials: THREE.SpriteMaterial[] = [];
	private readonly textures: THREE.Texture[] = [];

	constructor(options: WormholeNodeVisualOptions) {
		const color = this.getOwnerColor(options.owner);
		const accent = this.getOwnerAccent(options.owner);

		this.group.name = options.name;
		this.baseScale = Math.max(2.0, options.radius * 5.8);
		this.selected = options.selected ?? false;

		this.halo = this.createSprite(
			this.createHaloTexture(color),
			color,
			0.42,
			this.baseScale * 1.65,
		);
		this.halo.name = `${options.name} Halo`;
		this.halo.renderOrder = 32;

		this.swirl = this.createSprite(
			this.createSwirlTexture(color, accent),
			color,
			0.92,
			this.baseScale,
		);
		this.swirl.name = `${options.name} Swirl`;
		this.swirl.renderOrder = 34;

		this.core = this.createSprite(
			this.createCoreTexture(accent),
			accent,
			0.96,
			this.baseScale * 0.46,
		);
		this.core.name = `${options.name} Core`;
		this.core.renderOrder = 36;

		this.group.add(this.halo);
		this.group.add(this.swirl);
		this.group.add(this.core);
		this.applySelectedState();
	}

	setSelected(selected: boolean): void {
		if (this.selected === selected) {
			return;
		}

		this.selected = selected;
		this.applySelectedState();
	}

	update(deltaSeconds: number): void {
		this.time += deltaSeconds;

		const pulse =
			      1.0 +
			      Math.sin(this.time * 2.4) * (this.selected ? 0.085 : 0.045);

		this.halo.scale.setScalar(this.baseScale * 1.65 * pulse);
		this.swirl.scale.setScalar(this.baseScale * (1.0 + Math.sin(this.time * 3.1) * 0.035));
		this.core.scale.setScalar(this.baseScale * 0.46 * (1.0 + Math.sin(this.time * 4.7) * 0.065));

		this.halo.material.rotation -= deltaSeconds * 0.16;
		this.swirl.material.rotation += deltaSeconds * 0.38;
		this.core.material.rotation -= deltaSeconds * 0.22;
	}

	dispose(): void {
		for (const material of this.materials) {
			material.dispose();
		}

		for (const texture of this.textures) {
			texture.dispose();
		}
	}

	private applySelectedState(): void {
		this.halo.material.opacity = this.selected ? 0.62 : 0.38;
		this.swirl.material.opacity = this.selected ? 1.0 : 0.86;
		this.core.material.opacity = this.selected ? 1.0 : 0.92;
	}

	private createSprite(
		texture: THREE.Texture,
		color: THREE.Color,
		opacity: number,
		scale: number,
	): THREE.Sprite {
		const material = new THREE.SpriteMaterial({
			                                          map: texture,
			                                          color,
			                                          transparent: true,
			                                          opacity,
			                                          depthWrite: false,
			                                          depthTest: true,
			                                          blending: THREE.AdditiveBlending,
		                                          });

		const sprite = new THREE.Sprite(material);

		sprite.scale.setScalar(scale);

		this.materials.push(material);
		this.textures.push(texture);

		return sprite;
	}

	private createHaloTexture(color: THREE.Color): THREE.CanvasTexture {
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 256;

		const context = canvas.getContext('2d');

		if (!context) {
			return new THREE.CanvasTexture(canvas);
		}

		const r = Math.round(color.r * 255);
		const g = Math.round(color.g * 255);
		const b = Math.round(color.b * 255);
		const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 126);

		gradient.addColorStop(0.00, `rgba(255,255,255,0.60)`);
		gradient.addColorStop(0.18, `rgba(${r},${g},${b},0.42)`);
		gradient.addColorStop(0.48, `rgba(${r},${g},${b},0.16)`);
		gradient.addColorStop(1.00, `rgba(0,0,0,0)`);

		context.fillStyle = gradient;
		context.fillRect(0, 0, 256, 256);

		return this.finishTexture(canvas);
	}

	private createCoreTexture(color: THREE.Color): THREE.CanvasTexture {
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 256;

		const context = canvas.getContext('2d');

		if (!context) {
			return new THREE.CanvasTexture(canvas);
		}

		const r = Math.round(color.r * 255);
		const g = Math.round(color.g * 255);
		const b = Math.round(color.b * 255);
		const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 92);

		gradient.addColorStop(0.00, `rgba(255,255,255,1.0)`);
		gradient.addColorStop(0.22, `rgba(${r},${g},${b},0.95)`);
		gradient.addColorStop(0.58, `rgba(${r},${g},${b},0.34)`);
		gradient.addColorStop(1.00, `rgba(0,0,0,0)`);

		context.fillStyle = gradient;
		context.fillRect(0, 0, 256, 256);

		return this.finishTexture(canvas);
	}

	private createSwirlTexture(
		color: THREE.Color,
		accent: THREE.Color,
	): THREE.CanvasTexture {
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 256;

		const context = canvas.getContext('2d');

		if (!context) {
			return new THREE.CanvasTexture(canvas);
		}

		const main = this.toRgb(color);
		const bright = this.toRgb(accent);
		const outer = context.createRadialGradient(128, 128, 0, 128, 128, 126);

		outer.addColorStop(0.00, `rgba(255,255,255,0.92)`);
		outer.addColorStop(0.16, `rgba(${bright},0.78)`);
		outer.addColorStop(0.38, `rgba(${main},0.34)`);
		outer.addColorStop(0.74, `rgba(${main},0.12)`);
		outer.addColorStop(1.00, `rgba(0,0,0,0)`);

		context.fillStyle = outer;
		context.fillRect(0, 0, 256, 256);

		for (let index = 0; index < 64; index++) {
			const angle = index * 0.72;
			const radius = 8 + index * 1.72;
			const x = 128 + Math.cos(angle) * radius;
			const y = 128 + Math.sin(angle) * radius * 0.74;
			const spread = 9 + index * 0.38;
			const puff = context.createRadialGradient(x, y, 0, x, y, spread);

			puff.addColorStop(0.00, `rgba(255,255,255,0.22)`);
			puff.addColorStop(0.36, `rgba(${bright},0.18)`);
			puff.addColorStop(1.00, `rgba(0,0,0,0)`);

			context.fillStyle = puff;
			context.fillRect(x - spread, y - spread, spread * 2, spread * 2);
		}

		return this.finishTexture(canvas);
	}

	private finishTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
		const texture = new THREE.CanvasTexture(canvas);

		texture.colorSpace = THREE.SRGBColorSpace;
		texture.needsUpdate = true;

		return texture;
	}

	private getOwnerColor(owner?: WormholeOwner): THREE.Color {
		if (owner === 'opponent' || owner === 'enemy') {
			return new THREE.Color(0xff6f9a);
		}

		if (owner === 'neutral') {
			return new THREE.Color(0xb9d8ff);
		}

		return new THREE.Color(0x65dfff);
	}

	private getOwnerAccent(owner?: WormholeOwner): THREE.Color {
		if (owner === 'opponent' || owner === 'enemy') {
			return new THREE.Color(0xffb071);
		}

		if (owner === 'neutral') {
			return new THREE.Color(0xffffff);
		}

		return new THREE.Color(0xc8fbff);
	}

	private toRgb(color: THREE.Color): string {
		return `${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)}`;
	}
}
