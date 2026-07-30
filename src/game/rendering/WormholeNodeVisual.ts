import * as THREE from 'three';

export type WormholeNodeVisualOwner = 'player' | 'opponent' | 'neutral';

export type WormholeNodeVisualOptions = {
	name: string;
	radius: number;
	owner: WormholeNodeVisualOwner;
	selected?: boolean;
};

export class WormholeNodeVisual {
	public readonly group = new THREE.Group();

	private static sharedTexture: THREE.CanvasTexture | null = null;

	private readonly haloSprite: THREE.Sprite;
	private readonly mainSprite: THREE.Sprite;
	private readonly coreSprite: THREE.Sprite;
	private readonly ringSprite: THREE.Sprite;
	private readonly baseRadius: number;
	private readonly baseColor: THREE.Color;
	private time = Math.random() * Math.PI * 2;
	private selected = false;

	constructor(options: WormholeNodeVisualOptions) {
		this.group.name = options.name;
		this.group.renderOrder = 18;
		this.baseRadius = Math.max(0.75, options.radius);
		this.baseColor = this.resolveColor(options.owner);

		this.haloSprite = this.createSprite(this.baseColor, 0.38, 0.55);
		this.mainSprite = this.createSprite(this.baseColor, 0.92, 0.86);
		this.coreSprite = this.createSprite(new THREE.Color(0xffffff), 0.44, 0.94);
		this.ringSprite = this.createSprite(this.baseColor.clone().offsetHSL(0.02, 0.03, 0.08), 0.72, 0.32);

		this.group.add(this.haloSprite);
		this.group.add(this.mainSprite);
		this.group.add(this.ringSprite);
		this.group.add(this.coreSprite);

		this.haloSprite.material.rotation = Math.random() * Math.PI;
		this.mainSprite.material.rotation = Math.random() * Math.PI;
		this.ringSprite.material.rotation = Math.random() * Math.PI;

		this.setSelected(Boolean(options.selected));
		this.update(0);
	}

	setSelected(selected: boolean): void {
		this.selected = selected;

		this.haloSprite.material.opacity = selected ? 0.60 : 0.38;
		this.mainSprite.material.opacity = selected ? 0.98 : 0.86;
		this.ringSprite.material.opacity = selected ? 0.48 : 0.32;
		this.coreSprite.material.opacity = selected ? 1.0 : 0.94;
	}

	update(deltaSeconds: number): void {
		this.time += deltaSeconds;
		const pulse = 1.0 + Math.sin(this.time * 2.25) * 0.05;
		const drift = 1.0 + Math.cos(this.time * 1.35) * 0.03;
		const selectedBoost = this.selected ? 1.10 : 1.0;
		const size = this.baseRadius * selectedBoost;

		this.haloSprite.scale.setScalar(size * 7.8 * pulse);
		this.mainSprite.scale.setScalar(size * 5.6 * drift);
		this.ringSprite.scale.set(size * 6.8 * pulse, size * 4.7 * pulse, 1);
		this.coreSprite.scale.setScalar(size * 2.1 * pulse);

		this.group.rotation.z += deltaSeconds * 0.08;
		this.mainSprite.material.rotation += deltaSeconds * 0.16;
		this.ringSprite.material.rotation -= deltaSeconds * 0.09;
	}

	dispose(): void {
		for (const child of this.group.children) {
			if (!(child instanceof THREE.Sprite)) {
				continue;
			}

			child.material.dispose();
		}

		this.group.clear();
	}

	private createSprite(
		color: THREE.ColorRepresentation,
		scale: number,
		opacity: number,
	): THREE.Sprite {
		const material = new THREE.SpriteMaterial({
			                                          map: WormholeNodeVisual.getSharedTexture(),
			                                          color,
			                                          transparent: true,
			                                          opacity,
			                                          depthWrite: false,
			                                          depthTest: true,
			                                          blending: THREE.AdditiveBlending,
		                                          });

		const sprite = new THREE.Sprite(material);
		sprite.renderOrder = 18;
		sprite.scale.setScalar(this.baseRadius * scale * 6.0);

		return sprite;
	}

	private resolveColor(owner: WormholeNodeVisualOwner): THREE.Color {
		switch (owner) {
			case 'player':
				return new THREE.Color(0x7fe7ff);
			case 'opponent':
				return new THREE.Color(0xff8b75);
			case 'neutral':
			default:
				return new THREE.Color(0xb9d8ff);
		}
	}

	private static getSharedTexture(): THREE.CanvasTexture {
		if (WormholeNodeVisual.sharedTexture) {
			return WormholeNodeVisual.sharedTexture;
		}

		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 256;

		const context = canvas.getContext('2d');

		if (!context) {
			WormholeNodeVisual.sharedTexture = new THREE.CanvasTexture(canvas);
			return WormholeNodeVisual.sharedTexture;
		}

		const cx = canvas.width * 0.5;
		const cy = canvas.height * 0.5;

		context.clearRect(0, 0, canvas.width, canvas.height);

		const outer = context.createRadialGradient(cx, cy, 0, cx, cy, canvas.width * 0.48);
		outer.addColorStop(0.00, 'rgba(255,255,255,0.98)');
		outer.addColorStop(0.08, 'rgba(170,245,255,0.96)');
		outer.addColorStop(0.22, 'rgba(96,190,255,0.66)');
		outer.addColorStop(0.40, 'rgba(45,95,255,0.28)');
		outer.addColorStop(0.64, 'rgba(32,45,165,0.12)');
		outer.addColorStop(1.00, 'rgba(0,0,0,0.00)');
		context.fillStyle = outer;
		context.fillRect(0, 0, canvas.width, canvas.height);

		for (let index = 0; index < 34; index++) {
			const angle = index * 0.82;
			const radius = 10 + index * 2.0;
			const spread = 10 + index * 0.50;
			const x = cx + Math.cos(angle) * radius;
			const y = cy + Math.sin(angle) * radius * 0.72;

			const puff = context.createRadialGradient(x, y, 0, x, y, spread);
			puff.addColorStop(0.00, 'rgba(210,248,255,0.24)');
			puff.addColorStop(0.52, 'rgba(90,145,255,0.10)');
			puff.addColorStop(1.00, 'rgba(0,0,0,0.00)');
			context.fillStyle = puff;
			context.fillRect(x - spread, y - spread, spread * 2, spread * 2);
		}

		const core = context.createRadialGradient(cx, cy, 0, cx, cy, canvas.width * 0.17);
		core.addColorStop(0.00, 'rgba(255,255,255,1.00)');
		core.addColorStop(0.22, 'rgba(192,248,255,0.96)');
		core.addColorStop(0.58, 'rgba(84,132,255,0.34)');
		core.addColorStop(1.00, 'rgba(0,0,0,0.00)');
		context.fillStyle = core;
		context.fillRect(0, 0, canvas.width, canvas.height);

		WormholeNodeVisual.sharedTexture = new THREE.CanvasTexture(canvas);
		WormholeNodeVisual.sharedTexture.colorSpace = THREE.SRGBColorSpace;
		WormholeNodeVisual.sharedTexture.needsUpdate = true;

		return WormholeNodeVisual.sharedTexture;
	}
}
