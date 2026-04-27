import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useNeuralTracking } from '@/contexts/NeuralContext';
import { Camera, CameraOff, Mic, MicOff, AlertCircle, Clock, CheckCircle2, ScanFace } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const NEURAL_PROMPTS = [
  "I'm really enjoying this topic!",
  "Can you explain this part again?",
  "I feel ready for the next level.",
  "This concept is a bit challenging.",
  "Show me something more advanced."
];

export function CameraCapture() {
  const location = useLocation();
  const { 
    isCamActive: isActive, 
    setIsCamActive: setIsActive,
    isMicActive,
    setIsMicActive,
    currentEmotion,
    confidence,
    voiceEmotion,
    voiceConfidence,
    timerState,
    timeLeft,
    videoRef,
    canvasRef,
    error: neuralError
  } = useNeuralTracking();

  const [localError, setLocalError] = useState<string | null>(null);
  const error = neuralError || localError;

  const [activePromptIdx, setActivePromptIdx] = useState(0);

  useEffect(() => {
    if (isMicActive) {
      const interval = setInterval(() => {
        setActivePromptIdx(prev => (prev + 1) % NEURAL_PROMPTS.length);
      }, 8000);
      return () => clearInterval(interval);
    }
  }, [isMicActive]);

  const toggleCamera = () => setIsActive(!isActive);
  const toggleMic = () => setIsMicActive(!isMicActive);

  if (location.pathname === '/create-path') return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col items-start gap-4 pointer-events-none max-w-[280px]">
      
      {/* Permanent Instruction HUD — Always Visible */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="pointer-events-auto bg-card/40 backdrop-blur-sm border border-primary/10 p-3 rounded-2xl w-full will-change-transform"
      >
        <div className="flex items-center gap-2 mb-2 px-1">
          <ScanFace className="w-3 h-3 text-primary/60" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/60 font-mono">Neural Commands</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {NEURAL_PROMPTS.map((prompt, idx) => (
            <motion.button
              key={idx}
              whileHover={{ x: 4, backgroundColor: "hsl(var(--primary) / 0.1)" }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                if (!isMicActive) toggleMic();
              }}
              className="text-left text-[10px] py-1.5 px-2.5 rounded-lg border border-transparent hover:border-primary/20 transition-all text-muted-foreground hover:text-primary font-medium"
            >
              {prompt}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Camera feed panel */}
      <AnimatePresence mode="wait">
        {isActive && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="pointer-events-auto bg-card text-card-foreground p-3 rounded-2xl shadow-xl border border-border/50 flex flex-col items-center gap-2 backdrop-blur-sm bg-opacity-90 min-w-[200px] will-change-transform"
          >
            <div className="relative rounded-lg overflow-hidden w-full h-[120px] bg-black/20 border border-border/50 flex items-center justify-center">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover transform -scale-x-100" 
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Timer badge */}
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 shadow-xl backdrop-blur-md text-white px-2 py-1 rounded-full text-[10px] font-medium tracking-wide border border-white/10">
                {timerState === 'grace' && <><Clock className="w-3 h-3 text-amber-400 animate-pulse"/>Ready {timeLeft}s</>}
                {timerState === 'analyzing' && <><ScanFace className="w-3 h-3 text-blue-400"/>Analyzing... {timeLeft}s</>}
                {timerState === 'cooldown' && <><CheckCircle2 className="w-3 h-3 text-green-400"/>Locked {timeLeft}s</>}
              </div>

              {/* CAM badge */}
              <div className="absolute top-2 right-2">
                <div className="flex items-center gap-1.5 bg-black/50 text-white px-2 py-1 rounded-full text-[10px] font-medium backdrop-blur-md">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  CAM
                </div>
              </div>
            </div>

            <div className="w-full flex items-center justify-between px-1 mt-1 text-sm">
              <span className="font-medium capitalize text-primary">
                {currentEmotion !== 'Unknown' ? currentEmotion : 'Detecting...'}
              </span>
              {confidence > 0 && (
                <span className="text-muted-foreground text-xs font-mono">{Math.round(confidence * 100)}%</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice live panel — shows when mic is active */}
      <AnimatePresence mode="wait">
        {isMicActive && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="pointer-events-auto bg-card text-card-foreground p-3 rounded-2xl shadow-xl border border-border/50 backdrop-blur-sm min-w-[200px] will-change-transform"
          >
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                  <Mic className="w-5 h-5 text-red-500" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-40" />
              </div>

              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground font-medium">Voice Emotion</span>
                <span className="font-semibold capitalize text-primary text-sm">
                  {voiceEmotion}
                </span>
                {voiceConfidence > 0 && (
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {Math.round(voiceConfidence * 100)}% confidence
                  </span>
                )}
              </div>

              {!isActive && (
                <div className="ml-auto flex items-center gap-1 bg-black/10 dark:bg-white/10 px-2 py-1 rounded-full text-[10px] font-medium">
                  {timerState === 'grace' && <><Clock className="w-3 h-3 text-amber-400 animate-pulse"/>Ready {timeLeft}s</>}
                  {timerState === 'analyzing' && <><ScanFace className="w-3 h-3 text-blue-400"/>Analyzing {timeLeft}s</>}
                  {timerState === 'cooldown' && <><CheckCircle2 className="w-3 h-3 text-green-400"/>Locked {timeLeft}s</>}
                </div>
              )}
            </div>

            <div className="mt-3 flex items-end gap-[2px] h-4 px-1">
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    height: [4, Math.random() * 16 + 4, 4],
                  }}
                  transition={{ 
                    duration: 0.5 + Math.random() * 0.5, 
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="w-1 bg-primary/40 rounded-full"
                />
              ))}
            </div>

            <div className="mt-3 py-2 px-3 bg-primary/5 rounded-xl border border-primary/10">
              <p className="text-[10px] text-primary/60 font-medium italic">
                Listening for your response...
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-destructive/10 border border-destructive/20 text-destructive text-xs p-2 rounded-lg max-w-xs flex items-center gap-2 mb-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p>{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Control buttons */}
      <div className="flex gap-2 items-center pointer-events-auto">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleCamera}
          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors ${
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
          title={isActive ? 'Disable Camera tracking' : 'Enable Camera tracking'}
        >
          {isActive ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleMic}
          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors ${
            isMicActive
              ? 'bg-red-500 text-white'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
          title={isMicActive ? 'Disable voice tracking' : 'Enable voice tracking'}
        >
          {isMicActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </motion.button>
      </div>
    </div>
  );
}
