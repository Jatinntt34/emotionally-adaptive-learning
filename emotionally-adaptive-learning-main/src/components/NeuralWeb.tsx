import React, { useMemo, useEffect, useState, useRef } from 'react';
import { motion, useTransform, useMotionValue } from 'framer-motion';
import { useMood } from '@/contexts/MoodContext';
import { cn } from '@/lib/utils';

interface Node {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
}

interface Line {
  i: number;
  j: number;
}

const NeuralWeb: React.FC<{ className?: string }> = ({ className }) => {
  const { mood, moodColors } = useMood();
  const [activeNodes, setActiveNodes] = useState<Node[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize web structure
  useEffect(() => {
    const nodeCount = moodColors.synapticDensity || 25;
    const newNodes: Node[] = Array.from({ length: nodeCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 15 + 5,
      duration: Math.random() * 2 + 1,
    }));

    const newLines: Line[] = [];
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        const dist = Math.sqrt(
          Math.pow(newNodes[i].x - newNodes[j].x, 2) + 
          Math.pow(newNodes[i].y - newNodes[j].y, 2)
        );
        if (dist < 20) {
          newLines.push({ i, j });
        }
      }
    }

    setActiveNodes(newNodes);
    setLines(newLines);
  }, [moodColors.synapticDensity]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const { left, top, width, height } = containerRef.current.getBoundingClientRect();
    mouseX.set((e.clientX - left) / width - 0.5);
    mouseY.set((e.clientY - top) / height - 0.5);
  };

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={cn("absolute inset-0 overflow-hidden pointer-events-none opacity-30", className)}
    >
      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <radialGradient id="nodeGradient">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.8" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Neural Lines */}
        {lines.map((line, idx) => (
          <motion.line
            key={`line-${idx}`}
            x1={activeNodes[line.i]?.x ?? 50}
            y1={activeNodes[line.i]?.y ?? 50}
            x2={activeNodes[line.j]?.x ?? 50}
            y2={activeNodes[line.j]?.y ?? 50}
            stroke="currentColor"
            strokeWidth="0.05"
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: [0.05, 0.15, 0.05],
              stroke: moodColors.primary 
            }}
            transition={{
              opacity: { duration: 3, repeat: Infinity, ease: "easeInOut", delay: Math.random() * 2 },
              duration: 1
            }}
            style={{ color: moodColors.primary }}
          />
        ))}

        {/* Neural Nodes */}
        {activeNodes.map((node, idx) => (
          <Node 
            key={node.id} 
            node={node} 
            idx={idx} 
            color={moodColors.primary}
            mouseX={mouseX}
            mouseY={mouseY}
            pulseSpeed={moodColors.pulseSpeed}
          />
        ))}
      </svg>
      
      {/* Ambient Neural Pulses */}
      <div className="absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] pointer-events-none">
          <motion.div 
            className={cn("absolute inset-0 rounded-full blur-[120px] opacity-10", moodColors.gradient)}
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.05, 0.15, 0.05] 
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>
    </div>
  );
};

const Node = ({ node, idx, color, mouseX, mouseY, pulseSpeed }: { 
  node: Node, idx: number, color: string, mouseX: any, mouseY: any, pulseSpeed: number 
}) => {
  const parallaxX = useTransform(mouseX, [-0.5, 0.5], [-(node.size * 0.5), node.size * 0.5]);
  const parallaxY = useTransform(mouseY, [-0.5, 0.5], [-(node.size * 0.5), node.size * 0.5]);

  return (
    <motion.circle
      cx={node?.x ?? 50}
      cy={node?.y ?? 50}
      r={0}
      fill={color}
      style={{ 
        x: parallaxX, 
        y: parallaxY,
        filter: `drop-shadow(0 0 1px ${color})`
      }}
      initial={{ opacity: 0, r: 0 }}
      animate={{ 
        opacity: [0.3, 0.7, 0.3],
        scale: [1, 1.2, 1],
        r: (node?.size ?? 5) / 15,
        cx: node?.x ?? 50,
        cy: node?.y ?? 50,
      }}
      transition={{
        cx: { duration: 2.5, delay: idx * 0.02, ease: [0.16, 1, 0.3, 1] }, 
        cy: { duration: 2.5, delay: idx * 0.02, ease: [0.16, 1, 0.3, 1] },
        r: { duration: 1.5, delay: idx * 0.02, ease: "easeOut" },
        opacity: { duration: (node?.duration ?? 2) * pulseSpeed, repeat: Infinity, ease: "easeInOut" },
        scale: { duration: 4 * pulseSpeed, repeat: Infinity, ease: "easeInOut" }
      }}
    />
  );
};

export default NeuralWeb;
