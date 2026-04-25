import React, { useMemo } from 'react';
import { motion, useSpring, useMotionValue, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useMood } from '@/contexts/MoodContext';

interface NeuralWebProps {
  className?: string;
  color?: string;
}

const NeuralWeb: React.FC<NeuralWebProps> = ({ className, color: propColor }) => {
  const { moodColors } = useMood();
  const color = propColor || moodColors.primary;
  
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Interaction physics now adapt to mood
  const smoothX = useSpring(mouseX, moodColors.interactionResponse);
  const smoothY = useSpring(mouseY, moodColors.interactionResponse);

  const svgX = useTransform(smoothX, [-0.5, 0.5], [-5, 5]);
  const svgY = useTransform(smoothY, [-0.5, 0.5], [-5, 5]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY, currentTarget } = e;
    const { left, top, width, height } = currentTarget.getBoundingClientRect();
    const x = (clientX - left) / width - 0.5;
    const y = (clientY - top) / height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  // Pre-generate a large pool of nodes to avoid flicker on mood change
  const nodePool = useMemo(() => {
    return Array.from({ length: 80 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      duration: Math.random() * 10 + 10,
      delay: Math.random() * -20,
    }));
  }, []);

  // Filter nodes based on mood synaptic density
  const activeNodes = useMemo(() => {
    return nodePool.slice(0, moodColors.synapticDensity);
  }, [nodePool, moodColors.synapticDensity]);

  // Find nearby nodes to create connections
  const connections = useMemo(() => {
    const lines = [];
    for (let i = 0; i < activeNodes.length; i++) {
      for (let j = i + 1; j < activeNodes.length; j++) {
        const dx = activeNodes[i].x - activeNodes[j].x;
        const dy = activeNodes[i].y - activeNodes[j].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 35) {
          lines.push({ i, j, opacity: 1 - distance / 35 });
        }
      }
    }
    return lines;
  }, [activeNodes]);

  return (
    <div 
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn("relative w-full h-full overflow-hidden bg-[#020205] rounded-3xl border border-white/5", className)}
    >
      {/* Psychological Isolation Layer (Focus Mask) - Reduced Intensity */}
      <motion.div 
        className="absolute inset-0 z-10 pointer-events-none transition-all duration-1000"
        style={{ 
          backdropFilter: `blur(${moodColors.focusIndex * 8}px)`,
          backgroundColor: `rgba(2, 2, 5, ${moodColors.focusIndex * 0.2})` 
        }}
      />

      <motion.svg 
        style={{ x: svgX, y: svgY }}
        className="w-full h-full" 
        viewBox="0 0 100 100" 
        preserveAspectRatio="none"
      >
        <defs>
          <radialGradient id="nodeGradient">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Connections */}
        {connections.map((line, idx) => (
          <motion.line
            key={`line-${idx}`}
            x1={50}
            y1={50}
            x2={50}
            y2={50}
            stroke={color}
            strokeWidth="0.08"
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: [0.1, line.opacity * 0.5, 0.1],
              x1: activeNodes[line.i].x,
              y1: activeNodes[line.i].y,
              x2: activeNodes[line.j].x,
              y2: activeNodes[line.j].y,
            }}
            transition={{
              x1: { duration: 1.5, delay: idx * 0.005, ease: "easeOut" },
              y1: { duration: 1.5, delay: idx * 0.005, ease: "easeOut" },
              x2: { duration: 1.5, delay: idx * 0.005, ease: "easeOut" },
              y2: { duration: 1.5, delay: idx * 0.005, ease: "easeOut" },
              opacity: { 
                duration: (Math.random() * 5 + 5) * moodColors.pulseSpeed, 
                repeat: Infinity, 
                ease: "easeInOut" 
              },
            }}
          />
        ))}

        {/* Nodes */}
        {activeNodes.map((node, idx) => (
          <Node 
            key={node.id} 
            node={node} 
            idx={idx} 
            color={color} 
            mouseX={smoothX} 
            mouseY={smoothY} 
            pulseSpeed={moodColors.pulseSpeed}
          />
        ))}

        {/* Pulsing Signal Effect */}
        {connections.slice(0, Math.floor(moodColors.synapticDensity / 3)).map((line, idx) => (
          <motion.circle
            key={`pulse-${idx}`}
            r="0.3"
            fill={color}
            initial={{ opacity: 0 }}
            animate={{ 
              offsetDistance: ["0%", "100%"],
              opacity: [0, 1, 0]
            }}
            style={{
              offsetPath: `path('M ${activeNodes[line.i].x} ${activeNodes[line.i].y} L ${activeNodes[line.j].x} ${activeNodes[line.j].y}')`,
              filter: `drop-shadow(0 0 3px ${color})`
            }}
            transition={{
              duration: (Math.random() * 3 + 2) * moodColors.pulseSpeed,
              repeat: Infinity,
              ease: "linear",
              delay: Math.random() * -10
            }}
          />
        ))}
      </motion.svg>

      {/* Ambient Glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full blur-[160px] rounded-full transition-opacity duration-1000"
          style={{ 
            backgroundColor: color,
            opacity: 0.2 - (moodColors.focusIndex * 0.1)
          }}
        />
      </div>

      <div className="absolute bottom-8 left-8 z-20">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[8px] uppercase tracking-[0.4em] text-white/60">
            {moodColors.label} Synaptic Array
          </span>
          <motion.div 
            className="h-px bg-gradient-to-r from-primary/80 to-transparent" 
            animate={{ width: [24, 48, 24] }}
            transition={{ duration: 4 * moodColors.pulseSpeed, repeat: Infinity }}
          />
        </div>
      </div>
    </div>
  );
};

const Node = ({ node, idx, color, mouseX, mouseY, pulseSpeed }: any) => {
  const parallaxX = useTransform(mouseX, [-0.5, 0.5], [-(node.size * 3), node.size * 3]);
  const parallaxY = useTransform(mouseY, [-0.5, 0.5], [-(node.size * 3), node.size * 3]);

  return (
    <motion.circle
      cx={50}
      cy={50}
      r={0}
      fill={color}
      style={{ 
        x: parallaxX, 
        y: parallaxY,
        filter: `drop-shadow(0 0 2px ${color})`
      }}
      initial={{ opacity: 0, r: 0 }}
      animate={{ 
        opacity: [0.4, 1, 0.4],
        scale: [1, 1.3, 1],
        r: node.size / 5,
        cx: node.x,
        cy: node.y,
      }}
      transition={{
        cx: { duration: 2, delay: idx * 0.01, ease: [0.16, 1, 0.3, 1] }, // expoOut
        cy: { duration: 2, delay: idx * 0.01, ease: [0.16, 1, 0.3, 1] },
        r: { duration: 1.5, delay: idx * 0.01, ease: "easeOut" },
        opacity: { duration: node.duration * pulseSpeed, repeat: Infinity, ease: "easeInOut" },
        scale: { duration: 4 * pulseSpeed, repeat: Infinity, ease: "easeInOut" }
      }}
    />
  );
};

export default NeuralWeb;


