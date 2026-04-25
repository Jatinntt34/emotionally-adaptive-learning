import { useState, useEffect, useCallback } from 'react';
import { useMood, MoodType } from '@/contexts/MoodContext';

const IDLE_TIMEOUT = 45000; // 45 seconds - slightly faster for more 'living' feel

const insightMessages: Record<MoodType, string[]> = {
  energetic: [
    "Channel that fire! Try a 2-minute learning sprint.",
    "Your brain is buzzing. Let's tackle that complex topic now.",
    "Energy peak detected. Perfect time for interactive challenges!"
  ],
  calm: [
    "Gentle as a stream. How about some light reading?",
    "Your state is perfect for deep pattern recognition.",
    "Relaxed and ready. Let's explore some artistic concepts."
  ],
  focused: [
    "Deep flow state imminent. Start the next module?",
    "Zero noise. Pure signal. Let's finish the current path.",
    "Focus is sharp. Time for the advanced exercises."
  ],
  creative: [
    "Abstract connections are forming. Explore 'What if?'",
    "Imagination is on. Let's browse inspirations.",
    "The canvas is yours. Try something unconventional."
  ],
  motivated: [
    "Launch sequence ready. What goal are we crushing today?",
    "Momentum is your ally. Keep the streak alive!",
    "You're on a roll. Let's level up one more time."
  ],
  sad: [
    "Small wins matter. Let's find one tiny achievement.",
    "Be kind to yourself. A gentle video might help.",
    "We're here. Learning at a slow pace is still progress."
  ],
  anxious: [
    "Breathe in... Breathe out. Ready for a small step?",
    "No rush. Let's ease into the basics.",
    "Let's ground ourselves with something familiar."
  ],
  bored: [
    "Brain needs fuel! Try a randomized topic.",
    "Let's break the pattern. Switch your mood?",
    "Boredom detected. Initiating curiosity sequence..."
  ],
  unmotivated: [
    "Just 60 seconds. You can do anything for a minute.",
    "The first step is the hardest. Let's just click 'Start'.",
    "Don't think about the mountain - just the next step."
  ],
  curious: [
    "Rabbit hole found! Want to see where this leads?",
    "Questions lead to mastery. What's on your mind?",
    "The universe is calling. Let's investigate."
  ]
};

export function useNeuralInsights() {
  const { mood } = useMood();
  const [activeInsight, setActiveInsight] = useState<string | null>(null);
  const [isIdle, setIsIdle] = useState(false);

  const triggerRandomInsight = useCallback(() => {
    const options = insightMessages[mood] || insightMessages.focused;
    const random = options[Math.floor(Math.random() * options.length)];
    setActiveInsight(random);
  }, [mood]);

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout>;

    const resetIdle = () => {
      setIsIdle(false);
      setActiveInsight(null);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        setIsIdle(true);
        triggerRandomInsight();
      }, IDLE_TIMEOUT);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetIdle, { passive: true }));
    
    resetIdle();

    return () => {
      clearTimeout(idleTimer);
      events.forEach(event => window.removeEventListener(event, resetIdle));
    };
  }, [triggerRandomInsight]);

  return { activeInsight, isIdle, clearInsight: () => setActiveInsight(null) };
}


