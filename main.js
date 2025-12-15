import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- 1. Global Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// --- 2. Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
camera.position.z = 255; 

// --- SMOOTH PANNING VARIABLES ---
// We use this vector to store where we WANT to look.
const focusPoint = new THREE.Vector3(0, 0, 0); 

// --- 3. Lighting & Environment ---
scene.add(new THREE.AmbientLight(0xffffff, 0.2));

const rgbeLoader = new HDRLoader();
rgbeLoader.load(
    '/textures/neon_photostudio_4k.hdr', 
    function (texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
    }
);

// --- 4. Model Loading ---
const gltfLoader = new GLTFLoader();
const modelPath = '/engram1.glb'; 
const CLICKABLE_FACES = [];

gltfLoader.load(modelPath, function (gltf) {
    const model = gltf.scene;
    scene.add(model);

    let faceCount = 0;
    model.traverse(function (child) {
        if (child.isMesh) {
            faceCount++;
            child.userData.id = faceCount;
            child.userData.title = child.name || `Experience ${faceCount}`;
            child.userData.content = `<h3>Project: ${child.userData.title}</h3><p>Description...</p>`;

            child.material = child.material.clone();

            // Inner Core vs Outer Shell Logic
            if (child.name.includes("Inside") || child.name.includes("Core")) {
                child.material.emissive.setHex(0x220022); 
            } else {
                child.material.map = null; 
                child.material.color.setHex(0x800080); // Purple
                child.material.emissive.setHex(0x220022); 
                child.material.roughness = 0.1; 
                child.material.metalness = 0.6; 
                child.material.transparent = true;
                child.material.opacity = 0.5; 
            }

            child.userData.originalEmissive = child.material.emissive.getHex();
            CLICKABLE_FACES.push(child);
        }
    });
});

// --- 5. Interaction Logic ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let INTERSECTED = null;

// --- CLICK HANDLER (UPDATED) ---
function handleFaceClick(faceMesh) {
    // 1. Get the position of the clicked face
    const tempVec = new THREE.Vector3();
    faceMesh.getWorldPosition(tempVec);

    // 2. Tell our smooth-pan system: "Start moving towards this point"
    focusPoint.copy(tempVec);
    
    // 3. Show UI
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
            display: 'none', fontFamily: 'Arial, sans-serif', border: '1px solid #444'
        });
        document.body.appendChild(contentDiv);
    }
    
    contentDiv.innerHTML = `<button id="close-content" style="float:right; cursor:pointer;">X</button><h3 style="margin-top:0">${data.title}</h3>${data.content}`;
    contentDiv.style.display = 'block';
    
    // --- CLOSE BUTTON (UPDATED) ---
    document.getElementById('close-content').onclick = () => {
        contentDiv.style.display = 'none';
        
        // Reset the focus point to Origin (0,0,0)
        focusPoint.set(0, 0, 0); 
    };
}

// --- MOUSE LOGIC ---
let isDragging = false;
let startX = 0;
let startY = 0;

window.addEventListener('pointerdown', (e) => { isDragging = false; startX = e.clientX; startY = e.clientY; });
window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (e.clientY / window.innerHeight) * 2 + 1;
    if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) isDragging = true;
});
window.addEventListener('pointerup', () => {
    if (!isDragging) {
        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObjects(CLICKABLE_FACES, false);
        if (intersects.length > 0) handleFaceClick(intersects[0].object);
    }
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
            INTERSECTED.material.emissive.setHex(0xFFD700);
        }
    } else {
        if (INTERSECTED) INTERSECTED.material.emissive.setHex(INTERSECTED.userData.originalEmissive);
        INTERSECTED = null;
    }
}

// --- 6. Animation Loop (UPDATED) ---
function animate() {
    requestAnimationFrame(animate);
    
    // --- SMOOTH CAMERA PANNING ---
    // Every frame, move the controls target 5% closer to the focusPoint
    // This creates the smooth "slide" effect.
    controls.target.lerp(focusPoint, 0.05);

    controls.update(); // Must be called after changing target
    handleHover();
    renderer.render(scene, camera);
}

animate();