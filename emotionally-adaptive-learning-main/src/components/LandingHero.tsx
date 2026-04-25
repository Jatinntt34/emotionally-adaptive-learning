import { motion, useScroll } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMood } from '@/contexts/MoodContext';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect } from 'react';
import { EmotionCore } from './EmotionCore';
import { cn } from '@/lib/utils';
import { MagneticButton } from '@/components/ui/MagneticButton';
import { Zap, User, LogOut } from 'lucide-react';
import { NeuralIcon } from './ui/NeuralIcon';

// ── Typewriter ──
function TypewriterText({ className }: { className?: string }) {
  const moodWords: Record<string, string[]> = {
    energetic: ['Unlimited Energy', 'Peak Performance', 'Hyper Growth'],
    calm: ['Peaceful Flow', 'Deep Focus', 'Silent Progress'],
    focused: ['Laser Clarity', 'Mindful Depth', 'Pure Logic'],
    creative: ['Infinite Vision', 'Boundless Ideas', 'Artful Learning'],
    motivated: ['Unyielding Drive', 'Daily Victory', 'Goal Mastery'],
    sad: ['Healing Peace', 'Gentle Support', 'Quiet Resilience'],
    anxious: ['Safe Harbor', 'Calm Rhythms', 'Mindful Ease'],
    bored: ['Neon Sparks', 'Hidden Wonders', 'Curious Turns'],
    unmotivated: ['Tiny Wins', 'Small Steps', 'Gentle Momentum'],
    curious: ['Secret Paths', 'Deep Questions', 'Infinite "Why"'],
  };
  const { mood } = useMood();
  const texts = moodWords[mood] || moodWords.energetic;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const current = texts[currentIndex];
    if (!current) return;
    const timeout = setTimeout(() => {
      if (!isDeleting) {
        setDisplayed(current.slice(0, displayed.length + 1));
        if (displayed.length === current.length) setTimeout(() => setIsDeleting(true), 3000);
      } else {
        setDisplayed(current.slice(0, displayed.length - 1));
        if (displayed.length === 0) { setIsDeleting(false); setCurrentIndex((p) => (p + 1) % texts.length); }
      }
    }, isDeleting ? 30 : 60);
    return () => clearTimeout(timeout);
  }, [displayed, isDeleting, currentIndex, texts]);

  return (
    <span className={className}>
      {displayed}
      <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity }}
        className="inline-block w-[4px] h-[0.9em] bg-primary ml-2 align-middle rounded-full" />
    </span>
  );
}

// ── Living Canvas Background ──
function AnimatedLivingCanvas({ primaryColor }: { primaryColor: string }) {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      <motion.div
        animate={{ scale: [1, 1.15, 1], rotate: [0, 60, 0], x: ['-5%', '5%', '-5%'], y: ['-5%', '5%', '-5%'] }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        className="absolute top-[-20%] left-[-20%] w-[140%] h-[140%] opacity-30 blur-[140px]"
        style={{ background: `radial-gradient(circle at 30% 30%, ${primaryColor}, transparent 50%), radial-gradient(circle at 70% 70%, ${primaryColor}, transparent 50%)` }}
      />
      <motion.div
        animate={{ scale: [1.1, 1, 1.1], rotate: [0, -45, 0], x: ['10%', '-10%', '10%'], y: ['5%', '-5%', '5%'] }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%] opacity-15 blur-[160px]"
        style={{ background: `radial-gradient(circle at 60% 40%, rgba(124, 77, 255, 0.4), transparent 60%)` }}
      />
      <div className="absolute inset-0 noise-overlay opacity-20 mix-blend-overlay" />
    </div>
  );
}

export function LandingHero() {
  const navigate = useNavigate();
  const { moodColors, mood } = useMood();
  const { user, signOut } = useAuth();

  const [navScrolled, setNavScrolled] = useState(false);
  const { scrollY } = useScroll();
  useEffect(() => {
    return scrollY.on('change', (v) => setNavScrolled(v > 80));
  }, [scrollY]);

  return (
    <div className="relative min-h-screen font-sans flex flex-col items-center justify-center overflow-hidden">
      {/* Background Layer */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-background" />
        <AnimatedLivingCanvas primaryColor={moodColors.primary} />
      </div>

      {/* Hero Content - Stable and Centered */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 max-w-5xl mx-auto py-20">
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }} 
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: "easeOut" }} 
          className="mb-10"
        >
          <EmotionCore />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.3 }}
          className="inline-block px-5 py-2 rounded-full bg-white/5 border border-white/10 text-primary text-[10px] sm:text-xs font-mono uppercase tracking-[0.3em] mb-10"
        >
          Neural Sync: {mood.toUpperCase()} MODE ACTIVE
        </motion.div>

        <h1 className="font-display text-7xl md:text-[8rem] font-black mb-8 leading-[0.9] tracking-tighter">
          THE ART OF <br />
          <span className={`bg-gradient-to-r ${moodColors.gradient} bg-clip-text text-transparent animate-gradient-liquid`}>FOCUS</span>
        </h1>

        <div className="h-10 mb-8 font-black">
          <TypewriterText className="font-mono text-lg md:text-xl text-white/40 tracking-[0.2em] uppercase" />
        </div>

        <p className="text-xl md:text-2xl text-white/40 max-w-3xl mx-auto leading-relaxed font-light mb-16">
          Affex is a living environment where your neural state dictates the rhythm of learning. 
          The architecture of focus, redefined by your emotion.
        </p>

        <motion.div 
          animate={{ y: [0, 15, 0], opacity: [0.3, 0.6, 0.3] }} 
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="hero-scroll-indicator absolute bottom-10 flex flex-col items-center gap-4"
        >
          <span className="text-[10px] font-mono tracking-[0.5em] uppercase text-white/50">Initiate Scroll</span>
          <div className="w-px h-16 bg-gradient-to-b from-primary via-white/10 to-transparent" />
        </motion.div>
      </div>

      {/* Premium Navbar */}
      <nav className={cn(
        "fixed top-0 inset-x-0 z-50 flex items-center justify-between px-10 transition-all duration-700",
        navScrolled ? "bg-background/90 backdrop-blur-3xl border-b border-white/5 py-5 shadow-2xl" : "bg-transparent py-8"
      )}>
        <motion.div 
          initial={{ opacity: 0, x: -20 }} 
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-6 cursor-pointer group" 
          onClick={() => navigate('/')}
        >
          <NeuralIcon 
            icon={Zap} 
            className="w-12 h-12" 
            iconClassName="w-6 h-6"
            gradient={moodColors.gradient}
          />
          <div className="flex flex-col justify-center">
            <span className="font-display font-black text-2xl tracking-tighter leading-none uppercase group-hover:text-primary transition-colors">AFFEX</span>
            <span className="text-[9px] font-mono tracking-[0.4em] uppercase text-white/20 mt-1">NEURAL SYSTEMS</span>
          </div>
        </motion.div>
        
        <div className="flex items-center gap-5">
          {user ? (
            <div className="flex items-center gap-4">
              <MagneticButton variant="ghost" size="sm" onClick={() => navigate('/progress')} className="text-white/60 hover:text-white h-11 px-5 border border-white/5 hover:border-white/10">
                <User className="w-4 h-4 mr-3" /> DASHBOARD
              </MagneticButton>
              <MagneticButton variant="glass" size="sm" onClick={signOut} className="w-11 h-11 p-0 flex items-center justify-center border border-white/5">
                <LogOut className="w-4 h-4" />
              </MagneticButton>
            </div>
          ) : (
            <MagneticButton variant="mood" size="sm" onClick={() => navigate('/auth')} className="h-11 px-8 font-black tracking-widest text-[10px]">
              INITIALIZE ACCESS
            </MagneticButton>
          )}
        </div>
      </nav>
    </div>
  );
}


