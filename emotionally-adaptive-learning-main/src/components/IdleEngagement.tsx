import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMood } from '@/contexts/MoodContext';
import { X, Sparkles } from 'lucide-react';

export function IdleEngagement() {
  const { moodColors, mood } = useMood();
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const IDLE_TIMEOUT = 60000; // 60 seconds

  const resetTimer = useCallback(() => {
    setIsVisible(false);
  }, []);

  useEffect(() => {
    if (isDismissed) return;

    let idleTimer: ReturnType<typeof setTimeout>;

    const startTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        setIsVisible(true);
      }, IDLE_TIMEOUT);
    };

    const handleActivity = () => {
      if (isVisible) return; // Don't reset once shown
      startTimer();
    };

    // Listen for user activity
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, handleActivity, { passive: true }));
    startTimer();

    return () => {
      clearTimeout(idleTimer);
      events.forEach(event => window.removeEventListener(event, handleActivity));
    };
  }, [isDismissed, isVisible]);

  // Reset when mood changes
  useEffect(() => {
    setIsVisible(false);
    setIsDismissed(false);
  }, [mood]);

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
  };

  const idleMessages = {
    energetic: "Your energy is waiting! 🔥 Try a quick learning sprint.",
    calm: "Still flowing? 🌊 A gentle learning session might be nice.",
    focused: "Your focus zone is ready. 🎯 Dive into a module?",
    creative: "Let your imagination roam! ✨ Explore something new.",
    motivated: "Channel that motivation! 🚀 Start your next challenge.",
    sad: "We're here for you. 💙 A small achievement can brighten your day.",
    anxious: "Take a deep breath. 🌿 Learning can be calming when taken slowly.",
    bored: "Let's shake things up! 🎲 Try switching your mood for fresh content.",
    unmotivated: "Just one tiny step. 🌱 You'd be surprised how good it feels.",
    curious: "Questions are calling! 🔍 Follow your curiosity down a rabbit hole.",
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
          className="fixed bottom-24 right-6 z-40 max-w-sm"
        >
          <div className={`glass-card rounded-2xl p-5 border border-primary/20 shadow-2xl shadow-primary/10 relative overflow-hidden`}>
            {/* Animated gradient border */}
            <motion.div
              className={`absolute inset-0 bg-gradient-to-r ${moodColors.gradient} opacity-[0.08]`}
              animate={{ opacity: [0.05, 0.12, 0.05] }}
              transition={{ duration: 3, repeat: Infinity }}
            />

            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 w-6 h-6 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </button>

            <div className="relative flex items-start gap-3">
              <motion.div
                className={`w-10 h-10 rounded-xl bg-gradient-to-br ${moodColors.gradient} flex items-center justify-center shrink-0 shadow-lg`}
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <Sparkles className="w-5 h-5 text-foreground" />
              </motion.div>

              <div>
                <p className="text-sm font-medium text-foreground leading-relaxed">
                  {idleMessages[mood]}
                </p>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Try the mood switcher in the bottom-right corner ↘
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
