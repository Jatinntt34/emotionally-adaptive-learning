import {
  createContext, useContext, useState, useEffect,
  useRef, useCallback, ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

export interface CompletedModule {
  id: number;
  title: string;
  type: 'video' | 'article' | 'quiz';
  completedAt: Date;
}

export interface LearningPathHistory {
  id: string;
  topic: string;
  mood: string;
  speed: string;
  format: string;
  goal: string;
  createdAt: Date;
  completedModules: CompletedModule[];
  totalModules: number;
  modules?: any[];
}

interface ProgressContextType {
  history: LearningPathHistory[];
  loading: boolean;
  // ── Emotion signal API ──────────────────────────────────────────────────
  // Call reportEmotionSignal(emotion) from your WebSocket onmessage handler
  // every time a successful emotion arrives.
  // Automatically resets to 'neutral' after EMOTION_RESET_MS of silence.
  // This fixes Problem D: UI context locking on last detected emotion.
  detectedEmotion: string;
  reportEmotionSignal: (emotion: string) => void;
  clearEmotionSignal:  () => void;
  // ── Path management ─────────────────────────────────────────────────────
  addLearningPath: (
    path: Omit<LearningPathHistory, 'id' | 'createdAt' | 'completedModules'> & { modules: any[] }
  ) => Promise<string>;
  updateModuleCompletion:  (pathId: string, module: CompletedModule)  => Promise<void>;
  removeModuleCompletion:  (pathId: string, moduleId: number)         => Promise<void>;
  getPathById:             (pathId: string) => LearningPathHistory | undefined;
  deletePath:              (pathId: string) => Promise<void>;
}

// Reset to 'neutral' after 4 seconds of no emotion signal.
// Covers natural speech pauses without flickering.
const EMOTION_RESET_MS = 4000;

const ProgressContext = createContext<ProgressContextType | undefined>(undefined);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [history,         setHistory]         = useState<LearningPathHistory[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [detectedEmotion, setDetectedEmotion] = useState<string>('neutral');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user } = useAuth();

  // ── Emotion signal management ─────────────────────────────────────────
  const reportEmotionSignal = useCallback((emotion: string) => {
    setDetectedEmotion(emotion);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setDetectedEmotion('neutral');
      resetTimer.current = null;
    }, EMOTION_RESET_MS);
  }, []);

  const clearEmotionSignal = useCallback(() => {
    if (resetTimer.current) { clearTimeout(resetTimer.current); resetTimer.current = null; }
    setDetectedEmotion('neutral');
  }, []);

  useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current); }, []);

  // ── Auth helpers ──────────────────────────────────────────────────────
  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('moodlearn_token')}`,
  });

  // ── Fetch history on user change ──────────────────────────────────────
  useEffect(() => {
    const fetch_ = async () => {
      if (!user) { setHistory([]); return; }
      setLoading(true);
      try {
        const res = await fetch('/api/paths', { headers: getHeaders() });
        if (res.ok) {
          const data = await res.json();
          setHistory(data.history.map((p: any) => ({
            ...p,
            createdAt:        new Date(p.createdAt),
            completedModules: p.completedModules.map((m: any) => ({
              ...m, completedAt: new Date(m.completedAt),
            })),
          })));
        }
      } catch (err) {
        console.error('Failed to fetch history:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch_();
    clearEmotionSignal();
  }, [user, clearEmotionSignal]);

  // ── Path management ───────────────────────────────────────────────────
  const addLearningPath = async (
    path: Omit<LearningPathHistory, 'id' | 'createdAt' | 'completedModules'> & { modules: any[] }
  ) => {
    try {
      const res  = await fetch('/api/paths', { method: 'POST', headers: getHeaders(), body: JSON.stringify(path) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to save path');
      const newPath: LearningPathHistory = {
        ...path, id: data.id, createdAt: new Date(), completedModules: [],
      };
      setHistory(prev => [newPath, ...prev]);
      return data.id;
    } catch (err: any) {
      toast.error(err.message); return '';
    }
  };

  const updateModuleCompletion = async (pathId: string, module: CompletedModule) => {
    try {
      const res = await fetch(`/api/paths/${pathId}/progress`, {
        method: 'PATCH', headers: getHeaders(), body: JSON.stringify(module),
      });
      if (!res.ok) throw new Error('Failed to update progress');
      setHistory(prev => prev.map(p =>
        p.id === pathId
          ? { ...p, completedModules: [...p.completedModules.filter(m => m.id !== module.id), module] }
          : p
      ));
    } catch (err: any) { toast.error(err.message); }
  };

  const removeModuleCompletion = async (pathId: string, moduleId: number) => {
    setHistory(prev => prev.map(p =>
      p.id === pathId
        ? { ...p, completedModules: p.completedModules.filter(m => m.id !== moduleId) }
        : p
    ));
  };

  const getPathById = (pathId: string) => history.find(p => p.id === pathId);

  const deletePath = async (pathId: string) => {
    try {
      const res = await fetch(`/api/paths/${pathId}`, { method: 'DELETE', headers: getHeaders() });
      if (!res.ok) throw new Error('Failed to delete path');
      setHistory(prev => prev.filter(p => p.id !== pathId));
      toast.success('Path deleted');
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <ProgressContext.Provider value={{
      history, loading,
      detectedEmotion, reportEmotionSignal, clearEmotionSignal,
      addLearningPath, updateModuleCompletion, removeModuleCompletion,
      getPathById, deletePath,
    }}>
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress must be used within ProgressProvider');
  return ctx;
}
