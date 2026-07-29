import * as THREE from 'three';
import { SUN_DIRECTION } from './Sun';

export type CloudRenderQuality = 'moving' | 'idle';

export class CloudLayer {
	public readonly group: THREE.Group;

	private readonly material: THREE.ShaderMaterial;

	private profileCloudCoverage = 0.505;
	private profileCloudDensity = 2.25;
	private profileCloudAlpha = 0.84;

	private currentRenderQuality: CloudRenderQuality = 'idle';

	constructor(radius: number) {
		this.group = new THREE.Group();
		this.group.name = 'VolumetricCloudLayer';

		const innerRadius = radius * 1.018;
		const outerRadius = radius * 1.064;

		const geometry = new THREE.SphereGeometry(outerRadius, 96, 96);

		this.material = new THREE.ShaderMaterial({
			                                         transparent: true,
			                                         depthWrite: false,
			                                         depthTest: true,
			                                         side: THREE.FrontSide,
			                                         uniforms: {
				                                         uTime: { value: 0 },
				                                         uPlanetRadius: { value: radius },
				                                         uInnerRadius: { value: innerRadius },
				                                         uOuterRadius: { value: outerRadius },
				                                         uSunDirection: { value: SUN_DIRECTION.clone() },
				                                         uCoverage: { value: 0.505 },
				                                         uDensity: { value: 2.25 },
				                                         uClimateInfluence: { value: 0.25 },
				                                         uWeatherInfluence: { value: 0.19 },
				                                         uStormInfluence: { value: 0.11 },
				                                         uCloudAlpha: { value: 0.82 },

				                                         // RenderQuality
				                                         uCloudDetailStrength: { value: 1.0 },
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
				uniform float uWeatherInfluence;
				uniform float uStormInfluence;
				uniform float uCloudDetailStrength;
				uniform float uCloudAlpha;

				const int STEPS = 16;

				struct ClimateSample {
					float landMask;
					float temperature;
					float humidity;
					float aridity;
					float pressure;
					float cloudPotential;
				};

				struct WeatherSample {
					float pressure;
					float lowPressure;
					float highPressure;
					float windBand;
					float windStrength;
					float stormPotential;
					float cloudBoost;
					float swirl;
				};

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

					for (int i = 0; i < 4; i++) {
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

					for (int i = 0; i < 3; i++) {
						value += noise(p) * amplitude;
						normalizer += amplitude;

						p *= 2.03;
						amplitude *= 0.5;
					}

					return value / normalizer;
				}

				float getTerrainLandMask(vec3 normal) {
					float continentBase = fbmLow(normal * 1.25);

					float coastNoise =
						(fbmLow(normal * 2.4) - 0.5) *
						0.045;

					float continent = continentBase + coastNoise;

					return smoothstep(0.525, 0.585, continent);
				}

				ClimateSample getClimateSampleGL(vec3 normal) {
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

					ClimateSample climateSample;

					climateSample.landMask = landMask;
					climateSample.temperature = temperature;
					climateSample.humidity = humidity;
					climateSample.aridity = aridity;
					climateSample.pressure = pressure;
					climateSample.cloudPotential = cloudPotential;

					return climateSample;
				}

				WeatherSample getWeatherSampleGL(
					vec3 normal,
					ClimateSample climateSample
				) {
					float latitude = asin(clamp(normal.y, -1.0, 1.0));
					float ocean = 1.0 - climateSample.landMask;

					float latitudeWind =
						0.5 +
						0.5 *
						sin(
							latitude * 10.0 +
							climateSample.pressure * 3.2 +
							uTime * 0.16
						);

					float pressureBase =
						fbmLow(
							normal * 1.20 +
							vec3(19.1 + uTime * 0.025, 2.4, 33.7)
						);

					float pressureDetail =
						fbmLow(
							normal * 3.40 +
							vec3(31.3, 8.6 + uTime * 0.045, 12.7)
						);

					float pressure = saturate(
						pressureBase * 0.58 +
						pressureDetail * 0.22 +
						climateSample.cloudPotential * 0.13 +
						ocean * 0.07
					);

					float lowPressure =
						1.0 -
						smoothstep(0.40, 0.74, pressure);

					float highPressure =
						smoothstep(0.56, 0.84, pressure);

					float instability = saturate(
						climateSample.humidity * 0.48 +
						climateSample.temperature * 0.28 +
						ocean * 0.14 -
						climateSample.aridity * 0.34 +
						lowPressure * 0.22
					);

					float cellNoise =
						fbmLow(
							normal * 5.8 +
							vec3(5.1 + uTime * 0.075, 91.4, 17.7)
						);

					float stormCells =
						smoothstep(0.60, 0.88, cellNoise) *
						(1.0 - highPressure * 0.55);

					float stormPotential = saturate(
						climateSample.cloudPotential * 0.48 +
						instability * 0.34 +
						stormCells * 0.26 +
						lowPressure * 0.18 -
						highPressure * 0.18
					);

					float windStrength = saturate(
						0.18 +
						latitudeWind * 0.34 +
						abs(pressure - 0.5) * 0.34
					);

					float cloudBoost = saturate(
						climateSample.cloudPotential * 0.66 +
						lowPressure * 0.22 +
						stormPotential * 0.20 -
						highPressure * 0.12
					);

					float swirlNoise =
						fbmLow(
							normal * 7.4 +
							vec3(73.2, 14.5 + uTime * 0.10, 42.0)
						);

					float swirl = saturate(
						stormPotential *
						(
							swirlNoise * 0.72 +
							lowPressure * 0.18
						)
					);

					WeatherSample weatherSample;

					weatherSample.pressure = pressure;
					weatherSample.lowPressure = lowPressure;
					weatherSample.highPressure = highPressure;
					weatherSample.windBand = latitudeWind;
					weatherSample.windStrength = windStrength;
					weatherSample.stormPotential = stormPotential;
					weatherSample.cloudBoost = cloudBoost;
					weatherSample.swirl = swirl;

					return weatherSample;
				}

				vec3 domainWarp(
					vec3 normal,
					WeatherSample weatherSample
				) {
					float bandDirection =
						weatherSample.windBand * 2.0 -
						1.0;

					vec3 windOffset = vec3(
						uTime * 0.0032 * (0.65 + weatherSample.windStrength),
						bandDirection * uTime * 0.0014,
						uTime * 0.0020 * (0.75 + weatherSample.windStrength)
					);

					float wx =
						fbmLow(normal * 1.6 + windOffset + vec3(0.0, 3.7, 1.2)) -
						0.5;

					float wy =
						fbmLow(normal * 1.9 + windOffset + vec3(4.1, 0.0, 8.3)) -
						0.5;

					vec3 warped = normalize(
						normal +
						vec3(wx, wy, 0.0) *
						(0.16 + weatherSample.swirl * 0.10)
					);

					return warped;
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

				float cloudDensity(
					vec3 position,
					ClimateSample climateSample,
					WeatherSample weatherSample
				) {
					float radius = length(position);

					float shell =
						smoothstep(uInnerRadius, uInnerRadius + 0.020, radius) *
						(1.0 - smoothstep(uOuterRadius - 0.026, uOuterRadius, radius));

					vec3 normal = normalize(position);

					vec3 warpedNormal = domainWarp(
						normal,
						weatherSample
					);

					vec3 wind = vec3(
						uTime * 0.0032,
						0.0,
						uTime * 0.0020
					);

					float detail = clamp(uCloudDetailStrength, 0.0, 1.0);

					float large = fbm(warpedNormal * 1.45 + wind);

					float medium = 0.0;
					float bands = 0.0;
					float streaks = 0.0;
					float storm = 0.0;

					float latitude = asin(clamp(normal.y, -1.0, 1.0));

					float windBandWarp =
						weatherSample.windBand * 2.0 -
						1.0;

					if (detail > 0.02) {
						medium = fbm(warpedNormal * 4.40 + wind * 1.8);

						float bandNoise = fbmLow(warpedNormal * 2.0 + wind) - 0.5;

						bands =
							0.5 +
							0.5 *
							sin(
								latitude * 8.4 +
								bandNoise * 5.2 +
								windBandWarp * 0.85
							);

						bands = smoothstep(0.38, 0.92, bands);
					} else {
						bands =
							0.5 +
							0.5 *
							sin(
								latitude * 8.4 +
								windBandWarp * 0.85
							);

						bands = smoothstep(0.40, 0.90, bands);
					}

					if (detail > 0.45) {
						streaks =
							1.0 -
							abs(fbmLow(warpedNormal * 6.0 + wind * 2.2) - 0.5) * 2.0;

						streaks = pow(clamp(streaks, 0.0, 1.0), 1.35);

						float stormNoise =
							fbmLow(
								warpedNormal * 7.2 +
								wind * 3.2 +
								vec3(17.0, 3.0, 11.0)
							);

						storm =
							smoothstep(0.70, 0.94, stormNoise) *
							weatherSample.stormPotential;
					}

					float d =
						large * mix(0.50, 0.36, detail) +
						medium * 0.31 * detail +
						bands * mix(0.34, 0.18, detail) +
						streaks * 0.09 * detail +
						storm * 0.10 * detail;

					float climateMultiplier = mix(
						0.74,
						1.22,
						climateSample.cloudPotential
					);

					float weatherMultiplier = mix(
						0.78,
						1.28,
						weatherSample.cloudBoost
					);

					float highPressureBreakup = mix(
						1.0,
						0.80,
						weatherSample.highPressure
					);

					d *= mix(
						1.0,
						climateMultiplier,
						uClimateInfluence
					);

					d *= mix(
						1.0,
						weatherMultiplier,
						uWeatherInfluence
					);

					d *= highPressureBreakup;

					d += storm * uStormInfluence * 0.070 * detail;

					d = smoothstep(uCoverage, uCoverage + 0.175, d);
					d = pow(d, 1.30);

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

					vec3 basePoint = rayOrigin + rayDirection * tNear;
					vec3 baseNormal = normalize(basePoint);

					ClimateSample climateSample = getClimateSampleGL(baseNormal);
					WeatherSample weatherSample = getWeatherSampleGL(
						baseNormal,
						climateSample
					);

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

						float d = cloudDensity(
							p,
							climateSample,
							weatherSample
						) * uDensity;

						if (d <= 0.012) {
							continue;
						}

						vec3 n = normalize(p);

						float sunDot = dot(n, sunDirection);

						float dayLight = smoothstep(-0.22, 0.70, sunDot);
						float directLight = pow(max(sunDot, 0.0), 0.54);

						float viewFacing =
							clamp(dot(n, -rayDirection), 0.0, 1.0);

						float limbFade = smoothstep(0.012, 0.22, viewFacing);

						vec3 shadowColor = vec3(0.56, 0.59, 0.64);
						vec3 midColor = vec3(0.94, 0.955, 0.965);
						vec3 sunColor = vec3(1.0, 0.995, 0.985);

						vec3 cloudColor = mix(
							shadowColor,
							midColor,
							dayLight
						);

						cloudColor = mix(
							cloudColor,
							sunColor,
							directLight * 0.88
						);

						float forwardLight =
							smoothstep(0.28, 0.98, dot(-rayDirection, sunDirection));

						cloudColor +=
							vec3(1.0, 0.84, 0.60) *
							forwardLight *
							dayLight *
							0.105;

						float silverLining =
							pow(1.0 - viewFacing, 2.4) *
							dayLight *
							smoothstep(-0.08, 0.72, sunDot);

						cloudColor +=
							vec3(0.82, 0.94, 1.0) *
							silverLining *
							0.055;

						cloudColor *= 1.12;

						float sampleAlpha =
							1.0 - exp(-d * stepSize * 1.42);

						sampleAlpha *= mix(0.36, 1.0, dayLight);
						sampleAlpha *= mix(0.62, 1.0, limbFade);
						sampleAlpha *= 1.0 - alpha;

						color += cloudColor * sampleAlpha;
						alpha += sampleAlpha;

						if (alpha > 0.92) {
							break;
						}
					}

					vec3 frontPoint = rayOrigin + rayDirection * tNear;
					vec3 frontNormal = normalize(frontPoint);

					float limb = abs(dot(frontNormal, -rayDirection));
					float finalLimbFade = smoothstep(0.010, 0.145, limb);

					alpha *= mix(0.55, 1.0, finalLimbFade);
					color *= mix(0.84, 1.0, finalLimbFade);

					alpha *= uCloudAlpha;
					alpha = clamp(alpha, 0.0, 0.76);

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
		this.material.uniforms.uTime.value += deltaSeconds * 0.14;
	}

	setSunDirection(direction: THREE.Vector3): void {
		this.material.uniforms.uSunDirection.value.copy(direction).normalize();
	}

	setRenderQuality(quality: CloudRenderQuality): void {
		if (quality === this.currentRenderQuality) {
			return;
		}

		this.currentRenderQuality = quality;

		if (quality === 'moving') {
			this.material.uniforms.uCloudDetailStrength.value = 0.0;
			return;
		}

		this.material.uniforms.uCloudDetailStrength.value = 1.0;
	}

	setCloudProfile(
		cloudCoverage: number,
		atmosphereDensity: number,
	): void {
		const normalizedCoverage = THREE.MathUtils.clamp(
			cloudCoverage,
			0,
			1,
		);

		const normalizedDensity = THREE.MathUtils.clamp(
			atmosphereDensity / 2.5,
			0,
			1,
		);

		this.profileCloudCoverage = THREE.MathUtils.lerp(
			0.66,
			0.43,
			normalizedCoverage,
		);

		this.profileCloudDensity = THREE.MathUtils.lerp(
			1.20,
			2.85,
			Math.max(normalizedCoverage, normalizedDensity),
		);

		this.profileCloudAlpha = THREE.MathUtils.lerp(
			0.28,
			0.92,
			normalizedCoverage,
		);

		this.material.uniforms.uCoverage.value = this.profileCloudCoverage;
		this.material.uniforms.uDensity.value = this.profileCloudDensity;
		this.material.uniforms.uCloudAlpha.value = this.profileCloudAlpha;
	}

	updateLOD(cameraDistance: number, planetRadius: number): void {
		const heightAboveSurface = cameraDistance - planetRadius;

		if (heightAboveSurface > 8) {
			this.material.uniforms.uDensity.value =
				this.profileCloudDensity * 0.86;
			this.material.uniforms.uCoverage.value = THREE.MathUtils.clamp(
				this.profileCloudCoverage + 0.030,
				0.35,
				0.78,
			);
			this.material.uniforms.uClimateInfluence.value = 0.21;
			this.material.uniforms.uWeatherInfluence.value = 0.15;
			this.material.uniforms.uStormInfluence.value = 0.08;
			this.material.uniforms.uCloudAlpha.value =
				this.profileCloudAlpha * 0.90;
			return;
		}

		if (heightAboveSurface > 3) {
			this.material.uniforms.uDensity.value = this.profileCloudDensity;
			this.material.uniforms.uCoverage.value = this.profileCloudCoverage;
			this.material.uniforms.uClimateInfluence.value = 0.26;
			this.material.uniforms.uWeatherInfluence.value = 0.20;
			this.material.uniforms.uStormInfluence.value = 0.12;
			this.material.uniforms.uCloudAlpha.value = this.profileCloudAlpha;
			return;
		}

		this.material.uniforms.uDensity.value =
			this.profileCloudDensity * 1.15;
		this.material.uniforms.uCoverage.value = THREE.MathUtils.clamp(
			this.profileCloudCoverage - 0.030,
			0.35,
			0.78,
		);
		this.material.uniforms.uClimateInfluence.value = 0.31;
		this.material.uniforms.uWeatherInfluence.value = 0.24;
		this.material.uniforms.uStormInfluence.value = 0.16;
		this.material.uniforms.uCloudAlpha.value =
			this.profileCloudAlpha * 1.08;
	}
}
