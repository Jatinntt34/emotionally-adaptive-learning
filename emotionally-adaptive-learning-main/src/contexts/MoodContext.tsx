import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export type MoodType = 'energetic' | 'calm' | 'focused' | 'creative' | 'motivated' | 'sad' | 'anxious' | 'bored' | 'unmotivated' | 'curious';

interface MoodColors {
  primary: string;
  gradient: string;
  glow: string;
  emoji: string;
  label: string;
  description: string;
  particleSpeed: number;
  particleCount: number;
  bgPattern: 'grid' | 'dots' | 'waves' | 'none';
  animationIntensity: 'low' | 'medium' | 'high';
  // ── NEW: Adaptive UI Properties ──
  transitionSpeed: number;       // multiplier for animation durations
  heroMessage: string;           // mood-specific hero heading
  heroSubtext: string;           // mood-specific subtitle
  ctaLabel: string;              // primary CTA button text
  ctaSecondaryLabel: string;     // secondary CTA button text
  motivationalQuote: string;     // micro-copy for engagement
  cardElevation: 'subtle' | 'medium' | 'high';
  fontWeight: 'normal' | 'medium' | 'semibold' | 'bold' | 'extrabold';
  borderRadiusClass: string;     // tailwind border-radius class
  letterSpacingClass: string;    // tailwind letter-spacing class
  sectionSpacing: string;        // tailwind padding class for sections
  pageTransition: 'slide' | 'fade' | 'scale' | 'rotate';
}

interface MoodContextType {
  mood: MoodType;
  previousMood: MoodType | null;
  setMood: (mood: MoodType) => void;
  detectedRawEmotion: string | null;
  setDetectedRawEmotion: (emotion: string | null) => void;
  moodColors: MoodColors;
  isTransitioning: boolean;
}

const moodConfig: Record<MoodType, MoodColors> = {
  energetic: {
    primary: 'hsl(25, 95%, 53%)',
    gradient: 'from-orange-500 to-yellow-500',
    glow: 'shadow-orange-500/30',
    emoji: '⚡',
    label: 'Energetic',
    description: 'High energy for intensive learning',
    particleSpeed: 4,
    particleCount: 30,
    bgPattern: 'grid',
    animationIntensity: 'high',
    transitionSpeed: 0.6,
    heroMessage: "Power Up Your Learning",
    heroSubtext: "You're buzzing with energy — let's channel it into mastering something new at full speed!",
    ctaLabel: "Let's Go! ⚡",
    ctaSecondaryLabel: "See What's Hot",
    motivationalQuote: "Energy and persistence conquer all things.",
    cardElevation: 'high',
    fontWeight: 'extrabold',
    borderRadiusClass: 'rounded-2xl',
    letterSpacingClass: 'tracking-tight',
    sectionSpacing: 'py-24',
    pageTransition: 'slide',
  },
  calm: {
    primary: 'hsl(210, 70%, 50%)',
    gradient: 'from-blue-500 to-cyan-500',
    glow: 'shadow-blue-500/30',
    emoji: '🌊',
    label: 'Calm',
    description: 'Relaxed pace for deep understanding',
    particleSpeed: 12,
    particleCount: 10,
    bgPattern: 'waves',
    animationIntensity: 'low',
    transitionSpeed: 1.5,
    heroMessage: "Learn at Your Own Pace",
    heroSubtext: "Take a deep breath. We'll guide you through knowledge gently, one step at a time.",
    ctaLabel: "Begin Gently",
    ctaSecondaryLabel: "Browse Peacefully",
    motivationalQuote: "In the calm waters of the mind, great ideas surface.",
    cardElevation: 'subtle',
    fontWeight: 'normal',
    borderRadiusClass: 'rounded-3xl',
    letterSpacingClass: 'tracking-wide',
    sectionSpacing: 'py-32',
    pageTransition: 'fade',
  },
  focused: {
    primary: 'hsl(142, 70%, 45%)',
    gradient: 'from-green-500 to-emerald-500',
    glow: 'shadow-green-500/30',
    emoji: '🎯',
    label: 'Focused',
    description: 'Concentrated on specific goals',
    particleSpeed: 8,
    particleCount: 15,
    bgPattern: 'grid',
    animationIntensity: 'medium',
    transitionSpeed: 0.8,
    heroMessage: "Zero Distractions. Pure Learning.",
    heroSubtext: "Your focus is razor-sharp. Let's make every second count with targeted content.",
    ctaLabel: "Dive Deep →",
    ctaSecondaryLabel: "View Roadmap",
    motivationalQuote: "The successful warrior is the average person, with laser-like focus.",
    cardElevation: 'medium',
    fontWeight: 'semibold',
    borderRadiusClass: 'rounded-xl',
    letterSpacingClass: 'tracking-tight',
    sectionSpacing: 'py-24',
    pageTransition: 'slide',
  },
  creative: {
    primary: 'hsl(280, 70%, 55%)',
    gradient: 'from-purple-500 to-pink-500',
    glow: 'shadow-purple-500/30',
    emoji: '✨',
    label: 'Creative',
    description: 'Exploring and experimenting',
    particleSpeed: 6,
    particleCount: 25,
    bgPattern: 'dots',
    animationIntensity: 'high',
    transitionSpeed: 0.9,
    heroMessage: "Imagine. Create. Learn.",
    heroSubtext: "Your creative mind is alive — explore unconventional paths and discover hidden connections.",
    ctaLabel: "Start Exploring ✨",
    ctaSecondaryLabel: "Get Inspired",
    motivationalQuote: "Creativity is intelligence having fun.",
    cardElevation: 'high',
    fontWeight: 'bold',
    borderRadiusClass: 'rounded-3xl',
    letterSpacingClass: 'tracking-normal',
    sectionSpacing: 'py-28',
    pageTransition: 'rotate',
  },
  motivated: {
    primary: 'hsl(340, 80%, 55%)',
    gradient: 'from-rose-500 to-pink-500',
    glow: 'shadow-rose-500/30',
    emoji: '🚀',
    label: 'Motivated',
    description: 'Ready to achieve great things',
    particleSpeed: 5,
    particleCount: 25,
    bgPattern: 'grid',
    animationIntensity: 'high',
    transitionSpeed: 0.5,
    heroMessage: "Let's Crush It Today! 🚀",
    heroSubtext: "You're on fire! This is the perfect moment to tackle challenging content and level up.",
    ctaLabel: "Launch Now 🚀",
    ctaSecondaryLabel: "See Challenges",
    motivationalQuote: "The only limit is the one you set yourself.",
    cardElevation: 'high',
    fontWeight: 'extrabold',
    borderRadiusClass: 'rounded-2xl',
    letterSpacingClass: 'tracking-tight',
    sectionSpacing: 'py-24',
    pageTransition: 'scale',
  },
  sad: {
    primary: 'hsl(220, 40%, 40%)',
    gradient: 'from-slate-500 to-blue-800',
    glow: 'shadow-slate-500/20',
    emoji: '😔',
    label: 'Sad',
    description: 'Gentle content to lift your spirits',
    particleSpeed: 16,
    particleCount: 6,
    bgPattern: 'waves',
    animationIntensity: 'low',
    transitionSpeed: 1.8,
    heroMessage: "It's Okay. Let's Learn Together.",
    heroSubtext: "Some days are tough. We'll keep things light and supportive — no pressure, just progress.",
    ctaLabel: "Start Small 💙",
    ctaSecondaryLabel: "Browse Gently",
    motivationalQuote: "Every accomplishment starts with the decision to try.",
    cardElevation: 'subtle',
    fontWeight: 'normal',
    borderRadiusClass: 'rounded-3xl',
    letterSpacingClass: 'tracking-normal',
    sectionSpacing: 'py-32',
    pageTransition: 'fade',
  },
  anxious: {
    primary: 'hsl(45, 90%, 50%)',
    gradient: 'from-amber-400 to-yellow-600',
    glow: 'shadow-amber-500/30',
    emoji: '😰',
    label: 'Anxious',
    description: 'Calming exercises before learning',
    particleSpeed: 3,
    particleCount: 35,
    bgPattern: 'dots',
    animationIntensity: 'high',
    transitionSpeed: 1.3,
    heroMessage: "Breathe. You've Got This.",
    heroSubtext: "Let's ease into learning with calming content. Take your time — there's no rush.",
    ctaLabel: "Begin Calmly 🌿",
    ctaSecondaryLabel: "Take a Breath",
    motivationalQuote: "You are braver than you believe, stronger than you seem.",
    cardElevation: 'subtle',
    fontWeight: 'medium',
    borderRadiusClass: 'rounded-3xl',
    letterSpacingClass: 'tracking-wide',
    sectionSpacing: 'py-32',
    pageTransition: 'fade',
  },
  bored: {
    primary: 'hsl(180, 50%, 45%)',
    gradient: 'from-teal-400 to-cyan-600',
    glow: 'shadow-teal-500/25',
    emoji: '😴',
    label: 'Bored',
    description: 'Engaging challenges to spark interest',
    particleSpeed: 14,
    particleCount: 8,
    bgPattern: 'none',
    animationIntensity: 'low',
    transitionSpeed: 0.7,
    heroMessage: "Let's Make This Interesting!",
    heroSubtext: "Boredom is just your brain wanting a challenge. Let's find something that lights you up!",
    ctaLabel: "Surprise Me! 🎲",
    ctaSecondaryLabel: "Show Something Fun",
    motivationalQuote: "The cure for boredom is curiosity.",
    cardElevation: 'medium',
    fontWeight: 'bold',
    borderRadiusClass: 'rounded-2xl',
    letterSpacingClass: 'tracking-normal',
    sectionSpacing: 'py-24',
    pageTransition: 'scale',
  },
  unmotivated: {
    primary: 'hsl(0, 50%, 45%)',
    gradient: 'from-red-800 to-orange-900',
    glow: 'shadow-red-800/20',
    emoji: '😩',
    label: 'Unmotivated',
    description: 'Small wins to build momentum',
    particleSpeed: 18,
    particleCount: 5,
    bgPattern: 'none',
    animationIntensity: 'low',
    transitionSpeed: 1.6,
    heroMessage: "Small Steps. Big Impact.",
    heroSubtext: "Even the longest journey starts with a single step. Let's find a tiny win right now.",
    ctaLabel: "Just One Step 🌱",
    ctaSecondaryLabel: "Something Quick",
    motivationalQuote: "The secret of getting ahead is getting started.",
    cardElevation: 'subtle',
    fontWeight: 'medium',
    borderRadiusClass: 'rounded-3xl',
    letterSpacingClass: 'tracking-normal',
    sectionSpacing: 'py-32',
    pageTransition: 'fade',
  },
  curious: {
    primary: 'hsl(50, 85%, 55%)',
    gradient: 'from-yellow-400 to-amber-500',
    glow: 'shadow-yellow-500/30',
    emoji: '🤔',
    label: 'Curious',
    description: 'Deep-dive exploration mode',
    particleSpeed: 7,
    particleCount: 20,
    bgPattern: 'dots',
    animationIntensity: 'medium',
    transitionSpeed: 0.8,
    heroMessage: "Follow Your Curiosity",
    heroSubtext: "Questions are the engine of learning. Let's explore rabbit holes and discover new ideas.",
    ctaLabel: "Explore Now 🔍",
    ctaSecondaryLabel: "What's New?",
    motivationalQuote: "The important thing is not to stop questioning.",
    cardElevation: 'medium',
    fontWeight: 'semibold',
    borderRadiusClass: 'rounded-2xl',
    letterSpacingClass: 'tracking-normal',
    sectionSpacing: 'py-28',
    pageTransition: 'slide',
  },
};

const allMoodClasses = Object.keys(moodConfig).map(m => `mood-${m}`);

const MoodContext = createContext<MoodContextType | undefined>(undefined);

export function MoodProvider({ children }: { children: ReactNode }) {
  const [mood, setMoodState] = useState<MoodType>('energetic');
  const [previousMood, setPreviousMood] = useState<MoodType | null>(null);
  const [detectedRawEmotion, setDetectedRawEmotion] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const setMood = useCallback((newMood: MoodType) => {
    if (newMood === mood) return;
    setPreviousMood(mood);
    setIsTransitioning(true);
    setMoodState(newMood);
    document.body.classList.remove(...allMoodClasses);
    document.body.classList.add(`mood-${newMood}`);
    // Transition ends after overlay animation
    setTimeout(() => setIsTransitioning(false), 800);
  }, [mood]);

  useEffect(() => {
    document.body.classList.add(`mood-${mood}`);
    return () => {
      document.body.classList.remove(`mood-${mood}`);
    };
  }, []);

  return (
    <MoodContext.Provider value={{ 
      mood, 
      previousMood, 
      setMood, 
      detectedRawEmotion, 
      setDetectedRawEmotion, 
      moodColors: moodConfig[mood], 
      isTransitioning 
    }}>
      {children}
    </MoodContext.Provider>
  );
}

export function useMood() {
  const context = useContext(MoodContext);
  if (context === undefined) {
    throw new Error('useMood must be used within a MoodProvider');
  }
  return context;
}

export { moodConfig };
export type { MoodColors };
