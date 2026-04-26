import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useMood, MoodType } from '@/contexts/MoodContext';
import { useEmotionTimer } from '@/hooks/useEmotionTimer';
import { Camera, CameraOff, Mic, MicOff, AlertCircle, Clock, CheckCircle2, ScanFace, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { WS_BASE } from '@/config';

const EMOTION_TO_MOOD: Record<string, MoodType> = {
  angry: 'anxious',
  calm: 'calm',
  disgust: 'unmotivated',
  fear: 'anxious',
  happy: 'energetic',
  neutral: 'calm',
  sad: 'sad',
  surprise: 'curious'
};

const NEURAL_PROMPTS = [
  "I'm really enjoying this topic!",
  "Can you explain this part again?",
  "I feel ready for the next level.",
  "This concept is a bit challenging.",
  "Show me something more advanced."
];

const TARGET_SR = 16000;

export function CameraCapture() {
  const location = useLocation();
  const { setMood, setDetectedRawEmotion } = useMood();
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentEmotion, setCurrentEmotion] = useState<string>('Unknown');
  const [confidence, setConfidence] = useState<number>(0);

  // Voice — continuous live streaming
  const [isMicActive, setIsMicActive] = useState(false);
  const [voiceEmotion, setVoiceEmotion] = useState<string>('Listening...');
  const [voiceConfidence, setVoiceConfidence] = useState<number>(0);
  const [activePromptIdx, setActivePromptIdx] = useState(0);

  useEffect(() => {
    if (isMicActive) {
      const interval = setInterval(() => {
        setActivePromptIdx(prev => (prev + 1) % NEURAL_PROMPTS.length);
      }, 8000);
      return () => clearInterval(interval);
    }
  }, [isMicActive]);
  const voiceWsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const voiceSendIntervalRef = useRef<number | null>(null);
  const voiceChunksRef = useRef<Float32Array[]>([]);
  const voiceTotalLenRef = useRef<number>(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<number | null>(null);

  const isLearningPath = location.pathname.includes('/learning-path');
  const cooldownDuration = isLearningPath ? 180 : 30;

  const handleMoodLocked = useCallback((winnerMapped: MoodType, winnerRaw: string) => {
    setMood(winnerMapped);
    setDetectedRawEmotion(winnerRaw);
  }, [setMood, setDetectedRawEmotion]);

  // Either camera or mic being active feeds emotions into the timer
  const isAnyDetectionActive = isActive || isMicActive;

  const { timerState, timeLeft, addEmotionToBuffer } = useEmotionTimer(
    isAnyDetectionActive,
    handleMoodLocked,
    cooldownDuration
  );

  // --- CAMERA WS LOGIC ---
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const token = localStorage.getItem('moodlearn_token');
    if (!token) {
      setError('Please log in to use camera emotion tracking.');
      setIsActive(false);
      return;
    }
    try {
      const ws = new WebSocket(`${WS_BASE}/ws/emotion?token=${encodeURIComponent(token)}`);
      ws.onopen = () => { setError(null); };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.status === 'success' && data.emotion) {
            // High-confidence face detection — show in UI and add to buffer
            setCurrentEmotion(data.emotion);
            setConfidence(data.confidence || 0);
            const mappedMood = EMOTION_TO_MOOD[data.emotion];
            if (mappedMood) addEmotionToBuffer(mappedMood, data.emotion);
          } else if (data.status === 'low_confidence' && data.emotion) {
            // Below threshold — show in UI so user sees what model is reading,
            // but do NOT push to the emotion buffer (it would skew majority vote)
            setCurrentEmotion(data.emotion);
            setConfidence(data.confidence || 0);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message', e);
        }
      };
      ws.onerror = () => {
        setError('Failed to connect to backend server. Make sure api.py is running.');
        setIsActive(false);
      };
      wsRef.current = ws;
    } catch (e) {
      setError('WebSocket initialization failed.');
    }
  }, [addEmotionToBuffer]);

  const sendFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64Image = canvas.toDataURL('image/jpeg', 0.5);
      wsRef.current.send(base64Image);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (frameIntervalRef.current) { window.clearInterval(frameIntervalRef.current); frameIntervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
      streamRef.current = stream;
      setError(null);
      connectWebSocket();
      frameIntervalRef.current = window.setInterval(() => { sendFrame(); }, 1000);
    } catch (err: any) {
      setError('Failed to access camera. Please check permissions.');
      setIsActive(false);
    }
  }, [connectWebSocket, sendFrame]);

  // --- CONTINUOUS VOICE STREAMING ---
  // Captures mic audio continuously, sends 3-second chunks every 3 seconds
  // to the backend voice WS for live emotion detection.

  const connectVoiceWs = useCallback((): WebSocket | null => {
    const token = localStorage.getItem('moodlearn_token');
    if (!token) {
      setError('Please log in to use voice emotion tracking.');
      setIsMicActive(false);
      return null;
    }
    try {
      const ws = new WebSocket(`${WS_BASE}/ws/voice?token=${encodeURIComponent(token)}`);
      ws.onopen = () => {
        console.log('[Voice] WS connected');
      };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          console.log('[Voice]', data);
          if (data.status === 'success' && data.emotion) {
            setVoiceEmotion(data.emotion);
            setVoiceConfidence(data.confidence || 0);
            const mappedMood = EMOTION_TO_MOOD[data.emotion];
            if (mappedMood) {
              addEmotionToBuffer(mappedMood, data.emotion);
            }
          } else if (data.status === 'low_confidence' && data.emotion) {
            // Show the emotion in UI but don't push to timer buffer
            // (below threshold — we still want the user to see what's being heard)
            setVoiceEmotion(data.emotion);
            setVoiceConfidence(data.confidence || 0);
          } else if (data.status === 'no_voice') {
            setVoiceEmotion('Listening...');
            setVoiceConfidence(0);
          }
        } catch {}
      };
      ws.onerror = () => {
        console.warn('[Voice] WS error');
      };
      ws.onclose = () => {
        console.log('[Voice] WS closed');
      };
      return ws;
    } catch {
      return null;
    }
  }, [addEmotionToBuffer]);

  const stopMic = useCallback(() => {
    if (voiceSendIntervalRef.current) {
      window.clearInterval(voiceSendIntervalRef.current);
      voiceSendIntervalRef.current = null;
    }
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch {}
      processorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
    if (voiceWsRef.current) {
      try { voiceWsRef.current.close(); } catch {}
      voiceWsRef.current = null;
    }
    voiceChunksRef.current = [];
    voiceTotalLenRef.current = 0;
    setVoiceEmotion('Listening...');
    setVoiceConfidence(0);
  }, []);

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setError(null);

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new AudioCtxClass();
      audioCtxRef.current = actx;
      const nativeSR = actx.sampleRate;
      // TARGET_SR updated to 16000 to match backend wav2vec2 model

      // Capture raw audio samples continuously
      const source = actx.createMediaStreamSource(stream);
      const processor = actx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const samples = new Float32Array(e.inputBuffer.getChannelData(0));
        voiceChunksRef.current.push(samples);
        voiceTotalLenRef.current += samples.length;
      };
      source.connect(processor);
      processor.connect(actx.destination);
      processorRef.current = processor;

      // Connect voice WebSocket
      voiceWsRef.current = connectVoiceWs();

      // Every 5 seconds: merge chunks, resample to 16000, send to backend
      // 5s gives the model ~5 seconds of speech context instead of 3s,
      // producing more stable MFCC features and better emotion accuracy.
      voiceSendIntervalRef.current = window.setInterval(async () => {
        if (!voiceWsRef.current || voiceWsRef.current.readyState !== WebSocket.OPEN) {
          // Reconnect if disconnected
          if (!voiceWsRef.current || voiceWsRef.current.readyState === WebSocket.CLOSED) {
            voiceWsRef.current = connectVoiceWs();
          }
          return;
        }

        const chunks = voiceChunksRef.current;
        const totalLen = voiceTotalLenRef.current;
        if (totalLen < nativeSR) return; // need at least 1 second of audio

        // Merge all chunks
        const merged = new Float32Array(totalLen);
        let offset = 0;
        for (const c of chunks) { merged.set(c, offset); offset += c.length; }

        // Clear buffer for next cycle
        voiceChunksRef.current = [];
        voiceTotalLenRef.current = 0;

        // Resample to 16000 Hz
        let toSend: Float32Array;
        try {
          const targetLen = Math.max(1, Math.floor(merged.length * TARGET_SR / nativeSR));
          const offCtx = new OfflineAudioContext(1, targetLen, TARGET_SR);
          const srcBuf = offCtx.createBuffer(1, merged.length, nativeSR);
          srcBuf.copyToChannel(merged, 0);
          const offSrc = offCtx.createBufferSource();
          offSrc.buffer = srcBuf;
          offSrc.connect(offCtx.destination);
          offSrc.start();
          const rendered = await offCtx.startRendering();
          toSend = new Float32Array(rendered.getChannelData(0));
        } catch {
          toSend = merged;
        }

        // Send to backend
        if (voiceWsRef.current?.readyState === WebSocket.OPEN) {
          voiceWsRef.current.send(toSend.buffer);
        }
      }, 5000);

    } catch (err: any) {
      setError('Microphone access denied. Please check browser permissions.');
      setIsMicActive(false);
    }
  }, [connectVoiceWs]);

  // Camera lifecycle
  useEffect(() => {
    if (isActive) startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [isActive, startCamera, stopCamera]);

  // Mic lifecycle
  useEffect(() => {
    if (isMicActive) startMic();
    else stopMic();
    return () => stopMic();
  }, [isMicActive, startMic, stopMic]);

  useEffect(() => {
    if (!isActive) {
      setCurrentEmotion('Unknown');
      setConfidence(0);
    }
  }, [isActive]);

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
                // We could simulate voice here, but for now we just activate the mic
              }}
              className="text-left text-[10px] py-1.5 px-2.5 rounded-lg border border-transparent hover:border-primary/20 transition-all text-muted-foreground hover:text-primary font-medium"
            >
              {prompt}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Camera feed panel */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="pointer-events-auto bg-card text-card-foreground p-3 rounded-2xl shadow-xl border border-border/50 flex flex-col items-center gap-2 backdrop-blur-sm bg-opacity-90 min-w-[200px] will-change-transform"
          >
            <div className="relative rounded-lg overflow-hidden w-full h-[120px] bg-black/20 border border-border/50 flex items-center justify-center">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform -scale-x-100" />
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
              {currentEmotion !== 'Unknown' && (
                <span className="text-muted-foreground text-xs font-mono">{Math.round(confidence)}%</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice live panel — shows when mic is active */}
      <AnimatePresence>
        {isMicActive && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="pointer-events-auto bg-card text-card-foreground p-3 rounded-2xl shadow-xl border border-border/50 backdrop-blur-sm min-w-[200px] will-change-transform"
          >
            <div className="flex items-center gap-3">
              {/* Mic indicator */}
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
                    {Math.round(voiceConfidence)}% confidence
                  </span>
                )}
              </div>

              {/* Timer badge for voice */}
              {!isActive && (
                <div className="ml-auto flex items-center gap-1 bg-black/10 dark:bg-white/10 px-2 py-1 rounded-full text-[10px] font-medium">
                  {timerState === 'grace' && <><Clock className="w-3 h-3 text-amber-400 animate-pulse"/>Ready {timeLeft}s</>}
                  {timerState === 'analyzing' && <><ScanFace className="w-3 h-3 text-blue-400"/>Analyzing {timeLeft}s</>}
                  {timerState === 'cooldown' && <><CheckCircle2 className="w-3 h-3 text-green-400"/>Locked {timeLeft}s</>}
                </div>
              )}
            </div>

            {/* Visual Waveform (Simulated) */}
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

            {/* Listening state indicator */}
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
        {/* Camera toggle */}
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

        {/* Mic toggle — continuous voice streaming */}
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


