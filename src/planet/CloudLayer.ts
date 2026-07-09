import * as THREE from 'three';
import { SUN_DIRECTION } from './Sun';

export class CloudLayer {
	public readonly group: THREE.Group;

	private readonly material: THREE.ShaderMaterial;

	constructor(radius: number) {
		this.group = new THREE.Group();
		this.group.name = 'VolumetricCloudLayer';

		const innerRadius = radius * 1.018;
		const outerRadius = radius * 1.064;

		const geometry = new THREE.SphereGeometry(outerRadius, 128, 128);

		this.material = new THREE.ShaderMaterial({
			                                         transparent: true,
			                                         depthWrite: false,
			                                         depthTest: true,
			                                         side: THREE.FrontSide,
			                                         uniforms: {
				                                         uTime: {
					                                         value: 0,
				                                         },
				                                         uPlanetRadius: {
					                                         value: radius,
				                                         },
				                                         uInnerRadius: {
					                                         value: innerRadius,
				                                         },
				                                         uOuterRadius: {
					                                         value: outerRadius,
				                                         },
				                                         uSunDirection: {
					                                         value: SUN_DIRECTION.clone(),
				                                         },
				                                         uCoverage: {
					                                         value: 0.455,
				                                         },
				                                         uDensity: {
					                                         value: 2.38,
				                                         },
				                                         uClimateInfluence: {
					                                         value: 0.25,
				                                         },
			                                         },
			                                         vertexShader: `
				varying vec3 vWorldPosition;

				void main() {
					vec4 worldPosition = modelMatrix * vec4(position, 1.0);

					vWorldPosition = worldPosition.xyz;

					gl_Position = projectionMatrix * viewMatrix * worldPosition;
				}
			`,
			                                         fragmentShader: `
				precision highp float;

				varying vec3 vWorldPosition;

				uniform float uTime;
				uniform float uPlanetRadius;
				uniform float uInnerRadius;
				uniform float uOuterRadius;
				uniform vec3 uSunDirection;
				uniform float uCoverage;
				uniform float uDensity;
				uniform float uClimateInfluence;

				const int STEPS = 30;

				float saturate(float value) {
					return clamp(value, 0.0, 1.0);
				}

				float hash(vec3 p) {
					p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
					p *= 17.0;

					return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
				}

				float noise(vec3 p) {
					vec3 i = floor(p);
					vec3 f = fract(p);

					f = f * f * (3.0 - 2.0 * f);

					float n000 = hash(i + vec3(0.0, 0.0, 0.0));
					float n100 = hash(i + vec3(1.0, 0.0, 0.0));
					float n010 = hash(i + vec3(0.0, 1.0, 0.0));
					float n110 = hash(i + vec3(1.0, 1.0, 0.0));

					float n001 = hash(i + vec3(0.0, 0.0, 1.0));
					float n101 = hash(i + vec3(1.0, 0.0, 1.0));
					float n011 = hash(i + vec3(0.0, 1.0, 1.0));
					float n111 = hash(i + vec3(1.0, 1.0, 1.0));

					float nx00 = mix(n000, n100, f.x);
					float nx10 = mix(n010, n110, f.x);
					float nx01 = mix(n001, n101, f.x);
					float nx11 = mix(n011, n111, f.x);

					float nxy0 = mix(nx00, nx10, f.y);
					float nxy1 = mix(nx01, nx11, f.y);

					return mix(nxy0, nxy1, f.z);
				}

				float fbm(vec3 p) {
					float value = 0.0;
					float amplitude = 0.5;
					float normalizer = 0.0;

					for (int i = 0; i < 6; i++) {
						value += noise(p) * amplitude;
						normalizer += amplitude;

						p *= 2.03;
						amplitude *= 0.5;
					}

					return value / normalizer;
				}

				float fbmLow(vec3 p) {
					float value = 0.0;
					float amplitude = 0.5;
					float normalizer = 0.0;

					for (int i = 0; i < 4; i++) {
						value += noise(p) * amplitude;
						normalizer += amplitude;

						p *= 2.03;
						amplitude *= 0.5;
					}

					return value / normalizer;
				}

				vec3 domainWarp(vec3 normal, float time) {
					vec3 p = normal;

					float wx = fbm(p * 1.6 + vec3(time * 0.006, 3.7, 1.2)) - 0.5;
					float wy = fbm(p * 1.9 + vec3(4.1, time * 0.004, 8.3)) - 0.5;
					float wz = fbm(p * 1.4 + vec3(2.8, 6.6, time * 0.005)) - 0.5;

					return normalize(
						normal +
						vec3(wx, wy, wz) * 0.22
					);
				}

				float getTerrainLandMask(vec3 normal) {
					float continentBase = fbmLow(normal * 1.25);

					float coastNoise =
						(fbmLow(normal * 2.4) - 0.5) *
						0.045;

					float continent = continentBase + coastNoise;

					return smoothstep(0.525, 0.585, continent);
				}

				float getClimateCloudPotential(vec3 normal) {
					float landMask = getTerrainLandMask(normal);
					float ocean = 1.0 - landMask;

					float latitude = asin(clamp(normal.y, -1.0, 1.0));
					float latitudeAbs = abs(normal.y);

					float coast =
						1.0 -
						abs(landMask * 2.0 - 1.0);

					coast = saturate(coast);

					float equatorWarmth =
						1.0 -
						smoothstep(0.12, 0.98, latitudeAbs);

					float temperatureNoise =
						(fbmLow(normal * 1.7 + vec3(12.4, 4.1, 8.8)) - 0.5) *
						0.18;

					float temperature = saturate(
						equatorWarmth +
						temperatureNoise -
						smoothstep(0.72, 1.0, latitudeAbs) * 0.22
					);

					float rainBand =
						0.5 +
						0.5 *
						sin(
							latitude * 8.5 +
							(fbmLow(normal * 1.2 + vec3(3.7, 9.1, 2.6)) - 0.5) * 5.8
						);

					float humidityNoise =
						fbmLow(normal * 2.05 + vec3(41.2, 7.3, 18.1));

					float humidity = saturate(
						humidityNoise * 0.52 +
						coast * 0.20 +
						ocean * 0.28 +
						rainBand * 0.18
					);

					float dryNoise =
						fbmLow(normal * 2.8 + vec3(8.6, 71.2, 4.0));

					float aridity = saturate(
						1.0 -
						humidity +
						temperature * 0.16 +
						(dryNoise - 0.5) * 0.20 -
						coast * 0.10
					);

					float pressure = saturate(
						fbmLow(normal * 1.35 + vec3(19.1, 2.4, 33.7)) * 0.70 +
						rainBand * 0.20 +
						ocean * 0.10
					);

					float cloudPotential = saturate(
						humidity * 0.62 +
						ocean * 0.20 +
						rainBand * 0.14 +
						pressure * 0.12 -
						aridity * 0.24
					);

					return cloudPotential;
				}

				float sphereIntersectionNear(
					vec3 rayOrigin,
					vec3 rayDirection,
					float radius
				) {
					float b = dot(rayOrigin, rayDirection);
					float c = dot(rayOrigin, rayOrigin) - radius * radius;
					float h = b * b - c;

					if (h < 0.0) {
						return -1.0;
					}

					return -b - sqrt(h);
				}

				float sphereIntersectionFar(
					vec3 rayOrigin,
					vec3 rayDirection,
					float radius
				) {
					float b = dot(rayOrigin, rayDirection);
					float c = dot(rayOrigin, rayOrigin) - radius * radius;
					float h = b * b - c;

					if (h < 0.0) {
						return -1.0;
					}

					return -b + sqrt(h);
				}

				float cloudDensity(vec3 position) {
					float radius = length(position);

					float shell =
						smoothstep(uInnerRadius, uInnerRadius + 0.020, radius) *
						(1.0 - smoothstep(uOuterRadius - 0.026, uOuterRadius, radius));

					vec3 normal = normalize(position);
					vec3 warpedNormal = domainWarp(normal, uTime);

					vec3 wind = vec3(
						uTime * 0.0032,
						0.0,
						uTime * 0.0020
					);

					float large = fbm(warpedNormal * 1.65 + wind);
					float medium = fbm(warpedNormal * 5.15 + wind * 1.8);
					float fine = fbm(warpedNormal * 16.5 + wind * 3.0);

					float latitude = asin(normal.y);

					float bandNoise = fbm(warpedNormal * 2.3 + wind) - 0.5;

					float bands =
						0.5 +
						0.5 *
						sin(
							latitude * 8.4 +
							bandNoise * 5.2
						);

					bands = smoothstep(0.36, 0.91, bands);

					float streaks =
						1.0 -
						abs(fbm(warpedNormal * 8.0 + wind * 2.2) - 0.5) * 2.0;

					streaks = pow(clamp(streaks, 0.0, 1.0), 1.55);

					float stormNoise =
						fbm(warpedNormal * 9.0 + wind * 4.0 + vec3(17.0, 3.0, 11.0));

					float climateCloudPotential =
						getClimateCloudPotential(normal);

					float storm =
						smoothstep(0.74, 0.96, stormNoise) *
						climateCloudPotential;

					float d =
						large * 0.39 +
						medium * 0.29 +
						fine * 0.07 +
						bands * 0.16 +
						streaks * 0.05 +
						storm * 0.08;

					float climateMultiplier = mix(
						0.72,
						1.26,
						climateCloudPotential
					);

					d *= mix(
						1.0,
						climateMultiplier,
						uClimateInfluence
					);

					d = smoothstep(uCoverage, uCoverage + 0.205, d);

					d = pow(d, 1.46);

					return d * shell;
				}

				void main() {
					vec3 rayOrigin = cameraPosition;
					vec3 rayDirection = normalize(vWorldPosition - cameraPosition);
					vec3 sunDirection = normalize(uSunDirection);

					float tNear = sphereIntersectionNear(
						rayOrigin,
						rayDirection,
						uOuterRadius
					);

					float tFar = sphereIntersectionFar(
						rayOrigin,
						rayDirection,
						uOuterRadius
					);

					if (tNear < 0.0 || tFar < 0.0) {
						discard;
					}

					tNear = max(tNear, 0.0);

					float tPlanet = sphereIntersectionNear(
						rayOrigin,
						rayDirection,
						uPlanetRadius
					);

					if (tPlanet > 0.0) {
						tFar = min(tFar, tPlanet);
					}

					if (tFar <= tNear) {
						discard;
					}

					float thickness = tFar - tNear;
					float stepSize = thickness / float(STEPS);

					float alpha = 0.0;
					vec3 color = vec3(0.0);

					for (int i = 0; i < STEPS; i++) {
						float t = tNear + stepSize * (float(i) + 0.5);
						vec3 p = rayOrigin + rayDirection * t;

						float r = length(p);

						if (r < uInnerRadius || r > uOuterRadius) {
							continue;
						}

						float d = cloudDensity(p) * uDensity;

						if (d <= 0.011) {
							continue;
						}

						vec3 n = normalize(p);

						float sunDot = dot(n, sunDirection);

						float dayLight = smoothstep(-0.20, 0.65, sunDot);
						float directLight = pow(max(sunDot, 0.0), 0.62);

						float viewFacing =
							clamp(dot(n, -rayDirection), 0.0, 1.0);

						float limbFade = smoothstep(0.014, 0.20, viewFacing);

						vec3 shadowColor = vec3(0.30, 0.35, 0.41);
						vec3 midColor = vec3(0.78, 0.81, 0.82);
						vec3 sunColor = vec3(1.0, 0.985, 0.94);

						vec3 cloudColor = mix(
							shadowColor,
							midColor,
							dayLight
						);

						cloudColor = mix(
							cloudColor,
							sunColor,
							directLight * 0.76
						);

						float forwardLight =
							smoothstep(0.35, 0.98, dot(-rayDirection, sunDirection));

						cloudColor +=
							vec3(1.0, 0.78, 0.52) *
							forwardLight *
							dayLight *
							0.075;

						float sampleAlpha =
							1.0 - exp(-d * stepSize * 1.38);

						sampleAlpha *= mix(0.28, 1.0, dayLight);
						sampleAlpha *= mix(0.56, 1.0, limbFade);
						sampleAlpha *= 1.0 - alpha;

						color += cloudColor * sampleAlpha;
						alpha += sampleAlpha;

						if (alpha > 0.93) {
							break;
						}
					}

					vec3 frontPoint = rayOrigin + rayDirection * tNear;
					vec3 frontNormal = normalize(frontPoint);

					float limb = abs(dot(frontNormal, -rayDirection));
					float finalLimbFade = smoothstep(0.010, 0.145, limb);

					alpha *= mix(0.52, 1.0, finalLimbFade);
					color *= mix(0.78, 1.0, finalLimbFade);

					alpha = clamp(alpha, 0.0, 0.82);

					if (alpha < 0.018) {
						discard;
					}

					gl_FragColor = vec4(color, alpha);
				}
			`,
		                                         });

		const mesh = new THREE.Mesh(geometry, this.material);

		mesh.name = 'VolumetricClouds';
		mesh.renderOrder = 5;

		this.group.add(mesh);
	}

	update(deltaSeconds: number): void {
		this.material.uniforms.uTime.value += deltaSeconds * 0.18;
	}

	updateLOD(cameraDistance: number, planetRadius: number): void {
		const heightAboveSurface = cameraDistance - planetRadius;

		if (heightAboveSurface > 8) {
			this.material.uniforms.uDensity.value = 2.05;
			this.material.uniforms.uCoverage.value = 0.485;
			this.material.uniforms.uClimateInfluence.value = 0.38;
			return;
		}

		if (heightAboveSurface > 3) {
			this.material.uniforms.uDensity.value = 2.38;
			this.material.uniforms.uCoverage.value = 0.455;
			this.material.uniforms.uClimateInfluence.value = 0.42;
			return;
		}

		this.material.uniforms.uDensity.value = 2.72;
		this.material.uniforms.uCoverage.value = 0.435;
		this.material.uniforms.uClimateInfluence.value = 0.46;
	}
}
