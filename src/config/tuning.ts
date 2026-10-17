/**
 * ==========================================================================
 *  DEAD ACRE - TUNING FILE
 * ==========================================================================
 *  Every number that changes how the game plays or looks lives in this file.
 *  Each line has a plain-English note after the "//" explaining what it does.
 *
 *  Change values live while playing: press F1 to open the tuning panel.
 *  Hover over any setting in the panel to see its note from this file.
 *  Press "Copy values" in the panel, then paste the result to Claude to make
 *  your favourite settings permanent.
 *
 *  Colours are written like '#ff8800' (red, green and blue amounts in hex).
 *  A note ending in [a to b] gives the slider range in the panel.
 * ==========================================================================
 */
export const tuning = {
  // The free-flying camera used in Phase 0 to look around the empty arena.
  flyCamera: {
    moveSpeed: 6, // How fast the camera flies, in metres per second. [1 to 30]
    fastMultiplier: 3, // Holding Shift multiplies the flying speed by this much. [1 to 10]
    lookSensitivity: 0.25, // How quickly the view turns when you drag the mouse. [0.05 to 1]
    fov: 60, // Field of view in degrees. Bigger shows more of the world but looks more stretched. [40 to 100]
  },

  // Sky, fog and lighting: the dusk mood of the village.
  atmosphere: {
    fogColor: '#4f4b5c', // Colour of the fog that swallows the distance.
    fogDensity: 0.02, // How thick the fog is. Higher means you can see less far. [0 to 0.08]
    skyTopColor: '#141826', // Colour of the sky straight overhead.
    sunGlowColor: '#c4613a', // Colour of the glow on the horizon where the sun has just set.
    sunGlowStrength: 0.9, // How bright that sunset glow is. [0 to 3]
    sunColor: '#ff9e6b', // Colour of the low evening sunlight.
    sunIntensity: 1.6, // Brightness of the evening sunlight and how strong its shadows look. [0 to 5]
    sunHeight: 11, // How high the sun sits above the horizon, in degrees. Lower = longer shadows. [2 to 60]
    skyLightColor: '#7d88b0', // Colour of the soft light coming from the whole sky.
    skyLightIntensity: 2.4, // Brightness of the soft sky light that fills in the shadows. [0 to 5]
    groundBounceColor: '#4a3c30', // Colour of light bouncing up off the dirt.
    lampColor: '#ffa64d', // Colour of the warm light from windows and lanterns.
    lampIntensity: 22, // Brightness of the window and lantern lights. [0 to 60]
    lampRange: 13, // How far window and lantern light reaches, in metres. [2 to 40]
    lampFlicker: 0.18, // How much lantern flames flicker. 0 = steady. [0 to 1]
    exposure: 1.25, // Overall brightness of the whole picture. [0.2 to 3]
  },

  // Screen effects applied on top of the 3D picture.
  postFx: {
    enabled: true, // Turns all screen effects (glow, colour grading, vignette, grain) on or off.
    bloomStrength: 0.55, // How strongly bright things (lamps, windows, fire) glow. [0 to 3]
    bloomRadius: 0.55, // How far that glow spreads around bright things. [0 to 1]
    bloomThreshold: 0.82, // How bright something must be before it starts to glow. [0 to 2]
    saturation: 0.72, // Colour richness. 1 = normal, lower = more washed-out and grim. [0 to 2]
    contrast: 1.1, // Difference between darks and lights. 1 = normal. [0.5 to 2]
    vignette: 0.55, // How much the screen corners darken. [0 to 1.5]
    grain: 0.045, // Strength of the film-grain flicker. [0 to 0.3]
  },

  // Picture quality versus speed.
  graphics: {
    maxPixelRatio: 1.5, // Caps sharpness on high-resolution screens. Lower = faster but blurrier. [0.5 to 3]
    shadows: true, // Turns shadows on or off. Off is faster.
    shadowMapSize: 2048, // Shadow detail. Higher = crisper shadows but slower. Use 1024, 2048 or 4096. [512 to 4096]
  },

  // How the game clock runs.
  simulation: {
    tickRate: 60, // How many times per second the game world updates. [20 to 240]
    maxFrameTime: 0.1, // Longest pause, in seconds, the game will catch up on after a stutter. [0.02 to 0.5]
  },

  // Developer helpers.
  debug: {
    showColliders: false, // Draws yellow outlines around everything solid you will bump into.
  },
};

export type Tuning = typeof tuning;
