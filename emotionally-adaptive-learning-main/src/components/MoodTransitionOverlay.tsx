import { motion, AnimatePresence } from 'framer-motion';
import { useMood } from '@/contexts/MoodContext';

interface MoodTransitionOverlayProps {
  children?: React.ReactNode;
}

export function MoodTransitionOverlay({}: MoodTransitionOverlayProps) {
  const { isTransitioning, moodColors } = useMood();

  return (
    <AnimatePresence>
      {isTransitioning && (
        <motion.div
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: [0, 0.15, 0], scale: [1.1, 1, 0.98] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[9999] pointer-events-none"
          style={{ mixBlendMode: 'screen' }}
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${moodColors.gradient}`} />
          <div className="absolute inset-0 bg-gradient-radial from-white/10 via-transparent to-transparent" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}


