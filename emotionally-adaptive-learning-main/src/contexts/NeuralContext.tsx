import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useMood, MoodType } from '@/contexts/MoodContext';
import { useEmotionTimer } from '@/hooks/useEmotionTimer';

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

interface NeuralContextType {
  isCamActive: boolean;
  setIsCamActive: React.Dispatch<React.SetStateAction<boolean>>;
  isMicActive: boolean;
  setIsMicActive: React.Dispatch<React.SetStateAction<boolean>>;
  currentEmotion: string;
  confidence: number;
  voiceEmotion: string;
  voiceConfidence: number;
  timerState: string;
  timeLeft: number;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  audioLevel: number;
}

const NeuralContext = createContext<NeuralContextType | undefined>(undefined);

export function NeuralProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { setMood, setDetectedRawEmotion } = useMood();
  const [isCamActive, setIsCamActive] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentEmotion, setCurrentEmotion] = useState<string>('Initializing...');
  const [confidence, setConfidence] = useState<number>(0);
  const [voiceEmotion, setVoiceEmotion] = useState<string>('Ready');
  const [voiceConfidence, setVoiceConfidence] = useState<number>(0);
  const [audioLevel, setAudioLevel] = useState(0);

  const normalizeConfidence = (val: any) => {
    const num = parseFloat(val);
    if (isNaN(num)) return 0;
    
    // If val is > 100, it's likely erratic raw data, clamp to 100
    // If val is > 1 and <= 100, it's a percentage, normalize to 0-1
    // If val is <= 1, it's already normalized
    let normalized = num;
    if (num > 100) normalized = 100;
    if (normalized > 1) normalized = normalized / 100;
    
    return Math.max(0, Math.min(normalized, 1));
  };

  const sanitizeEmotion = (emotion: string) => {
    if (!emotion || emotion.toLowerCase() === 'unknown' || emotion.toLowerCase() === 'initializing...') {
      return 'Resonating...';
    }
    return emotion.charAt(0).toUpperCase() + emotion.slice(1);
  };

  const voiceWsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const voiceSendIntervalRef = useRef<number | null>(null);
  const voiceChunksRef = useRef<Float32Array[]>([]);
  const voiceTotalLenRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

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

  const isAnyDetectionActive = isCamActive || isMicActive;

  const { timerState, timeLeft, addEmotionToBuffer } = useEmotionTimer(
    isAnyDetectionActive,
    handleMoodLocked,
    cooldownDuration
  );

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    try {
      const ws = new WebSocket('ws://127.0.0.1:8000/ws/emotion');
      ws.onopen = () => { setError(null); };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.status === 'success' && data.emotion) {
            setCurrentEmotion(sanitizeEmotion(data.emotion));
            setConfidence(normalizeConfidence(data.confidence));
            const mappedMood = EMOTION_TO_MOOD[data.emotion.toLowerCase()];
            if (mappedMood) addEmotionToBuffer(mappedMood, data.emotion);
          } else if (data.status === 'low_confidence' && data.emotion) {
            setCurrentEmotion(sanitizeEmotion(data.emotion));
            setConfidence(normalizeConfidence(data.confidence));
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message', e);
        }
      };
      ws.onerror = () => {
        setError('Failed to connect to backend server. Make sure api.py is running.');
        setIsCamActive(false);
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
      setIsCamActive(false);
    }
  }, [connectWebSocket, sendFrame]);

  const connectVoiceWs = useCallback((): WebSocket | null => {
    try {
      const ws = new WebSocket('ws://127.0.0.1:8000/ws/voice');
      ws.onopen = () => console.log('[Voice] WS connected');
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.status === 'success' && data.emotion) {
            setVoiceEmotion(data.emotion);
            setVoiceConfidence(normalizeConfidence(data.confidence));
            const mappedMood = EMOTION_TO_MOOD[data.emotion.toLowerCase()];
            if (mappedMood) addEmotionToBuffer(mappedMood, data.emotion);
          } else if (data.status === 'low_confidence' && data.emotion) {
            setVoiceEmotion(data.emotion);
            setVoiceConfidence(normalizeConfidence(data.confidence));
          } else if (data.status === 'no_voice') {
            setVoiceEmotion('Ready');
            setVoiceConfidence(0);
          }
        } catch {}
      };
      ws.onerror = () => console.warn('[Voice] WS error');
      return ws;
    } catch { return null; }
  }, [addEmotionToBuffer]);

  const stopMic = useCallback(() => {
    if (voiceSendIntervalRef.current) { window.clearInterval(voiceSendIntervalRef.current); voiceSendIntervalRef.current = null; }
    if (processorRef.current) { try { processorRef.current.disconnect(); } catch {} processorRef.current = null; }
    if (analyserRef.current) { try { analyserRef.current.disconnect(); } catch {} analyserRef.current = null; }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} audioCtxRef.current = null; }
    if (voiceWsRef.current) { try { voiceWsRef.current.close(); } catch {} voiceWsRef.current = null; }
    voiceChunksRef.current = [];
    voiceTotalLenRef.current = 0;
    setVoiceEmotion('Listening...');
    setVoiceConfidence(0);
    setAudioLevel(0);
  }, []);

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setError(null);

      const AudioCtxClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      const actx = new AudioCtxClass();
      audioCtxRef.current = actx;
      const nativeSR = actx.sampleRate;
      const TARGET_SR = 16000;

      const source = actx.createMediaStreamSource(stream);
      
      const analyser = actx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const processor = actx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e: any) => {
        const samples = new Float32Array(e.inputBuffer.getChannelData(0));
        voiceChunksRef.current.push(samples);
        voiceTotalLenRef.current += samples.length;

        // Calculate audio level for UI
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((acc, v) => acc + v, 0) / dataArray.length;
        setAudioLevel(average / 255);
      };
      source.connect(processor);
      processor.connect(actx.destination);
      processorRef.current = processor;

      voiceWsRef.current = connectVoiceWs();

      voiceSendIntervalRef.current = window.setInterval(async () => {
        if (!voiceWsRef.current || voiceWsRef.current.readyState !== WebSocket.OPEN) {
          if (!voiceWsRef.current || voiceWsRef.current.readyState === WebSocket.CLOSED) {
            voiceWsRef.current = connectVoiceWs();
          }
          return;
        }

        const totalLen = voiceTotalLenRef.current;
        if (totalLen < nativeSR) return;

        const merged = new Float32Array(totalLen);
        let offset = 0;
        for (const c of voiceChunksRef.current) { merged.set(c, offset); offset += c.length; }

        voiceChunksRef.current = [];
        voiceTotalLenRef.current = 0;

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
        } catch { toSend = merged; }

        if (voiceWsRef.current?.readyState === WebSocket.OPEN) {
          voiceWsRef.current.send(toSend.buffer);
        }
      }, 5000);
    } catch (err: any) {
      setError('Microphone access denied.');
      setIsMicActive(false);
    }
  }, [connectVoiceWs]);

  useEffect(() => {
    if (isCamActive) startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [isCamActive, startCamera, stopCamera]);

  useEffect(() => {
    if (isMicActive) startMic();
    else stopMic();
    return () => stopMic();
  }, [isMicActive, startMic, stopMic]);

  const value = {
    isCamActive, setIsCamActive,
    isMicActive, setIsMicActive,
    currentEmotion, confidence,
    voiceEmotion, voiceConfidence,
    timerState, timeLeft,
    error, videoRef, canvasRef,
    audioLevel
  };

  return <NeuralContext.Provider value={value}>{children}</NeuralContext.Provider>;
}

export function useNeuralTracking() {
  const context = useContext(NeuralContext);
  if (context === undefined) {
    throw new Error('useNeuralTracking must be used within a NeuralProvider');
  }
  return context;
}


