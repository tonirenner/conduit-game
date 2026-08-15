import * as THREE from 'three';
import {
	PlanetInstancedCubeSphereDebug as PlanetInstancedCubeSphereDebugV11,
	type PlanetInstancedColorMode,
	type PlanetInstancedCubeSphereStats as PlanetInstancedCubeSphereStatsV11,
} from './PlanetInstancedCubeSphereDebugV11';

export type { PlanetInstancedColorMode };

export type PlanetInstancedCubeSphereStats = PlanetInstancedCubeSphereStatsV11 & {
	renderedSources: number;
	sourceLimit: number | null;
};

type GpuStateRuntime = {
	root: THREE.Group;
};

type V7Runtime = {
	activeState: GpuStateRuntime | null;
};

const SOURCE_LIMIT_OPTIONS = [512, 256, 128, 64, 32] as const;

/**
 * Feature-Lab v12: instance/source-count isolation.
 *
 * The v11 topology, atlas and stitch groups remain untouched. This version
 * changes only InstancedBufferGeometry.instanceCount on the already-built draw
 * meshes, allowing GPU vertex/triangle cost to be measured without triggering
 * a topology or atlas rebuild.
 */
export class PlanetInstancedCubeSphereDebug extends PlanetInstancedCubeSphereDebugV11 {
	private sourceLimit: number | null = null;
	private sourceControlLabel: HTMLLabelElement | null = null;

	setRenderedSourceLimit(limit: number | null): void {
		const next = limit == null || !Number.isFinite(limit)
			? null
			: Math.max(1, Math.floor(limit));
		if (this.sourceLimit === next) return;
		this.sourceLimit = next;
		this.applySourceLimit();
		this.syncSourceControlValue();
	}

	override update(terrain: THREE.Object3D): void {
		super.update(terrain);
		this.applySourceLimit();
		this.ensureSourceIsolationControl();
	}

	override detach(): void {
		this.removeSourceIsolationControl();
		this.restoreFullInstanceCounts();
		super.detach();
	}

	override getStats(): PlanetInstancedCubeSphereStats {
		const base = super.getStats();
		const root = (this as unknown as V7Runtime).activeState?.root;
		let renderedSources = 0;

		for (const child of root?.children ?? []) {
			if (!child.visible || !(child instanceof THREE.Mesh)) continue;
			if (!(child.geometry instanceof THREE.InstancedBufferGeometry)) continue;
			renderedSources += Math.max(0, child.geometry.instanceCount);
		}

		return {
			...base,
			renderedSources,
			sourceLimit: this.sourceLimit,
		};
	}

	private applySourceLimit(): void {
		const root = (this as unknown as V7Runtime).activeState?.root;
		if (!root) return;

		let remaining = this.sourceLimit ?? Number.POSITIVE_INFINITY;

		for (const child of root.children) {
			if (!(child instanceof THREE.Mesh)) continue;
			if (!(child.geometry instanceof THREE.InstancedBufferGeometry)) continue;

			const fullCount = getFullInstanceCount(child.geometry);

			// v11 remains authoritative for stitch-group visibility. Hidden groups
			// do not consume the source budget and retain their full count so they
			// are ready if the stitch-group isolation control changes next frame.
			if (!child.visible) {
				child.geometry.instanceCount = fullCount;
				continue;
			}

			const count = Number.isFinite(remaining)
				? Math.max(0, Math.min(fullCount, Math.floor(remaining)))
				: fullCount;
			child.geometry.instanceCount = count;

			if (Number.isFinite(remaining)) remaining -= count;
		}
	}

	private restoreFullInstanceCounts(): void {
		const root = (this as unknown as V7Runtime).activeState?.root;
		if (!root) return;

		for (const child of root.children) {
			if (!(child instanceof THREE.Mesh)) continue;
			if (!(child.geometry instanceof THREE.InstancedBufferGeometry)) continue;
			child.geometry.instanceCount = getFullInstanceCount(child.geometry);
		}
	}

	private ensureSourceIsolationControl(): void {
		if (this.sourceControlLabel && !this.sourceControlLabel.isConnected) {
			this.sourceControlLabel = null;
		}
		if (this.sourceControlLabel) return;

		const stitchSelect = document.querySelector<HTMLSelectElement>(
			'[data-instanced-stitch-limit-select-v11]',
		);
		const colorSelect = document.querySelector<HTMLSelectElement>('[data-instanced-color]');
		const anchor = stitchSelect?.closest('label') ?? colorSelect?.closest('label');
		if (!anchor?.parentElement) return;

		const label = document.createElement('label');
		label.dataset.instancedSourceLimitV12 = 'true';
		label.style.display = 'block';
		label.style.margin = '4px 0';
		label.append('Rendered sources ');

		const select = document.createElement('select');
		select.dataset.instancedSourceLimitSelectV12 = 'true';
		select.innerHTML = '<option value="all">All</option>' + SOURCE_LIMIT_OPTIONS.map(
			(limit) => `<option value="${limit}">${limit}</option>`,
		).join('');
		select.addEventListener('change', () => {
			this.setRenderedSourceLimit(
				select.value === 'all' ? null : Number(select.value),
			);
		});
		label.append(select);
		anchor.insertAdjacentElement('afterend', label);
		this.sourceControlLabel = label;
		this.syncSourceControlValue();
	}

	private syncSourceControlValue(): void {
		const select = this.sourceControlLabel?.querySelector<HTMLSelectElement>(
			'[data-instanced-source-limit-select-v12]',
		);
		if (!select) return;
		select.value = this.sourceLimit == null ? 'all' : String(this.sourceLimit);
	}

	private removeSourceIsolationControl(): void {
		this.sourceControlLabel?.remove();
		this.sourceControlLabel = null;
	}
}

function getFullInstanceCount(geometry: THREE.InstancedBufferGeometry): number {
	const bounds = geometry.getAttribute('iBounds');
	return Math.max(0, bounds?.count ?? geometry.instanceCount);
}
