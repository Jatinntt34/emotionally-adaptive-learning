import { LandingHero } from '@/components/LandingHero';
import { motion } from 'framer-motion';
import { useMood } from '@/contexts/MoodContext';
import { useNavigate } from 'react-router-dom';
import { Brain, Zap, LineChart, Users, Sparkles, Shield, ArrowRight } from 'lucide-react';
import { useRef, useState, useCallback } from 'react';

// ── 3D Tilt Card for features ──
function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState('perspective(800px) rotateX(0deg) rotateY(0deg)');
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rotateY = (x - 0.5) * 10;
    const rotateX = (0.5 - y) * 10;
    setTransform(`perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03, 1.03, 1.03)`);
    setGlare({ x: x * 100, y: y * 100, opacity: 0.12 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTransform('perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)');
    setGlare({ x: 50, y: 50, opacity: 0 });
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={{
        transform,
        transition: 'transform 0.15s ease-out',
        transformStyle: 'preserve-3d',
      }}
    >
      {children}
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

const Index = () => {
  const { moodColors, mood } = useMood();
  const navigate = useNavigate();

  const features = [
    { icon: Brain, title: 'Emotion AI', description: 'Advanced algorithms detect your emotional state and adjust learning content accordingly.', gradient: 'from-orange-500 to-amber-400' },
    { icon: Zap, title: 'Adaptive Pacing', description: 'Content difficulty and speed adapt in real-time based on your energy levels.', gradient: 'from-blue-500 to-cyan-400' },
    { icon: LineChart, title: 'Progress Analytics', description: 'Track your learning patterns and emotional trends over time.', gradient: 'from-green-500 to-emerald-400' },
    { icon: Users, title: 'Community Learning', description: 'Connect with learners who share similar emotional learning patterns.', gradient: 'from-purple-500 to-pink-400' },
    { icon: Sparkles, title: 'Smart Recommendations', description: 'Get personalized content suggestions based on your mood history.', gradient: 'from-rose-500 to-pink-400' },
    { icon: Shield, title: 'Safe Learning Space', description: 'Your emotional data is private and used only to enhance your experience.', gradient: 'from-teal-500 to-cyan-400' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <LandingHero />

      {/* Features Section */}
      <section id="features-section" className="py-28 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-card/30 to-background" />
        <div className="absolute inset-0 noise-overlay" />

        <div className="relative container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="inline-block px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6 transition-colors duration-700"
            >
              Why Choose Us
            </motion.span>
            <h2 className="font-display text-4xl md:text-6xl font-bold mb-5 tracking-tight">
              Learning that{' '}
              <span className={`bg-gradient-to-r ${moodColors.gradient} bg-clip-text text-transparent transition-all duration-700`}>
                feels right
              </span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Traditional learning ignores how you feel. We believe emotions are the key to effective learning.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08, duration: 0.5 }}
              >
                <TiltCard className="glass-card-hover rounded-2xl p-8 group glow-border relative overflow-hidden h-full">
                  <motion.div
                    className={`absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br ${feature.gradient} rounded-full blur-3xl opacity-0 group-hover:opacity-10 transition-opacity duration-700`}
                  />
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 group-hover:scale-110 group-hover:shadow-lg transition-all duration-300`}>
                    <feature.icon className="w-7 h-7 text-foreground" />
                  </div>
                  <h3 className="font-display text-xl font-semibold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-sm">{feature.description}</p>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-28 relative">
        <div className={`absolute inset-0 bg-gradient-to-r ${moodColors.gradient} opacity-[0.03] transition-all duration-1000`} />
        <div className="absolute inset-0 noise-overlay" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="container mx-auto px-6 text-center relative z-10"
        >
          <motion.div
            className={`w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br ${moodColors.gradient} flex items-center justify-center mb-8 shadow-2xl transition-all duration-700`}
            animate={{ y: [0, -8, 0], rotate: [0, 3, -3, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Sparkles className="w-10 h-10 text-foreground" />
          </motion.div>
          <h2 className="font-display text-4xl md:text-6xl font-bold mb-6 tracking-tight">
            Ready to Learn{' '}
            <span className={`bg-gradient-to-r ${moodColors.gradient} bg-clip-text text-transparent transition-all duration-700`}>
              Smarter
            </span>?
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Join thousands of learners who have transformed their education journey with emotion-adaptive learning.
          </p>
          <motion.button
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className={`px-10 py-5 rounded-2xl bg-gradient-to-r ${moodColors.gradient} font-semibold text-lg shadow-xl shadow-primary/20 transition-all duration-500 inline-flex items-center gap-3`}
            onClick={() => navigate('/create-path')}
          >
            {moodColors.ctaLabel}
            <ArrowRight className="w-5 h-5" />
          </motion.button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-14 border-t border-border/30">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${moodColors.gradient} flex items-center justify-center transition-all duration-700`}>
                <Brain className="w-4 h-4 text-foreground" />
              </div>
              <span className="font-display font-bold">MoodLearn</span>
            </div>
            <p className="text-sm text-muted-foreground">Adaptive learning that understands you.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
