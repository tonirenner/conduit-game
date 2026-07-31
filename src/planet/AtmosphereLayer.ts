import * as THREE from 'three';
import { SUN_DIRECTION } from './Sun';

export type AtmosphereRenderQuality = 'moving' | 'idle';

export class AtmosphereLayer {
	public readonly mesh: THREE.Mesh;

	private readonly material: THREE.ShaderMaterial;
	private readonly worldCenter = new THREE.Vector3();

	private profileSunIntensity = 46.0;
	private profileAtmosphereAlpha = 0.86;
	private profileScatteringBoost = 1.0;
	private profileOpacity = 0.58;

	private currentRenderQuality: AtmosphereRenderQuality = 'idle';

	constructor(radius: number) {
		const atmosphereRadius = radius * 1.038;

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
				                                         uPlanetWorldPosition: {
					                                         value: this.worldCenter,
				                                         },
				                                         uSunIntensity: {
					                                         value: 46.0,
				                                         },
				                                         uRayleighStrength: {
					                                         value: 1.36,
				                                         },
				                                         uMieStrength: {
					                                         value: 0.62,
				                                         },
				                                         uMieG: {
					                                         value: 0.82,
				                                         },
				                                         uAtmosphereAlpha: {
					                                         value: 0.86,
				                                         },
				                                         uScatteringBoost: {
					                                         value: 1.0,
				                                         },
				                                         uAtmosphereTint: {
					                                         value: new THREE.Color(0x8ec5ff),
				                                         },
				                                         uLavaAtmosphereMix: {
					                                         value: 0.0,
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
				uniform vec3 uPlanetWorldPosition;

				uniform float uSunIntensity;
				uniform float uRayleighStrength;
				uniform float uMieStrength;
				uniform float uMieG;
				uniform float uAtmosphereAlpha;
				uniform float uScatteringBoost;
				uniform vec3 uAtmosphereTint;
				uniform float uLavaAtmosphereMix;

				const int VIEW_STEPS = 8;
				const int LIGHT_STEPS = 3;

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
						max(0.0001, 1.0 + g2 - 2.0 * g * mu),
						1.5
					);

					return (1.0 / (4.0 * PI)) *
						((1.0 - g2) / denominator);
				}

				float getHeight01(vec3 position) {
					float height = length(position) - uPlanetRadius;
					float atmosphereHeight = uAtmosphereRadius - uPlanetRadius;

					return clamp(height / atmosphereHeight, 0.0, 1.0);
				}

				float rayleighDensity(float height01) {
					return exp(-height01 / 0.22);
				}

				float mieDensity(float height01) {
					return exp(-height01 / 0.080);
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
					vec3 surfacePosition = vWorldPosition - uPlanetWorldPosition;
					vec3 rayOrigin = cameraPosition - uPlanetWorldPosition;
					vec3 rayDirection = normalize(surfacePosition - rayOrigin);
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
						0.0029 *
						uRayleighStrength *
						uScatteringBoost;

					vec3 betaMie =
						vec3(0.0034) *
						uMieStrength *
						uScatteringBoost;

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
										3.35 +

										betaMie *
										(viewDepth.y + sunDepth.y) *
										2.65
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

					vec3 normal = normalize(surfacePosition);
					vec3 viewDirection = normalize(rayOrigin - surfacePosition);

					float viewDot = clamp(dot(normal, viewDirection), 0.0, 1.0);
					float limb = 1.0 - viewDot;

					float limbSoft = pow(limb, 2.05);
					float limbSharp = pow(limb, 4.4);
					float limbUltra = pow(limb, 11.0);

					float sunDot = dot(normal, sunDirection);

					float dayDisc = smoothstep(-0.24, 0.68, sunDot);

					float sunEdge =
						smoothstep(-0.10, 0.42, sunDot) *
						(1.0 - smoothstep(0.62, 0.96, sunDot));

					float forwardMie =
						smoothstep(
							0.22,
							0.98,
							dot(viewDirection, sunDirection)
						);

					float backLit =
						smoothstep(
							0.18,
							0.98,
							dot(-viewDirection, sunDirection)
						);

					float mieDisc =
						dayDisc *
						forwardMie *
						limbSharp;

					float horizonSunGlow =
						sunEdge *
						limbSoft *
						(0.55 + forwardMie * 0.75);

					float cinematicRim =
						limbSharp *
						dayDisc *
						(0.68 + forwardMie * 0.45);

					vec3 cyanRimColor =
						mix(
							vec3(0.10, 0.82, 1.0),
							vec3(1.0, 0.22, 0.08),
							uLavaAtmosphereMix
						);

					vec3 deepRimColor =
						mix(
							vec3(0.04, 0.22, 1.0),
							vec3(0.95, 0.10, 0.035),
							uLavaAtmosphereMix
						);

					vec3 horizonLineColor =
						mix(
							vec3(0.86, 0.98, 1.0),
							vec3(1.0, 0.46, 0.20),
							uLavaAtmosphereMix
						);

					vec3 cyanRim =
						cyanRimColor *
						cinematicRim *
						mix(0.82, 0.42, uLavaAtmosphereMix) *
						uScatteringBoost;

					vec3 deepBlueRim =
						deepRimColor *
						limbSoft *
						mix(0.26, 0.13, uLavaAtmosphereMix) *
						dayDisc *
						uScatteringBoost;

					vec3 whiteHorizonLine =
						horizonLineColor *
						limbUltra *
						mix(0.64, 0.30, uLavaAtmosphereMix) *
						dayDisc *
						uScatteringBoost;

					vec3 warmSunHaze =
						mix(
							vec3(1.0, 0.62, 0.30),
							vec3(1.0, 0.28, 0.08),
							uLavaAtmosphereMix
						) *
						horizonSunGlow *
						uMieStrength *
						mix(0.38, 0.30, uLavaAtmosphereMix) *
						uScatteringBoost;

					vec3 goldenBackScatter =
						mix(
							vec3(1.0, 0.76, 0.46),
							vec3(1.0, 0.34, 0.12),
							uLavaAtmosphereMix
						) *
						backLit *
						limbSharp *
						dayDisc *
						uMieStrength *
						mix(0.16, 0.13, uLavaAtmosphereMix) *
						uScatteringBoost;

					color += cyanRim;
					color += deepBlueRim;
					color += whiteHorizonLine;
					color += warmSunHaze;
					color += goldenBackScatter;

					color +=
						mix(
							vec3(1.0, 0.82, 0.56),
							vec3(1.0, 0.30, 0.10),
							uLavaAtmosphereMix
						) *
						mieDisc *
						uMieStrength *
						uScatteringBoost *
						mix(0.28, 0.22, uLavaAtmosphereMix);

					vec3 paletteTintedColor =
						color *
						mix(
							vec3(1.0),
							uAtmosphereTint,
							0.44 + uLavaAtmosphereMix * 0.46
						);

					vec3 lavaRim =
						vec3(1.0, 0.16, 0.035) *
						uLavaAtmosphereMix *
						limbSharp *
						dayDisc *
						0.34 *
						uScatteringBoost;

					color =
						paletteTintedColor +
						lavaRim;

					float luminance = dot(
						color,
						vec3(0.2126, 0.7152, 0.0722)
					);

					float outerFade =
						smoothstep(0.00, 0.20, viewDot);

					float nightFade =
						smoothstep(-0.35, 0.22, sunDot);

					float alpha =
						luminance *
						uAtmosphereAlpha *

						0.92 +

						limbSharp *
						0.30 *
						dayDisc *
						uScatteringBoost +

						whiteHorizonLine.r *
						0.25 +

						horizonSunGlow *
						0.080 +

						mieDisc *
						0.060;

					alpha *= outerFade;
					alpha *= mix(0.22, 1.0, nightFade);
					alpha *= mix(1.0, 0.58, uLavaAtmosphereMix);

					alpha = clamp(alpha, 0.0, 0.62);

					if (alpha < 0.003) {
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
		this.mesh.getWorldPosition(this.worldCenter);
		this.material.uniforms.uPlanetWorldPosition.value.copy(this.worldCenter);
	}

	setSunDirection(direction: THREE.Vector3): void {
		this.material.uniforms.uSunDirection.value.copy(direction).normalize();
	}

	setAtmosphereProfile(
		density: number,
		haze: number,
		atmosphereColor = '#8ec5ff',
		atmospherePalette = '',
	): void {
		const normalizedDensity = THREE.MathUtils.clamp(
			density / 2.5,
			0,
			1,
		);

		const normalizedHaze = THREE.MathUtils.clamp(
			haze,
			0,
			1,
		);

		const atmosphereStrength = Math.max(
			normalizedDensity,
			normalizedHaze,
		);

		const isLavaAtmosphere =
			      atmospherePalette === 'lava' ||
			      atmospherePalette === 'ash_clouds' ||
			      atmosphereColor.toLowerCase() === '#d65a32' ||
			      atmosphereColor.toLowerCase() === '#b66f48';

		const colorValue = new THREE.Color(
			isLavaAtmosphere ? '#ef3a1f' : atmosphereColor,
		);

		this.material.uniforms.uAtmosphereTint.value.copy(colorValue);
		this.material.uniforms.uLavaAtmosphereMix.value =
			isLavaAtmosphere ? 1.0 : 0.0;


		this.profileSunIntensity = THREE.MathUtils.lerp(
			30.0,
			54.0,
			atmosphereStrength,
		);

		this.profileAtmosphereAlpha = THREE.MathUtils.lerp(
			0.22,
			0.92,
			atmosphereStrength,
		);

		this.profileScatteringBoost = THREE.MathUtils.lerp(
			0.35,
			1.18,
			atmosphereStrength,
		);

		this.profileOpacity = THREE.MathUtils.lerp(
			0.24,
			0.64,
			atmosphereStrength,
		);

		if (isLavaAtmosphere) {
			this.profileSunIntensity *= 0.86;
			this.profileAtmosphereAlpha *= 0.64;
			this.profileScatteringBoost *= 0.72;
			this.profileOpacity *= 0.58;
		}

		this.material.uniforms.uSunIntensity.value = this.profileSunIntensity;
		this.material.uniforms.uAtmosphereAlpha.value = this.profileAtmosphereAlpha;
		this.material.uniforms.uScatteringBoost.value = this.profileScatteringBoost;
		this.material.opacity = this.profileOpacity;
	}

	setRenderQuality(quality: AtmosphereRenderQuality): void {
		if (quality === this.currentRenderQuality) {
			return;
		}

		this.currentRenderQuality = quality;

		if (quality === 'moving') {
			this.material.uniforms.uSunIntensity.value =
				this.profileSunIntensity * 0.74;
			this.material.uniforms.uAtmosphereAlpha.value =
				this.profileAtmosphereAlpha * 0.72;
			this.material.uniforms.uScatteringBoost.value =
				this.profileScatteringBoost * 0.78;
			this.material.opacity = this.profileOpacity * 0.72;
			return;
		}

		this.material.uniforms.uSunIntensity.value = this.profileSunIntensity;
		this.material.uniforms.uAtmosphereAlpha.value = this.profileAtmosphereAlpha;
		this.material.uniforms.uScatteringBoost.value = this.profileScatteringBoost;
		this.material.opacity = this.profileOpacity;
	}
}
