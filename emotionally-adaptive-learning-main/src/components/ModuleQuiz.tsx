import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Trophy, RotateCcw, Sparkles, ArrowRight } from 'lucide-react';

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface ModuleQuizProps {
  topic: string;
  moduleTitle: string;
  moduleType: 'video' | 'article' | 'quiz';
  onComplete: (score: number, total: number) => void;
  onSkip: () => void;
  moodGradient: string;
}

const generateQuizQuestions = (topic: string, moduleTitle: string): QuizQuestion[] => {
  const t = topic.toLowerCase();
  const tCap = topic.charAt(0).toUpperCase() + topic.slice(1);

  if (moduleTitle.toLowerCase().includes('introduction')) {
    return [
      {
        question: `What is the primary purpose of ${tCap}?`,
        options: [
          `To provide a structured approach to building solutions`,
          `To replace all existing technologies`,
          `To only work on specific operating systems`,
          `To limit developer creativity`
        ],
        correctIndex: 0,
        explanation: `${tCap} is designed to provide structured, efficient approaches to solving problems and building solutions.`
      },
      {
        question: `Which of the following is a key benefit of learning ${tCap}?`,
        options: [
          `It has no community support`,
          `It's only useful for one type of project`,
          `It has a large ecosystem and community`,
          `It cannot be combined with other tools`
        ],
        correctIndex: 2,
        explanation: `One of the biggest advantages of ${tCap} is its large ecosystem and active community support.`
      },
      {
        question: `What should be your first step when starting with ${tCap}?`,
        options: [
          `Build a complex production app immediately`,
          `Understand the basic concepts and terminology`,
          `Skip documentation and start coding`,
          `Only watch advanced tutorials`
        ],
        correctIndex: 1,
        explanation: `Always start by understanding the basic concepts and terminology before moving to complex projects.`
      },
    ];
  }

  if (moduleTitle.toLowerCase().includes('core concepts')) {
    return [
      {
        question: `Which principle is fundamental to ${tCap}'s architecture?`,
        options: [
          `Modularity and component-based design`,
          `Writing everything in a single file`,
          `Avoiding code reuse`,
          `Ignoring design patterns`
        ],
        correctIndex: 0,
        explanation: `Modularity and breaking problems into smaller components is a core principle of ${tCap}.`
      },
      {
        question: `What does "abstraction" mean in the context of ${tCap}?`,
        options: [
          `Making code more complex`,
          `Hiding implementation details behind simple interfaces`,
          `Removing all documentation`,
          `Writing code without structure`
        ],
        correctIndex: 1,
        explanation: `Abstraction means hiding complexity behind simple interfaces so users don't need to understand internal details.`
      },
      {
        question: `Why is reusability important in ${tCap}?`,
        options: [
          `It makes code harder to maintain`,
          `It increases development time`,
          `It allows components to be used multiple times, reducing duplication`,
          `It has no real benefit`
        ],
        correctIndex: 2,
        explanation: `Reusability reduces code duplication, saves time, and makes maintenance easier.`
      },
    ];
  }

  if (moduleTitle.toLowerCase().includes('setup') || moduleTitle.toLowerCase().includes('environment')) {
    return [
      {
        question: `What is essential before writing any ${tCap} code?`,
        options: [
          `Buying premium software`,
          `Setting up the proper development environment`,
          `Memorizing all documentation`,
          `Having 10 years of experience`
        ],
        correctIndex: 1,
        explanation: `A properly configured development environment is essential for productive ${tCap} development.`
      },
      {
        question: `Which tool is commonly needed for ${tCap} development?`,
        options: [
          `A code editor or IDE`,
          `A physical calculator`,
          `A fax machine`,
          `Pen and paper only`
        ],
        correctIndex: 0,
        explanation: `A modern code editor or IDE is the most essential tool for any development work.`
      },
      {
        question: `What should you verify after setting up your environment?`,
        options: [
          `That your wallpaper looks nice`,
          `That a simple "hello world" example works`,
          `That you have the most expensive hardware`,
          `Nothing, just start building`
        ],
        correctIndex: 1,
        explanation: `Always verify your setup by running a simple example to ensure everything is configured correctly.`
      },
    ];
  }

  if (moduleTitle.toLowerCase().includes('best practices') || moduleTitle.toLowerCase().includes('patterns')) {
    return [
      {
        question: `What does the DRY principle stand for?`,
        options: [
          `Do Repeat Yourself`,
          `Don't Repeat Yourself`,
          `Debug Run Yield`,
          `Deploy Release Yesterday`
        ],
        correctIndex: 1,
        explanation: `DRY stands for "Don't Repeat Yourself" — extract common functionality to avoid duplication.`
      },
      {
        question: `Which is a recommended testing strategy?`,
        options: [
          `Never write tests`,
          `Only test in production`,
          `Use a test pyramid: many unit tests, fewer integration, fewest E2E`,
          `Test only the UI`
        ],
        correctIndex: 2,
        explanation: `The test pyramid recommends many unit tests, some integration tests, and few end-to-end tests.`
      },
      {
        question: `What does KISS stand for in software development?`,
        options: [
          `Keep It Super Sophisticated`,
          `Keep It Simple, Stupid`,
          `Know It, Ship It, Scale It`,
          `Key Integrated Software System`
        ],
        correctIndex: 1,
        explanation: `KISS means "Keep It Simple, Stupid" — avoid over-engineering and write readable code.`
      },
    ];
  }

  if (moduleTitle.toLowerCase().includes('project') || moduleTitle.toLowerCase().includes('building')) {
    return [
      {
        question: `What's the best approach to building your first ${tCap} project?`,
        options: [
          `Start with a massive complex application`,
          `Start small and incrementally add features`,
          `Copy an entire production codebase`,
          `Skip planning and just code randomly`
        ],
        correctIndex: 1,
        explanation: `Starting small and incrementally adding features helps you learn without getting overwhelmed.`
      },
      {
        question: `What should you do when you encounter an error in your project?`,
        options: [
          `Delete everything and start over`,
          `Ignore it and move on`,
          `Read the error message, understand it, and debug systematically`,
          `Blame the technology`
        ],
        correctIndex: 2,
        explanation: `Reading and understanding error messages is the most effective debugging strategy.`
      },
      {
        question: `Why is version control important for projects?`,
        options: [
          `It's not important at all`,
          `It tracks changes and allows you to revert mistakes`,
          `It makes your code run faster`,
          `It's only for large teams`
        ],
        correctIndex: 1,
        explanation: `Version control tracks all changes, enables collaboration, and lets you safely revert mistakes.`
      },
    ];
  }

  // Default / Advanced
  return [
    {
      question: `What is a key characteristic of advanced ${tCap} usage?`,
      options: [
        `Ignoring performance considerations`,
        `Optimizing for both performance and maintainability`,
        `Using only basic features`,
        `Avoiding community resources`
      ],
      correctIndex: 1,
      explanation: `Advanced usage involves balancing performance optimization with code maintainability.`
    },
    {
      question: `How can you stay up-to-date with ${tCap} developments?`,
      options: [
        `Never update your knowledge`,
        `Follow official channels, blogs, and community discussions`,
        `Only read books from 10 years ago`,
        `Ignore all updates`
      ],
      correctIndex: 1,
      explanation: `Following official channels, community blogs, and discussions keeps you current with best practices.`
    },
    {
      question: `What makes ${tCap} code production-ready?`,
      options: [
        `It compiles without errors`,
        `It has tests, error handling, documentation, and follows best practices`,
        `It was written quickly`,
        `It uses the latest syntax only`
      ],
      correctIndex: 1,
      explanation: `Production-ready code includes thorough testing, error handling, documentation, and adherence to best practices.`
    },
  ];
};

export function ModuleQuiz({ topic, moduleTitle, moduleType, onComplete, onSkip, moodGradient }: ModuleQuizProps) {
  const [questions] = useState(() => generateQuizQuestions(topic, moduleTitle));
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const handleAnswer = (index: number) => {
    if (isAnswered) return;
    setSelectedAnswer(index);
    setIsAnswered(true);
    if (index === questions[currentQuestion].correctIndex) {
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
    }
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
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-6 mt-4"
      >
        <div className="text-center space-y-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
            className={cn(
              'w-20 h-20 rounded-full mx-auto flex items-center justify-center',
              passed
                ? `bg-gradient-to-br ${moodGradient}`
                : 'bg-destructive/20'
            )}
          >
            {passed ? (
              <Trophy className="w-10 h-10 text-primary-foreground" />
            ) : (
              <RotateCcw className="w-10 h-10 text-destructive" />
            )}
          </motion.div>

          <div>
            <h3 className="font-display text-2xl font-bold">
              {passed ? '🎉 Great Job!' : 'Keep Practicing!'}
            </h3>
            <p className="text-muted-foreground mt-1">
              You scored <span className="font-bold text-foreground">{score}/{questions.length}</span> ({percentage}%)
            </p>
          </div>

          <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className={cn(
                'h-full rounded-full',
                passed
                  ? `bg-gradient-to-r ${moodGradient}`
                  : 'bg-destructive/60'
              )}
            />
          </div>

          <div className="flex gap-3 justify-center pt-2">
            {!passed && (
              <Button variant="outline" onClick={handleRetry}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            )}
            <Button
              variant="mood"
              onClick={() => onComplete(score, questions.length)}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {passed ? 'Continue Learning' : 'Continue Anyway'}
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  const q = questions[currentQuestion];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-6 mt-4"
    >
      {/* Quiz Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg bg-gradient-to-br ${moodGradient}`}>
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-display font-semibold text-sm">Knowledge Check</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Question {currentQuestion + 1} of {questions.length}
          </span>
          <Button variant="ghost" size="sm" onClick={onSkip} className="text-xs text-muted-foreground">
            Skip Quiz
          </Button>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5 mb-5">
        {questions.map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-all',
              i < currentQuestion
                ? `bg-gradient-to-r ${moodGradient}`
                : i === currentQuestion
                  ? 'bg-primary/50'
                  : 'bg-muted'
            )}
          />
        ))}
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <h4 className="font-semibold text-lg mb-4">{q.question}</h4>

          <div className="space-y-2.5">
            {q.options.map((option, i) => {
              const isCorrect = i === q.correctIndex;
              const isSelected = i === selectedAnswer;

              return (
                <motion.button
                  key={i}
                  whileHover={!isAnswered ? { scale: 1.01 } : {}}
                  whileTap={!isAnswered ? { scale: 0.99 } : {}}
                  onClick={() => handleAnswer(i)}
                  disabled={isAnswered}
                  className={cn(
                    'w-full text-left p-4 rounded-xl border transition-all flex items-center gap-3',
                    !isAnswered && 'hover:border-primary/50 hover:bg-primary/5 cursor-pointer',
                    isAnswered && isCorrect && 'border-green-500/50 bg-green-500/10',
                    isAnswered && isSelected && !isCorrect && 'border-destructive/50 bg-destructive/10',
                    !isAnswered && 'border-border bg-background/50',
                    isAnswered && !isCorrect && !isSelected && 'opacity-50'
                  )}
                >
                  <span className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 border',
                    isAnswered && isCorrect && 'bg-green-500 border-green-500 text-white',
                    isAnswered && isSelected && !isCorrect && 'bg-destructive border-destructive text-white',
                    !isAnswered && 'border-border text-muted-foreground'
                  )}>
                    {isAnswered && isCorrect ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isAnswered && isSelected && !isCorrect ? (
                      <XCircle className="w-4 h-4" />
                    ) : (
                      String.fromCharCode(65 + i)
                    )}
                  </span>
                  <span className={cn(
                    'flex-1',
                    isAnswered && isCorrect && 'font-medium text-green-700 dark:text-green-400',
                    isAnswered && isSelected && !isCorrect && 'text-destructive'
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
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-4 p-4 rounded-xl bg-muted/50 border border-border"
              >
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Explanation: </span>
                  {q.explanation}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Next button */}
          {isAnswered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-end mt-4"
            >
              <Button variant="mood" size="sm" onClick={handleNext}>
                {currentQuestion < questions.length - 1 ? (
                  <>
                    Next Question
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                ) : (
                  <>
                    See Results
                    <Trophy className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
