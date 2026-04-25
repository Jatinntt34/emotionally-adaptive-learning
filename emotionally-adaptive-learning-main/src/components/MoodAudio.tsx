import React, { useEffect, useRef, useState } from 'react';
import { useMood } from '../contexts/MoodContext';
import { Volume2, VolumeX } from 'lucide-react';

export const MoodAudio: React.FC = () => {
  const { mood } = useMood();
  const [isEnabled, setIsEnabled] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const masterGain = useRef<GainNode | null>(null);
  const oscillators = useRef<OscillatorNode[]>([]);
  const filter = useRef<BiquadFilterNode | null>(null);

  const initAudio = () => {
    if (audioContext.current) return;

    audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    masterGain.current = audioContext.current.createGain();
    filter.current = audioContext.current.createBiquadFilter();

    masterGain.current.gain.value = 0.1; // Default volume
    masterGain.current.connect(audioContext.current.destination);
    filter.current.connect(masterGain.current);

    setIsEnabled(true);
  };

  useEffect(() => {
    if (!isEnabled || !audioContext.current || !filter.current) return;

    // Clear existing oscillators
    oscillators.current.forEach(osc => {
      try { osc.stop(); } catch(e) {}
    });
    oscillators.current = [];

    const ctx = audioContext.current;
    
    // Smooth transition for filter
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

  }, [mood, isEnabled]);

  const createOscillator = (freq: number, type: OscillatorType, vol: number) => {
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
  };

  const toggleAudio = () => {
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
  };

  return (
    <button
      onClick={toggleAudio}
      className="fixed bottom-6 right-24 z-50 p-3 rounded-full bg-card/80 backdrop-blur-md border border-border/50 hover:bg-primary/20 transition-all duration-300 group"
      title="Toggle Ambient Soundscape"
    >
      {isEnabled ? (
        <Volume2 className="w-5 h-5 text-primary animate-pulse" />
      ) : (
        <VolumeX className="w-5 h-5 text-muted-foreground" />
      )}
      <div className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-black/80 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
        {isEnabled ? 'Ambient Audio On' : 'Start Audio Engine'}
      </div>
    </button>
  );
};


