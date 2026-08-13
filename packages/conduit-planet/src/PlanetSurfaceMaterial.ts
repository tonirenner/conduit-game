import * as THREE from 'three';
import {SUN_DIRECTION} from './Sun';
import { getPlanetClassVisualProfile } from './rendering/PlanetClassVisualProfile';
import { OCEAN_COASTLINE_PROFILE } from './rendering/OceanCoastlineProfile';
import type {SurfaceRenderProfile} from './rendering/SurfaceRenderProfile';

export function createPlanetSurfaceMaterial(
	radius           = 3,
	atmosphereRadius = radius * 1.045,
): THREE.ShaderMaterial {
	const material = new THREE.ShaderMaterial({
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
				                                value: 0.40,
			                                },
			                                uExposure: {
				                                value: 1.16,
			                                },
			                                uSaturation: {
				                                value: 0.82,
			                                },
			                                uTerminatorSoftness: {
				                                value: 0.92,
			                                },
			                                uNightTint: {
				                                value: new THREE.Color(0x0a1b32),
			                                },
			                                uOceanFresnelColor: {
				                                value: new THREE.Color(0x2b8eb6),
			                                },
			                                uOceanDeepTint: {
				                                value: new THREE.Color(0x061d2a),
			                                },
			                                uOceanLightTint: {
				                                value: new THREE.Color(0x4aa5bb),
			                                },

			                                // Performance / RenderQuality
			                                uSurfaceDetailStrength: {
				                                value: 1.0,
			                                },
			                                uProceduralColorStrength: {
				                                value: 0.65,
			                                },
			                                uSurfaceTextureStrength: {
				                                value: 1.0,
			                                },

			                                // Aerial Perspective / Low-Orbit-Haze
			                                uRayleighColor: {
				                                value: new THREE.Color(0x8ec5ff),
			                                },
			                                uMieColor: {
				                                value: new THREE.Color(0xffe6c2),
			                                },
			                                uAtmosphereDensity: {
				                                value: 1.18,
			                                },
			                                uHazeStrength: {
				                                value: 1.15,
			                                },
			                                uMieStrength: {
				                                value: 0.76,
			                                },
			                                uHorizonGlowStrength: {
				                                value: 1.05,
			                                },
			                                uMaxAerialDistance: {
				                                value: 18.0,
			                                },
			                                uPaletteToxic: {
				                                value: 0.0,
			                                },
			                                uPaletteCarbon: {
				                                value: 0.0,
			                                },
			                                uPaletteOceanic: {
				                                value: 0.0,
			                                },
			                                uPaletteIce: {
				                                value: 0.0,
			                                },
			                                uPaletteDesert: {
				                                value: 0.0,
			                                },
			                                uPaletteLava: {
				                                value: 0.0,
			                                },
			                                uPaletteMetallic: {
				                                value: 0.0,
			                                },
			                                uPaletteBarren: {
				                                value: 0.0,
			                                },
			                                uPaletteRocky: {
				                                value: 1.0,
			                                },
			                                uPaletteEarthlike: {
				                                value: 0.0,
			                                },
			                                uProfileOceanBias: {
				                                value: 0.0,
			                                },
			                                uProfileHeightScale: {
				                                value: 1.0,
			                                },
			                                uProfileMountainScale: {
				                                value: 1.0,
			                                },
			                                uVisualAmbientBoost: {
				                                value: 0.0,
			                                },
			                                uVisualDirectLightScale: {
				                                value: 1.02,
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
			uniform float uPaletteToxic;
			uniform float uPaletteCarbon;
			uniform float uPaletteOceanic;
			uniform float uPaletteIce;
			uniform float uPaletteDesert;
			uniform float uPaletteLava;
			uniform float uPaletteMetallic;
			uniform float uPaletteBarren;
			uniform float uPaletteRocky;
			uniform float uPaletteEarthlike;
			uniform float uProfileOceanBias;
			uniform float uProfileHeightScale;
			uniform float uProfileMountainScale;
			uniform float uVisualAmbientBoost;
			uniform float uVisualDirectLightScale;

			uniform float uSurfaceDetailStrength;
			uniform float uProceduralColorStrength;
			uniform float uSurfaceTextureStrength;

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
				float normalizer = 0.0;
				
				for (int i = 0; i < 6; i++) {
					value += amplitude * valueNoise3D(p * frequency);
					normalizer += amplitude;
					
					frequency *= 2.0;
					amplitude *= 0.5;
				}
				
				return value / normalizer;
			}
				
			float ridgedFbm(vec3 p) {
				float value = 0.0;
				float amplitude = 0.52;
				float frequency = 1.0;
				float normalizer = 0.0;
				
				for (int i = 0; i < 5; i++) {
					float n = valueNoise3D(p * frequency);
					
					float ridge = 1.0 - abs(n * 2.0 - 1.0);
					float sharpened = ridge * ridge;
					
					value += sharpened * amplitude;
					normalizer += amplitude;
					
					frequency *= 2.15;
					amplitude *= 0.48;
				}
				
				return value / normalizer;
			}

			TerrainSample getTerrainSampleGL(vec3 normal) {
				float continentBase = fbm(normal * 1.25);
				
				float coastNoise =
				(fbm(normal * 2.4) - 0.5) *
				0.045;
				
				float continent =
					continentBase +
					coastNoise -
					uProfileOceanBias;
				
				float landMask = smoothstep(
				0.525,
				0.585,
				continent
				);
				
				float highlands = max(0.0, continent - 0.54);
				
				float mountainMask =
				smoothstep(0.62, 0.78, continent) *
				landMask *
				uProfileMountainScale;
				
				float ridgeLarge = ridgedFbm(normal * 3.8);
				float ridgeMedium = ridgedFbm(normal * 8.5);
				float ridgeFine = ridgedFbm(normal * 18.0);
				
				float mountainChains =
				smoothstep(0.46, 0.84, ridgeLarge) *
				(
					ridgeMedium * 0.72 +
					ridgeFine * 0.28
				);
				
				float sharpPeaks =
				pow(
				saturate(mountainChains),
				1.75
				);
				
				float mountains =
				sharpPeaks *
				mountainMask;
				
				float foothills =
				smoothstep(0.48, 0.74, ridgeLarge) *
				mountainMask *
				0.45;
				
				float detail =
				(fbm(normal * 24.0) - 0.5) *
				0.010 *
				landMask;
				
				float height =
				(
					landMask * 0.006 +
					highlands * 0.095 +
					foothills * 0.055 +
					mountains * 0.165 +
					detail
				) *
				uProfileHeightScale;
				
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

				if (height < 0.035) {
					color = mix(lowLand, grass, smoothstep(0.00, 0.035, height));
				} else if (height < 0.080) {
					color = mix(grass, hills, smoothstep(0.035, 0.080, height));
				} else if (height < 0.135) {
					color = mix(hills, dryHills, smoothstep(0.080, 0.135, height));
				} else if (height < 0.205) {
					color = mix(dryHills, rock, smoothstep(0.135, 0.205, height));
				} else {
					color = mix(rock, snow, smoothstep(0.205, 0.310, height));
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

			vec3 applyProceduralSurfaceTexture(
				vec3 baseColor,
				TerrainSample terrainSample,
				vec3 normal,
				float waterHint
			) {
				float land = terrainSample.landMask;
				float height = terrainSample.height;

				float textureStrength =
					clamp(
						uSurfaceTextureStrength *
						uProceduralColorStrength,
						0.0,
						1.0
					);

				if (textureStrength <= 0.001) {
					return baseColor;
				}

				float largeDetail =
					fbm(normal * 9.0 + vec3(11.2, 4.7, 8.1));

				float mediumDetail =
					fbm(normal * 22.0 + vec3(3.4, 19.1, 7.6));

				float fineDetail =
					fbm(normal * 54.0 + vec3(41.0, 5.3, 13.7));

				float combinedDetail =
					largeDetail * 0.52 +
					mediumDetail * 0.32 +
					fineDetail * 0.16;

				combinedDetail = combinedDetail - 0.5;

				float bathymetryLarge =
					fbm(normal * 1.65 + vec3(2.7, 11.3, 6.8));

				float bathymetryMedium =
					fbm(normal * 4.25 + vec3(18.4, 3.2, 29.7));

				float oceanBasin =
					waterHint *
					(1.0 - smoothstep(0.24, 0.54, land)) *
					smoothstep(0.38, 0.82, bathymetryLarge);

				float oceanShelf =
					waterHint *
					smoothstep(0.44, 0.58, land) *
					(1.0 - smoothstep(0.64, 0.76, land));

				float oceanVariation =
					(
						bathymetryLarge * 0.70 +
						bathymetryMedium * 0.30 -
						0.5
					);

				float coastMask =
					1.0 -
					smoothstep(
						0.018,
						0.082,
						abs(land - 0.60)
					);

				coastMask = saturate(coastMask);

				float shallowWater =
					waterHint *
					smoothstep(0.38, 0.61, land);

				float deepWater =
					waterHint *
					(1.0 - smoothstep(0.16, 0.50, land));

				float landOnlyMask =
					smoothstep(0.64, 0.72, land);

				float mountainMask =
					smoothstep(0.07, 0.20, height) *
					landOnlyMask;

				vec3 color = baseColor;

				vec3 waterDepthTint = vec3(0.010, 0.052, 0.092);
				vec3 waterBasinTint = vec3(0.004, 0.032, 0.065);
				vec3 shallowTint = vec3(0.052, 0.185, 0.205);
				vec3 shelfTint = vec3(0.040, 0.135, 0.165);
				vec3 coastTint = vec3(0.205, 0.295, 0.240);
				vec3 vegetationTint = vec3(0.105, 0.245, 0.110);
				vec3 dryTint = vec3(0.330, 0.275, 0.155);
				vec3 rockTint = vec3(0.360, 0.350, 0.310);

				color = mix(
					color,
					waterDepthTint,
					deepWater *
					(0.075 + largeDetail * 0.055) *
					textureStrength
				);

				color = mix(
					color,
					waterBasinTint,
					oceanBasin *
					0.16 *
					textureStrength
				);

				color = mix(
					color,
					shelfTint,
					oceanShelf *
					0.045 *
					textureStrength
				);

				color = mix(
					color,
					shallowTint,
					shallowWater *
					(0.030 + mediumDetail * 0.038) *
					textureStrength
				);

				color = mix(
					color,
					coastTint,
					coastMask *
					0.050 *
					textureStrength
				);

				float vegetationPattern =
					smoothstep(0.38, 0.74, largeDetail) *
					(1.0 - mountainMask) *
					landOnlyMask;

				color = mix(
					color,
					vegetationTint,
					vegetationPattern *
					0.13 *
					textureStrength
				);

				float dryPattern =
					smoothstep(0.58, 0.86, mediumDetail) *
					landOnlyMask *
					(1.0 - coastMask) *
					(1.0 - mountainMask * 0.45);

				color = mix(
					color,
					dryTint,
					dryPattern *
					0.10 *
					textureStrength
				);

				color = mix(
					color,
					rockTint,
					mountainMask *
					(0.16 + fineDetail * 0.10) *
					textureStrength
				);

				color +=
					combinedDetail *
					0.055 *
					landOnlyMask *
					textureStrength;

				color +=
					combinedDetail *
					0.014 *
					waterHint *
					textureStrength;

				color +=
					oceanVariation *
					vec3(0.0, 0.012, 0.022) *
					waterHint *
					textureStrength;

				return color;
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
						1.8
					);

				float lowAltitude =
					1.0 - smoothstep(0.75, 1.55, cameraAltitude01);

				float nearAtmosphere =
					1.0 - smoothstep(1.15, 1.75, cameraAltitude01);

				float horizon =
					pow(
						1.0 - saturate(dot(worldNormal, viewDirection)),
						1.85
					);

				float distanceFactor =
					saturate(viewDistance / uMaxAerialDistance);

				float daySide =
					smoothstep(-0.18, 0.46, ndl);

				float grazingView =
					pow(
						1.0 - saturate(dot(worldNormal, viewDirection)),
						2.6
					);

				float lowAltitudeGroundHaze =
					lowAltitude *
					smoothstep(0.12, 0.95, distanceFactor) *
					(0.40 + grazingView * 1.65);

				float aerialAmount =
					distanceFactor *
					(0.30 + horizon * 1.45 + lowAltitudeGroundHaze) *
					(0.40 + nearAtmosphere * 0.90) *
					uHazeStrength;

				aerialAmount = saturate(aerialAmount);

				float cosTheta = dot(cameraToSurface, sunDirection);

				float rayleigh = rayleighPhase(cosTheta);
				float mie = hgPhase(cosTheta, 0.80);

				vec3 extinction =
					vec3(0.74, 0.96, 1.42) *
					uAtmosphereDensity *
					aerialAmount;

				vec3 transmittance = exp(-extinction);

				vec3 inscatter = vec3(0.0);

				inscatter +=
					uRayleighColor *
					rayleigh *
					aerialAmount *
					(0.48 + daySide * 0.82);

				inscatter +=
					uMieColor *
					mie *
					aerialAmount *
					(0.28 + horizon * 0.95) *
					(0.26 + daySide * 0.92) *
					uMieStrength;

				inscatter +=
					uRayleighColor *
					horizon *
					daySide *
					aerialAmount *
					uHorizonGlowStrength *
					0.14;

				inscatter +=
					vec3(0.18, 0.25, 0.38) *
					twilight *
					horizon *
					aerialAmount *
					0.24;

				inscatter +=
					vec3(0.62, 0.78, 1.00) *
					horizon *
					lowAltitude *
					daySide *
					aerialAmount *
					0.11;

				inscatter +=
					vec3(0.88, 0.82, 0.72) *
					lowAltitudeGroundHaze *
					daySide *
					uHazeStrength *
					0.11;

				float sunView =
					smoothstep(0.35, 0.98, dot(viewDirection, sunDirection));

				float sunHaze =
					sunView *
					horizon *
					daySide *
					lowAltitude *
					uMieStrength;

				inscatter +=
					uMieColor *
					(0.18 + grazingView * 0.42) *
					sunHaze;

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
					clamp(uProceduralColorStrength, 0.0, 1.0)
				);

				float landMask = surfaceSample.landMask;

				float waterHint =
					1.0 -
					smoothstep(
						${OCEAN_COASTLINE_PROFILE.waterHintStart.toFixed(3)},
						${OCEAN_COASTLINE_PROFILE.waterHintEnd.toFixed(3)},
						landMask
					);

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

				baseColor = applyProceduralSurfaceTexture(
					baseColor,
					surfaceSample,
					localGeometricNormal,
					waterHint
				);

				if (uPaletteOceanic > 0.001) {
					float islandMask =
						smoothstep(
							${OCEAN_COASTLINE_PROFILE.islandStart.toFixed(3)},
							${OCEAN_COASTLINE_PROFILE.islandEnd.toFixed(3)},
							landMask +
							surfaceSample.height * ${OCEAN_COASTLINE_PROFILE.islandHeightInfluence.toFixed(3)}
						);

					float shelfMask =
						smoothstep(
							${OCEAN_COASTLINE_PROFILE.shelfStart.toFixed(3)},
							${OCEAN_COASTLINE_PROFILE.shelfEnd.toFixed(3)},
							landMask
						) *
						(
							1.0 -
							smoothstep(
								${OCEAN_COASTLINE_PROFILE.shelfFadeStart.toFixed(3)},
								${OCEAN_COASTLINE_PROFILE.shelfFadeEnd.toFixed(3)},
								landMask
							)
						);

					float waveLarge =
						fbm(localGeometricNormal * 42.0 + vec3(6.1, 2.4, 9.7));

					float waveFine =
						fbm(localGeometricNormal * 118.0 + vec3(17.3, 5.9, 1.4));

					float wavePattern =
						(waveLarge * 0.62 + waveFine * 0.38 - 0.5);

					vec3 deepOcean = vec3(0.012, 0.060, 0.150);
					vec3 midOcean = vec3(0.020, 0.235, 0.355);
					vec3 shelfOcean = vec3(0.070, 0.420, 0.500);
					vec3 islandLand = mix(
						vec3(0.105, 0.245, 0.160),
						vec3(0.520, 0.500, 0.320),
						smoothstep(0.02, 0.18, surfaceSample.height)
					);

					vec3 oceanBase = mix(
						deepOcean,
						midOcean,
						smoothstep(0.10, 0.68, landMask)
					);

					oceanBase = mix(
						oceanBase,
						shelfOcean,
						shelfMask * ${OCEAN_COASTLINE_PROFILE.shelfTintStrength.toFixed(3)}
					);

					oceanBase +=
						vec3(0.020, 0.060, 0.075) *
						wavePattern *
						(1.0 - islandMask) *
						${OCEAN_COASTLINE_PROFILE.waveStrength.toFixed(3)};

					baseColor = mix(
						baseColor,
						mix(oceanBase, islandLand, islandMask),
						uPaletteOceanic
					);
				}

				if (uPaletteDesert > 0.001) {
					float duneLarge =
						fbm(localGeometricNormal * 7.5 + vec3(3.2, 12.4, 5.1));

					float duneFine =
						fbm(localGeometricNormal * 34.0 + vec3(18.0, 4.3, 9.2));

					float highlandMask =
						smoothstep(
							0.035,
							0.18,
							surfaceSample.height +
							surfaceSample.mountainMask * 0.08
						);

					vec3 sandLow = mix(
						vec3(0.510, 0.330, 0.150),
						vec3(0.820, 0.590, 0.300),
						smoothstep(0.00, 0.12, surfaceSample.height)
					);

					vec3 rockHigh = mix(
						vec3(0.360, 0.205, 0.105),
						vec3(0.675, 0.455, 0.230),
						smoothstep(
							0.04,
							0.24,
							surfaceSample.height +
							surfaceSample.mountainMask * 0.10
						)
					);

					vec3 desertBase = mix(
						sandLow,
						rockHigh,
						highlandMask
					);

					desertBase +=
						vec3(0.080, 0.050, 0.018) *
						(duneLarge * 0.72 + duneFine * 0.28 - 0.5) *
						0.28;

					baseColor = mix(
						baseColor,
						desertBase,
						uPaletteDesert
					);
				}

				if (uPaletteIce > 0.001) {
					float polar =
						smoothstep(0.62, 0.98, abs(localGeometricNormal.y));

					float crackNoise =
						fbm(localGeometricNormal * 44.0 + vec3(5.4, 19.2, 2.6));

					float crackMask =
						smoothstep(
							0.58,
							0.86,
							crackNoise + surfaceSample.mountainMask * 0.24
						);

					vec3 blueIce = vec3(0.220, 0.520, 0.665);
					vec3 packedIce = vec3(0.760, 0.900, 0.940);
					vec3 frost = vec3(0.930, 0.980, 1.000);

					vec3 iceBase = mix(
						blueIce,
						packedIce,
						smoothstep(
							0.02,
							0.22,
							surfaceSample.height +
							surfaceSample.mountainMask * 0.08
						)
					);

					iceBase = mix(
						iceBase,
						vec3(0.070, 0.245, 0.360),
						crackMask * 0.28
					);

					iceBase = mix(
						iceBase,
						frost,
						polar * 0.36
					);

					baseColor = mix(
						baseColor,
						iceBase,
						uPaletteIce
					);
				}

				if (uPaletteLava > 0.001) {
					float lavaCracks =
						smoothstep(
							0.54,
							1.08,
							surfaceSample.mountainMask +
							surfaceSample.height * 1.35
						);

					float lavaHotspots =
						smoothstep(
							1.02,
							1.24,
							surfaceSample.mountainMask +
							surfaceSample.height * 2.15
						);

					vec3 basalt = mix(
						vec3(0.020, 0.002, 0.001),
						vec3(0.165, 0.018, 0.010),
						smoothstep(
							0.00,
							0.32,
							surfaceSample.height +
							surfaceSample.mountainMask * 0.05
						)
					);

					vec3 lavaGlow = mix(
						vec3(0.420, 0.020, 0.005),
						vec3(0.950, 0.170, 0.035),
						smoothstep(
							0.46,
							0.95,
							lavaCracks + lavaHotspots * 0.75
						)
					);

					vec3 lavaBase =
						basalt +
						lavaGlow *
						(lavaCracks * 0.18 + lavaHotspots * 0.42);

					baseColor = mix(
						baseColor,
						lavaBase,
						uPaletteLava
					);
				}

				if (uPaletteMetallic > 0.001) {
					float highland =
						smoothstep(
							0.035,
							0.20,
							surfaceSample.height +
							surfaceSample.mountainMask * 0.09
						);

					float vein =
						smoothstep(
							0.56,
							0.88,
							fbm(localGeometricNormal * 38.0 + vec3(4.8, 7.1, 16.0))
						) *
						highland;

					vec3 darkMetal = vec3(0.060, 0.075, 0.085);
					vec3 ironPlate = vec3(0.330, 0.330, 0.310);
					vec3 brightOre = vec3(0.680, 0.650, 0.570);

					vec3 metallicBase = mix(
						darkMetal,
						ironPlate,
						highland
					);

					metallicBase = mix(
						metallicBase,
						brightOre,
						vein * 0.36
					);

					baseColor = mix(
						baseColor,
						metallicBase,
						uPaletteMetallic
					);
				}

				if (uPaletteRocky > 0.001) {
					float ridgeNoise =
						fbm(localGeometricNormal * 24.0 + vec3(2.4, 11.6, 8.9));

					float rockHighland =
						smoothstep(
							0.030,
							0.19,
							surfaceSample.height +
							surfaceSample.mountainMask * 0.10
						);

					vec3 lowRock = vec3(0.245, 0.230, 0.205);
					vec3 highRock = vec3(0.620, 0.565, 0.470);
					vec3 ridgeRock = vec3(0.735, 0.700, 0.610);

					vec3 rockyBase = mix(
						lowRock,
						highRock,
						rockHighland
					);

					rockyBase = mix(
						rockyBase,
						ridgeRock,
						smoothstep(0.60, 0.88, ridgeNoise) *
						rockHighland *
						0.28
					);

					baseColor = mix(
						baseColor,
						rockyBase,
						uPaletteRocky
					);
				}

				if (uPaletteBarren > 0.001) {
					float dust =
						fbm(localGeometricNormal * 18.0 + vec3(9.0, 2.5, 7.3));

					vec3 barrenLow = vec3(0.255, 0.225, 0.185);
					vec3 barrenHigh = vec3(0.610, 0.530, 0.405);

					vec3 barrenBase = mix(
						barrenLow,
						barrenHigh,
						smoothstep(
							0.00,
							0.24,
							surfaceSample.height +
							surfaceSample.mountainMask * 0.08
						)
					);

					barrenBase +=
						vec3(0.050, 0.040, 0.030) *
						(dust - 0.5) *
						0.24;

					baseColor = mix(
						baseColor,
						barrenBase,
						uPaletteBarren
					);
				}

				if (uPaletteToxic > 0.001) {
					float polar =
						smoothstep(0.74, 0.98, abs(localGeometricNormal.y));

					float toxicHighlandMask =
						smoothstep(
							0.055,
							0.18,
							surfaceSample.height +
							surfaceSample.mountainMask * 0.10
						);

					float chemicalStain =
						(
							1.0 -
							smoothstep(0.06, 0.20, surfaceSample.height)
						) *
						(1.0 - surfaceSample.mountainMask * 0.62);

					vec3 toxicLowland = mix(
						vec3(0.190, 0.250, 0.230),
						vec3(0.540, 0.625, 0.590),
						smoothstep(0.00, 0.10, surfaceSample.height)
					);

					vec3 toxicHighland = mix(
						vec3(0.290, 0.175, 0.115),
						vec3(0.625, 0.370, 0.220),
						smoothstep(
							0.04,
							0.22,
							surfaceSample.height +
							surfaceSample.mountainMask * 0.08
						)
					);

					vec3 toxicBase = mix(
						toxicLowland,
						toxicHighland,
						toxicHighlandMask
					);

					toxicBase = mix(
						toxicBase,
						vec3(0.760, 0.760, 0.620),
						polar * 0.10 + chemicalStain * 0.30
					);

					baseColor = mix(
						baseColor,
						toxicBase,
						uPaletteToxic
					);
				}

				if (uPaletteCarbon > 0.001) {
					float carbonLargeDetail =
						fbm(localGeometricNormal * 9.0 + vec3(11.2, 4.7, 8.1));

					float carbonMediumDetail =
						fbm(localGeometricNormal * 22.0 + vec3(3.4, 19.1, 7.6));

					float carbonFineDetail =
						fbm(localGeometricNormal * 54.0 + vec3(41.0, 5.3, 13.7));

					float carbonHighlandMask =
						smoothstep(
							0.045,
							0.19,
							surfaceSample.height +
							surfaceSample.mountainMask * 0.08
						);

					float carbonRidges =
						smoothstep(
							0.53,
							0.88,
							carbonMediumDetail * 0.64 + carbonFineDetail * 0.36
						) *
						smoothstep(
							0.025,
							0.17,
							surfaceSample.height +
							surfaceSample.mountainMask * 0.06
						);

					float carbonDust =
						smoothstep(
							0.28,
							0.68,
							carbonLargeDetail * 0.72 + carbonFineDetail * 0.28
						) *
						(1.0 - surfaceSample.mountainMask * 0.55);

					vec3 carbonLowland = mix(
						vec3(0.082, 0.078, 0.074),
						vec3(0.165, 0.153, 0.137),
						smoothstep(0.00, 0.10, surfaceSample.height)
					);

					vec3 carbonHighland = mix(
						vec3(0.239, 0.216, 0.192),
						vec3(0.443, 0.408, 0.369),
						smoothstep(
							0.04,
							0.23,
							surfaceSample.height +
							surfaceSample.mountainMask * 0.08
						)
					);

					vec3 carbonBase = mix(
						carbonLowland,
						carbonHighland,
						carbonHighlandMask
					);

					carbonBase = mix(
						carbonBase,
						vec3(0.561, 0.522, 0.471),
						carbonRidges * 0.42
					);

					carbonBase = mix(
						carbonBase,
						vec3(0.310, 0.235, 0.192),
						carbonDust * 0.24
					);

					baseColor = mix(
						baseColor,
						carbonBase,
						uPaletteCarbon
					);
				}

				vec3 normal = meshNormal;

				if (uSurfaceDetailStrength > 0.001) {
					vec3 localProceduralNormal =
						getProceduralTerrainNormal(localGeometricNormal);

					vec3 worldProceduralNormal =
						rotateVectorFromTo(
							localProceduralNormal,
							localGeometricNormal,
							worldGeometricNormal
						);

					float proceduralNormalStrength =
						(0.10 + landMask * 0.16) *
						uSurfaceDetailStrength;

					normal = normalize(
						mix(
							meshNormal,
							worldProceduralNormal,
							proceduralNormalStrength
						)
					);
				}

				float ndl = dot(normal, sunDirection);

				float day = smoothstep(
					-uTerminatorSoftness,
					uTerminatorSoftness,
					ndl
				);

				float directLight = pow(max(ndl, 0.0), 0.62);

				float localAmbient = mix(
					uAmbient * 0.95,
					uAmbient,
					1.0 - waterHint * 0.35
				);

				vec3 dayColor =
					baseColor *
					(localAmbient + uVisualAmbientBoost + directLight * uVisualDirectLightScale);

				vec3 nightColor =
					uNightTint +
					baseColor * 0.16;

				vec3 color = mix(nightColor, dayColor, day);

				if (uPaletteToxic > 0.001) {
					float toxicRim =
						pow(
							1.0 - saturate(dot(normal, viewDirection)),
							2.1
						);

					color +=
						vec3(0.760, 0.780, 0.610) *
						toxicRim *
						(0.16 + day * 0.22) *
						uPaletteToxic;
				}

				if (uPaletteCarbon > 0.001) {
					float carbonRim =
						pow(
							1.0 - saturate(dot(normal, viewDirection)),
							2.4
						);

					color +=
						vec3(0.620, 0.570, 0.510) *
						carbonRim *
						(0.045 + day * 0.075) *
						uPaletteCarbon;
				}

				if (uPaletteLava > 0.001) {
					float lavaCracks =
						smoothstep(
							0.54,
							1.08,
							surfaceSample.mountainMask +
							surfaceSample.height * 1.35
						);

					float lavaHotspots =
						smoothstep(
							1.02,
							1.24,
							surfaceSample.mountainMask +
							surfaceSample.height * 2.15
						);

					vec3 lavaGlow = mix(
						vec3(0.420, 0.020, 0.005),
						vec3(0.950, 0.170, 0.035),
						smoothstep(
							0.46,
							0.95,
							lavaCracks + lavaHotspots * 0.75
						)
					);

					float lavaEmission =
						(lavaCracks * 0.16 + lavaHotspots * 0.38) *
						uPaletteLava;

					float lavaRim =
						pow(
							1.0 - saturate(dot(normal, viewDirection)),
							1.9
						);

					color =
						mix(
							color,
							color * 0.74,
							uPaletteLava * 0.48
						) +
						lavaGlow *
						lavaEmission *
						(0.42 + day * 0.18) +
						vec3(0.85, 0.08, 0.025) *
						lavaRim *
						uPaletteLava *
						(0.025 + day * 0.030);
				}

				float fresnel =
					pow(
						1.0 - saturate(dot(normal, viewDirection)),
						3.0
					);

				color +=
					uOceanFresnelColor *
					fresnel *
					waterHint *
					day *
					mix(0.16, 0.34, uPaletteOceanic);

				vec3 halfDirection = normalize(sunDirection + viewDirection);

				float specDot = max(dot(normal, halfDirection), 0.0);

				float tightSpecular =
					pow(specDot, 96.0) *
					waterHint *
					day *
					0.24;

				float broadSpecular =
					pow(specDot, 18.0) *
					waterHint *
					day *
					0.050;

				color += vec3(1.0, 0.95, 0.84) * tightSpecular;
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
				color = pow(color, vec3(1.0));

				gl_FragColor = vec4(color, 1.0);
			}
		`,
	                                });

	(material as any).setSurfaceProfile = (
		profile: SurfaceRenderProfile,
	): void => {
		const visualProfile = getPlanetClassVisualProfile(profile.palette);
		const paletteToxic = profile.palette === 'toxic' ? 1.0 : 0.0;
		const paletteCarbon = profile.palette === 'carbon' ? 1.0 : 0.0;
		const paletteOceanic = profile.palette === 'oceanic' ? 1.0 : 0.0;
		const paletteIce = profile.palette === 'ice' ? 1.0 : 0.0;
		const paletteDesert = profile.palette === 'desert' ? 1.0 : 0.0;
		const paletteLava = profile.palette === 'lava' ? 1.0 : 0.0;
		const paletteMetallic = profile.palette === 'metallic' ? 1.0 : 0.0;
		const paletteBarren = profile.palette === 'barren' ? 1.0 : 0.0;
		const paletteRocky = profile.palette === 'rocky' ? 1.0 : 0.0;
		const paletteEarthlike = profile.palette === 'earthlike' ? 1.0 : 0.0;

		material.uniforms.uPaletteToxic.value = paletteToxic;
		material.uniforms.uPaletteCarbon.value = paletteCarbon;
		material.uniforms.uPaletteOceanic.value = paletteOceanic;
		material.uniforms.uPaletteIce.value = paletteIce;
		material.uniforms.uPaletteDesert.value = paletteDesert;
		material.uniforms.uPaletteLava.value = paletteLava;
		material.uniforms.uPaletteMetallic.value = paletteMetallic;
		material.uniforms.uPaletteBarren.value = paletteBarren;
		material.uniforms.uPaletteRocky.value = paletteRocky;
		material.uniforms.uPaletteEarthlike.value = paletteEarthlike;

		material.uniforms.uProfileOceanBias.value =
			profile.waterInfluence * 0.095 +
			paletteOceanic * 0.205 +
			paletteToxic * 0.055 -
			paletteDesert * 0.175 -
			paletteBarren * 0.155 -
			paletteRocky * 0.105 -
			paletteMetallic * 0.135 -
			paletteCarbon * 0.095;

		material.uniforms.uProfileHeightScale.value =
			1.0 -
			paletteOceanic * 0.52 -
			paletteToxic * 0.46 -
			paletteDesert * 0.42 -
			paletteCarbon * 0.28 +
			paletteBarren * 0.22 +
			paletteRocky * 0.14 +
			paletteMetallic * 0.04;

		material.uniforms.uProfileMountainScale.value =
			profile.mountainScale *
			(
				1.0 -
				paletteOceanic * 0.54 -
				paletteToxic * 0.48 -
				paletteDesert * 0.34 -
				paletteCarbon * 0.22 +
				paletteBarren * 0.34 +
				paletteRocky * 0.26 +
				paletteMetallic * 0.48
			);

		material.uniforms.uVisualAmbientBoost.value =
			visualProfile.ambientBoost * 0.35;
		material.uniforms.uVisualDirectLightScale.value =
			visualProfile.directLightScale;
	};

	(material as any).setRenderTuning = (tuning: {
		ambient?: number;
		exposure?: number;
	}): void => {
		if (typeof tuning.ambient === 'number') {
			material.uniforms.uAmbient.value = THREE.MathUtils.clamp(
				tuning.ambient,
				0.12,
				0.90,
			);
		}

		if (typeof tuning.exposure === 'number') {
			material.uniforms.uExposure.value = THREE.MathUtils.clamp(
				tuning.exposure,
				0.55,
				2.20,
			);
		}
	};

	(material as any).setSunDirection = (direction: THREE.Vector3): void => {
		material.uniforms.uSunDirection.value.copy(direction).normalize();
	};

	return material;
}
