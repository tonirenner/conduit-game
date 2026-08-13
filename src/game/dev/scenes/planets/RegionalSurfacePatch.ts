import * as THREE from 'three';
import type { PlanetClass, PlanetDefinition } from '@conduit/planet/model';
import { PlanetTerrainSampler } from '@conduit/planet/near-view';

const GEOMETRY_RESOLUTION = 48;
const TEXTURE_RESOLUTION = 64;
const PATCH_EXTENT = 1.35;

export class RegionalSurfacePatch {
  readonly group = new THREE.Group();

  private readonly sampler: PlanetTerrainSampler;
  private readonly anchor = new THREE.Vector3();
  private readonly material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
  });
  private mesh: THREE.Mesh | null = null;
  private texture: THREE.DataTexture | null = null;

  constructor(
    private readonly definition: PlanetDefinition,
    private readonly renderRadius: number,
    direction: THREE.Vector3,
  ) {
    this.group.name = 'RegionalSurfacePatch';
    this.sampler = new PlanetTerrainSampler(definition);
    this.rebuild(direction);
    this.setOpacity(0);
  }

  update(direction: THREE.Vector3, opacity: number): void {
    const next = direction.clone().normalize();
    if (next.dot(this.anchor) < 0.985) this.rebuild(next);
    this.setOpacity(opacity);
  }

  dispose(): void {
    this.mesh?.geometry.dispose();
    this.texture?.dispose();
    this.material.dispose();
    this.group.clear();
    this.mesh = null;
    this.texture = null;
  }

  private setOpacity(value: number): void {
    const opacity = THREE.MathUtils.clamp(value, 0, 1);
    this.material.opacity = opacity;
    this.group.visible = opacity > 0.001;
  }

  private rebuild(direction: THREE.Vector3): void {
    this.anchor.copy(direction).normalize();

    const up = this.anchor;
    const reference = Math.abs(up.y) < 0.92
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const east = new THREE.Vector3().crossVectors(reference, up).normalize();
    const north = new THREE.Vector3().crossVectors(up, east).normalize();

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const sampleDirection = new THREE.Vector3();

    for (let y = 0; y <= GEOMETRY_RESOLUTION; y++) {
      const v01 = y / GEOMETRY_RESOLUTION;
      const v = v01 * 2 - 1;
      for (let x = 0; x <= GEOMETRY_RESOLUTION; x++) {
        const u01 = x / GEOMETRY_RESOLUTION;
        const u = u01 * 2 - 1;
        sampleDirection.copy(up)
          .addScaledVector(east, u * PATCH_EXTENT)
          .addScaledVector(north, v * PATCH_EXTENT)
          .normalize();

        const sample = this.sampler.sample(sampleDirection, false);
        const radius = this.renderRadius * (sample.surfaceRadiusMeters / this.sampler.radiusMeters);
        positions.push(
          sample.direction.x * radius,
          sample.direction.y * radius,
          sample.direction.z * radius,
        );
        uvs.push(u01, 1 - v01);
      }
    }

    const stride = GEOMETRY_RESOLUTION + 1;
    for (let y = 0; y < GEOMETRY_RESOLUTION; y++) {
      for (let x = 0; x < GEOMETRY_RESOLUTION; x++) {
        const a = y * stride + x;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const texture = this.buildTexture(up, east, north);
    this.texture?.dispose();
    this.texture = texture;
    this.material.map = texture;
    this.material.needsUpdate = true;

    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geometry;
    } else {
      this.mesh = new THREE.Mesh(geometry, this.material);
      this.mesh.name = 'RegionalSurfacePatchMesh';
      this.mesh.frustumCulled = true;
      this.group.add(this.mesh);
    }
  }

  private buildTexture(up: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3): THREE.DataTexture {
    const data = new Uint8Array(TEXTURE_RESOLUTION * TEXTURE_RESOLUTION * 4);
    const direction = new THREE.Vector3();
    const color = new THREE.Color();

    for (let y = 0; y < TEXTURE_RESOLUTION; y++) {
      const v = ((y + 0.5) / TEXTURE_RESOLUTION) * 2 - 1;
      for (let x = 0; x < TEXTURE_RESOLUTION; x++) {
        const u = ((x + 0.5) / TEXTURE_RESOLUTION) * 2 - 1;
        direction.copy(up)
          .addScaledVector(east, u * PATCH_EXTENT)
          .addScaledVector(north, v * PATCH_EXTENT)
          .normalize();
        const sample = this.sampler.sample(direction, false);
        resolveRegionalColor(
          this.definition.class,
          sample.landMask,
          sample.rawTerrain.height,
          sample.isWater,
          color,
        );
        const offset = (y * TEXTURE_RESOLUTION + x) * 4;
        data[offset] = Math.round(THREE.MathUtils.clamp(color.r, 0, 1) * 255);
        data[offset + 1] = Math.round(THREE.MathUtils.clamp(color.g, 0, 1) * 255);
        data[offset + 2] = Math.round(THREE.MathUtils.clamp(color.b, 0, 1) * 255);
        data[offset + 3] = 255;
      }
    }

    const texture = new THREE.DataTexture(
      data,
      TEXTURE_RESOLUTION,
      TEXTURE_RESOLUTION,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }
}

function resolveRegionalColor(
  planetClass: PlanetClass,
  landMask: number,
  height: number,
  isWater: boolean,
  target: THREE.Color,
): void {
  if (isWater) {
    target.setRGB(0.025, 0.10 + landMask * 0.08, 0.22 + landMask * 0.12);
    return;
  }

  const relief = THREE.MathUtils.clamp(height * 0.5 + 0.5, 0, 1);
  if (planetClass === 'desert') {
    target.setRGB(0.38 + relief * 0.34, 0.10 + relief * 0.24, 0.025 + relief * 0.06);
  } else if (planetClass === 'ice') {
    target.setRGB(0.48 + relief * 0.38, 0.58 + relief * 0.34, 0.66 + relief * 0.30);
  } else if (planetClass === 'lava') {
    target.setRGB(0.18 + relief * 0.55, 0.025 + relief * 0.12, 0.01);
  } else {
    target.setRGB(0.10 + relief * 0.24, 0.16 + relief * 0.30, 0.08 + relief * 0.16);
  }
}
