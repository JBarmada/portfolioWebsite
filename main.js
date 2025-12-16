/**
 * main.js
 * * The entry point for the 3D Resume application.
 * Handles scene setup, model loading, user interaction, and the animation loop.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { RESUME_DATA } from './resumeData.js';

// --- MODULAR IMPORTS ---
import { CONFIG } from './config.js'; // All settings
import { createSun } from './sun.js'; // Sun generator

const base = import.meta.env.BASE_URL;

// ============================================================================
// 1. GLOBAL SCENE SETUP
// ============================================================================

// Initialize basic Three.js components
const scene = new THREE.Scene();
const clock = new THREE.Clock(); // Tracks time for animations

// Setup Camera
const camera = new THREE.PerspectiveCamera(CONFIG.camFov, window.innerWidth / window.innerHeight, 0.1, CONFIG.camFar);
camera.position.set(0, 0, CONFIG.homeDistance);

// Setup Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
renderer.toneMapping = THREE.ACESFilmicToneMapping; // Cinematic lighting
renderer.toneMappingExposure = CONFIG.exposure;

// Add Renderer to DOM
document.body.appendChild(renderer.domElement);
renderer.domElement.style.position = 'fixed';
renderer.domElement.style.inset = '0';
renderer.domElement.style.zIndex = '0';
renderer.domElement.style.touchAction = 'none'; // Prevents scrolling on mobile

// ============================================================================
// 2. LOADING MANAGER (Loader Screen)
// ============================================================================

// Controls the "Loading..." overlay
const MIN_LOAD_TIME = 1500; // Minimum time to show loader (ms)
const loadingManager = THREE.DefaultLoadingManager;

loadingManager.onLoad = function() {
    const loadDuration = performance.now(); 
    const remainingDelay = Math.max(0, MIN_LOAD_TIME - loadDuration);

    // Fade out loader after delay
    setTimeout(() => {
        const loaderElement = document.getElementById('loader-overlay');
        if(loaderElement) {
            loaderElement.classList.add('fade-out');
            setTimeout(() => { loaderElement.remove(); }, 1000); 
        }
    }, remainingDelay);
};

// ============================================================================
// 3. BACKGROUND & HTML OVERLAYS
// ============================================================================

// Create a dark overlay to dim the background
const bgDim = document.createElement('div');
Object.assign(bgDim.style, {
  position: 'fixed', inset: '0', background: `rgba(0, 0, 0, ${CONFIG.bgDimOpacity})`,
  pointerEvents: 'none', zIndex: '1',
});
document.body.appendChild(bgDim);

// ============================================================================
// 4. CONTROLS SETUP
// ============================================================================

const controls = new TrackballControls(camera, renderer.domElement);
controls.rotateSpeed = CONFIG.rotateSpeed;
controls.zoomSpeed = CONFIG.zoomSpeed;
controls.panSpeed = CONFIG.panSpeed;
controls.staticMoving = CONFIG.staticMoving;
controls.dynamicDampingFactor = CONFIG.dampingFactor; 
controls.minDistance = CONFIG.minZoom;
controls.maxDistance = CONFIG.maxZoom;
controls.target.set(0, 0, 0); // Look at center

// Variables for Automatic Camera Movement (Flying to faces)
const moveStartPos = new THREE.Vector3();
const moveEndPos = new THREE.Vector3();
const moveControlPos = new THREE.Vector3(); 
const moveStartTarget = new THREE.Vector3();
const moveEndTarget = new THREE.Vector3();
let isAutoMoving = false;
let moveProgress = 0; 
const homeTarget = new THREE.Vector3(0, 0, 0);
const homeCameraPos = new THREE.Vector3(0, 0, CONFIG.homeDistance);

// Stop auto-movement if user interacts
controls.addEventListener('start', () => { isAutoMoving = false; });
renderer.domElement.addEventListener('wheel', () => { isAutoMoving = false; }, { passive: true });

// ============================================================================
// 5. LIGHTING & ENVIRONMENT
// ============================================================================

// --- ORBIT CONFIGURATION ---
// We define the orbit center (Sun) and the radius.
const ORBIT_CENTER = new THREE.Vector3(CONFIG.sunPosition.x, CONFIG.sunPosition.y, CONFIG.sunPosition.z);
// If CONFIG.sunPosition is close, we might want a larger orbit radius for effect
// For now, we calculate an initial offset based on where the Engram is relative to Sun.
// Assuming Engram starts at 0,0,0 and Sun at CONFIG.sunPosition:
let orbitRadius = ORBIT_CENTER.length(); 
let currentOrbitAngle = Math.atan2(-ORBIT_CENTER.z, -ORBIT_CENTER.x); // Opposite of sun pos

// Ambient Light (Base brightness)
scene.add(new THREE.AmbientLight(0xffffff, CONFIG.ambientLightIntensity)); 

// Sun Light (Directional light from the sun position)
// The light source must move if the sun moves, but here the Sun is static and Engram orbits.
const sunLight = new THREE.DirectionalLight(0xfff2cc, 5.0); 
sunLight.position.copy(ORBIT_CENTER);
scene.add(sunLight);

// Rim Light (Blue-ish backlighting)
const rimLight = new THREE.DirectionalLight(0x88aaff, 0.9);
rimLight.position.set(-50, -20, -50);
scene.add(rimLight);

// HDRI Environment (Reflections)
const rgbeLoader = new HDRLoader(loadingManager);
rgbeLoader.load(`${base}textures/reflection.hdr`, (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
  if(scene.environmentIntensity !== undefined) scene.environmentIntensity = 0.5; 
});

// --- ☀️ INITIALIZE SUN (From sun.js) ---
const sunData = createSun(CONFIG);
sunData.group.position.copy(ORBIT_CENTER); // Place Sun Visual at the light source
scene.add(sunData.group);

// --- 🌌 SKY SPHERE ---
const textureLoader = new THREE.TextureLoader(loadingManager);
let skySphere = null;
textureLoader.load(`${base}textures/starts.jpg`, (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  const skyGeo = new THREE.SphereGeometry(90000, 64, 64);
  const skyMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, depthWrite: false });
  skySphere = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skySphere);
});

// ============================================================================
// 6. MODEL LOADING (The Engram)
// ============================================================================

const gltfLoader = new GLTFLoader(loadingManager);
const CLICKABLE_FACES = []; // Array to store faces we can click
const facesById = {};       // Map for easy lookup
let modelRoot = null;
let modelCenterAnchor = null;
const modelCenterWorld = new THREE.Vector3();

// --- STAR SPRITE (The distant glowing dot) ---
function makeGlowTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.15, 'rgba(255, 220, 255, 0.9)');
  grad.addColorStop(0.5, 'rgba(180, 40, 220, 0.5)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const starSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false, opacity: 1.0,
}));
starSprite.visible = false;
starSprite.renderOrder = 999;
scene.add(starSprite);

// Load the GLB Model
gltfLoader.load(`${base}engram1.glb`, (gltf) => {
  modelRoot = gltf.scene;
  scene.add(modelRoot);

  // Calculate center of model
  const box = new THREE.Box3().setFromObject(modelRoot);
  const center = new THREE.Vector3();
  box.getCenter(center);
  modelCenterAnchor = new THREE.Object3D();
  modelCenterAnchor.position.copy(center);
  modelRoot.add(modelCenterAnchor);

  // Determine Orbit Radius based on loaded positions if needed
  // For now we assume Engram starts at (0,0,0) and Sun is at config position.
  // We offset the Engram slightly to start the orbit logic correctly if needed.
  // Using the distance between 0,0,0 and Sun Pos as radius.
  orbitRadius = ORBIT_CENTER.distanceTo(new THREE.Vector3(0,0,0));
  if(orbitRadius < 100) orbitRadius = 500; // Enforce minimum orbit if too close

  // Process Mesh Faces
  let faceCount = 0;
  modelRoot.traverse((child) => {
    if (!child.isMesh) return;
    faceCount++;
    child.userData.id = faceCount;
    
    // Attach Resume Data
    const resumeEntry = RESUME_DATA[faceCount];
    if (resumeEntry) {
      child.userData.title = resumeEntry.title;
      child.userData.content = resumeEntry.content;
    } else {
      child.userData.title = child.name || `Face ${faceCount}`;
      child.userData.content = `<h3>Locked</h3><p>Data not available.</p>`;
    }

    // Clone materials for individual control
    child.material = child.material.clone();
    
    // Check if this is an "inner" part or a "face"
    if (child.name.includes('Inside') || child.name.includes('Core')) {
      child.material.emissive.setHex(CONFIG.colorEmissive);
    } else {
      child.material.map = null;
      child.material.color.setHex(CONFIG.colorBase);
      child.material.emissive.setHex(CONFIG.colorEmissive);
      child.material.roughness = CONFIG.materialRoughness;
      child.material.metalness = CONFIG.materialMetalness;
      child.material.transparent = true;
      child.material.opacity = CONFIG.materialOpacity;
    }
    child.userData.originalEmissive = child.material.emissive.getHex();
    
    // Store reference
    facesById[faceCount] = child;
    CLICKABLE_FACES.push(child);
  });
});

// ============================================================================
// 7. INTERACTION LOGIC (Clicking & Hovering)
// ============================================================================

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let INTERSECTED = null;
let isDragging = false;
let startX = 0; let startY = 0;
let lastPointerUpTime = 0;
let isPointerDown = false;
let currentFaceId = 0; 

// Helper: Normalize mouse coordinates
function updatePointerFromEvent(e) {
  const clientX = e.clientX || (e.touches && e.touches[0]?.clientX);
  const clientY = e.clientY || (e.touches && e.touches[0]?.clientY);
  if (clientX !== undefined) pointer.x = (clientX / window.innerWidth) * 2 - 1;
  if (clientY !== undefined) pointer.y = -(clientY / window.innerHeight) * 2 + 1;
}

// Logic: Zoom to face
function handleFaceClick(faceMesh) {
    const currentScale = modelRoot.scale.x;
    modelRoot.scale.setScalar(1);
    modelRoot.updateMatrixWorld(true);

    currentFaceId = faceMesh.userData.id;
    moveStartPos.copy(camera.position);
    moveStartTarget.copy(controls.target);

    // Calculate target position based on face normal
    const faceCenter = new THREE.Vector3();
    faceMesh.getWorldPosition(faceCenter);
    const faceNormal = new THREE.Vector3().copy(faceCenter).sub(modelRoot.position).normalize();
    
    moveEndTarget.copy(faceCenter);
    moveEndPos.copy(faceCenter).add(faceNormal.multiplyScalar(CONFIG.focusDistance));
    
    // --- FIX: Calculate Curve Relative to Model ---
    // 1. Get the midpoint between start and end
    const midPoint = new THREE.Vector3().addVectors(moveStartPos, moveEndPos).multiplyScalar(0.5);
    
    // 2. Calculate vector from Model Center to that Midpoint
    const vecFromCenter = new THREE.Vector3().subVectors(midPoint, modelRoot.position);
    
    // 3. Push that vector out to the desired altitude (this creates the arc)
    vecFromCenter.normalize().multiplyScalar(CONFIG.flightAltitude);
    
    // 4. Add the Model Position back to get the final World Space control point
    moveControlPos.copy(modelRoot.position).add(vecFromCenter); 
    // ----------------------------------------------

    // Restore scale
    modelRoot.scale.setScalar(currentScale);
    modelRoot.updateMatrixWorld(true);

    moveProgress = 0;
    isAutoMoving = true;
    displayResumeContent(faceMesh.userData);
}

// UI: Show HTML content
function displayResumeContent(data) {
  let contentDiv = document.getElementById('resume-content');
  if (!contentDiv) {
    contentDiv = document.createElement('div');
    contentDiv.id = 'resume-content';
    Object.assign(contentDiv.style, {
      position: 'absolute', top: '20px', left: '20px', background: 'rgba(0,0,0,0.85)',
      color: 'white', padding: '20px', borderRadius: '8px', maxWidth: '300px',
      display: 'none', fontFamily: 'Arial, sans-serif', border: '1px solid #444', zIndex: '10',
    });
    document.body.appendChild(contentDiv);
  }
  contentDiv.innerHTML = `
    <button id="close-content" style="float:right; cursor:pointer; background:none; border:none; color:white; font-weight:bold;">X</button>
    <h3 style="margin-top:0">${data.title}</h3>
    ${data.content}
  `;
  contentDiv.style.display = 'block';
  document.getElementById('close-content').onclick = () => { resetEngram(); };
}

// Logic: Reset to home
function resetEngram() {
  currentFaceId = 0;
  const contentDiv = document.getElementById('resume-content');
  if (contentDiv) contentDiv.style.display = 'none';

  if (INTERSECTED) {
    INTERSECTED.material.emissive.setHex(INTERSECTED.userData.originalEmissive);
    INTERSECTED = null;
  }

  moveStartPos.copy(camera.position);
  moveStartTarget.copy(controls.target);
  
  // Target is the current model position
  moveEndTarget.copy(modelRoot.position); 
  
  // End Position: We want to be at a specific offset from the model, not world 0,0,0
  // We'll effectively "teleport" the relative home offset to the model's current spot
  const relativeHome = new THREE.Vector3(0, 0, CONFIG.homeDistance);
  moveEndPos.copy(modelRoot.position).add(relativeHome);

  // --- FIX: Curve Logic ---
  const midPoint = new THREE.Vector3().addVectors(moveStartPos, moveEndPos).multiplyScalar(0.5);
  const vecFromCenter = new THREE.Vector3().subVectors(midPoint, modelRoot.position);
  
  // If we are already at home, vecFromCenter might be zero, causing NaNs. Protect against that:
  if (vecFromCenter.lengthSq() < 0.001) {
      vecFromCenter.set(0, 1, 0); // Default to popping "up" if undefined
  }
  
  vecFromCenter.normalize().multiplyScalar(CONFIG.flightAltitude); // Or slightly higher for home reset
  moveControlPos.copy(modelRoot.position).add(vecFromCenter);
  // -------------------------

  moveProgress = 0;
  isAutoMoving = true;
}

// Logic: Check if Star is double-clicked
function tryStarDoubleClick() {
  if (!starSprite.visible) return false;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(starSprite, false);
  if (hit.length > 0) { resetEngram(); return true; }
  return false;
}

// --- EVENT LISTENERS ---

renderer.domElement.addEventListener('pointerdown', (e) => {
  updatePointerFromEvent(e);
  isPointerDown = true; isDragging = false; startX = e.clientX; startY = e.clientY; isAutoMoving = false;
});

renderer.domElement.addEventListener('pointermove', (e) => {
  updatePointerFromEvent(e);
  if (isPointerDown && (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5)) isDragging = true;
});

renderer.domElement.addEventListener('pointerup', (e) => {
  updatePointerFromEvent(e);
  isPointerDown = false;
  if (isDragging) { isDragging = false; return; }
  
  // Double tap logic
  const now = performance.now();
  const isDouble = (now - lastPointerUpTime) < CONFIG.doubleTapDelay;
  lastPointerUpTime = now;
  if (isDouble && tryStarDoubleClick()) return;

  // Raycast logic
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(CLICKABLE_FACES, false);
  if (intersects.length > 0) handleFaceClick(intersects[0].object);
});

renderer.domElement.addEventListener('dblclick', (e) => {
  updatePointerFromEvent(e);
  tryStarDoubleClick();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  controls.handleResize();
});

window.addEventListener('keydown', (e) => {
  // 1. Handle Escape (Reset)
  if (e.key === 'Escape') {
    resetEngram();
    return;
  }

  // 2. Map Keys to Face IDs
  const keyMap = {
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
    '6': 6, '7': 7, '8': 8, '9': 9, '0': 10,
    '-': 11, '=': 12
  };

  // 3. Trigger Navigation
  if (keyMap[e.key]) {
    const targetId = keyMap[e.key];
    const targetFace = facesById[targetId];
    if (targetFace) handleFaceClick(targetFace);
  }
});

// Logic: Hover Highlight
function handleHover() {
  if (isDragging) return;
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(CLICKABLE_FACES, false);
  if (intersects.length > 0) {
    const hitFace = intersects[0].object;
    if (INTERSECTED !== hitFace) {
      if (INTERSECTED) INTERSECTED.material.emissive.setHex(INTERSECTED.userData.originalEmissive);
      INTERSECTED = hitFace;
      INTERSECTED.material.emissive.setHex(CONFIG.colorHighlight);
    }
  } else {
    if (INTERSECTED) INTERSECTED.material.emissive.setHex(INTERSECTED.userData.originalEmissive);
    INTERSECTED = null;
  }
}

// UI Setup (Hamburger menu)
function setupUI() {
  const hamburger = document.getElementById('hamburger');
  const navMenu = document.getElementById('nav-buttons');
  const btns = navMenu.querySelectorAll('button');

  hamburger.style.color = CONFIG.uiColor;
  hamburger.style.fontSize = CONFIG.uiHamburgerSize;
  hamburger.style.opacity = CONFIG.uiButtonOpacity;

  btns.forEach(btn => {
    btn.style.color = CONFIG.uiColor;
    btn.style.fontSize = CONFIG.uiButtonFontSize;
    btn.style.opacity = CONFIG.uiButtonOpacity;
    btn.style.backgroundColor = CONFIG.uiBgColor;
    btn.onmouseenter = () => { 
        btn.style.transform = `scale(${CONFIG.uiHoverScale})`;
        btn.style.background = CONFIG.uiColor; btn.style.color = '#000';
    };
    btn.onmouseleave = () => { 
        btn.style.transform = 'scale(1)'; 
        btn.style.background = CONFIG.uiBgColor; btn.style.color = CONFIG.uiColor;
    };
  });

  hamburger.addEventListener('click', () => {
    const isOpen = navMenu.classList.contains('open');
    if (isOpen) { navMenu.classList.remove('open'); hamburger.innerHTML = "☰"; } 
    else { navMenu.classList.add('open'); hamburger.innerHTML = "✕"; }
  });

  document.getElementById('nav-left').addEventListener('click', () => {
    if (currentFaceId <= 1) currentFaceId = 13; currentFaceId--; handleFaceClick(facesById[currentFaceId] || facesById[1]);
  });
  document.getElementById('nav-right').addEventListener('click', () => {
    if (currentFaceId >= 12) currentFaceId = 0; currentFaceId++; handleFaceClick(facesById[currentFaceId] || facesById[1]);
  });
  document.getElementById('nav-home').addEventListener('click', resetEngram);
}

// ============================================================================
// 8. ANIMATION LOOP
// ============================================================================

// Orbit Variables
const ORBIT_SPEED = 0.01; // Radians per second (adjust for speed)
const SUN_ROTATION_SPEED = 0.01; 
const CAMERA_AUTO_ROT_SPEED = 0.01; // Slow rotation around the engram

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const time = (performance.now() / 1000) * CONFIG.sunTimeScale;

  // --- 0. Orbit Logic ---
  // We calculate the orbit movement before other updates to keep everything synced
  if (modelRoot) {
    // 1. Update Angle
    currentOrbitAngle += ORBIT_SPEED * delta;
    
    // 2. Calculate New Position for Engram
    const oldEngramPos = modelRoot.position.clone();
    
    const newX = ORBIT_CENTER.x + Math.cos(currentOrbitAngle) * orbitRadius;
    const newZ = ORBIT_CENTER.z + Math.sin(currentOrbitAngle) * orbitRadius;
    
    // 3. Apply New Position
    modelRoot.position.set(newX, ORBIT_CENTER.y, newZ); // Keep Y level with sun for now, or use sphere math
    
    // 4. Calculate Delta (Change in position)
    const moveDelta = new THREE.Vector3().subVectors(modelRoot.position, oldEngramPos);
    
    // 5. GEO-LOCK: Apply Delta to Camera and Controls
    // This moves the camera WITH the model, preserving the relative view
    camera.position.add(moveDelta);
    controls.target.add(moveDelta);
    
    // Update Auto-move targets so flight paths don't break
    if(isAutoMoving) {
        moveStartPos.add(moveDelta);
        moveEndPos.add(moveDelta);
        moveControlPos.add(moveDelta);
        moveStartTarget.add(moveDelta);
        moveEndTarget.add(moveDelta);
    }
    
    // 6. Camera Auto-Rotation (Rotate around Engram)
    // Only if not dragging/interacting to avoid fighting the user
    if (!isDragging && !isAutoMoving && !isPointerDown) {
        const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
        // Rotate offset vector around Y axis
        const rotSpeed = CAMERA_AUTO_ROT_SPEED * delta;
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotSpeed);
        
        camera.position.copy(controls.target).add(offset);
        camera.lookAt(controls.target);
    }
  }

  // Rotate Sun Mesh
  if (sunData.group) {
    sunData.group.rotation.y += SUN_ROTATION_SPEED * delta;
  }


  // --- 1. Auto Movement Animation ---
  if (isAutoMoving) {
    const speedCorrection = 60; 
    moveProgress += CONFIG.autoMoveSpeed * delta * speedCorrection;
    if (moveProgress >= 1) { moveProgress = 1; isAutoMoving = false; }
    
    // Bezier Curve Logic
    const t = moveProgress;
    const smoothT = t * t * (3 - 2 * t); 
    const p0 = moveStartPos; const p1 = moveControlPos; const p2 = moveEndPos;
    
    camera.position.x = ((1 - smoothT) ** 2) * p0.x + 2 * (1 - smoothT) * smoothT * p1.x + (smoothT ** 2) * p2.x;
    camera.position.y = ((1 - smoothT) ** 2) * p0.y + 2 * (1 - smoothT) * smoothT * p1.y + (smoothT ** 2) * p2.y;
    camera.position.z = ((1 - smoothT) ** 2) * p0.z + 2 * (1 - smoothT) * smoothT * p1.z + (smoothT ** 2) * p2.z;
    
    controls.target.lerpVectors(moveStartTarget, moveEndTarget, smoothT);
  }

  // --- 2. Standard Updates ---
  controls.update();
  handleHover();

  // --- 3. Sun Shader Updates ---
  // We need to pass the time to the shader so it moves
  sunData.coreMaterial.uniforms.iTime.value = time;
  sunData.coronaMaterial.uniforms.iTime.value = time;
  
  // Update uniforms live from Config (allows runtime tweaking)
  sunData.coreMaterial.uniforms.uCoreSpeed.value = CONFIG.sunCoreSpeed;
  sunData.coreMaterial.uniforms.uWarpStrength.value = CONFIG.sunWarpStrength;
  sunData.coreMaterial.uniforms.uWarpScale.value = CONFIG.sunWarpScale;
  sunData.coreMaterial.uniforms.uSunTint.value = CONFIG.sunTint;
  sunData.coreMaterial.uniforms.uSunIntensity.value = CONFIG.sunIntensity;

  // Move skybox with camera (infinite horizon)
  if (skySphere) skySphere.position.copy(camera.position);

  // --- 4. Scale Model based on Distance (Star Transition) ---
  if (modelRoot && modelCenterAnchor) {
    modelCenterAnchor.getWorldPosition(modelCenterWorld);
    const dist = camera.position.distanceTo(modelCenterWorld);
    
    // Calculate 0.0 to 1.0 fade factor
    const t = THREE.MathUtils.clamp((dist - CONFIG.fadeStart) / (CONFIG.fadeEnd - CONFIG.fadeStart), 0, 1);
    
    // Shrink Model
    const modelScale = 1 - t;
    modelRoot.scale.setScalar(Math.max(modelScale, 0.0001));

    // Fade Materials
    modelRoot.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (!m) return;
      const isCore = o.name?.includes('Inside') || o.name?.includes('Core');
      m.transparent = true;
      m.opacity = isCore ? 1 : (CONFIG.materialOpacity * (1 - t));
    });

    // Handle Star Visibility
    starSprite.visible = t > 0;
    if (t > 0) {
      starSprite.position.copy(modelCenterWorld);
      const distToStar = camera.position.distanceTo(modelCenterWorld);
      
      // Calculate star size
      let visualSize = THREE.MathUtils.lerp(0, CONFIG.starBaseSize, t);
      const distFactor = (distToStar / 1000) * CONFIG.starSizeMultiplier;
      visualSize = visualSize * (1 + distFactor);
      
      starSprite.scale.setScalar(visualSize);
      
      // Pulse animation
      const tw = 0.85 + 0.15 * Math.sin(performance.now() * CONFIG.starPulseSpeed);
      starSprite.material.opacity = t * tw;
    }
  }

  renderer.render(scene, camera);
}

// Start everything
setupUI();
animate();