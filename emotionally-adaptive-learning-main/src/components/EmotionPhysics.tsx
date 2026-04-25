import React, { useEffect, useRef } from 'react';
import { useMood } from '../contexts/MoodContext';
import gsap from 'gsap';

interface Particle {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  color: string;
  originalColor: string;
}

export const EmotionPhysics: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { mood, moodColors } = useMood();
  const particles = useRef<Particle[]>([]);
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
    };

    const initParticles = () => {
      particles.current = [];
      const count = moodColors.particleCount * 2; // Double for depth
      for (let i = 0; i < count; i++) {
        particles.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 3 + 1,
          vx: (Math.random() - 0.5) * moodColors.particleSpeed,
          vy: (Math.random() - 0.5) * moodColors.particleSpeed,
          color: moodColors.primary,
          originalColor: moodColors.primary,
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);
    resize();

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Background base
      ctx.fillStyle = 'rgba(13, 13, 23, 0.05)'; // Very faint trail
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.current.forEach((p) => {
        // Apply forces based on mouse
        const dx = mouse.current.x - p.x;
        const dy = mouse.current.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 200) {
          const force = (200 - dist) / 200;
          p.vx += (dx / dist) * force * 0.5;
          p.vy += (dy / dist) * force * 0.5;
        }

        // Friction and mood-based movement
        p.vx *= 0.95;
        p.vy *= 0.95;
        
        // Add mood-based drift
        if (mood === 'energetic') {
          p.vx += (Math.random() - 0.5) * 0.5;
          p.vy += (Math.random() - 0.5) * 0.5;
        } else if (mood === 'calm') {
          p.vx += Math.sin(p.y * 0.01) * 0.1;
        }

        p.x += p.vx;
        p.y += p.vy;

        // Boundary checks
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        // Draw particle
        ctx.beginPath();
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 2);
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.arc(p.x, p.y, p.radius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Connect lines for "Liquid/Viscous" feel (especially in Sad/Focused)
        if (mood === 'sad' || mood === 'focused') {
            particles.current.forEach(p2 => {
                const dx = p.x - p2.x;
                const dy = p.y - p2.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 100) {
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(${mood === 'sad' ? '100, 150, 255' : '150, 255, 150'}, ${0.1 * (1 - dist/100)})`;
                    ctx.lineWidth = 0.5;
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            })
        }
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [mood, moodColors]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[-1] opacity-50"
      style={{ filter: 'blur(2px)' }}
    />
  );
};


