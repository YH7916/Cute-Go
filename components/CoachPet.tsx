import React, { useEffect, useState } from 'react';
import { COACH_SKINS, type CoachSkinId } from '../utils/coachSkins';

type PetState = 'idle' | 'thinking' | 'explaining' | 'encouraging';
const animations: Record<PetState, { frames: number; seconds: number }> = {
  idle: { frames: 6, seconds: 2.4 },
  thinking: { frames: 6, seconds: 1.8 },
  explaining: { frames: 6, seconds: 1.5 },
  encouraging: { frames: 4, seconds: 1.2 },
};
const spriteWidth = 96;

// Generated artwork uses one shared 192 x 208 registration for every frame.
// CSS only plays the generated pixels; it does not redraw the character.
export function CoachPet({ state, skinId = 'chuying' }: { state: PetState; skinId?: CoachSkinId }) {
  const [visible, setVisible] = useState(() => !document.hidden);
  const [readyAsset, setReadyAsset] = useState<string | null>(null);
  const skin = COACH_SKINS[skinId];
  const imageRoot = `${import.meta.env.BASE_URL}${skin.assetRoot}`;
  const isSprite = skin.animation === 'sprite';
  // Version the art so an older offline cache cannot substitute a draft image.
  const artVersion = `?v=${skin.artVersion}`;
  const assetUrl = `${imageRoot}${isSprite ? state : 'poster'}.png${artVersion}`;
  useEffect(() => {
    let active = true;
    const asset = new Image();
    asset.onload = () => { if (active) setReadyAsset(assetUrl); };
    asset.src = assetUrl;
    return () => { active = false; asset.onload = null; };
  }, [assetUrl]);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const animation = animations[state];
  const ready = readyAsset === assetUrl;
  const style: React.CSSProperties & { '--coach-sprite-end': string } = {
    backgroundImage: `url("${imageRoot}${isSprite && ready ? state : 'poster'}.png${artVersion}")`,
    backgroundSize: isSprite ? `${(ready ? animation.frames : 1) * spriteWidth}px ${spriteWidth * 208 / 192}px` : 'contain',
    backgroundPosition: isSprite ? undefined : 'center bottom',
    '--coach-sprite-end': `${-animation.frames * spriteWidth}px`,
    ...(!ready ? { animationName: 'none' } : {}),
    animationDuration: `${isSprite ? animation.seconds : state === 'idle' ? 3.2 : 2.2}s`,
    animationTimingFunction: isSprite ? `steps(${animation.frames})` : 'ease-in-out',
    animationPlayState: visible ? 'running' : 'paused',
  };
  return <span aria-hidden="true" className="coach-pet-frame relative block shrink-0">
    <span data-pet-state={state} data-pet-skin={skinId}
      className={`coach-pet ${isSprite ? '' : 'coach-pet-portrait'} absolute left-0 top-0 origin-top-left block bg-no-repeat pointer-events-none`} style={style} />
  </span>;
}
