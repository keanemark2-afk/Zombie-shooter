"""Cut single gunshots out of the CC0 Free Firearm Sound Library (and the other CC0 packs listed in
CREDITS.md) and prepare them for the game.

Usage: python make_sounds.py <firearm library> <reload pack> <output folder> <temp folder> <explosion folder> <splatter folder>
"""
import subprocess, sys, os, numpy as np

SR = 44100
LIB = sys.argv[1]      # extracted 'Prepared SFX Library' folder
RELOAD = sys.argv[2]   # extracted reload packs folder
OUT = sys.argv[3]      # project public/sounds
TMP = sys.argv[4]
EXPL = sys.argv[5]     # CC0 explosion recordings
SPLAT = sys.argv[6]    # CC0 "extreme splatter" squelch recordings
os.makedirs(OUT, exist_ok=True)

def load(path, ch=2):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).copy()

def shots(x, min_gap=1.0):
    """Start times (samples) of each loud shot in a recording."""
    mono = np.abs(x).max(axis=1)
    peak = mono.max()
    hits, i = [], 0
    above = np.where(mono > peak * 0.35)[0]
    for s in above:
        if not hits or s - hits[-1] > min_gap * SR:
            hits.append(s)
    out = []
    for h in hits:
        # back up to where the sound really starts (first sample over 3% of this shot's peak)
        seg = mono[max(0, h - int(0.03 * SR)):h + 1]
        local = mono[h:h + int(0.02 * SR)].max()
        start = np.argmax(seg > local * 0.03) + max(0, h - int(0.03 * SR))
        out.append(start)
    return out

def cut(x, start, dur, pre=0.004):
    a = max(0, int(start - pre * SR))
    seg = x[a:a + int(dur * SR)].copy()
    if len(seg) < int(dur * SR):
        seg = np.vstack([seg, np.zeros((int(dur * SR) - len(seg), x.shape[1]), np.float32)])
    return seg

def fade(seg, hold):
    n = len(seg)
    t = np.arange(n) / n
    env = np.where(t < hold, 1.0, np.cos((t - hold) / (1 - hold) * np.pi / 2) ** 2)
    seg *= env[:, None].astype(np.float32)
    ramp = int(0.002 * SR)
    seg[:ramp] *= np.linspace(0, 1, ramp)[:, None]
    return seg

def write(name, seg, peak_db=-2.0):
    seg = seg / max(1e-9, np.abs(seg).max()) * (10 ** (peak_db / 20))
    pcm = os.path.join(TMP, name + '.f32')
    seg.astype(np.float32).tofile(pcm)
    out = os.path.join(OUT, name + '.ogg')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', str(seg.shape[1]), '-ar', str(SR), '-i', pcm,
                    '-c:a', 'libvorbis', '-q:a', '6', out], check=True)
    print(f'{name}.ogg  {len(seg)/SR:.2f}s  {os.path.getsize(out)//1024} KB')

def gunshot(name, near_file, far_file, dur, hold, far_gain_db):
    near = load(os.path.join(LIB, near_file))
    far = load(os.path.join(LIB, far_file))
    ns, fs = shots(near), shots(far)
    for i, s in enumerate(ns[:3]):
        seg = cut(near, s, dur)
        if fs:
            f = cut(far, fs[min(i, len(fs) - 1)], dur)
            seg = seg + f * (10 ** (far_gain_db / 20))
        write(f'{name}-{i + 1}', fade(seg, hold))

# The player's guns: close recording for punch, far recording for the echo.
gunshot('pistol', '1911/A_42P.wav', '1911/A_34P.wav', dur=1.5, hold=0.12, far_gain_db=-7)
gunshot('pump', 'Model 12/K_22P.wav', 'Model 12/K_17P.wav', dur=2.2, hold=0.15, far_gain_db=-6)
gunshot('drum', 'Nova/O_21P.wav', 'Nova/O_17P.wav', dur=1.8, hold=0.12, far_gain_db=-7)
gunshot('revolver', 'Smith & Wesson 642/V_27P.wav', 'Smith & Wesson 642/V_22P.wav', dur=1.6, hold=0.12, far_gain_db=-7)
# Short and tight so rapid fire doesn't turn to mush.
gunshot('smg', 'Walther PPQ/X_39P.wav', 'Walther PPQ/X_31P.wav', dur=0.45, hold=0.1, far_gain_db=-10)
gunshot('rifle', 'Mosin Nagant/M_21P.wav', 'Mosin Nagant/M_26P.wav', dur=2.4, hold=0.12, far_gain_db=-5)
# The big revolver: a revolver's crack with a heavy rifle's rolling echo underneath.
gunshot('magnum', 'Smith & Wesson 642/V_27P.wav', '1917/B_16P.wav', dur=2.0, hold=0.12, far_gain_db=-3)

# Mechanical sounds (CC0 shotgun handling pack).
def clip(name, path, start, dur, hold=0.7, ch=2, peak_db=-3):
    x = load(os.path.join(RELOAD, path), ch)
    write(name, fade(cut(x, int(start * SR), dur, pre=0.0), hold), peak_db)

clip('pump-rack', 'ShotgunSounds/Rack.mp3', 0.60, 0.52)
clip('shell-in', 'ShotgunSounds/First Shell.mp3', 0.33, 0.62)


# Explosions (rocket and barrels).
def boom(name, path, dur, hold):
    x = load(os.path.join(EXPL, path))
    start = shots(x, min_gap=5)[0]
    write(name, fade(cut(x, start, dur), hold), -1.0)

boom('explosion-1', 'Chunky%20Explosion.mp3', 3.6, 0.1)
boom('explosion-2', 'explosion_dull.flac', 0.98, 0.3)

# Wet squelches for bursting heads and torn-off limbs: the loudest moments of the splatter takes.
def splats(name, path, count, dur):
    x = load(os.path.join(SPLAT, path))
    env = np.abs(x).max(axis=1)
    win = int(0.02 * SR)
    smooth = np.convolve(env, np.ones(win) / win, mode='same')
    picks = []
    order = np.argsort(-smooth)
    for i in order:
        if all(abs(i - p) > 0.6 * SR for p in picks):
            picks.append(int(i))
        if len(picks) >= count:
            break
    for k, p in enumerate(sorted(picks)):
        start = max(0, p - int(0.05 * SR))
        write(f'{name}-{k + 1}', fade(cut(x, start, dur, pre=0.0), 0.25), -2.0)

splats('splat-a', 'crack11.mp3.flac', 2, 0.55)
splats('splat-b', 'crack12.mp3.flac', 2, 0.55)
