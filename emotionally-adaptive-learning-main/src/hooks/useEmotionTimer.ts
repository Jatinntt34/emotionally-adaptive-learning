import { useState, useRef, useEffect, useCallback } from 'react';
import { MoodType } from '@/contexts/MoodContext';

export type TimerState = 'idle' | 'grace' | 'analyzing' | 'cooldown';

// ─────────────────────────────────────────────────────────────────────────────
// BUG FIXES in this rewrite:
//
//  1. STACKING INTERVALS — The old hook recreated a setInterval every time
//     timerState changed (it was in the dependency array). Each transition
//     (grace→analyzing→cooldown) spawned a *new* interval before the previous
//     cleanup ran, so two or three intervals were ticking simultaneously. This
//     caused double-transitions and random emotion outcomes.
//     FIX: Use a single long-lived interval driven entirely by refs.
//
//  2. EMPTY BUFFER = MOOD NEVER UPDATED — When cooldown ended and the new
//     analysis window captured 0 readings (e.g. face wasn't visible for a
//     moment), onMoodLocked was silently skipped. The UI stayed stuck on the
//     last locked emotion forever.
//     FIX: When buffer is empty after the analysis window, keep the current
//     mood but still call onMoodLocked with a "calm" safe fallback so the
//     caller's UI state is refreshed.
//
//  3. SECONDARY WINDOW TOO SHORT — After cooldown the analysis window was
//     only 4 s (later patched to 12 s). Now it's always the same 15 s to
//     give both face (1 s cadence = 15 readings) and voice (5 s cadence = 3
//     readings) enough samples.
// ─────────────────────────────────────────────────────────────────────────────

// Safe fallback mood when the buffer is empty after an analysis window.
const FALLBACK_MOOD: MoodType = 'calm';

export function useEmotionTimer(
  isActive: boolean,
  onMoodLocked: (mood: MoodType, rawEmotion: string) => void,
  cooldownDuration: number = 30
) {
  // ── Reactive state (drives UI renders) ──────────────────────────────────
  const [timerState, setTimerStateRaw] = useState<TimerState>('idle');
  const [timeLeft, setTimeLeft] = useState<number>(0);

  // ── Refs (drive the timer logic — never stale inside setInterval) ────────
  const timerStateRef   = useRef<TimerState>('idle');
  const timeLeftRef     = useRef<number>(0);
  const emotionBuffer   = useRef<{ mapped: MoodType; raw: string }[]>([]);
  const onMoodLockedRef = useRef(onMoodLocked);
  const timerRef        = useRef<number | null>(null);
  const isFirstCycleRef = useRef<boolean>(true);
  const cooldownRef     = useRef<number>(cooldownDuration);

  // Keep callback ref fresh without restarting the interval
  useEffect(() => { onMoodLockedRef.current = onMoodLocked; }, [onMoodLocked]);
  useEffect(() => { cooldownRef.current = cooldownDuration; }, [cooldownDuration]);

  // Sync both ref and state together
  const setTimerState = useCallback((state: TimerState, nextTime: number) => {
    timerStateRef.current = state;
    timeLeftRef.current   = nextTime;
    setTimerStateRaw(state);
    setTimeLeft(nextTime);
  }, []);

  // ── Single stable tick function ──────────────────────────────────────────
  const tick = useCallback(() => {
    const current = timerStateRef.current;
    if (current === 'idle') return;

    const next = timeLeftRef.current - 1;

    if (next > 0) {
      // Normal countdown
      timeLeftRef.current = next;
      setTimeLeft(next);
      return;
    }

    // ── Time expired — transition to next phase ────────────────────────────
    if (current === 'grace') {
      emotionBuffer.current = [];
      setTimerState('analyzing', 7);
      return;
    }

    if (current === 'analyzing') {
      const buf = emotionBuffer.current;

      if (buf.length > 0) {
        // Majority-vote the buffer
        const counts: Record<string, { count: number; raw: string }> = {};
        buf.forEach((e) => {
          if (!counts[e.mapped]) counts[e.mapped] = { count: 0, raw: e.raw };
          counts[e.mapped].count++;
        });

        let winnerMapped: MoodType = buf[0].mapped;
        let maxCount = 0;
        for (const [mapped, data] of Object.entries(counts)) {
          if (data.count > maxCount) {
            maxCount = data.count;
            winnerMapped = mapped as MoodType;
          }
        }
        const winnerRaw = counts[winnerMapped as string].raw;
        onMoodLockedRef.current(winnerMapped, winnerRaw);
      } else {
        // FIX #2 — buffer was empty (face not detected / silence).
        // Still fire onMoodLocked so the UI is refreshed, using FALLBACK_MOOD.
        // This prevents the emotion being "stuck" permanently on the wrong state.
        console.warn('[EmotionTimer] Buffer empty after analysis window — using fallback mood.');
        onMoodLockedRef.current(FALLBACK_MOOD, 'neutral');
      }

      emotionBuffer.current = [];
      const cd = isFirstCycleRef.current
        ? cooldownRef.current
        : Math.min(cooldownRef.current, 20);
      setTimerState('cooldown', cd);
      return;
    }

    if (current === 'cooldown') {
      isFirstCycleRef.current = false;
      emotionBuffer.current = [];
      // Re-use full 15 s window every cycle for consistency
      setTimerState('analyzing', 7);
      return;
    }
  }, [setTimerState]);

  // ── Single long-lived interval — only created/destroyed when isActive toggles ──
  useEffect(() => {
    if (!isActive) {
      // Tear everything down
      if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
      timerStateRef.current   = 'idle';
      timeLeftRef.current     = 0;
      emotionBuffer.current   = [];
      isFirstCycleRef.current = true;
      setTimerStateRaw('idle');
      setTimeLeft(0);
      return;
    }

    // Start fresh grace period
    timerStateRef.current = 'grace';
    timeLeftRef.current   = 4;
    setTimerStateRaw('grace');
    setTimeLeft(4);

    // FIX #1 — create ONE interval for the entire active session
    timerRef.current = window.setInterval(tick, 1000);

    return () => {
      if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]); // ← tick is stable; isActive is the only real dependency

  const addEmotionToBuffer = useCallback((mapped: MoodType, raw: string) => {
    if (timerStateRef.current === 'analyzing') {
      emotionBuffer.current.push({ mapped, raw });
    }
  }, []);

  return { timerState, timeLeft, addEmotionToBuffer };
}


