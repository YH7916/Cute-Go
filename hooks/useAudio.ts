
import { useRef, useEffect, useState, useCallback } from 'react';
import { tryTapVibration } from '../services/platform/haptics';

interface AudioRuntime {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
  Capacitor?: { isNativePlatform?: () => boolean };
}

export const useAudio = (musicVolume: number, hapticEnabled: boolean) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const bgmSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bgmGainNodeRef = useRef<GainNode | null>(null);
  const hapticStateRef = useRef({ enabled: hapticEnabled, mounted: true, generation: 0 });
  const webVibrationActiveRef = useRef(false);
  // Retained callbacks read the current preference. Changing it also invalidates
  // work already waiting for the native plugin, including disable/enable cycles.
  if (hapticStateRef.current.enabled !== hapticEnabled) {
    hapticStateRef.current.enabled = hapticEnabled;
    hapticStateRef.current.generation++;
  }
  
  // Buffers
  const buffers = useRef<{ [key: string]: AudioBuffer | null }>({
    move: null,
    capture: null,
    error: null,
    win: null,
    lose: null,
    bgm: null
  });

  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const [bgmLoaded, setBgmLoaded] = useState(false);

  // Initialize Audio Context & Load Assets
  useEffect(() => {
    const initAudio = async () => {
      // Create Context
      const runtime = window as AudioRuntime;
      const AudioContextClass = runtime.AudioContext || runtime.webkitAudioContext;
      if (!AudioContextClass) return;
      
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      // Load File Helper
      const loadBuffer = async (url: string, key: string) => {
        try {
          // Use relative path (remove leading /) to support subfolder deployment
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          buffers.current[key] = audioBuffer;
          if (key === 'bgm') setBgmLoaded(true);
        } catch (e) {
          console.warn(`Failed to load audio: ${url}`, e);
        }
      };

      // Load all sounds
      // Note: Using relative paths 'move.wav' instead of '/move.wav' matches deploying in current dir
      await Promise.all([
        loadBuffer('move.wav', 'move'),
        loadBuffer('capture.wav', 'capture'),
        loadBuffer('error.wav', 'error'),
        loadBuffer('win.wav', 'win'),
        loadBuffer('lose.wav', 'lose'),
        loadBuffer('bgm.mp3', 'bgm'),
      ]);
    };

    initAudio();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Unlock Audio on First Interaction
  useEffect(() => {
    const unlockAudio = () => {
      const ctx = audioContextRef.current;
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => {
          setIsAudioUnlocked(true);
        });
      } else if (ctx && ctx.state === 'running') {
        setIsAudioUnlocked(true);
      }
    };

    // Both click and touchstart are needed for mobile compatibility
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // Play Sound Effect
  const playSfx = useCallback((type: 'move' | 'capture' | 'error' | 'win' | 'lose') => {
    if (musicVolume === 0) return;
    const ctx = audioContextRef.current;
    if (!ctx || !buffers.current[type]) return;

    // Auto-resume if needed (double check)
    if (ctx.state === 'suspended') ctx.resume();

    try {
      const source = ctx.createBufferSource();
      source.buffer = buffers.current[type];
      
      // Simple volume control for SFX (using input volume + boost)
      const gainNode = ctx.createGain();
      gainNode.gain.value = Math.min(1, Math.max(0, musicVolume + 0.2));
      
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(0);
    } catch (e) {
      console.error("Error playing sfx", e);
    }
  }, [musicVolume]);

  // Handle BGM
  useEffect(() => {
    const ctx = audioContextRef.current;
    const bgmBuffer = buffers.current.bgm;

    if (!ctx || !bgmBuffer) return;

    if (musicVolume > 0 && isAudioUnlocked) {
        // Start playing if not already playing
        if (!bgmSourceRef.current) {
            try {
                const source = ctx.createBufferSource();
                source.buffer = bgmBuffer;
                source.loop = true;
                
                const gain = ctx.createGain();
                gain.gain.value = musicVolume;
                
                source.connect(gain);
                gain.connect(ctx.destination);
                source.start(0);
                
                bgmSourceRef.current = source;
                bgmGainNodeRef.current = gain;
            } catch(e) { console.error("BGM Start Error", e); }
        } else {
            // Update volume
            if (bgmGainNodeRef.current) {
                // Smooth transition
                bgmGainNodeRef.current.gain.setTargetAtTime(musicVolume, ctx.currentTime, 0.1);
            }
        }
    } else {
        // Stop/Fade out
        if (bgmSourceRef.current) {
            try { 
                bgmSourceRef.current.stop(); 
                bgmSourceRef.current.disconnect(); 
            } catch {}
            bgmSourceRef.current = null;
        }
    }
  }, [musicVolume, isAudioUnlocked, bgmLoaded]); 

  // Page Visibility Handler (Save Battery)
  useEffect(() => {
      const handleVisibilityChange = () => {
          const ctx = audioContextRef.current;
          if (!ctx) return;

          if (document.hidden) {
              if (ctx.state === 'running') {
                  console.log("[PowerSave] Suspending Audio Context");
                  ctx.suspend();
              }
          } else {
              // Only resume if audio was previously unlocked and we want to play
              if (isAudioUnlocked && ctx.state === 'suspended') {
                  console.log("[PowerSave] Resuming Audio Context");
                  ctx.resume();
              }
          }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);
      return () => {
          document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
  }, [isAudioUnlocked]);

  const stopWebVibration = useCallback(() => {
    if (!webVibrationActiveRef.current) return;
    webVibrationActiveRef.current = false;
    try { navigator.vibrate?.(0); } catch { /* Optional browser capability. */ }
  }, []);

  useEffect(() => {
    if (!hapticEnabled) stopWebVibration();
  }, [hapticEnabled, stopWebVibration]);

  useEffect(() => {
    hapticStateRef.current.mounted = true;
    return () => {
      hapticStateRef.current.mounted = false;
      hapticStateRef.current.generation++;
      stopWebVibration();
    };
  }, [stopWebVibration]);

  // Vibrate with Multi-Platform Support
  const vibrate = useCallback((pattern: number | number[]) => {
      const { enabled, mounted, generation } = hapticStateRef.current;
      if (!enabled || !mounted) return;
      const isCurrent = () => hapticStateRef.current.enabled && hapticStateRef.current.mounted &&
        hapticStateRef.current.generation === generation;
      const tryWebVibration = () => {
          if (!isCurrent()) return;
          try {
              if (navigator.vibrate) {
                  console.log('[Vibrate] Using Web Vibration API');
                  const success = navigator.vibrate(pattern);
                  webVibrationActiveRef.current = success;
                  console.log('[Vibrate] Web vibration result:', success);
              } else {
                  console.warn('[Vibrate] No vibration API available');
              }
          } catch (e) {
              console.warn('[Vibrate] Web vibration error:', e);
          }
      };
      
      console.log('[Vibrate] Attempting vibration with pattern:', pattern);
      
      // 1. Try TapTap Minigame API (小游戏环境)
      const runtime: AudioRuntime | undefined = typeof window !== 'undefined' ? window as AudioRuntime : undefined;
      if (tryTapVibration()) return;
      
      // 2. Try Capacitor Haptics (原生应用)
      if (runtime?.Capacitor) {
          try {
              const { Capacitor } = runtime;
              // Check if running on native platform
              if (Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
                  // Dynamically import Haptics plugin
                  import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => {
                      if (!isCurrent()) return;
                      console.log('[Vibrate] Using Capacitor Haptics API');
                      // Convert pattern to impact
                      const duration = Array.isArray(pattern) ? pattern[0] : pattern;
                      const style = duration > 50 ? ImpactStyle.Heavy : 
                                   duration > 20 ? ImpactStyle.Medium : ImpactStyle.Light;
                      
                      Haptics.impact({ style })
                          .then(() => console.log('[Vibrate] Capacitor vibration success'))
                          .catch((err) => console.warn('[Vibrate] Capacitor vibration failed:', err));
                  }).catch((err) => {
                      if (!isCurrent()) return;
                      console.warn('[Vibrate] Capacitor Haptics import failed:', err);
                      // Fallback to Web API
                      tryWebVibration();
                  });
                  return;
              }
          } catch (e) {
              console.warn('[Vibrate] Capacitor check error:', e);
          }
      }
      
      // 3. Fallback to Web Vibration API (标准浏览器)
      tryWebVibration();
  }, []);

  return { playSfx, vibrate };
};
