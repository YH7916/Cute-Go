import { taptapPlatform } from './providers/taptapPlatform';
import type { PlatformProvider } from './types';

export const getPlatform = (): PlatformProvider => {
  return taptapPlatform;
};

export const platform = getPlatform();
