import type { CubeFace, PatchBounds, TerrainGrid } from '../../TerrainSource';
import type { TerrainSeedConfig } from '../noise';
import {
	serializeCubeFace,
	serializeTerrainSeedConfig,
	terrainGridFromWorkerResult,
	type TerrainWorkerGeometryRequest,
	type TerrainWorkerPatchRequest,
	type TerrainWorkerResponse,
} from './TerrainWorkerProtocol';
import type { TerrainWorkerPoolStats } from './TerrainWorkerPool';

export type TerrainGeometryWorkerPatchJob = {
	face: CubeFace;
	bounds: PatchBounds;
	resolution: number;
	terrainSeedConfig: TerrainSeedConfig;
	geometry?: TerrainWorkerGeometryRequest;
	priority?: number;
	generation?: number;
};

type PendingTask = {
	id: number;
	generation: number;
	priority: number;
	sequence: number;
	request: TerrainWorkerPatchRequest;
	resolve: (grid: TerrainGrid) => void;
	reject: (error: Error) => void;
	settled: boolean;
	discarded: boolean;
};

type WorkerSlot = {
	worker: Worker;
	busyTaskId: number | null;
};

export class TerrainGeometryWorkerPool {
	private readonly slots: WorkerSlot[] = [];
	private readonly pending = new Map<number, PendingTask>();
	private readonly queue: PendingTask[] = [];
	private nextTaskId = 1;
	private nextSequence = 1;
	private generation = 1;
	private completed = 0;
	private discarded = 0;
	private disposed = false;

	static isSupported(): boolean {
		return typeof Worker !== 'undefined';
	}

	constructor(size = getDefaultWorkerCount()) {
		if (!TerrainGeometryWorkerPool.isSupported()) {
			throw new Error('TerrainGeometryWorkerPool requires browser Worker support.');
		}
		for (let index = 0; index < Math.max(1, Math.min(4, size)); index++) {
			this.slots.push(this.createSlot());
		}
	}

	requestPatchGrid(job: TerrainGeometryWorkerPatchJob): Promise<TerrainGrid> {
		if (this.disposed) {
			return Promise.reject(new Error('TerrainGeometryWorkerPool has been disposed.'));
		}

		const id = this.nextTaskId++;
		const generation = job.generation ?? this.generation;
		const request: TerrainWorkerPatchRequest = {
			type: 'build-patch-grid',
			id,
			generation,
			face: serializeCubeFace(job.face),
			bounds: { ...job.bounds },
			resolution: Math.max(1, Math.floor(job.resolution)),
			terrainSeedConfig: serializeTerrainSeedConfig(job.terrainSeedConfig),
			geometry: job.geometry,
		};

		return new Promise<TerrainGrid>((resolve, reject) => {
			const task: PendingTask = {
				id,
				generation,
				priority: job.priority ?? 0,
				sequence: this.nextSequence++,
				request,
				resolve,
				reject,
				settled: false,
				discarded: false,
			};
			this.pending.set(id, task);
			this.queue.push(task);
			this.sortQueue();
			this.pump();
		});
	}

	invalidate(): number {
		if (this.disposed) return this.generation;
		this.generation++;

		for (const task of this.pending.values()) {
			if (task.generation >= this.generation || task.settled) continue;
			task.discarded = true;
			task.settled = true;
			task.reject(new Error('Terrain geometry worker job invalidated.'));
			this.discarded++;
		}

		for (let index = this.queue.length - 1; index >= 0; index--) {
			const task = this.queue[index];
			if (!task.discarded) continue;
			this.queue.splice(index, 1);
			this.pending.delete(task.id);
		}
		return this.generation;
	}

	getStats(): TerrainWorkerPoolStats {
		return {
			size: this.slots.length,
			busy: this.slots.reduce((count, slot) => count + (slot.busyTaskId === null ? 0 : 1), 0),
			queued: this.queue.length,
			generation: this.generation,
			completed: this.completed,
			discarded: this.discarded,
		};
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const task of this.pending.values()) {
			if (!task.settled) {
				task.settled = true;
				task.reject(new Error('TerrainGeometryWorkerPool disposed.'));
			}
		}
		this.pending.clear();
		this.queue.length = 0;
		for (const slot of this.slots) slot.worker.terminate();
		this.slots.length = 0;
	}

	private createSlot(): WorkerSlot {
		const slot: WorkerSlot = {
			worker: createTerrainWorker(),
			busyTaskId: null,
		};
		this.bindWorker(slot);
		return slot;
	}

	private bindWorker(slot: WorkerSlot): void {
		slot.worker.onmessage = (event: MessageEvent<TerrainWorkerResponse>) => {
			this.handleWorkerMessage(slot, event.data);
		};
		slot.worker.onerror = (event: ErrorEvent) => {
			this.handleWorkerFailure(slot, new Error(event.message || 'Terrain geometry worker failed.'));
		};
	}

	private handleWorkerMessage(slot: WorkerSlot, response: TerrainWorkerResponse): void {
		const task = this.pending.get(response.id);
		slot.busyTaskId = null;
		if (!task) {
			this.pump();
			return;
		}
		this.pending.delete(task.id);

		if (task.discarded || response.generation !== task.generation) {
			this.pump();
			return;
		}
		if (response.type === 'error') {
			if (!task.settled) {
				task.settled = true;
				task.reject(new Error(response.message));
			}
			this.pump();
			return;
		}
		if (!task.settled) {
			task.settled = true;
			task.resolve(terrainGridFromWorkerResult(response));
			this.completed++;
		}
		this.pump();
	}

	private handleWorkerFailure(slot: WorkerSlot, error: Error): void {
		const failedTaskId = slot.busyTaskId;
		slot.busyTaskId = null;
		if (failedTaskId !== null) {
			const task = this.pending.get(failedTaskId);
			if (task) {
				this.pending.delete(failedTaskId);
				if (!task.settled) {
					task.settled = true;
					task.reject(error);
				}
			}
		}
		if (!this.disposed) {
			slot.worker.terminate();
			slot.worker = createTerrainWorker();
			this.bindWorker(slot);
		}
		this.pump();
	}

	private pump(): void {
		if (this.disposed) return;
		for (const slot of this.slots) {
			if (slot.busyTaskId !== null) continue;
			let task = this.queue.shift();
			while (task?.discarded) {
				this.pending.delete(task.id);
				task = this.queue.shift();
			}
			if (!task) return;
			slot.busyTaskId = task.id;
			slot.worker.postMessage(task.request);
		}
	}

	private sortQueue(): void {
		this.queue.sort((a, b) => a.priority !== b.priority ? b.priority - a.priority : a.sequence - b.sequence);
	}
}

function getDefaultWorkerCount(): number {
	if (typeof navigator === 'undefined') return 2;
	const concurrency = Math.max(2, navigator.hardwareConcurrency || 4);
	return Math.max(1, Math.min(4, concurrency - 1));
}

function createTerrainWorker(): Worker {
	const workerUrl = new URL('terrain-patch-grid-worker.js', document.baseURI);
	return new Worker(workerUrl, {
		type: 'module',
		name: 'conduit-terrain-geometry',
	});
}
