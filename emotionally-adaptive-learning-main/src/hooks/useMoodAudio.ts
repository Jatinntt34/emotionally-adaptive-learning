import { useEffect, useRef, useState, useCallback } from 'react';
import { useMood, MoodType } from '@/contexts/MoodContext';

export function useMoodAudio() {
  const { mood } = useMood();
  const [isEnabled, setIsEnabled] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const masterGain = useRef<GainNode | null>(null);
  const oscillators = useRef<OscillatorNode[]>([]);
  const filter = useRef<BiquadFilterNode | null>(null);

  const initAudio = useCallback(() => {
    if (audioContext.current) return;

    audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    masterGain.current = audioContext.current.createGain();
    filter.current = audioContext.current.createBiquadFilter();

    masterGain.current.gain.value = 0.1;
    masterGain.current.connect(audioContext.current.destination);
    filter.current.connect(masterGain.current);

    setIsEnabled(true);
  }, []);

  const createOscillator = useCallback((freq: number, type: OscillatorType, vol: number) => {
    if (!audioContext.current || !filter.current) return;
    const osc = audioContext.current.createOscillator();
    const g = audioContext.current.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioContext.current.currentTime);
    
    g.gain.setValueAtTime(0, audioContext.current.currentTime);
    g.gain.linearRampToValueAtTime(vol, audioContext.current.currentTime + 2);
    
    osc.connect(g);
    g.connect(filter.current);
    osc.start();
    oscillators.current.push(osc);
  }, []);

  const toggleAudio = useCallback(() => {
    if (!audioContext.current) {
      initAudio();
    } else {
      if (audioContext.current.state === 'suspended') {
        audioContext.current.resume();
        setIsEnabled(true);
      } else {
        audioContext.current.suspend();
        setIsEnabled(false);
      }
    }
  }, [initAudio]);

  useEffect(() => {
    if (!isEnabled || !audioContext.current || !filter.current) return;

    oscillators.current.forEach(osc => {
      try { osc.stop(); } catch(e) {}
    });
    oscillators.current = [];

    const ctx = audioContext.current;
    filter.current.type = 'lowpass';
    const now = ctx.currentTime;

    if (mood === 'energetic') {
      filter.current.frequency.setTargetAtTime(2000, now, 0.5);
      createOscillator(220, 'sawtooth', 0.1);
      createOscillator(440, 'square', 0.05);
    } else if (mood === 'calm') {
      filter.current.frequency.setTargetAtTime(400, now, 1.0);
      createOscillator(110, 'sine', 0.2);
      createOscillator(165, 'sine', 0.1);
    } else if (mood === 'focused') {
      filter.current.frequency.setTargetAtTime(1000, now, 0.8);
      createOscillator(330, 'sine', 0.15);
      createOscillator(495, 'sine', 0.1);
    } else {
      filter.current.frequency.setTargetAtTime(600, now, 1.0);
      createOscillator(110, 'sine', 0.1);
    }
  }, [mood, isEnabled, createOscillator]);

  return { isEnabled, toggleAudio };
}


