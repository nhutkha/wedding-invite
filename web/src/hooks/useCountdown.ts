import { useEffect, useMemo, useState } from 'react';

interface CountdownState {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isFinished: boolean;
}

function toCountdownState(targetTime: number): CountdownState {
  const delta = Math.max(targetTime - Date.now(), 0);

  const days = Math.floor(delta / (1000 * 60 * 60 * 24));
  const hours = Math.floor((delta / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((delta / (1000 * 60)) % 60);
  const seconds = Math.floor((delta / 1000) % 60);

  return {
    totalMs: delta,
    days,
    hours,
    minutes,
    seconds,
    isFinished: delta === 0,
  };
}

export function useCountdown(targetDateIso: string) {
  const targetTime = useMemo(() => {
    const parsed = Date.parse(targetDateIso);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }, [targetDateIso]);

  const [state, setState] = useState<CountdownState>(() =>
    toCountdownState(targetTime)
  );

  useEffect(() => {
    setState(toCountdownState(targetTime));

    const timer = window.setInterval(() => {
      setState(toCountdownState(targetTime));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [targetTime]);

  return state;
}
