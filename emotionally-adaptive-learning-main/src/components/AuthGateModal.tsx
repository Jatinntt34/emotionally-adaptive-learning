import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMood } from '@/contexts/MoodContext';
import { Brain, ArrowRight, UserCircle, X, Sparkles, Shield } from 'lucide-react';
import { MagneticButton } from './ui/MagneticButton';
import { cn } from '@/lib/utils';

interface AuthGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  topic: string;
}

export function AuthGateModal({ isOpen, onClose, topic }: AuthGateModalProps) {
  const navigate = useNavigate();
  const { moodColors } = useMood();

  const handleLogin = () => {
    onClose();
    navigate('/auth', { state: { returnTo: '/create-path', topic } });
  };

  const handleGuest = () => {
    onClose();
    navigate('/create-path', { state: { initialTopic: topic } });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] flex items-center justify-center px-6"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-2xl"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30, filter: 'blur(12px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.95, y: 20, filter: 'blur(8px)' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-lg z-10"
          >
            {/* Glow effect behind the card */}
            <div 
              className={cn(
                "absolute -inset-4 rounded-[4rem] blur-[80px] opacity-20 transition-colors duration-1000",
                `bg-gradient-to-br ${moodColors.gradient}`
              )} 
            />

            <div className="relative rounded-[3rem] border border-white/10 bg-white/[0.03] backdrop-blur-3xl overflow-hidden shadow-2xl">
              {/* Top accent line */}
              <div className={cn("h-[2px] bg-gradient-to-r", moodColors.gradient)} />

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-6 right-6 p-2 rounded-full bg-white/5 border border-white/10 text-white/30 hover:text-white hover:bg-white/10 transition-all z-20"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="p-10 md:p-14">
                {/* Icon */}
                <motion.div
                  className={cn(
                    "w-20 h-20 mx-auto rounded-[1.8rem] bg-gradient-to-br flex items-center justify-center mb-8 shadow-2xl",
                    moodColors.gradient
                  )}
                  animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Brain className="w-10 h-10 text-white" />
                </motion.div>

                {/* Heading */}
                <h2 className="font-display text-3xl md:text-4xl font-black text-center tracking-tight mb-3">
                  <span className={cn("bg-gradient-to-r bg-clip-text text-transparent", moodColors.gradient)}>
                    Neural Access
                  </span>
                </h2>
                <p className="text-center text-white/40 text-sm leading-relaxed mb-4 max-w-sm mx-auto">
                  Sign in to save your learning progress and unlock personalized insights across sessions.
                </p>

                {/* Topic pill */}
                {topic && (
                  <div className="flex justify-center mb-10">
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-white/50">
                      <Sparkles className="w-3 h-3 text-primary" />
                      <span className="text-white/70 font-medium">{topic}</span>
                    </div>
                  </div>
                )}

                {/* Buttons */}
                <div className="space-y-4">
                  <MagneticButton
                    onClick={handleLogin}
                    variant="mood"
                    className="w-full h-16 rounded-[1.5rem] font-bold text-base group"
                  >
                    <div className="flex items-center justify-center gap-3">
                      <Shield className="w-5 h-5" />
                      Initialize Access
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </MagneticButton>

                  <button
                    onClick={handleGuest}
                    className="w-full h-14 rounded-[1.5rem] border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-all duration-500 text-white/50 hover:text-white font-medium text-sm flex items-center justify-center gap-3 group"
                  >
                    <UserCircle className="w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors" />
                    Continue as Guest
                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </button>
                </div>

                {/* Footer note */}
                <p className="text-center text-[10px] font-mono text-white/20 mt-8 tracking-wider uppercase">
                  Guest progress is saved locally on this device
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


