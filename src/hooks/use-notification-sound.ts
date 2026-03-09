"use client";

import { useCallback, useRef, useState } from "react";

// Simple notification sound using Web Audio API
export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);

  const playSound = useCallback(() => {
    if (!isEnabled) return;

    try {
      // Create audio context lazily
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioContext = audioContextRef.current;

      // Create a simple beep sound
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Configure the sound
      oscillator.frequency.value = 800;
      oscillator.type = "sine";

      // Fade out
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      // Play
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.log("Notification sound not available:", error);
    }
  }, [isEnabled]);

  const toggleSound = useCallback(() => {
    setIsEnabled((prev) => !prev);
  }, []);

  return {
    playSound,
    toggleSound,
    isEnabled,
  };
}
