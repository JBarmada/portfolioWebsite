import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
// CHANGED: Import TrackballControls instead of OrbitControls
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { RESUME_DATA } from './resumeData.js';

const base = import.meta.env.BASE_URL;

// ============================================================================
// 🛠️ CONFIGURATION - TWEAK VALUES HERE
// ============================================================================

const CONFIG = {


  // --- Camera & Navigation ---
  focusDistance: 35,          // How close the camera zooms to a face when clicked
  homeDistance: 255,          // Initial distance of the camera from center
  camFov: 75,                 // Field of View
  camFar: 20000,              // Draw distance (how far the camera sees)
  minZoom: 10,                // Closest you can zoom in manually
  maxZoom: 10000,             // Furthest you can zoom out manually
  autoMoveSpeed: 0.03,        // Speed of the smooth camera transition (0.01 = slow, 0.1 = fast)
  flightAltitude: 300, // How far to zoom out during the transition (Higher = bigger arc)

  // --- Trackball Controls Settings ---
  rotateSpeed: 4.0,           // How fast the object spins when dragging
  zoomSpeed: 1.2,             // How fast you zoom in/out
  panSpeed: 0.8,              // How fast you pan (right-click drag)
  dampingFactor: 0.1,         // Smoothness of the drift after letting go (lower = longer drift)
  staticMoving: false,        // If true, rotation stops immediately (no drift)

  // --- Lighting & Rendering ---
  ambientLightIntensity: 0.2, // Brightness of the general base light
  exposure: 1.0,              // Overall scene brightness (Tone Mapping)
  bgDimOpacity: 0.17,         // Darkness of the overlay covering the 3D scene (0.0 - 1.0)
  
  // --- Star Transformation ---
  fadeStart: 2600,            // Distance where the model starts shrinking into a star
  fadeEnd: 3300,              // Distance where the model is fully gone (star is active)
  starSizeMultiplier: 0.10,   // How much the star grows based on distance
  starBaseSize: 250,          // Base pixel size of the star glow
  starPulseSpeed: 0.003,      // How fast the star gently pulses

  // --- Colors & Materials ---
  colorBase: 0x800080,        // Purple color for non-core faces
  colorEmissive: 0x220022,    // Inner glow color for faces
  colorHighlight: 0xffd700,   // Gold color when hovering over a face
  materialOpacity: 0.5,       // Transparency of the outer faces
  materialRoughness: 0.1,     // Shininess (0 = mirror, 1 = matte)
  materialMetalness: 0.6,     // Metallic look (0 = plastic, 1 = metal)

  // --- Interaction ---
  doubleTapDelay: 300,        // Milliseconds to register a double-tap on mobile

  // --- UI & Menu Settings ---
  uiColor: '#00ffcc',         // Color of the text and borders
  uiBgColor: 'rgba(0,0,0,0.8)', // Background color for buttons (if you want one)
  uiHamburgerSize: '30px',    // Size of the ☰ icon
  uiButtonFontSize: '20px',   // Font size for Left/Home/Right
  uiButtonOpacity: 0.9,       // Opacity of the buttons
  uiHoverScale: 1.1,          // How much buttons grow on hover
};

// ============================================================================
// 1. GLOBAL SETUP
// ============================================================================

const scene = new THREE.Scene();
const clock = new THREE.Clock();
const camera = new THREE.PerspectiveCamera(CONFIG.camFov, window.innerWidth / window.innerHeight, 0.1, CONFIG.camFar);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = CONFIG.exposure;
document.body.appendChild(renderer.domElement);

// ============================================================================
// LOADING MANAGER SETUP
// ============================================================================
// CONSTANT: Minimum time to show loader (in milliseconds)
const MIN_LOAD_TIME = 1500; // 1.5 seconds (Adjust as needed)
const loadingManager = THREE.DefaultLoadingManager;
loadingManager.onLoad = function() {
    console.log('Loading complete!');
    
    // How long has the page been open?
    const loadDuration = performance.now(); 
    
    // Calculate how much longer we need to wait to hit MIN_LOAD_TIME
    const remainingDelay = Math.max(0, MIN_LOAD_TIME - loadDuration);

    setTimeout(() => {
        const loaderElement = document.getElementById('loader-overlay');
        
        if(loaderElement) {
            // Start the fade out
            loaderElement.classList.add('fade-out');
            
            // Remove from DOM after the CSS transition (0.8s) is done
            setTimeout(() => {
                loaderElement.remove();
            }, 1000); 
        }
    }, remainingDelay);
};

// Optional: specific progress logs
loadingManager.onProgress = function(url, itemsLoaded, itemsTotal) {
    console.log(`Loading file: ${url}.\nLoaded ${itemsLoaded} of ${itemsTotal} files.`);
};
// ============================================================================


// --- HTML Overlays ---

// Debug overlay
const debug = document.createElement('div');
Object.assign(debug.style, {
  position: 'fixed',
  right: '12px',
  top: '12px',
  color: 'white',
  fontFamily: 'monospace',
  background: 'rgba(0,0,0,0.5)',
  padding: '6px 8px',
  borderRadius: '6px',
  zIndex: '9999'
});
document.body.appendChild(debug);

// Darken overlay
const bgDim = document.createElement('div');
Object.assign(bgDim.style, {
  position: 'fixed',
  inset: '0',
  background: `rgba(0, 0, 0, ${CONFIG.bgDimOpacity})`,
  pointerEvents: 'none',
  zIndex: '1',
});
document.body.appendChild(bgDim);

// Canvas under overlay
renderer.domElement.style.position = 'fixed';
renderer.domElement.style.inset = '0';
renderer.domElement.style.zIndex = '0';
renderer.domElement.style.touchAction = 'none'; // Critical for mobile gestures

// ============================================================================
// 2. CONTROLS & CAMERA
// ============================================================================

// CHANGED: Use TrackballControls for free 360 rotation
const controls = new TrackballControls(camera, renderer.domElement);

// Apply Config Settings
controls.rotateSpeed = CONFIG.rotateSpeed;
controls.zoomSpeed = CONFIG.zoomSpeed;
controls.panSpeed = CONFIG.panSpeed;
controls.staticMoving = CONFIG.staticMoving;
controls.dynamicDampingFactor = CONFIG.dampingFactor; // Controls the "drift" physics

controls.minDistance = CONFIG.minZoom;
controls.maxDistance = CONFIG.maxZoom;

// Initial Position
camera.position.set(0, 0, CONFIG.homeDistance);
controls.target.set(0, 0, 0);
controls.update();

// Smooth camera motion variables
const focusPoint = new THREE.Vector3(0, 0, 0);
const desiredCameraPos = new THREE.Vector3().copy(camera.position);
let isAutoMoving = false;
let moveProgress = 0; // Tracks 0.0 to 1.0
const moveStartPos = new THREE.Vector3();
const moveEndPos = new THREE.Vector3();
const moveControlPos = new THREE.Vector3(); // The "peak" of the flight
const moveStartTarget = new THREE.Vector3();
const moveEndTarget = new THREE.Vector3();

// Home Targets
const homeTarget = new THREE.Vector3(0, 0, 0);
const homeCameraPos = new THREE.Vector3(0, 0, CONFIG.homeDistance);

// Cancel auto-move on user input (manual control override)
controls.addEventListener('start', () => { isAutoMoving = false; });
renderer.domElement.addEventListener('wheel', () => { isAutoMoving = false; }, { passive: true });

// ============================================================================
// 3. LIGHTING & ENVIRONMENT
// ============================================================================

scene.add(new THREE.AmbientLight(0xffffff, CONFIG.ambientLightIntensity));

// HDR Environment
const rgbeLoader = new HDRLoader(loadingManager);
rgbeLoader.load(`${base}textures/neon_photostudio_4k.hdr`, (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
});

// Background Sky Sphere
const textureLoader = new THREE.TextureLoader(loadingManager);
let skySphere = null;

textureLoader.load(`${base}textures/starts.jpg`, (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);

  const skyGeo = new THREE.SphereGeometry(5000, 64, 64);
  const skyMat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    depthWrite: false,
  });

  skySphere = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skySphere);
});

// ============================================================================
// 4. MODEL LOADING & STAR CREATION
// ============================================================================

const gltfLoader = new GLTFLoader(loadingManager);
const modelPath = `${base}engram1.glb`;
const CLICKABLE_FACES = [];
const facesById = {};

let modelRoot = null;
let modelCenterAnchor = null;
const modelCenterWorld = new THREE.Vector3();

// --- Star Sprite Generator ---
function makeGlowTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');        // white center
  grad.addColorStop(0.15, 'rgba(255, 220, 255, 0.9)');  // bright whitish-purple
  grad.addColorStop(0.5, 'rgba(180, 40, 220, 0.5)');    // purple halo
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');              // transparent edge

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const starSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 1.0,
  })
);
starSprite.visible = false;
starSprite.frustumCulled = false;
starSprite.renderOrder = 999;
scene.add(starSprite);

// --- Load GLTF ---
gltfLoader.load(modelPath, (gltf) => {
  modelRoot = gltf.scene;
  scene.add(modelRoot);

  // Create anchor at center of model
  const box = new THREE.Box3().setFromObject(modelRoot);
  const center = new THREE.Vector3();
  box.getCenter(center);

  modelCenterAnchor = new THREE.Object3D();
  modelCenterAnchor.position.copy(center);
  modelRoot.add(modelCenterAnchor);

  let faceCount = 0;
  modelRoot.traverse((child) => {
    if (!child.isMesh) return;

    faceCount++;
    child.userData.id = faceCount;
    
    // 1. LOOK UP RESUME DATA 
    const resumeEntry = RESUME_DATA[faceCount];
    
    if (resumeEntry) {
      child.userData.title = resumeEntry.title;
      child.userData.content = resumeEntry.content;
    } else {
      child.userData.title = child.name || `Face ${faceCount}`;
      child.userData.content = `<h3>Locked</h3><p>Data not available.</p>`;
    }

    child.material = child.material.clone();

    // 2. HANDLE CORE (FACE 13+) - Overrides everything else
    if (child.name.includes('Inside') || child.name.includes('Core')) {
      child.material.emissive.setHex(CONFIG.colorEmissive);
      child.userData.title = "The Core";
      child.userData.content = `<h3>The Engram Core</h3><p>You have found the source.</p>`;
    } else {
      // Standard Face Styling
      child.material.map = null;
      child.material.color.setHex(CONFIG.colorBase);
      child.material.emissive.setHex(CONFIG.colorEmissive);
      child.material.roughness = CONFIG.materialRoughness;
      child.material.metalness = CONFIG.materialMetalness;
      child.material.transparent = true;
      child.material.opacity = CONFIG.materialOpacity;
    }

    child.userData.originalEmissive = child.material.emissive.getHex();
    
    // Store for lookup
    facesById[faceCount] = child;
    CLICKABLE_FACES.push(child);
  });
});

// ============================================================================
// 5. INTERACTION LOGIC
// ============================================================================

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let INTERSECTED = null;
let isDragging = false;
let startX = 0;
let startY = 0;
let lastPointerUpTime = 0; // For double-tap logic
let isPointerDown = false; // for hover logic
let currentFaceId = 0; // 0 = Home, 1-12 = Faces

function updatePointerFromEvent(e) {
  // Support both mouse and touch events
  const clientX = e.clientX || (e.touches && e.touches[0]?.clientX);
  const clientY = e.clientY || (e.touches && e.touches[0]?.clientY);

  if (clientX !== undefined) pointer.x = (clientX / window.innerWidth) * 2 - 1;
  if (clientY !== undefined) pointer.y = -(clientY / window.innerHeight) * 2 + 1;
}

// --- Main Action: Click on Face ---
function handleFaceClick(faceMesh) {
    // 1. Temporarily restore full scale to get accurate target coordinates
    const currentScale = modelRoot.scale.x;
    modelRoot.scale.setScalar(1);
    modelRoot.updateMatrixWorld(true);

    // 2. Track where we are currently
    currentFaceId = faceMesh.userData.id;
    moveStartPos.copy(camera.position);
    moveStartTarget.copy(controls.target);

    // 3. Calculate destination (Face Focus)
    const faceCenter = new THREE.Vector3();
    faceMesh.getWorldPosition(faceCenter);
    const faceNormal = new THREE.Vector3().copy(faceCenter).normalize();
    
    moveEndTarget.copy(faceCenter); // Look at the face
    moveEndPos.copy(faceCenter).add(faceNormal.multiplyScalar(CONFIG.focusDistance)); // Stop in front of it

    // 4. Calculate the "Arc" (Control Point)
    // This point is halfway between start/end, but pushed OUTWARDS
    moveControlPos.addVectors(moveStartPos, moveEndPos).multiplyScalar(0.5);
    moveControlPos.normalize().multiplyScalar(CONFIG.flightAltitude);

    // 5. Restore Model Scale
    modelRoot.scale.setScalar(currentScale);
    modelRoot.updateMatrixWorld(true);

    // 6. Start the Flight
    moveProgress = 0;
    isAutoMoving = true;
    displayResumeContent(faceMesh.userData);
}

// --- UI: Resume Content ---
function displayResumeContent(data) {
  let contentDiv = document.getElementById('resume-content');
  if (!contentDiv) {
    contentDiv = document.createElement('div');
    contentDiv.id = 'resume-content';
    Object.assign(contentDiv.style, {
      position: 'absolute',
      top: '20px',
      left: '20px',
      background: 'rgba(0,0,0,0.85)',
      color: 'white',
      padding: '20px',
      borderRadius: '8px',
      maxWidth: '300px',
      display: 'none',
      fontFamily: 'Arial, sans-serif',
      border: '1px solid #444',
      zIndex: '10',
    });
    document.body.appendChild(contentDiv);
  }

  contentDiv.innerHTML = `
    <button id="close-content" style="float:right; cursor:pointer; background:none; border:none; color:white; font-weight:bold;">X</button>
    <h3 style="margin-top:0">${data.title}</h3>
    ${data.content}
  `;
  contentDiv.style.display = 'block';

  document.getElementById('close-content').onclick = () => {
    resetEngram();
  };
}

function resetEngram() {
  currentFaceId = 0;
  const contentDiv = document.getElementById('resume-content');
  if (contentDiv) contentDiv.style.display = 'none';

  if (INTERSECTED) {
    INTERSECTED.material.emissive.setHex(INTERSECTED.userData.originalEmissive);
    INTERSECTED = null;
  }

  // Setup Home Flight
  moveStartPos.copy(camera.position);
  moveStartTarget.copy(controls.target);
  
  moveEndPos.copy(homeCameraPos);
  moveEndTarget.copy(homeTarget);

  // For home, the arc is just slightly higher than home distance
  moveControlPos.copy(camera.position).add(homeCameraPos).multiplyScalar(0.5);
  moveControlPos.normalize().multiplyScalar(CONFIG.homeDistance + 100);

  moveProgress = 0;
  isAutoMoving = true;
}

// --- Star Interaction ---
function tryStarDoubleClick() {
  if (!starSprite.visible) return false;

  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(starSprite, false);

  if (hit.length > 0) {
    resetEngram();
    return true;
  }
  return false;
}

// --- Event Listeners ---

// 1. Pointer Down
renderer.domElement.addEventListener('pointerdown', (e) => {
  updatePointerFromEvent(e);
  isPointerDown = true;
  isDragging = false;
  startX = e.clientX;
  startY = e.clientY;
  isAutoMoving = false;
});

// 2. Pointer Move
renderer.domElement.addEventListener('pointermove', (e) => {
  updatePointerFromEvent(e);
  // Only register a "drag" if we are actually holding the button down
  if (isPointerDown) {
    if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
      isDragging = true;
    }
  }
});

// 3. Pointer Up (Click Handling)
renderer.domElement.addEventListener('pointerup', (e) => {
  updatePointerFromEvent(e);
  isPointerDown = false; // We let go

  // If we were dragging, stop here (don't click), but reset the flag so hovering works again
  if (isDragging) {
    isDragging = false; 
    return;
  }

  const now = performance.now();
  const isDouble = (now - lastPointerUpTime) < CONFIG.doubleTapDelay;
  lastPointerUpTime = now;

  // Priority 1: Star Double Tap (Mobile)
  if (isDouble && tryStarDoubleClick()) return;

  // Priority 2: Face Click
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(CLICKABLE_FACES, false);
  if (intersects.length > 0) handleFaceClick(intersects[0].object);
});

// 4. Desktop Double Click
renderer.domElement.addEventListener('dblclick', (e) => {
  updatePointerFromEvent(e);
  tryStarDoubleClick();
});

// 5. Hover Effect
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

// 6. Keyboard Controls
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    resetEngram();
    return;
  }

  const keyMap = {
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
    '6': 6, '7': 7, '8': 8, '9': 9,
    '0': 10, '-': 11, '=': 12
  };

  const targetId = keyMap[e.key];
  if (targetId && facesById[targetId]) {
    handleFaceClick(facesById[targetId]);
  }
});

// 7. Window Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  controls.handleResize(); // REQUIRED for TrackballControls
});

// ============================================================================
// 🆕 UI & HAMBURGER LOGIC
// ============================================================================

function setupUI() {
  const hamburger = document.getElementById('hamburger');
  const navMenu = document.getElementById('nav-buttons');
  const btns = navMenu.querySelectorAll('button');

  // 1. Apply Config Styles dynamically
  hamburger.style.color = CONFIG.uiColor;
  hamburger.style.fontSize = CONFIG.uiHamburgerSize;
  hamburger.style.opacity = CONFIG.uiButtonOpacity;

  btns.forEach(btn => {
    btn.style.color = CONFIG.uiColor;
    btn.style.fontSize = CONFIG.uiButtonFontSize;
    btn.style.opacity = CONFIG.uiButtonOpacity;
    btn.style.backgroundColor = CONFIG.uiBgColor;
    
    // Hover Effects
    btn.onmouseenter = () => { 
        btn.style.transform = `scale(${CONFIG.uiHoverScale})`;
        btn.style.background = CONFIG.uiColor;
        btn.style.color = '#000'; // Invert text on hover
    };
    btn.onmouseleave = () => { 
        btn.style.transform = 'scale(1)'; 
        btn.style.background = CONFIG.uiBgColor;
        btn.style.color = CONFIG.uiColor;
    };
  });

  // 2. Hamburger Toggle
  hamburger.addEventListener('click', () => {
    const isOpen = navMenu.classList.contains('open');
    if (isOpen) {
        navMenu.classList.remove('open');
        hamburger.innerHTML = "☰";
    } else {
        navMenu.classList.add('open');
        hamburger.innerHTML = "✕"; // Change to X when open
    }
  });

  // 3. Navigation Logic
  document.getElementById('nav-left').addEventListener('click', () => {
    if (currentFaceId <= 1) currentFaceId = 13; // Wrap around (12 + 1)
    currentFaceId--;
    navigateToFace(currentFaceId);
  });

  document.getElementById('nav-right').addEventListener('click', () => {
    if (currentFaceId >= 12) currentFaceId = 0; // Wrap around
    currentFaceId++;
    navigateToFace(currentFaceId);
  });

  document.getElementById('nav-home').addEventListener('click', () => {
    resetEngram();
  });
}

// Helper to trigger click on a specific face ID
function navigateToFace(id) {
    const face = facesById[id];
    if (face) {
        handleFaceClick(face);
    } else {
        // Fallback to home if ID is invalid (like 0)
        resetEngram();
    }
}

// ============================================================================
// 6. ANIMATION LOOP
// ============================================================================

function animate() {
  requestAnimationFrame(animate);
  // 1. Get the time passed since last frame (e.g., 0.016s for 60fps)
  const delta = clock.getDelta();
  // Smooth Camera Movement
  if (isAutoMoving) {
    // 1. Increment progress
    // moveProgress += CONFIG.autoMoveSpeed * 0.5; // (Adjust speed multiplier if needed)
    const speedCorrection = 60; 
    moveProgress += CONFIG.autoMoveSpeed * delta * speedCorrection;
    if (moveProgress >= 1) {
      moveProgress = 1;
      isAutoMoving = false;
    }

    // 2. Calculate Smooth "Ease-In-Out" factor
    // This makes it start slow, fly fast, then land slow
    const t = moveProgress;
    const smoothT = t * t * (3 - 2 * t); 

    // 3. Move Camera along Quadratic Bezier Curve
    // Formula: (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
    const p0 = moveStartPos;
    const p1 = moveControlPos;
    const p2 = moveEndPos;

    camera.position.x = ((1 - smoothT) ** 2) * p0.x + 2 * (1 - smoothT) * smoothT * p1.x + (smoothT ** 2) * p2.x;
    camera.position.y = ((1 - smoothT) ** 2) * p0.y + 2 * (1 - smoothT) * smoothT * p1.y + (smoothT ** 2) * p2.y;
    camera.position.z = ((1 - smoothT) ** 2) * p0.z + 2 * (1 - smoothT) * smoothT * p1.z + (smoothT ** 2) * p2.z;

    // 4. Move Target Linearly (Simple Lerp)
    controls.target.lerpVectors(moveStartTarget, moveEndTarget, smoothT);
  }

  controls.update(); // Must be called every frame
  handleHover();

  // Sky Sphere Follow - adjusted to remove Y rotation lock if desired, 
  // or keep it simple. Here we just copy position.
  if (skySphere) {
    skySphere.position.copy(camera.position);
    // skySphere.rotation.y = ... (Trackball doesn't have an easy azimuthal angle, so we skip rotation matching for now to prevent jitter)
  }

  // --- Dynamic Model/Star Fading ---
  if (modelRoot && modelCenterAnchor) {
    modelCenterAnchor.getWorldPosition(modelCenterWorld);
    const dist = camera.position.distanceTo(modelCenterWorld);

    // Calculate fade progress (0.0 to 1.0)
    const t = THREE.MathUtils.clamp((dist - CONFIG.fadeStart) / (CONFIG.fadeEnd - CONFIG.fadeStart), 0, 1);

    // Shrink model
    const modelScale = 1 - t;
    modelRoot.scale.setScalar(Math.max(modelScale, 0.0001));

    // Fade model materials
    modelRoot.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (!m) return;
      
      const isCore = o.name?.includes('Inside') || o.name?.includes('Core');
      m.transparent = true;
      m.opacity = isCore ? 1 : (CONFIG.materialOpacity * (1 - t));
    });

    // Handle Star visibility
    starSprite.visible = t > 0;
    if (t > 0) {
      starSprite.position.copy(modelCenterWorld);

      const distToStar = camera.position.distanceTo(modelCenterWorld);

      // Base size transition
      let visualSize = THREE.MathUtils.lerp(0, CONFIG.starBaseSize, t);

      // Distance compensation (keeps star visible when far away)
      const distFactor = (distToStar / 1000) * CONFIG.starSizeMultiplier;
      visualSize = visualSize * (1 + distFactor);

      starSprite.scale.setScalar(visualSize);

      // Subtle pulse animation
      const tw = 0.85 + 0.15 * Math.sin(performance.now() * CONFIG.starPulseSpeed);
      starSprite.material.opacity = t * tw;
    }
  }

  renderer.render(scene, camera);
}
setupUI();
animate();