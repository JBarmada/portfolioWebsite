import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'; // <--- NEW IMPORT
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Global Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
// --- NEW TONE MAPPING SETTINGS ---
renderer.toneMapping = THREE.ACESFilmicToneMapping; // Makes brights look realistic
renderer.toneMappingExposure = 1.0; 
document.body.appendChild(renderer.domElement);
// --- Interactivity Globals ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const CLICKABLE_FACES = []; // Holds all 12 mesh objects
let INTERSECTED = null; // Stores the currently hovered face
// Removed IS_VIEWING_EXPERIENCE flag

// --- New Global Flag to Track Movement ---
let IS_CONTROLS_MOVING = false;

// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Provides a smooth, inertial feel
controls.dampingFactor = 0.05;
camera.position.z = 205; // Initial camera distance
controls.update();

// --- Controls Event Listeners for Movement Tracking ---

// When the user starts manipulating the controls (mouse down/touch start)
controls.addEventListener('start', () => {
    IS_CONTROLS_MOVING = true;
});

// When the controls stop moving (either immediately on mouse up OR after damping finishes)
controls.addEventListener('end', () => {
    // We use a small timeout to ensure the damping has fully settled before allowing a click.
    setTimeout(() => {
        IS_CONTROLS_MOVING = false;
    }, 100); 
    // Note: The dampingFactor determines how long this takes. 100ms is a safe value.
});

// // --- Lighting ---
// --- Lighting & Environment (HDRI) ---

// 1. Keep a subtle ambient light so shadows aren't pitch black
scene.add(new THREE.AmbientLight(0xffffff, 0.2)); 

// 2. Load the HDRI
const rgbeLoader = new RGBELoader();

// REPLACE 'textures/neon_photostudio_1k.hdr' with your actual file path
rgbeLoader.load('textures/neon_photostudio_1k.hdr', function (texture) {
    texture.mapping = THREE.EquirectangularReflectionMapping;

    // This applies the image as the "environment" that the shiny object reflects
    scene.environment = texture;

    // Optional: If you want to see the studio background instead of black, uncomment this:
    // scene.background = texture; 
});
// --- Lighting Setup 1: Basic Fill ---
// Use a moderate intensity to lift shadows without washing out colors.
// const ambientLight = new THREE.AmbientLight(0xffffff, 1.5); 
// scene.add(ambientLight);

// --- Lighting Setup 2: Studio Lighting ---
// Low ambient light for fill
// scene.add(new THREE.AmbientLight(0xffffff, 0.25)); 

// // Key light (like the sun)
// const directionalLight = new THREE.DirectionalLight(0xffffff, 3.0);
// directionalLight.position.set(5, 10, 5); // Position affects shadow direction
// directionalLight.castShadow = true; // Enable shadow casting
// scene.add(directionalLight);

// --- Lighting Setup 3: Dramatic Spotlight ---

// Spot light parameters: (Color, Intensity, Distance, Angle, Penumbra, Decay)
// const spotLight = new THREE.SpotLight(0x00ffcc, 10, 100, Math.PI * 0.2, 0.5, 2);
// spotLight.position.set(0, 15, 0); // Position high above the model
// spotLight.target.position.set(0, 0, 0); // Point the light at the center of the dodecahedron
// spotLight.castShadow = true; 
// scene.add(spotLight);
// scene.add(spotLight.target); // Must add the target object to the scene

// Hemisphere Light: Provides soft, colored ambient light
// (Sky color, Ground color, Intensity)
// const hemiLight = new THREE.HemisphereLight(0x4444ff, 0xaa0000, 1.5); 
// scene.add(hemiLight);

// // Point Light: A subtle blue-white light placed behind and above the model
// const pointLight = new THREE.PointLight(0xddddff, 5, 50);
// pointLight.position.set(-10, 5, -10); // Placed to create a rim light effect
// scene.add(pointLight);

// --- Model Loading Logic ---

const gltfLoader = new GLTFLoader();
// const modelPath = '/engram_destiny_2.glb'; // Ensure this path is correct
const modelPath = '/engram1.glb';


gltfLoader.load(
    modelPath,
    function (gltf) {
        const model = gltf.scene;
        scene.add(model);

        let faceCount = 0;
        model.traverse(function (child) {
            if (child.isMesh) {
                faceCount++;
                
                child.userData.id = faceCount; 
                child.userData.title = child.name || `Experience ${faceCount}`;
                
                // **Placeholder Content:** Replace this with your actual resume data
                child.userData.content = `<h3>Project Focus: ${child.userData.title}</h3><p>This section details a key skill or project, such as 'Full-Stack Development with React/Node' or '3D Graphics & Game Engine Experience'.</p><p>Key Achievements: [List 3 bullet points]</p>`;
                
                child.material = child.material.clone(); 
                child.userData.originalEmissive = child.material.emissive.getHex();

                CLICKABLE_FACES.push(child);
            }
        });
        
        if (faceCount !== 12) {
             console.warn(`Expected 12 faces, but found ${faceCount}.`);
        } else {
             console.log("All 12 faces loaded and ready.");
        }
    },
    undefined, 
    function (error) {
        console.error(`Error loading model from ${modelPath}:`, error);
    }
);

// --- Core Logic for Camera Jump and Content Display ---

const faceCenter = new THREE.Vector3();

function handleFaceClick(faceMesh) {
    // 1. Calculate Target Positions
    faceMesh.getWorldPosition(faceCenter); 
    
    // 2. INSTANTANEOUS PAN/ROTATION 
    controls.target.copy(faceCenter);
    camera.lookAt(faceCenter); 
    
    // 3. Force Controls Update
    controls.update(); 
    
    // 4. Display the Content
    displayResumeContent(faceMesh.userData);
}

// --- Content Display Functions (unchanged) ---

function displayResumeContent(data) {
    let contentDiv = document.getElementById('resume-content');
    
    contentDiv.innerHTML = `
        <button id="close-content">X</button>
        <h3>${data.title}</h3>
        ${data.content}
    `;
    
    renderer.domElement.style.zIndex = '0'; 
    document.getElementById('close-content').onclick = exitResumeContent;
    contentDiv.style.display = 'block';
}

function exitResumeContent() {
    const contentDiv = document.getElementById('resume-content');
    if (contentDiv) {
        contentDiv.style.display = 'none';
    }
    
    renderer.domElement.style.zIndex = '1'; 
    controls.target.set(0, 0, 0);
    controls.minDistance = 0; 
    controls.maxDistance = Infinity; 
    controls.update();
}

// --- Interaction Handlers (Pointer Move, Hover, and Click) ---

function onPointerMove(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
}

function handleHover() {
    // NEW CHECK: Disable hover if controls are still moving/damping
    if (IS_CONTROLS_MOVING) {
        if (INTERSECTED) {
            INTERSECTED.material.emissive.setHex(INTERSECTED.userData.originalEmissive);
            INTERSECTED = null;
        }
        return;
    } 
    
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(CLICKABLE_FACES, false);

    if (intersects.length > 0) {
        const hitFace = intersects[0].object;
        if (INTERSECTED !== hitFace) {
            if (INTERSECTED) {
                INTERSECTED.material.emissive.setHex(INTERSECTED.userData.originalEmissive);
            }
            INTERSECTED = hitFace;
            INTERSECTED.material.emissive.setHex(0x00ffcc); 
        }
    } else {
        if (INTERSECTED) {
            INTERSECTED.material.emissive.setHex(INTERSECTED.userData.originalEmissive);
        }
        INTERSECTED = null;
    }
}

function onClick(event) {
    // NEW CHECK: Disable click if controls are still moving/damping
    if (IS_CONTROLS_MOVING) return; 

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(CLICKABLE_FACES, false);

    if (intersects.length > 0) {
        handleFaceClick(intersects[0].object); 
    }
}

// --- Event Listeners ---
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('click', onClick);


// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);

    controls.update(); 
    handleHover();
    renderer.render(scene, camera);
}

animate();