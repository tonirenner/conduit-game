import * as THREE from 'three';
import {
	PlanetInstancedCubeSphereDebug as PlanetInstancedCubeSphereDebugV10,
	type PlanetInstancedColorMode,
	type PlanetInstancedCubeSphereStats as PlanetInstancedCubeSphereStatsV10,
} from './PlanetInstancedCubeSphereDebugV10';

export type { PlanetInstancedColorMode };

export type PlanetInstancedCubeSphereStats = PlanetInstancedCubeSphereStatsV10 & {
	visibleStitchGroups: number;
	totalStitchGroups: number;
	stitchGroupLimit: number | null;
};

type GpuStateRuntime = {
	root: THREE.Group;
};

type V7Runtime = {
	activeState: GpuStateRuntime | null;
};

/**
 * Feature-Lab v11: stitch-group raster/overdraw isolation.
 *
 * The topology and GPU state are built exactly as in v10. This version only
 * toggles visibility of the already-created stitch-group draw meshes, so the
 * test does not trigger atlas rebuilds or topology work when the limit changes.
 */
export class PlanetInstancedCubeSphereDebug extends PlanetInstancedCubeSphereDebugV10 {
	private stitchGroupLimit: number | null = null;
	private controlLabel: HTMLLabelElement | null = null;
	private controlGroupCount = -1;

	setStitchGroupLimit(limit: number | null): void {
		const next = limit == null || !Number.isFinite(limit)
			? null
			: Math.max(1, Math.floor(limit));
		if (this.stitchGroupLimit === next) return;
		this.stitchGroupLimit = next;
		this.applyStitchGroupVisibility();
		this.syncControlValue();
	}

	override update(terrain: THREE.Object3D): void {
		super.update(terrain);
		this.applyStitchGroupVisibility();
		this.ensureIsolationControl();
	}

	override detach(): void {
		this.removeIsolationControl();
		super.detach();
	}

	override getStats(): PlanetInstancedCubeSphereStats {
		const base = super.getStats();
		const runtime = this as unknown as V7Runtime;
		const children = runtime.activeState?.root.children ?? [];
		const visible = children.reduce(
			(count, child) => count + (child.visible ? 1 : 0),
			0,
		);

		return {
			...base,
			drawMeshes: visible,
			visibleStitchGroups: visible,
			totalStitchGroups: children.length || base.stitchGroups,
			stitchGroupLimit: this.stitchGroupLimit,
		};
	}

	private applyStitchGroupVisibility(): void {
		const runtime = this as unknown as V7Runtime;
		const root = runtime.activeState?.root;
		if (!root) return;

		const limit = this.stitchGroupLimit ?? root.children.length;
		for (let i = 0; i < root.children.length; i++) {
			root.children[i].visible = i < limit;
		}
	}

	private ensureIsolationControl(): void {
		const runtime = this as unknown as V7Runtime;
		const totalGroups = runtime.activeState?.root.children.length ?? 0;
		if (totalGroups <= 0) return;

		if (this.controlLabel && !this.controlLabel.isConnected) {
			this.controlLabel = null;
			this.controlGroupCount = -1;
		}

		if (!this.controlLabel) {
			const colorSelect = document.querySelector<HTMLSelectElement>('[data-instanced-color]');
			const anchor = colorSelect?.closest('label');
			if (!anchor?.parentElement) return;

			const label = document.createElement('label');
			label.dataset.instancedStitchLimitV11 = 'true';
			label.style.display = 'block';
			label.style.margin = '4px 0';
			label.append('Stitch groups ');

			const select = document.createElement('select');
			select.dataset.instancedStitchLimitSelectV11 = 'true';
			select.addEventListener('change', () => {
				this.setStitchGroupLimit(
					select.value === 'all' ? null : Number(select.value),
				);
			});
			label.append(select);
			anchor.insertAdjacentElement('afterend', label);
			this.controlLabel = label;
		}

		if (this.controlGroupCount !== totalGroups) {
			const select = this.controlLabel.querySelector<HTMLSelectElement>(
				'[data-instanced-stitch-limit-select-v11]',
			);
			if (!select) return;
			select.innerHTML = '<option value="all">All</option>' + Array.from(
				{ length: totalGroups },
				(_, index) => `<option value="${index + 1}">${index + 1}</option>`,
			).join('');
			this.controlGroupCount = totalGroups;
			this.syncControlValue();
		}
	}

	private syncControlValue(): void {
		const select = this.controlLabel?.querySelector<HTMLSelectElement>(
			'[data-instanced-stitch-limit-select-v11]',
		);
		if (!select) return;
		select.value = this.stitchGroupLimit == null
			? 'all'
			: String(Math.min(this.stitchGroupLimit, Math.max(1, this.controlGroupCount)));
	}

	private removeIsolationControl(): void {
		this.controlLabel?.remove();
		this.controlLabel = null;
		this.controlGroupCount = -1;
	}
}
