import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';

interface RevealSectionProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function RevealSection({ children, className, delay = 0 }: RevealSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    // Simple mount animation — NO ScrollTrigger.
    // ScrollTrigger breaks inside AnimatePresence step transitions
    // because the scroll position doesn't reset between steps.
    const tween = gsap.fromTo(sectionRef.current, 
      { opacity: 0, y: 40, filter: 'blur(6px)' },
      {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.8,
        delay,
        ease: "power3.out",
      }
    );

    return () => { tween.kill(); };
  }, [delay]);

  return (
    <div ref={sectionRef} className={className}>
      {children}
    </div>
  );
}
