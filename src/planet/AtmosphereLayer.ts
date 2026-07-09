import * as THREE from 'three';
import { SUN_DIRECTION } from './Sun';

export class AtmosphereLayer {
	public readonly mesh: THREE.Mesh;

	private readonly material: THREE.ShaderMaterial;

	constructor(radius: number) {
		const atmosphereRadius = radius * 1.035;

		const geometry = new THREE.SphereGeometry(atmosphereRadius, 160, 160);

		this.material = new THREE.ShaderMaterial({
			                                         transparent: true,
			                                         depthWrite: false,
			                                         depthTest: true,
			                                         side: THREE.FrontSide,
			                                         blending: THREE.AdditiveBlending,
			                                         uniforms: {
				                                         uPlanetRadius: {
					                                         value: radius,
				                                         },
				                                         uAtmosphereRadius: {
					                                         value: atmosphereRadius,
				                                         },
				                                         uSunDirection: {
					                                         value: SUN_DIRECTION.clone(),
				                                         },
				                                         uSunIntensity: {
					                                         value: 38.0,
				                                         },
				                                         uRayleighStrength: {
					                                         value: 0.82,
				                                         },
				                                         uMieStrength: {
					                                         value: 0.62,
				                                         },
				                                         uMieG: {
					                                         value: 0.80,
				                                         },
				                                         uAtmosphereAlpha: {
					                                         value: 1.20,
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

				uniform float uPlanetRadius;
				uniform float uAtmosphereRadius;
				uniform vec3 uSunDirection;

				uniform float uSunIntensity;
				uniform float uRayleighStrength;
				uniform float uMieStrength;
				uniform float uMieG;
				uniform float uAtmosphereAlpha;

				const int VIEW_STEPS = 16;
				const int LIGHT_STEPS = 6;

				const float PI = 3.141592653589793;

				const vec3 INV_WAVELENGTH4 = vec3(
					5.602,
					9.473,
					19.643
				);

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

				float rayleighPhase(float mu) {
					return 3.0 / (16.0 * PI) * (1.0 + mu * mu);
				}

				float hgPhase(float mu, float g) {
					float g2 = g * g;

					float denominator = pow(
						1.0 + g2 - 2.0 * g * mu,
						1.5
					);

					return (1.0 / (4.0 * PI)) *
						((1.0 - g2) / max(0.0001, denominator));
				}

				float getHeight01(vec3 position) {
					float height = length(position) - uPlanetRadius;
					float atmosphereHeight = uAtmosphereRadius - uPlanetRadius;

					return clamp(height / atmosphereHeight, 0.0, 1.0);
				}

				float rayleighDensity(float height01) {
					return exp(-height01 / 0.25);
				}

				float mieDensity(float height01) {
					return exp(-height01 / 0.10);
				}

				vec2 opticalDepth(
					vec3 rayOrigin,
					vec3 rayDirection,
					float rayLength
				) {
					float stepLength = rayLength / float(LIGHT_STEPS);
					float atmosphereHeight = uAtmosphereRadius - uPlanetRadius;

					vec3 samplePoint =
						rayOrigin +
						rayDirection *
						stepLength *
						0.5;

					vec2 depth = vec2(0.0);

					for (int i = 0; i < LIGHT_STEPS; i++) {
						float height01 = getHeight01(samplePoint);

						depth.x += rayleighDensity(height01);
						depth.y += mieDensity(height01);

						samplePoint += rayDirection * stepLength;
					}

					return depth * stepLength / atmosphereHeight;
				}

				void main() {
					vec3 rayOrigin = cameraPosition;
					vec3 rayDirection = normalize(vWorldPosition - cameraPosition);
					vec3 sunDirection = normalize(uSunDirection);

					float tNear = sphereIntersectionNear(
						rayOrigin,
						rayDirection,
						uAtmosphereRadius
					);

					float tFar = sphereIntersectionFar(
						rayOrigin,
						rayDirection,
						uAtmosphereRadius
					);

					if (tFar < 0.0) {
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

					float rayLength = tFar - tNear;
					float stepLength = rayLength / float(VIEW_STEPS);
					float atmosphereHeight = uAtmosphereRadius - uPlanetRadius;

					vec3 samplePoint =
						rayOrigin +
						rayDirection *
						(tNear + stepLength * 0.5);

					vec2 viewDepth = vec2(0.0);

					vec3 rayleighSum = vec3(0.0);
					vec3 mieSum = vec3(0.0);

					vec3 betaRayleigh =
						INV_WAVELENGTH4 *
						0.0025 *
						uRayleighStrength;

					vec3 betaMie =
						vec3(0.0040) *
						uMieStrength;

					for (int i = 0; i < VIEW_STEPS; i++) {
						float height01 = getHeight01(samplePoint);

						float localRayleigh = rayleighDensity(height01);
						float localMie = mieDensity(height01);

						viewDepth.x +=
							localRayleigh *
							stepLength /
							atmosphereHeight;

						viewDepth.y +=
							localMie *
							stepLength /
							atmosphereHeight;

						float tSun = sphereIntersectionFar(
							samplePoint,
							sunDirection,
							uAtmosphereRadius
						);

						float tSunPlanet = sphereIntersectionNear(
							samplePoint,
							sunDirection,
							uPlanetRadius
						);

						if (tSun > 0.0 && tSunPlanet < 0.0) {
							vec2 sunDepth = opticalDepth(
								samplePoint,
								sunDirection,
								tSun
							);

							vec3 extinction =
								exp(
									-(
										betaRayleigh *
										(viewDepth.x + sunDepth.x) *
										5.0 +

										betaMie *
										(viewDepth.y + sunDepth.y) *
										5.0
									)
								);

							rayleighSum +=
								extinction *
								localRayleigh *
								stepLength /
								atmosphereHeight;

							mieSum +=
								extinction *
								localMie *
								stepLength /
								atmosphereHeight;
						}

						samplePoint += rayDirection * stepLength;
					}

					float mu = dot(rayDirection, sunDirection);

					float phaseRayleigh = rayleighPhase(mu);
					float phaseMie = hgPhase(mu, uMieG);

					vec3 color =
						uSunIntensity *
						(
							rayleighSum *
							betaRayleigh *
							phaseRayleigh +

							mieSum *
							betaMie *
							phaseMie
						);

					vec3 normal = normalize(vWorldPosition);
					vec3 viewDirection = normalize(cameraPosition - vWorldPosition);

					float viewDot = clamp(dot(normal, viewDirection), 0.0, 1.0);
					float limb = 1.0 - viewDot;
					float sunDot = dot(normal, sunDirection);

					float forwardMie =
						smoothstep(
							0.25,
							0.95,
							dot(viewDirection, sunDirection)
						);

					float dayDisc = smoothstep(-0.25, 0.65, sunDot);

					float mieDisc =
						dayDisc *
						forwardMie *
						(0.10 + pow(limb, 1.35) * 0.75);

					color +=
						vec3(1.0, 0.78, 0.52) *
						mieDisc *
						uMieStrength *
						0.42;

					vec3 limbBlue =
						vec3(0.05, 0.26, 1.0) *
						pow(limb, 3.2) *
						0.38;

					color += limbBlue;

					float luminance = dot(
						color,
						vec3(0.2126, 0.7152, 0.0722)
					);

					float alpha =
						luminance *
						uAtmosphereAlpha +

						pow(limb, 2.8) *
						0.12 +

						mieDisc *
						0.10;

					alpha = clamp(alpha, 0.0, 0.72);

					if (alpha < 0.004) {
						discard;
					}

					gl_FragColor = vec4(color, alpha);
				}
			`,
		                                         });

		this.mesh = new THREE.Mesh(geometry, this.material);
		this.mesh.name = 'AtmosphereLayer';
		this.mesh.renderOrder = 20;
	}

	update(): void {
		// statisch
	}
}
