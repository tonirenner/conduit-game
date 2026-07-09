import * as THREE from 'three';
import { SUN_DIRECTION } from './Sun';

export function createPlanetSurfaceMaterial(
	radius = 3,
	atmosphereRadius = radius * 1.045,
): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		                                vertexColors: true,
		                                transparent: false,
		                                depthWrite: true,
		                                depthTest: true,
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
			                                uCameraPosition: {
				                                value: new THREE.Vector3(),
			                                },
			                                uAmbient: {
				                                value: 0.38,
			                                },
			                                uExposure: {
				                                value: 1.30,
			                                },
			                                uSaturation: {
				                                value: 0.84,
			                                },
			                                uTerminatorSoftness: {
				                                value: 0.92,
			                                },
			                                uNightTint: {
				                                value: new THREE.Color(0x061426),
			                                },
			                                uOceanFresnelColor: {
				                                value: new THREE.Color(0x1c7c9a),
			                                },
			                                uOceanDeepTint: {
				                                value: new THREE.Color(0x061d2a),
			                                },
			                                uOceanLightTint: {
				                                value: new THREE.Color(0x2f8da3),
			                                },

			                                // Variante C/D: Aerial Perspective / Low-Orbit-Haze
			                                uRayleighColor: {
				                                value: new THREE.Color(0x6ea8ff),
			                                },
			                                uMieColor: {
				                                value: new THREE.Color(0xffead0),
			                                },
			                                uAtmosphereDensity: {
				                                value: 1.08,
			                                },
			                                uHazeStrength: {
				                                value: 0.82,
			                                },
			                                uMieStrength: {
				                                value: 0.42,
			                                },
			                                uHorizonGlowStrength: {
				                                value: 0.72,
			                                },
			                                uMaxAerialDistance: {
				                                value: 15.0,
			                                },
		                                },
		                                vertexShader: `
			varying vec3 vColor;

			varying vec3 vLocalPosition;
			varying vec3 vLocalNormal;

			varying vec3 vWorldNormal;
			varying vec3 vWorldPosition;

			void main() {
				vColor = color;

				vLocalPosition = position;
				vLocalNormal = normal;

				vec4 worldPosition = modelMatrix * vec4(position, 1.0);

				vWorldPosition = worldPosition.xyz;
				vWorldNormal = normalize(mat3(modelMatrix) * normal);

				gl_Position = projectionMatrix * viewMatrix * worldPosition;
			}
		`,
		                                fragmentShader: `
			precision highp float;

			varying vec3 vColor;

			varying vec3 vLocalPosition;
			varying vec3 vLocalNormal;

			varying vec3 vWorldNormal;
			varying vec3 vWorldPosition;

			uniform float uPlanetRadius;
			uniform float uAtmosphereRadius;

			uniform vec3 uSunDirection;
			uniform vec3 uCameraPosition;

			uniform float uAmbient;
			uniform float uExposure;
			uniform float uSaturation;
			uniform float uTerminatorSoftness;

			uniform vec3 uNightTint;
			uniform vec3 uOceanFresnelColor;
			uniform vec3 uOceanDeepTint;
			uniform vec3 uOceanLightTint;

			uniform vec3 uRayleighColor;
			uniform vec3 uMieColor;
			uniform float uAtmosphereDensity;
			uniform float uHazeStrength;
			uniform float uMieStrength;
			uniform float uHorizonGlowStrength;
			uniform float uMaxAerialDistance;

			const float PI = 3.141592653589793;

			struct TerrainSample {
				float height;
				float landMask;
				float continent;
				float mountainMask;
			};

			float saturate(float value) {
				return clamp(value, 0.0, 1.0);
			}

			vec3 adjustSaturation(vec3 color, float saturation) {
				float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));

				return mix(vec3(luminance), color, saturation);
			}

			float rayleighPhase(float cosTheta) {
				return 3.0 / (16.0 * PI) * (1.0 + cosTheta * cosTheta);
			}

			float hgPhase(float cosTheta, float g) {
				float g2 = g * g;

				float denominator = pow(
					max(0.001, 1.0 + g2 - 2.0 * g * cosTheta),
					1.5
				);

				return (1.0 / (4.0 * PI)) *
					((1.0 - g2) / denominator);
			}

			vec3 rotateVectorFromTo(
				vec3 vector,
				vec3 fromDirection,
				vec3 toDirection
			) {
				vec3 fromDir = normalize(fromDirection);
				vec3 toDir = normalize(toDirection);

				float cosTheta = dot(fromDir, toDir);

				if (cosTheta > 0.9999) {
					return vector;
				}

				if (cosTheta < -0.9999) {
					return -vector;
				}

				vec3 axis = cross(fromDir, toDir);
				float k = 1.0 / (1.0 + cosTheta);

				return vector +
					cross(axis, vector) +
					axis * dot(axis, vector) * k;
			}

			float hash3(vec3 p) {
				return fract(
					sin(
						p.x * 127.1 +
						p.y * 311.7 +
						p.z * 74.7
					) *
					43758.5453123
				);
			}

			float valueNoise3D(vec3 p) {
				vec3 i = floor(p);
				vec3 f = fract(p);

				f = f * f * (3.0 - 2.0 * f);

				float v000 = hash3(i + vec3(0.0, 0.0, 0.0));
				float v100 = hash3(i + vec3(1.0, 0.0, 0.0));
				float v010 = hash3(i + vec3(0.0, 1.0, 0.0));
				float v110 = hash3(i + vec3(1.0, 1.0, 0.0));

				float v001 = hash3(i + vec3(0.0, 0.0, 1.0));
				float v101 = hash3(i + vec3(1.0, 0.0, 1.0));
				float v011 = hash3(i + vec3(0.0, 1.0, 1.0));
				float v111 = hash3(i + vec3(1.0, 1.0, 1.0));

				float x00 = mix(v000, v100, f.x);
				float x10 = mix(v010, v110, f.x);
				float x01 = mix(v001, v101, f.x);
				float x11 = mix(v011, v111, f.x);

				float y0 = mix(x00, x10, f.y);
				float y1 = mix(x01, x11, f.y);

				return mix(y0, y1, f.z);
			}

			float fbm(vec3 p) {
				float value = 0.0;
				float amplitude = 0.5;
				float frequency = 1.0;

				for (int i = 0; i < 6; i++) {
					value += amplitude * valueNoise3D(p * frequency);

					frequency *= 2.0;
					amplitude *= 0.5;
				}

				return value;
			}

			TerrainSample getTerrainSampleGL(vec3 normal) {
				float continentBase = fbm(normal * 1.25);

				float coastNoise =
					(fbm(normal * 2.4) - 0.5) *
					0.045;

				float continent = continentBase + coastNoise;

				float landMask = smoothstep(
					0.505,
					0.605,
					continent
				);

				float highlands = max(0.0, continent - 0.54);

				float mountainMask = smoothstep(
					0.66,
					0.82,
					continent
				);

				float mountains =
					pow(fbm(normal * 7.0), 2.4) *
					mountainMask;

				float detail =
					(fbm(normal * 18.0) - 0.5) *
					0.012 *
					landMask;

				float height =
					landMask * 0.01 +
					highlands * 0.12 +
					mountains * 0.09 +
					detail;

				TerrainSample terrainSample;

				terrainSample.height = max(0.0, height);
				terrainSample.landMask = landMask;
				terrainSample.continent = continent;
				terrainSample.mountainMask = mountainMask;

				return terrainSample;
			}

			void getTangentBasis(
				vec3 normal,
				out vec3 tangentA,
				out vec3 tangentB
			) {
				vec3 reference;

				if (abs(normal.y) < 0.95) {
					reference = vec3(0.0, 1.0, 0.0);
				} else {
					reference = vec3(1.0, 0.0, 0.0);
				}

				tangentA = normalize(cross(reference, normal));
				tangentB = normalize(cross(normal, tangentA));
			}

			float getTerrainHeightGL(vec3 normal) {
				TerrainSample terrainSample = getTerrainSampleGL(normal);

				return terrainSample.height;
			}

			vec3 getProceduralTerrainNormal(vec3 normal) {
				vec3 tangentA;
				vec3 tangentB;

				getTangentBasis(normal, tangentA, tangentB);

				float epsilon = 0.003;

				vec3 nA1 = normalize(normal + tangentA * epsilon);
				vec3 nA2 = normalize(normal - tangentA * epsilon);
				vec3 nB1 = normalize(normal + tangentB * epsilon);
				vec3 nB2 = normalize(normal - tangentB * epsilon);

				vec3 pA1 = nA1 * (uPlanetRadius + getTerrainHeightGL(nA1));
				vec3 pA2 = nA2 * (uPlanetRadius + getTerrainHeightGL(nA2));
				vec3 pB1 = nB1 * (uPlanetRadius + getTerrainHeightGL(nB1));
				vec3 pB2 = nB2 * (uPlanetRadius + getTerrainHeightGL(nB2));

				return normalize(cross(pA1 - pA2, pB1 - pB2));
			}

			vec3 getTerrainColorGL(TerrainSample terrainSample, vec3 normal) {
				float land = terrainSample.landMask;
				float height = terrainSample.height;

				vec3 deepWater = vec3(0.027, 0.122, 0.184);
				vec3 midWater = vec3(0.047, 0.208, 0.271);
				vec3 shallowWater = vec3(0.082, 0.329, 0.388);
				vec3 coastalWater = vec3(0.114, 0.416, 0.439);

				vec3 wetCoast = vec3(0.337, 0.380, 0.302);
				vec3 lowLand = vec3(0.192, 0.365, 0.208);
				vec3 grass = vec3(0.247, 0.427, 0.231);
				vec3 hills = vec3(0.349, 0.408, 0.259);
				vec3 dryHills = vec3(0.443, 0.416, 0.306);
				vec3 rock = vec3(0.412, 0.404, 0.357);
				vec3 snow = vec3(0.682, 0.698, 0.655);

				if (land < 0.30) {
					return mix(deepWater, midWater, smoothstep(0.00, 0.30, land));
				}

				if (land < 0.43) {
					return mix(midWater, shallowWater, smoothstep(0.30, 0.43, land));
				}

				if (land < 0.54) {
					return mix(shallowWater, coastalWater, smoothstep(0.43, 0.54, land));
				}

				if (land < 0.62) {
					return mix(coastalWater, wetCoast, smoothstep(0.54, 0.62, land));
				}

				if (land < 0.72) {
					return mix(wetCoast, lowLand, smoothstep(0.62, 0.72, land));
				}

				vec3 color;

				if (height < 0.040) {
					color = mix(lowLand, grass, smoothstep(0.00, 0.040, height));
				} else if (height < 0.090) {
					color = mix(grass, hills, smoothstep(0.040, 0.090, height));
				} else if (height < 0.150) {
					color = mix(hills, dryHills, smoothstep(0.090, 0.150, height));
				} else if (height < 0.220) {
					color = mix(dryHills, rock, smoothstep(0.150, 0.220, height));
				} else {
					color = mix(rock, snow, smoothstep(0.220, 0.320, height));
				}

				float polar = smoothstep(0.74, 0.98, abs(normal.y));

				color = mix(
					color,
					vec3(0.490, 0.525, 0.455),
					polar * 0.16
				);

				return color;
			}

			float pseudoNoise(vec3 p) {
				return fract(
					sin(
						dot(
							p,
							vec3(12.9898, 78.233, 37.719)
						)
					) *
					43758.5453
				);
			}

			vec3 applyAerialPerspective(
				vec3 surfaceColor,
				vec3 worldNormal,
				vec3 viewDirection,
				vec3 cameraToSurface,
				vec3 sunDirection,
				float ndl,
				float twilight
			) {
				float cameraHeight = length(uCameraPosition);
				float viewDistance = length(uCameraPosition - vWorldPosition);

				float atmosphereThickness =
					max(0.001, uAtmosphereRadius - uPlanetRadius);

				float cameraAltitude01 =
					clamp(
						(cameraHeight - uPlanetRadius) / atmosphereThickness,
						0.0,
						1.5
					);

				float lowAltitude =
					1.0 - smoothstep(0.50, 1.25, cameraAltitude01);

				float nearAtmosphere =
					1.0 - smoothstep(1.05, 1.50, cameraAltitude01);

				float horizon =
					pow(
						1.0 - saturate(dot(worldNormal, viewDirection)),
						2.15
					);

				float distanceFactor =
					saturate(viewDistance / uMaxAerialDistance);

				float daySide =
					smoothstep(-0.18, 0.46, ndl);

				float grazingView =
					pow(
						1.0 - saturate(dot(worldNormal, viewDirection)),
						3.0
					);

				float lowAltitudeGroundHaze =
					lowAltitude *
					smoothstep(0.18, 0.92, distanceFactor) *
					(0.25 + grazingView * 1.35);

				float aerialAmount =
					distanceFactor *
					(0.22 + horizon * 1.18 + lowAltitudeGroundHaze) *
					(0.34 + nearAtmosphere * 0.76) *
					uHazeStrength;

				aerialAmount = saturate(aerialAmount);

				float cosTheta = dot(cameraToSurface, sunDirection);

				float rayleigh =
					rayleighPhase(cosTheta);

				float mie =
					hgPhase(cosTheta, 0.78);

				vec3 extinction =
					vec3(0.82, 1.06, 1.55) *
					uAtmosphereDensity *
					aerialAmount;

				vec3 transmittance = exp(-extinction);

				vec3 inscatter = vec3(0.0);

				inscatter +=
					uRayleighColor *
					rayleigh *
					aerialAmount *
					(0.34 + daySide * 0.66);

				inscatter +=
					uMieColor *
					mie *
					aerialAmount *
					horizon *
					(0.24 + daySide * 0.76) *
					uMieStrength;

				inscatter +=
					uRayleighColor *
					horizon *
					daySide *
					aerialAmount *
					uHorizonGlowStrength *
					0.085;

				inscatter +=
					vec3(0.18, 0.25, 0.38) *
					twilight *
					horizon *
					aerialAmount *
					0.20;

				inscatter +=
					vec3(0.62, 0.76, 0.95) *
					horizon *
					lowAltitude *
					daySide *
					aerialAmount *
					0.075;

				// Neuer Teil:
				// Nicht nur der Atmosphärenbogen wird milchig,
				// sondern auch die Bodenfläche in flachem Blickwinkel.
				inscatter +=
					vec3(0.78, 0.86, 0.96) *
					lowAltitudeGroundHaze *
					daySide *
					uHazeStrength *
					0.16;

				return surfaceColor * transmittance + inscatter;
			}

			void main() {
				// Surface-/Terrain-/Noise-Sampling bleibt im lokalen Planet-Raum.
				// Lighting/View/Aerial-Perspective bleibt im World Space.
				vec3 localGeometricNormal = normalize(vLocalPosition);
				vec3 worldGeometricNormal = normalize(vWorldPosition);

				vec3 meshNormal = normalize(vWorldNormal);

				vec3 viewDirection = normalize(uCameraPosition - vWorldPosition);
				vec3 cameraToSurface = normalize(vWorldPosition - uCameraPosition);
				vec3 sunDirection = normalize(uSunDirection);

				TerrainSample surfaceSample = getTerrainSampleGL(localGeometricNormal);

				vec3 proceduralColor = getTerrainColorGL(
					surfaceSample,
					localGeometricNormal
				);

				vec3 baseColor = mix(
					vColor,
					proceduralColor,
					0.25
				);

				float landMask = surfaceSample.landMask;

				float waterHint =
					1.0 -
					smoothstep(0.42, 0.76, landMask);

				waterHint = saturate(waterHint);

				baseColor = adjustSaturation(baseColor, uSaturation);

				baseColor = mix(
					baseColor,
					uOceanDeepTint,
					waterHint * 0.16
				);

				float oceanNoise =
					pseudoNoise(localGeometricNormal * 42.0) * 0.5 +
					pseudoNoise(localGeometricNormal * 96.0 + vec3(4.7)) * 0.5;

				oceanNoise -= 0.5;

				baseColor +=
					vec3(0.0, 0.014, 0.022) *
					oceanNoise *
					waterHint *
					0.35;

				vec3 localProceduralNormal =
					getProceduralTerrainNormal(localGeometricNormal);

				vec3 worldProceduralNormal =
					rotateVectorFromTo(
						localProceduralNormal,
						localGeometricNormal,
						worldGeometricNormal
					);

				float proceduralNormalStrength =
					0.10 + landMask * 0.16;

				vec3 normal = normalize(
					mix(
						meshNormal,
						worldProceduralNormal,
						proceduralNormalStrength
					)
				);

				float ndl = dot(normal, sunDirection);

				float day = smoothstep(
					-uTerminatorSoftness,
					uTerminatorSoftness,
					ndl
				);

				float directLight = pow(max(ndl, 0.0), 0.58);

				float localAmbient = mix(
					uAmbient * 0.94,
					uAmbient,
					1.0 - waterHint * 0.35
				);

				vec3 dayColor =
					baseColor *
					(localAmbient + directLight * 1.05);

				vec3 nightColor =
					uNightTint +
					baseColor * 0.20;

				vec3 color = mix(nightColor, dayColor, day);

				float fresnel =
					pow(
						1.0 - saturate(dot(normal, viewDirection)),
						3.15
					);

				color +=
					uOceanFresnelColor *
					fresnel *
					waterHint *
					day *
					0.13;

				vec3 halfDirection = normalize(sunDirection + viewDirection);

				float specDot = max(dot(normal, halfDirection), 0.0);

				float tightSpecular =
					pow(specDot, 96.0) *
					waterHint *
					day *
					0.22;

				float broadSpecular =
					pow(specDot, 18.0) *
					waterHint *
					day *
					0.035;

				color += vec3(1.0, 0.95, 0.82) * tightSpecular;
				color += uOceanLightTint * broadSpecular;

				float twilight =
					smoothstep(-0.76, 0.10, ndl) *
					(1.0 - smoothstep(0.04, 0.60, ndl));

				color += vec3(0.020, 0.050, 0.090) * twilight;
				color += baseColor * twilight * 0.040;

				color = applyAerialPerspective(
					color,
					worldGeometricNormal,
					viewDirection,
					cameraToSurface,
					sunDirection,
					ndl,
					twilight
				);

				color *= uExposure;
				color = pow(color, vec3(0.91));

				gl_FragColor = vec4(color, 1.0);
			}
		`,
	                                });
}
