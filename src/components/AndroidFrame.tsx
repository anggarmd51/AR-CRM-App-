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
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Asia/Jakarta',
        })
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
    <div className="h-[calc(100dvh-3.5rem)] min-h-0 bg-[#f8f5ee] flex items-center justify-center p-0 sm:p-3 lg:p-4">
      {/* Android Device Mockup Frame: 1px hairline border in #1f1f1f, zero heavy drop shadows */}
      <div className="relative w-full max-w-[420px] h-full max-h-[880px] bg-[#fcfcfa] sm:rounded-[24px] sm:border sm:border-[#1f1f1f] flex flex-col overflow-hidden">
        {/* Android Punch Hole Camera */}
        <div className="hidden sm:block absolute top-3 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-[#1f1f1f] rounded-full z-40 border border-[#1f1f1f]"></div>

        {/* Android Top Status Bar */}
        <div className="shrink-0 bg-[#fcfcfa] px-5 pt-2 pb-1.5 flex items-center justify-between text-[11px] font-semibold text-[#1f1f1f] z-30 select-none border-b border-[#1f1f1f]/10">
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
        <div className="crm-mobile-preview relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#fcfcfa]">
          {children}
        </div>

        {/* Android Navigation Gesture Bar */}
        <div className="hidden shrink-0 sm:flex bg-[#fcfcfa] py-1.5 items-center justify-center z-30 border-t border-[#1f1f1f]">
          <div className="w-28 h-1 bg-[#1f1f1f] rounded-full"></div>
        </div>
      </div>
    </div>
  );
};
