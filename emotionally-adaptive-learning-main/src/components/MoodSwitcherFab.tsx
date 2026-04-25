import { motion, AnimatePresence } from 'framer-motion';
import { useMood, moodConfig, MoodType } from '@/contexts/MoodContext';
import { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MoodIcon } from './ui/MoodIcon';

export function MoodSwitcherFab() {
  const { mood, setMood, moodColors } = useMood();
  const [isOpen, setIsOpen] = useState(false);
  const moods = Object.entries(moodConfig) as [MoodType, (typeof moodConfig)[MoodType]][];

  const handleSelect = useCallback((newMood: MoodType) => {
    setMood(newMood);
    setIsOpen(false);
  }, [setMood]);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/60 backdrop-blur-md z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Mood Picker Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="absolute bottom-16 right-0 z-50 w-[280px] glass-card rounded-2xl p-4 border border-primary/20 shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Switch Mood</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-gradient-to-r ${moodColors.gradient} text-foreground flex items-center gap-1.5`}>
                  <MoodIcon mood={mood} size="xs" /> {moodColors.label}
                </span>
              </div>

              {/* Grid of mood options */}
              <div className="grid grid-cols-5 gap-2">
                {moods.map(([moodType, config], index) => (
                  <motion.button
                    key={moodType}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 400,
                      damping: 20,
                      delay: index * 0.03,
                    }}
                    whileHover={{ scale: 1.15, y: -2 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleSelect(moodType)}
                    className={cn(
                      'relative w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all duration-200 border-2',
                      mood === moodType
                        ? `bg-gradient-to-br ${config.gradient} border-white/30 shadow-lg`
                        : 'bg-card/60 border-border/30 hover:border-primary/40 hover:bg-card/80'
                    )}
                    title={config.label}
                  >
                    <MoodIcon mood={moodType} size="sm" className="filter drop-shadow-md" />
                    <span className={cn(
                      'text-[9px] font-medium leading-none',
                      mood === moodType ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      {config.label}
                    </span>
                    {mood === moodType && (
                      <motion.div
                        className="absolute inset-0 rounded-xl border-2 border-white/20"
                        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}
                  </motion.button>
                ))}
              </div>

              {/* Motivational quote */}
              <motion.p
                key={mood}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[10px] text-center text-muted-foreground/70 mt-3 px-2 italic leading-tight"
              >
                "{moodColors.motivationalQuote}"
              </motion.p>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main FAB Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'relative w-14 h-14 rounded-full flex items-center justify-center shadow-2xl z-50 border-2 transition-all duration-300',
          `bg-gradient-to-br ${moodColors.gradient} border-white/20`
        )}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        animate={isOpen ? { rotate: 180 } : { rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <motion.span
          className="text-2xl filter drop-shadow-lg"
          animate={!isOpen ? { scale: [1, 1.15, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {isOpen ? <X className="w-6 h-6" /> : <MoodIcon mood={mood} size="md" />}
        </motion.span>

        {/* Pulsing ring */}
        {!isOpen && (
          <motion.div
            className={`absolute inset-0 rounded-full bg-gradient-to-br ${moodColors.gradient}`}
            animate={{
              scale: [1, 1.4, 1.4],
              opacity: [0.4, 0, 0],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
      </motion.button>
    </div>
  );
}


