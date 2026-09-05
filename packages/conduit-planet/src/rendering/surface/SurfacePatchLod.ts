export type SurfacePatchLodConfig = {
	/** Half extent of the complete local surface coverage in physical meters. */
	rootHalfExtentMeters: number;
	/** Maximum quadtree subdivision depth. */
	maxDepth: number;
	/**
	 * Split a patch while camera distance to its bounds is less than
	 * patchSize * splitDistanceFactor. Larger values keep fine detail farther out.
	 */
	splitDistanceFactor: number;
};

export type SurfacePatchDescriptor = {
	key: string;
	depth: number;
	minX: number;
	minZ: number;
	maxX: number;
	maxZ: number;
	sizeMeters: number;
	centerX: number;
	centerZ: number;
};

export const DEFAULT_SURFACE_PATCH_LOD_CONFIG: SurfacePatchLodConfig = {
	rootHalfExtentMeters: 2_048_000,
	maxDepth: 14,
	// Keep the near field fine without exploding the active leaf count.
	// Centered-camera planning currently resolves to ~448 leaves.
	splitDistanceFactor: 1.25,
};

/**
 * Produces an adaptive tangent-plane quadtree around the active surface camera.
 *
 * This module deliberately owns topology selection only. It does not know about
 * Three.js, terrain noise, materials or workers. The returned leaf patches are
 * stable deterministic work units that can be sent to background workers and
 * cached/recycled by key.
 *
 * The distance test uses distance to the patch bounds instead of its center so
 * the patch currently underneath the camera continues subdividing all the way
 * to the configured near-field depth without forcing the same detail level over
 * the complete root area.
 */
export function planSurfacePatches(
	cameraX: number,
	cameraZ: number,
	config: SurfacePatchLodConfig = DEFAULT_SURFACE_PATCH_LOD_CONFIG,
): SurfacePatchDescriptor[] {
	const rootHalfExtentMeters = positiveFinite(
		config.rootHalfExtentMeters,
		DEFAULT_SURFACE_PATCH_LOD_CONFIG.rootHalfExtentMeters,
	);
	const maxDepth = Math.max(0, Math.floor(config.maxDepth));
	const splitDistanceFactor = positiveFinite(
		config.splitDistanceFactor,
		DEFAULT_SURFACE_PATCH_LOD_CONFIG.splitDistanceFactor,
	);
	const leaves: SurfacePatchDescriptor[] = [];

	visitPatch(
		-rootHalfExtentMeters,
		-rootHalfExtentMeters,
		rootHalfExtentMeters * 2,
		0,
		0,
		0,
		cameraX,
		cameraZ,
		maxDepth,
		splitDistanceFactor,
		leaves,
	);

	return leaves;
}

function visitPatch(
	minX: number,
	minZ: number,
	sizeMeters: number,
	depth: number,
	xIndex: number,
	zIndex: number,
	cameraX: number,
	cameraZ: number,
	maxDepth: number,
	splitDistanceFactor: number,
	leaves: SurfacePatchDescriptor[],
): void {
	const maxX = minX + sizeMeters;
	const maxZ = minZ + sizeMeters;
	const distanceToBounds = distanceToRectangle(
		cameraX,
		cameraZ,
		minX,
		minZ,
		maxX,
		maxZ,
	);
	const shouldSplit =
		depth < maxDepth &&
		distanceToBounds < sizeMeters * splitDistanceFactor;

	if (!shouldSplit) {
		leaves.push({
			key: `${depth}:${xIndex}:${zIndex}`,
			depth,
			minX,
			minZ,
			maxX,
			maxZ,
			sizeMeters,
			centerX: minX + sizeMeters * 0.5,
			centerZ: minZ + sizeMeters * 0.5,
		});
		return;
	}

	const childSize = sizeMeters * 0.5;
	const childDepth = depth + 1;
	for (let z = 0; z < 2; z++) {
		for (let x = 0; x < 2; x++) {
			visitPatch(
				minX + x * childSize,
				minZ + z * childSize,
				childSize,
				childDepth,
				xIndex * 2 + x,
				zIndex * 2 + z,
				cameraX,
				cameraZ,
				maxDepth,
				splitDistanceFactor,
				leaves,
			);
		}
	}
}

function distanceToRectangle(
	x: number,
	z: number,
	minX: number,
	minZ: number,
	maxX: number,
	maxZ: number,
): number {
	const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0;
	const dz = z < minZ ? minZ - z : z > maxZ ? z - maxZ : 0;
	return Math.hypot(dx, dz);
}

function positiveFinite(value: number, fallback: number): number {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}
