/**
 * Sound assets for the game
 * These are imported from @kaya/ui/assets/sounds/*.mp3
 * Apps need to copy these files during their build process
 */

/**
 * Sound file paths (relative to package)
 */
export const SOUND_FILES = {
  move: [
    'assets/sounds/move-0.mp3',
    'assets/sounds/move-1.mp3',
    'assets/sounds/move-2.mp3',
    'assets/sounds/move-3.mp3',
    'assets/sounds/move-4.mp3',
  ],
  capture: [
    'assets/sounds/capture0.mp3',
    'assets/sounds/capture1.mp3',
    'assets/sounds/capture2.mp3',
    'assets/sounds/capture3.mp3',
    'assets/sounds/capture4.mp3',
  ],
  pass: 'assets/sounds/pass.mp3',
  newgame: 'assets/sounds/newgame.mp3',
} as const;

/**
 * Sound types available in the game
 */
export type SoundType = 'move' | 'capture' | 'pass' | 'newgame';
