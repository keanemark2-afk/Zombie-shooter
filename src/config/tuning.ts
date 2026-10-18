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
 *  A note ending in [options: x, y, z] gives the choices in a drop-down list.
 *  Angles are in degrees, times in seconds, distances in metres.
 * ==========================================================================
 */
export const tuning = {
  // Mouse, keyboard and gamepad feel.
  controls: {
    mouseSensitivity: 0.2, // How fast the camera turns when you move the mouse. [0.02 to 1]
    aimSensitivity: 0.6, // Turning speed while aiming, compared with normal (1 = same speed). [0.1 to 1.5]
    invertY: false, // Tick to flip the camera's up/down direction.
    stickLookSpeed: 150, // How fast the right stick turns the camera, in degrees per second. [30 to 400]
    stickDeadzone: 0.15, // How far a stick must move before it counts. Stops a worn stick drifting. [0 to 0.5]
  },

  // How the player character moves.
  player: {
    walkSpeed: 3.1, // Normal running-around speed. [0.5 to 8]
    sprintSpeed: 5.4, // Speed while holding sprint. [1 to 12]
    aimWalkSpeed: 1.25, // Speed while aiming in Modern aim mode. [0 to 4]
    classicAim: false, // Tick for 2005-style aiming: feet planted while aiming. Untick for 2023-style slow walking while aiming.
    acceleration: 14, // How quickly you reach full speed. Higher feels snappier. [2 to 40]
    turnSpeed: 720, // How fast the character turns to face the way you run, in degrees per second. [90 to 1800]
    quickTurn: true, // Hold back and tap sprint (while facing away from the camera) to spin round 180 degrees. Untick to switch it off.
    quickTurnTime: 0.3, // How long the quick 180-degree turn takes. [0.1 to 1]
    radius: 0.35, // Size of the player's body for bumping into things. [0.2 to 0.6]
    hitStunTime: 0.55, // How long you are stunned (can't aim) after a zombie hits you. [0 to 2]
  },

  // The over-the-shoulder camera.
  camera: {
    fov: 62, // Field of view when not aiming. Bigger shows more. [40 to 100]
    aimFov: 46, // Field of view while aiming (the push-in zoom). [20 to 90]
    distance: 2.7, // How far behind the player the camera sits. [1 to 6]
    height: 1.62, // How high the camera's pivot is (about shoulder height). [0.8 to 2.5]
    shoulderOffset: 0.55, // How far to the right of the player the camera sits. [-1 to 1.5]
    aimDistance: 1.45, // Camera distance behind the player while aiming. [0.4 to 4]
    aimShoulderOffset: 0.72, // Camera offset to the right while aiming. [-1 to 1.5]
    aimHeight: 1.66, // Camera pivot height while aiming. [0.8 to 2.5]
    zoomTime: 0.13, // How long the camera takes to push in when you start aiming. [0.02 to 0.6]
    lookDownLimit: 65, // How far down you can look. [10 to 89]
    lookUpLimit: 55, // How far up you can look. [10 to 89]
    wallPadding: 0.2, // How far the camera keeps from walls so they never block the view. [0 to 0.6]
    wallEaseOut: 6, // How smoothly the camera slides back out after a wall stops pushing it in. Higher = quicker. [1 to 30]
  },

  // Shared weapon settings.
  weapons: {
    infiniteAmmo: true, // Spare ammo never runs out (handy for testing).
    switchTime: 0.45, // How long swapping to another weapon takes. [0.1 to 2]
    startWeapon: 'pistol', // The weapon in your hands when a round starts. [options: pistol, pump, drum]
  },

  // The starter pistol ("Kestrel 9"). Weapon slot 1.
  pistol: {
    damage: 100, // Firepower: damage per bullet before body-part multipliers. [10 to 1000]
    pellets: 1, // Bullets fired per shot. [1 to 20]
    pelletSpread: 0, // How wide extra pellets scatter, in degrees (0 for a single bullet). [0 to 20]
    falloffStart: 200, // Distance where damage starts to drop off. [1 to 200]
    falloffEnd: 200, // Distance where damage reaches its lowest. [1 to 400]
    falloffMin: 1, // Fraction of damage left at long range (1 = no drop-off). [0 to 1]
    fireInterval: 0.24, // Fire rate: minimum time between shots. Lower = faster. [0.05 to 1.5]
    capacity: 10, // Bullets per magazine. [1 to 60]
    reloadTime: 1.35, // Reload speed with bullets still in the gun. [0.2 to 5]
    emptyReloadTime: 1.85, // Reload speed when the gun is completely empty (slide has to be racked). [0.2 to 6]
    focusTime: 0.75, // How long the reticle takes to tighten fully while you hold still. [0.05 to 3]
    spreadWide: 3.2, // Reticle size (aim wobble) when you first raise the gun, in degrees. [0.2 to 10]
    spreadTight: 0.22, // Reticle size when fully focused. [0 to 3]
    spreadMoving: 1.4, // Smallest reticle size while walking and aiming. [0 to 6]
    fireBloom: 1.7, // How much each shot widens the reticle. [0 to 6]
    turnBloom: 0.03, // How much the reticle widens per degree you swing the camera. [0 to 0.3]
    swaySpeed: 1.7, // How fast the laser dot wanders inside the reticle. [0.1 to 6]
    recoilKick: 1.6, // How far each shot kicks your aim upwards, in degrees. [0 to 8]
    recoilSideways: 0.45, // Random sideways recoil per shot, in degrees. [0 to 4]
    recoilRecovery: 9, // How quickly your aim settles back after recoil. Higher = faster. [1 to 30]
    knockback: 0.15, // How hard each bullet shoves a zombie, in metres. [0 to 3]
    pierce: 0, // How many extra zombies one bullet can pass through. [0 to 5]
    blastRange: 0, // Close-range blast reach: zombies this close in front get bowled over even if missed (0 = none). [0 to 6]
    blastAngle: 0, // How wide the close-range blast is, in degrees either side of your aim. [0 to 60]
    blastPush: 0, // How hard the close-range blast shoves (1.6+ knocks a zombie down). [0 to 8]
    maxRange: 120, // How far bullets travel. [10 to 400]
    spareAmmo: 60, // Spare bullets you carry when infinite ammo is off. [0 to 500]
  },

  // Pump-action shotgun ("Bramble 12"). Weapon slot 2. Loads one shell at a time.
  pumpShotgun: {
    damage: 42, // Firepower: damage per pellet before body-part multipliers. [5 to 500]
    pellets: 9, // Pellets per shot. [1 to 20]
    pelletSpread: 6.5, // How wide the pellets scatter, in degrees. Bigger hits more zombies up close. [0 to 20]
    falloffStart: 5, // Distance where pellet damage and push start to drop off. [1 to 60]
    falloffEnd: 22, // Distance where pellets are at their weakest. [2 to 100]
    falloffMin: 0.25, // Fraction of pellet damage left at long range. [0 to 1]
    fireInterval: 0.85, // Time between shots, including working the pump. [0.2 to 3]
    capacity: 6, // Shells the gun holds. [1 to 20]
    reloadTime: 0.42, // Time to push in one shell. Reloads shell by shell; fire to stop early. [0.1 to 2]
    emptyReloadTime: 0.45, // Extra time to pump the first shell in when reloading from empty. [0 to 2]
    focusTime: 0.6, // How long the reticle takes to tighten fully while you hold still. [0.05 to 3]
    spreadWide: 4.5, // Reticle wobble when you first raise the gun, in degrees. [0.2 to 12]
    spreadTight: 0.6, // Reticle wobble when fully focused. [0 to 4]
    spreadMoving: 2, // Smallest wobble while walking and aiming. [0 to 8]
    fireBloom: 3, // How much each shot widens the reticle. [0 to 8]
    turnBloom: 0.03, // How much the reticle widens per degree you swing the camera. [0 to 0.3]
    swaySpeed: 1.4, // How fast the laser dot wanders inside the reticle. [0.1 to 6]
    recoilKick: 5.5, // How far each shot kicks your aim upwards, in degrees. [0 to 15]
    recoilSideways: 1.2, // Random sideways recoil per shot, in degrees. [0 to 6]
    recoilRecovery: 6, // How quickly your aim settles back after recoil. Higher = faster. [1 to 30]
    knockback: 0.32, // How hard each pellet shoves a zombie. Enough pellets knock it off its feet. [0 to 2]
    pierce: 0, // How many extra zombies one pellet can pass through. [0 to 5]
    blastRange: 3.2, // Close-range blast reach: zombies this close in front get bowled over even if missed. [0 to 6]
    blastAngle: 36, // How wide the close-range blast is, in degrees either side of your aim. [0 to 60]
    blastPush: 2.8, // How hard the close-range blast shoves (1.6+ knocks a zombie down). [0 to 8]
    maxRange: 60, // How far pellets travel. [5 to 200]
    spareAmmo: 24, // Spare shells you carry when infinite ammo is off. [0 to 200]
  },

  // Semi-automatic drum shotgun ("Thresher"). Weapon slot 3. Fires as fast as you pull the trigger.
  drumShotgun: {
    damage: 30, // Firepower: damage per pellet before body-part multipliers. [5 to 500]
    pellets: 8, // Pellets per shot. [1 to 20]
    pelletSpread: 5, // How wide the pellets scatter, in degrees. [0 to 20]
    falloffStart: 4, // Distance where pellet damage and push start to drop off. [1 to 60]
    falloffEnd: 18, // Distance where pellets are at their weakest. [2 to 100]
    falloffMin: 0.2, // Fraction of pellet damage left at long range. [0 to 1]
    fireInterval: 0.3, // Fire rate: minimum time between shots. [0.1 to 2]
    capacity: 12, // Shells in a drum. [1 to 40]
    reloadTime: 2.2, // Time to swap the drum with shells still in the gun. [0.3 to 6]
    emptyReloadTime: 2.7, // Time to swap the drum and rack the bolt when empty. [0.3 to 7]
    focusTime: 0.7, // How long the reticle takes to tighten fully while you hold still. [0.05 to 3]
    spreadWide: 5, // Reticle wobble when you first raise the gun, in degrees. [0.2 to 12]
    spreadTight: 0.8, // Reticle wobble when fully focused. [0 to 4]
    spreadMoving: 2.4, // Smallest wobble while walking and aiming. [0 to 8]
    fireBloom: 2.2, // How much each shot widens the reticle. [0 to 8]
    turnBloom: 0.03, // How much the reticle widens per degree you swing the camera. [0 to 0.3]
    swaySpeed: 1.6, // How fast the laser dot wanders inside the reticle. [0.1 to 6]
    recoilKick: 3.6, // How far each shot kicks your aim upwards, in degrees. [0 to 15]
    recoilSideways: 1.4, // Random sideways recoil per shot, in degrees. [0 to 6]
    recoilRecovery: 7, // How quickly your aim settles back after recoil. Higher = faster. [1 to 30]
    knockback: 0.24, // How hard each pellet shoves a zombie. [0 to 2]
    pierce: 0, // How many extra zombies one pellet can pass through. [0 to 5]
    blastRange: 2.6, // Close-range blast reach: zombies this close in front get bowled over even if missed. [0 to 6]
    blastAngle: 30, // How wide the close-range blast is, in degrees either side of your aim. [0 to 60]
    blastPush: 2.2, // How hard the close-range blast shoves (1.6+ knocks a zombie down). [0 to 8]
    maxRange: 50, // How far pellets travel. [5 to 200]
    spareAmmo: 36, // Spare shells you carry when infinite ammo is off. [0 to 200]
  },

  // Damage multipliers per body part.
  damage: {
    head: 2.5, // Headshot damage multiplier. [0 to 10]
    torso: 1, // Body shot damage multiplier. [0 to 5]
    arm: 0.6, // Arm shot damage multiplier. [0 to 5]
    leg: 0.75, // Leg shot damage multiplier. [0 to 5]
  },

  // How zombies react to being shot in different places.
  reactions: {
    classicHeadStagger: true, // 2005 rules: a pistol headshot always staggers a basic zombie. Untick for remake-style random staggers.
    remakeHeadStaggerChance: 0.35, // Chance a headshot staggers when the above is unticked (at a wide reticle). [0 to 1]
    focusStaggerBonus: 0.45, // Extra stagger chance with a perfectly tight reticle (remake rules only). [0 to 1]
    headStaggerTime: 1.5, // How long a head-staggered zombie clutches its face and stumbles. [0.2 to 4]
    legKneelChance: 1, // Chance a leg shot drops a walking zombie to one knee. [0 to 1]
    kneelTime: 1.8, // How long a zombie stays down on one knee. [0.3 to 5]
    kneelSpinChance: 0.25, // Chance a kneeling zombie twists round and ends up facing away. [0 to 1]
    tripTime: 2.6, // How long a tripped zombie lies on the ground before getting up. [0.5 to 8]
    getUpTime: 0.9, // How long getting back up takes. [0.2 to 3]
    armFlinchTime: 0.55, // How long an arm hit interrupts a zombie. [0.1 to 2]
    torsoFlinchTime: 0.25, // How long a body shot makes a zombie flinch. [0 to 1.5]
    knockbackThreshold: 0.6, // Knockback needed for a torso hit to shove a zombie back a step. [0 to 3]
    knockdownThreshold: 1.6, // Total push from one shot needed to blow a zombie off its feet (a close shotgun blast). [0.2 to 10]
    knockdownTime: 2, // How long a knocked-down zombie lies on its back before getting up. [0.3 to 8]
  },

  // The basic zombie (the "Shambler").
  zombie: {
    health: 450, // Health points. A pistol body shot does 100. [50 to 5000]
    walkSpeed: 1.05, // Normal shambling speed. [0.2 to 4]
    runSpeed: 4.2, // Speed during a running burst. [1 to 9]
    runChance: 0.12, // Chance each second (when 6+ metres away) that it breaks into a short run. [0 to 1]
    runDuration: 1.8, // How long a running burst lasts. [0.3 to 6]
    turnSpeed: 200, // How fast it turns towards you, in degrees per second. [20 to 900]
    attackRange: 1.35, // How close it must be to swing at you. [0.5 to 3]
    attackWindup: 0.75, // Warning time between raising its arms and swinging. [0.1 to 2]
    attackRecover: 0.9, // Pause after a swing before it moves again. [0 to 3]
    attackPush: 1.1, // How far a hit shoves you back (player health arrives in Phase 3). [0 to 4]
    weaponChance: 0.45, // Chance a zombie carries a farm tool. Shoot its arm to make it drop it. [0 to 1]
    corpseTime: 6, // How long bodies stay before sinking away. [0.5 to 60]
    groanInterval: 5, // Average time between groans. [1 to 30]
  },

  // The shooting range test area.
  range: {
    dummyDistance: 12, // How far down the lane the dummy zombie stands. [3 to 40]
    dummyCount: 1, // How many dummies stand side by side (try 3 with a shotgun). [1 to 6]
    dummyBehavior: 'stand', // What the dummy does. "run" is for testing leg-shot trips. [options: stand, walk, pace, run]
    dummyRespawnDelay: 2, // Seconds before a new dummy appears after one dies. [0 to 10]
    dummyInvincible: false, // Tick to make the dummy unkillable, for practising reactions.
    dummyHoldsWeapon: true, // The dummy carries a farm tool you can shoot out of its hand.
  },

  // The village zombie test.
  village: {
    zombieCount: 1, // How many zombies roam the village at once. [1 to 8]
    respawnDelay: 3, // Seconds before a new zombie walks in after one dies. [0 to 20]
  },

  // Hit feedback: the "juice" that makes shooting feel good.
  feel: {
    hitStopHead: 0.04, // Tiny freeze on a headshot, in seconds. [0 to 0.2]
    hitStopBody: 0, // Tiny freeze on other hits. [0 to 0.2]
    hitStopKill: 0.07, // Tiny freeze on a killing shot. [0 to 0.3]
    hitStopKnockdown: 0.06, // Tiny freeze when a blast knocks a zombie down. [0 to 0.3]
    shakeShot: 0.12, // Camera shake when you fire. [0 to 1]
    shakeHeadshot: 0.1, // Extra camera shake on a headshot. [0 to 1]
    shakeHurt: 0.5, // Camera shake when a zombie hits you. [0 to 1]
    hitMarkerTime: 0.22, // How long the hit marker stays on screen. [0 to 1]
    bloodAmount: 1, // How much blood sprays from hits. 0 = none. [0 to 3]
    shellLife: 8, // How long ejected bullet casings stay on the ground. [0 to 60]
    decalLife: 30, // How long bullet holes and blood splats stay. [1 to 120]
    muzzleFlash: 1, // Brightness of the muzzle flash. [0 to 3]
  },

  // Sound levels.
  audio: {
    masterVolume: 0.8, // Overall volume. [0 to 1]
    effectsVolume: 1, // Gunshots, impacts and footsteps. [0 to 1]
    voiceVolume: 1, // Zombie groans and grunts. [0 to 1]
  },

  // Sky, fog and lighting: the dusk mood of the village.
  atmosphere: {
    fogColor: '#4f4b5c', // Colour of the fog, and of the sky near the horizon.
    fogDensity: 0, // How thick the fog is. 0 = no fog. Try 0.02 for a light mist. [0 to 0.08]
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
    showHitboxes: false, // Colours each zombie body part by hit zone (head, body, arms, legs).
    flySpeed: 8, // Speed of the free-fly debug camera (F4). [1 to 40]
  },
};

export type Tuning = typeof tuning;
