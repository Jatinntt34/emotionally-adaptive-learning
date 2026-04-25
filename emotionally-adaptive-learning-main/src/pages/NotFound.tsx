import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Brain, Home, MapPinOff } from "lucide-react";
import { MagneticButton } from "@/components/ui/MagneticButton";
import { RevealSection } from "@/components/ui/RevealSection";
import { useMood } from "@/contexts/MoodContext";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { moodColors } = useMood();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-6">
      {/* Background Aura */}
      <div className="absolute inset-0 overflow-hidden noise-overlay pointer-events-none">
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r ${moodColors.gradient} rounded-full blur-[140px] opacity-[0.05]`} />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      <RevealSection className="relative z-10 w-full max-w-lg text-center">
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className={`w-24 h-24 mx-auto rounded-[2rem] bg-gradient-to-br ${moodColors.gradient} flex items-center justify-center mb-10 shadow-2xl relative group`}
        >
          <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-[2rem]" />
          <MapPinOff className="w-12 h-12 text-foreground relative z-10" />
        </motion.div>

        <h1 className="font-display text-8xl font-black italic tracking-tighter mb-4 opacity-10">404</h1>
        <h2 className="font-display text-4xl font-black italic tracking-tighter mb-6 -mt-16">
          COORDINATES <span className={`bg-gradient-to-r ${moodColors.gradient} bg-clip-text text-transparent`}>LOST</span>
        </h2>
        
        <p className="text-white/40 font-mono text-sm uppercase tracking-[0.3em] mb-12 max-w-sm mx-auto">
          The segment you are attempting to synchronize with does not exist in the neural registry.
        </p>

        <div className="flex justify-center">
          <MagneticButton
            size="lg"
            variant="mood"
            onClick={() => navigate('/')}
            className="h-16 px-10 rounded-2xl font-bold gap-3 shadow-2xl"
          >
            <Home className="w-5 h-5" />
            RETURN TO NEURAL HUB
          </MagneticButton>
        </div>

        <div className="mt-12 flex items-center justify-center gap-3 text-[10px] font-mono text-white/10 uppercase tracking-[0.5em]">
          <Brain className="w-3 h-3" />
          MoodLearn Neural Network
        </div>
      </RevealSection>
    </div>
  );
};

export default NotFound;


