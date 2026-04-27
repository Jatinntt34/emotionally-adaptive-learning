import { LandingHero } from '@/components/LandingHero';
import { NeuralSearchHub } from '@/components/NeuralSearchHub';
import NeuralWeb from '@/components/NeuralWeb';
import { motion } from 'framer-motion';
import { useMood } from '@/contexts/MoodContext';
import { useNavigate } from 'react-router-dom';
import { Brain, Zap, LineChart, Users, Sparkles, Shield, ArrowRight, Activity } from 'lucide-react';
import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { cn } from '@/lib/utils';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

import { RevealSection } from '@/components/ui/RevealSection';
import { TiltCard } from '@/components/ui/TiltCard';
import { MagneticButton } from '@/components/ui/MagneticButton';
import { NeuralIcon } from '@/components/ui/NeuralIcon';

const Index = () => {
  const { moodColors, mood } = useMood();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLDivElement>(null);
  
  const features = [
    { icon: Brain, title: 'Emotion AI', description: 'Advanced algorithms detect your emotional state and adjust learning content accordingly.', insight: 'Signals from tone, facial presence, and pacing converge into a live readiness profile.', gradient: 'from-orange-500 to-amber-400' },
    { icon: Zap, title: 'Adaptive Pacing', description: 'Content difficulty and speed adapt in real-time based on your energy levels.', insight: 'Lesson tempo stretches or compresses before cognitive overload has a chance to settle in.', gradient: 'from-blue-500 to-cyan-400' },
    { icon: LineChart, title: 'Progress Analytics', description: 'Track your learning patterns and emotional trends over time.', insight: 'You see which moods unlock flow state and which moments need recovery-oriented content.', gradient: 'from-green-500 to-emerald-400' },
    { icon: Users, title: 'Community Learning', description: 'Connect with learners who share similar emotional learning patterns.', insight: 'Peer discovery is weighted toward compatible momentum, not just matching topics.', gradient: 'from-purple-500 to-pink-400' },
    { icon: Sparkles, title: 'Smart Recommendations', description: 'Get personalized content suggestions based on your mood history.', insight: 'Recommendations shift with context, surfacing formats your current state is most likely to absorb.', gradient: 'from-rose-500 to-pink-400' },
    { icon: Shield, title: 'Safe Learning Space', description: 'Your emotional data is private and used only to enhance your experience.', insight: 'Trust cues remain visible so sensitive feedback feels supportive rather than invasive.', gradient: 'from-teal-500 to-cyan-400' },
  ];

  useEffect(() => {
    // Refresh ScrollTrigger to ensure correct positions after layout hydration
    const refreshTimer = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 500);

    return () => clearTimeout(refreshTimer);
  }, []);

  useEffect(() => {
    // Advanced Scroll Physics Context
    let ctx = gsap.context(() => {
      // 1. Momentum Parallax for Background Glows
      gsap.to(".bg-glow-1", {
        y: -100,
        ease: "none",
        scrollTrigger: {
          trigger: "body",
          start: "top top",
          end: "bottom bottom",
          scrub: 1
        }
      });

      // 2. The 'Portal Warp' for Neural Gateway
      gsap.to(".gateway-ring", {
        scale: 1.2,
        opacity: 1,
        stagger: 0.2,
        rotate: 360,
        ease: "power2.out",
        scrollTrigger: {
          trigger: "#neural-gateway",
          start: "top bottom",
          end: "center center",
          scrub: 2
        }
      });

        // 4. Search Hub Kinetic Reveal
        gsap.set(".search-hub-kinetic", { perspective: 1000 });
        gsap.fromTo(".search-hub-kinetic", 
          { rotationX: 15, y: 50, opacity: 0 },
          { 
            rotationX: 0, 
            y: 0, 
            opacity: 1,
            ease: "power2.out",
            scrollTrigger: {
              trigger: "#neural-search-section",
              start: "top bottom",
              end: "center center",
              scrub: 1
            }
          }
        );

        gsap.to(".search-hub-title", {
          y: -40,
          ease: "power2.out",
          scrollTrigger: {
            trigger: "#neural-search-section",
            start: "top bottom",
            end: "bottom top",
            scrub: 1
          }
        });

        gsap.to(".search-hub-input", {
          scale: 1.05,
          y: -20,
          ease: "power1.out",
          scrollTrigger: {
            trigger: "#neural-search-section",
            start: "top bottom",
            end: "center center",
            scrub: 1.5
          }
        });

        gsap.to(".search-hub-glow", {
          y: 100,
          opacity: 0.4,
          ease: "none",
          scrollTrigger: {
            trigger: "#neural-search-section",
            start: "top bottom",
            end: "bottom top",
            scrub: 2
          }
        });

        // 5. Global Scroll Progress Sync
        ScrollTrigger.create({
          trigger: "body",
          start: "top top",
          end: "bottom bottom",
          onUpdate: (self) => {
            gsap.to("#scroll-progress-bar", {
              width: `${self.progress * 100}%`,
              duration: 0.1,
              overwrite: true
            });
          }
        });

        // 6. Hero Scroll Indicator Fade
        gsap.to(".hero-scroll-indicator", {
          opacity: 0,
          y: 20,
          scrollTrigger: {
            trigger: "body",
            start: "top top",
            end: "50px top",
            scrub: true
          }
        });
      }, mainRef);

    // Skew on Scroll Logic (Enhanced)
    let proxy = { skew: 0 },
        skewSetter = gsap.quickSetter(".skew-elem", "skewY", "deg"),
        clamp = gsap.utils.clamp(-8, 8);

    ScrollTrigger.create({
      onUpdate: (self) => {
        let skew = clamp(self.getVelocity() / -400);
        if (Math.abs(skew) > Math.abs(proxy.skew)) {
          proxy.skew = skew;
          gsap.to(proxy, {
            skew: 0, 
            duration: 1.2, 
            ease: "power3.out", 
            overwrite: true, 
            onUpdate: () => skewSetter(proxy.skew)
          });
        }
      }
    });

    return () => {
      ctx.revert();
      ScrollTrigger.getAll().forEach(t => t.kill());
    };
  }, []);

  // Component body

  return (
    <div ref={mainRef} className="min-h-screen bg-[#020205] text-foreground selection:bg-primary selection:text-primary-foreground relative overflow-hidden">
      {/* Scroll Progress Bar */}
      <div className="fixed top-0 left-0 w-full h-[2px] z-[100] pointer-events-none">
        <div className={cn("h-full bg-gradient-to-r transition-all duration-300", moodColors.gradient)} id="scroll-progress-bar" style={{ width: '0%' }} />
      </div>

      {/* Global Living Canvas Atmos */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div 
          className={cn(
            "bg-glow-1 absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px] opacity-10 transition-colors duration-[2s]",
            moodColors.primary.includes('blue') ? 'bg-blue-500' : 'bg-orange-500'
          )}
          style={{ backgroundColor: moodColors.primary }}
        />
        <div 
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[150px] opacity-5 transition-colors duration-[2s]"
          style={{ backgroundColor: moodColors.secondary || moodColors.primary }}
        />
      </div>

      <LandingHero />
      <NeuralSearchHub />

      {/* Features Section */}
      <section id="features-section" className="py-32 relative overflow-hidden border-t border-white/5">
        <div className="relative container mx-auto px-6">
          <RevealSection className="text-center mb-32 max-w-4xl mx-auto">
            <div className="flex justify-center gap-4 mb-8">
              <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-primary/60 border border-primary/20 px-3 py-1 rounded-full bg-primary/5 shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]">[ SYNC_READY ]</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-primary/60 border border-primary/20 px-3 py-1 rounded-full bg-primary/5 shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]">[ STATUS: ACTIVE ]</span>
            </div>
            <h2 className="font-display text-5xl md:text-9xl font-black mb-10 leading-[0.8] tracking-tighter italic">
              BEYOND <br />
              <span className={`bg-gradient-to-r ${moodColors.gradient} bg-clip-text text-transparent`}>
                INTERACTION
              </span>
            </h2>
            <p className="text-xl md:text-2xl text-white/40 leading-relaxed font-light max-w-2xl mx-auto">
              We've dismantled the barrier between human emotion and digital learning. 
              The interface doesn't just respond; it understands.
            </p>
          </RevealSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-24">
            {features.map((feature, index) => (
              <div key={feature.title} className={cn("skew-elem feature-card-offset", index % 2 === 1 ? "lg:mt-12" : "")}>
                <TiltCard className="group relative h-full rounded-[2.5rem] border-0 bg-transparent p-0 overflow-hidden">
                  <article className="neural-card-glow relative flex h-full flex-col overflow-hidden rounded-[2.5rem] border border-white/8 bg-white/[0.02] p-8 md:p-12 transition-all duration-700 group-hover:bg-white/[0.04]">
                    <div className={`absolute -top-16 right-[-3rem] h-40 w-40 rounded-full bg-gradient-to-br ${feature.gradient} blur-[90px] opacity-20 transition-all duration-700 group-hover:opacity-40 group-hover:scale-110`} />
                    
                    <div className="relative mb-10 flex items-start justify-between">
                      <NeuralIcon 
                        icon={feature.icon} 
                        className="w-20 h-20" 
                        iconClassName="w-9 h-9"
                        gradient={feature.gradient}
                      />
                      <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/20">
                        AFX_0{index + 1}
                      </div>
                    </div>

                    <div className="relative flex flex-1 flex-col">
                      <h3 className="mb-6 font-display text-3xl font-bold tracking-tight text-white leading-none">
                        {feature.title}
                      </h3>
                      <p className="max-w-[32ch] text-[15px] leading-8 text-white/50 mb-10">
                        {feature.description}
                      </p>

                      <div className="mt-auto pt-8 border-t border-white/5">
                        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.3em] text-primary">
                          <span>Intelligence Data</span>
                          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-2" />
                        </div>
                      </div>
                    </div>
                  </article>
                </TiltCard>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Narrative Breakout Section */}
      <section className="py-48 relative border-t border-white/5">
        <div className="container mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-32 items-center">
            <RevealSection className="relative">
                {/* Ambient Core Glow */}
                <div className="absolute -inset-20 bg-primary/10 blur-[120px] rounded-full animate-pulse" />
                
                <TiltCard className="relative aspect-[4/5] rounded-[4rem] overflow-hidden bg-white/5 border border-white/10 group shadow-2xl">
                    <NeuralWeb color={moodColors.primary} className="absolute inset-0 w-full h-full" />
                    {/* Refined Framing Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#020205] via-transparent to-white/5 opacity-60" />
                    
                    <div className="absolute bottom-12 left-12 right-12 z-20">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="h-px flex-1 bg-white/30" />
                            <span className="font-mono text-[11px] uppercase tracking-[0.5em] text-white/50">System Core 01</span>
                        </div>
                        <h4 className="font-display text-4xl font-bold text-white tracking-tighter italic">NEURAL ARCHITECTURE</h4>
                    </div>
                </TiltCard>
            </RevealSection>
            
            <div className="space-y-20">
                <RevealSection delay={0.2}>
                  <div className="inline-block px-4 py-1 rounded-full border border-primary/20 bg-primary/5 mb-8">
                    <span className="font-mono text-[10px] uppercase tracking-[0.5em] text-primary">Evolution Protocol</span>
                  </div>
                  
                  <h3 className="font-display text-5xl md:text-7xl lg:text-8xl font-black mb-16 leading-[0.8] tracking-tighter italic">
                    PEAK <br />
                    <span className={cn(
                      "text-transparent block text-4xl sm:text-5xl md:text-6xl lg:text-7xl",
                      moodColors.primary.includes('blue') ? '[-webkit-text-stroke:1px_rgba(59,130,246,0.6)]' : '[-webkit-text-stroke:1px_rgba(249,115,22,0.6)]'
                    )}>PERFORMANCE</span>
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-12">
                      <div className="space-y-6">
                          <div className={cn("text-7xl font-black leading-none tracking-tighter bg-gradient-to-br bg-clip-text text-transparent", moodColors.gradient)}>98%</div>
                          <div className="text-[11px] font-mono text-primary uppercase tracking-[0.4em] font-bold">Accuracy</div>
                          <p className="text-sm text-white/40 leading-relaxed font-light">Neural accuracy maintained across variable stress contexts.</p>
                      </div>
                      <div className="space-y-6">
                          <div className={cn("text-7xl font-black leading-none tracking-tighter bg-gradient-to-br bg-clip-text text-transparent", moodColors.gradient)}>24ms</div>
                          <div className="text-[11px] font-mono text-primary uppercase tracking-[0.4em] font-bold">Latency</div>
                          <p className="text-sm text-white/40 leading-relaxed font-light">Real-time synaptic feedback for instant pacing adjustments.</p>
                      </div>
                  </div>
                </RevealSection>
            </div>
        </div>
      </section>

      {/* Final CTA Section: Neural Gateway Climax */}
      <section id="neural-gateway" className="py-64 relative min-h-screen flex items-center overflow-hidden bg-[#020205]">
        {/* The Portal: Rotating Concentric Rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
          <div className="gateway-ring absolute w-[1200px] h-[1200px] border border-primary/20 rounded-full animate-spin-slow" />
          <div className="gateway-ring absolute w-[900px] h-[900px] border border-secondary/10 rounded-full animate-reverse-spin-slow" style={{ animationDuration: '30s' }} />
          <div className="gateway-ring absolute w-[600px] h-[600px] border border-primary/5 rounded-full animate-spin-slow" style={{ animationDuration: '40s' }} />
        </div>

        {/* Vertical Data Streams */}
        <div className="absolute inset-0 flex justify-around opacity-10 pointer-events-none">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-[1px] h-full bg-gradient-to-b from-transparent via-primary to-transparent animate-data-stream" style={{ animationDelay: `${i * 1.5}s` }} />
          ))}
        </div>
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            
            {/* Left Column: The Narrative */}
            <RevealSection className="text-left">
              <div className="relative inline-block mb-8">
                <span className="font-mono text-[10px] tracking-[0.5em] text-primary uppercase">[ Link_Status: Active ]</span>
                <div className="absolute -top-4 -left-4 w-2 h-2 bg-primary rounded-full animate-pulse" />
              </div>
              
              <div className="relative group">
                {/* HUD Labels */}
                <div className="absolute -top-10 left-0 font-mono text-[9px] text-white/20 tracking-widest uppercase">[ System_Sync_Ready ]</div>
                <div className="absolute -bottom-6 right-1/4 font-mono text-[9px] text-white/20 tracking-widest uppercase">[ Archive_V4.0.2 ]</div>

                <h2 className="font-display text-7xl md:text-[10rem] font-black leading-[0.8] tracking-tighter uppercase mb-12">
                  YOUR <br />
                  <span className={cn(
                    "bg-gradient-to-r bg-clip-text text-transparent animate-gradient-liquid", 
                    moodColors.gradient
                  )}>
                    DESTINY
                  </span>
                </h2>
              </div>
            </RevealSection>

            {/* Right Column: The Interface */}
            <RevealSection className="flex flex-col items-center lg:items-end">
              <div className="max-w-md text-center lg:text-right mb-16">
                <p className="text-2xl md:text-3xl text-white/40 leading-relaxed font-extralight tracking-tight">
                  The architecture of your learning path is no longer static. It is a living, breathing response to your focus.
                </p>
              </div>

              {/* The Neural Orb Button */}
              <div className="relative group">
                {/* Ambient Orb Glow */}
                <div className={cn(
                  "absolute inset-0 rounded-full blur-[100px] opacity-20 group-hover:opacity-40 transition-opacity duration-1000",
                  moodColors.gradient
                )} />
                
                <MagneticButton 
                  className="w-64 h-64 md:w-80 md:h-80 rounded-full bg-white/5 border border-white/10 backdrop-blur-3xl p-1 flex flex-col items-center justify-center group relative overflow-hidden transition-all duration-700 hover:border-primary/50"
                  onClick={() => navigate('/create-path')}
                >
                  <div className={cn(
                    "absolute inset-0 opacity-10 group-hover:opacity-20 animate-pulse transition-opacity duration-1000",
                    moodColors.gradient
                  )} />
                  
                  <div className="relative z-10 flex flex-col items-center gap-4">
                    <span className="text-sm font-mono tracking-[0.4em] text-white/40 uppercase">Initiate</span>
                    <span className="text-3xl font-black tracking-tighter">EVOLUTION</span>
                    <ArrowRight className="w-8 h-8 group-hover:translate-x-3 transition-transform duration-500" />
                  </div>

                  {/* Shifting Liquid Texture */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-secondary/5 group-hover:scale-150 transition-transform duration-1000" />
                </MagneticButton>
              </div>
            </RevealSection>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-white/5 bg-background relative z-10">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex items-center gap-4 group cursor-help">
                <NeuralIcon 
                  icon={Brain} 
                  className="w-12 h-12" 
                  iconClassName="w-6 h-6"
                  gradient={moodColors.gradient}
                />
                <div className="text-left">
                  <div className="font-display font-black text-xl tracking-tight group-hover:text-primary transition-colors">AFFEX</div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">AFFEX NEURAL SYSTEMS</div>
                </div>
              </div>
            
            <div className="flex gap-12 text-xs font-mono uppercase tracking-widest text-white/30">
                <a href="#" className="hover:text-primary transition-colors">{"Privacy"}</a>
                <a href="#" className="hover:text-primary transition-colors">{"OSINT"}</a>
                <a href="#" className="hover:text-primary transition-colors">{"Neural Net"}</a>
            </div>

            <p className="text-xs text-white/20 font-mono">(c) 2026 - AFFEX NEURAL SYSTEMS</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;


