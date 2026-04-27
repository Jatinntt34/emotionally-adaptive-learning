import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useMood, MoodType } from '@/contexts/MoodContext';
import { useEmotionTimer } from '@/hooks/useEmotionTimer';
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
  liveEmotion: string;
  liveConfidence: number;
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
  const lastAudioUpdateRef = useRef<number>(0);

  const normalizeConfidence = (val: any) => {
    const num = parseFloat(val);
    if (isNaN(num)) return 0;
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
    const token = localStorage.getItem('moodlearn_token');
    if (!token) {
      setError('Please log in to use camera emotion tracking.');
      setIsCamActive(false);
      return;
    }
    try {
      const ws = new WebSocket(`${WS_BASE}/ws/emotion?token=${encodeURIComponent(token)}`);
      ws.onopen = () => {
        setError(null);
        setCurrentEmotion('Looking for face...');
      };
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
          } else if (data.status === 'no_face') {
            setCurrentEmotion('No face detected');
            setConfidence(0);
          } else if (data.status === 'error') {
            setError(data.message || 'Camera emotion analysis failed.');
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message', e);
        }
      };
      ws.onerror = () => {
        setError('Could not connect to the emotion backend. Please refresh and try again.');
        setIsCamActive(false);
      };
      ws.onclose = (event) => {
        if (event.code === 1008) {
          localStorage.removeItem('moodlearn_token');
          setError('Your session expired. Please log in again to use camera tracking.');
          setIsCamActive(false);
        }
      };
      wsRef.current = ws;
    } catch (e) {
      setError('WebSocket initialization failed.');
    }
  }, [addEmotionToBuffer]);

  const sendFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return;
    const video = videoRef.current;
    if (!video.srcObject && streamRef.current) video.srcObject = streamRef.current;
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
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera is not available.');
      setCurrentEmotion('Starting camera...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } });
      streamRef.current = stream;
      setError(null);
      
      // Sync ref immediately if available
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      connectWebSocket();
      if (frameIntervalRef.current) window.clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = window.setInterval(() => { sendFrame(); }, 1000);
    } catch (err: any) {
      setError(err?.message || 'Failed to access camera.');
      setIsCamActive(false);
    }
  }, [connectWebSocket, sendFrame]);

  const connectVoiceWs = useCallback((): WebSocket | null => {
    const token = localStorage.getItem('moodlearn_token');
    if (!token) {
      setError('Please log in for voice tracking.');
      setIsMicActive(false);
      return null;
    }
    try {
      const ws = new WebSocket(`${WS_BASE}/ws/voice?token=${encodeURIComponent(token)}`);
      ws.onopen = () => { setError(null); setVoiceEmotion('Listening...'); };
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
          } else if (data.status === 'error') {
            setError(data.message || 'Voice analysis failed.');
          }
        } catch {}
      };
      ws.onerror = () => { setError('Voice backend connection failed.'); setIsMicActive(false); };
      ws.onclose = (event) => {
        if (event.code === 1008) {
          localStorage.removeItem('moodlearn_token');
          setError('Session expired. Please log in again.');
          setIsMicActive(false);
        }
      };
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
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone is not available.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setError(null);
      const AudioCtxClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) throw new Error('Audio processing not supported.');
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
        const now = Date.now();
          if (now - lastAudioUpdateRef.current > 352) {
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((acc, v) => acc + v, 0) / dataArray.length;
            setAudioLevel(average / 255);
            lastAudioUpdateRef.current = now;
          }
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
          offSrc.buffer = srcBuf; offSrc.connect(offCtx.destination); offSrc.start();
          const rendered = await offCtx.startRendering();
          toSend = new Float32Array(rendered.getChannelData(0));
        } catch { toSend = merged; }
        if (voiceWsRef.current?.readyState === WebSocket.OPEN) voiceWsRef.current.send(toSend.buffer);
      }, 5000);
    } catch (err: any) {
      setError(err?.message || 'Microphone access denied.');
      setIsMicActive(false);
    }
  }, [connectVoiceWs]);

  useEffect(() => {
    if (isCamActive) startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [isCamActive, startCamera, stopCamera]);

  // Sync video element with stream when it mounts/unmounts
  useEffect(() => {
    if (isCamActive && streamRef.current && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isCamActive, videoRef.current]);

  useEffect(() => {
    if (isMicActive) startMic();
    else stopMic();
    return () => stopMic();
  }, [isMicActive, startMic, stopMic]);

  const liveEmotion = (isCamActive && currentEmotion && !currentEmotion.includes('Initializing') && (confidence >= voiceConfidence || !isMicActive))
    ? currentEmotion 
    : (isMicActive ? (voiceEmotion || 'Ready') : (currentEmotion || 'Initializing...'));
    
  const liveConfidence = Math.max(isCamActive ? (confidence || 0) : 0, isMicActive ? (voiceConfidence || 0) : 0);

  const value = useMemo(() => ({
    isCamActive, setIsCamActive,
    isMicActive, setIsMicActive,
    currentEmotion, confidence,
    voiceEmotion, voiceConfidence,
    liveEmotion, liveConfidence,
    timerState, timeLeft,
    error, videoRef, canvasRef,
    audioLevel
  }), [
    isCamActive, isMicActive, currentEmotion, confidence, 
    voiceEmotion, voiceConfidence, liveEmotion, liveConfidence, 
    timerState, timeLeft, error, audioLevel
  ]);

  return <NeuralContext.Provider value={value}>{children}</NeuralContext.Provider>;
}

export function useNeuralTracking() {
  const context = useContext(NeuralContext);
  if (context === undefined) throw new Error('useNeuralTracking must be used within a NeuralProvider');
  return context;
}
