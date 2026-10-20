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
    scopeFov: 16, // Field of view through the rifle scope. Smaller = more zoom. [4 to 40]
    scopeSensitivity: 0.35, // Turning speed through the scope, compared with normal. [0.05 to 1.5]
  },

  // Shared weapon settings.
  weapons: {
    infiniteAmmo: true, // Shooting range only: spare ammo never runs out, so you can test guns freely.
    cheatInfiniteAmmo: false, // Cheat for Survival and Score Attack: spare ammo never runs out.
    switchTime: 0.45, // How long swapping to another weapon takes. [0.1 to 2]
    startWeapon: 'pistol', // The weapon in your hands when a round starts. [options: pistol, pump, drum, smg, rifle, magnum, rocket, heavy, swift]
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
    headPop: 0, // Chance a bullet or pellet that hits the head bursts it, at close range (less further away). [0 to 1]
    critChance: 0.05, // Chance any headshot is a critical that bursts the head, with a fully tight reticle (half that when wide). [0 to 1]
    dismember: 0, // Chance a bullet or pellet that hits an arm or leg tears it off, at close range. [0 to 1]
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
    headPop: 0.85, // Chance a bullet or pellet that hits the head bursts it, at close range (less further away). [0 to 1]
    critChance: 0.05, // Chance any headshot is a critical that bursts the head, with a fully tight reticle (half that when wide). [0 to 1]
    dismember: 0.3, // Chance a bullet or pellet that hits an arm or leg tears it off, at close range. [0 to 1]
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
    headPop: 0.6, // Chance a bullet or pellet that hits the head bursts it, at close range (less further away). [0 to 1]
    critChance: 0.04, // Chance any headshot is a critical that bursts the head, with a fully tight reticle (half that when wide). [0 to 1]
    dismember: 0.22, // Chance a bullet or pellet that hits an arm or leg tears it off, at close range. [0 to 1]
  },

  // Submachine gun ("Magpie"). Weapon slot 4. Keeps firing while you hold the trigger.
  smg: {
    damage: 55, // Firepower: damage per bullet before body-part multipliers. [5 to 500]
    pellets: 1, // Bullets fired per shot. [1 to 20]
    pelletSpread: 0, // How wide extra pellets scatter, in degrees (0 for a single bullet). [0 to 20]
    falloffStart: 15, // Distance where damage starts to drop off. [1 to 200]
    falloffEnd: 45, // Distance where damage reaches its lowest. [1 to 400]
    falloffMin: 0.6, // Fraction of damage left at long range. [0 to 1]
    fireInterval: 0.075, // Fire rate: time between bullets while the trigger is held. [0.03 to 0.5]
    capacity: 40, // Bullets per magazine. [1 to 120]
    reloadTime: 1.6, // Reload speed with bullets still in the gun. [0.2 to 5]
    emptyReloadTime: 2, // Reload speed when completely empty (bolt has to be pulled). [0.2 to 6]
    focusTime: 0.9, // How long the reticle takes to tighten fully while you hold still. [0.05 to 3]
    spreadWide: 4.2, // Reticle size when you first raise the gun, in degrees. [0.2 to 12]
    spreadTight: 0.9, // Reticle size when fully focused (it never gets very tight). [0 to 4]
    spreadMoving: 2, // Smallest reticle size while walking and aiming. [0 to 8]
    fireBloom: 0.55, // How much each bullet widens the reticle. [0 to 6]
    turnBloom: 0.03, // How much the reticle widens per degree you swing the camera. [0 to 0.3]
    swaySpeed: 2.2, // How fast the laser dot wanders inside the reticle. [0.1 to 6]
    recoilKick: 0.7, // How far each bullet kicks your aim upwards, in degrees. [0 to 8]
    recoilSideways: 0.5, // Random sideways recoil per bullet, in degrees. [0 to 4]
    recoilRecovery: 12, // How quickly your aim settles back after recoil. Higher = faster. [1 to 30]
    knockback: 0.08, // How hard each bullet shoves a zombie. [0 to 2]
    pierce: 0, // How many extra zombies one bullet can pass through. [0 to 5]
    blastRange: 0, // Close-range blast reach (0 = none). [0 to 6]
    blastAngle: 0, // How wide the close-range blast is, in degrees either side of your aim. [0 to 60]
    blastPush: 0, // How hard the close-range blast shoves. [0 to 8]
    maxRange: 90, // How far bullets travel. [10 to 400]
    spareAmmo: 200, // Spare bullets you carry when infinite ammo is off. [0 to 1000]
    headPop: 0, // Chance a bullet that hits the head bursts it, at close range. [0 to 1]
    critChance: 0.01, // Chance any headshot is a critical that bursts the head, with a fully tight reticle. [0 to 1]
    dismember: 0, // Chance a bullet that hits an arm or leg tears it off, at close range. [0 to 1]
  },

  // Bolt-action rifle with a scope ("Heron"). Weapon slot 5. Aim to look through the scope.
  rifle: {
    damage: 520, // Firepower: damage per bullet before body-part multipliers. [50 to 5000]
    pellets: 1, // Bullets fired per shot. [1 to 20]
    pelletSpread: 0, // How wide extra pellets scatter, in degrees (0 for a single bullet). [0 to 20]
    falloffStart: 300, // Distance where damage starts to drop off. [1 to 400]
    falloffEnd: 300, // Distance where damage reaches its lowest. [1 to 400]
    falloffMin: 1, // Fraction of damage left at long range (1 = no drop-off). [0 to 1]
    fireInterval: 1.25, // Time between shots, including working the bolt. [0.3 to 4]
    capacity: 5, // Rounds the rifle holds. [1 to 20]
    reloadTime: 0.55, // Time to push in one round. Loads round by round; fire to stop early. [0.1 to 2]
    emptyReloadTime: 0.5, // Extra time to work the bolt when reloading from empty. [0 to 2]
    focusTime: 1, // How long the scope takes to steady fully while you hold still. [0.05 to 4]
    spreadWide: 1.4, // Scope drift when you first look through it, in degrees. [0 to 8]
    spreadTight: 0, // Scope drift when fully steady. [0 to 3]
    spreadMoving: 1.1, // Smallest drift while walking and aiming. [0 to 6]
    fireBloom: 1.2, // How much each shot unsteadies the scope. [0 to 6]
    turnBloom: 0.015, // How much the scope drifts per degree you swing the view. [0 to 0.3]
    swaySpeed: 0.8, // How fast the scope crosshair wanders. [0.1 to 6]
    recoilKick: 4, // How far each shot kicks your aim upwards, in degrees. [0 to 15]
    recoilSideways: 0.6, // Random sideways recoil per shot, in degrees. [0 to 6]
    recoilRecovery: 5, // How quickly your aim settles back after recoil. Higher = faster. [1 to 30]
    knockback: 0.6, // How hard each bullet shoves a zombie. [0 to 3]
    pierce: 2, // How many extra zombies one bullet can pass through. [0 to 5]
    blastRange: 0, // Close-range blast reach (0 = none). [0 to 6]
    blastAngle: 0, // How wide the close-range blast is, in degrees either side of your aim. [0 to 60]
    blastPush: 0, // How hard the close-range blast shoves. [0 to 8]
    maxRange: 250, // How far bullets travel. [10 to 400]
    spareAmmo: 30, // Spare rounds you carry when infinite ammo is off. [0 to 200]
    headPop: 1, // Chance a bullet that hits the head bursts it. [0 to 1]
    critChance: 0.1, // Chance any headshot is a critical, with a fully steady scope. [0 to 1]
    dismember: 0.85, // Chance a bullet that hits an arm or leg tears it off. [0 to 1]
  },

  // Big revolver ("Oxbow"). Weapon slot 6. Huge damage, punches through zombies.
  magnum: {
    damage: 700, // Firepower: damage per bullet before body-part multipliers. [50 to 5000]
    pellets: 1, // Bullets fired per shot. [1 to 20]
    pelletSpread: 0, // How wide extra pellets scatter, in degrees (0 for a single bullet). [0 to 20]
    falloffStart: 200, // Distance where damage starts to drop off. [1 to 400]
    falloffEnd: 200, // Distance where damage reaches its lowest. [1 to 400]
    falloffMin: 1, // Fraction of damage left at long range (1 = no drop-off). [0 to 1]
    fireInterval: 0.7, // Fire rate: minimum time between shots. [0.2 to 3]
    capacity: 6, // Rounds in the cylinder. [1 to 12]
    reloadTime: 2.4, // Time to swing out the cylinder and load all six. [0.3 to 6]
    emptyReloadTime: 2.4, // The same when completely empty. [0.3 to 6]
    focusTime: 0.8, // How long the reticle takes to tighten fully while you hold still. [0.05 to 3]
    spreadWide: 3.4, // Reticle size when you first raise the gun, in degrees. [0.2 to 12]
    spreadTight: 0.3, // Reticle size when fully focused. [0 to 4]
    spreadMoving: 1.8, // Smallest reticle size while walking and aiming. [0 to 8]
    fireBloom: 4, // How much each shot widens the reticle. [0 to 8]
    turnBloom: 0.03, // How much the reticle widens per degree you swing the camera. [0 to 0.3]
    swaySpeed: 1.6, // How fast the laser dot wanders inside the reticle. [0.1 to 6]
    recoilKick: 7, // How far each shot kicks your aim upwards, in degrees. [0 to 15]
    recoilSideways: 1.5, // Random sideways recoil per shot, in degrees. [0 to 6]
    recoilRecovery: 5, // How quickly your aim settles back after recoil. Higher = faster. [1 to 30]
    knockback: 1.1, // How hard each bullet shoves a zombie (1.6+ knocks one down). [0 to 4]
    pierce: 3, // How many extra zombies one bullet can pass through. [0 to 5]
    blastRange: 0, // Close-range blast reach (0 = none). [0 to 6]
    blastAngle: 0, // How wide the close-range blast is, in degrees either side of your aim. [0 to 60]
    blastPush: 0, // How hard the close-range blast shoves. [0 to 8]
    maxRange: 150, // How far bullets travel. [10 to 400]
    spareAmmo: 18, // Spare rounds you carry when infinite ammo is off. [0 to 200]
    headPop: 1, // Chance a bullet that hits the head bursts it. [0 to 1]
    critChance: 0.1, // Chance any headshot is a critical, with a fully tight reticle. [0 to 1]
    dismember: 0.9, // Chance a bullet that hits an arm or leg tears it off. [0 to 1]
  },

  // Rocket launcher ("Haymaker"). Weapon slot 7. One rocket, one enormous blast (see Explosion).
  rocket: {
    damage: 1500, // Extra damage to a zombie hit directly by the rocket. [0 to 10000]
    pellets: 1, // Rockets fired per shot (keep at 1). [1 to 2]
    pelletSpread: 0, // Not used by the rocket launcher. [0 to 20]
    falloffStart: 300, // Not used by the rocket launcher. [1 to 400]
    falloffEnd: 300, // Not used by the rocket launcher. [1 to 400]
    falloffMin: 1, // Not used by the rocket launcher. [0 to 1]
    fireInterval: 1, // Minimum time between rockets. [0.2 to 5]
    capacity: 1, // Rockets loaded at once. [1 to 6]
    reloadTime: 2.6, // Time to load a new rocket. [0.3 to 8]
    emptyReloadTime: 2.6, // The same (the tube is always empty after a shot). [0.3 to 8]
    focusTime: 0.9, // How long the reticle takes to tighten fully while you hold still. [0.05 to 3]
    spreadWide: 2.5, // Reticle size when you first raise it, in degrees. [0.2 to 12]
    spreadTight: 0.3, // Reticle size when fully focused. [0 to 4]
    spreadMoving: 1.6, // Smallest reticle size while walking and aiming. [0 to 8]
    fireBloom: 2, // How much a shot widens the reticle. [0 to 8]
    turnBloom: 0.03, // How much the reticle widens per degree you swing the camera. [0 to 0.3]
    swaySpeed: 1.2, // How fast the laser dot wanders inside the reticle. [0.1 to 6]
    recoilKick: 3, // How far a launch kicks your aim upwards, in degrees. [0 to 15]
    recoilSideways: 1, // Random sideways kick per launch, in degrees. [0 to 6]
    recoilRecovery: 4, // How quickly your aim settles back. Higher = faster. [1 to 30]
    knockback: 0, // Not used (the blast does the shoving). [0 to 3]
    pierce: 0, // Not used by the rocket launcher. [0 to 5]
    blastRange: 0, // Not used by the rocket launcher. [0 to 6]
    blastAngle: 0, // Not used by the rocket launcher. [0 to 60]
    blastPush: 0, // Not used by the rocket launcher. [0 to 8]
    maxRange: 200, // How far a rocket flies before it blows up by itself. [10 to 400]
    spareAmmo: 6, // Spare rockets you carry when infinite ammo is off. [0 to 50]
    headPop: 1, // Not used (the blast decides). [0 to 1]
    critChance: 0, // Not used by the rocket launcher. [0 to 1]
    dismember: 1, // Not used (the blast decides). [0 to 1]
  },

  // Heavy pistol ("Blacktail"). Weapon slot 8. Slow, hard-hitting, punches through a zombie.
  heavyPistol: {
    damage: 210, // Firepower: damage per bullet before body-part multipliers. [10 to 1000]
    pellets: 1, // Bullets fired per shot. [1 to 20]
    pelletSpread: 0, // How wide extra pellets scatter, in degrees (0 for a single bullet). [0 to 20]
    falloffStart: 200, // Distance where damage starts to drop off. [1 to 200]
    falloffEnd: 200, // Distance where damage reaches its lowest. [1 to 400]
    falloffMin: 1, // Fraction of damage left at long range (1 = no drop-off). [0 to 1]
    fireInterval: 0.46, // Fire rate: minimum time between shots. Lower = faster. [0.05 to 1.5]
    capacity: 7, // Bullets per magazine. [1 to 60]
    reloadTime: 1.7, // Reload speed with bullets still in the gun. [0.2 to 5]
    emptyReloadTime: 2.2, // Reload speed when the gun is completely empty. [0.2 to 6]
    focusTime: 0.95, // How long the reticle takes to tighten fully while you hold still. [0.05 to 3]
    spreadWide: 3.4, // Reticle size (aim wobble) when you first raise the gun, in degrees. [0.2 to 10]
    spreadTight: 0.2, // Reticle size when fully focused. [0 to 3]
    spreadMoving: 1.5, // Smallest reticle size while walking and aiming. [0 to 6]
    fireBloom: 2.4, // How much each shot widens the reticle. [0 to 6]
    turnBloom: 0.03, // How much the reticle widens per degree you swing the camera. [0 to 0.3]
    swaySpeed: 1.6, // How fast the laser dot wanders inside the reticle. [0.1 to 6]
    recoilKick: 3.4, // How far each shot kicks your aim upwards, in degrees. [0 to 8]
    recoilSideways: 0.8, // Random sideways recoil per shot, in degrees. [0 to 4]
    recoilRecovery: 7, // How quickly your aim settles back after recoil. Higher = faster. [1 to 30]
    knockback: 0.45, // How hard each bullet shoves a zombie, in metres. [0 to 3]
    pierce: 2, // How many extra zombies one bullet can pass through. [0 to 5]
    blastRange: 0, // Close-range blast reach (0 = none). [0 to 6]
    blastAngle: 0, // How wide the close-range blast is, in degrees either side of your aim. [0 to 60]
    blastPush: 0, // How hard the close-range blast shoves. [0 to 8]
    maxRange: 120, // How far bullets travel. [10 to 400]
    spareAmmo: 35, // Spare bullets you carry when infinite ammo is off. [0 to 500]
    headPop: 0.15, // Chance a bullet that hits the head bursts it, at close range. [0 to 1]
    critChance: 0.05, // Chance any headshot is a critical that bursts the head, with a fully tight reticle. [0 to 1]
    dismember: 0.08, // Chance a bullet that hits an arm or leg tears it off, at close range. [0 to 1]
  },

  // Fast, steady pistol ("Sparrow"). Weapon slot 9. Settles quickly and fires fast.
  swiftPistol: {
    damage: 68, // Firepower: damage per bullet before body-part multipliers. [10 to 1000]
    pellets: 1, // Bullets fired per shot. [1 to 20]
    pelletSpread: 0, // How wide extra pellets scatter, in degrees (0 for a single bullet). [0 to 20]
    falloffStart: 120, // Distance where damage starts to drop off. [1 to 200]
    falloffEnd: 200, // Distance where damage reaches its lowest. [1 to 400]
    falloffMin: 0.8, // Fraction of damage left at long range (1 = no drop-off). [0 to 1]
    fireInterval: 0.13, // Fire rate: minimum time between shots. Lower = faster. [0.05 to 1.5]
    capacity: 18, // Bullets per magazine. [1 to 60]
    reloadTime: 1.15, // Reload speed with bullets still in the gun. [0.2 to 5]
    emptyReloadTime: 1.5, // Reload speed when the gun is completely empty. [0.2 to 6]
    focusTime: 0.4, // How long the reticle takes to tighten fully while you hold still. [0.05 to 3]
    spreadWide: 2.6, // Reticle size (aim wobble) when you first raise the gun, in degrees. [0.2 to 10]
    spreadTight: 0.12, // Reticle size when fully focused. [0 to 3]
    spreadMoving: 1, // Smallest reticle size while walking and aiming. [0 to 6]
    fireBloom: 0.9, // How much each shot widens the reticle. [0 to 6]
    turnBloom: 0.02, // How much the reticle widens per degree you swing the camera. [0 to 0.3]
    swaySpeed: 1.2, // How fast the laser dot wanders inside the reticle. [0.1 to 6]
    recoilKick: 0.9, // How far each shot kicks your aim upwards, in degrees. [0 to 8]
    recoilSideways: 0.3, // Random sideways recoil per shot, in degrees. [0 to 4]
    recoilRecovery: 12, // How quickly your aim settles back after recoil. Higher = faster. [1 to 30]
    knockback: 0.1, // How hard each bullet shoves a zombie, in metres. [0 to 3]
    pierce: 0, // How many extra zombies one bullet can pass through. [0 to 5]
    blastRange: 0, // Close-range blast reach (0 = none). [0 to 6]
    blastAngle: 0, // How wide the close-range blast is, in degrees either side of your aim. [0 to 60]
    blastPush: 0, // How hard the close-range blast shoves. [0 to 8]
    maxRange: 120, // How far bullets travel. [10 to 400]
    spareAmmo: 90, // Spare bullets you carry when infinite ammo is off. [0 to 500]
    headPop: 0, // Chance a bullet that hits the head bursts it, at close range. [0 to 1]
    critChance: 0.04, // Chance any headshot is a critical that bursts the head, with a fully tight reticle. [0 to 1]
    dismember: 0, // Chance a bullet that hits an arm or leg tears it off, at close range. [0 to 1]
  },

  // Rocket and red-barrel explosions.
  explosion: {
    radius: 6, // How far a blast reaches, in metres. [1 to 15]
    damage: 1800, // Damage at the centre of a blast; fades to nothing at the edge. [0 to 10000]
    gibRadius: 1.8, // Zombies this close to the centre are blown to pieces. [0 to 6]
    limbRadius: 4, // Zombies this close may lose arms and legs. [0 to 10]
    push: 3.2, // How hard a blast throws zombies off their feet. [0 to 10]
    playerPush: 2.2, // How hard a blast shoves you if you're too close. [0 to 8]
    playerDamage: 60, // Health you lose at the very centre of a blast (less further out). [0 to 300]
    shake: 0.9, // Camera shake from a nearby blast. [0 to 2]
    hitStop: 0.07, // Tiny freeze when something blows up. [0 to 0.3]
    rocketSpeed: 38, // How fast a rocket flies, in metres per second. [5 to 150]
    barrels: true, // Red barrels blow up when you shoot them.
    barrelChainDelay: 0.18, // Pause before a nearby barrel catches the blast and goes off too. [0 to 1]
  },

  // Damage multipliers per body part.
  damage: {
    head: 2.5, // Headshot damage multiplier. [0 to 10]
    torso: 1, // Body shot damage multiplier. [0 to 5]
    arm: 0.6, // Arm shot damage multiplier. [0 to 5]
    leg: 0.75, // Leg shot damage multiplier. [0 to 5]
    parasite: 3, // Damage multiplier when you hit the parasite that bursts out of a neck. [0 to 10]
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

  // Grenades you throw (G to throw, B to change type).
  grenades: {
    throwSpeed: 14, // How hard a grenade is thrown. [6 to 30]
    throwTime: 0.5, // How long the throwing animation takes. [0.2 to 1.5]
    minThrow: 5, // The shortest throw, in metres, even when you aim at your feet. [1 to 15]
    maxThrow: 22, // The furthest throw, in metres. [5 to 50]
    fragFuse: 2.3, // Seconds before a frag grenade goes off. [0.5 to 6]
    fragRadius: 5.5, // How far a frag grenade's blast reaches, in metres. [1 to 15]
    fragDamage: 1500, // Damage at the centre of a frag grenade blast. [0 to 10000]
    fragGibRadius: 2, // Zombies this close to a frag grenade are blown to pieces. [0 to 6]
    fragLimbRadius: 4, // Zombies this close may lose arms and legs. [0 to 10]
    fragPush: 3.2, // How hard the blast throws zombies off their feet. [0 to 10]
    fragPlayerDamage: 55, // Health you lose from your own blast at the very centre. [0 to 300]
    flashFuse: 1.5, // Seconds before a flash grenade goes off. [0.5 to 6]
    flashRadius: 11, // How far a flash grenade reaches, in metres. [2 to 30]
    flashStun: 5, // How long zombies are blinded and helpless, in seconds. [0 to 20]
    flashBlind: 2.2, // How long you are blinded if you look at your own flash. [0 to 8]
    fireDuration: 8, // How long the flames from an incendiary grenade burn. [1 to 30]
    fireRadius: 3.4, // How wide the fire on the ground is, in metres. [0.5 to 10]
    fireDamage: 85, // Damage per second to a zombie standing in the flames. [0 to 1000]
    burnTime: 5, // How long a zombie keeps burning after it leaves the flames. [0 to 20]
    burnDamage: 55, // Damage per second to a burning zombie. [0 to 1000]
    firePlayerDamage: 14, // Health per second you lose standing in the flames. [0 to 200]
    startFrag: 2, // Frag grenades you start a Survival run with. [0 to 20]
  },

  // Zombies that throw axes (some Harvesters).
  axeThrower: {
    chance: 0.5, // Chance a Harvester carries an axe to throw instead of a tool. [0 to 1]
    minRange: 6, // It won't throw if you are closer than this. [1 to 20]
    maxRange: 19, // It won't throw if you are further than this. [5 to 50]
    windup: 0.95, // Warning time while it raises the axe, in seconds. Shoot its arm to stop the throw. [0.2 to 3]
    speed: 17, // How fast the axe flies. [5 to 40]
    damage: 26, // Health you lose if the axe hits you. [0 to 200]
    cooldown: 3, // Seconds before it can throw again (it picks up another axe). [0 to 20]
  },

  // The Fuse-man, who lights and lobs dynamite.
  dynamiteThrower: {
    minRange: 7, // It won't throw if you are closer than this. [1 to 20]
    maxRange: 20, // It won't throw if you are further than this. [5 to 50]
    lightTime: 0.95, // How long it takes to light the fuse before throwing. Shoot its hand to blow it up. [0.2 to 3]
    fuse: 2.8, // Seconds from lighting to the blast. [0.5 to 8]
    throwSpeed: 15, // How hard it throws. [5 to 30]
    radius: 4.2, // How far a dynamite blast reaches, in metres. [1 to 15]
    damage: 900, // Damage at the centre of the blast. [0 to 10000]
    playerDamage: 50, // Health you lose at the very centre of the blast. [0 to 300]
    cooldown: 3.5, // Seconds before it lights another stick. [0 to 20]
  },

  // The Plank-bearer's shield.
  shieldBearer: {
    shieldHealth: 750, // How much punishment the shield takes before it splinters. [50 to 5000]
    bulletsThrough: 0.4, // Fraction of a bullet's damage that carries on if it breaks the shield. [0 to 1]
  },

  // The Hulk (brute elite). Most of its numbers are in enemyTypes.
  brute: {
    windup: 1.05, // Warning time before it swings, in seconds. [0.2 to 3]
    pushBonus: 2.2, // How much harder its blows shove you. [1 to 6]
    staggerTime: 2.4, // How long a headshot staggers it, in seconds. [0.2 to 6]
    swingRange: 1.9, // How close it must be to swing at you, in metres. [1 to 4]
  },

  // The Sawyer (chainsaw elite). Most of its numbers are in enemyTypes.
  chainsaw: {
    windup: 1.15, // Warning time while it raises the saw, in seconds. Parry it or get out of the way. [0.3 to 3]
    reach: 2.1, // How close it must be to swing the saw at you, in metres. [1 to 4]
    damage: 80, // Health you lose from a hit on the lower difficulties. [0 to 500]
    instantKillFrom: 'hard', // Difficulty from which one hit kills you outright. [options: easy, normal, hard, pro, never]
    revRange: 38, // How far away you can hear it revving, in metres. [5 to 100]
    perfectParryStun: 3.2, // How long a perfect parry stuns it, in seconds. [0.5 to 10]
    parryKnifeCost: 38, // Knife wear from parrying a chainsaw. [0 to 100]
  },

  // The parasite that can burst out of a neck when a head is destroyed (no overkill).
  parasite: {
    baseChance: 0.18, // Chance a destroyed head lets a parasite out, in wave 1. [0 to 1]
    chancePerWave: 0.03, // How much more likely it gets each wave. [0 to 0.5]
    maxChance: 0.6, // The most likely it ever gets. [0 to 1]
    overkillRatio: 2.2, // A hit this many times the zombie's remaining health is overkill: no parasite. [1 to 10]
    health: 420, // How much damage the parasite takes before it dies (and the body with it). [10 to 5000]
    bodyScale: 0.2, // How much damage the body takes once the parasite is out (hit the parasite instead). [0 to 1]
    mutateTime: 1.7, // How long the zombie writhes while the parasite grows, in seconds. [0.3 to 5]
    speed: 1.2, // How fast it moves, compared with before. [0.5 to 3]
    whipRange: 2.9, // How far its tentacle reaches, in metres. [1 to 6]
    whipWindup: 0.55, // Warning time before the tentacle lashes out, in seconds. [0.1 to 2]
    whipDamage: 26, // Health you lose from a lash. [0 to 200]
  },

  // Gun upgrades sold by the Trader (Upgrade tab). Each of a gun's four stats goes up in levels.
  upgrades: {
    firepowerPerLevel: 0.18, // How much more damage each Firepower level adds (0.18 = 18% of the gun's normal damage). [0 to 1]
    fireRatePerLevel: 0.07, // How much shorter the wait between shots gets with each Fire rate level (a fraction). [0 to 0.15]
    reloadPerLevel: 0.09, // How much quicker each Reload speed level makes reloading (a fraction). [0 to 0.15]
    capacityPerLevel: 0.2, // How much more each Capacity level adds to the magazine (0.2 = a fifth of the normal size). [0 to 1]
    levelsPistols: 5, // How many levels each stat has on the three pistols. [1 to 8]
    levelsOthers: 4, // How many levels each stat has on every other gun. [1 to 8]
  },

  // What the Trader charges and pays, in coins.
  shop: {
    weapon: {
      pistol: 1500, // Kestrel 9 (also what he pays you for it, halved). [0 to 100000]
      pump: 2500, // Bramble 12 shotgun. [0 to 100000]
      drum: 4500, // Thresher shotgun. [0 to 100000]
      smg: 3500, // Magpie submachine gun. [0 to 100000]
      rifle: 5000, // Heron rifle. [0 to 100000]
      magnum: 7000, // Oxbow magnum. [0 to 100000]
      rocket: 9000, // Haymaker rocket launcher. [0 to 100000]
      heavy: 3000, // Blacktail heavy pistol. [0 to 100000]
      swift: 2500, // Sparrow fast pistol. [0 to 100000]
    },
    ammoPack: {
      pistol: 120, // One pack of Kestrel 9 ammo. [0 to 10000]
      pump: 140, // One pack of Bramble 12 shells. [0 to 10000]
      drum: 220, // One pack of Thresher shells. [0 to 10000]
      smg: 300, // One pack of Magpie ammo. [0 to 10000]
      rifle: 250, // One pack of Heron ammo. [0 to 10000]
      magnum: 600, // One pack of Oxbow ammo. [0 to 10000]
      rocket: 1500, // One Haymaker rocket. [0 to 10000]
      heavy: 180, // One pack of Blacktail ammo. [0 to 10000]
      swift: 200, // One pack of Sparrow ammo. [0 to 10000]
    },
    herbG: 300, // A green herb. [0 to 10000]
    herbR: 400, // A red herb. [0 to 10000]
    herbY: 400, // A yellow herb. [0 to 10000]
    spray: 1800, // A first-aid spray. [0 to 20000]
    frag: 700, // A frag grenade. [0 to 10000]
    flash: 900, // A flash grenade. [0 to 10000]
    fire: 900, // An incendiary grenade. [0 to 10000]
    stock: 3000, // A steadying stock. [0 to 50000]
    scope: 4500, // A sight scope. [0 to 50000]
    longMag: 3500, // A long magazine. [0 to 50000]
    upgradeBase: {
      pistol: 500, // Base cost of one Kestrel 9 upgrade level (grows with each level). [0 to 20000]
      pump: 650, // Base cost of one Bramble 12 upgrade level. [0 to 20000]
      drum: 800, // Base cost of one Thresher upgrade level. [0 to 20000]
      smg: 700, // Base cost of one Magpie upgrade level. [0 to 20000]
      rifle: 800, // Base cost of one Heron upgrade level. [0 to 20000]
      magnum: 1000, // Base cost of one Oxbow upgrade level. [0 to 20000]
      rocket: 1200, // Base cost of one Haymaker upgrade level. [0 to 20000]
      heavy: 600, // Base cost of one Blacktail upgrade level. [0 to 20000]
      swift: 500, // Base cost of one Sparrow upgrade level. [0 to 20000]
    },
    factorFirepower: 1.4, // Firepower costs this many times the base. [0.1 to 5]
    factorFireRate: 1, // Fire rate costs this many times the base. [0.1 to 5]
    factorReload: 0.7, // Reload speed costs this many times the base. [0.1 to 5]
    factorCapacity: 0.85, // Capacity costs this many times the base. [0.1 to 5]
    exclusive: {
      pistol: 6000, // Kestrel 9 Exclusive Upgrade (5x critical chance). [0 to 100000]
      pump: 12000, // Bramble 12 Exclusive Upgrade (more pellets). [0 to 100000]
      drum: 14000, // Thresher Exclusive Upgrade (faster fire). [0 to 100000]
      smg: 12000, // Magpie Exclusive Upgrade (much bigger magazine). [0 to 100000]
      rifle: 14000, // Heron Exclusive Upgrade (power and pierce). [0 to 100000]
      magnum: 18000, // Oxbow Exclusive Upgrade (speed loader). [0 to 100000]
      rocket: 22000, // Haymaker Exclusive Upgrade (second rocket). [0 to 100000]
      heavy: 9000, // Blacktail Exclusive Upgrade (pierces five enemies). [0 to 100000]
      swift: 8000, // Sparrow Exclusive Upgrade (1.5x firepower). [0 to 100000]
    },
    knifeRepair: 1500, // What a completely worn knife costs to repair (less if it is only a little worn). [0 to 10000]
    caseTall: 3500, // The 7x12 case. [0 to 100000]
    caseWide: 7000, // The 8x12 case. [0 to 100000]
    caseDeep: 12000, // The 8x13 case. [0 to 100000]
    caseGrand: 20000, // The 9x13 case. [0 to 100000]
    sellFraction: 0.5, // Guns and attachments sell for this share of their price. [0 to 1]
  },

  // The Trader's stall appears between Survival waves.
  trader: {
    talkRange: 3.6, // How close you must stand to the stall to trade, in metres. [1 to 10]
    startAmmo: 24, // Spare rounds that come with a gun you buy. [0 to 200]
  },

  // Blood, bursting heads and torn-off limbs (the Gore choice in Settings can tone it down).
  gore: {
    headPopDamage: 600, // Damage to the head from one shot that always bursts it (magnum, rifle). [50 to 5000]
    chunkLife: 14, // How long flying body pieces lie on the ground before sinking away. [1 to 60]
    maxChunks: 60, // Most body pieces on the ground at once (the oldest vanish first). [10 to 200]
    spurtTime: 1.4, // How long blood pumps from a neck or limb stump. [0 to 5]
    burstSize: 1, // How big the spray is when a head bursts. [0 to 3]
  },

  // Kicks, the suplex and the knife finisher (press F / Cross when the prompt shows).
  melee: {
    range: 2.2, // How close you must be to a stunned zombie to get the melee prompt. [0.8 to 4]
    promptAngle: 75, // How far off to the side of your view a zombie can be and still get the prompt, in degrees. [10 to 180]
    invulnerable: true, // You can't be hit or grabbed while kicking, suplexing or stabbing.
    kickDamage: 220, // Roundhouse kick damage to the zombie you kick. [0 to 3000]
    kickRadius: 2.6, // The roundhouse also knocks down every other zombie this close to you. [0 to 6]
    kickSplashDamage: 60, // Damage the roundhouse does to the other zombies it sweeps. [0 to 2000]
    kickTime: 0.75, // How long the roundhouse kick takes. [0.3 to 2]
    frontKickDamage: 160, // Front kick damage (kneeling zombie, from the front). [0 to 3000]
    frontKickTime: 0.6, // How long the front kick takes. [0.2 to 2]
    suplexDamage: 750, // Suplex damage (kneeling zombie, from behind). [0 to 5000]
    suplexTime: 1.55, // How long the suplex takes. [0.6 to 4]
    finisherDamage: 2500, // Knife stab on a zombie lying on the ground (kills a basic zombie). [0 to 10000]
    finisherTime: 0.95, // How long the knife finisher takes. [0.3 to 3]
    hitStop: 0.08, // Tiny freeze when a kick or slam lands. [0 to 0.3]
    shake: 0.35, // Camera shake when a kick or slam lands. [0 to 1]
  },

  // The knife: quick slash (V / R1) and parry (press it just before a zombie's hit lands).
  knife: {
    damage: 70, // Slash damage. [0 to 1000]
    range: 1.6, // How far the slash reaches. [0.5 to 3]
    arc: 60, // How wide the slash is, in degrees either side of where you face. [10 to 180]
    slashTime: 0.32, // How long one slash takes (and the wait before the next). [0.1 to 1]
    parryWindow: 0.4, // Press the knife this long (or less) before a hit lands to block it. Holding the knife button also blocks. [0.05 to 1.5]
    perfectParryWindow: 0.15, // Press within this time before the hit for a perfect parry: the zombie is stunned. [0.01 to 0.6]
    durability: 100, // Knife condition when new. A broken knife can't parry or stab you free. [10 to 500]
    parryCost: 10, // Knife wear from a normal parry. [0 to 100]
    perfectParryCost: 4, // Knife wear from a perfect parry. [0 to 100]
    finisherCost: 6, // Knife wear from a finishing stab. [0 to 100]
    grabEscapeCost: 15, // Knife wear from stabbing your way out of a grab. [0 to 100]
    unbreakable: false, // Tick so the knife never wears down (the Trader repairs it from Phase 5).
    parryHitStop: 0.1, // Tiny freeze on a perfect parry. [0 to 0.4]
  },

  // Zombies grabbing you.
  grab: {
    chance: 0.35, // Chance a zombie with both hands free tries to grab you instead of swinging. [0 to 1]
    mashPerPress: 0.13, // How much each press of F / Cross fills the break-free bar. [0.01 to 1]
    wigglePerFlick: 0.06, // How much each flick of the left stick (or A/D) fills the bar. [0 to 1]
    drain: 0.22, // How fast the bar drains if you stop mashing, per second. [0 to 2]
    biteTime: 2.6, // How long you have to break free before it bites. [0.5 to 8]
    cooldown: 4, // Seconds before any zombie can grab you again. [0 to 30]
    reach: 1.0, // How close a lunging zombie must get to grab you. [0.3 to 2]
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
    attackPush: 1.1, // How far a hit shoves you back. [0 to 4]
    swingDamage: 18, // Health you lose when a swing hits you. [0 to 200]
    biteDamage: 28, // Health you lose when a grabbing zombie bites you. [0 to 200]
    clawDamage: 10, // Health you lose when a crawling zombie claws you. [0 to 200]
    weaponChance: 0.45, // Chance a zombie carries a farm tool. Shoot its arm to make it drop it. [0 to 1]
    corpseTime: 6, // How long bodies stay before sinking away. [0.5 to 60]
    groanInterval: 5, // Average time between groans. [1 to 30]
    crawlSpeed: 0.55, // Speed of a zombie dragging itself along after losing a leg. [0.1 to 3]
    crawlReach: 1.1, // How close a crawling zombie's hands must be to claw at you. [0.3 to 2.5]
  },

  // Your health and healing.
  health: {
    max: 100, // Your starting health. Yellow herbs raise it. [20 to 300]
    dangerLevel: 0.3, // Below this fraction of your health the screen pulses red and your heart pounds. [0 to 1]
    healTime: 1.1, // How long using a healing item takes. Being hit interrupts it. [0.2 to 4]
    graceTime: 0.7, // Protection from further hits just after you are hit. [0 to 3]
    sprayRaisesMax: 0, // How much a first-aid spray also raises your maximum health. [0 to 50]
    deathScreenDelay: 2.2, // Seconds after you die before the "you died" screen appears. [0 to 6]
  },

  // How the horde behaves as a group.
  ai: {
    sightRange: 26, // How far away a zombie can notice you when you are in front of it, in metres. [2 to 80]
    sightAngle: 75, // How wide its view is, in degrees either side of where it faces. [10 to 180]
    hearRange: 9, // Zombies this close notice you even from behind. [0 to 40]
    gunshotRange: 28, // A gunshot alerts every zombie this close. [0 to 80]
    alertRadius: 14, // When one zombie spots you it alerts every zombie this close to it. [0 to 50]
    spotTime: 0.9, // How long a zombie stops to roar when it first spots you. [0 to 3]
    maxAttackers: 3, // How many zombies can attack you at the same time. The rest wait their turn. [1 to 12]
    ringRadius: 3.4, // How far from you the waiting zombies hold their circle, in metres. [1.8 to 8]
    tokenTimeout: 6, // If an attacker hasn't hit you after this long it loses its turn. [1 to 20]
    wanderSpeed: 0.5, // How fast a zombie that hasn't noticed you ambles about. [0 to 2]
    circleSpeed: 0.8, // How fast waiting zombies shuffle round you. [0.2 to 3]
  },

  // Waves of zombies in Survival.
  waves: {
    startDelay: 4, // Seconds of calm before the first wave. [0 to 30]
    firstWaveSize: 6, // How many zombies come in the first wave. [1 to 40]
    growthPerWave: 3, // How many more zombies each wave brings. [0 to 20]
    maxAliveStart: 7, // Most zombies alive at once in the first wave. [1 to 40]
    maxAliveGrowth: 0.8, // How many more can be alive at once each wave. [0 to 5]
    maxAliveCap: 24, // The most that are ever alive at once. [4 to 60]
    spawnInterval: 2.2, // Seconds between zombies walking in during the first wave. [0.2 to 10]
    spawnSpeedUp: 0.1, // How much faster they arrive each wave (seconds off the interval). [0 to 1]
    minSpawnInterval: 0.6, // The quickest they ever arrive. [0.1 to 5]
    breakTime: 60, // Seconds between waves (the Trader's stall is open). Press Ready to skip. [5 to 300]
    eliteEveryKills: 50, // A brute or chainsaw zombie comes after this many kills. [5 to 500]
    bonusPerWave: 500, // Coins for clearing a wave, times the wave number. [0 to 5000]
  },

  // What zombies, crates and barrels drop.
  drops: {
    chance: 0.62, // Chance a killed zombie drops something. [0 to 1]
    crateChance: 0.85, // Chance a broken crate drops something. [0 to 1]
    lifetime: 30, // How long a drop stays before it fades away, in seconds. [5 to 120]
    pickupRadius: 1.3, // How close you must get to pick something up, in metres. [0.5 to 4]
    magnetRadius: 3.2, // Drops this close drift towards you. [0 to 8]
    ammoWeight: 1, // How often ammo drops, compared with the other things. [0 to 10]
    lowAmmoBoost: 4, // How much more likely ammo is for a gun you are running low on. [0 to 20]
    herbWeight: 0.7, // How often herbs and sprays drop, compared with the other things. [0 to 10]
    lowHealingBoost: 5, // How much more likely herbs are when you carry few healing items. [0 to 20]
    coinWeight: 1.1, // How often coins drop. [0 to 10]
    treasureWeight: 0.14, // How often treasure (gems, idols) drops. [0 to 5]
    grenadeWeight: 0.12, // How often grenades drop. [0 to 5]
    coinsMin: 40, // Smallest pile of coins. [1 to 1000]
    coinsMax: 160, // Largest pile of coins. [1 to 5000]
    ammoPerPickup: {
      pistol: 12, // Rounds in a Kestrel 9 ammo drop. [1 to 200]
      pump: 6, // Shells in a Bramble 12 ammo drop. [1 to 200]
      drum: 8, // Shells in a Thresher ammo drop. [1 to 200]
      smg: 40, // Rounds in a Magpie ammo drop. [1 to 200]
      rifle: 5, // Rounds in a Heron ammo drop. [1 to 200]
      magnum: 6, // Rounds in an Oxbow ammo drop. [1 to 200]
      rocket: 1, // Rockets in a Haymaker ammo drop. [1 to 200]
      heavy: 8, // Rounds in a heavy pistol ammo drop. [1 to 200]
      swift: 20, // Rounds in a fast pistol ammo drop. [1 to 200]
    },
  },

  // How each type of enemy differs from the basic Shambler (multipliers on the "zombie" numbers above).
  enemyTypes: {
    shambler: {
      health: 1, // Health compared with the basic zombie. [0.1 to 30]
      speed: 1, // Walking and running speed compared with the basic zombie. [0.2 to 3]
      damage: 1, // Damage it does to you compared with the basic zombie. [0 to 20]
      points: 100, // Score Attack points for killing one. [0 to 10000]
      coins: 1, // How many coins it drops compared with the usual pile. [0 to 20]
      size: 1, // How big its body is. [0.5 to 2]
    },
    armed: {
      health: 1.15, // Health compared with the basic zombie. [0.1 to 30]
      speed: 1, // Walking and running speed compared with the basic zombie. [0.2 to 3]
      damage: 1.35, // Damage it does to you compared with the basic zombie. [0 to 20]
      points: 150, // Score Attack points for killing one. [0 to 10000]
      coins: 1.3, // How many coins it drops compared with the usual pile. [0 to 20]
      size: 1, // How big its body is. [0.5 to 2]
    },
    runner: {
      health: 0.8, // Health compared with the basic zombie. [0.1 to 30]
      speed: 1.15, // Walking and running speed compared with the basic zombie. [0.2 to 3]
      damage: 0.9, // Damage it does to you compared with the basic zombie. [0 to 20]
      points: 150, // Score Attack points for killing one. [0 to 10000]
      coins: 1.2, // How many coins it drops compared with the usual pile. [0 to 20]
      size: 0.96, // How big its body is. [0.5 to 2]
    },
    shield: {
      health: 1.3, // Health compared with the basic zombie. [0.1 to 30]
      speed: 0.9, // Walking and running speed compared with the basic zombie. [0.2 to 3]
      damage: 1.1, // Damage it does to you compared with the basic zombie. [0 to 20]
      points: 250, // Score Attack points for killing one. [0 to 10000]
      coins: 1.8, // How many coins it drops compared with the usual pile. [0 to 20]
      size: 1.04, // How big its body is. [0.5 to 2]
    },
    dynamite: {
      health: 0.9, // Health compared with the basic zombie. [0.1 to 30]
      speed: 0.95, // Walking and running speed compared with the basic zombie. [0.2 to 3]
      damage: 1, // Damage it does to you compared with the basic zombie. [0 to 20]
      points: 250, // Score Attack points for killing one. [0 to 10000]
      coins: 1.8, // How many coins it drops compared with the usual pile. [0 to 20]
      size: 1, // How big its body is. [0.5 to 2]
    },
    brute: {
      health: 9, // Health compared with the basic zombie. [0.1 to 30]
      speed: 0.85, // Walking and running speed compared with the basic zombie. [0.2 to 3]
      damage: 2.6, // Damage it does to you compared with the basic zombie. [0 to 20]
      points: 1200, // Score Attack points for killing one. [0 to 10000]
      coins: 8, // How many coins it drops compared with the usual pile. [0 to 20]
      size: 1.5, // How big its body is. [0.5 to 2]
    },
    chainsaw: {
      health: 6, // Health compared with the basic zombie. [0.1 to 30]
      speed: 1, // Walking and running speed compared with the basic zombie. [0.2 to 3]
      damage: 4, // Damage it does to you compared with the basic zombie. [0 to 20]
      points: 1500, // Score Attack points for killing one. [0 to 10000]
      coins: 10, // How many coins it drops compared with the usual pile. [0 to 20]
      size: 1.12, // How big its body is. [0.5 to 2]
    },
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
    musicVolume: 0.65, // Music volume for ambient dread and combat tracks. [0 to 1]
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

  // Score Attack mode numbers.
  scoreAttack: {
    startTime: 120, // Starting match time in seconds for Score Attack. [30 to 300]
    targetKills: 150, // Run finishes successfully when this many zombies are killed. [50 to 500]
    baseKillScore: 1000, // Base points awarded per zombie kill. [100 to 5000]
    comboDuration: 10, // Seconds before a kill combo drops back to zero. [3 to 20]
    headshotTimeBonus: 2, // Seconds added to the match clock on a headshot or kick kill. [0 to 10]
    suplexTimeBonus: 5, // Seconds added to the match clock on a suplex kill. [0 to 15]
    barrelTimeBonus: 1, // Seconds added to the match clock on a barrel or explosion kill. [0 to 5]
    eliteTimeBonus: 10, // Seconds added to the match clock on killing an elite enemy. [2 to 30]
    orbTimeBonus: 30, // Seconds added when picking up a glowing Time Orb. [10 to 60]
    overdriveDuration: 20, // How many seconds Overdrive mode lasts once activated. [5 to 60]
    overdrivePassiveRate: 0.008, // Overdrive gauge percentage filled per second passively. [0 to 0.05]
    overdriveKillBonus: 0.06, // Overdrive gauge percentage filled on each enemy kill. [0.01 to 0.2]
    leftoverTimePointRate: 1000, // Points awarded per remaining second on the clock at match end. [100 to 5000]
  },

  // Hidden dynamic difficulty that adjusts to player skill.
  dynamicDifficulty: {
    enabled: true, // Tick to enable automatic background difficulty adjustments based on player skill.
    defaultRank: 5, // Starting difficulty rank for new runs (1 easiest to 10 hardest). [1 to 10]
    minRank: 1, // Lowest difficulty rank the dynamic system can drop to. [1 to 5]
    maxRank: 10, // Highest difficulty rank the dynamic system can rise to. [6 to 10]
    evalInterval: 10, // How often in seconds the game evaluates player performance. [2 to 30]
    safeTimeThreshold: 20, // Seconds survived without taking damage before difficulty rank increases. [5 to 60]
    heavyDamageThreshold: 35, // Single hit damage amount that triggers an immediate downward rank nudge. [10 to 80]
    damageNudge: 0.5, // How much difficulty rank drops when taking heavy damage. [0.1 to 2]
    deathNudge: 1.5, // How much difficulty rank drops when the player dies. [0.5 to 4]
  },

  // Global difficulty scaling multipliers.
  difficulty: {
    easyDamage: 0.7, // Enemy damage multiplier on Easy difficulty. [0.2 to 2]
    easyAmmo: 1.4, // Ammo drop amount multiplier on Easy difficulty. [0.5 to 3]
    normalDamage: 1.0, // Enemy damage multiplier on Normal difficulty. [0.2 to 2]
    normalAmmo: 1.0, // Ammo drop amount multiplier on Normal difficulty. [0.5 to 3]
    hardDamage: 1.3, // Enemy damage multiplier on Hard difficulty. [0.5 to 3]
    hardAmmo: 0.8, // Ammo drop amount multiplier on Hard difficulty. [0.2 to 2]
    proDamage: 1.6, // Enemy damage multiplier on Pro difficulty. [0.5 to 4]
    proAmmo: 0.65, // Ammo drop amount multiplier on Pro difficulty. [0.2 to 2]
  },

  // Developer helpers.
  debug: {
    showColliders: false, // Draws yellow outlines around everything solid you will bump into.
    showHitboxes: false, // Colours each zombie body part by hit zone (head, body, arms, legs).
    flySpeed: 8, // Speed of the free-fly debug camera (F4). [1 to 40]
  },
};

export type Tuning = typeof tuning;
