import { useEffect, useState, useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useMood } from '@/contexts/MoodContext';
import type { MoodType } from '@/contexts/MoodContext';

/**
 * MoodCursor — Premium, refined arrow cursor + trailing glow.
 * 
 * Replaces the system cursor with a sleek, small motion-div arrow.
 * Features:
 *   • Ultra-sharp mood-colored arrow (14px)
 *   • Tiny trailing glow dot (4px) with spring lag
 *   • Smooth color transitions
 *   • Intelligent hover detection
 */

const moodColors: Record<MoodType, string> = {
  energetic:   '#F59E0B',
  calm:        '#3B82F6',
  focused:     '#10B981',
  creative:    '#8B5CF6',
  motivated:   '#F43F5E',
  sad:         '#64748B',
  anxious:     '#D97706',
  bored:       '#14B8A6',
  unmotivated: '#991B1B',
  curious:     '#FACC15',
};

export function MoodCursor() {
  const { mood } = useMood();
  const [isHovering, setIsHovering] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const isTouchDevice = useRef(false);

  // Instant position for the arrow
  const mouseX = useMotionValue(-100);
  const mouseY = useMotionValue(-100);

  // Smooth position for the trailing dot
  const trailX = useSpring(mouseX, { damping: 40, stiffness: 250, mass: 0.6 });
  const trailY = useSpring(mouseY, { damping: 40, stiffness: 250, mass: 0.6 });

  const color = moodColors[mood] || moodColors.energetic;

  useEffect(() => {
    isTouchDevice.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice.current) return;

    // Hide default cursor
    document.body.style.cursor = 'none';
    const style = document.createElement('style');
    style.innerHTML = `
      * { cursor: none !important; }
      .cursor-pointer, a, button, [role="button"], input, select { cursor: none !important; }
    `;
    document.head.appendChild(style);

    const onMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
      
      if (!isVisible) setIsVisible(true);

      // Check for interactive elements
      const target = e.target as HTMLElement;
      const interactive = target?.closest('a, button, [role="button"], input, select, [data-cursor-hover]');
      setIsHovering(!!interactive);
    };

    const onLeave = () => setIsVisible(false);
    const onEnter = () => setIsVisible(true);

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);

    return () => {
      document.body.style.cursor = 'auto';
      document.head.removeChild(style);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
    };
  }, [isVisible]);

  if (isTouchDevice.current) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {/* Trailing Glow Dot */}
      <motion.div
        style={{
          x: trailX,
          y: trailY,
          translateX: '-50%',
          translateY: '-50%',
        }}
        className="absolute w-1.5 h-1.5 rounded-full"
      >
        <div 
          className="absolute inset-0 rounded-full blur-[2px]"
          style={{ backgroundColor: color, opacity: 0.6 }}
        />
        <div 
          className="absolute inset-[-4px] rounded-full blur-[8px]"
          style={{ backgroundColor: color, opacity: 0.3 }}
        />
      </motion.div>

      {/* The Arrow Cursor */}
      <motion.div
        style={{
          x: mouseX,
          y: mouseY,
          rotate: isHovering ? -15 : 0,
          scale: isHovering ? 1.2 : 1,
        }}
        className="absolute"
      >
        <svg 
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          style={{ filter: `drop-shadow(0 0 4px ${color}60)` }}
        >
          <path 
            d="M5.65376 12.3818L15.352 17.5042C16.8924 18.318 18.6667 17.2023 18.6667 15.4601V5.13112C18.6667 3.38891 16.8924 2.27318 15.352 3.08698L5.65376 8.20937C4.11336 9.02316 4.11336 11.568 5.65376 12.3818Z" 
            fill={color}
            className="transition-colors duration-500"
          />
        </svg>
      </motion.div>
    </div>
  );
}


