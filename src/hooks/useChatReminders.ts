import { useEffect, useRef } from "react";

const REMINDER_INTERVAL_MS = 15 * 60 * 1000;

type WindowWithWebkitAudio = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

function playChatReminderSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioContextClass) return;
    const audio = new AudioContextClass();
    const gain = audio.createGain();
    gain.gain.value = 0.045;
    gain.connect(audio.destination);

    [0, 0.18].forEach((offset) => {
      const oscillator = audio.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audio.currentTime + offset);
      oscillator.connect(gain);
      oscillator.start(audio.currentTime + offset);
      oscillator.stop(audio.currentTime + offset + 0.11);
    });
  } catch {
    // Browsers can block audio until the user interacts with the page.
  }
}

export function useChatReminders(enabled: boolean) {
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const checkReminders = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const res = await fetch("/api/chat/recordatorios", {
          method: "POST",
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if ((data.recordatorios || 0) > 0) playChatReminderSound();
        }
      } catch {
        // Silencioso: el polling normal de notificaciones sigue funcionando.
      } finally {
        runningRef.current = false;
      }
    };

    const interval = setInterval(checkReminders, REMINDER_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled]);
}