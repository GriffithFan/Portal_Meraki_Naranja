"use client";

import { useEffect } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function subscribeToPush(registration: ServiceWorkerRegistration) {
  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      // Ya suscrito, enviar al backend por si cambió
      await sendSubscription(existing);
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key.buffer as ArrayBuffer,
    });

    await sendSubscription(subscription);
  } catch (err) {
    console.error("[Push] Error subscribing:", err);
  }
}

async function sendSubscription(subscription: PushSubscription) {
  try {
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
  } catch (err) {
    console.error("[Push] Error sending subscription:", err);
  }
}

export default function PushNotificationRegistrar() {
  useEffect(() => {
    if (!VAPID_PUBLIC_KEY) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "activated") {
                subscribeToPush(registration);
              }
            });
          }
        });

        // Si ya hay un SW activo, suscribir directamente
        if (registration.active) {
          subscribeToPush(registration);
        }
      })
      .catch((err) => console.error("[SW] Registration failed:", err));
  }, []);

  return null; // Componente invisible, solo registra
}
