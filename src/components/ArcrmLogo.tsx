import React from 'react';

interface ArcrmLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const ArcrmLogo: React.FC<ArcrmLogoProps> = ({
  className = '',
  size = 'md',
  showText = true,
}) => {
  const sizeMap = {
    sm: { img: 'w-7 h-7', text: 'text-sm', sub: 'text-[10px]' },
    md: { img: 'w-9 h-9', text: 'text-base', sub: 'text-[11px]' },
    lg: { img: 'w-12 h-12', text: 'text-lg', sub: 'text-xs' },
    xl: { img: 'w-16 h-16', text: 'text-2xl', sub: 'text-sm' },
  };

  const selectedSize = sizeMap[size];

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Official AR CRM Brandmark with Sprout/Hub Orange Network Node and Navy Letters */}
      <div className="relative shrink-0 flex items-center justify-center">
        <img
          src="/assets/aistudio/Logo_AR_CRM_dengan_Hub_Oranye_ce6dcc6a.png"
          alt="AR CRM"
          className={`${selectedSize.img} object-contain rounded-[8px] bg-white border border-[#1f1f1f] shadow-none`}
        />
      </div>

      {showText && (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 leading-none">
            <span className={`font-black font-sans tracking-tight text-[#1A2E40] ${selectedSize.text}`}>
              AR
            </span>
            <span className={`font-bold font-sans tracking-wide text-[#1A2E40] ${selectedSize.text}`}>
              CRM
            </span>
          </div>
          <span className={`block font-medium text-[#6b665c] tracking-normal leading-tight mt-0.5 ${selectedSize.sub}`}>
            Enterprise System
          </span>
        </div>
      )}
    </div>
  );
};
