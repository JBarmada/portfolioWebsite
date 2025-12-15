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
controls.update();

let IS_CONTROLS_MOVING = false;
controls.addEventListener('start', () => { IS_CONTROLS_MOVING = true; });
controls.addEventListener('end', () => { setTimeout(() => { IS_CONTROLS_MOVING = false; }, 100); });

// --- 3. Lighting & Environment (The "Shiny" Logic) ---

scene.add(new THREE.AmbientLight(0xffffff, 0.2));

const rgbeLoader = new HDRLoader();
// FIX: Added leading slash '/' to ensure it looks in root/public
rgbeLoader.load(
    '/textures/neon_photostudio_4k.hdr', 
    function (texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
        console.log("HDRI loaded successfully.");
    },
    undefined,
    function (error) {
        console.error("CRITICAL ERROR: HDRI 404. Ensure 'neon_photostudio_1k.hdr' is in 'public/textures/' folder.");
    }
);

// --- 4. Model Loading ---

const gltfLoader = new GLTFLoader();
const modelPath = '/engram1.glb'; // Ensure this matches your file name exactly
const CLICKABLE_FACES = [];
let faceCount = 0;

gltfLoader.load(
    modelPath,
    function (gltf) {
        const model = gltf.scene;
        scene.add(model);

        model.traverse(function (child) {
            if (child.isMesh) {
                console.log("Loaded mesh:", child.name);

                faceCount++;
                child.userData.id = faceCount;
                child.userData.title = child.name || `Experience ${faceCount}`;
                child.userData.content = `<h3>Project: ${child.userData.title}</h3><p>Description...</p>`;

                // --- MATERIAL SETUP ---
                child.material = child.material.clone();

                // Special handling for the "Inside" core vs Outer Shells
                if (child.name.includes("Inside") || child.name.includes("Core")) {
                    child.material.emissive.setHex(0x220022); 
                } else {
                    // OUTER SHELLS (Purple Glass)
                    child.material.map = null; 
                    child.material.color.setHex(0x800080); // Purple
                    child.material.emissive.setHex(0x220022); 
                    child.material.roughness = 0.1; 
                    child.material.metalness = 0.6; 
                    child.material.transparent = true;
                    child.material.opacity = 0.5; 
                }

                // Save original glow for hover reset
                child.userData.originalEmissive = child.material.emissive.getHex();
                
                // IMPORTANT: NOW WE ADD EVERYONE TO THE LIST
                CLICKABLE_FACES.push(child);
            }
        });

        console.log(`Model loaded. Found ${faceCount} clickable faces.`);
    },
    // ... (error handlers remain the same)

    undefined,
    function (error) {
        console.error(`Error loading model from ${modelPath}:`, error);
    }
);

// --- 5. Interaction Logic ---

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let INTERSECTED = null;

const faceCenter = new THREE.Vector3();
function handleFaceClick(faceMesh) {
    faceMesh.getWorldPosition(faceCenter);
    controls.target.copy(faceCenter);
    camera.lookAt(faceCenter);
    controls.update();
    displayResumeContent(faceMesh.userData);
}

// UI Logic
function displayResumeContent(data) {
    let contentDiv = document.getElementById('resume-content');
    if (!contentDiv) {
        contentDiv = document.createElement('div');
        contentDiv.id = 'resume-content';
        // Basic styling
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
    
    document.getElementById('close-content').onclick = () => {
        contentDiv.style.display = 'none';
        controls.target.set(0, 0, 0); 
        controls.update();
    };
}

// Mouse Handlers
function onPointerMove(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
}

function handleHover() {
    if (IS_CONTROLS_MOVING) return;
    
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(CLICKABLE_FACES, false);

    if (intersects.length > 0) {
        const hitFace = intersects[0].object;
        if (INTERSECTED !== hitFace) {
            if (INTERSECTED) INTERSECTED.material.emissive.setHex(INTERSECTED.userData.originalEmissive);
            INTERSECTED = hitFace;
            INTERSECTED.material.emissive.setHex(0xFFD700); // Hover Color
        }
    } else {
        if (INTERSECTED) INTERSECTED.material.emissive.setHex(INTERSECTED.userData.originalEmissive);
        INTERSECTED = null;
    }
}

function onClick(event) {
    if (IS_CONTROLS_MOVING) return;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(CLICKABLE_FACES, false);
    if (intersects.length > 0) handleFaceClick(intersects[0].object);
}

window.addEventListener('pointermove', onPointerMove);
window.addEventListener('click', onClick);

// --- 6. Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    handleHover();
    renderer.render(scene, camera);
}

animate();