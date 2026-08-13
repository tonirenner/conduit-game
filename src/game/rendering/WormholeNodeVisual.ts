import { PortalSpriteEffect } from '@conduit/web3d/effects';

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

export class WormholeNodeVisual extends PortalSpriteEffect {
	constructor(options: WormholeNodeVisualOptions) {
		const palette = getWormholePalette(options.owner);

		super({
			name: options.name,
			radius: options.radius,
			color: palette.color,
			accent: palette.accent,
			selected: options.selected,
		});
	}
}

function getWormholePalette(owner?: WormholeOwner): {
	color: number;
	accent: number;
} {
	if (owner === 'opponent' || owner === 'enemy') {
		return {
			color: 0xff6f9a,
			accent: 0xffb071,
		};
	}

	if (owner === 'neutral') {
		return {
			color: 0xb9d8ff,
			accent: 0xffffff,
		};
	}

	return {
		color: 0x65dfff,
		accent: 0xc8fbff,
	};
}
