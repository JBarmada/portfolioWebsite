/**
 * sun.js
 * * Handles the creation of the Procedural Sun using GLSL Shaders.
 * Exports a function 'createSun' that returns the mesh group and materials.
 */

import * as THREE from 'three';

// ----------------------------------------------------------------------------
// GLSL HELPER FUNCTIONS (Noise)
// ----------------------------------------------------------------------------
const noisePars = `
float hash(float n) { return fract(sin(n) * 43758.5453123); }

float noise(vec3 x) {
  vec3 p = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n = p.x + p.y * 57.0 + 113.0 * p.z;
  return mix(
    mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
        mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
    mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
        mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float f = 0.0;
  f += 0.500 * noise(p); p *= 2.02;
  f += 0.250 * noise(p); p *= 2.03;
  f += 0.125 * noise(p); p *= 2.01;
  f += 0.0625 * noise(p);
  return f;
}
`;

// ----------------------------------------------------------------------------
// CORE SHADERS (The Sphere)
// ----------------------------------------------------------------------------

const coreVertexShader = `
precision highp float;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const coreFragmentShader = `
precision highp float;
uniform float iTime;
uniform float uCoreSpeed;
uniform float uWarpStrength;
uniform float uWarpScale;
uniform float uSunTint;
uniform float uSunIntensity;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
${noisePars}

void main() {
  float t = iTime * uCoreSpeed;
  vec3 p0 = vWorldPos * 0.00055; // Texture coordinate scale
  
  // Warp logic for lava effect
  vec3 w1 = vec3(fbm(vec3(p0.xy * uWarpScale, t * 0.22)), fbm(vec3(p0.yz * uWarpScale, t * 0.22)), fbm(vec3(p0.zx * uWarpScale, t * 0.22)));
  vec3 w2 = vec3(fbm(vec3(p0.xy * (uWarpScale * 1.9), t * 0.35 + 10.0)), fbm(vec3(p0.yz * (uWarpScale * 1.9), t * 0.35 + 10.0)), fbm(vec3(p0.zx * (uWarpScale * 1.9), t * 0.35 + 10.0)));
  vec3 warp = ((w1 - 0.5) * 1.2 + (w2 - 0.5) * 0.8) * uWarpStrength;
  vec3 drift = vec3(0.10, 0.04, 0.07) * t;
  vec3 p = p0 + warp + drift;

  // Pattern generation
  float a = fbm(p * 2.2);
  float b = fbm(p * 5.0 - vec3(t * 0.10, t * 0.05, 0.0));
  float c = fbm(p * 10.0 + vec3(0.0, t * 0.14, t * 0.03));
  float heat = 0.55 * a + 0.30 * b + 0.15 * c;

  float cells = fbm(p0 * 1.6 + vec3(0.0, 0.0, t * 0.06));
  heat += 0.10 * sin((cells + heat) * 6.283 + t * 0.9);
  heat = clamp(heat, 0.0, 1.0);

  // Colors
  vec3 colorDark   = vec3(2.0, 0.10, 0.00);
  vec3 colorMid    = vec3(6.0, 2.0, 0.25);
  vec3 colorBright = vec3(10.0, 6.8, 3.5);

  vec3 col = mix(colorDark, colorMid, smoothstep(0.28, 0.62, heat));
  col = mix(col, colorBright, smoothstep(0.62, 1.00, heat));

  // Edge darkening (Fresnel)
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float ndv = clamp(dot(normalize(vWorldNormal), viewDir), 0.0, 1.0);
  col *= (0.62 + 0.38 * pow(ndv, 0.6));
  
  // Apply Config Intensity
  col *= uSunIntensity;
  col.g *= uSunTint;
  col.b *= mix(0.95, uSunTint, 0.7);

  gl_FragColor = vec4(col, 1.0);
}
`;

// ----------------------------------------------------------------------------
// CORONA SHADERS (The Glow Plane)
// ----------------------------------------------------------------------------

const coronaVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const coronaFragmentShader = `
uniform float iTime;
uniform float uCoronaSpeed;
varying vec2 vUv;
${noisePars}

void main() {
  float t = iTime * uCoronaSpeed;
  vec2 uv = -1.0 + 2.0 * vUv;
  float len = length(uv);
  float ang = atan(uv.y, uv.x);
  
  // Swirl and Rays
  float swirl = fbm(vec3(uv * 3.0, t * 0.18));
  
  // --- FIX: Prevent division by zero at the center ---
  if (len > 0.001) {
    uv += normalize(uv) * (swirl - 0.5) * 0.08;
  }
  // ---------------------------------------------------

  float rays = fbm(vec3(ang * 12.0, len * 5.0 - t * 0.30, t * 0.10));
  float glow = fbm(vec3(uv * 2.0, t * 0.14));
  
  float r = len + (rays * 0.08 + glow * 0.04);
  vec3 glowColor = vec3(4.0, 1.5, 0.5);
  vec3 edgeColor = vec3(1.0, 0.2, 0.0);
  
  vec3 col = mix(glowColor, edgeColor, smoothstep(0.30, 0.72, r));
  
  // Alpha masking
  float alpha = smoothstep(0.75, 0.45, r);
  alpha *= smoothstep(0.30, 0.52, r);
  alpha *= (0.88 + 0.12 * glow);
  
  gl_FragColor = vec4(col, alpha);
}
`;

// ----------------------------------------------------------------------------
// EXPORTED GENERATOR FUNCTION
// ----------------------------------------------------------------------------

/**
 * Creates the Sun Group containing Core and Corona.
 * * @param {Object} CONFIG - The configuration object from config.js
 * @returns {Object} { group, coreMaterial, coronaMaterial }
 */
export function createSun(CONFIG) {
  const group = new THREE.Group();
  
  // 1. Position based on Config
  group.position.set(CONFIG.sunPosition.x, CONFIG.sunPosition.y, CONFIG.sunPosition.z);
  
  // 2. Global Scale (This controls the overall size easily)
  group.scale.setScalar(CONFIG.sunGlobalScale);
  group.lookAt(0, 0, 0); // Sun always faces origin

  // --- Create Core Sphere ---
  const coreGeo = new THREE.SphereGeometry(CONFIG.sunCoreRadius, 128, 128);
  const coreMat = new THREE.ShaderMaterial({
    uniforms: {
      iTime: { value: 0 }, // Updated in main loop
      uCoreSpeed: { value: CONFIG.sunCoreSpeed },
      uWarpStrength: { value: CONFIG.sunWarpStrength },
      uWarpScale: { value: CONFIG.sunWarpScale },
      uSunTint: { value: CONFIG.sunTint },
      uSunIntensity: { value: CONFIG.sunIntensity },
    },
    vertexShader: coreVertexShader,
    fragmentShader: coreFragmentShader,
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  group.add(coreMesh);

  // --- Create Corona Plane ---
  const coronaGeo = new THREE.PlaneGeometry(CONFIG.sunCoronaWidth, CONFIG.sunCoronaHeight);
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: {
      iTime: { value: 0 }, // Updated in main loop
      uCoronaSpeed: { value: CONFIG.sunCoronaSpeed },
    },
    vertexShader: coronaVertexShader,
    fragmentShader: coronaFragmentShader,
    transparent: true,
    depthWrite: false,     // Don't block things behind it
    depthTest: false,      // Always draw on top of skybox
    blending: THREE.AdditiveBlending, // Glow effect
    side: THREE.DoubleSide,
  });
  const coronaMesh = new THREE.Mesh(coronaGeo, coronaMat);
  coronaMesh.frustumCulled = false; // Always render even if camera looks away slightly
  group.add(coronaMesh);

  // Return the group and materials so we can animate them
  return {
    group,
    coreMaterial: coreMat,
    coronaMaterial: coronaMat
  };
}