export function installTestCanvasDocument(): () => void {
	const originalDescriptor = Object.getOwnPropertyDescriptor(
		globalThis,
		'document',
	);
	const gradient = {
		addColorStop: () => undefined,
	} as unknown as CanvasGradient;

	Object.defineProperty(globalThis, 'document', {
		configurable: true,
		value: {
			createElement: (tagName: string) => {
				if (tagName !== 'canvas') {
					throw new Error(`Unexpected element request: ${tagName}`);
				}

				const context = {
					clearRect: () => undefined,
					createRadialGradient: () => gradient,
					fillRect: () => undefined,
					fillStyle: '',
				} as unknown as CanvasRenderingContext2D;

				return {
					width: 0,
					height: 0,
					getContext: () => context,
				} as unknown as HTMLCanvasElement;
			},
		},
	});

	return () => {
		if (originalDescriptor) {
			Object.defineProperty(
				globalThis,
				'document',
				originalDescriptor,
			);
			return;
		}

		Reflect.deleteProperty(globalThis, 'document');
	};
}
