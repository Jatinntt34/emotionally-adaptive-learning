import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface RevealSectionProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function RevealSection({ children, className, delay = 0 }: RevealSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(sectionRef.current, 
        { 
          opacity: 0, 
          y: 40, 
          filter: 'blur(8px)',
          scale: 0.98
        },
        {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          scale: 1,
          duration: 1.4,
          delay,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 88%",
            toggleActions: "play none none none",
            fastScrollEnd: true
          }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, [delay]);

  return (
    <div ref={sectionRef} className={className}>
      {children}
    </div>
  );
}
