import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useMood, moodConfig, MoodType } from '@/contexts/MoodContext';
import { useProgress } from '@/contexts/ProgressContext';
import { 
  CheckCircle2, 
  Clock, 
  ChevronRight, 
  Play, 
  Star, 
  Target, 
  Flame, 
  Award, 
  Zap,
  Activity,
  Heart,
  Sparkles,
  Lightbulb,
  Video,
  Mic,
  Camera,
  Brain,
  Wifi,
  Radio,
  ArrowLeft,
  ArrowRight,
  History,
  Trophy,
  XCircle,
  ChevronUp,
  ExternalLink,
  FileText,
  BookOpen
} from 'lucide-react';
import { useNeuralTracking } from '@/contexts/NeuralContext';
import { LivingIcon } from './LivingIcon';
import { cn } from '@/lib/utils';
import React, { useState, useEffect, useRef } from 'react';
import { ModuleQuiz } from '@/components/ModuleQuiz';
import { MagneticButton } from './ui/MagneticButton';
import { RevealSection } from './ui/RevealSection';
import { TiltCard } from './ui/TiltCard';
import { NeuralIcon } from './ui/NeuralIcon';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;   // 0-based index into options[]
  explanation: string;
}

interface LearningModule {
  id: number;
  title: string;
  type: 'video' | 'article' | 'quiz';
  duration: string;
  completed: boolean;
  searchQuery?: string;
  youtubeUrl?: string;
  articleContent?: string;
  questions?: QuizQuestion[];  // only on quiz-type modules
}

interface QuizState {
  currentIndex: number;
  selectedAnswer: number | null;
  answered: boolean;
  score: number;
  finished: boolean;
  answers: number[];
}

function freshQuiz(): QuizState {
  return { currentIndex: 0, selectedAnswer: null, answered: false, score: 0, finished: false, answers: [] };
}

// ─── InlineQuiz: renders questions from the backend ──────────────────────────

function InlineQuiz({
  module,
  moodGradient,
  onComplete,
}: {
  module: LearningModule;
  moodGradient: string;
  onComplete: (score: number, total: number) => void;
}) {
  const questions = module.questions ?? [];
  const [s, setS] = useState<QuizState>(freshQuiz());

  if (questions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        No questions found for this quiz.
        <Button className="mt-4 block mx-auto" variant="mood" size="sm"
          onClick={() => onComplete(0, 0)}>
          Mark complete
        </Button>
      </div>
    );
  }

  const q = questions[s.currentIndex];
  const isLast = s.currentIndex === questions.length - 1;

  const select = (i: number) => { if (!s.answered) setS(p => ({ ...p, selectedAnswer: i })); };

  const confirm = () => {
    if (s.selectedAnswer === null || s.answered) return;
    const correct = s.selectedAnswer === q.correctAnswer;
    setS(p => ({
      ...p,
      answered: true,
      score: correct ? p.score + 1 : p.score,
      answers: [...p.answers, s.selectedAnswer!],
    }));
  };

  const next = () => {
    if (isLast) setS(p => ({ ...p, finished: true }));
    else setS(p => ({ ...p, currentIndex: p.currentIndex + 1, selectedAnswer: null, answered: false }));
  };

  // Results screen
  if (s.finished) {
    const pct = Math.round((s.score / questions.length) * 100);
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="rounded-xl border border-border bg-card/50 p-8 text-center space-y-4">
        <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center bg-gradient-to-br ${moodGradient}`}>
          {pct >= 60 ? <Trophy className="w-8 h-8" /> : <Brain className="w-8 h-8" />}
        </div>
        <h3 className="text-xl font-bold">{pct >= 60 ? 'Quiz Passed!' : 'Good Effort!'}</h3>
        <p className="text-muted-foreground">
          <span className="font-bold text-foreground">{s.score}</span> / <span className="font-bold text-foreground">{questions.length}</span> correct ({pct}%)
        </p>

        {/* Per-question review */}
        <div className="text-left space-y-2 mt-4 max-h-64 overflow-y-auto pr-1">
          {questions.map((qq, i) => {
            const userAns = s.answers[i];
            const ok = userAns === qq.correctAnswer;
            return (
              <div key={qq.id} className={cn('rounded-lg border p-3 text-sm',
                ok ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5')}>
                <p className="font-medium text-foreground mb-1">{qq.question}</p>
                <p className={ok ? 'text-green-400' : 'text-red-400'}>
                  {ok ? 'PASS' : 'FAIL'} You answered: {qq.options[userAns]}
                </p>
                {!ok && <p className="text-green-400 text-xs mt-0.5">Correct: {qq.options[qq.correctAnswer]}</p>}
                <p className="text-muted-foreground text-xs mt-1 italic">{qq.explanation}</p>
              </div>
            );
          })}
        </div>

        <Button variant="mood" onClick={() => onComplete(s.score, questions.length)}>
          <CheckCircle2 className="w-4 h-4 mr-2" /> {"Complete Module"}
        </Button>
      </motion.div>
    );
  }

  // Active question
  return (
    <motion.div key={s.currentIndex} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
      className="rounded-xl border border-border bg-card/50 p-6 space-y-5">
      {/* Progress bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Question {s.currentIndex + 1} of {questions.length}</span>
        <span>{s.score} correct</span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${moodGradient} transition-all duration-500`}
          style={{ width: `${(s.currentIndex / questions.length) * 100}%` }} />
      </div>

      <p className="text-base font-semibold text-foreground leading-snug">{q.question}</p>

      {/* Options */}
      <div className="space-y-2">
        {q.options.map((opt, i) => {
          const isSelected = i === s.selectedAnswer;
          const isCorrect = i === q.correctAnswer;
          const isWrong = s.answered && isSelected && !isCorrect;

          return (
            <button key={i} onClick={() => select(i)} disabled={s.answered}
              className={cn(
                'w-full text-left rounded-lg border px-4 py-3 text-sm transition-all duration-200',
                !s.answered && isSelected && 'border-primary bg-primary/10 text-foreground',
                !s.answered && !isSelected && 'border-border bg-card/30 text-muted-foreground hover:border-primary/50 hover:bg-primary/5',
                s.answered && isCorrect && 'border-green-500 bg-green-500/10 text-green-400',
                s.answered && isWrong && 'border-red-500 bg-red-500/10 text-red-400 line-through',
                s.answered && !isCorrect && !isWrong && 'border-border/40 bg-card/20 text-muted-foreground/50',
              )}>
              <span className="mr-2 font-mono text-xs opacity-60">{String.fromCharCode(65 + i)}.</span>
              {opt}
              {s.answered && isCorrect && <CheckCircle2 className="inline w-4 h-4 ml-2 text-green-400" />}
              {s.answered && isWrong && <XCircle className="inline w-4 h-4 ml-2 text-red-400" />}
            </button>
          );
        })}
      </div>

      {/* Explanation */}
      <AnimatePresence>
        {s.answered && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn('rounded-lg border px-4 py-3 text-sm',
              s.selectedAnswer === q.correctAnswer
                ? 'border-green-500/30 bg-green-500/5 text-green-300'
                : 'border-red-500/30  bg-red-500/5  text-red-300')}>
            <span className="font-semibold mr-1">
              {s.selectedAnswer === q.correctAnswer ? 'Correct!' : 'Not quite.'}
            </span>
            {q.explanation}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-end gap-2">
        {!s.answered
          ? <Button variant="mood" size="sm" disabled={s.selectedAnswer === null} onClick={confirm}>Confirm Answer</Button>
          : <Button variant="mood" size="sm" onClick={next}>
            {isLast ? 'See Results' : 'Next Question'}<ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        }
      </div>
    </motion.div>
  );
}

// ─── Emotional feedback messages (richer than motivation banner) ─────────────

const EMOTIONAL_FEEDBACK: Record<string, { message: string; iconName: string; tip: string }> = {
  anxious: { message: "Take it slow - you're doing well", iconName: 'Heart', tip: 'One module at a time.' },
  sad: { message: "Learning is a small act of self-care", iconName: 'Sun', tip: 'You showed up. That matters.' },
  energetic: { message: "You're in peak learning mode!", iconName: 'Zap', tip: 'Push through - momentum is everything.' },
  bored: { message: "Let's find the spark in this topic", iconName: 'Sparkles', tip: 'Try the most unexpected module first.' },
  focused: { iconName: 'Target', message: "Deep focus engaged", tip: 'Zero distractions. Maximum retention.' },
  calm: { message: "Steady, relaxed, and absorbing", iconName: 'Waves', tip: 'Calm minds learn faster.' },
  motivated: { message: "Unstoppable energy incoming!", iconName: 'Rocket', tip: 'Set a big goal before you start.' },
  creative: { message: "Find the unexpected angle", iconName: 'Palette', tip: 'Ask "what if" at every step.' },
  unmotivated: { message: "Just one small win - that's all", iconName: 'Sprout', tip: 'Start the easiest module. Momentum follows.' },
  curious: { message: "Every module is a rabbit hole", iconName: 'Search', tip: 'Ask why, not just how.' },
};

// ─── ScrollReveal wrapper — fade + slight upward motion on scroll ─────────────

function ScrollReveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 18 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

// ─── Offline fallbacks ────────────────────────────────────────────────────────

const getVideoSearchQuery = (topic: string, title: string) => {
  // Extract short phrase: take part before : or — and cap total length
  const short = title.split(':')[0].split('—')[0].trim();
  const q = `${topic} ${short} explained`;
  return q.length > 80 ? `${topic} ${short}`.slice(0, 80) : q;
};

const generateArticleContent = (topic: string, title: string) =>
  `## ${title}\n\n### Introduction\n\nWelcome to this exploration of **${title}**. This module is part of your learning journey in **${topic}** and is designed to give you both conceptual understanding and practical tools.\n\n### Why This Matters\n\nUnderstanding ${title} is essential for anyone serious about mastering ${topic}. Many learners skip this area, only to find themselves hitting a plateau later. The concepts here form the connective tissue between foundational knowledge and advanced mastery.\n\n### Core Concepts\n\n**The Foundation**: At its heart, ${title} is about understanding the underlying patterns and principles that govern ${topic}. Think of it as learning the grammar of a language rather than just memorizing phrases.\n\n**The Connection**: ${title} doesn't exist in isolation. It connects to virtually every other aspect of ${topic} you'll encounter in this learning path.\n\n**The Application**: Theory without application is incomplete. The practical exercise below is specifically designed to bridge this gap.\n\n### Deep Exploration\n\nLet's examine the key dimensions more closely.\n\n**Historical Context**: Every field has a history, and understanding how ${title} evolved helps you appreciate *why* certain approaches work better than others. The evolution wasn't random — it was driven by systematic observation, experimentation, and refinement.\n\n**Practical Methodology**: There are several proven approaches to mastering ${title}. For beginners, a structured step-by-step approach works best. For intermediate learners, a more exploratory, question-driven approach accelerates growth.\n\n**Common Misconceptions**: One of the biggest misconceptions about ${title} is that it can be mastered quickly through surface-level study. In reality, it rewards depth over breadth.\n\n### Practical Exercise\n\n1. **Reflect**: Write down what you currently understand about ${title}.\n2. **Observe**: Look for examples of ${title} in your daily life.\n3. **Apply**: Try to explain one concept from this module to someone else.\n4. **Connect**: How does ${title} relate to your broader goals?\n\n### Key Takeaways\n\n- ${title} is a critical building block for mastery in ${topic}\n- The concepts here form the foundation for everything that follows\n- True understanding comes from *applying* these ideas\n- Revisit this module after completing later ones — you'll see it with fresh eyes`;

const generateModules = (topic: string, format = 'mixed'): LearningModule[] => {
  const titles = [
    `What is ${topic}? — Complete Overview`,
    `Historical Context & Origins of ${topic}`,
    `Core Principles of ${topic}`,
    `Essential Vocabulary & Key Concepts`,
    `How ${topic} Works in Practice`,
    `Knowledge Check: Foundations`,
    `Common Approaches to ${topic}`,
    `Hands-On: Your First Exercise with ${topic}`,
    `Intermediate ${topic}: Going Deeper`,
    `Analyzing Real-World Examples`,
    `Checkpoint: Core Understanding`,
    `Advanced Concepts in ${topic}`,
    `Connecting ${topic} to Related Fields`,
    `Expert-Level ${topic} Techniques`,
    `Final Assessment: ${topic} Mastery`,
  ];
  const all: LearningModule[] = titles.map((title, i) => {
    const isQuiz = title.startsWith('Knowledge Check') || title.startsWith('Checkpoint') || title.startsWith('Final Assessment');
    const isVideo = !isQuiz && (format === 'videos' || (format === 'mixed' && i % 2 === 0));
    const isArticle = !isQuiz && !isVideo;
    return {
      id: i + 1,
      title,
      type: isQuiz ? 'quiz' as const : isVideo ? 'video' as const : 'article' as const,
      duration: isQuiz ? '10 min' : `${10 + Math.floor(Math.random() * 10)} min`,
      completed: false,
      ...(isVideo ? { searchQuery: getVideoSearchQuery(topic, title) } : {}),
      ...(isArticle ? { articleContent: generateArticleContent(topic, title) } : {}),
      ...(isQuiz ? { questions: [] } : {}),
    };
  });
  return all;
};

// ─── Main component ───────────────────────────────────────────────────────────

// ── Font Mapping for Scoped Typography ──
const MOOD_FONTS: Record<string, string> = {
  energetic: 'font-energetic',
  motivated: 'font-energetic', 
  calm: 'font-calm',
  anxious: 'font-calm', 
  focused: 'font-focused', 
  creative: 'font-creative',
  curious: 'font-creative',
  default: 'font-calm'
};

const TypeIcon = ({ type, className }: { type: string, className?: string }) => {
  switch (type) {
    case 'video': return <Video className={className || "w-4 h-4"} />;
    case 'article': return <FileText className={className || "w-4 h-4"} />;
    case 'quiz': return <Trophy className={className || "w-4 h-4"} />;
    default: return <BookOpen className={className || "w-4 h-4"} />;
  }
};

export function LearningPathView() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { moodColors, mood } = useMood();
  const { history, addLearningPath, updateModuleCompletion, removeModuleCompletion, getPathById } = useProgress();
  const { 
    isCamActive, setIsCamActive, 
    isMicActive, setIsMicActive, 
    currentEmotion, confidence, 
    voiceEmotion, voiceConfidence,
    liveEmotion, liveConfidence,
    videoRef, audioLevel 
  } = useNeuralTracking();

  const toggleMic = () => setIsMicActive(!isMicActive);
  const toggleCam = () => setIsCamActive(!isCamActive);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothX = useSpring(mouseX, { stiffness: 40, damping: 30 });
  const smoothY = useSpring(mouseY, { stiffness: 40, damping: 30 });
  const blobX = useTransform(smoothX, [-1, 1], [-30, 30]);
  const blobY = useTransform(smoothY, [-1, 1], [-20, 20]);
  const blob2X = useTransform(smoothX, [-1, 1], [20, -20]);
  const blob2Y = useTransform(smoothY, [-1, 1], [15, -15]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      mouseX.set((e.clientX / window.innerWidth - 0.5) * 2);
      mouseY.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener('mousemove', h);
    return () => window.removeEventListener('mousemove', h);
  }, [mouseX, mouseY]);

  const locationState = location.state as {
    topic: string; mood: string; speed: string; format: string; goal: string;
    pathId?: string; suggestedDifficulty?: string | null;
    emotionSource?: string | null; detectedConfidence?: number | null;
    modules?: LearningModule[];
  } | null;

  const [pathId, setPathId] = useState<string | null>(searchParams.get('id') || locationState?.pathId || null);
  
  // Recover path metadata if location state is missing
  const recoveredPath = pathId ? getPathById(pathId) : undefined;
  
  const pathData = {
    topic: locationState?.topic || recoveredPath?.topic || '',
    mood: (locationState?.mood || recoveredPath?.mood || 'energetic') as MoodType,
    speed: locationState?.speed || recoveredPath?.speed || 'moderate',
    format: locationState?.format || recoveredPath?.format || 'mixed',
    goal: locationState?.goal || recoveredPath?.goal || '',
    suggestedDifficulty: locationState?.suggestedDifficulty || recoveredPath?.suggestedDifficulty || 'beginner',
    pathId: pathId,
    modules: (recoveredPath?.modules || locationState?.modules) || []
  };
  
  const currentMoodColors = moodColors || moodConfig[pathData.mood] || moodConfig.energetic;
  const [modules, setModules] = useState<LearningModule[]>(pathData.modules);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [expandedModule, setExpandedModule] = useState<number | null>(null);
  const [quizActiveFor, setQuizActiveFor] = useState<number | null>(null);
  const [quizCompletedFor, setQuizCompletedFor] = useState<Set<number>>(new Set());
  const [videoIds, setVideoIds] = useState<Record<number, string | 'loading' | 'error'>>({});
  const [videoFallbacks, setVideoFallbacks] = useState<Record<number, string>>({});
  const [quizScores, setQuizScores] = useState<Record<number, { score: number; total: number }>>({});
  const [nextTopics, setNextTopics] = useState<Array<{topic: string; reason: string; difficulty: string}>>([]);

  async function fetchVideoId(moduleId: number, q: string) {
    setVideoIds(p => ({ ...p, [moduleId]: 'loading' }));
    try {
      const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(q)}&topic=${encodeURIComponent(pathData.topic)}`);
      const data = await res.json();
      if (data.videoId) {
        setVideoIds(p => ({ ...p, [moduleId]: data.videoId }));
        // Also update the module duration in the list if we got a real one
        if (data.duration) {
          setModules(prev => prev.map(m => m.id === moduleId ? { ...m, duration: data.duration } : m));
        }
      } else {
        setVideoIds(p => ({ ...p, [moduleId]: 'error' }));
        // Store fallback URL if provided
        if (data.fallbackUrl) {
          setVideoFallbacks(p => ({ ...p, [moduleId]: data.fallbackUrl }));
        }
      }
    } catch { setVideoIds(p => ({ ...p, [moduleId]: 'error' })); }
  }

  async function fetchLearningPath() {
    if (!pathData.topic) { setLoading(false); return; }
    setLoading(true); setError(null); setIsFallback(false);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3 * 60 * 1000); 
    try {
      const res = await fetch('/api/generate-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          topic: pathData.topic, goal: pathData.goal, mood: pathData.mood,
          format: pathData.format, speed: pathData.speed,
          suggestedDifficulty: pathData.suggestedDifficulty || 'beginner',
        }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      if (data.status === 'error' || !data.modules?.length) {
        setIsFallback(true);
        setupPathState(generateModules(pathData.topic, pathData.format));
      } else {
        setupPathState(data.modules);
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      setIsFallback(true);
      setError(isAbort ? 'AI generation timed out — defaulting to offline path.' : (err instanceof Error ? err.message : 'AI is temporarily busy. Using offline fallback.'));
      setupPathState(generateModules(pathData.topic, pathData.format));
    } finally { clearTimeout(timeoutId); setLoading(false); }
  }


  async function setupPathState(mods: LearningModule[]) {
    if (pathId && !locationState) {
      const ex = getPathById(pathId);
      if (ex) {
        setModules(ex.modules || mods || []);
        setModules(prev => (prev || []).map(m => ({
          ...m,
          completed: (ex.completedModules || []).some(c => c.id === m.id)
        })));
        return;
      }
    }

    if (pathData.topic && !pathId) {
      const id = await addLearningPath({
        topic: pathData.topic,
        mood: pathData.mood,
        speed: pathData.speed,
        format: pathData.format,
        goal: pathData.goal,
        totalModules: mods.length,
        modules: mods
      });
      setPathId(id);
      setModules(mods);
      setSearchParams({ id }, { replace: true });
      return;
    }

    setModules(mods);
  }

  useEffect(() => {
    const idFromUrl = searchParams.get('id');
    if (idFromUrl) {
      const ex = getPathById(idFromUrl);
      if (ex) {
        setPathId(idFromUrl);
        const mods = ex.modules || [];
        setModules(mods.map(m => ({
          ...m,
          completed: (ex.completedModules || []).some(c => c.id === m.id)
        })));
        setLoading(false);
        return;
      }
    }

    if (pathData.topic && modules.length === 0) {
      fetchLearningPath();
    } else {
      setLoading(false);
    }
  }, [pathId, history.length]); 

  const toggleComplete = (module: LearningModule) => {
    if (!pathId) return;
    const next = !module.completed;
    if (next) updateModuleCompletion(pathId, { id: module.id, title: module.title, type: module.type, completedAt: new Date() });
    else removeModuleCompletion(pathId, module.id);
    setModules(p => p.map(m => m.id === module.id ? { ...m, completed: next } : m));
  };

  const handleMarkComplete = (module: LearningModule, e: React.MouseEvent) => {
    e.stopPropagation();
    if (quizCompletedFor.has(module.id)) toggleComplete(module);
    else setQuizActiveFor(module.id);
  };

  const handleModuleQuizComplete = (id: number, score: number, total: number) => {
    setQuizActiveFor(null);
    setQuizCompletedFor(p => new Set(p).add(id));
    const m = modules.find(m => m.id === id);
    if (m && !m.completed) toggleComplete(m);
  };

  const handleModuleQuizSkip = (id: number) => {
    setQuizActiveFor(null);
    setQuizCompletedFor(p => new Set(p).add(id));
    const m = modules.find(m => m.id === id);
    if (m && !m.completed) toggleComplete(m);
  };

  const handleInlineQuizComplete = (id: number, score: number, total: number) => {
    setQuizScores(p => ({ ...p, [id]: { score, total } }));
    const m = modules.find(m => m.id === id);
    if (m && !m.completed) toggleComplete(m);
  };

  const toggleExpand = (moduleId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = expandedModule === moduleId ? null : moduleId;
    setExpandedModule(next);
    if (next !== null) {
      const mod = modules.find(m => m.id === moduleId);
      if (mod?.type === 'video' && mod.searchQuery && !videoIds[moduleId]) fetchVideoId(moduleId, mod.searchQuery);
    }
  };

  const openYT = (q: string) => window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, '_blank');

  const completedCount = modules.filter(m => m.completed).length;
  const progress = modules.length > 0 ? (completedCount / modules.length) * 100 : 0;

  // Fetch next-topic suggestions when path is fully completed
  useEffect(() => {
    if (progress === 100 && modules.length > 0 && nextTopics.length === 0 && pathData.topic) {
      fetch('/api/suggest-next-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: pathData.topic, goal: pathData.goal })
      })
        .then(r => r.json())
        .then(d => { if (d.suggestions) setNextTopics(d.suggestions); })
        .catch(() => {});
    }
  }, [progress, modules.length]);

  if (!pathData.topic && !loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">No learning path found</h2>
        <Button onClick={() => navigate('/create-path')}>Create One</Button>
      </div>
    </div>
  );

  const loadingMessages: Record<string, string> = {
    anxious: 'Taking it step by step, building your path gently...',
    sad: 'Crafting something warm and achievable just for you...',
    energetic: 'Assembling a high-octane curriculum - hold tight!',
    bored: 'Finding the most interesting angles on this topic...',
    focused: 'Structuring a deep, logical learning sequence...',
    calm: 'Building a steady, well-paced path for you...',
    motivated: 'Designing an ambitious curriculum to push you forward...',
    creative: 'Exploring unconventional angles on your topic...',
    unmotivated: 'Starting with quick wins to get your momentum going...',
    curious: 'Diving deep - finding the fascinating why behind everything...',
  };

  if (loading) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 bg-background relative overflow-hidden">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br ${currentMoodColors.gradient} rounded-full blur-[120px] opacity-10`} />
      <div className="relative z-10 flex flex-col items-center gap-6">
        <NeuralIcon 
          icon={Brain} 
          className="w-24 h-24 mb-4" 
          iconClassName="w-10 h-10"
          gradient={currentMoodColors.gradient}
        />
        <p className="max-w-sm text-center text-lg font-medium tracking-wide animate-pulse">
          {loadingMessages[pathData.mood] ?? 'Generating your personalised learning path...'}
        </p>
        <div className="w-full max-w-xl space-y-4 mt-8">
          {[1, 2, 3].map(n => (
            <div key={n} className="space-y-3 rounded-2xl border border-border/30 bg-card/20 p-6 glass-card">
              <div className={`h-4 w-3/4 rounded-full bg-gradient-to-r ${currentMoodColors.gradient} opacity-20`} />
              <div className="h-3 w-1/4 rounded-full bg-muted-foreground/20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (error && !isFallback) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center bg-background">
      <p className="text-lg font-medium opacity-90">Couldn't generate your path right now.</p>
      <p className="max-w-sm text-sm opacity-60">{error}</p>
      <Button onClick={fetchLearningPath} variant="outline">Try again</Button>
    </div>
  );

  return (
    <div className={cn(
      "min-h-screen bg-transparent",
      MOOD_FONTS[mood] || MOOD_FONTS.default
    )}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div className={`absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br ${currentMoodColors.gradient} rounded-full blur-3xl opacity-10 will-change-transform`} style={{ x: blobX, y: blobY }} />
        <motion.div className={`absolute bottom-1/4 left-0 w-[400px] h-[400px] bg-gradient-to-tr ${currentMoodColors.gradient} rounded-full blur-[100px] opacity-[0.06] will-change-transform`} style={{ x: blob2X, y: blob2Y }} />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:64px_64px] opacity-20" />
      </div>

      <div className="relative z-10 container mx-auto px-6 py-12">
        {/* Nav */}
        <div className="flex items-center justify-between gap-4 mb-12">
          <MagneticButton variant="ghost" onClick={() => navigate('/')} className="flex items-center gap-2 group">
            <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
            <span className="font-medium">Return Home</span>
          </MagneticButton>
          <MagneticButton variant="outline" onClick={() => navigate('/progress')} className="flex items-center gap-2">
            <History className="w-5 h-5" />
            <span className="font-medium">Learning History</span>
          </MagneticButton>
        </div>

        {/* Header Hero Section */}
        <RevealSection>
          <TiltCard className="relative overflow-hidden group mb-12 rounded-[2.5rem] border border-white/10 bg-white/5 backdrop-blur-lg">
            {/* Background Glow */}
            <div className={cn("absolute -top-24 -right-24 w-64 h-64 blur-[100px] opacity-20 transition-all duration-1000", currentMoodColors.gradient)} />
            
            <div className="p-10 md:p-14 relative z-10">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-10">
                <div className="space-y-6 flex-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono tracking-widest text-primary uppercase">
                    <Activity className="w-3 h-3" />
                    Neural Generation Complete
                  </div>
                  <h1 className="text-5xl md:text-7xl font-display font-black tracking-tighter leading-[0.85]">
                    {pathData.topic}
                    <span className={cn("block bg-gradient-to-r bg-clip-text text-transparent mt-2", moodColors.gradient)}>
                      MASTERY
                    </span>
                  </h1>
                  
                  <div className="flex flex-wrap gap-4 pt-4">
                    {pathData.mood && moodConfig[pathData.mood as MoodType] && (
                      <div className={cn(
                        "flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold border border-white/10 backdrop-blur-sm",
                        `bg-gradient-to-r ${moodConfig[pathData.mood as MoodType].gradient} bg-opacity-10 text-foreground`
                      )}>
                        <LivingIcon iconName={(moodConfig[(pathData.mood?.toLowerCase() || 'focused') as MoodType] || moodConfig.focused).iconName} size="sm" isInteractive={false} />
                        <span>Resonating {(moodConfig[(pathData.mood?.toLowerCase() || 'focused') as MoodType] || moodConfig.focused).label}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold bg-white/5 border border-white/10 text-white/60">
                      <Target className="w-4 h-4" />
                      <span className="capitalize">{pathData.suggestedDifficulty} Masterclass</span>
                    </div>
                  </div>
                </div>

                 <div className="hidden lg:flex items-center gap-10">
                    <NeuralMirror 
                      videoRef={videoRef}
                      isActive={isCamActive}
                      emotion={liveEmotion}
                      confidence={liveConfidence}
                    />

                   <div className="flex items-center gap-10 bg-black/20 rounded-[2.5rem] p-10 backdrop-blur-xl">
                    <div className="text-center space-y-1">
                      <div className="flex items-center justify-center gap-2 text-5xl font-black tabular-nums">
                        <Flame className="w-10 h-10 text-orange-500" />
                        {completedCount}
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">Milestones</span>
                    </div>
                    <div className="w-[1px] h-16 bg-white/5" />
                    <div className="text-center space-y-1">
                      <div className="text-5xl font-black tabular-nums">{Math.round(progress)}%</div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">Completion</span>
                    </div>
                   </div>
                 </div>
              </div>

              {/* Enhanced Progress Bar */}
              <div className="mt-14 relative h-4 bg-white/5 rounded-full overflow-hidden border border-white/5 p-1">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
                  className={cn("h-full rounded-full bg-gradient-to-r relative", moodColors.gradient)}
                >
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  />
                </motion.div>
              </div>
            </div>
          </TiltCard>
        </RevealSection>

        {/* ── Neural Dashboard ── */}
        <motion.div
           layout
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           className="relative mb-8 rounded-[2.5rem] overflow-hidden bg-white/[0.03] backdrop-blur-2xl group/dash"
        >
          {/* Ambient Glows Instead of Borders */}
          <div className={cn("absolute inset-0 opacity-20 transition-all duration-1000 bg-gradient-to-br", moodColors.gradient)} />
          
          <div className="relative p-8 space-y-6">
            <div className="flex items-center justify-between pb-6 border-b border-white/5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center relative overflow-hidden group">
                  <div className={cn("absolute inset-0 opacity-20 blur-sm animate-pulse", moodColors.gradient)} />
                  <Brain className="w-5 h-5 text-primary relative z-10" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight uppercase opacity-90">Cognitive Hub</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <motion.div 
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-1.5 h-1.5 rounded-full bg-primary" 
                    />
                    <span className="text-[10px] font-mono uppercase tracking-widest opacity-40">Neural Link Active</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                {/* Voice Status HUD */}
                <div className="flex items-center gap-4 px-4 py-2 rounded-2xl bg-white/5 backdrop-blur-3xl shadow-2xl">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Mic className={cn("w-3.5 h-3.5 transition-colors duration-500", isMicActive ? "text-primary" : "text-white/20")} />
                      {isMicActive && (
                        <motion.div 
                          layoutId="micActive"
                          className="absolute -inset-1 blur-sm bg-primary/20 rounded-full"
                        />
                      )}
                    </div>
                    <Waveform level={audioLevel} />
                  </div>
                  <div className="w-[px] h-4 bg-white/5" />
                  <div className="min-w-[80px]">
                    <p className="text-[8px] font-mono uppercase tracking-tighter opacity-40 italic">Vocal resonance</p>
                    <p className="text-xs font-bold truncate tracking-tight">{isMicActive ? (voiceEmotion === 'Unknown' ? 'Analyzing...' : voiceEmotion) : 'Resting'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end">
                    <span className="text-[8px] font-mono uppercase tracking-[0.2em] opacity-40">Neural Sync</span>
                    <span className="text-xs font-bold tabular-nums tracking-tighter">
                      {Math.min(100, Math.round(((confidence || 0.4) + (voiceConfidence || 0.4)) / (isCamActive && isMicActive ? 2 : 1) * 100))}%
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center p-2 relative">
                     <div className={cn("absolute inset-0 blur-md opacity-20", moodColors.gradient)} />
                     <motion.div 
                       animate={{ rotate: 360 }} 
                       transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                       className="w-full h-full rounded-full border border-white/10 border-t-primary"
                     />
                     <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-1 h-1 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                     </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Mood Feedback Section */}
              {(() => {
                const fb = EMOTIONAL_FEEDBACK[mood];
                if (!fb) return null;
                return (
                  <div className="md:col-span-2 flex items-start gap-6 p-6 rounded-3xl bg-white/5 transition-all duration-300">
                    <div className="shrink-0">
                      <LivingIcon iconName={fb.iconName} size="lg" isInteractive={true} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span className="text-[10px] font-mono uppercase tracking-widest text-primary">Neural Reflection</span>
                      </div>
                      <p className="text-xl font-bold text-foreground leading-tight tracking-tight">{fb.message}</p>
                      <p className="text-sm text-muted-foreground mt-3 leading-relaxed opacity-60 font-medium">{fb.tip}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Next Action Section */}
              {(() => {
                const next = modules.find(m => !m.completed);
                if (!next || progress === 100) {
                   return (
                    <div className="flex flex-col items-center justify-center p-6 rounded-3xl bg-primary/5 border border-primary/10 text-center">
                      <Award className="w-10 h-10 text-primary mb-3" />
                      <p className="text-sm font-bold text-primary tracking-tight">Path Mastered!</p>
                      <p className="text-[10px] font-medium opacity-50 mt-1 uppercase tracking-widest text-primary">Neural Alignment Complete</p>
                    </div>
                   );
                }
                return (
                  <div 
                    className="flex flex-col p-6 rounded-3xl bg-primary/10 cursor-pointer group/next hover:bg-primary/20 transition-all duration-500 overflow-hidden relative"
                    onClick={() => {
                      const el = document.getElementById(`module-${next.id}`);
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover/next:scale-150 transition-transform duration-700">
                      <Target className="w-16 h-16 text-primary" />
                    </div>
                    
                    <div className="relative z-10">
                      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center mb-4">
                        <Play className="w-5 h-5 text-primary fill-primary" />
                      </div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold">Priority Milestone</p>
                      <h4 className="text-lg font-bold text-foreground mt-1 line-clamp-2">{next.title}</h4>
                      
                      <div className="flex items-center gap-2 mt-4 text-[10px] font-bold text-primary">
                        <span>RESUME MODULE</span>
                        <ChevronRight className="w-3.5 h-3.5 group-hover/next:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </motion.div>

        {/* Module list */}
        <div className="space-y-4">
          {modules.map((module, index) => {
            const isExpanded = expandedModule === module.id;
            const savedScore = quizScores[module.id];
            const isActive = isExpanded;

            return (
              <div key={module.id} className="relative">
                    {/* Kinetic Neural Thread */}
                    {index !== modules.length - 1 && (
                      <div className="absolute left-[3.5rem] top-24 bottom-[-1rem] w-px z-0 overflow-hidden">
                        <motion.div 
                          className={cn("absolute inset-0 w-full h-full opacity-20", moodColors.gradient)}
                        />
                        <motion.div 
                          animate={{ y: ['-100%', '100%'] }}
                          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                          className="absolute inset-0 w-full h-20 bg-gradient-to-b from-transparent via-white/40 to-transparent"
                        />
                      </div>
                    )}

                    <TiltCard
                      key={module.id}
                      className={cn(
                        'group rounded-[2rem] overflow-hidden transition-all duration-500 will-change-transform relative z-10',
                        module.completed ? 'opacity-80' : 'opacity-100'
                      )}
                    >
                      <div className={cn(
                        module.completed ? 'bg-foreground/[0.02]' : 'bg-secondary/10 hover:bg-secondary/20',
                        isActive && 'bg-secondary/30 ring-1 ring-foreground/10'
                      )}>
                        <div className={cn(
                          'w-16 h-16 rounded-[1.25rem] flex items-center justify-center transition-all duration-700 shrink-0 shadow-lg',
                          module.completed ? `bg-gradient-to-br ${moodColors.gradient} scale-95` : 'bg-secondary/50 group-hover:bg-secondary/80'
                        )}>
                          {module.completed ? (
                            <CheckCircle2 className="w-8 h-8 text-foreground" />
                          ) : (
                            <span className="font-display font-black text-2xl text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h3 className={cn(
                            'text-xl font-bold tracking-tight transition-all truncate mb-2',
                            module.completed ? 'text-muted-foreground/60 line-through' : 'text-foreground'
                          )}>
                            {module.title}
                          </h3>
                          <div className="flex items-center gap-5 text-xs font-mono text-white/40 uppercase tracking-[0.2em]">
                            <span className="flex items-center gap-2 bg-white/5 px-2 py-0.5 rounded-md">
                              <TypeIcon type={module.type} className="w-3.5 h-3.5 text-primary" />
                              {module.type}
                            </span>
                            <span className="flex items-center gap-2 bg-white/5 px-2 py-0.5 rounded-md">
                              <Clock className="w-3.5 h-3.5 text-white/20" />
                              {module.type === 'article' ? 'READ TIME: ' : ''}
                              {module.duration.toUpperCase()}
                            </span>
                            {module.completed && <span className="text-primary/80 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />Validated</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <MagneticButton
                            variant={isExpanded ? 'secondary' : 'mood'}
                            size="lg"
                            onClick={(e) => toggleExpand(module.id, e)}
                            className="h-14 px-8 rounded-2xl font-black shadow-xl"
                          >
                            {isExpanded ? (
                              <div className="flex items-center gap-2">
                                <ChevronUp className="w-5 h-5" />
                                <span>Collapse</span>
                              </div>
                            ) : module.completed ? (
                              <div className="flex items-center gap-2">
                                <History className="w-5 h-5" />
                                <span>Review</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Play className="w-5 h-5" />
                                <span>Initiate</span>
                              </div>
                            )}
                          </MagneticButton>
                        </div>
                      </div>
                    </TiltCard>

                  {/* Expanded panel */}

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                        <div className="px-6 pb-6 space-y-4">

                          {/* VIDEO */}
                          {module.type === 'video' && module.searchQuery && (<>
                            <div className="rounded-xl overflow-hidden bg-card/50 border border-border">
                              <div className="aspect-video relative bg-black/40 flex items-center justify-center">
                                {videoIds[module.id] === 'loading' && (
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                                  </div>
                                )}
                                {videoIds[module.id] && videoIds[module.id] !== 'loading' && videoIds[module.id] !== 'error' && (
                                  <iframe width="100%" height="100%" className="w-full h-full absolute inset-0"
                                    src={`https://www.youtube.com/embed/${videoIds[module.id]}?autoplay=0&rel=0`}
                                    title={module.title} frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen />
                                )}
                                {(!videoIds[module.id] || videoIds[module.id] === 'error') && (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 bg-black/60">
                                    <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                                      <svg className="w-8 h-8 text-red-400" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                                    </div>
                                    <p className="text-sm text-white/60 text-center">Video temporarily unavailable</p>
                                    <div className="flex gap-3">
                                      <button
                                        onClick={() => fetchVideoId(module.id, module.searchQuery!)}
                                        className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium text-white/80 transition-colors"
                                      >
                                        ↻ Retry
                                      </button>
                                      <a href={videoFallbacks[module.id] || `https://www.youtube.com/results?search_query=${encodeURIComponent(module.searchQuery || '')}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-sm font-medium text-red-300 transition-colors"
                                      >
                                        Watch on YouTube →
                                      </a>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="p-4 bg-card/30 border-t border-border flex items-center justify-between gap-3 flex-wrap">
                                <Button variant="outline" size="sm" onClick={() => openYT(module.searchQuery!)}>
                                  <ExternalLink className="w-4 h-4 mr-2" />More on YouTube
                                </Button>
                                {!module.completed && quizActiveFor !== module.id && (
                                  <Button variant="mood" size="sm" onClick={(e) => handleMarkComplete(module, e)}>
                                    <CheckCircle2 className="w-4 h-4 mr-1" />Mark as Complete
                                  </Button>
                                )}
                                {module.completed && (
                                  <span className="text-sm text-primary font-medium flex items-center gap-1.5">
                                    <CheckCircle2 className="w-4 h-4" />Completed
                                  </span>
                                )}
                              </div>
                            </div>
                            {quizActiveFor === module.id && (
                              <ModuleQuiz topic={pathData.topic} moduleTitle={module.title} moduleType={module.type}
                                moodGradient={moodColors.gradient}
                                questions={module.questions}
                                onComplete={(s, t) => handleModuleQuizComplete(module.id, s, t)}
                                onSkip={() => handleModuleQuizSkip(module.id)} />
                            )}
                          </>)}

                          {/* ARTICLE */}
                          {module.type === 'article' && module.articleContent && (<>
                            <div className="bg-card/50 rounded-xl p-6 max-h-[600px] overflow-y-auto border border-border">
                              <div className="space-y-3">
                                {module.articleContent.split('\n').map((line, i) => {
                                  const t = line.trim();
                                  if (!t) return null;
                                  if (t.startsWith('# ')) return <h1 key={i} className="text-2xl font-bold text-foreground mt-6 mb-3 first:mt-0">{t.slice(2)}</h1>;
                                  if (t.startsWith('## ')) return <h2 key={i} className="text-xl font-semibold text-foreground mt-6 mb-2">{t.slice(3)}</h2>;
                                  if (t.startsWith('### ')) return <h3 key={i} className="text-lg font-medium text-foreground mt-4 mb-2">{t.slice(4)}</h3>;
                                  if (t.startsWith('```')) return <div key={i} className="bg-muted/50 rounded-lg p-4 font-mono text-sm my-4 whitespace-pre-wrap">{t.replace(/```\w*/g, '')}</div>;
                                  if (t.startsWith('|')) return <div key={i} className="font-mono text-sm text-muted-foreground bg-muted/30 px-2 py-1">{t}</div>;
                                  if (t.startsWith('- ')) {
                                    const m2 = t.match(/^- \*\*(.+?)\*\*:?\s*(.*)/);
                                    if (m2) return <div key={i} className="flex gap-2 text-muted-foreground ml-4 py-0.5"><span className="text-primary">-</span><span><strong className="text-foreground">{m2[1]}</strong>{m2[2] ? `: ${m2[2]}` : ''}</span></div>;
                                    return <p key={i} className="text-muted-foreground ml-4 flex gap-2 py-0.5"><span className="text-primary">-</span>{t.slice(2)}</p>;
                                  }
                                  if (t.match(/^\d+\./)) return <p key={i} className="text-muted-foreground ml-4 py-0.5">{t}</p>;
                                  const parts = t.split(/(\*\*[^*]+\*\*)/g);
                                  return <p key={i} className="text-muted-foreground leading-relaxed">{parts.map((p2, j) => p2.startsWith('**') && p2.endsWith('**') ? <strong key={j} className="text-foreground">{p2.slice(2, -2)}</strong> : p2)}</p>;
                                })}
                              </div>
                            </div>
                            <div className="flex justify-end">
                              {!module.completed && quizActiveFor !== module.id
                                ? <Button variant="mood" size="sm" onClick={(e) => handleMarkComplete(module, e)}><CheckCircle2 className="w-4 h-4 mr-1" />Mark as Complete</Button>
                                : module.completed
                                  ? <span className="text-sm text-primary font-medium flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />Completed</span>
                                  : null}
                            </div>
                            {quizActiveFor === module.id && (
                              <ModuleQuiz topic={pathData.topic} moduleTitle={module.title} moduleType={module.type}
                                moodGradient={moodColors.gradient}
                                questions={module.questions}
                                onComplete={(s, t) => handleModuleQuizComplete(module.id, s, t)}
                                onSkip={() => handleModuleQuizSkip(module.id)} />
                            )}
                          </>)}

                          {/* QUIZ MODULE — real questions from backend */}
                          {module.type === 'quiz' && (
                            module.completed ? (
                              <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 text-center space-y-3">
                                <CheckCircle2 className="w-8 h-8 text-primary mx-auto" />
                                <p className="font-semibold text-foreground">Quiz Completed!</p>
                                {savedScore && (
                                  <p className="text-sm text-muted-foreground">
                                    You scored {savedScore.score}/{savedScore.total} ({Math.round((savedScore.score / savedScore.total) * 100)}%)
                                  </p>
                                )}
                                <Button variant="outline" size="sm" onClick={() => {
                                  toggleComplete(module);
                                  setQuizScores(p => { const n = { ...p }; delete n[module.id]; return n; });
                                }}>
                                  Retake Quiz
                                </Button>
                              </div>
                            ) : (
                              <InlineQuiz
                                module={module}
                                moodGradient={moodColors.gradient}
                                onComplete={(score, total) => handleInlineQuizComplete(module.id, score, total)}
                              />
                            )
                          )}

                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Course completion celebration */}
        {progress === 100 && modules.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
            className="mt-8 space-y-6">
            <div className={`rounded-3xl p-8 text-center bg-gradient-to-br ${moodColors.gradient} bg-opacity-20 border border-primary/20`}>
              <Trophy className="w-12 h-12 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Path Complete!</h2>
              <p className="text-muted-foreground mb-2">{moodMessages[mood]?.onComplete ?? 'Amazing work!'}</p>
              {Object.keys(quizScores).length > 0 && (
                <p className="text-sm text-muted-foreground mb-6">
                  Quiz average:{' '}
                  {Math.round(
                    Object.values(quizScores).reduce((acc, s) => acc + (s.score / s.total) * 100, 0) /
                    Object.values(quizScores).length
                  )}%
                </p>
              )}
              <div className="flex gap-4 justify-center flex-wrap">
                <MagneticButton 
                  variant="mood" 
                  onClick={() => navigate('/create-path')}
                  className="h-16 px-10 rounded-2xl text-lg font-bold shadow-2xl"
                >
                  Start a New Path
                </MagneticButton>
                <MagneticButton 
                  variant="outline" 
                  onClick={() => navigate('/progress')}
                  className="h-16 px-10 rounded-2xl text-lg font-bold"
                >
                  View My Progress
                </MagneticButton>
              </div>
            </div>

            {/* Continue Your Journey — Next Topic Suggestions */}
            {nextTopics.length > 0 && (
              <div className="glass-card rounded-3xl p-8 border border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${moodColors.gradient} flex items-center justify-center`}>
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-bold tracking-tight">Continue Your Journey</h3>
                    <p className="text-xs text-white/40 font-mono uppercase tracking-widest">Recommended next paths</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {nextTopics.slice(0, 5).map((suggestion, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      onClick={() => navigate('/create-path', { state: { initialTopic: suggestion.topic } })}
                      className="text-left p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all group"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="font-bold text-sm text-white/90 group-hover:text-white transition-colors">{suggestion.topic}</span>
                        <span className={cn(
                          "text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider",
                          suggestion.difficulty === 'beginner' ? 'bg-green-500/10 text-green-400' :
                          suggestion.difficulty === 'advanced' ? 'bg-red-500/10 text-red-400' :
                          'bg-blue-500/10 text-blue-400'
                        )}>{suggestion.difficulty}</span>
                      </div>
                      <p className="text-xs text-white/40 leading-relaxed">{suggestion.reason}</p>
                      <div className="flex items-center gap-1.5 mt-3 text-primary/60 group-hover:text-primary transition-colors">
                        <span className="text-[10px] font-mono uppercase tracking-widest">Start path</span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function NeuralMirror({ videoRef, isActive, emotion, confidence }: { videoRef: React.RefObject<HTMLVideoElement>; isActive: boolean; emotion: string; confidence: number }) {
  // Use a LOCAL ref for this video element so we don't steal the shared ref
  // from the NeuralDock. Copy the stream from the shared videoRef instead.
  const localVideoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (!isActive || !localVideoRef.current) return;
    // Copy stream from the shared ref or from the srcObject
    const srcVideo = videoRef.current;
    if (srcVideo?.srcObject) {
      localVideoRef.current.srcObject = srcVideo.srcObject;
    }
    // Also watch for when the stream gets attached later
    const interval = setInterval(() => {
      if (srcVideo?.srcObject && localVideoRef.current && !localVideoRef.current.srcObject) {
        localVideoRef.current.srcObject = srcVideo.srcObject;
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isActive, videoRef]);

  return (
    <div className="relative group">
      <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 to-purple-500/50 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
      <div className="relative w-48 h-32 rounded-2xl overflow-hidden bg-black/40 border border-white/10 backdrop-blur-xl">
        {isActive ? (
          <video 
            ref={localVideoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover grayscale brightness-125 contrast-75 opacity-80" 
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/20">
            <Camera className="w-8 h-8" />
            <span className="text-[10px] font-mono uppercase tracking-widest">Neural Standby</span>
          </div>
        )}

        <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/60 border border-white/10 backdrop-blur-md">
          <div className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-green-500 animate-pulse" : "bg-white/20")} />
          <span className="text-[9px] font-bold text-white/80 uppercase tracking-tighter">Live</span>
        </div>

        <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Detection</span>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/90 truncate mr-2">{emotion || 'Analyzing...'}</span>
              <span className="text-[10px] font-mono text-primary/80">{Math.round((confidence || 0) * 100)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Waveform({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-1 h-6">
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          animate={{ 
            height: `${Math.max(20, (level || 0) * 100 * (0.4 + Math.random() * 0.6))}%`,
            opacity: [0.4, 1, 0.4]
          }}
          transition={{
            duration: 0.5 + Math.random() * 0.5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="w-1 bg-primary/60 rounded-full"
        />
      ))}
    </div>
  );
}


