import { useMood, MoodType, moodConfig } from '@/contexts/MoodContext';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

interface MoodSelectorProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function MoodSelector({ className, size = 'md' }: MoodSelectorProps) {
  const { mood, setMood, moodColors, detectedRawEmotion, setDetectedRawEmotion } = useMood();
  const [textInput, setTextInput] = useState('');

  const moods = Object.entries(moodConfig) as [MoodType, typeof moodColors][];
  const allMoodNames = Object.keys(moodConfig) as MoodType[];

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = textInput.trim().toLowerCase() as MoodType;
    if (allMoodNames.includes(normalized)) {
      setMood(normalized, true);
      setDetectedRawEmotion(null);
      setTextInput('');
    }
  };

  const sizeClasses = {
    sm: 'p-2 text-sm',
    md: 'px-4 py-3 text-base',
    lg: 'px-5 py-4 text-lg'
  };

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {/* Text input for manual emotion entry */}
      <form onSubmit={handleTextSubmit} className="flex gap-2 items-center justify-center">
        <Input
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Type your emotion (e.g. calm, anxious, curious...)"
          className="max-w-xs bg-secondary/50 border-secondary text-foreground placeholder:text-muted-foreground"
        />
        <motion.button
          type="submit"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          Set
        </motion.button>
      </form>

      {/* Mood buttons in [emoji label] format */}
      <div className="flex flex-wrap gap-3 justify-center">
        {moods.map(([moodType, config]) => (
          <motion.button
            key={moodType}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setMood(moodType, true);
              setDetectedRawEmotion(null);
            }}
            className={cn(
              'rounded-xl transition-all duration-300 flex items-center gap-2',
              sizeClasses[size],
              mood === moodType
                ? `bg-gradient-to-br ${config.gradient} shadow-lg ${config.glow} text-white`
                : 'bg-secondary/50 hover:bg-secondary text-foreground/80'
            )}
          >
            <span className="opacity-60">[</span>
            <span className="filter drop-shadow-lg">{config.emoji}</span>
            <span className="font-medium flex flex-col items-center">
              <span>{config.label}</span>
              {mood === moodType && detectedRawEmotion && (
                <span className="text-[10px] opacity-80 uppercase tracking-wider -mt-1">(Feeling: {detectedRawEmotion})</span>
              )}
            </span>
            <span className="opacity-60">]</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}


