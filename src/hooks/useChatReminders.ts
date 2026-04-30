import { useEffect, useRef } from "react";

const REMINDER_INTERVAL_MS = 15 * 60 * 1000;
const VISIBLE_CHECK_DELAY_MS = 2_000;
const LEADER_HEARTBEAT_MS = 5_000;
const LEADER_TTL_MS = 16_000;
const SOUND_DEDUPE_MS = 14 * 60 * 1000;
const LEADER_KEY = "pmn-chat-reminder-leader";
const LAST_SOUND_KEY = "pmn-chat-reminder-last-sound";

type WindowWithWebkitAudio = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

type LeaderState = {
  tabId: string;
  visible: boolean;
  updatedAt: number;
};

function readLeader(): LeaderState | null {
  try {
    const raw = localStorage.getItem(LEADER_KEY);
    return raw ? JSON.parse(raw) as LeaderState : null;
  } catch {
    return null;
  }
}

function writeLeader(tabId: string) {
  try {
    localStorage.setItem(LEADER_KEY, JSON.stringify({
      tabId,
      visible: document.visibilityState === "visible",
      updatedAt: Date.now(),
    }));
  } catch {
    // El storage puede no estar disponible en modos restringidos del navegador.
  }
}

function shouldLead(tabId: string) {
  const now = Date.now();
  const leader = readLeader();
  const isVisible = document.visibilityState === "visible";

  if (!leader || now - leader.updatedAt > LEADER_TTL_MS) {
    writeLeader(tabId);
    return true;
  }

  if (leader.tabId === tabId) {
    writeLeader(tabId);
    return true;
  }

  if (isVisible && !leader.visible) {
    writeLeader(tabId);
    return true;
  }

  return false;
}

function shouldPlaySound(userKey: string) {
  try {
    const key = `${LAST_SOUND_KEY}:${userKey}`;
    const last = Number(localStorage.getItem(key) || "0");
    const now = Date.now();
    if (now - last < SOUND_DEDUPE_MS) return false;
    localStorage.setItem(key, String(now));
    return true;
  } catch {
    return true;
  }
}

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

export function useChatReminders(enabled: boolean, userKey = "default") {
  const runningRef = useRef(false);
  const tabIdRef = useRef(`tab-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!enabled) return;

    const checkReminders = async () => {
      const isVisible = document.visibilityState === "visible";
      if (!shouldLead(tabIdRef.current)) return;
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const res = await fetch("/api/chat/recordatorios", {
          method: "POST",
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          const hasPending = (data.recordatorios || 0) > 0 || (data.pendientes || 0) > 0;
          if (isVisible && hasPending && shouldPlaySound(userKey)) playChatReminderSound();
        }
      } catch {
        // Silencioso: el polling normal de notificaciones sigue funcionando.
      } finally {
        runningRef.current = false;
      }
    };

    const heartbeat = setInterval(() => {
      if (shouldLead(tabIdRef.current)) writeLeader(tabIdRef.current);
    }, LEADER_HEARTBEAT_MS);
    const interval = setInterval(checkReminders, REMINDER_INTERVAL_MS);
    const visibleTimer = setTimeout(checkReminders, VISIBLE_CHECK_DELAY_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        writeLeader(tabIdRef.current);
        checkReminders();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      clearInterval(heartbeat);
      clearInterval(interval);
      clearTimeout(visibleTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [enabled, userKey]);
}
