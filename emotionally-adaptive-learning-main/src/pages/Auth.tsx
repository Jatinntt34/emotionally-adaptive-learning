import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useMood } from '@/contexts/MoodContext';
import { Brain, Mail, Lock, User, ArrowRight, Sparkles, Eye, EyeOff, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { MagneticButton } from '@/components/ui/MagneticButton';
import { TiltCard } from '@/components/ui/TiltCard';
import { RevealSection } from '@/components/ui/RevealSection';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, signUp } = useAuth();
  const { moodColors, mood } = useMood();
  const navigate = useNavigate();
  const location = useLocation();

  // Read return-to state from auth gate modal
  const returnTo = (location.state as any)?.returnTo || '/';
  const savedTopic = (location.state as any)?.topic || '';

  // Mouse parallax
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothX = useSpring(mouseX, { stiffness: 40, damping: 30 });
  const smoothY = useSpring(mouseY, { stiffness: 40, damping: 30 });
  const blobX = useTransform(smoothX, [-1, 1], [-40, 40]);
  const blobY = useTransform(smoothY, [-1, 1], [-30, 30]);
  const blob2X = useTransform(smoothX, [-1, 1], [25, -25]);
  const blob2Y = useTransform(smoothY, [-1, 1], [20, -20]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      mouseX.set((e.clientX / window.innerWidth - 0.5) * 2);
      mouseY.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, [mouseX, mouseY]);

  // Mood-adaptive welcome text
  const welcomeTexts: Record<string, string> = {
    energetic: 'Ready to power up?',
    calm: 'Welcome to your peaceful space',
    focused: 'Lock in and learn',
    creative: 'Your creative journey starts here',
    motivated: 'Let\'s crush it today!',
    sad: 'We\'re glad you\'re here',
    anxious: 'Take a breath - you belong here',
    bored: 'Something exciting awaits!',
    unmotivated: 'One small step makes a difference',
    curious: 'Discover something new today',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { error } = await signIn(email.trim(), password.trim());
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Welcome back!');
        navigate(returnTo, { state: savedTopic ? { initialTopic: savedTopic } : undefined });
      }
    } else {
      const { error } = await signUp(email.trim(), password.trim(), displayName.trim());
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Account created successfully!');
        navigate(returnTo, { state: savedTopic ? { initialTopic: savedTopic } : undefined });
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center py-20">
      {/* Mouse-Tracking Background Aura */}
      <div className="absolute inset-0 overflow-hidden noise-overlay pointer-events-none">
        <motion.div
          className={`absolute top-0 left-0 w-full h-full bg-gradient-to-br ${moodColors.gradient} opacity-[0.03] transition-colors duration-1000`}
        />
        <motion.div
          className={`absolute top-1/4 left-1/3 w-[600px] h-[600px] bg-gradient-to-r ${moodColors.gradient} rounded-full blur-[140px] transition-colors duration-1000`}
          style={{ x: blobX, y: blobY }}
          animate={{ opacity: [0.05, 0.15, 0.05], scale: [1, 1.2, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className={`absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-gradient-to-r ${moodColors.gradient} rounded-full blur-[120px] transition-colors duration-1000`}
          style={{ x: blob2X, y: blob2Y }}
          animate={{ opacity: [0.03, 0.1, 0.03] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="relative z-10 w-full max-w-xl px-6">
        {/* Back to home float */}
        <div className="absolute -top-16 left-6">
          <MagneticButton variant="ghost" size="sm" onClick={() => navigate('/')} className="text-white/30 hover:text-white gap-2 font-mono text-[10px] uppercase tracking-widest h-10 px-4 rounded-xl">
            <ChevronLeft className="w-4 h-4" />
            Neutral Entry
          </MagneticButton>
        </div>

        {/* Logo and Greeting */}
        <RevealSection className="text-center mb-12">
          <motion.div
            className={`w-24 h-24 mx-auto rounded-[2.5rem] bg-gradient-to-br ${moodColors.gradient} flex items-center justify-center mb-8 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.5)] relative group overflow-hidden`}
            animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            whileHover={{ scale: 1.1, rotate: 0 }}
          >
            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Brain className="w-12 h-12 text-foreground relative z-10" />
          </motion.div>
          <h1 className="font-display text-5xl font-black tracking-tighter mb-4">
            <span className={`bg-gradient-to-r ${moodColors.gradient} bg-clip-text text-transparent`}>
              AFFEX
            </span>
            <span className="text-white ml-2 italic">PORTAL</span>
          </h1>
          <p className="text-white/40 font-light text-lg tracking-tight italic">
            {welcomeTexts[mood] || 'Adaptive learning that understands you'}
          </p>
        </RevealSection>

        {/* Auth Container */}
        <RevealSection delay={0.2}>
          <TiltCard className="p-0 border-0 bg-transparent">
            <div className="glass-card rounded-[3rem] p-10 glow-border bg-white/[0.01] border-white/5 relative overflow-hidden">
              {/* Internal Aura */}
              <div className={`absolute -right-40 -bottom-40 w-80 h-80 bg-gradient-to-br ${moodColors.gradient} rounded-full blur-[100px] opacity-10`} />

              {/* Toggle Controls */}
              <div className="flex p-1.5 bg-white/[0.03] backdrop-blur-2xl rounded-2xl mb-10 border border-white/5">
                {['SIGN IN', 'CREATE ACCOUNT'].map((label, i) => (
                  <button
                    key={label}
                    onClick={() => setIsLogin(i === 0)}
                    className={cn(
                      'flex-1 py-3 rounded-xl text-[10px] font-mono tracking-[0.2em] transition-all duration-500 uppercase',
                      (i === 0 ? isLogin : !isLogin)
                        ? `bg-gradient-to-r ${moodColors.gradient} text-foreground shadow-2xl`
                        : 'text-white/20 hover:text-white/60'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <AnimatePresence mode="wait">
                  {!isLogin && (
                    <motion.div
                      key="name"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-2"
                    >
                      <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/20 ml-4">Registry Name</label>
                      <div className="relative group">
                        <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-primary transition-colors" />
                        <Input
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Identify yourself..."
                          className="pl-14 h-14 bg-white/5 border-white/5 rounded-2xl focus:border-primary/40 focus:bg-white/[0.08] transition-all text-sm placeholder:text-white/10"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/20 ml-4">Neural Address</label>
                  <div className="relative group">
                    <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-primary transition-colors" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@neural.link"
                      required
                      className="pl-14 h-14 bg-white/5 border-white/5 rounded-2xl focus:border-primary/40 focus:bg-white/[0.08] transition-all text-sm placeholder:text-white/10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/20 ml-4">Access Cipher</label>
                  <div className="relative group">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-primary transition-colors" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="pl-14 pr-14 h-14 bg-white/5 border-white/5 rounded-2xl focus:border-primary/40 focus:bg-white/[0.08] transition-all text-sm placeholder:text-white/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="pt-4">
                  <MagneticButton
                    type="submit"
                    disabled={loading}
                    variant="mood"
                    size="lg"
                    className="w-full h-16 rounded-[1.5rem] font-bold text-lg group"
                  >
                    {loading ? (
                      <motion.div
                        className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      />
                    ) : (
                      <div className="flex items-center justify-center gap-3">
                        {isLogin ? 'INITIALIZE SESSION' : 'ESTABLISH NEURAL LINK'}
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </div>
                    )}
                  </MagneticButton>
                </div>
              </form>

              {!isLogin && (
                <RevealSection delay={0.5} className="mt-8 flex items-center gap-3 text-[10px] font-mono text-white/30 justify-center uppercase tracking-widest">
                  <Sparkles className="w-3 h-3 text-primary animate-pulse" />
                  <span>Validation link required after initiation</span>
                </RevealSection>
              )}
            </div>
          </TiltCard>
        </RevealSection>

      </div>
    </div>
  );
}


