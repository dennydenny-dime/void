import React from 'react';

interface HeaderProps {
  onBack?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onBack }) => {
  return (
    <header className="sticky top-0 z-50 glass-panel border-x-0 border-t-0 border-b border-white/5 backdrop-blur-xl">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button 
              onClick={onBack}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
              aria-label="Back"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
          )}
          <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-md flex items-center gap-2">
            PersonaVoice <span className="text-indigo-400 font-light">AI</span>
          </h1>
        </div>
        
        <div className="hidden md:block text-white/50 text-sm font-light tracking-wide uppercase">
          Real-time Audio Sandbox
        </div>
      </div>
    </header>
  );
};

export default Header;