import { getTap } from './taptap/runtime';
import { tapVibrateShort, tapVibrateLong } from './taptap/capabilities';

export function tryTapVibration(): boolean {
  const tap = getTap();
  if (typeof tap?.vibrateShort === 'function') return tapVibrateShort();
  if (typeof tap?.vibrateLong === 'function') return tapVibrateLong();
  return false;
}
