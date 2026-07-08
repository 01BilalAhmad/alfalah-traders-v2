import { useState, useEffect, useRef } from 'react';

export function useAnimatedNumber(target: number, duration: number = 800): number {
  const [current, setCurrent] = useState(0);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const startValueRef = useRef<number>(0);

  useEffect(() => {
    startValueRef.current = current;
    startTimeRef.current = null;

    function easeOutCubic(t: number): number {
      return 1 - Math.pow(1 - t, 3);
    }

    function animate(timestamp: number) {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      const value = startValueRef.current + (target - startValueRef.current) * easedProgress;
      setCurrent(Math.round(value));

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    }

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [target, duration]);

  return current;
}
