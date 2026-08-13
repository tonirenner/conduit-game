export class SeededRandom {
	private state: number;

	constructor(seed: number) {
		this.state = seed >>> 0;

		if (this.state === 0) {
			this.state = 0x6d2b79f5;
		}
	}

	next(): number {
		let t = this.state += 0x6d2b79f5;

		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	int(min: number, max: number): number {
		return Math.floor(
			this.range(min, max + 1),
		);
	}

	range(min: number, max: number): number {
		return min + (max - min) * this.next();
	}

	chance(probability: number): boolean {
		return this.next() < probability;
	}

	pick<T>(items: T[]): T {
		return items[
			Math.floor(this.next() * items.length)
		];
	}

	childSeed(): number {
		return this.int(1, 2_147_483_647);
	}
}
