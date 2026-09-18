import React, { useState } from 'react';
import { Download, Share2, X, Smartphone, Sparkles, CheckCircle } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallPrompt: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install, isDismissed, dismiss } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  // If already installed or explicitly dismissed, don't show the bottom banner
  if (isInstalled || isDismissed) {
    return null;
  }

  // Only show banner if installable via prompt or on iOS
  if (!isInstallable && !isIOS) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else if (isIOS) {
      setShowIOSModal(true);
    }
  };

  return (
    <>
      {/* Mobile-friendly Bottom Install Notification */}
      <div 
        id="pwa-install-banner"
        className="fixed bottom-20 left-3 right-3 sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-md z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-blue-200 dark:border-blue-900/50 shadow-2xl p-3.5 sm:p-4 text-slate-800 dark:text-slate-100 animate-slideUp transition-all"
      >
        <div className="flex items-start gap-3">
          {/* App Icon */}
          <div className="w-11 h-11 rounded-xl bg-[#0B2046] flex items-center justify-center p-1.5 shadow-md shrink-0 ring-2 ring-blue-500/20">
            <img 
              src="/logo-icon.svg" 
              alt="Banking Tayari App" 
              className="w-full h-full object-contain"
            />
          </div>

          <div className="flex-1 min-w-0 pr-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-tight">
                Banking Tayari App Install
              </h4>
              <span className="px-1.5 py-0.2 text-[9px] font-extrabold bg-blue-600 text-white rounded-full">
                Full Screen
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug line-clamp-2">
              छिटो लोडिङ, अफलाइन नोटहरू र विना ब्राउजर बार फुल-स्क्रिन अनुभव लिनुहोस्।
            </p>

            {/* Action Buttons */}
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                id="pwa-install-banner-confirm-btn"
                onClick={handleInstallClick}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs shadow-sm transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                {isIOS ? 'iPhone मा राख्नुहोस्' : 'Install गर्नुहोस्'}
              </button>

              <button
                type="button"
                id="pwa-install-banner-dismiss-btn"
                onClick={dismiss}
                className="px-2.5 py-1.5 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition cursor-pointer"
              >
                पछि गरौँला
              </button>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={dismiss}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="बन्द गर्नुहोस्"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* iOS Safari Guided Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 sm:p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  iPhone / iPad मा Install
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  १
                </span>
                <p>
                  Safari ब्राउजरको तल वा माथि रहेको <strong>Share</strong> (
                  <Share2 className="inline w-3.5 h-3.5 mx-0.5 text-blue-600" />) आइकन थिच्नुहोस्।
                </p>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  २
                </span>
                <p>
                  तल स्क्रोल गरी <strong>'Add to Home Screen'</strong> (होम स्क्रिनमा थप्नुहोस्) रोज्नुहोस्।
                </p>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  ३
                </span>
                <p>
                  माथि दायाँपट्टि रहेको <strong>'Add'</strong> बटन थिचेर सिधै Full Screen App खोल्नुहोस्।
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowIOSModal(false);
                dismiss();
              }}
              className="mt-5 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition"
            >
              बुझें (Done)
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const PWAHeaderInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  if (isInstalled) return null;
  if (!isInstallable && !isIOS) return null;

  return (
    <>
      <button
        type="button"
        id="header-pwa-install-btn"
        onClick={() => {
          if (isInstallable) {
            install();
          } else if (isIOS) {
            setShowIOSModal(true);
          }
        }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/80 text-xs font-bold transition shadow-2xs active:scale-95 cursor-pointer shrink-0"
        title="Banking Tayari App Install गर्नुहोस्"
      >
        <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        <span className="hidden sm:inline">Install App</span>
      </button>

      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 sm:p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                iPhone / iPad मा Install
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="mt-4 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              Safari मेनुबाट <strong>Share</strong> थिचेर <strong>'Add to Home Screen'</strong> मा ट्याप गर्नुहोस्।
            </p>
            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="mt-5 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition"
            >
              बन्द गर्नुहोस्
            </button>
          </div>
        </div>
      )}
    </>
  );
};
