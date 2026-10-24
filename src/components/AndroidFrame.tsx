import React, { useState, useEffect } from 'react';
import { Wifi, Battery, Signal, WifiOff } from 'lucide-react';

interface AndroidFrameProps {
  children: React.ReactNode;
  isPhoneFrame: boolean;
  isOnline: boolean;
}

export const AndroidFrame: React.FC<AndroidFrameProps> = ({
  children,
  isPhoneFrame,
  isOnline,
}) => {
  const [timeStr, setTimeStr] = useState('09:41');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!isPhoneFrame) {
    return <div className="min-h-screen bg-[#fcfcfa] text-[#1f1f1f]">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-[#f8f5ee] flex items-center justify-center p-0 sm:p-6 lg:p-8">
      {/* Android Device Mockup Frame: 1px hairline border in #1f1f1f, zero heavy drop shadows */}
      <div className="relative w-full max-w-[420px] h-[100dvh] sm:h-[880px] bg-[#fcfcfa] sm:rounded-[24px] sm:border sm:border-[#1f1f1f] flex flex-col overflow-hidden">
        {/* Android Punch Hole Camera */}
        <div className="hidden sm:block absolute top-3 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-[#1f1f1f] rounded-full z-40 border border-[#1f1f1f]"></div>

        {/* Android Top Status Bar */}
        <div className="bg-[#fcfcfa] px-5 pt-2 pb-1.5 flex items-center justify-between text-[11px] font-semibold text-[#1f1f1f] z-30 select-none border-b border-[#1f1f1f]/10">
          <span className="font-mono tracking-tight font-bold">{timeStr}</span>
          <div className="flex items-center gap-2 text-[#1f1f1f]">
            {isOnline ? (
              <Wifi className="w-3.5 h-3.5 text-[#1f1f1f]" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-[#ff4800]" />
            )}
            <Signal className="w-3.5 h-3.5 text-[#1f1f1f]" />
            <Battery className="w-4 h-4 text-[#1f1f1f]" />
          </div>
        </div>

        {/* Device Content Viewport */}
        <div className="flex-1 overflow-y-auto flex flex-col relative bg-[#fcfcfa]">
          {children}
        </div>

        {/* Android Navigation Gesture Bar */}
        <div className="hidden sm:flex bg-[#fcfcfa] py-1.5 items-center justify-center z-30 border-t border-[#1f1f1f]">
          <div className="w-28 h-1 bg-[#1f1f1f] rounded-full"></div>
        </div>
      </div>
    </div>
  );
};
