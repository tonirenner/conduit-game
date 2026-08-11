import * as THREE from 'three';
import {
	configureObjectMaterials,
	ensureUv2FromUv,
	loadGltfObject,
	loadObjMtlObject,
} from '@conduit/web3d/assets';
import { normalizeObjectToSize } from '@conduit/web3d/camera';
import { createBoundingBoxHelper, createDebugLabel, disposeObject3D } from '@conduit/web3d/debug';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';
import {
	createDummyShipModel,
	createDummyStationModel,
} from '../../../rendering/DummyAssetFactory';
import type { OrbitalStationType, ShipRole } from '../../../model/GameWorld';

type ModelAssetEntry = {
	id: string;
	label: string;
	category: string;
	load: () => Promise<THREE.Object3D> | THREE.Object3D;
	orientation?: ModelAssetOrientation;
};

type ModelAssetOrientation = {
	rotation?: readonly [number, number, number];
	mirrorZ?: boolean;
};

const SHIP_ROLES: ShipRole[] = [
	'frigate',
	'carrier',
	'fighter',
	'constructor',
	'scout',
];

const STATION_TYPES: OrbitalStationType[] = [
	'shipyard',
	'shipyard_small',
	'shipyard_large',
	'refinery',
	'research',
	'headquarters',
];

const MODEL_ASSETS: ModelAssetEntry[] = [
	{
		id: 'glb-frigate',
		label: 'Frigate GLB',
		category: 'Real Assets',
		load: () => loadGlb('/models/frigate.glb', 'Frigate GLB'),
	},
	{
		id: 'glb-orbital-hanger',
		label: 'Orbital Hanger GLB / Small Shipyard',
		category: 'Real Assets',
		load: () => loadGlb('/models/orbital_hanger.glb', 'Orbital Hanger GLB'),
	},
	{
		id: 'obj-capital-ship',
		label: 'Capital Ship OBJ',
		category: 'Real Assets',
		load: () => loadObj('/models/capital_ship.obj', '/models/capital_ship.mtl', 'Capital Ship OBJ'),
		orientation: {
			rotation: [Math.PI * 0.5, 0, 0],
			mirrorZ: true,
		},
	},
	...SHIP_ROLES.map<ModelAssetEntry>((role) => ({
		id: `dummy-ship-${role}`,
		label: `Dummy Ship: ${role}`,
		category: 'Dummy Ships',
		load: () => createDummyShipModel(role, 'player'),
	})),
	...STATION_TYPES.map<ModelAssetEntry>((type) => ({
		id: `dummy-station-${type}`,
		label: `Dummy Station: ${type}`,
		category: 'Dummy Stations',
		load: () => createDummyStationModel(type, 'player'),
	})),
];

export class ShipModelTestScene implements FeatureTestScene {
	readonly id = 'ship-model-viewer';
	readonly name = 'Model Viewer';
	readonly category = 'Ships' as const;
	readonly description = 'Inspect real GLB/OBJ assets and dummy model fallbacks.';

	private context: FeatureTestContext | null = null;
	private root = new THREE.Group();
	private currentAssetId = MODEL_ASSETS[0]?.id ?? '';
	private model: THREE.Object3D | null = null;
	private spin = true;
	private showLabels = true;
	private loadToken = 0;

	init(context: FeatureTestContext): void {
		this.context = context;
		this.root.name = 'ModelViewerTestScene';
		context.scene.add(this.root);
		context.camera.position.set(0, 2.4, 7.5);
		context.controls.target.set(0, 0, 0);
		context.controls.update();
		this.createUi(context.uiRoot);
		void this.loadAsset(this.currentAssetId);
	}

	update(deltaSeconds: number): void {
		if (this.spin && this.model) {
			this.model.rotation.y += deltaSeconds * 0.35;
		}
	}

	dispose(): void {
		this.loadToken++;
		this.context?.scene.remove(this.root);
		disposeObject3D(this.root);
		this.root.clear();
		this.context = null;
		this.model = null;
	}

	reset(): void {
		void this.loadAsset(this.currentAssetId);
	}

	private createUi(root: HTMLElement): void {
		root.innerHTML =
			`<label style="display:block;margin:6px 0;">Model ` +
			`<select data-model-asset style="max-width:210px;">${renderAssetOptions(this.currentAssetId)}</select></label>` +
			`<label style="display:block;margin:6px 0;"><input data-spin type="checkbox" checked> Spin</label>` +
			`<label style="display:block;margin:6px 0;"><input data-labels type="checkbox" checked> Node Labels</label>` +
			`<div data-model-info style="margin-top:8px;opacity:.76;line-height:1.35;"></div>`;

		root.querySelector<HTMLSelectElement>('[data-model-asset]')
			?.addEventListener('change', (event) => {
				this.currentAssetId = (event.currentTarget as HTMLSelectElement).value;
				void this.loadAsset(this.currentAssetId);
			});

		root.querySelector<HTMLInputElement>('[data-spin]')
			?.addEventListener('change', (event) => {
				this.spin = (event.currentTarget as HTMLInputElement).checked;
			});

		root.querySelector<HTMLInputElement>('[data-labels]')
			?.addEventListener('change', (event) => {
				this.showLabels = (event.currentTarget as HTMLInputElement).checked;
				void this.loadAsset(this.currentAssetId);
			});
	}

	private async loadAsset(assetId: string): Promise<void> {
		const context = this.context;
		const asset = MODEL_ASSETS.find((entry) => entry.id === assetId);

		if (!context || !asset) {
			return;
		}

		const token = ++this.loadToken;

		disposeObject3D(this.root);
		this.root.clear();
		this.model = null;
		context.clearReport();
		this.setInfo('Loading...');

		try {
			const object = await asset.load();

			if (token !== this.loadToken || !this.context) {
				disposeObject3D(object);
				return;
			}

			this.model = object;
			this.model.name = this.model.name || asset.label;
			applyAssetOrientation(this.model, asset.orientation);
			configureInspectableModel(this.model);
			normalizeObjectToSize(this.model, 3.0);
			this.root.add(this.model);

			const box = createBoundingBoxHelper(this.model);
			this.root.add(box);

			const nodeNames = collectNodeNames(this.model);
			const interestingNodes = findInterestingNodes(this.model);

			if (this.showLabels) {
				for (const node of interestingNodes) {
					const label = createDebugLabel(node.name);
					node.getWorldPosition(label.position);
					label.position.y += 0.18;
					this.root.add(label);
				}
			}

			this.model.add(createForwardAxisOverlay());

			context.report({
				status: 'pass',
				label: 'model loaded',
				detail: asset.label,
			});
			context.report({
				status: nodeNames.some((name) => name.includes('turret')) ? 'pass' : 'warn',
				label: 'turret node',
			});
			context.report({
				status: nodeNames.some((name) => name.includes('muzzle')) ? 'pass' : 'warn',
				label: 'muzzle node',
			});
			context.report({
				status: nodeNames.some((name) => name.includes('engine')) ? 'pass' : 'warn',
				label: 'engine node',
			});

			this.setInfo(renderModelInfo(this.model, nodeNames, interestingNodes));
		} catch (error) {
			if (token !== this.loadToken || !this.context) {
				return;
			}

			const message = error instanceof Error ? error.message : String(error);
			context.report({
				status: 'fail',
				label: 'model load failed',
				detail: asset.label,
			});
			this.setInfo(`Failed: ${escapeHtml(message)}`);
		}
	}

	private setInfo(html: string): void {
		const info = this.context?.uiRoot.querySelector<HTMLElement>('[data-model-info]');

		if (info) {
			info.innerHTML = html;
		}
	}
}

async function loadGlb(
	url: string,
	name: string,
): Promise<THREE.Object3D> {
	return loadGltfObject(url, { name });
}

async function loadObj(
	objUrl: string,
	mtlUrl: string | null,
	name: string,
): Promise<THREE.Object3D> {
	return loadObjMtlObject(objUrl, mtlUrl, { name });
}

function configureInspectableModel(model: THREE.Object3D): void {
	ensureUv2FromUv(model);

	model.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) {
			return;
		}

		object.castShadow = false;
		object.receiveShadow = false;
		object.frustumCulled = false;

		if (object.geometry) {
			object.geometry.computeBoundingBox();
			object.geometry.computeBoundingSphere();
		}
	});

	configureObjectMaterials(model, (material) => {
		material.depthWrite = true;
		material.depthTest = true;
		material.needsUpdate = true;
	});
}

function applyAssetOrientation(
	model: THREE.Object3D,
	orientation: ModelAssetOrientation | undefined,
): void {
	if (!orientation) {
		return;
	}

	if (orientation.rotation) {
		model.rotation.set(
			orientation.rotation[0],
			orientation.rotation[1],
			orientation.rotation[2],
		);
	}

	if (orientation.mirrorZ) {
		model.scale.z *= -1;
	}
}

function createForwardAxisOverlay(): THREE.Group {
	const group = new THREE.Group();
	const forward = new THREE.ArrowHelper(
		new THREE.Vector3(0, 0, -1),
		new THREE.Vector3(0, 0, 0),
		0.85,
		0x5cecff,
		0.18,
		0.08,
	);
	const up = new THREE.ArrowHelper(
		new THREE.Vector3(0, 1, 0),
		new THREE.Vector3(0, 0, 0),
		0.55,
		0x6dff91,
		0.14,
		0.06,
	);
	const right = new THREE.ArrowHelper(
		new THREE.Vector3(1, 0, 0),
		new THREE.Vector3(0, 0, 0),
		0.55,
		0xff6d6d,
		0.14,
		0.06,
	);

	group.name = 'ModelForwardAxisOverlay';
	group.add(forward, up, right);
	return group;
}

function collectNodeNames(root: THREE.Object3D): string[] {
	const nodeNames: string[] = [];

	root.traverse((node) => {
		if (node.name) {
			nodeNames.push(node.name);
		}
	});

	return nodeNames;
}

function findInterestingNodes(root: THREE.Object3D): THREE.Object3D[] {
	const nodes: THREE.Object3D[] = [];

	root.traverse((node) => {
		const name = node.name.toLowerCase();

		if (
			name.includes('turret') ||
			name.includes('muzzle') ||
			name.includes('launcher') ||
			name.includes('rocket') ||
			name.includes('missile') ||
			name.includes('engine') ||
			name.includes('spawn') ||
			name.includes('dock') ||
			name.includes('rally')
		) {
			nodes.push(node);
		}
	});

	return nodes;
}

function renderAssetOptions(selectedId: string): string {
	const categories = [...new Set(MODEL_ASSETS.map((entry) => entry.category))];

	return categories.map((category) => {
		const options = MODEL_ASSETS
			.filter((entry) => entry.category === category)
			.map((entry) => (
				`<option value="${entry.id}"${entry.id === selectedId ? ' selected' : ''}>${escapeHtml(entry.label)}</option>`
			))
			.join('');

		return `<optgroup label="${escapeHtml(category)}">${options}</optgroup>`;
	}).join('');
}

function renderModelInfo(
	model: THREE.Object3D,
	nodeNames: string[],
	interestingNodes: THREE.Object3D[],
): string {
	const meshCount = countMeshes(model);
	const triangles = countTriangles(model);
	const interesting = interestingNodes
		.slice(0, 18)
		.map((node) => escapeHtml(node.name))
		.join('<br>');

	return (
		`Meshes: ${meshCount}<br>` +
		`Triangles: ${triangles.toLocaleString()}<br>` +
		`Nodes: ${nodeNames.length}<br>` +
		(interesting
			? `<div style="margin-top:8px;color:#8fe7ff;">Interesting Nodes</div>${interesting}`
			: '<div style="margin-top:8px;">No named turret/muzzle/engine/spawn nodes found.</div>')
	);
}

function countMeshes(root: THREE.Object3D): number {
	let count = 0;

	root.traverse((node) => {
		if (node instanceof THREE.Mesh) {
			count++;
		}
	});

	return count;
}

function countTriangles(root: THREE.Object3D): number {
	let triangles = 0;

	root.traverse((node) => {
		if (!(node instanceof THREE.Mesh)) {
			return;
		}

		const geometry = node.geometry;
		const index = geometry.getIndex();
		const position = geometry.getAttribute('position');

		if (index) {
			triangles += index.count / 3;
		} else if (position) {
			triangles += position.count / 3;
		}
	});

	return Math.round(triangles);
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
