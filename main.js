import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { defineConfig } from 'vite';


// --- 1. Global Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// Darken overlay (keeps everything else unchanged)
const bgDim = document.createElement('div');
Object.assign(bgDim.style, {
  position: 'fixed',
  inset: '0',
  background: 'rgba(0, 0, 0, 0.27)', // tweak 0.15–0.45
  pointerEvents: 'none',
  zIndex: '1'
});
document.body.appendChild(bgDim);

// Make sure canvas is under overlay
renderer.domElement.style.position = 'fixed';
renderer.domElement.style.inset = '0';
renderer.domElement.style.zIndex = '0';

// --- 2. Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

camera.position.set(0, 0, 255);
controls.target.set(0, 0, 0);
controls.update();

// --- SMOOTH PANNING VARIABLES ---
const focusPoint = new THREE.Vector3(0, 0, 0);
const desiredCameraPos = new THREE.Vector3().copy(camera.position);
let isAutoMoving = false;

// Save a "home" view to return to
const homeTarget = new THREE.Vector3(0, 0, 0);
const homeCameraPos = new THREE.Vector3(0, 0, 255);

// Cancel auto-move as soon as user starts interacting
controls.addEventListener('start', () => { isAutoMoving = false; });
renderer.domElement.addEventListener('wheel', () => { isAutoMoving = false; }, { passive: true });

// --- 3. Lighting & Environment & Background ---
scene.add(new THREE.AmbientLight(0xffffff, 0.2));

// A. Load HDR for reflections/lighting ONLY
const rgbeLoader = new HDRLoader();
rgbeLoader.load('./textures/neon_photostudio_4k.hdr', (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
   
});

// B. Load specific image for the background
const textureLoader = new THREE.TextureLoader();
let skySphere = null;

textureLoader.load('./textures/starts.jpg', (texture) => {
  // Correct color handling for images
  texture.colorSpace = THREE.SRGBColorSpace;

  // Wrap so it doesn't stretch weird if you want repetition
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1); // tweak if you want more/less repetition

  const skyGeo = new THREE.SphereGeometry(500, 64, 64);
  const skyMat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide, // render inside of sphere
    depthWrite: false
  });

  skySphere = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skySphere);
});


// --- 4. Model Loading ---
const gltfLoader = new GLTFLoader();
const modelPath = './engram1.glb';
const CLICKABLE_FACES = [];

gltfLoader.load(modelPath, (gltf) => {
  const model = gltf.scene;
  scene.add(model);

  let faceCount = 0;
  model.traverse((child) => {
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

  // Assumes shape is centered at 0,0,0
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
      position: 'absolute', top: '20px', left: '20px',
      background: 'rgba(0,0,0,0.85)', color: 'white',
      padding: '20px', borderRadius: '8px', maxWidth: '300px',
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

// Event Listeners
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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

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
    // Keep the sky centered on the camera so it feels infinitely far,
    // and rotate it with the camera so it "moves with you"
    if (skySphere) {
    skySphere.position.copy(camera.position);
    skySphere.rotation.y = controls.getAzimuthalAngle(); // rotates only around Y
    }

    renderer.render(scene, camera);
}

animate();