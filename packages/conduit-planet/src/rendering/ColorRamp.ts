import * as THREE from 'three';
import { smoothstep } from '../internal/ProceduralMath';

export type ColorRampSegment = {
	start: number;
	end: number;
	from: THREE.ColorRepresentation;
	to: THREE.ColorRepresentation;
};

export function sampleColorRamp(
	value: number,
	segments: readonly ColorRampSegment[],
): THREE.Color | null {
	for (const segment of segments) {
		if (value < segment.end) {
			return new THREE.Color(segment.from).lerp(
				new THREE.Color(segment.to),
				smoothstep(segment.start, segment.end, value),
			);
		}
	}

	return null;
}
