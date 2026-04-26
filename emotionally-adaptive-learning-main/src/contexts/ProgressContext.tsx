import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { apiUrl } from '@/config';

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
  // Emotion signal — call this from your WebSocket handlers every time a
  // successful emotion arrives. Automatically resets to 'neutral' after
  // EMOTION_RESET_MS of silence (fixes Problem D: UI Context Locking).
  detectedEmotion: string;
  reportEmotionSignal: (emotion: string) => void;
  clearEmotionSignal: () => void;
  addLearningPath: (
    path: Omit<LearningPathHistory, 'id' | 'createdAt' | 'completedModules'> & {
      modules: any[];
    }
  ) => Promise<string>;
  updateModuleCompletion: (pathId: string, module: CompletedModule) => Promise<void>;
  removeModuleCompletion: (pathId: string, moduleId: number) => Promise<void>;
  getPathById: (pathId: string) => LearningPathHistory | undefined;
  deletePath: (pathId: string) => Promise<void>;
}

// How long (ms) with no emotion signal before resetting to 'neutral'.
// 4 seconds is long enough to cover natural speech pauses.
const EMOTION_RESET_MS = 4000;

const ProgressContext = createContext<ProgressContextType | undefined>(undefined);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<LearningPathHistory[]>(() => {
    // Initial load from localStorage for immediate UI responsiveness
    const saved = localStorage.getItem('moodlearn_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((p: any) => ({
          ...p,
          createdAt: new Date(p.createdAt),
          completedModules: p.completedModules.map((m: any) => ({
            ...m,
            completedAt: new Date(m.completedAt)
          }))
        }));
      } catch (e) {
        console.error('Failed to parse local history:', e);
        return [];
      }
    }
    return [];
  });
  const [loading, setLoading] = useState(false);
  // FIX — Problem D: tracks the current live emotion with auto-reset
  const [detectedEmotion, setDetectedEmotion] = useState<string>('neutral');
  const emotionResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user } = useAuth();

  // ── Emotion signal management ────────────────────────────────────────────
  /**
   * Call this every time a successful emotion arrives from either WebSocket.
   * It updates the detected emotion and arms a timer to reset back to 'neutral'
   * if no further signal arrives within EMOTION_RESET_MS.
   *
   * This fixes the UI getting stuck on the last detected emotion when the user
   * stops speaking or moves out of frame (Problem D).
   */
  const reportEmotionSignal = useCallback((emotion: string) => {
    setDetectedEmotion(emotion);

    // Clear any existing reset timer
    if (emotionResetTimer.current) {
      clearTimeout(emotionResetTimer.current);
    }

    // Arm a new reset timer
    emotionResetTimer.current = setTimeout(() => {
      setDetectedEmotion('neutral');
      emotionResetTimer.current = null;
    }, EMOTION_RESET_MS);
  }, []);

  /**
   * Immediately reset emotion to neutral and cancel the pending timer.
   * Call this when the WebSocket disconnects or the user leaves the page.
   */
  const clearEmotionSignal = useCallback(() => {
    if (emotionResetTimer.current) {
      clearTimeout(emotionResetTimer.current);
      emotionResetTimer.current = null;
    }
    setDetectedEmotion('neutral');
  }, []);

  // Save to localStorage whenever history changes
  useEffect(() => {
    localStorage.setItem('moodlearn_history', JSON.stringify(history));
  }, [history]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (emotionResetTimer.current) {
        clearTimeout(emotionResetTimer.current);
      }
    };
  }, []);

  // ── Auth helpers ─────────────────────────────────────────────────────────
  const getHeaders = () => {
    const token = localStorage.getItem('moodlearn_token');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  };

  // ── Fetch history when user changes or components mount ───────────────────
  useEffect(() => {
    const fetchHistory = async () => {
      // If no user, we don't clear history anymore (preserve local guest history)
      if (!user) {
        return;
      }
      
      setLoading(true);
      try {
        const res = await fetch(apiUrl('/api/paths'), { headers: getHeaders() });
        if (res.ok) {
          const data = await res.json();
          const backendHistory = data.history.map((p: any) => ({
            ...p,
            createdAt: new Date(p.createdAt),
            completedModules: p.completedModules.map((m: any) => ({
              ...m,
              completedAt: new Date(m.completedAt),
            })),
          }));
          
          // Merge logic: prioritize backend but keep guest paths if they don't exist in backend
          setHistory((prev) => {
            const guestPaths = prev.filter(p => p.id.startsWith('guest_'));
            return [...backendHistory, ...guestPaths];
          });
        }
      } catch (err) {
        console.error('Failed to fetch history:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
    clearEmotionSignal();
  }, [user, clearEmotionSignal]);

  // ── Path management ──────────────────────────────────────────────────────
  const addLearningPath = async (
    path: Omit<LearningPathHistory, 'id' | 'createdAt' | 'completedModules'> & {
      modules: any[];
    }
  ) => {
    // Optimistic update for guest or temp storage
    const tempId = user ? '' : `guest_${Date.now()}`;
    const newPath: LearningPathHistory = {
      ...path,
      id: tempId || `pending_${Date.now()}`,
      createdAt: new Date(),
      completedModules: [],
    };
    
    // For guests, save locally immediately and return
    if (!user) {
      setHistory((prev) => [newPath, ...prev]);
      toast.success('Path saved to local vault');
      return newPath.id;
    }

    try {
      const res = await fetch(apiUrl('/api/paths'), {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(path),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to save path');

      const confirmedPath: LearningPathHistory = {
        ...newPath,
        id: data.id,
      };
      setHistory((prev) => [confirmedPath, ...prev]);
      return data.id;
    } catch (err: any) {
      toast.error(err.message);
      return '';
    }
  };

  const updateModuleCompletion = async (pathId: string, module: CompletedModule) => {
    // UI Update immediately
    setHistory((prev) =>
      prev.map((p) =>
        p.id === pathId
          ? {
            ...p,
            completedModules: [
              ...p.completedModules.filter((m) => m.id !== module.id),
              { ...module, completedAt: new Date(module.completedAt) },
            ],
          }
          : p
      )
    );

    // If guest, we are done (already saved via history useEffect)
    if (!user || pathId.startsWith('guest_')) return;

    try {
      const res = await fetch(apiUrl(`/api/paths/${pathId}/progress`), {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(module),
      });
      if (!res.ok) throw new Error('Failed to sync progress with cloud');
    } catch (err: any) {
      console.warn('Sync failed, progress saved locally only:', err.message);
    }
  };

  const removeModuleCompletion = async (pathId: string, moduleId: number) => {
    setHistory((prev) =>
      prev.map((p) =>
        p.id === pathId
          ? { ...p, completedModules: p.completedModules.filter((m) => m.id !== moduleId) }
          : p
      )
    );
  };

  const getPathById = (pathId: string) => history.find((p) => p.id === pathId);

  const deletePath = async (pathId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/paths/${pathId}`), {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete path');
      setHistory((prev) => prev.filter((p) => p.id !== pathId));
      toast.success('Path deleted');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <ProgressContext.Provider
      value={{
        history,
        loading,
        detectedEmotion,
        reportEmotionSignal,
        clearEmotionSignal,
        addLearningPath,
        updateModuleCompletion,
        removeModuleCompletion,
        getPathById,
        deletePath,
      }}
    >
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgress() {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useProgress must be used within ProgressProvider');
  }
  return context;
}


