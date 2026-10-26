import React from 'react';
import { LayoutDashboard, Columns3, Compass, History } from 'lucide-react';
import { formatNumber } from '../utils/crmCalculations.ts';

export type NavTab = 'dashboard' | 'pipeline' | 'leads_finder' | 'activities' | 'android_code';

interface BottomNavBarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  followUpDueCount?: number;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  currentTab,
  onSelectTab,
  followUpDueCount = 0,
}) => {
  // 4 core CRM Sales tabs focused for mobile ergonomics
  const tabs = [
    {
      id: 'dashboard' as NavTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: followUpDueCount > 0 ? formatNumber(followUpDueCount) : null,
    },
    {
      id: 'pipeline' as NavTab,
      label: 'Pipeline',
      icon: Columns3,
      badge: null,
    },
    {
      id: 'leads_finder' as NavTab,
      label: 'Lead Finder',
      icon: Compass,
      badge: null,
    },
    {
      id: 'activities' as NavTab,
      label: 'Activities',
      icon: History,
      badge: null,
    },
  ];

  return (
    <nav className="sticky bottom-0 z-30 bg-[#fcfcfa] border-t border-[#1f1f1f] px-2 py-2">
      <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`relative flex flex-col items-center justify-center py-1.5 px-2 rounded-[8px] transition-all duration-150 ${
                isActive
                  ? 'text-[#1f1f1f] font-bold'
                  : 'text-[#6b665c] hover:text-[#1f1f1f]'
              }`}
            >
              {/* Active state: Sprout Orange accent indicator & warm parchment surface */}
              <div
                className={`relative px-3 py-1 rounded-[8px] flex items-center justify-center transition-colors ${
                  isActive ? 'bg-[#f8f5ee] border border-[#1f1f1f]' : 'bg-transparent border border-transparent'
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${
                    isActive ? 'text-[#ff4800] stroke-[2.4]' : 'text-[#6b665c] stroke-[1.8]'
                  }`}
                />
                {tab.badge && (
                  <span className="absolute -top-1 -right-1.5 px-1.5 py-0.2 min-w-[16px] text-[10px] font-bold bg-[#ff4800] text-white rounded-[4px] text-center border border-[#1f1f1f] shadow-none">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-1 tracking-tight font-medium truncate w-full text-center">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
