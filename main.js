import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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

// Cancel auto-move as soon as user starts interacting with OrbitControls
controls.addEventListener('start', () => {
  isAutoMoving = false;
});

// Cancel auto-move on scroll wheel too (zoom)
renderer.domElement.addEventListener(
  'wheel',
  () => {
    isAutoMoving = false;
  },
  { passive: true }
);

// --- 3. Lighting & Environment ---
scene.add(new THREE.AmbientLight(0xffffff, 0.2));

const rgbeLoader = new HDRLoader();
rgbeLoader.load('/textures/neon_photostudio_4k.hdr', (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
});

// --- 4. Model Loading ---
const gltfLoader = new GLTFLoader();
const modelPath = '/engram1.glb';
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

// Track drag vs click
let isDragging = false;
let startX = 0;
let startY = 0;

function updatePointerFromEvent(e) {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
}

// --- CLICK HANDLER (Aligned to Face Normal) ---
function handleFaceClick(faceMesh) {
  // 1. Get the center position of the face (Target)
  const faceCenter = new THREE.Vector3();
  faceMesh.getWorldPosition(faceCenter);

  // 2. Set the Controls Target to this center
  focusPoint.copy(faceCenter);

  // 3. Calculate the Face Normal in World Space
  // Since your faces are part of a dodecahedron centered at (0,0,0),
  // the normal is simply the direction from (0,0,0) to the Face Center.
  const faceNormal = new THREE.Vector3().copy(faceCenter).sub(scene.position).normalize();

  // 4. Position the camera directly along that normal
  //    Target + (Normal * Distance) = Camera Position
  const distance = 35; // Distance away from the face
  desiredCameraPos.copy(faceCenter).add(faceNormal.multiplyScalar(distance));

  // 5. Start Animation
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
    controls.target.copy(homeTarget);
    controls.update();

    isAutoMoving = true;
}

// Use renderer canvas for pointer events
renderer.domElement.addEventListener('pointerdown', (e) => {
  updatePointerFromEvent(e);

  isDragging = false;
  startX = e.clientX;
  startY = e.clientY;

  isAutoMoving = false;
});

renderer.domElement.addEventListener('pointermove', (e) => {
  updatePointerFromEvent(e);

  if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
    isDragging = true;
  }
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
      if (INTERSECTED) {
        INTERSECTED.material.emissive.setHex(INTERSECTED.userData.originalEmissive);
      }
      INTERSECTED = hitFace;
      INTERSECTED.material.emissive.setHex(0xffd700);
    }
  } else {
    if (INTERSECTED) {
      INTERSECTED.material.emissive.setHex(INTERSECTED.userData.originalEmissive);
    }
    INTERSECTED = null;
  }
}

// --- Resize handling ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Close content on ESC key ---
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeResumeContent();
  }
});

// --- 6. Animation Loop ---
function animate() {
  requestAnimationFrame(animate);

  if (isAutoMoving) {
    // Smoothly move target and camera
    controls.target.lerp(focusPoint, 0.08);
    camera.position.lerp(desiredCameraPos, 0.08);

    if (camera.position.distanceTo(desiredCameraPos) < 0.05) {
      isAutoMoving = false;
    }
  }

  controls.update();
  handleHover();
  renderer.render(scene, camera);
}

animate();
