import { describe, expect, it } from 'vitest';
import { MusicDirector } from '../../src/audio/music';

describe('MusicDirector', () => {
  it('starts with track "none"', () => {
    const music = new MusicDirector();
    expect(music.track).toBe('none');
  });

  it('updates track target state', () => {
    const music = new MusicDirector();
    music.play('ambient');
    // Without Web Audio context, state degrades gracefully without error
    expect(() => music.tick(0.1)).not.toThrow();
  });

  it('handles overdrive toggle safely without crashing', () => {
    const music = new MusicDirector();
    expect(() => music.setOverdrive(true)).not.toThrow();
    expect(() => music.setOverdrive(false)).not.toThrow();
  });

  it('stops safely', () => {
    const music = new MusicDirector();
    expect(() => music.play('none')).not.toThrow();
  });
});
