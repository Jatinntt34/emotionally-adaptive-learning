import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Trophy, RotateCcw, Sparkles, ArrowRight, Brain, Zap, SkipForward } from 'lucide-react';
import confetti from 'canvas-confetti';
import { MagneticButton } from './ui/MagneticButton';
import { TiltCard } from './ui/TiltCard';
import { RevealSection } from './ui/RevealSection';
import { useMood } from '@/contexts/MoodContext';

interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

interface ModuleQuizProps {
  topic: string;
  moduleTitle: string;
  moduleType: 'video' | 'article' | 'quiz';
  onComplete: (score: number, total: number) => void;
  onSkip: () => void;
  moodGradient: string;
  questions?: QuizQuestion[];
}

const generateQuizQuestions = (topic: string, moduleTitle: string): QuizQuestion[] => {
  const tCap = topic.charAt(0).toUpperCase() + topic.slice(1);
  const mTitle = moduleTitle.split(':').pop()?.trim() || moduleTitle;

  return [
    {
      question: `Which of the following best describes the primary purpose of studying ${mTitle}?`,
      options: [
        `To understand the foundational principles that govern ${tCap}`,
        `To memorize a set of rigid rules without understanding their purpose`,
        `To gain a superficial overview sufficient for casual conversation`,
        `To identify which parts of ${tCap} can be safely ignored`
      ],
      correctAnswer: 0,
      explanation: `Studying ${mTitle} provides the foundational understanding necessary for all subsequent learning in ${tCap}.`
    },
    {
      question: `A common misconception about ${mTitle} is that it:`,
      options: [
        `Requires years of prior experience to begin`,
        `Can be fully mastered through brief, surface-level study alone`,
        `Is only relevant to advanced practitioners of ${tCap}`,
        `Has no connection to practical, real-world application`
      ],
      correctAnswer: 1,
      explanation: `${mTitle} rewards depth over breadth. Surface-level study misses the nuanced insights that drive real mastery.`
    },
    {
      question: `How does ${mTitle} relate to the broader field of ${tCap}?`,
      options: [
        `It exists as an isolated sub-field with no cross-connections`,
        `It serves as connective tissue linking foundational and advanced concepts`,
        `It was historically important but has been superseded by newer approaches`,
        `It is considered optional supplementary material by most experts`
      ],
      correctAnswer: 1,
      explanation: `${mTitle} connects core principles to advanced applications, making it essential connective knowledge in ${tCap}.`
    },
    {
      question: `What distinguishes competent practitioners from exceptional ones in the context of ${mTitle}?`,
      options: [
        `Exceptional practitioners have access to better resources`,
        `Competent practitioners focus only on theory while ignoring application`,
        `Exceptional practitioners deeply understand relationships between concepts, not just individual facts`,
        `There is no meaningful difference — both achieve the same outcomes`
      ],
      correctAnswer: 2,
      explanation: `Mastery in ${mTitle} comes from understanding the relationships and patterns, not from memorizing isolated facts.`
    },
    {
      question: `Which learning strategy is most effective when approaching ${mTitle}?`,
      options: [
        `Rushing through material quickly to cover maximum ground`,
        `Focusing exclusively on theoretical knowledge without practice`,
        `Combining structured study with hands-on application and reflection`,
        `Waiting until you feel fully prepared before attempting any exercises`
      ],
      correctAnswer: 2,
      explanation: `The most effective approach combines theory with practice. Active engagement with ${mTitle} accelerates understanding.`
    }
  ];
};

export function ModuleQuiz({ 
  topic, 
  moduleTitle, 
  moduleType, 
  onComplete, 
  onSkip, 
  moodGradient,
  questions: externalQuestions 
}: ModuleQuizProps) {
  const [questions] = useState<QuizQuestion[]>(() => {
    if (externalQuestions && externalQuestions.length > 0) {
      return externalQuestions;
    }
    return generateQuizQuestions(topic, moduleTitle);
  });
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const { moodColors } = useMood();

  const handleAnswer = (index: number) => {
    if (isAnswered) return;
    setSelectedAnswer(index);
    setIsAnswered(true);
    if (index === questions[currentQuestion].correctAnswer) {
      setScore(prev => prev + 1);
    }
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
      setSelectedAnswer(null);
      setIsAnswered(false);
    } else {
      setIsFinished(true);
      const finalScore = score + (selectedAnswer === questions[currentQuestion].correctAnswer ? 0 : 0); // score is already updated in handleAnswer
      // Note: score was already updated in handleAnswer. No need for logic here unless we want to double check.
      const percentage = Math.round((score / questions.length) * 100);
      if (percentage >= 60) {
        triggerSuccess();
      }
    }
  };

  const triggerSuccess = () => {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
  };


  const handleRetry = () => {
    setCurrentQuestion(0);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setScore(0);
    setIsFinished(false);
  };

  const percentage = Math.round((score / questions.length) * 100);
  const passed = percentage >= 60;

  if (isFinished) {
    return (
      <RevealSection className="mt-8">
        <TiltCard className="p-0 border-0 bg-transparent">
          <div className="glass-card rounded-[2.5rem] p-12 text-center glow-border bg-white/[0.01] border-white/5 relative overflow-hidden">
            {/* Success Aura */}
            <div className={`absolute inset-0 bg-gradient-to-br ${moodColors.gradient} opacity-[0.03] animate-pulse`} />
            
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 12, stiffness: 100 }}
              className={cn(
                'w-28 h-28 rounded-[2rem] mx-auto flex items-center justify-center mb-10 shadow-2xl relative',
                passed
                  ? `bg-gradient-to-br ${moodColors.gradient} ring-8 ring-primary/20`
                  : 'bg-destructive/20 ring-8 ring-destructive/10'
              )}
            >
              <div className="absolute inset-0 bg-white/20 rounded-[2rem] opacity-0 group-hover:opacity-100 transition-opacity" />
              {passed ? (
                <Trophy className="w-14 h-14 text-white" />
              ) : (
                <RotateCcw className="w-14 h-14 text-destructive" />
              )}
            </motion.div>

            <div className="relative z-10">
              <h3 className="font-display text-4xl font-black italic tracking-tighter mb-4">
                {passed ? 'NEURAL SYNC COMPLETE' : 'RECALIBRATION REQUIRED'}
              </h3>
              <p className="text-white/40 font-mono text-sm uppercase tracking-[0.2em] mb-8">
                Accuracy Level: <span className={cn('text-lg font-black stat-number', passed ? 'text-primary' : 'text-destructive')}>{percentage}%</span> | {score}/{questions.length} Units
              </p>

              <div className="w-full bg-white/5 rounded-full h-4 overflow-hidden backdrop-blur-3xl border border-white/5 mb-10 p-0.5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 1.5, ease: 'circOut' }}
                  className={cn(
                    'h-full rounded-full relative',
                    passed
                      ? `bg-gradient-to-r ${moodColors.gradient}`
                      : 'bg-destructive/60'
                  )}
                >
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.4)_50%,transparent_100%)] animate-gradient" />
                </motion.div>
              </div>

              <div className="flex flex-wrap gap-4 justify-center">
                {!passed && (
                  <MagneticButton variant="outline" onClick={handleRetry} className="rounded-2xl h-14 px-8 text-xs font-mono tracking-widest uppercase">
                    <RotateCcw className="w-4 h-4 mr-3" />
                    Reset Buffer
                  </MagneticButton>
                )}
                <MagneticButton
                  variant="mood"
                  size="lg"
                  onClick={() => onComplete(score, questions.length)}
                  className="rounded-2xl h-14 px-10 text-sm font-bold shadow-2xl"
                >
                  <div className="flex items-center gap-3">
                    {passed ? 'PROCEED TO NEXT NEURON' : 'BYPASS CALIBRATION'}
                    <ArrowRight className="w-5 h-5" />
                  </div>
                </MagneticButton>
              </div>
            </div>
          </div>
        </TiltCard>
      </RevealSection>
    );
  }

  const q = questions[currentQuestion];

  return (
    <RevealSection className="mt-8">
      <TiltCard className="p-0 border-0 bg-transparent">
        <div className="glass-card rounded-[2.5rem] p-10 glow-border bg-white/[0.01] border-white/5 relative overflow-hidden">
          {/* Internal Aura */}
          <div className={`absolute -right-40 -top-40 w-80 h-80 bg-gradient-to-br ${moodColors.gradient} rounded-full blur-[100px] opacity-[0.03] pointer-events-none`} />

          {/* Quiz Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${moodColors.gradient} flex items-center justify-center shadow-lg`}>
                <Zap className="w-6 h-6 text-foreground" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/20 block">Validation required</span>
                <span className="font-display font-black text-xl tracking-tight">NEURAL CHECKPOINT</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-right">
                <div className="text-xs font-mono text-white/20 uppercase tracking-widest">Unit {currentQuestion + 1} / {questions.length}</div>
              </div>
              <MagneticButton variant="ghost" size="sm" onClick={onSkip} className="h-10 w-10 p-0 rounded-xl text-white/20 hover:text-white/60">
                <SkipForward className="w-4 h-4" />
              </MagneticButton>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex gap-2 mb-10">
            {questions.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-all duration-700',
                  i < currentQuestion
                    ? `bg-gradient-to-r ${moodColors.gradient}`
                    : i === currentQuestion
                      ? 'bg-white/20 animate-pulse'
                      : 'bg-white/5'
                )}
              />
            ))}
          </div>

            {/* Question */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentQuestion}
                initial={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex gap-4 mb-8">
                  <div className="text-4xl font-display font-black text-white/5 select-none shrink-0">0{currentQuestion + 1}</div>
                  <h4 className="font-display font-bold text-2xl tracking-tight leading-snug">{q.question}</h4>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {q.options.map((option, i) => {
                    const isCorrect = i === q.correctAnswer;
                    const isSelected = i === selectedAnswer;

                    return (
                      <motion.button
                        key={i}
                        whileHover={!isAnswered ? { scale: 1.02, x: 10 } : {}}
                        whileTap={!isAnswered ? { scale: 0.98 } : {}}
                        onClick={() => handleAnswer(i)}
                        disabled={isAnswered}
                        className={cn(
                          'w-full text-left p-6 rounded-[1.5rem] border transition-all duration-500 flex items-center gap-5 relative overflow-hidden group',
                          !isAnswered && 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10 cursor-pointer',
                          isAnswered && isCorrect && 'border-green-500/30 bg-green-500/10 shadow-[0_0_30px_rgba(34,197,94,0.1)]',
                          isAnswered && isSelected && !isCorrect && 'border-destructive/30 bg-destructive/10 shadow-[0_0_30px_rgba(239,68,68,0.1)]',
                          isAnswered && !isCorrect && !isSelected && 'opacity-30 blur-[2px]'
                        )}
                      >
                        {/* Option Highlight */}
                        <div className={cn(
                          'absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none',
                          !isAnswered ? `bg-gradient-to-r ${moodColors.gradient}` : isCorrect ? 'bg-green-500' : 'bg-destructive'
                        )} />

                        <div className={cn(
                          'w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-mono shrink-0 border transition-all duration-500',
                          isAnswered && isCorrect && 'bg-green-500 border-green-500 text-white shadow-lg scale-110',
                          isAnswered && isSelected && !isCorrect && 'bg-destructive border-destructive text-white shadow-lg scale-110',
                          !isAnswered && 'bg-white/5 border-white/10 text-white/40 group-hover:text-white group-hover:border-white/30'
                        )}>
                          {isAnswered && isCorrect ? (
                            <CheckCircle2 className="w-6 h-6" />
                          ) : isAnswered && isSelected && !isCorrect ? (
                            <XCircle className="w-6 h-6" />
                          ) : (
                            String.fromCharCode(65 + i)
                          )}
                        </div>
                        <span className={cn(
                          'flex-1 text-lg font-medium transition-colors duration-500',
                          isAnswered && isCorrect && 'text-green-400',
                          isAnswered && isSelected && !isCorrect && 'text-destructive',
                          !isAnswered && 'text-white/60 group-hover:text-white'
                        )}>
                          {option}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Explanation */}
                <AnimatePresence>
                  {isAnswered && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, filter: 'blur(5px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      className="mt-8 p-6 rounded-[1.5rem] bg-white/[0.03] border border-white/5 relative overflow-hidden group"
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${q.correctAnswer === selectedAnswer ? 'from-green-500' : 'from-destructive'} to-transparent`} />
                      <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                          <Brain className="w-4 h-4 text-white/40" />
                        </div>
                        <p className="text-sm text-white/50 leading-relaxed italic">
                          {q.explanation}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Next button */}
                {isAnswered && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex justify-end mt-10"
                  >
                    <MagneticButton variant="mood" size="lg" onClick={handleNext} className="rounded-2xl h-14 px-10 shadow-2xl">
                      <div className="flex items-center gap-3">
                        {currentQuestion < questions.length - 1 ? (
                          <>
                            ADVANCE SEQUENCE
                            <ArrowRight className="w-5 h-5" />
                          </>
                        ) : (
                          <>
                            COMPILE RESULTS
                            <Trophy className="w-5 h-5" />
                          </>
                        )}
                      </div>
                    </MagneticButton>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </TiltCard>
      </RevealSection>
  );
}


