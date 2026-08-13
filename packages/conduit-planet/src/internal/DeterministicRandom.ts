export type MutableVector3Like = {
	set(x: number, y: number, z: number): MutableVector3Like;
	multiplyScalar(scale: number): MutableVector3Like;
};

export function createMulberry32(seed: number): () => number {
	let state = seed >>> 0;

	return () => {
		state += 0x6d2b79f5;

		let mixed = state;

		mixed = Math.imul(
			mixed ^ (mixed >>> 15),
			mixed | 1,
		);

		mixed ^= mixed + Math.imul(
			mixed ^ (mixed >>> 7),
			mixed | 61,
		);

		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
}

export function setSeededVectorOffset<T extends MutableVector3Like>(
	target: T,
	seed: number,
	scale = 240.0,
): T {
	const normalizedSeed = Math.floor(seed) >>> 0 || 1;
	const random = createMulberry32(normalizedSeed);

	target.set(
		random() * 2 - 1,
		random() * 2 - 1,
		random() * 2 - 1,
	).multiplyScalar(scale);

	return target;
}
