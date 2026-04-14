import { useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useMood } from '@/contexts/MoodContext';
import { useProgress, LearningPathHistory } from '@/contexts/ProgressContext';
import { useAuth } from '@/contexts/AuthContext';
import { 
  ArrowLeft, 
  BookOpen,
  Trophy,
  Flame,
  Calendar,
  Trash2,
  Play,
  CheckCircle2,
  TrendingUp,
  Target,
  Zap,
  Star,
  BarChart3,
  Award,
  LogOut,
  User,
  Brain,
  Sparkles
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday } from 'date-fns';

function StatCard({ icon: Icon, value, label, gradient }: { icon: any; value: string | number; label: string; gradient: string }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState('perspective(800px) rotateX(0deg) rotateY(0deg)');
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setTransform(`perspective(800px) rotateX(${(0.5 - y) * 10}deg) rotateY(${(x - 0.5) * 10}deg) scale3d(1.03,1.03,1.03)`);
    setGlare({ x: x * 100, y: y * 100, opacity: 0.12 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTransform('perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)');
    setGlare({ x: 50, y: 50, opacity: 0 });
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="glass-card-hover rounded-2xl p-5 text-center glow-border relative overflow-hidden"
      style={{ transform, transition: 'transform 0.15s ease-out', transformStyle: 'preserve-3d' }}
    >
      <div className={`w-11 h-11 mx-auto rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-3 shadow-lg transition-colors duration-700`}>
        <Icon className="w-5 h-5 text-foreground" />
      </div>
      <div className="text-2xl font-display font-bold stat-number">{value}</div>
      <span className="text-xs text-muted-foreground mt-0.5 block">{label}</span>
      <div
        className="absolute inset-0 pointer-events-none rounded-[inherit] z-10"
        style={{
          background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,${glare.opacity}), transparent 60%)`,
          transition: 'background 0.15s ease-out',
        }}
      />
    </div>
  );
}

function AchievementBadge({ icon: Icon, title, unlocked, gradient }: { icon: any; title: string; unlocked: boolean; gradient: string }) {
  return (
    <motion.div
      whileHover={unlocked ? { scale: 1.1, rotate: 5 } : {}}
      className={cn(
        'flex flex-col items-center gap-2 p-3 rounded-xl transition-all',
        unlocked ? 'opacity-100' : 'opacity-25 grayscale'
      )}
    >
      <div className={cn(
        'w-13 h-13 rounded-full flex items-center justify-center w-[52px] h-[52px] relative',
        unlocked ? `bg-gradient-to-br ${gradient} shadow-lg` : 'bg-muted'
      )}>
        <Icon className="w-6 h-6 text-foreground" />
        {unlocked && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-primary/30"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </div>
      <span className="text-xs font-medium text-center">{title}</span>
    </motion.div>
  );
}

export function LearningProgressView() {
  const navigate = useNavigate();
  const { moodColors, mood } = useMood();
  const { history, deletePath } = useProgress();
  const { user, signOut } = useAuth();

  // Mouse parallax
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothX = useSpring(mouseX, { stiffness: 40, damping: 30 });
  const smoothY = useSpring(mouseY, { stiffness: 40, damping: 30 });
  const blobX = useTransform(smoothX, [-1, 1], [-30, 30]);
  const blobY = useTransform(smoothY, [-1, 1], [-20, 20]);
  const blob2X = useTransform(smoothX, [-1, 1], [20, -20]);
  const blob2Y = useTransform(smoothY, [-1, 1], [15, -15]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      mouseX.set((e.clientX / window.innerWidth - 0.5) * 2);
      mouseY.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, [mouseX, mouseY]);

  // Mood messages for progress page
  const progressMessages: Record<string, string> = {
    energetic: 'Your energy is producing amazing results! ⚡',
    calm: 'Steady progress builds mastery 🌊',
    focused: 'Your dedication is paying off 🎯',
    creative: 'Every path you take sparks new ideas ✨',
    motivated: 'Unstoppable momentum! 🚀',
    sad: 'Every module completed is a win 💙',
    anxious: 'Look at how far you\'ve come 🛡️',
    bored: 'Challenge yourself with something new! 🎲',
    unmotivated: 'Small wins add up to big achievements 🌱',
    curious: 'Your curiosity is your superpower 🔍',
  };

  const totalCompleted = history.reduce((acc, path) => acc + path.completedModules.length, 0);
  const totalModules = history.reduce((acc, path) => acc + path.totalModules, 0);
  const overallProgress = totalModules > 0 ? (totalCompleted / totalModules) * 100 : 0;

  const activityDates = history
    .flatMap(p => p.completedModules.map(m => new Date(m.completedAt)))
    .sort((a, b) => b.getTime() - a.getTime());
  
  let streak = 0;
  if (activityDates.length > 0) {
    const today = new Date();
    let checkDate = today;
    const dateSet = new Set(activityDates.map(d => format(d, 'yyyy-MM-dd')));
    if (dateSet.has(format(today, 'yyyy-MM-dd')) || dateSet.has(format(new Date(today.getTime() - 86400000), 'yyyy-MM-dd'))) {
      while (dateSet.has(format(checkDate, 'yyyy-MM-dd'))) {
        streak++;
        checkDate = new Date(checkDate.getTime() - 86400000);
      }
    }
  }

  const moodCounts: Record<string, number> = {};
  history.forEach(p => { moodCounts[p.mood] = (moodCounts[p.mood] || 0) + 1; });
  const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];

  const achievements = [
    { icon: Star, title: 'First Path', unlocked: history.length >= 1, gradient: 'from-yellow-400 to-amber-500' },
    { icon: Flame, title: '3-Day Streak', unlocked: streak >= 3, gradient: 'from-orange-500 to-red-500' },
    { icon: Trophy, title: '10 Modules', unlocked: totalCompleted >= 10, gradient: 'from-purple-500 to-pink-500' },
    { icon: Target, title: 'Path Complete', unlocked: history.some(p => p.completedModules.length === p.totalModules && p.totalModules > 0), gradient: 'from-green-500 to-emerald-500' },
    { icon: Award, title: '5 Paths', unlocked: history.length >= 5, gradient: 'from-blue-500 to-cyan-500' },
    { icon: Zap, title: 'Speed Learner', unlocked: totalCompleted >= 25, gradient: 'from-rose-500 to-pink-500' },
  ];

  const continuePath = (path: LearningPathHistory) => {
    navigate('/learning-path', {
      state: { topic: path.topic, mood: path.mood, speed: path.speed, format: path.format, goal: path.goal, pathId: path.id }
    });
  };

  const handleDelete = (pathId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this learning path?')) {
      deletePath(pathId);
    }
  };

  const formatActivityDate = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMM d');
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Mouse-Tracking Background */}
      <div className="absolute inset-0 overflow-hidden noise-overlay">
        <motion.div
          className={`absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br ${moodColors.gradient} rounded-full blur-[150px] transition-colors duration-700`}
          style={{ x: blobX, y: blobY }}
          animate={{ opacity: [0.06, 0.12, 0.06] }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div
          className={`absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr ${moodColors.gradient} rounded-full blur-[120px] transition-colors duration-700`}
          style={{ x: blob2X, y: blob2Y }}
          animate={{ opacity: [0.03, 0.08, 0.03] }}
          transition={{ duration: 10, repeat: Infinity }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:80px_80px]" />
      </div>

      <div className="relative z-10 container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Home
          </Button>
          {user && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full glass-card text-sm">
                <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${moodColors.gradient} flex items-center justify-center text-xs font-bold`}>
                  {user.email?.charAt(0).toUpperCase()}
                </div>
                <span className="text-muted-foreground">{user.email}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Title */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${moodColors.gradient} flex items-center justify-center shadow-lg transition-colors duration-700`}>
              <Brain className="w-6 h-6 text-foreground" />
            </div>
            <div>
              <h1 className="font-display text-4xl font-bold">
                My <span className={`bg-gradient-to-r ${moodColors.gradient} bg-clip-text text-transparent transition-all duration-700`}>Progress</span>
              </h1>
              <p className="text-muted-foreground text-sm">{progressMessages[mood] || 'Track your learning journey'}</p>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8"
        >
          <StatCard icon={BookOpen} value={history.length} label="Learning Paths" gradient={moodColors.gradient} />
          <StatCard icon={CheckCircle2} value={totalCompleted} label="Modules Done" gradient="from-green-500 to-emerald-500" />
          <StatCard icon={Flame} value={`${streak}🔥`} label="Day Streak" gradient="from-orange-500 to-red-500" />
          <StatCard icon={BarChart3} value={`${Math.round(overallProgress)}%`} label="Completion" gradient="from-blue-500 to-cyan-500" />
          <StatCard icon={Target} value={topMood ? topMood[0] : '—'} label="Top Mood" gradient="from-purple-500 to-pink-500" />
        </motion.div>

        {/* Overall Progress Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card rounded-2xl p-6 mb-8 glow-border"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Overall Completion
            </span>
            <span className="text-sm text-muted-foreground stat-number">{totalCompleted}/{totalModules} modules</span>
          </div>
          <div className="h-4 bg-muted/50 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${overallProgress}%` }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              className={`h-full bg-gradient-to-r ${moodColors.gradient} rounded-full relative`}
            >
              {overallProgress > 5 && (
                <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.25)_50%,transparent_100%)] animate-gradient" />
              )}
            </motion.div>
          </div>
        </motion.div>

        {/* Achievements */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card rounded-2xl p-6 mb-8"
        >
          <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            Achievements
          </h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {achievements.map((a) => (
              <AchievementBadge key={a.title} {...a} />
            ))}
          </div>
        </motion.div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Learning Paths */}
          <div className="lg:col-span-2">
            {history.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-3xl p-12 text-center glow-border"
              >
                <motion.div
                  className={`w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br ${moodColors.gradient} flex items-center justify-center mb-6 shadow-xl`}
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <BookOpen className="w-10 h-10 text-foreground" />
                </motion.div>
                <h2 className="text-2xl font-bold mb-2">No Learning Paths Yet</h2>
                <p className="text-muted-foreground mb-6">Start your learning journey!</p>
                <Button variant="mood" size="lg" onClick={() => navigate('/create-path')}>
                  Create Learning Path
                </Button>
              </motion.div>
            ) : (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  Your Learning Paths
                </h2>
                {history.map((path, index) => {
                  const pathProgress = path.totalModules > 0 ? (path.completedModules.length / path.totalModules) * 100 : 0;
                  const isComplete = pathProgress === 100;

                  return (
                    <motion.div
                      key={path.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ x: 4 }}
                      className={cn(
                        'glass-card-hover rounded-2xl p-5 cursor-pointer glow-border',
                        isComplete && 'border-primary/20'
                      )}
                      onClick={() => continuePath(path)}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-lg',
                            isComplete ? `bg-gradient-to-br ${moodColors.gradient}` : 'bg-muted'
                          )}>
                            {isComplete ? <Trophy className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold truncate">{path.topic}</h3>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <Calendar className="w-3 h-3" />
                              {format(path.createdAt, 'MMM d, yyyy')}
                              <span className={`px-1.5 py-0.5 rounded-full bg-gradient-to-r ${moodColors.gradient} text-foreground capitalize text-[10px] font-medium`}>
                                {path.mood}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-sm font-bold stat-number">{path.completedModules.length}/{path.totalModules}</div>
                            <div className="text-xs text-muted-foreground">{Math.round(pathProgress)}%</div>
                          </div>
                          <Button variant={isComplete ? 'outline' : 'mood'} size="sm" onClick={(e) => { e.stopPropagation(); continuePath(path); }}>
                            <Play className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={(e) => handleDelete(path.id, e)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                          <div style={{ width: `${pathProgress}%` }} className={`h-full bg-gradient-to-r ${moodColors.gradient} transition-all duration-500 rounded-full`} />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Activity Sidebar */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Recent Activity
            </h2>
            <div className="glass-card rounded-2xl p-5">
              {history.flatMap(path =>
                path.completedModules.map(module => ({
                  ...module,
                  pathTopic: path.topic,
                  pathId: path.id
                }))
              )
              .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
              .slice(0, 8)
              .map((activity, index) => (
                <motion.div
                  key={`${activity.pathId}-${activity.id}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={cn('flex items-start gap-3 py-3', index !== 0 && 'border-t border-border/30')}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br ${moodColors.gradient} shrink-0 mt-0.5 shadow-md`}>
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{activity.title}</p>
                    <p className="text-xs text-muted-foreground">{activity.pathTopic}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">{formatActivityDate(new Date(activity.completedAt))}</p>
                  </div>
                </motion.div>
              ))}
              {history.flatMap(p => p.completedModules).length === 0 && (
                <div className="text-center py-8">
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 3, repeat: Infinity }}
                  >
                    <TrendingUp className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                  </motion.div>
                  <p className="text-muted-foreground text-sm">No completed modules yet</p>
                  <p className="text-muted-foreground/60 text-xs mt-1">Start learning to see activity!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
