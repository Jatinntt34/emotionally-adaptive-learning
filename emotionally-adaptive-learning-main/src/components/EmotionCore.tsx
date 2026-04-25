import React, { useEffect, useRef } from 'react';
import { useMood } from '../contexts/MoodContext';
import gsap from 'gsap';

export const EmotionCore: React.FC = () => {
  const { mood, moodColors } = useMood();
  const containerRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    if (!orbRef.current || !ringRef.current) return;

    // Heartbeat Pulse
    const pulseTimeline = gsap.timeline({ repeat: -1 });
    pulseTimeline.to(orbRef.current, {
      scale: 1.15,
      opacity: 0.8,
      duration: 1.2,
      ease: "power2.inOut"
    }).to(orbRef.current, {
      scale: 1,
      opacity: 0.6,
      duration: 1.2,
      ease: "power2.inOut"
    });

    // Ring Rotation
    gsap.to(ringRef.current, {
      rotate: 360,
      duration: 10,
      repeat: -1,
      ease: "none"
    });

    // Magnetic Mouse Interaction
    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;
      const x = (clientX / innerWidth - 0.5) * 40;
      const y = (clientY / innerHeight - 0.5) * 40;

      gsap.to(containerRef.current, {
        x,
        y,
        rotateX: -y * 0.5,
        rotateY: x * 0.5,
        duration: 2,
        ease: "power3.out"
      });
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      pulseTimeline.kill();
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-56 h-56 md:w-80 md:h-80 flex items-center justify-center pointer-events-none perspective-1000">
      {/* Outer Glow */}
      <div 
        className={`absolute inset-0 rounded-full blur-[100px] transition-colors duration-1000 opacity-40`}
        style={{ background: moodColors.primary }}
      />

      {/* Rotating Ring */}
      <div 
        ref={ringRef}
        className="absolute w-[110%] h-[110%] border border-primary/20 rounded-full border-dashed"
      />

      {/* Breathing Glow Ring */}
      <div 
        className="absolute w-[130%] h-[130%] rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, transparent 55%, ${moodColors.primary}22 70%, transparent 85%)`,
          animation: `breathe-ring ${4 + moodColors.pulseSpeed * 2}s ease-in-out infinite`,
        }}
      />

      <style>{`
        @keyframes breathe-ring {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.15); opacity: 0.6; }
        }
      `}</style>

      {/* The Core Orb */}
      <div
        ref={orbRef}
        className={`relative w-28 h-28 md:w-44 md:h-44 rounded-full shadow-2xl transition-all duration-1000 overflow-hidden group`}
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${moodColors.gradient} opacity-80`} />
        
        {/* Internal Noise/Texture */}
        <div className="absolute inset-0 noise-overlay opacity-30 mix-blend-overlay" />
        
        {/* Highlight */}
        <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 bg-white/30 rounded-full blur-xl" />
      </div>

      {/* Orbiting Particles */}
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-primary/60 blur-[1px]"
          style={{
            animation: `orbit-${i} ${8 + i}s linear infinite`,
          }}
        />
      ))}
      
      <style>{`
        ${[...Array(8)].map((_, i) => `
          @keyframes orbit-${i} {
            from { transform: rotate(${i * 45}deg) translateX(${100 + i * 12}px) rotate(0deg); }
            to { transform: rotate(${i * 45 + 360}deg) translateX(${100 + i * 12}px) rotate(-360deg); }
          }
        `).join('\n')}
      `}</style>
    </div>
  );
};


