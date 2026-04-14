import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useMood } from '@/contexts/MoodContext';
import { Brain, Mail, Lock, User, ArrowRight, Sparkles, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

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
    energetic: 'Ready to power up? ⚡',
    calm: 'Welcome to your peaceful space 🌊',
    focused: 'Lock in and learn 🎯',
    creative: 'Your creative journey starts here ✨',
    motivated: 'Let\'s crush it today! 🚀',
    sad: 'We\'re glad you\'re here 💙',
    anxious: 'Take a breath — you belong here 🛡️',
    bored: 'Something exciting awaits! 🎲',
    unmotivated: 'One small step makes a difference 🌱',
    curious: 'Discover something new today 🔍',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Welcome back!');
        navigate('/');
      }
    } else {
      const { error } = await signUp(email, password, displayName);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Account created successfully!');
        navigate('/');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
      {/* Mouse-Tracking Background */}
      <div className="absolute inset-0 overflow-hidden noise-overlay">
        <motion.div
          className={`absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-gradient-to-r ${moodColors.gradient} rounded-full blur-[120px] transition-colors duration-700`}
          style={{ x: blobX, y: blobY }}
          animate={{ opacity: [0.1, 0.2, 0.1], scale: [1, 1.15, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className={`absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-gradient-to-r ${moodColors.gradient} rounded-full blur-[100px] transition-colors duration-700`}
          style={{ x: blob2X, y: blob2Y }}
          animate={{ opacity: [0.06, 0.14, 0.06] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:80px_80px]" />
      </div>

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <motion.div
            className={`w-18 h-18 mx-auto rounded-2xl bg-gradient-to-br ${moodColors.gradient} flex items-center justify-center mb-5 shadow-2xl w-[72px] h-[72px]`}
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Brain className="w-9 h-9 text-foreground" />
          </motion.div>
          <h1 className="font-display text-4xl font-bold">
            <span className={`bg-gradient-to-r ${moodColors.gradient} bg-clip-text text-transparent`}>
              MoodLearn
            </span>
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">{welcomeTexts[mood] || 'Adaptive learning that understands you'}</p>
        </motion.div>

        {/* Auth Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-3xl p-8 glow-border"
        >
          {/* Toggle */}
          <div className="flex rounded-xl bg-muted/50 p-1 mb-8">
            {['Sign In', 'Sign Up'].map((label, i) => (
              <button
                key={label}
                onClick={() => setIsLogin(i === 0)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                  (i === 0 ? isLogin : !isLogin)
                    ? `bg-gradient-to-r ${moodColors.gradient} text-foreground shadow-md`
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  key="name"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <div className="relative group">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Display name"
                      className="pl-11 h-12 bg-secondary/30 border-border/50 rounded-xl focus:border-primary/50 transition-all"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative group">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                required
                className="pl-11 h-12 bg-secondary/30 border-border/50 rounded-xl focus:border-primary/50 transition-all"
              />
            </div>

            <div className="relative group">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                minLength={6}
                className="pl-11 pr-11 h-12 bg-secondary/30 border-border/50 rounded-xl focus:border-primary/50 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className={`w-full bg-gradient-to-r ${moodColors.gradient} hover:opacity-90 text-foreground font-medium h-12 rounded-xl shadow-lg shadow-primary/20 mt-2`}
            >
              {loading ? (
                <motion.div
                  className="w-5 h-5 border-2 border-foreground/30 border-t-foreground rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              ) : (
                <>
                  {isLogin ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          {!isLogin && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-5 flex items-center gap-2 text-xs text-muted-foreground justify-center"
            >
              <Sparkles className="w-3 h-3 text-primary" />
              <span>You'll need to verify your email before signing in</span>
            </motion.div>
          )}
        </motion.div>

        {/* Back to home */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mt-8"
        >
          <button onClick={() => navigate('/')} className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-2">
            ← Back to home
          </button>
        </motion.div>
      </div>
    </div>
  );
}
