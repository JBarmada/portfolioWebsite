/**
 * config.js
 * * Central configuration file for the 3D scene.
 * Tweak these values to adjust colors, speeds, positions, and sizes.
 */

export const CONFIG = {
    // ============================================
    // 📷 CAMERA & NAVIGATION
    // ============================================
    focusDistance: 35,          // Distance from the object when clicked/focused
    homeDistance: 255,          // Initial distance of camera from center (Home position)
    camFov: 75,                 // Camera Field of View
    camFar: 100000,             // Render distance (how far the camera sees)
    minZoom: 10,                // Closest manual zoom distance
    maxZoom: 10000,             // Furthest manual zoom distance
    autoMoveSpeed: 0.03,        // Speed of automatic camera transitions (0.01 = slow, 0.1 = fast)
    flightAltitude: 300,        // Arc height when flying between faces
  
    // ============================================
    // 🖱️ CONTROLS (TRACKBALL)
    // ============================================
    rotateSpeed: 2.0,           // Speed of rotation
    zoomSpeed: 1.2,             // Speed of zoom
    panSpeed: 0.8,              // Speed of panning
    dampingFactor: 0.1,         // Inertia/Slide effect (lower = slippier)
    staticMoving: false,        // If true, disables inertia
    doubleTapDelay: 300,        // Max milliseconds between clicks to count as a double-click
  
    // ============================================
    // 💡 LIGHTING & ENVIRONMENT
    // ============================================
    ambientLightIntensity: 0.2, // General brightness of the scene
    exposure: 1.15,             // Camera exposure setting (Tone mapping)
    bgDimOpacity: 0.17,         // Opacity of the dark overlay behind the 3D scene
  
    // ============================================
    // ✨ STAR TRANSFORMATION (The glowing dot)
    // ============================================
    fadeStart: 2600,            // Distance where the Engram starts turning into a Star
    fadeEnd: 3300,              // Distance where the transition is complete
    starSizeMultiplier: 0.10,   // How much the star grows based on distance
    starBaseSize: 250,          // Base pixel size of the star sprite
    starPulseSpeed: 0.003,      // Speed of the star's pulsing animation
  
    // ============================================
    // 🎨 COLORS & MATERIALS
    // ============================================
    colorBase: 0x800080,        // Base color of the Engram faces (Purple)
    colorEmissive: 0x220022,    // Glow color of the faces
    colorHighlight: 0xffd700,   // Color when hovering over a face (Gold)
    materialOpacity: 0.5,       // Transparency of the glass faces
    materialRoughness: 0.1,     // Surface roughness (0 = polished, 1 = matte)
    materialMetalness: 0.6,     // Metallic look (0 = plastic, 1 = metal)
  
    // ============================================
    // 🖥️ UI SETTINGS
    // ============================================
    uiColor: '#00ffcc',         // Main text color for UI buttons
    uiBgColor: 'rgba(0,0,0,0.8)', // Background color for buttons
    uiHamburgerSize: '30px',    // Size of the menu icon
    uiButtonFontSize: '20px',   // Font size for menu items
    uiButtonOpacity: 0.9,       // Opacity of UI elements
    uiHoverScale: 1.1,          // Scale effect when hovering buttons
  
    // ============================================
    // ☀️ SUN SHADER ANIMATION
    // ============================================
    sunTimeScale: 0.25,         // Global speed of sun animation
    sunCoreSpeed: 1.25,         // Speed of the lava texture on the sphere
    sunCoronaSpeed: 1.0,        // Speed of the solar flares/rays
    sunWarpStrength: 2.0,       // Intensity of the heat distortion
    sunWarpScale: 2.2,          // Scale of the noise pattern
    sunTint: 0.7,               // Color tint factor (Green channel)
    sunIntensity: 1.0,          // Brightness multiplier
  
    // ============================================
    // ☀️ SUN GEOMETRY (RESIZING)
    // ============================================
    // The position of the sun in the 3D world
    sunPosition: { x: 15000, y: 20000, z: 10000 },
    
    // Master Scale: Change this to resize the sun easily!
    // 1.0 = Default, 0.5 = Half size, 2.0 = Double size
    sunGlobalScale: 1.0, 
    
    // Technical geometry settings (Base sizes)
    sunCoreRadius: 2500,        // Radius of the inner sphere
    sunCoronaWidth: 10000,      // Width of the glow plane
    sunCoronaHeight: 11000,     // Height of the glow plane
  };