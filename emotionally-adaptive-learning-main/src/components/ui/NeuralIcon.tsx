import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NeuralIconProps {
  icon: LucideIcon;
  className?: string;
  iconClassName?: string;
  gradient?: string;
  moodColor?: string;
  animate?: boolean;
}

export const NeuralIcon: React.FC<NeuralIconProps> = ({ 
  icon: Icon, 
  className, 
  iconClassName,
  gradient = "from-primary to-orange-500",
  moodColor,
  animate = true
}) => {
  return (
    <div className={cn("relative group", className)}>
      {/* Outer Glow Halo */}
      <div 
        className={cn(
          "absolute -inset-4 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-700",
          moodColor ? "" : `bg-gradient-to-br ${gradient}`
        )}
        style={moodColor ? { backgroundColor: moodColor } : {}}
      />

      {/* Main Container: Squircle-like rounded box */}
      <motion.div 
        whileHover={animate ? { scale: 1.05, rotate: -2 } : {}}
        className={cn(
          "relative w-full h-full rounded-[1.75rem] border border-white/10 bg-[#0A0A10]/80 backdrop-blur-xl flex items-center justify-center overflow-hidden shadow-2xl transition-all duration-500",
          "after:absolute after:inset-0 after:bg-gradient-to-br after:opacity-10 after:group-hover:opacity-20 after:transition-opacity",
          moodColor ? "" : `after:${gradient}`
        )}
      >
        {/* Inner Mesh Accent */}
        <div className={cn(
          "absolute inset-0 opacity-10 blur-xl",
          moodColor ? "" : `bg-gradient-to-tr ${gradient}`
        )} />
        
        {/* Core Lighting Core */}
        <div className={cn(
          "absolute w-1/2 h-1/2 rounded-full blur-[30px] opacity-30 animate-pulse",
          moodColor ? "" : `bg-gradient-to-br ${gradient}`
        )} />

        {/* The Icon */}
        <Icon 
          className={cn(
            "relative z-10 text-white transition-all duration-500",
            "drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]",
            iconClassName
          )} 
        />

        {/* Refined Framing Border (inner) */}
        <div className="absolute inset-[1px] rounded-[1.7rem] border border-white/5 pointer-events-none" />
      </motion.div>
      
      {/* HUD-like corner accents */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20 rounded-tl-lg" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/20 rounded-br-lg" />
    </div>
  );
};
