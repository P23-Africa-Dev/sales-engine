'use client';

import { useEffect, useState, useRef } from 'react';

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const deferredPrompt = useRef<Event | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if already in standalone mode (installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || !!(navigator as unknown as { standalone?: boolean }).standalone
      || document.referrer.includes('android-app://');
    
    setTimeout(() => setIsInstalled(isStandalone), 0);

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent standard browser install prompts
      e.preventDefault();
      // Store event
      deferredPrompt.current = e;
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      deferredPrompt.current = null;
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt.current) return false;
    
    try {
      const promptEvent = deferredPrompt.current as unknown as { 
        prompt: () => void; 
        userChoice: Promise<{ outcome: string }>; 
      };
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      deferredPrompt.current = null;
      setCanInstall(false);
      return outcome === 'accepted';
    } catch {
      return false;
    }
  };

  return { canInstall, promptInstall, isInstalled };
}
