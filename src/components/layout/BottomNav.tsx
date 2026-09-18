import React from 'react';
import { 
  Home, 
  BookOpen, 
  Award, 
  User as UserIcon,
  Bot,
  Sparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { NavigationTab } from '../../types';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab, user, isAiModalOpen, setIsAiModalOpen } = useApp();

  const emailPrefix = user?.email ? user.email.split('@')[0] : '';
  const displayName = user?.displayName || (user?.name && user.name !== 'विद्यार्थी' ? user.name : (emailPrefix || 'परीक्षार्थी'));
  const photoURL = user?.photoURL || user?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0B2046&color=fff&size=128`;

  type NavItem = 
    | { type: 'tab'; tab: NavigationTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string }
    | { type: 'action'; id: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string; onClick: () => void };

  const navItems: NavItem[] = [
    { type: 'tab', tab: 'home', label: 'Home', icon: Home },
    { type: 'tab', tab: 'courses', label: 'Courses', icon: BookOpen },
    { 
      type: 'action', 
      id: 'ai-tutor', 
      label: 'AI Tutor', 
      icon: Bot, 
      badge: 'AI',
      onClick: () => setIsAiModalOpen(true) 
    },
    { type: 'tab', tab: 'quiz', label: 'Quiz', icon: Award, badge: '५०' },
    { type: 'tab', tab: 'profile', label: 'Profile', icon: UserIcon }
  ];

  return (
    <div 
      id="mobile-bottom-navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800/80 shadow-2xl safe-bottom transition-colors"
    >
      <nav className="flex items-center justify-around h-16 max-w-lg mx-auto px-1">
        {navItems.map(item => {
          const Icon = item.icon;

          if (item.type === 'action') {
            return (
              <button
                key={item.id}
                type="button"
                id={`bottom-nav-${item.id}`}
                onClick={item.onClick}
                aria-label="AI Tutor Chat & Voice Assistant"
                className="flex-1 min-h-[48px] flex flex-col items-center justify-center py-0.5 relative cursor-pointer group active:scale-90 transition-transform"
              >
                <div className="relative -mt-2.5 px-3 py-2 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-emerald-600 text-white shadow-lg shadow-orange-500/20 ring-2 ring-white dark:ring-slate-900 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                  <span className="absolute -top-1 -right-1 px-1 py-0.2 text-[8px] font-black bg-emerald-500 text-slate-950 rounded-full">
                    AI
                  </span>
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight font-black text-amber-600 dark:text-amber-400 truncate">
                  AI Tutor
                </span>
              </button>
            );
          }

          const isActive = activeTab === item.tab;

          return (
            <button
              key={item.tab}
              type="button"
              id={`bottom-nav-${item.tab}`}
              onClick={() => setActiveTab(item.tab)}
              className={`flex-1 min-h-[48px] flex flex-col items-center justify-center py-1 transition-all relative cursor-pointer group active:scale-95 ${
                isActive 
                  ? 'text-[#DC2626] font-bold' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
              }`}
            >
              {/* Active Pill Accent Background */}
              <div className={`relative px-3 py-1 rounded-2xl transition-all duration-200 flex items-center justify-center ${
                isActive 
                  ? 'bg-red-50 dark:bg-red-950/40 scale-105 shadow-2xs' 
                  : 'group-hover:bg-slate-100 dark:group-hover:bg-slate-800/50'
              }`}>
                {item.tab === 'profile' && user ? (
                  <div className="relative">
                    <img 
                      src={photoURL} 
                      alt={displayName} 
                      referrerPolicy="no-referrer"
                      className={`w-5 h-5 rounded-full object-cover transition-all ${
                        isActive 
                          ? 'ring-2 ring-red-600 dark:ring-red-500' 
                          : 'ring-1 ring-slate-300 dark:ring-slate-700'
                      }`}
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full ring-1 ring-white dark:ring-slate-900" />
                  </div>
                ) : (
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5] text-[#DC2626]' : 'stroke-2'}`} />
                )}

                {/* Optional Badge */}
                {item.badge && !isActive && (
                  <span className="absolute -top-1 -right-1 px-1 py-0.2 text-[8px] font-black bg-red-600 text-white rounded-full">
                    {item.badge}
                  </span>
                )}
              </div>

              {/* Label */}
              <span className={`text-[10px] mt-0.5 tracking-tight font-semibold truncate ${
                isActive ? 'text-[#DC2626] font-extrabold' : ''
              }`}>
                {item.label}
              </span>

              {/* Bottom Dot Indicator */}
              {isActive && (
                <span className="absolute bottom-1 w-1 h-1 bg-[#DC2626] rounded-full" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
