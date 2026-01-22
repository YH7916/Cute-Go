import { useRef, useEffect, useState, useCallback } from 'react';

export const useAudio = (musicVolume: number, hapticEnabled: boolean) => {
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const sfxMove = useRef<HTMLAudioElement | null>(null);
  const sfxCapture = useRef<HTMLAudioElement | null>(null);
  const sfxError = useRef<HTMLAudioElement | null>(null);
  const sfxWin = useRef<HTMLAudioElement | null>(null);
  const sfxLose = useRef<HTMLAudioElement | null>(null);

  const [hasInteracted, setHasInteracted] = useState(false);

  // Initialize Audio
  useEffect(() => {
     const initSfx = (ref: React.MutableRefObject<HTMLAudioElement | null>, src: string) => {
         const audio = new Audio(src);
         audio.preload = 'auto';
         ref.current = audio;
     };
     initSfx(sfxMove, '/move.wav');
     initSfx(sfxCapture, '/capture.wav');
     initSfx(sfxError, '/error.wav');
     initSfx(sfxWin, '/win.wav');
     initSfx(sfxLose, '/lose.wav');

     bgmRef.current = new Audio('/bgm.mp3');
     bgmRef.current.loop = true;
  }, []);

  const getSfxVolume = useCallback(() => Math.min(1, Math.max(0, musicVolume + 0.2)), [musicVolume]);

  const setAllSfxVolume = useCallback((volume: number) => {
      [sfxMove, sfxCapture, sfxError, sfxWin, sfxLose].forEach((ref) => {
          if (ref.current) ref.current.volume = volume;
      });
  }, []);

  useEffect(() => {
      setAllSfxVolume(getSfxVolume());
  }, [getSfxVolume, setAllSfxVolume]);

  // Vibrate
  const vibrate = useCallback((pattern: number | number[]) => {
      if (hapticEnabled && navigator.vibrate) {
          navigator.vibrate(pattern);
      }
  }, [hapticEnabled]);

  const playSfx = useCallback((type: 'move' | 'capture' | 'error' | 'win' | 'lose') => {
      if (musicVolume === 0) return; 
      
      const play = (ref: React.MutableRefObject<HTMLAudioElement | null>) => {
          if (ref.current) {
              ref.current.currentTime = 0;
              ref.current.play().catch(() => {});
          }
      };

      switch(type) {
          case 'move': play(sfxMove); break;
          case 'capture': play(sfxCapture); break;
          case 'error': play(sfxError); break;
          case 'win': play(sfxWin); break;
          case 'lose': play(sfxLose); break;
      }
  }, [musicVolume]);

  // BGM Interaction Handling
  useEffect(() => {
    const startAudio = () => {
        if (!hasInteracted) {
            setHasInteracted(true);
            if (bgmRef.current && musicVolume > 0 && bgmRef.current.paused) {
                bgmRef.current.play().catch(e => console.log('Autoplay deferred:', e));
            }
        }
    };
    
    document.addEventListener('click', startAudio);
    return () => document.removeEventListener('click', startAudio);
  }, [hasInteracted, musicVolume]);

  useEffect(() => {
    if (bgmRef.current) {
        bgmRef.current.volume = musicVolume;
        if (musicVolume > 0 && bgmRef.current.paused && hasInteracted) {
             bgmRef.current.play().catch(e => console.log("Play blocked", e));
        } else if (musicVolume === 0) {
            bgmRef.current.pause();
        }
    }
  }, [musicVolume, hasInteracted]);

  useEffect(() => {
      const handleVisibilityChange = () => {
          if (!bgmRef.current) return;
          if (document.hidden) {
              bgmRef.current.pause();
          } else if (musicVolume > 0 && hasInteracted) {
              bgmRef.current.play().catch(() => {});
          }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [musicVolume, hasInteracted]);

  return { playSfx, vibrate };
};
