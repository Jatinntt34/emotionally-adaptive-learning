import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useMood, MoodType, moodConfig } from '@/contexts/MoodContext';
import { useNeuralTracking } from '@/hooks/useNeuralTracking';
import { useMoodAudio } from '@/hooks/useMoodAudio';
import { useNeuralInsights } from '@/hooks/useNeuralInsights';
import { 
  Camera, CameraOff, Mic, MicOff, Volume2, VolumeX, 
  Sparkles, ScanFace, Clock, CheckCircle2, ChevronUp,
  ChevronRight, Activity, Orbit, Radio, Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LivingIcon } from './LivingIcon';

export function NeuralDock() {
  const { mood, setMood, moodColors, detectedRawEmotion } = useMood();
  const location = useLocation();
  const navigate = useNavigate();

  const {
    isCamActive, setIsCamActive,
    isMicActive, setIsMicActive,
    currentEmotion, confidence,
    timerState, timeLeft,
    videoRef, canvasRef,
    audioLevel
  } = useNeuralTracking();

  const { isEnabled: isAudioEnabled, toggleAudio } = useMoodAudio();
  const { activeInsight, clearInsight } = useNeuralInsights();
  const [isMoodOpen, setIsMoodOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const moods = Object.entries(moodConfig) as [MoodType, (typeof moodConfig)[MoodType]][];

  // Auto-expand dock when tracking starts
  useEffect(() => {
    if (isCamActive || isMicActive) {
      setIsOpen(true);
    }
  }, [isCamActive, isMicActive]);

  const NEURAL_PROMPTS = [
    "I'm really enjoying this topic!",
    "Can you explain this part again?",
    "I feel ready for the next level.",
    "This concept is a bit challenging.",
    "Show me something more advanced."
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, x: -40 }}
      animate={{ opacity: 1, x: 0 }}
      className="fixed bottom-8 left-10 z-[60] flex flex-col items-start gap-4 w-[calc(100%-3rem)] max-w-sm pointer-events-none sm:left-12"
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: -20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.95 }}
            className="flex flex-col gap-4 w-full pointer-events-none"
          >
            {/* --- NEURAL COMMANDS HUD --- */}
            {isMicActive && location.pathname.includes('/learning-path') && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="pointer-events-auto w-full p-4 rounded-r-[2rem] glass-card border-white/5 bg-black/40 backdrop-blur-lg shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] flex flex-col gap-3 ring-1 ring-white/10"
              >
                <div className="flex items-center gap-2 px-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 font-mono">Neural Commands</span>
                </div>
                
                <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                  {NEURAL_PROMPTS.map((prompt, idx) => (
                    <motion.button
                      key={idx}
                      whileHover={{ x: 6, backgroundColor: "rgba(255,255,255,0.05)" }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        // Action for command
                      }}
                      className="group flex items-center gap-3 text-left text-[11px] py-2.5 px-3 rounded-xl transition-all text-white/60 hover:text-primary font-medium border border-transparent hover:border-primary/20"
                    >
                      <div className="w-1 h-1 rounded-full bg-white/10 group-hover:bg-primary transition-colors" />
                      {prompt}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
            
            {/* --- NEURAL INSIGHTS & TRACKING STACK --- */}
            <div className="flex flex-col items-center gap-3 w-full">
              <AnimatePresence mode="wait">
                {/* Active Tracking Panel */}
                {(isCamActive || isMicActive) && (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="w-full p-4 rounded-r-[2.5rem] glass-card border-white/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] flex items-center gap-4 bg-black/60 backdrop-blur-lg"
                  >
                    {isCamActive && (
                      <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-black/60 border border-white/10 shadow-inner shrink-0">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform -scale-x-100" />
                        <canvas ref={canvasRef} className="hidden" />
                      </div>
                    )}
                    
                    <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono">Neural Interface</span>
                          {isMicActive && (
                            <motion.div 
                              animate={{ scaleY: [1, 1.5, 1] }} 
                              transition={{ repeat: Infinity, duration: 0.5 }}
                              className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" 
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                          {timerState === 'grace' && <><Clock className="w-3 h-3 text-amber-400 animate-pulse"/> Syncing {timeLeft}s</>}
                          {timerState === 'analyzing' && <><ScanFace className="w-3 h-3 text-blue-400 animate-pulse"/> Tracking {timeLeft}s</>}
                          {timerState === 'cooldown' && <><CheckCircle2 className="w-3 h-3 text-green-400"/> Synced Mode</>}
                        </div>
                      </div>
                      
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-display font-bold capitalize text-primary line-clamp-1">
                          {currentEmotion.includes('Initializing') ? currentEmotion : (detectedRawEmotion || currentEmotion)}
                        </span>
                        <span className="text-xs font-mono text-white/20">{Math.round(confidence * 100)}%</span>
                      </div>

                      {/* Transcription HUD */}
                      {isMicActive && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="mt-2 text-[10px] font-mono text-primary/60 italic truncate px-1"
                        >
                          "AI: Listening for your thoughts..."
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Idle Insight Bubble */}
                {activeInsight && !isCamActive && !isMicActive && (
                  <motion.div
                    key="insight"
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    onClick={clearInsight}
                    className="group cursor-pointer w-full p-5 rounded-[2rem] glass-card border-primary/20 bg-primary/5 shadow-2xl flex items-center gap-4 hover:bg-primary/10 transition-all active:scale-[0.98]"
                  >
                    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-gradient-to-br shadow-inner", moodColors.gradient)}>
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-sm font-medium text-foreground leading-relaxed">
                      {activeInsight}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- THE DOCK --- */}
      <motion.div 
        layout
        className="pointer-events-auto flex items-center gap-2"
      >
        {/* Core Trigger Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 relative overflow-hidden group shadow-2xl",
            isOpen ? "bg-primary text-white" : "bg-black/40 backdrop-blur-2xl border border-white/10 text-primary hover:border-primary/50"
          )}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {isOpen ? <ChevronRight className="w-6 h-6" /> : (
            <motion.div
              animate={{ 
                rotate: 360,
                scale: [1, 1.1, 1],
              }}
              transition={{ 
                rotate: { duration: 20, repeat: Infinity, ease: "linear" },
                scale: { duration: 4, repeat: Infinity, ease: "easeInOut" }
              }}
              className="relative flex items-center justify-center"
            >
              <Orbit className="w-6 h-6 absolute opacity-20" />
              <Radio className="w-5 h-5" />
              <motion.div 
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 bg-primary/20 blur-lg rounded-full"
              />
            </motion.div>
          )}
          
          {/* Active Sensor Indicators (when closed) */}
          {!isOpen && (isCamActive || isMicActive) && (
            <div className="absolute top-1 right-1 flex gap-1">
              {isCamActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]" />}
              {isMicActive && <div className="w-1.5 h-1.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]" />}
            </div>
          )}
        </motion.button>

        <AnimatePresence>
          {isOpen && (
            <motion.nav 
              initial={{ opacity: 0, x: -20, width: 0 }}
              animate={{ opacity: 1, x: 0, width: 'auto' }}
              exit={{ opacity: 0, x: -20, width: 0 }}
              className="h-14 px-3 py-2 rounded-2xl border-white/5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.4)] flex items-center gap-1 bg-black/20 backdrop-blur-2xl ring-1 ring-white/10"
            >
              {/* Mood Selector Trigger */}
              <div className="relative">
                <AnimatePresence>
                  {isMoodOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.96 }}
                      className="absolute bottom-full left-0 mb-4 z-[70] w-[min(18rem,calc(100vw-4.5rem))]"
                    >
                      <div className="rounded-[1.6rem] border border-white/10 bg-black/75 p-3 shadow-[0_30px_60px_-18px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
                        <div className="mb-3 flex items-center justify-between px-1">
                          <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-white/35">
                            Mood Presets
                          </span>
                          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-primary/70">
                            Safe View
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                        {moods.map(([moodType, config], idx) => {
                          const isSelected = mood === moodType;

                          return (
                            <motion.button
                              key={moodType}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ 
                                opacity: 1, 
                                scale: 1,
                                y: 0
                              }}
                              exit={{ opacity: 0, y: 8 }}
                              transition={{ delay: idx * 0.03 }}
                              whileHover={{ scale: 1.03, y: -2 }}
                              onClick={() => {
                                setMood(moodType as any);
                                setIsMoodOpen(false);
                              }}
                              className={cn(
                                "flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-[1.1rem] border px-2 py-2.5 text-center transition-all duration-300",
                                "bg-white/[0.03] backdrop-blur-xl border-white/8 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
                                "hover:bg-white/[0.08] hover:border-white/20",
                                isSelected && "bg-white/12 border-primary/35 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_0_24px_rgba(249,115,22,0.18)]"
                              )}
                            >
                              <LivingIcon 
                                iconName={config.iconName} 
                                size="sm" 
                                color={isSelected ? config.color : undefined}
                              />
                              <span className={cn(
                                "text-[9px] uppercase leading-tight tracking-[0.14em] font-black transition-colors duration-300",
                                isSelected ? "text-white" : "text-white/55"
                              )}>
                                {moodType}
                              </span>
                            </motion.button>
                          );
                        })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <DockIcon 
                  onClick={() => setIsMoodOpen(!isMoodOpen)} 
                  active={isMoodOpen}
                  moodGradient={moodColors.gradient}
                >
                  <div className="group flex flex-col items-center">
                    <LivingIcon iconName={moodColors.iconName} size="sm" />
                    <ChevronUp className={cn("w-3 h-3 mt-0.5 opacity-40 transition-transform group-hover:translate-y-[-2px]", isMoodOpen && "rotate-180")} />
                  </div>
                </DockIcon>
              </div>

              {/* Search Option */}
              <DockIcon onClick={() => {
                document.getElementById('neural-search-section')?.scrollIntoView({ behavior: 'smooth' });
              }}>
                <Search className="w-5 h-5 text-white/40 hover:text-primary transition-colors" />
              </DockIcon>

              {/* Main Action - Brain Trigger (Premium) */}
              <DockIcon active={isOpen} onClick={() => setIsOpen(!isOpen)}>
                <div className="relative group/trigger">
                  <div className={cn(
                    "absolute inset-0 bg-gradient-to-tr rounded-xl opacity-20 blur-lg transition-opacity group-hover/trigger:opacity-40 animate-pulse",
                    moodColors.gradient
                  )} />
                  <Orbit className="w-5 h-5 text-white relative z-10 animate-[spin_10s_linear_infinite]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_10px_white]" />
                  </div>
                </div>
              </DockIcon>

              <div className="w-px h-8 bg-white/10 mx-1 shrink-0" />

              {/* Cam Toggle */}
              <DockIcon onClick={() => setIsCamActive(!isCamActive)} active={isCamActive}>
                {isCamActive ? <div className="text-primary font-bold text-[10px]">ON</div> : <Camera className="w-5 h-5 text-white/20" />}
              </DockIcon>

              {/* Mic Toggle */}
              <DockIcon onClick={() => setIsMicActive(!isMicActive)} active={isMicActive} color="red">
                <div className="relative">
                  {isMicActive ? <Mic className="w-5 h-5 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]" /> : <MicOff className="w-5 h-5 text-white/20" />}
                </div>
              </DockIcon>

              {/* Visualizer Activity Icon */}
              <div className="px-2 flex items-center justify-center">
                <Activity className={cn("w-4 h-4 transition-colors", (isCamActive || isMicActive) ? "text-primary animate-pulse" : "text-white/10")} />
              </div>
              </motion.nav>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function DockIcon({ children, onClick, active, color = 'primary', moodGradient }: any) {
  return (
    <motion.button
      whileHover={{ scale: 1.1, y: -4 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 relative group shrink-0",
        active 
          ? (moodGradient ? "bg-white/10 shadow-inner" : `bg-${color}/10`) 
          : "bg-transparent hover:bg-white/5"
      )}
    >
      {active && (
        <motion.div 
          layoutId="activeGlow"
          className={cn(
            "absolute bottom-1.5 w-3 h-1 rounded-full",
            moodGradient ? "bg-white" : `bg-primary`
          )} 
        />
      )}
      <div className="relative z-10 transition-all duration-300 group-hover:scale-110 flex items-center justify-center">
        {children}
      </div>
    </motion.button>
  );
}


