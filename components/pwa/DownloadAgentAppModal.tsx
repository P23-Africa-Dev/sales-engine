'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  X,
  Smartphone,
  WifiOff,
  MapPin,
  Camera,
  MessageSquare,
  Share,
  ScanLine,
  Download,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { AgentApkQrCode, AgentInstallQrCode } from '@/components/pwa/AgentInstallQrCode';
import {
  getAgentApkUrl,
  getAgentInstallUrl,
  getAgentPwaUrl,
  isAndroidDevice,
  isDesktopDevice,
  isMobileDevice,
} from '@/lib/agent-pwa-url';
import Logo from '@/assets/images/logo.png';

interface DownloadAgentAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type InstallTab = 'pwa' | 'apk';

const FEATURES = [
  {
    icon: WifiOff,
    title: 'Offline-First Engine',
    description: 'Sync tasks and queues automatically when online.',
  },
  {
    icon: MapPin,
    title: 'Smart Routing & GPS',
    description: 'Live tracking with background GPS on the Android APK.',
  },
  {
    icon: Camera,
    title: 'Camera Proof Capture',
    description: 'Take visit confirmation pictures in the field.',
  },
  {
    icon: MessageSquare,
    title: 'AI Chat Assistant',
    description: 'Discuss site objectives with local intelligence context.',
  },
] as const;

function FeatureHighlights({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex flex-col bg-white/[0.02] border border-white/5 rounded-2xl ${compact ? 'gap-2 p-3' : 'gap-3 p-4'
        }`}
    >
      {FEATURES.map(({ icon: Icon, title, description }) => (
        <div key={title} className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-[#75ADAF] mt-0.5 flex-shrink-0">
            <Icon size={12} />
          </div>
          <div className="min-w-0">
            <p className={`font-bold leading-tight ${compact ? 'text-[11px]' : 'text-xs'}`}>{title}</p>
            <p className={`text-white/40 mt-0.5 ${compact ? 'text-[10px] leading-snug' : 'text-[10px]'}`}>
              {description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function InstallSteps({ tab, compact = false }: { tab: InstallTab; compact?: boolean }) {
  const steps =
    tab === 'pwa'
      ? [
        'Scan the QR code with your phone camera.',
        'Open the link and follow Install / Add to Home Screen.',
        'Launch Factory 23 Agent from your home screen.',
      ]
      : [
        'Scan the QR code with your Android phone camera.',
        'Download the APK, then allow install from this source if prompted.',
        'Open the installed Factory 23 Agent app and sign in.',
        'For live tracking while minimized, allow Location “all the time” + notifications.',
      ];

  return (
    <div
      className={`w-full rounded-2xl border border-white/5 bg-white/[0.03] text-left ${compact ? 'p-3' : 'p-4'
        }`}
    >
      <div className="flex items-center gap-2 text-xs font-bold text-[#75ADAF] mb-2">
        <ScanLine size={14} />
        <span>{tab === 'pwa' ? 'Install PWA on your phone' : 'Install Android APK'}</span>
      </div>
      <ol
        className={`list-decimal pl-4 text-white/70 leading-relaxed ${compact ? 'space-y-1 text-[10px]' : 'space-y-1.5 text-[11px]'
          }`}
      >
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

function TabSwitcher({
  tab,
  onChange,
}: {
  tab: InstallTab;
  onChange: (next: InstallTab) => void;
}) {
  return (
    <div className="flex rounded-full bg-white/5 border border-white/10 p-1 gap-1">
      <button
        type="button"
        onClick={() => onChange('pwa')}
        className={`flex-1 h-9 rounded-full text-[11px] font-bold transition-all ${tab === 'pwa' ? 'bg-[#75ADAF] text-white' : 'text-white/50 hover:text-white'
          }`}
      >
        Install PWA
      </button>
      <button
        type="button"
        onClick={() => onChange('apk')}
        className={`flex-1 h-9 rounded-full text-[11px] font-bold transition-all ${tab === 'apk' ? 'bg-[#75ADAF] text-white' : 'text-white/50 hover:text-white'
          }`}
      >
        Android APK
      </button>
    </div>
  );
}

function ModalHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-[22px] bg-gradient-to-tr from-[#113948] to-[#0A1D25] p-2.5 border border-white/10 flex items-center justify-center shadow-lg mb-4">
        <Image src={Logo} alt="Factory Agent App" width={44} height={44} className="object-contain" />
      </div>
      <h3 className="font-sans font-bold text-xl leading-none">Factory 23 Agent</h3>
      <p className="text-[10px] font-bold text-[#75ADAF] uppercase tracking-wider mt-1.5">{subtitle}</p>
      <p className="text-xs text-white/50 leading-relaxed mt-3 max-w-[260px]">
        Your offline-first field companion for tasks, tracking, CRM, and communication all in one app.
      </p>
    </div>
  );
}

function CloseFooterButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="w-full max-w-xs h-11 border border-white/10 hover:border-white/20 rounded-full text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 active:scale-95 transition-all"
    >
      Close
    </button>
  );
}

export function DownloadAgentAppModal({ isOpen, onClose }: DownloadAgentAppModalProps) {
  const [isDesktop] = useState(() =>
    typeof window !== 'undefined' ? isDesktopDevice() : true
  );
  const [isIos] = useState(() => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua);
  });
  const [isAndroid] = useState(() =>
    typeof window !== 'undefined' ? isAndroidDevice() : false
  );
  const [tab, setTab] = useState<InstallTab>('pwa');

  const agentUrl = getAgentPwaUrl();
  const installUrl = getAgentInstallUrl();
  const apkUrl = getAgentApkUrl();

  const handleMobileInstall = () => {
    window.location.href = installUrl;
    onClose();
  };

  const handleOpenAgentApp = () => {
    window.location.href = agentUrl;
    onClose();
  };

  const handleDownloadApk = () => {
    window.location.href = apkUrl;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-md cursor-pointer"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`relative w-full bg-[#0A1D25] border border-white/10 rounded-[32px] shadow-2xl z-10 font-sans text-white ${isDesktop
              ? 'max-w-4xl p-8 overflow-hidden'
              : 'max-w-sm p-6 max-h-[90vh] overflow-y-auto flex flex-col'
              }`}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-colors z-10"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            {isDesktop ? (
              <div className="flex flex-col">
                <div className="flex items-center gap-4 mb-4 pr-10">
                  <div className="w-14 h-14 rounded-[20px] bg-gradient-to-tr from-[#113948] to-[#0A1D25] p-2 border border-white/10 flex items-center justify-center shadow-lg flex-shrink-0">
                    <Image src={Logo} alt="Factory Agent App" width={40} height={40} className="object-contain" />
                  </div>
                  <div className="text-left min-w-0">
                    <h3 className="font-sans font-bold text-xl leading-tight">Factory 23 Agent</h3>
                    <p className="text-[10px] font-bold text-[#75ADAF] uppercase tracking-wider mt-1">
                      {tab === 'pwa' ? 'Progressive Web App' : 'Android APK'}
                    </p>
                  </div>
                </div>

                <div className="mb-5 max-w-sm">
                  <TabSwitcher tab={tab} onChange={setTab} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div className="flex flex-col items-center justify-center py-2 gap-3">
                    {tab === 'pwa' ? <AgentInstallQrCode size={240} /> : <AgentApkQrCode size={240} />}
                    {tab === 'apk' && (
                      <a
                        href={apkUrl}
                        className="text-[11px] font-semibold text-[#75ADAF] hover:underline"
                      >
                        Or open download link
                      </a>
                    )}
                  </div>

                  <div className="flex flex-col gap-4 min-w-0">
                    <p className="text-xs text-white/50 leading-relaxed">
                      {tab === 'pwa'
                        ? 'Install the PWA for quick access from your home screen.'
                        : 'Download the Android APK for continuous live tracking while minimized or with the screen locked.'}
                    </p>
                    <FeatureHighlights compact />
                    <InstallSteps tab={tab} compact />
                  </div>
                </div>

                <div className="mt-8 flex justify-center">
                  <CloseFooterButton onClose={onClose} />
                </div>
              </div>
            ) : (
              <>
                <div className="mt-3">
                  <ModalHeader subtitle={tab === 'pwa' ? 'Progressive Web App' : 'Android APK'} />
                </div>

                <div className="my-4">
                  <TabSwitcher tab={tab} onChange={setTab} />
                </div>

                <div className="mb-5">
                  <FeatureHighlights />
                </div>

                <div className="flex flex-col gap-2.5">
                  {tab === 'pwa' ? (
                    isIos ? (
                      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex flex-col gap-2.5 text-xs text-white/70 select-none">
                        <div className="flex items-center gap-2 font-bold text-white">
                          <Share size={14} className="text-[#75ADAF]" />
                          <span>How to Install on iOS:</span>
                        </div>
                        <ol className="list-decimal pl-4 space-y-1.5 text-[11px] leading-relaxed">
                          <li>
                            Open Safari and visit{' '}
                            <span className="text-white font-semibold">
                              {agentUrl.replace(/^https?:\/\//, '')}
                            </span>
                            .
                          </li>
                          <li>
                            Tap the Share button{' '}
                            <span className="bg-white/10 px-1.5 py-0.5 rounded text-white font-bold">
                              Share
                            </span>{' '}
                            in browser navigation.
                          </li>
                          <li>
                            Select{' '}
                            <span className="bg-white/10 px-1.5 py-0.5 rounded text-white font-bold">
                              Add to Home Screen
                            </span>{' '}
                            from menu options.
                          </li>
                        </ol>
                        <button
                          type="button"
                          onClick={handleMobileInstall}
                          className="mt-2 w-full h-12 rounded-full bg-[#75ADAF] hover:bg-[#66989A] text-white font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md"
                        >
                          <Smartphone size={14} />
                          <span>Go to Install Page</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleMobileInstall}
                        className="w-full h-12 rounded-full bg-[#75ADAF] hover:bg-[#66989A] text-white font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <Smartphone size={14} />
                        <span>Install PWA</span>
                      </button>
                    )
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      <InstallSteps tab="apk" />
                      <button
                        type="button"
                        onClick={handleDownloadApk}
                        className="w-full h-12 rounded-full bg-[#75ADAF] hover:bg-[#66989A] text-white font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <Download size={14} />
                        <span>{isAndroid ? 'Download Android APK' : 'Download Android APK'}</span>
                      </button>
                      <p className="text-[10px] text-white/40 text-center leading-relaxed">
                        Android only for now. After download, allow install from this browser if
                        prompted.
                      </p>
                    </div>
                  )}

                  {isMobileDevice() && tab === 'pwa' ? (
                    <button
                      type="button"
                      onClick={handleOpenAgentApp}
                      className="w-full h-11 border border-white/10 hover:border-white/20 rounded-full text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 active:scale-95 transition-all"
                    >
                      Open Agent App in Browser
                    </button>
                  ) : null}

                  <CloseFooterButton onClose={onClose} />
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
