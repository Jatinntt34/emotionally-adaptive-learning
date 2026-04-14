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
  const [history, setHistory] = useState<LearningPathHistory[]>([]);
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

  // ── Fetch history when user changes ─────────────────────────────────────
  useEffect(() => {
    const fetchHistory = async () => {
      if (!user) {
        setHistory([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch('/api/paths', { headers: getHeaders() });
        if (res.ok) {
          const data = await res.json();
          setHistory(
            data.history.map((p: any) => ({
              ...p,
              createdAt: new Date(p.createdAt),
              completedModules: p.completedModules.map((m: any) => ({
                ...m,
                completedAt: new Date(m.completedAt),
              })),
            }))
          );
        }
      } catch (err) {
        console.error('Failed to fetch history:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
    // Clear emotion state when user switches
    clearEmotionSignal();
  }, [user, clearEmotionSignal]);

  // ── Path management ──────────────────────────────────────────────────────
  const addLearningPath = async (
    path: Omit<LearningPathHistory, 'id' | 'createdAt' | 'completedModules'> & {
      modules: any[];
    }
  ) => {
    try {
      const res = await fetch('/api/paths', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(path),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to save path');

      const newPath: LearningPathHistory = {
        ...path,
        id: data.id,
        createdAt: new Date(),
        completedModules: [],
      };
      setHistory((prev) => [newPath, ...prev]);
      return data.id;
    } catch (err: any) {
      toast.error(err.message);
      return '';
    }
  };

  const updateModuleCompletion = async (pathId: string, module: CompletedModule) => {
    try {
      const res = await fetch(`/api/paths/${pathId}/progress`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(module),
      });
      if (!res.ok) throw new Error('Failed to update progress');

      setHistory((prev) =>
        prev.map((p) =>
          p.id === pathId
            ? {
              ...p,
              completedModules: [
                ...p.completedModules.filter((m) => m.id !== module.id),
                module,
              ],
            }
            : p
        )
      );
    } catch (err: any) {
      toast.error(err.message);
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
      const res = await fetch(`/api/paths/${pathId}`, {
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
