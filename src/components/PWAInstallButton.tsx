import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, platform, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // Hide once already running inside an installed standalone PWA
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const outcome = await install();
      if (outcome !== 'unavailable') return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        aria-label="Install NexaSua App"
        title="Install NexaSua App on your phone or device"
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#148D82]/35 bg-[#148D82]/10 text-[#102846] hover:bg-[#148D82] hover:text-white transition-colors font-semibold whitespace-nowrap shrink-0 min-h-[38px] sm:min-h-[36px] ${
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-1.5 text-xs'
        }`}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>
          Install<span className="hidden sm:inline"> App</span>
        </span>
      </button>

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Install NexaSua on your device"
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white border border-slate-200 p-6 shadow-xl space-y-4">
            <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto sm:hidden" />

            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#102846] text-white flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#102846]">Install NexaSua App</h3>
                  <p className="text-xs text-[#64748B]">
                    Launch straight from your phone home screen.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install instructions"
                className="min-w-[40px] min-h-[40px] rounded-lg border border-slate-200 flex items-center justify-center text-[#64748B] hover:text-[#102846]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {platform === 'ios' ? (
              <ol className="space-y-2.5 text-sm text-[#102846] bg-[#FBF8F1] border border-slate-200 rounded-xl p-4">
                <li className="flex items-start gap-2">
                  <span className="font-mono font-bold text-[#148D82]">1.</span>
                  <span>
                    Tap the <strong className="inline-flex items-center gap-1">Share <Share className="w-3.5 h-3.5 inline" /></strong> button in your Safari toolbar.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono font-bold text-[#148D82]">2.</span>
                  <span>
                    Scroll down and tap <strong>Add to Home Screen</strong>, then tap{' '}
                    <strong>Add</strong>.
                  </span>
                </li>
              </ol>
            ) : platform === 'android' ? (
              <ol className="space-y-2.5 text-sm text-[#102846] bg-[#FBF8F1] border border-slate-200 rounded-xl p-4">
                <li className="flex items-start gap-2">
                  <span className="font-mono font-bold text-[#148D82]">1.</span>
                  <span>
                    Open the browser menu (<strong>⋮</strong> at the top-right corner of Chrome or
                    Edge).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono font-bold text-[#148D82]">2.</span>
                  <span>
                    Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                  </span>
                </li>
              </ol>
            ) : (
              <ol className="space-y-2.5 text-sm text-[#102846] bg-[#FBF8F1] border border-slate-200 rounded-xl p-4">
                <li className="flex items-start gap-2">
                  <span className="font-mono font-bold text-[#148D82]">1.</span>
                  <span>
                    Click the <strong>Install</strong> icon in your browser&apos;s address bar (or
                    browser menu → <strong>Save and share → Install NexaSua</strong>).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono font-bold text-[#148D82]">2.</span>
                  <span>
                    On your phone, open this link in Chrome (Android) or Safari (iPhone) and tap{' '}
                    <strong>Install App</strong> at the top.
                  </span>
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-[#102846] hover:bg-[#193a63] text-white text-sm font-semibold transition-colors"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-16 lg:bottom-4 left-4 right-4 sm:right-auto z-50 flex items-center justify-center sm:justify-start gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg"
    >
      <span>Offline Mode — Viewing cached screens until your connection returns.</span>
    </div>
  );
}
