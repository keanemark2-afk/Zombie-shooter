# Dead Acre - Progress

Plain-English log of what's built, what's next and what's known to be wrong.

## Where we are

**Building straight through to the end (you asked me to). Phases 0-5 are done (you asked me to trim the rest to save your usage, so Phases 6 and 7 are NOT built - see the end).**

## Done

### Phase 5 - Case & Trader
- **Attache case (Tab / Create button):** a 7x10 grid holding your guns, herbs, grenades,
  treasure and attachments. Drag items to move them, **R** or right-click turns one, drop a
  herb on a herb to mix, drop an attachment on a gun to fit it, "Tidy up" packs it. Use heals,
  "Throw away" discards. With a controller, a cursor moves round the grid. If the case is full a
  pickup is refused ("No room in your case").
- **The Trader:** a hooded figure at a lantern-lit stall on the west side of the village. He
  appears during the break between Survival waves (a marker shows where). Walk up, press **E**
  (Cross). Tabs: **Buy** (guns, ammo, herbs, spray, grenades, attachments), **Sell** (treasure
  and anything else), **Upgrade** (4 stats x 4-5 levels per gun, then an **Exclusive Upgrade**
  per gun), **Tune-up** (repair the knife), **Cases** (7x12, 8x12, 8x13, 9x13 with small bonuses).
  "Ready" skips the rest of the break. All prices are in F1 > Shop.
- Guns now live in the case in Survival; you start with the pistol and buy the rest.

### Phase 4 - Arsenal
- **Grenades:** **G** throws one, **B** (D-pad up) changes type. Three kinds:
  - **Frag** - explodes after about 2 seconds, hurts everything nearby (and you, if you
    stand too close). It lands where you are aiming and bounces.
  - **Flash** - a blinding bang. Zombies in sight are blinded and stagger about for 5
    seconds (open to a kick), and **it kills parasites outright**. Look away or you are
    dazzled too.
  - **Incendiary** - bursts into flames where it lands. Zombies in the fire catch light
    and keep burning for a few seconds after leaving it. You burn too if you stand in it.
  You start Survival with 2 frag grenades; more drop from enemies. The count shows on the
  right of the screen. On the shooting range you have a few of each.
- **Two more pistols** (shooting range, keys **8** and **9**; in Survival they come from the
  Trader): the **Blacktail** (slow, hits very hard) and the **Sparrow** (fast and steady).
- **Enemy types** (they start arriving in the middle waves):
  - **Harvester** - carries a pitchfork; about half carry an **axe they throw** from a
    distance (it spins towards you; shoot the arm to stop the throw, shoot the axe out of
    the air, or parry it with the knife).
  - **Sprinter** - runs in short bursts (a leg shot trips it).
  - **Plank-bearer** - holds a wooden **shield** in front. Bullets just splinter it; shoot
    it enough and it breaks, or **kick it** (the Kick prompt shows when you are close)
    to smash it apart. The back is unprotected.
  - **Fuse-man** - lights a stick of **dynamite** and lobs it. Shoot the stick (or the
    hand holding it) and it blows up where it is - including on him.
  - **Hulk** (elite) - huge and tough; body shots barely bother it. A **headshot** staggers
    it (then kick it); explosions throw it about.
  - **Sawyer** (elite) - you hear its **chainsaw revving** before you see it. One hit does
    a lot of damage, and on **Hard and Pro** it kills you outright (change in F1 > Chainsaw
    > Instant kill from). Parry it with the knife, flash it, or stagger it with headshots.
- **The parasite:** sometimes (more often as the waves go on) a zombie whose head you blow
  off **without overkill** grows a **parasite** out of its neck - a toothed maw on a
  writhing stalk with a long lashing tentacle. Shoot the parasite (it is the weak spot;
  the body barely matters) or throw a flash grenade. Huge shots that overkill the zombie
  just kill it cleanly.
- **Critical hits** and **head pops** from Phase 2 still apply to normal zombies; elites
  can't have their heads burst.
- New sounds for all of it (chainsaw engine, shield hits, axe, fuse hiss, flash bang,
  fire). The two new pistols use real recordings.
- **Automated checks:** 181 unit tests, and a new browser test that throws each grenade,
  fights every new enemy kind (shield, axe, dynamite, hulk, chainsaw on Normal and Hard),
  grows a parasite and kills it, and fires both new pistols.

### Phase 3 - The horde
- **Survival mode** (new menu button): waves of zombies walk in through the four gates of
  the village. A short countdown, then a wave; clear it for bonus coins and a short
  break; the next wave is bigger and brings tougher kinds. After every 50 kills a
  heavy "elite" comes in with a warning sound.
- **Smarter zombies:**
  - They find their way **round** fences, sheds, crates and the well (a navigation map of
    the village that every zombie reads).
  - They **notice** you (they see you in front of them, hear you close by, and every
    gunshot alerts the ones in earshot). A zombie that spots you stops and roars, which
    alerts its neighbours.
  - They **take turns**: only 3 can attack at a time (F1 > Ai > Max attackers). The rest
    circle you at a distance, spread out evenly all round you (so they cut off your
    escape), and step in when somebody else's turn is over.
- **Your health:** a health bar (bottom-left), a red flash when you are hit, a pulsing red
  edge and a heartbeat when it is low, a short grace period after a hit so you are
  never chain-hit. Swings, bites, claws and explosions all hurt now. (On the shooting
  range nothing can hurt you.)
- **Healing:** press **H** (or **Triangle**) to use a herb or spray (takes about a second;
  being hit stops it). Green herb = a bit of health; red + green mixed = full heal;
  yellow + green = raises your maximum health; a first-aid spray = full heal. The game
  picks the sensible one (a small herb for a small wound, the spray for an emergency).
  Mixing herbs in the case comes with the case in Phase 5.
- **Drops:** zombies, and crates you shoot open, drop glowing items that fade after 30
  seconds - ammo, herbs and sprays, coins, treasure. The rules: ammo only drops for guns
  you are carrying; the lower your ammo for a gun, the likelier its ammo drops; the fewer
  healing items you carry, the likelier herbs drop. Walk near and you pick them up.
- **Ammo is real now** in Survival (you start with just the pistol and 40 spare rounds,
  one green herb). The shooting range still has endless ammo and carries every gun.
- **Death screen:** a summary (wave reached, kills, coins, time) with Try again / Main menu.
- The old "Village" practice button is gone (Survival replaces it).
- **Automated checks:** 160 unit tests (navigation, turn-taking, health and herbs, drops,
  waves, supplies) and a new browser test that plays a whole Survival run: waves, the
  crowd taking turns, being noticed, health, healing (and being interrupted), drops,
  crates, clearing a wave, dying and trying again.

### Phase 2 - Melee, knife & gore (with extra weapons, at your request)
- **Kicks and the suplex:** when a zombie is stunned, a prompt floats over it. Press
  **F** (or **Cross** on a controller):
  - Shot in the head (clutching its face) -> **roundhouse kick**: a spinning kick that
    also knocks down every other zombie around you.
  - Down on one knee, facing you -> **front kick** that knocks it flat.
  - Down on one knee with its back to you -> **suplex**: you lift it, arch back and slam
    it head first behind you (usually kills).
  - Lying on the ground (or crawling) -> **knife finisher**: kneel and stab (kills).
  - You can't be hurt during these moves.
- **Knife (V / R1):** a quick slash. **Parry:** press it just before a zombie's swing
  lands. A **perfect parry** (very tight timing) stuns the zombie so you can kick it;
  holding the button blocks too. The knife wears down with every parry and finisher
  (bar under the ammo counter); a broken knife can't parry. The Trader repairs it later.
- **Grabs:** zombies with both hands free sometimes crouch, spread their arms and lunge
  to grab you. **Mash F / Cross** (or waggle left-right) to break free - the zombie is
  left stunned, ready for a kick - or press **V / R1** to stab your way out (uses up knife).
  Too slow and it bites you.
- **Four new weapons** (brought forward from Phase 4), on keys 4-7:
  - **Magpie** (4): submachine gun, keeps firing while you hold the trigger.
  - **Heron** (5): bolt-action rifle; aiming looks through a **scope** (zoomed, steady
    when you hold still). Shoots through up to 3 zombies.
  - **Oxbow** (6): huge revolver, massive damage, punches through 4 zombies.
  - **Haymaker** (7): rocket launcher - one rocket, an enormous explosion.
- **Gore:**
  - **Heads burst** when a heavy weapon hits them: the shotguns up close, the revolver
    and the rifle always. Any gun can land a rare **critical headshot** that bursts the
    head too (more likely with a tight reticle).
  - **Arms and legs tear off** from heavy hits (shotguns up close, revolver, rifle,
    explosions). Lose an arm and it drops what it holds; lose a leg and it falls and
    **crawls** after you, clawing at your ankles.
  - Explosions throw zombies, rip limbs off and blow the closest ones **to pieces**.
  - Pieces bounce and lie on the ground, blood pumps from stumps, splats on walls.
  - **Settings > Gore:** Full, Stylized (no flying scraps, less blood) or Off.
- **Red barrels explode** when shot (and set off other barrels nearby).
- New real sounds (CC0): submachine gun, rifle and revolver shots, explosions, and wet
  splatters for bursting heads and torn limbs. Kicks, slams, the knife and parries use
  generated sounds.
- **Automated checks:** 104 unit tests (now including gore, melee, parry timing, knife
  wear, grabs and the new guns) and a new 4-minute browser test that plays all of the
  above, on top of the Phase 1 tests.

### Crosshairs and real gunshots (added after Phase 1, at your request)
- **Settings screen** (menu > Settings). Choices are saved on your computer and apply
  straight away:
  - **Crosshair:** Focus ring (the original), Cross, Brackets (four corners), Dot,
    Laser only (just the red laser dot, the classic look) or None. Ring, Cross and
    Brackets close in as your aim steadies; a live preview shows how it behaves.
  - **Colour:** white, red, green, yellow or cyan. **Size:** small, medium or large.
  - **Laser line:** show the red beam from the gun, or hide it and keep only the dot.
  - **Gunshots:** "Real recordings" (new, default) or "Old generated sound".
- **Real gunshot recordings** instead of the generated bangs: a .45 pistol for the
  Kestrel 9, a classic pump shotgun for the Bramble 12 and a modern shotgun for the
  Thresher. Each mixes a close microphone (the punch) with a distant one (the echo
  rolling off the walls), with a deep low thump added, and the pitch varies a little
  on every shot so repeats don't sound identical. The pump "clack-clack" and loading a
  shell are real recordings too. All are free CC0 recordings (see `CREDITS.md`).

### Shotguns and fixes (added after Phase 1, at your request)
- **Two shotguns** (brought forward from Phase 4):
  - **Bramble 12** (slot 2): pump-action, 6 shells, loads one shell at a time (fire
    to stop reloading early), big wide blast, pump "clack-clack" after every shot.
  - **Thresher** (slot 3): semi-automatic drum shotgun, 12 shells, fires as fast as you
    pull the trigger, swaps the whole drum to reload.
- **Swapping weapons:** keys 1 / 2 / 3, mouse wheel, or D-pad left / right. A small
  list of your weapons appears bottom-right when you swap.
- **Shotguns feel like shotguns:** 8-9 pellets that spread out and weaken with distance,
  a close-range blast that **bowls over everything right in front of you** (one shot
  at close range knocks a whole group flat on their backs), big recoil and kick, a
  deep boom with echo, red shotgun shells flying out, stock held in the shoulder
  with the left hand on the pump.
- **New zombie reaction: knocked down** - blown backwards onto its back, lies there,
  then climbs back up.
- **Unwanted 180 spin fixed:** the quick turn now only happens when your character
  is facing away from the camera (so holding S to back off and pressing Shift just
  sprints). You can switch the quick turn off: F1 > Player > Quick turn.
- **Smoother:** the quick turn and the camera sliding away from walls are now drawn
  smoothly every frame; the mouse is captured "raw" (no Windows mouse acceleration)
  and the browser's occasional fake mouse jumps are filtered out.
- **Range:** F1 > Range > Dummy count puts up to 6 dummies side by side (try 3 with a
  shotgun at 3 m).

### Phase 1 - Gunfeel
- **Start menu:** pick **Shooting range** or **Village**. Esc (or Options on a
  controller) pauses and shows the full controls list.
- **The player:** a dark-jacketed character you see from behind the right shoulder.
  Walks, sprints (Shift), and does a quick 180-degree turn (hold back + tap sprint).
- **Aiming:** hold right mouse / L2. The camera pushes in, the character raises the
  pistol in both hands, and a red laser runs from the gun to a red dot on whatever
  you're pointing at.
- **Reticle focus:** the circle starts wide and tightens over about 0.75 seconds if you
  hold still. Walking, swinging the camera or firing opens it up again. The laser dot
  wanders inside the circle and the bullet goes exactly where the dot is, so waiting
  for a tight circle really is more accurate.
- **Aim mode:** Modern (slow walk while aiming, the default) or Classic (feet planted).
  Switch it in F1 > Player > Classic aim.
- **The starter pistol ("Kestrel 9"):** 10 rounds, recoil that kicks your aim up and
  settles back, muzzle flash, ejected shell casings, slide that locks back when empty,
  a reload (R / Square) that takes longer when the gun is completely empty.
- **The zombie ("Shambler"):** built from separate body parts that are also its
  hitboxes. It shambles towards you, sometimes breaks into a short run, raises its
  arms and swings at you (no player health yet - you get shoved and stunned).
  Some carry a sickle or club.
- **Body-part reactions:**
  - Head: clutches its face and stumbles back (always, with classic rules on).
  - Leg: drops to one knee; sometimes spins round to face away. A *running* zombie
    shot in the leg trips and falls flat on its face, then gets back up.
  - Arm: arm gets knocked back and it drops whatever it was holding.
  - Body: small flinch (bigger guns later will shove it back).
  - Death: knees buckle and it topples over, then the body sinks away.
- **Hit feedback:** tiny freeze-frame on headshots and kills, blood spray and splats,
  bullet holes and dust puffs (sparks on metal and stone), a hit marker (red for
  headshots), a springy flinch on the body part you hit, and camera shake.
- **Sound:** generated by the game itself (gunshots were later swapped for real
  recordings - see above): layered gunshot with echo, reload clicks, casings tinkling, a different impact sound for
  head, body and limbs, bullet hits on wood/dirt/stone/metal, footsteps, and zombie
  groans, roars, grunts and death gurgles placed in 3D around you.
- **Shooting range:** a walled lane with distance signs (5-40 m) and a respawning dummy
  zombie. In F1 > Range you can set its distance, make it walk at you, pace side to
  side, or run (to practise leg-shot trips), make it unkillable, and give it a tool.
  The top of the screen shows shots, hits, accuracy, headshots and what your last
  shot did.
- **Village:** zombies walk in through the gates (F1 > Village > Zombie count, 1-8).
- **Gamepad:** PlayStation first (Xbox works too). The menu shows PlayStation button
  names when a PlayStation pad is connected. Controls are stored as a list so a
  remapping screen can be added in Phase 7.
- **Fog removed** as you asked (F1 > Atmosphere > Fog density brings it back).
- **Tuning:** 128 settings in F1, each with a plain-English note; drop-down lists
  for choices. Debug extras: show hitboxes, show colliders, and F4 free camera.
- **Automated checks (at the end of Phase 1):** 49 unit tests (damage rules, reactions, reticle focus,
  tuning file), and two browser tests that play the range (headshot, leg, arm, kill,
  respawn, reload, quick turn) and the village (with a pretend PlayStation pad,
  pause menu, tuning panel) for about 30 seconds, failing on any error.

### Phase 0 - Setup
- `Play Game.bat` launcher, the dusk village arena, F3 FPS counter, F1 tuning panel,
  on-screen error box, automated checks.

## Not built (trimmed at your request)
- **Phase 6:** Score Attack mode, hidden dynamic difficulty, full difficulty/settings screens, remappable controls.
- **Phase 7:** music, post-processing polish, real models, performance pass.
The difficulty setting exists (it makes the chainsaw instant-kill on Hard/Pro) but has no menu yet.

## Known problems / notes
- In Survival you only have the starter pistol; the Trader (where you buy and upgrade
  guns, repair the knife and mix herbs in the case) arrives in Phase 5.
- The suplex throws the zombie behind you, which is towards the camera, so you briefly
  see it land close up.
- Village zombies walk straight at you and slide around obstacles; they can get
  briefly stuck behind the well or a shed. Proper pathfinding and group tactics
  (surrounding you, taking turns) come in Phase 3.
- Characters are placeholder block figures until Phase 7.
- I can't hear the sound myself; please tell me if anything is too loud, too quiet
  or sounds wrong (F1 > Audio has volume sliders). If the new gunshots aren't right,
  I can swap in different recordings from the same free library (it has 22 guns).
- My test browser draws ~3 frames per second, so feel and speed need your laptop:
  F3 shows the frame rate.
