import { useEffect } from 'react';
import { useSettings } from '@uios/render-engine';

export function useVoiceCommand(onCommand: (command: string) => void) {
  const { voiceEnabled } = useSettings();

  useEffect(() => {
    if (!voiceEnabled || typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognizer = new SpeechRecognition();
    recognizer.continuous = true;
    recognizer.interimResults = false;
    recognizer.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      onCommand(transcript);
    };
    recognizer.start();
    return () => recognizer.stop();
  }, [voiceEnabled, onCommand]);
}
