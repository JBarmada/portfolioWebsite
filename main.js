import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const base = import.meta.env.BASE_URL;
const FADE_START = 2600;   // start shrinking here
const FADE_END   = 3300;   // fully gone here (and star fully on)
// const STAR_START_DISTANCE = 3000; // when model turns into star
const STAR_SIZE_MULT = 0.10;      // bigger = star appears larger at distance
// const STAR_MIN_SIZE = 80;
// const STAR_MAX_SIZE = 900;
const MAXDIST = 10000;
const CAMFAR = 20000;

// --- 1. Global Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, CAMFAR);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);
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
  background: 'rgba(0, 0, 0, 0.27)', // tweak 0.15–0.45
  pointerEvents: 'none',
  zIndex: '1',
});
document.body.appendChild(bgDim);

// Canvas under overlay
renderer.domElement.style.position = 'fixed';
renderer.domElement.style.inset = '0';
renderer.domElement.style.zIndex = '0';

// --- 2. Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

controls.minDistance = 10;
controls.maxDistance = MAXDIST;

camera.position.set(0, 0, 255);
controls.target.set(0, 0, 0);
controls.update();

// Smooth camera motion vars
const focusPoint = new THREE.Vector3(0, 0, 0);
const desiredCameraPos = new THREE.Vector3().copy(camera.position);
let isAutoMoving = false;

// Home view
const homeTarget = new THREE.Vector3(0, 0, 0);
const homeCameraPos = new THREE.Vector3(0, 0, 255);

// Cancel auto-move on user input
controls.addEventListener('start', () => { isAutoMoving = false; });
renderer.domElement.addEventListener('wheel', () => { isAutoMoving = false; }, { passive: true });

// --- 3. Lighting & Environment ---
scene.add(new THREE.AmbientLight(0xffffff, 0.2));

// HDR environment
const rgbeLoader = new HDRLoader();
rgbeLoader.load(`${base}textures/neon_photostudio_4k.hdr`, (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
});

// Background sky sphere
const textureLoader = new THREE.TextureLoader();
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

// --- 4. Model Loading ---
const gltfLoader = new GLTFLoader();
const modelPath = `${base}engram1.glb`;
const CLICKABLE_FACES = [];

let modelRoot = null;

// Center anchor that remains valid even when modelRoot becomes invisible
let modelCenterAnchor = null;
const modelCenterWorld = new THREE.Vector3();

// ---- Star sprite ----
function makeGlowTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  // --- COLOR CHANGE HERE ---
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');       // Pure white center
  grad.addColorStop(0.15, 'rgba(255, 220, 255, 0.9)'); // very bright whitish-purple transition
    grad.addColorStop(0.5, 'rgba(180, 40, 220, 0.5)');   // The main purple halo color (adjusted for glow)
    grad.addColorStop(1.0, 'rgba(0,0,0,0)');             // fade to transparent edge

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
    depthTest: false, // important: don’t get “lost” behind stuff
    opacity: 1.0,
  })
);
starSprite.visible = false;
starSprite.frustumCulled = false; // FIX: Never stop rendering this, no matter how far/off-center
starSprite.renderOrder = 999;
scene.add(starSprite);

gltfLoader.load(modelPath, (gltf) => {
  modelRoot = gltf.scene;
  scene.add(modelRoot);

  // Build center anchor ONCE while model is visible
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
    child.userData.title = child.name || `Experience ${faceCount}`;
    child.userData.content = `<h3>Project: ${child.userData.title}</h3><p>Description...</p>`;

    child.material = child.material.clone();

    if (child.name.includes('Inside') || child.name.includes('Core')) {
      child.material.emissive.setHex(0x220022);
      child.userData.content = `<h3>Project: ${child.userData.title}</h3><p>You have found the core...</p>`;
    } else {
      child.material.map = null;
      child.material.color.setHex(0x800080);
      child.material.emissive.setHex(0x220022);
      child.material.roughness = 0.1;
      child.material.metalness = 0.6;
      child.material.transparent = true;
      child.material.opacity = 0.5;
    }

    child.userData.originalEmissive = child.material.emissive.getHex();
    CLICKABLE_FACES.push(child);
  });
});

// --- 5. Interaction Logic ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let INTERSECTED = null;

// drag vs click
let isDragging = false;
let startX = 0;
let startY = 0;

function updatePointerFromEvent(e) {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
}

// --- CLICK HANDLER ---
function handleFaceClick(faceMesh) {
  const faceCenter = new THREE.Vector3();
  faceMesh.getWorldPosition(faceCenter);

  focusPoint.copy(faceCenter);

  // If your object is centered at origin, this works.
  // If not, you may want to use the mesh forward direction approach.
  const faceNormal = new THREE.Vector3().copy(faceCenter).normalize();
  const distance = 35;
  desiredCameraPos.copy(faceCenter).add(faceNormal.multiplyScalar(distance));

  isAutoMoving = true;
  displayResumeContent(faceMesh.userData);
}

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
    closeResumeContent();
  };
}

function closeResumeContent() {
  const contentDiv = document.getElementById('resume-content');
  if (!contentDiv || contentDiv.style.display === 'none') return;

  contentDiv.style.display = 'none';

  focusPoint.copy(homeTarget);
  desiredCameraPos.copy(homeCameraPos);
  isAutoMoving = true;
}

// pointer events
renderer.domElement.addEventListener('pointerdown', (e) => {
  updatePointerFromEvent(e);
  isDragging = false;
  startX = e.clientX;
  startY = e.clientY;
  isAutoMoving = false;
});

renderer.domElement.addEventListener('pointermove', (e) => {
  updatePointerFromEvent(e);
  if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) isDragging = true;
});

renderer.domElement.addEventListener('pointerup', (e) => {
  updatePointerFromEvent(e);
  if (isDragging) return;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(CLICKABLE_FACES, false);
  if (intersects.length > 0) handleFaceClick(intersects[0].object);
});

function handleHover() {
  if (isDragging) return;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(CLICKABLE_FACES, false);

  if (intersects.length > 0) {
    const hitFace = intersects[0].object;
    if (INTERSECTED !== hitFace) {
      if (INTERSECTED) INTERSECTED.material.emissive.setHex(INTERSECTED.userData.originalEmissive);
      INTERSECTED = hitFace;
      INTERSECTED.material.emissive.setHex(0xffd700);
    }
  } else {
    if (INTERSECTED) INTERSECTED.material.emissive.setHex(INTERSECTED.userData.originalEmissive);
    INTERSECTED = null;
  }
}

// resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ESC closes content
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeResumeContent();
});

// --- 6. Animation Loop ---
function animate() {
  requestAnimationFrame(animate);

  if (isAutoMoving) {
    controls.target.lerp(focusPoint, 0.08);
    camera.position.lerp(desiredCameraPos, 0.08);

    if (camera.position.distanceTo(desiredCameraPos) < 0.05) {
      isAutoMoving = false;
    }
  }

  controls.update();
  handleHover();

  // sky sphere: infinite + rotates with orbit
  if (skySphere) {
    skySphere.position.copy(camera.position);
    skySphere.rotation.y = controls.getAzimuthalAngle();
  }

  // --- "Bright point when far away" ---
    if (modelRoot && modelCenterAnchor) {
    modelCenterAnchor.getWorldPosition(modelCenterWorld);
    const dist = camera.position.distanceTo(modelCenterWorld);

    // 0 at FADE_START, 1 at FADE_END
    const t = THREE.MathUtils.clamp((dist - FADE_START) / (FADE_END - FADE_START), 0, 1);

    // shrink model smoothly
    const modelScale = 1 - t;
    modelRoot.scale.setScalar(Math.max(modelScale, 0.0001));

    // optional: also fade materials a bit (looks nicer)
    modelRoot.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        if (!m) return;
        m.transparent = true;
        m.opacity = (o.name?.includes('Inside') || o.name?.includes('Core')) ? 1 : (0.5 * (1 - t));
    });

    // star fades in as model fades out
    starSprite.visible = t > 0;
    // ... inside animate(), replacing the star logic ...

    // star fades in as model fades out
    starSprite.visible = t > 0;
    if (t > 0) {
        starSprite.position.copy(modelCenterWorld);

        // Calculate distance from camera to the star
        const distToStar = camera.position.distanceTo(modelCenterWorld);

        // 1. Base transition size (growing as model disappears)
        let visualSize = THREE.MathUtils.lerp(0, 250, t);

        // 2. Add Distance Compensation
        // As we get further, multiply size so it doesn't shrink to a pixel
        // This makes it look like a persistent light source rather than physical geometry
        const distFactor = (distToStar / 1000) * STAR_SIZE_MULT; 
        
        // Apply the factor, but clamp slightly to avoid it becoming a giant sun
        visualSize = visualSize * (1 + distFactor);

        // Optional: Clamp to your config limits if it gets too huge
        // visualSize = Math.min(visualSize, STAR_MAX_SIZE); 

        starSprite.scale.setScalar(visualSize);

        const tw = 0.85 + 0.15 * Math.sin(performance.now() * 0.003);
        starSprite.material.opacity = t * tw;
    }
    }


  renderer.render(scene, camera);
}

animate();
// --- End of main.js ---