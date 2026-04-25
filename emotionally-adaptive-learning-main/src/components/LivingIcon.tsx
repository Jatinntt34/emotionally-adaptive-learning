import { motion, useSpring, useTransform } from 'framer-motion';
import { useMood, MoodType } from '@/contexts/MoodContext';
import { useEffect, useState } from 'react';
import * as Icons from 'lucide-react';

interface LivingIconProps {
  iconName: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isInteractive?: boolean;
  color?: string;
}

export function LivingIcon({ iconName, className = "", size = 'md', isInteractive = true, color }: LivingIconProps) {
  const { mood, moodColors } = useMood();
  
  const sizeMap = {
    sm: 20,
    md: 32,
    lg: 48,
    xl: 64
  };

  const iconSize = sizeMap[size];
  const IconComponent = (Icons as any)[iconName] || Icons.HelpCircle;

  // Magnetic effect springs
  const springConfig = { damping: 20, stiffness: 150 };
  const mouseX = useSpring(0, springConfig);
  const mouseY = useSpring(0, springConfig);

  const rotateX = useTransform(mouseY, [-50, 50], [15, -15]);
  const rotateY = useTransform(mouseX, [-50, 50], [-15, 15]);

  // Mood-based animation variations
  const variants = {
    energetic: {
      scale: [1, 1.15, 1],
      rotate: [0, 5, -5, 0],
      transition: { duration: 0.8, repeat: Infinity, ease: "easeInOut" }
    },
    calm: {
      y: [0, -8, 0],
      scale: [1, 1.05, 1],
      transition: { duration: 4, repeat: Infinity, ease: "easeInOut" }
    },
    focused: {
      scale: [1, 1.1, 1],
      opacity: [1, 0.8, 1],
      transition: { duration: 2, repeat: Infinity, ease: "linear" }
    },
    creative: {
      rotate: [0, 360],
      scale: [1, 1.2, 0.9, 1.1, 1],
      transition: { duration: 8, repeat: Infinity, ease: "easeInOut" }
    },
    default: {
      y: [0, -5, 0],
      transition: { duration: 2, repeat: Infinity, ease: "easeInOut" }
    }
  };

  const selectedVariant = variants[mood as keyof typeof variants] || variants.default;

  return (
    <motion.div
      className={`inline-block select-none cursor-default ${className}`}
      style={{
        rotateX,
        rotateY,
        perspective: 1000,
        filter: `drop-shadow(0 0 15px ${color || moodColors.primary}) opacity(0.44)`
      }}
      animate={selectedVariant}
      whileHover={isInteractive ? { 
        scale: 1.3, 
        rotate: [0, -10, 10, 0],
        filter: `drop-shadow(0 0 25px ${color || moodColors.primary}) opacity(0.88)`
      } : {}}
      transition={{ type: 'spring', stiffness: 300, damping: 10 }}
    >
      <IconComponent size={iconSize} strokeWidth={2.5} className="text-current" />
    </motion.div>
  );
}


