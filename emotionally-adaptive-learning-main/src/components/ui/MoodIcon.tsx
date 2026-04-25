import React from 'react';
import { 
  Zap, 
  Wind, 
  Target, 
  Palette, 
  Flame, 
  Heart, 
  Waves, 
  Sparkles, 
  Sprout, 
  Search,
  LucideIcon
} from 'lucide-react';
import { MoodType, moodConfig } from '@/contexts/MoodContext';
import { cn } from '@/lib/utils';

interface MoodIconProps {
  mood: MoodType;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showGlow?: boolean;
}

const ICON_MAP: Record<MoodType, LucideIcon> = {
  energetic: Zap,
  calm: Wind,
  focused: Target,
  creative: Palette,
  motivated: Flame,
  sad: Heart,
  anxious: Waves,
  bored: Sparkles,
  unmotivated: Sprout,
  curious: Search,
};

const SIZE_MAP = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-10 h-10',
  xl: 'w-16 h-16',
};

export const MoodIcon: React.FC<MoodIconProps> = ({ 
  mood, 
  className, 
  size = 'md',
  showGlow = false 
}) => {
  const Icon = ICON_MAP[mood] || Sparkles;
  const config = moodConfig[mood];

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      {showGlow && (
        <div 
          className={cn(
            "absolute inset-0 blur-lg opacity-40 animate-pulse",
            `bg-gradient-to-br ${config.gradient}`
          )} 
        />
      )}
      <Icon 
        className={cn(
          SIZE_MAP[size],
          "relative z-10",
          mood === 'energetic' && "fill-current"
        )} 
      />
    </div>
  );
};


