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
  Sparkles,
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday } from 'date-fns';

import { MagneticButton } from '@/components/ui/MagneticButton';
import { TiltCard } from '@/components/ui/TiltCard';
import { RevealSection } from '@/components/ui/RevealSection';

function StatCard({ icon: Icon, value, label, gradient }: { icon: any; value: string | number; label: string; gradient: string }) {
  return (
    <TiltCard className="p-0 border-0 bg-transparent flex flex-col items-center h-full">
      <div className="glass-card-hover rounded-[2rem] p-8 text-center glow-border relative overflow-hidden h-full w-full bg-white/[0.02] border border-white/5 backdrop-blur-2xl transition-all duration-700 hover:bg-white/[0.05] hover:border-white/10 group">
        {/* Top Glow Accent */}
        <div className={`absolute -top-20 -left-20 w-40 h-40 bg-gradient-to-br ${gradient} rounded-full blur-[60px] opacity-0 group-hover:opacity-20 transition-opacity duration-700`} />
        
        <div className={`w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-6 shadow-2xl transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 relative z-10`}>
          <Icon className="w-6 h-6 text-foreground" />
        </div>
        
        <div className="relative z-10">
          <div className="text-4xl font-display font-black stat-number mb-1 tracking-tighter">{value}</div>
          <span className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-mono font-medium">{label}</span>
        </div>
        
        {/* Ambient Glow */}
        <div className={`absolute -bottom-12 -right-12 w-32 h-32 bg-gradient-to-br ${gradient} rounded-full blur-[50px] opacity-[0.08] group-hover:opacity-15 transition-opacity duration-700`} />
      </div>
    </TiltCard>
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
  const latestPath = user
    ? [...history].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : undefined;

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
    energetic: 'Your energy is producing amazing results!',
    calm: 'Steady progress builds mastery',
    focused: 'Your dedication is paying off',
    creative: 'Every path you take sparks new ideas',
    motivated: 'Unstoppable momentum!',
    sad: 'Every module completed is a win',
    anxious: 'Look at how far you\'ve come',
    bored: 'Challenge yourself with something new!',
    unmotivated: 'Small wins add up to big achievements',
    curious: 'Your curiosity is your superpower',
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
    navigate(`/learning-path?id=${path.id}`, {
      state: { topic: path.topic, mood: path.mood, speed: path.speed, format: path.format, goal: path.goal, pathId: path.id }
    });
  };

  const handleHeaderResume = () => {
    if (!user || !latestPath) return;
    continuePath(latestPath);
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
        <div className="flex items-center justify-between mb-16">
          <div className="flex items-center gap-3">
            <MagneticButton variant="ghost" onClick={() => navigate('/')} className="gap-3 group">
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="font-mono text-xs uppercase tracking-widest">Return Home</span>
            </MagneticButton>
            {user && latestPath && (
              <MagneticButton variant="ghost" onClick={handleHeaderResume} className="gap-3 group">
                <Play className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                <span className="font-mono text-xs uppercase tracking-widest">Resume Path</span>
              </MagneticButton>
            )}
          </div>
          
          {user && (
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 px-6 py-2.5 rounded-full bg-white/[0.03] border border-white/5 backdrop-blur-md">
                <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${moodColors.gradient} flex items-center justify-center text-xs font-black shadow-lg shadow-primary/20`}>
                  {user.email?.charAt(0).toUpperCase()}
                </div>
                <span className="text-white/40 text-xs font-mono uppercase tracking-wider">{user.email}</span>
              </div>
              <MagneticButton variant="ghost" size="sm" onClick={signOut} className="text-white/20 hover:text-destructive transition-colors">
                <LogOut className="w-5 h-5" />
              </MagneticButton>
            </div>
          )}
        </div>

        {/* Title */}
        <RevealSection className="mb-20">
          <div className="flex items-center gap-6">
            <div className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${moodColors.gradient} flex items-center justify-center shadow-2xl transition-all duration-1000 relative group overflow-hidden`}>
              <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              <Brain className="w-10 h-10 text-foreground relative z-10" />
            </div>
            <div>
              <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter leading-tight">
                ELITE <br />
                <span className={`bg-gradient-to-r ${moodColors.gradient} bg-clip-text text-transparent transition-all duration-1000`}>
                  PERFORMANCE
                </span>
              </h1>
              <p className="text-white/30 text-sm font-mono mt-2 uppercase tracking-[0.3em] font-light">
                {progressMessages[mood] || 'Neural sync optimized for learning progress'}
              </p>
            </div>
          </div>
        </RevealSection>

        {/* Stats Grid */}
        <RevealSection delay={0.2} className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-12">
          <StatCard icon={BookOpen} value={history.length} label="Neural Paths" gradient={moodColors.gradient} />
          <StatCard icon={CheckCircle2} value={totalCompleted} label="Sync Units" gradient="from-emerald-500 to-teal-400" />
          <StatCard icon={Flame} value={`${streak}`} label="Day Streak" gradient="from-orange-500 to-red-600" />
          <StatCard icon={BarChart3} value={`${Math.round(overallProgress)}%`} label="Core Completion" gradient="from-blue-500 to-indigo-600" />
          <StatCard icon={Target} value={topMood ? topMood[0] : 'None'} label="Peak State" gradient="from-purple-500 to-fuchsia-600" />
        </RevealSection>

        {/* Overall Progress Bar */}
        <RevealSection delay={0.3} className="glass-card rounded-3xl p-10 mb-12 glow-border relative overflow-hidden bg-white/[0.01]">
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-mono uppercase tracking-[0.3em] flex items-center gap-3 text-white/40">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              Global Synchronization
            </span>
            <span className="text-2xl font-display font-black stat-number">{Math.round(overallProgress)}%</span>
          </div>
          <div className="h-4 bg-white/5 rounded-full overflow-hidden backdrop-blur-3xl border border-white/5 p-0.5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${overallProgress}%` }}
              transition={{ duration: 1.5, ease: 'circOut' }}
              className={`h-full bg-gradient-to-r ${moodColors.gradient} rounded-full relative`}
            >
              <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.4)_50%,transparent_100%)] animate-gradient" />
            </motion.div>
          </div>
          <div className="flex justify-between mt-4 text-[10px] font-mono text-white/20 uppercase tracking-widest">
            <span>Neural Initialized</span>
            <span>{totalCompleted} / {totalModules} Units Synchronized</span>
          </div>
        </RevealSection>

        {/* Achievements */}
        <RevealSection delay={0.4} className="glass-card rounded-3xl p-8 mb-12 bg-white/[0.01] border-white/5">
          <h2 className="font-display text-xl font-bold mb-8 flex items-center gap-3">
            <Award className="w-6 h-6 text-primary" />
            COMMENDATIONS
          </h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-6">
            {achievements.map((a) => (
              <AchievementBadge key={a.title} {...a} />
            ))}
          </div>
        </RevealSection>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Learning Paths */}
          <div className="lg:col-span-2">
            {history.length === 0 ? (
              <RevealSection className="glass-card rounded-[2.5rem] p-24 text-center glow-border bg-white/[0.01]">
                <motion.div
                  className={`w-28 h-28 mx-auto rounded-[2rem] bg-gradient-to-br ${moodColors.gradient} flex items-center justify-center mb-10 shadow-2xl relative overflow-hidden group`}
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <BookOpen className="w-14 h-14 text-foreground relative z-10" />
                </motion.div>
                <h2 className="text-4xl font-display font-black mb-4 tracking-tighter">VACUUM DETECTED</h2>
                <p className="text-white/30 mb-10 font-light text-lg">Your neural repository is empty. Initialize your first path.</p>
                <MagneticButton size="lg" onClick={() => navigate('/create-path')}>
                  Initialize Neural Path
                  <ArrowRight className="ml-3 w-5 h-5" />
                </MagneticButton>
              </RevealSection>
            ) : (
              <div className="space-y-6">
                <h2 className="text-xs font-mono uppercase tracking-[0.4em] text-white/20 mb-6 flex items-center gap-3">
                  <div className="w-8 h-px bg-white/10" />
                  Active Neural Paths
                </h2>
                <div className="flex flex-col gap-4">
                  {history.map((path, index) => {
                    const pathProgress = path.totalModules > 0 ? (path.completedModules.length / path.totalModules) * 100 : 0;
                    const isComplete = pathProgress === 100;

                    return (
                      <RevealSection key={path.id} delay={index * 0.1}>
                        <TiltCard className="p-0 border-0 bg-transparent group">
                          <div className={cn(
                            'glass-card-hover rounded-3xl p-6 glow-border bg-white/[0.02] border-white/5 hover:bg-white/[0.04] transition-all duration-500 overflow-hidden relative',
                            isComplete && 'border-primary/20 bg-primary/[0.03]'
                          )}>
                            {/* Path Background Aura */}
                            <div className={`absolute -right-20 -top-20 w-40 h-40 bg-gradient-to-br ${moodColors.gradient} rounded-full blur-[80px] opacity-0 group-hover:opacity-10 transition-opacity duration-1000`} />
                            
                            <div className="flex items-center justify-between gap-6 relative z-10">
                              <div className="flex items-center gap-5 min-w-0">
                                <div className={cn(
                                  'w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-2xl transition-all duration-500 group-hover:scale-110',
                                  isComplete ? `bg-gradient-to-br ${moodColors.gradient}` : 'bg-white/5'
                                )}>
                                  {isComplete ? <Trophy className="w-6 h-6 text-foreground" /> : <BookOpen className="w-6 h-6 text-white/40" />}
                                </div>
                                <div className="min-w-0">
                                  <h3 className="text-xl font-display font-bold truncate tracking-tight">{path.topic}</h3>
                                  <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-white/30 mt-1">
                                    <Calendar className="w-3 h-3" />
                                    {format(new Date(path.createdAt), 'MMM d, yyyy')}
                                    <div className="w-1 h-1 rounded-full bg-white/10" />
                                    <span className={`px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-primary`}>
                                      {path.mood}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-4 shrink-0">
                                <div className="text-right hidden sm:block">
                                  <div className="text-lg font-black stat-number leading-none">{path.completedModules.length}/{path.totalModules}</div>
                                  <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest mt-1">Units Sync'd</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <MagneticButton variant={isComplete ? 'outline' : 'mood'} size="sm" onClick={() => continuePath(path)} className="h-10 w-10 p-0 rounded-xl">
                                    <Play className="w-4 h-4" />
                                  </MagneticButton>
                                  <MagneticButton variant="ghost" size="sm" className="h-10 w-10 p-0 rounded-xl text-white/20 hover:text-destructive" onClick={(e) => handleDelete(path.id, e)}>
                                    <Trash2 className="w-4 h-4" />
                                  </MagneticButton>
                                </div>
                              </div>
                            </div>

                            <div className="mt-6">
                              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pathProgress}%` }}
                                  transition={{ duration: 1, delay: 0.5 }}
                                  className={`h-full bg-gradient-to-r ${moodColors.gradient} transition-all duration-1000 rounded-full`} 
                                />
                              </div>
                            </div>
                          </div>
                        </TiltCard>
                      </RevealSection>
                    );
                  })}
                </div>
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


