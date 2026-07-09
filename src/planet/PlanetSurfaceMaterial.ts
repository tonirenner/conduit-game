import * as THREE from 'three';
import { SUN_DIRECTION } from './Sun';

export function createPlanetSurfaceMaterial(): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		                                vertexColors: true,
		                                extensions: {
			                                derivatives: true,
		                                },
		                                uniforms: {
			                                uSunDirection: {
				                                value: SUN_DIRECTION.clone(),
			                                },
			                                uCameraPosition: {
				                                value: new THREE.Vector3(),
			                                },
			                                uAmbient: {
				                                value: 0.37,
			                                },
			                                uExposure: {
				                                value: 1.38,
			                                },
			                                uSaturation: {
				                                value: 0.82,
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
		                                },
		                                vertexShader: `
			varying vec3 vColor;
			varying vec3 vWorldNormal;
			varying vec3 vWorldPosition;

			void main() {
				vColor = color;

				vec4 worldPosition = modelMatrix * vec4(position, 1.0);

				vWorldPosition = worldPosition.xyz;
				vWorldNormal = normalize(mat3(modelMatrix) * normal);

				gl_Position = projectionMatrix * viewMatrix * worldPosition;
			}
		`,
		                                fragmentShader: `
			precision highp float;

			varying vec3 vColor;
			varying vec3 vWorldNormal;
			varying vec3 vWorldPosition;

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

			float saturate(float value) {
				return clamp(value, 0.0, 1.0);
			}

			vec3 adjustSaturation(vec3 color, float saturation) {
				float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));

				return mix(vec3(luminance), color, saturation);
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

			void main() {
				vec3 normal = normalize(vWorldNormal);
				vec3 viewDirection = normalize(uCameraPosition - vWorldPosition);
				vec3 sunDirection = normalize(uSunDirection);

				float ndl = dot(normal, sunDirection);

				float day = smoothstep(
					-uTerminatorSoftness,
					uTerminatorSoftness,
					ndl
				);

				float directLight = pow(max(ndl, 0.0), 0.58);

				vec3 baseColor = vColor;

				// Sehr weiche Wasser-Schätzung nur aus TerrainPatch-Farbe.
				// Wird NICHT für harte Land/Wasser-Umschaltung benutzt.
				float blueVsRed = baseColor.b - baseColor.r;
				float greenVsBlue = baseColor.g - baseColor.b;
				float luminance = dot(baseColor, vec3(0.2126, 0.7152, 0.0722));
				float darkness = 1.0 - luminance;

				float rawWaterHint =
					smoothstep(-0.025, 0.165, blueVsRed) *
					(1.0 - smoothstep(0.10, 0.30, greenVsBlue)) *
					smoothstep(0.16, 0.72, darkness);

				float waterEdgeWidth = max(fwidth(rawWaterHint) * 1.8, 0.035);

				float waterHint = smoothstep(
					0.30 - waterEdgeWidth,
					0.64 + waterEdgeWidth,
					rawWaterHint
				);

				waterHint = saturate(waterHint);

				// Küsten nur minimal beruhigen, nicht neu erzeugen.
				float coastHint =
					waterHint *
					(1.0 - smoothstep(0.68, 0.96, waterHint)) *
					smoothstep(0.12, 0.32, baseColor.g);

				// Grundfarben natürlicher.
				baseColor = adjustSaturation(baseColor, uSaturation);

				// Land etwas erdiger, aber nicht grau.
				float greenDominance =
					smoothstep(
						0.035,
						0.26,
						baseColor.g - max(baseColor.r, baseColor.b)
					);

				baseColor.r += greenDominance * 0.014;
				baseColor.g *= mix(1.0, 0.91, greenDominance * 0.42);
				baseColor.b += greenDominance * 0.006;

				// Ozean tiefer und weniger grünlich.
				baseColor = mix(
					baseColor,
					uOceanDeepTint,
					waterHint * 0.24
				);

				// Küsten-Cyan leicht abdämpfen.
				baseColor = mix(
					baseColor,
					vec3(
						baseColor.r * 0.92,
						baseColor.g * 0.94,
						baseColor.b * 0.98
					),
					coastHint * 0.22
				);

				// Mini-Variation auf Wasser, damit es nicht wie flache Farbe wirkt.
				float oceanNoise =
					pseudoNoise(normal * 42.0) * 0.5 +
					pseudoNoise(normal * 96.0 + vec3(4.7)) * 0.5;

				oceanNoise = oceanNoise - 0.5;

				baseColor +=
					vec3(0.0, 0.018, 0.026) *
					oceanNoise *
					waterHint *
					0.55;

				// Beleuchtung.
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
					baseColor * 0.18;

				vec3 color = mix(nightColor, dayColor, day);

				// Weicher Ocean-Fresnel.
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

				// Ozean-Glanz: ein schmaler Highlight + breiter softer Glanz.
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

				// Weicher Terminator, etwas bläuliche Reststreuung.
				float twilight =
					smoothstep(-0.76, 0.10, ndl) *
					(1.0 - smoothstep(0.04, 0.60, ndl));

				color += vec3(0.020, 0.050, 0.090) * twilight;

				// Ganz leichte Aufhellung nahe Terminator, damit Surface nicht absäuft.
				color +=
					baseColor *
					twilight *
					0.035;

				color *= uExposure;
				color = pow(color, vec3(0.91));

				gl_FragColor = vec4(color, 1.0);
			}
		`,
	                                });
}
