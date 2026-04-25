import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMood } from '@/contexts/MoodContext';
import { useAuth } from '@/contexts/AuthContext';
import { MagneticButton } from '@/components/ui/MagneticButton';
import { AuthGateModal } from '@/components/AuthGateModal';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NeuralSearchHub() {
  const navigate = useNavigate();
  const { moodColors } = useMood();
  const { user } = useAuth();
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAuthGate, setShowAuthGate] = useState(false);

  const proceedWithTopic = (topic: string) => {
    navigate('/create-path', { state: { initialTopic: topic } });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    if (user) {
      proceedWithTopic(searchQuery);
    } else {
      setShowAuthGate(true);
    }
  };

  const handleGenerateCustom = () => {
    if (user) {
      if (searchQuery.trim()) {
        proceedWithTopic(searchQuery);
      } else {
        navigate('/create-path');
      }
    } else {
      setShowAuthGate(true);
    }
  };

  const scrollToFeatures = () => {
    document.getElementById('features-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <section id="neural-search-section" className="py-24 px-6 relative overflow-hidden bg-background">
        {/* High-Fidelity Glows */}
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
          <div 
            className="search-hub-glow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[120px]"
            style={{ background: `radial-gradient(circle, ${moodColors.primary} 0%, transparent 70%)` }}
          />
        </div>

        <div className="max-w-4xl mx-auto relative z-10 text-center search-hub-kinetic">
          <motion.div
             initial={{ opacity: 0, y: 20 }}
             whileInView={{ opacity: 1, y: 0 }}
             viewport={{ once: true }}
             transition={{ duration: 0.8 }}
          >
            <p className="text-[10px] font-mono tracking-[0.4em] uppercase text-primary mb-6 opacity-50">
              AFFEX INQUIRY SYSTEM
            </p>
            
            <h2 className="search-hub-title font-display text-5xl md:text-7xl font-black mb-12 tracking-tighter leading-none">
              WHAT SHOULD WE <br />
              <span className={cn("bg-gradient-to-r bg-clip-text text-transparent", moodColors.gradient)}>EXPLORE?</span>
            </h2>

            <div className="max-w-2xl mx-auto mb-12 search-hub-input">
              <form onSubmit={handleSearch} className="relative w-full">
                <div className={cn(
                  "relative h-16 rounded-2xl border transition-all duration-500 overflow-hidden flex items-center px-6 gap-4",
                  "bg-white/[0.03] backdrop-blur-3xl",
                  searchFocused
                    ? "border-primary/50 shadow-[0_0_60px_rgba(var(--primary-rgb),0.2)]"
                    : "border-white/10 shadow-2xl hover:border-white/20"
                )}>
                  <div className={cn("w-5 h-5 flex items-center justify-center transition-colors duration-300",
                    searchFocused ? "text-primary" : "text-white/20")}>
                    <span className="text-[10px] font-mono font-bold">AF</span>
                  </div>
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    placeholder="Ask anything..."
                    className="flex-1 bg-transparent border-none outline-none text-base text-white placeholder:text-white/20 font-light"
                  />
                  <MagneticButton 
                    type="submit" 
                    variant="mood" 
                    size="sm"
                    className="h-10 px-5 rounded-xl font-black flex-shrink-0 text-xs"
                  >
                    INITIALIZE
                  </MagneticButton>
                </div>
              </form>
              
              <div className="flex flex-wrap justify-center gap-3 mt-6">
                {['String Theory', 'Renaissance Art', 'Bio-Intelligence', 'Neural Ethics'].map(tag => (
                  <button 
                    key={tag} 
                    type="button" 
                    onClick={() => setSearchQuery(tag)}
                    className="text-[10px] font-mono tracking-wider text-white/30 hover:text-primary transition-all hover:-translate-y-px px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/5 hover:border-primary/30"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-8 justify-center items-center">
              <MagneticButton onClick={handleGenerateCustom}>
                <span className="flex items-center gap-3">
                  GENERATE CUSTOM PATH
                  <ArrowRight className="w-5 h-5" />
                </span>
              </MagneticButton>
              <button 
                onClick={scrollToFeatures}
                className="text-white/30 hover:text-white transition-colors flex items-center gap-3 group text-sm font-light tracking-wide"
              >
                <div className="w-8 h-px bg-white/20 group-hover:w-12 transition-all" />
                VIEW CAPABILITIES
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Auth Gate Modal */}
      <AuthGateModal
        isOpen={showAuthGate}
        onClose={() => setShowAuthGate(false)}
        topic={searchQuery}
      />
    </>
  );
}


