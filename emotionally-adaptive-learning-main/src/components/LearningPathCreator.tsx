import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMood, MoodType, moodConfig } from '@/contexts/MoodContext';
import {  Book, ArrowLeft, ArrowRight, Search, 
  Settings2, Layout, Video, FileText, LayoutList, 
  Camera, CameraOff, Mic, MicOff, ScanFace, Loader2,
  Sparkles, Gauge, Target, Zap, Orbit, LucideIcon
} from 'lucide-react';
import { LivingIcon } from './LivingIcon';
import { NeuralIcon } from './ui/NeuralIcon';
import { useNeuralTracking } from '@/hooks/useNeuralTracking';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { MagneticButton } from './ui/MagneticButton';
import { TiltCard } from './ui/TiltCard';
import { RevealSection } from './ui/RevealSection';
import gsap from 'gsap';

type ContentFormat = 'videos' | 'articles' | 'mixed';

interface LearningPathData {
  topic: string;
  mood: MoodType;
  speed: string;
  format: ContentFormat;
  goal: string;
}

const steps = [
  { id: 'topic', title: 'Topic', icon: Book },
  { id: 'mood', title: 'Emotional State', icon: Settings2 },
  { id: 'pace', title: 'Pace & Goal', icon: Gauge },
  { id: 'format', title: 'Format', icon: LayoutList },
];

const formatOptions = [
  { value: 'videos', label: 'Videos', desc: 'Visual learning content', icon: Video },
  { value: 'articles', label: 'Articles', desc: 'Text-based learning', icon: FileText },
  { value: 'mixed', label: 'Mixed', desc: 'Best of both worlds', icon: Sparkles },
];

const speedOptions: { value: string; label: string; desc: string; icon: LucideIcon }[] = [
  { value: 'fast', label: 'Fast Track', desc: 'Intensive, fewer but denser modules', icon: Zap },
  { value: 'moderate', label: 'Balanced', desc: 'Well-paced depth and breadth', icon: Target },
  { value: 'slow', label: 'Deep Dive', desc: 'Slow, thorough, more modules', icon: Orbit },
];

function FloatingParticles({ mood }: { mood: MoodType }) {
  const config = moodConfig[mood];
  const particleColorMap: Record<MoodType, string> = {
    energetic: 'bg-orange-400', calm: 'bg-blue-400', focused: 'bg-green-400',
    creative: 'bg-purple-400', motivated: 'bg-rose-400', sad: 'bg-slate-400',
    anxious: 'bg-amber-400', bored: 'bg-teal-300', unmotivated: 'bg-red-800',
    curious: 'bg-yellow-400',
  };

  const particleShape = ['sad', 'unmotivated', 'bored'].includes(mood) 
    ? 'rounded-full opacity-20' 
    : ['anxious'].includes(mood) ? 'rounded-sm opacity-50 rotate-45'
    : 'rounded-full opacity-40';

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: config.particleCount }).map((_, i) => (
        <motion.div
          key={`${mood}-${i}`}
          className={cn('absolute w-1.5 h-1.5', particleShape, particleColorMap[mood])}
          initial={{
            x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1000),
            y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 800),
            scale: Math.random() * 0.5 + 0.5,
          }}
          animate={{
            x: [Math.random() * 400, Math.random() * 800, Math.random() * 400],
            y: [Math.random() * 300, Math.random() * 600, Math.random() * 300],
            opacity: [0.2, 0.5, 0.2],
            scale: [0.8, 1.2, 0.8],
          }}
          transition={{ duration: config.particleSpeed + Math.random() * 10, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

function MoodBackground({ mood }: { mood: MoodType }) {
  const config = moodConfig[mood];
  if (config.bgPattern === 'grid') return <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />;
  if (config.bgPattern === 'dots') return <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:32px_32px]" />;
  return null;
}

export function LearningPathCreator() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mood, setMood, moodColors, setDetectedRawEmotion } = useMood();
  
  const currentMoodColors = moodColors || moodConfig.energetic;
  const [currentStep, setCurrentStep] = useState(0);

  // Pre-fill topic from home page search if available
  const incomingTopic = (location.state as any)?.initialTopic || '';

  const [data, setData] = useState<LearningPathData>({
    topic: incomingTopic, mood: mood, speed: 'moderate', format: 'mixed', goal: '',
  });
  const [isGenerating, setIsGenerating] = useState(false);

  const { 
    isCamActive, setIsCamActive, isMicActive, setIsMicActive, 
    currentEmotion, confidence, voiceEmotion, voiceConfidence, 
    timerState, timeLeft, videoRef, canvasRef, audioLevel 
  } = useNeuralTracking();

  const handleMoodLocked = useCallback((winnerMapped: MoodType, winnerRaw: string) => {
    setMood(winnerMapped);
    setData(prev => ({ ...prev, mood: winnerMapped }));
    setDetectedRawEmotion(winnerRaw);
    toast.success(`Mood synchronized: ${winnerMapped}`);
  }, [setMood, setDetectedRawEmotion]);

  const toggleCamera = () => setIsCamActive(!isCamActive);
  const toggleMic = () => setIsMicActive(!isMicActive);

  const canProceed = () => {
    if (currentStep === 0) return data.topic.length > 2;
    return true;
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) setCurrentStep(currentStep + 1);
    else handleGenerate();
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
    else navigate('/');
  };

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      navigate('/learning-path', { 
        state: { 
          ...data, 
          goal: data.goal || `Learn ${data.topic}`,
          emotionSource: isCamActive ? 'face' : isMicActive ? 'voice' : null,
          detectedConfidence: confidence || voiceConfidence || null,
        } 
      });
    }, 2000);
  };

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothX = useSpring(mouseX, { stiffness: 40, damping: 30 });
  const smoothY = useSpring(mouseY, { stiffness: 40, damping: 30 });
  const blob1X = useTransform(smoothX, [-1, 1], [-30, 30]);
  const blob1Y = useTransform(smoothY, [-1, 1], [-25, 25]);

  // GSAP stagger refs for card grids
  const speedGridRef = useRef<HTMLDivElement>(null);
  const formatGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      mouseX.set((e.clientX / window.innerWidth - 0.5) * 2);
      mouseY.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  // GSAP stagger animation for speed cards
  useEffect(() => {
    if (currentStep === 2 && speedGridRef.current) {
      const cards = speedGridRef.current.querySelectorAll('.speed-card');
      gsap.fromTo(cards, 
        { y: 40, opacity: 0, scale: 0.92 },
        { y: 0, opacity: 1, scale: 1, duration: 0.7, stagger: 0.12, ease: 'back.out(1.4)', delay: 0.15 }
      );
    }
  }, [currentStep]);

  // GSAP stagger animation for format cards
  useEffect(() => {
    if (currentStep === 3 && formatGridRef.current) {
      const cards = formatGridRef.current.querySelectorAll('.format-card');
      gsap.fromTo(cards, 
        { y: 40, opacity: 0, scale: 0.92 },
        { y: 0, opacity: 1, scale: 1, duration: 0.7, stagger: 0.12, ease: 'back.out(1.4)', delay: 0.15 }
      );
    }
  }, [currentStep]);

  return (
    <div className="min-h-screen bg-background relative overflow-y-auto custom-scrollbar">
      <FloatingParticles mood={data.mood} />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className={`absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-to-r ${currentMoodColors.gradient} rounded-full blur-3xl opacity-20`}
          style={{ x: blob1X, y: blob1Y }}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <MoodBackground mood={data.mood} />
      </div>

      <div className="relative z-10 container mx-auto px-6 py-12 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <Button variant="ghost" onClick={handleBack} className="gap-2 backdrop-blur-md bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div className="flex items-center gap-3">
            {steps.map((_, index) => (
              <motion.div
                key={index}
                className={cn(
                  'w-2 h-2 rounded-full transition-all duration-500',
                  index === currentStep ? `w-8 bg-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]` : 'bg-white/10'
                )}
              />
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="max-w-4xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 1.02, filter: 'blur(10px)' }}
              transition={{ duration: 0.5, ease: 'circOut' }}
              className="glass-card rounded-[2.5rem] p-8 md:p-14 border border-white/5 bg-black/20 backdrop-blur-3xl shadow-2xl overflow-hidden"
            >
              <div className="relative z-10">
                {currentStep === 0 && (
                  <RevealSection className="space-y-12">
                    <div className="text-center">
                      <motion.div
                        className="mx-auto mb-8"
                        animate={{ y: [0, -10, 0] }}
                        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <NeuralIcon icon={Sparkles} className="w-24 h-24" iconClassName="w-10 h-10" gradient={currentMoodColors.gradient} />
                      </motion.div>
                      <h2 className="font-display text-5xl font-bold mb-4 tracking-tight">Master your next goal.</h2>
                      <p className="text-muted-foreground text-xl max-w-lg mx-auto">Craft a personalized learning path tailored to your current emotional resonance.</p>
                    </div>
                    
                    <div className="max-w-xl mx-auto relative group">
                      <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 to-purple-500/30 rounded-[2.5rem] blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-700" />
                      <div className="relative">
                        <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-6 h-6 text-white/30" />
                        <Input
                          type="text"
                          placeholder="What do you want to learn today?"
                          className="h-24 pl-16 pr-8 text-2xl rounded-[2.5rem] bg-white/5 border-white/10 focus:border-primary/50 focus:bg-white/10 transition-all duration-500 placeholder:text-white/20"
                          value={data.topic}
                          onChange={(e) => setData({ ...data, topic: e.target.value })}
                          onKeyDown={(e) => e.key === 'Enter' && canProceed() && handleNext()}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-center gap-3">
                      {['Generative AI', 'Deep Meditation', 'Neuroscience', 'Creative Writing'].map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setData({ ...data, topic: tag })}
                          className="px-5 py-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-primary/20 hover:border-primary/40 transition-all text-sm font-medium"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </RevealSection>
                )}

                {currentStep === 1 && (
                  <RevealSection className="space-y-10">
                    <div className="text-center">
                      <h2 className="font-display text-4xl font-bold mb-3">Sync Your State</h2>
                      <p className="text-muted-foreground text-lg">Your emotional resonance dictates the rhythm of discovery.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                      {/* Neural Interface Preview */}
                      <div className="glass-card rounded-3xl p-6 border-white/10 bg-black/40">
                        <div className="flex items-center justify-between mb-6">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-primary font-mono">Neural Interface</span>
                          <div className="flex gap-2">
                            <button 
                              onClick={toggleCamera}
                              className={cn("p-3 rounded-xl transition-all", isCamActive ? "bg-primary/20 text-primary" : "bg-white/5 text-white/40")}
                            >
                              {isCamActive ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
                            </button>
                            <button 
                              onClick={toggleMic}
                              className={cn("p-3 rounded-xl transition-all", isMicActive ? "bg-red-500/20 text-red-500" : "bg-white/5 text-white/40")}
                            >
                              {isMicActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                            </button>
                          </div>
                        </div>

                        <div className="relative aspect-video rounded-2xl overflow-hidden bg-black/60 border border-white/5 mb-4 group">
                          {isCamActive ? (
                            <>
                              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform -scale-x-100" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/20 backdrop-blur-md border border-primary/20">
                                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity }} className="w-2 h-2 rounded-full bg-primary" />
                                <span className="text-[10px] font-bold text-primary font-mono">{timerState}</span>
                              </div>
                            </>
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20">
                              <ScanFace className="w-12 h-12 mb-3" />
                              <span className="text-xs font-medium">Activate sensors for neural sync</span>
                            </div>
                          )}

                          {isMicActive && (
                            <div className="absolute bottom-4 left-4 right-4 h-1 flex items-end gap-0.5 px-2">
                              {Array.from({ length: 40 }).map((_, i) => (
                                <motion.div 
                                  key={i}
                                  className="flex-1 bg-red-500/60 rounded-t-full"
                                  animate={{ height: `${20 + Math.random() * 80 * audioLevel}%` }}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {(isCamActive || isMicActive) && (
                          <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                            <div className="flex flex-col">
                              <span className="text-[9px] uppercase tracking-tighter text-white/40 font-mono">Detected Resonance</span>
                              <span className="text-sm font-bold text-primary capitalize">{currentEmotion || voiceEmotion}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] uppercase tracking-tighter text-white/40 font-mono">Confidence</span>
                              <span className="text-sm font-bold block">{Math.round((confidence || voiceConfidence) * 100)}%</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Manual Mood Selection */}
                      <div className="space-y-4">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-white/40 font-mono px-1">Manual Selection</span>
                        <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                          {Object.entries(moodConfig).map(([moodType, config]) => (
                            <button
                              key={moodType}
                              onClick={() => {
                                setMood(moodType as MoodType);
                                setData({ ...data, mood: moodType as MoodType });
                              }}
                              className={cn(
                                "flex items-center gap-3 p-4 rounded-2xl border transition-all text-left group",
                                data.mood === moodType 
                                  ? `bg-gradient-to-br ${config.gradient} border-transparent shadow-lg text-white` 
                                  : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20 text-white/60"
                              )}
                            >
                               <LivingIcon iconName={config.iconName} size="sm" isInteractive={false} />
                              <span className="text-xs font-bold capitalize">{moodType}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </RevealSection>
                )}

                {currentStep === 2 && (
                  <RevealSection className="space-y-12">
                    <div className="text-center">
                      <h2 className="font-display text-4xl font-bold mb-4 tracking-tight">Pace & Goal</h2>
                      <p className="text-muted-foreground text-lg">Set your learning speed and define what you want to achieve.</p>
                    </div>
                    <div ref={speedGridRef} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {speedOptions.map((option) => (
                        <TiltCard key={option.value}>
                          <button
                            onClick={() => setData({ ...data, speed: option.value })}
                            className={cn(
                              'speed-card w-full p-8 rounded-[2.5rem] border flex flex-col items-center gap-6 transition-all duration-500 group relative overflow-hidden',
                              data.speed === option.value
                                ? `bg-gradient-to-br ${currentMoodColors.gradient} border-transparent shadow-2xl`
                                : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20 text-white/60'
                            )}
                          >
                            <NeuralIcon icon={option.icon} className="w-16 h-16" iconClassName="w-7 h-7" gradient={data.speed === option.value ? 'from-white/20 to-white/5' : currentMoodColors.gradient} />
                            <div className="text-center">
                              <span className="block font-bold text-xl mb-2 text-white">{option.label}</span>
                              <span className="text-sm opacity-60 leading-relaxed">{option.desc}</span>
                            </div>
                            {data.speed === option.value && (
                              <motion.div layoutId="speedActive" className="absolute inset-0 bg-white/10 mix-blend-overlay" />
                            )}
                          </button>
                        </TiltCard>
                      ))}
                    </div>
                    <div className="mt-8">
                      <label className="block text-sm font-mono uppercase tracking-widest text-white/40 mb-3">
                        Learning Goal <span className="text-white/20">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={data.goal}
                        onChange={(e) => setData({ ...data, goal: e.target.value })}
                        placeholder={`e.g., "Understand the fundamentals of ${data.topic || 'this topic'}" or "Prepare for an exam"`}
                        className="w-full px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-white/30 focus:bg-white/[0.07] transition-all text-lg"
                      />
                    </div>
                  </RevealSection>
                )}

                {currentStep === 3 && (
                  <RevealSection className="space-y-12">
                    <div className="text-center">
                      <h2 className="font-display text-4xl font-bold mb-4 tracking-tight">Medium Selection</h2>
                      <p className="text-muted-foreground text-lg">Pick the flow that fits your current energy levels.</p>
                    </div>
                    <div ref={formatGridRef} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {formatOptions.map((option) => (
                        <TiltCard key={option.value}>
                          <button
                            onClick={() => setData({ ...data, format: option.value as ContentFormat })}
                            className={cn(
                              'format-card w-full p-8 rounded-[2.5rem] border flex flex-col items-center gap-6 transition-all duration-500 group relative overflow-hidden',
                              data.format === option.value
                                ? `bg-gradient-to-br ${currentMoodColors.gradient} border-transparent shadow-2xl`
                                : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20 text-white/60'
                            )}
                          >
                            <NeuralIcon icon={option.icon} className="w-16 h-16" iconClassName="w-7 h-7" gradient={data.format === option.value ? 'from-white/20 to-white/5' : currentMoodColors.gradient} />
                            <div className="text-center">
                              <span className="block font-bold text-xl mb-2 text-white">{option.label}</span>
                              <span className="text-sm opacity-60 leading-relaxed">{option.desc}</span>
                            </div>
                            {data.format === option.value && (
                              <motion.div layoutId="formatActive" className="absolute inset-0 bg-white/10 mix-blend-overlay" />
                            )}
                          </button>
                        </TiltCard>
                      ))}
                    </div>
                  </RevealSection>
                )}

                {/* Footer Navigation */}
                <div className="flex justify-between items-center mt-12 pt-10 border-t border-white/10">
                  <MagneticButton variant="ghost" onClick={handleBack} className="gap-2 text-white/50 hover:text-white">
                    <ArrowLeft className="w-5 h-5" /> Previous
                  </MagneticButton>
                  
                  <MagneticButton 
                    onClick={handleNext}
                    disabled={!canProceed() || isGenerating}
                    className={cn(
                      "min-w-[220px] h-16 rounded-2xl font-bold text-lg shadow-2xl transition-all",
                      canProceed() ? `bg-gradient-to-r ${currentMoodColors.gradient} text-white` : "bg-white/10 text-white/20"
                    )}
                  >
                    {isGenerating ? (
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Synchronizing...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-6">
                        <span>{currentStep === steps.length - 1 ? 'Unlock Path' : 'Synchronize'}</span>
                        <ArrowRight className="w-5 h-5" />
                      </div>
                    )}
                  </MagneticButton>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}


