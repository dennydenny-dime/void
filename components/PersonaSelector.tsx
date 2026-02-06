import React from 'react';
import { Persona } from '../types';

interface PersonaSelectorProps {
  personas: Persona[];
  onSelect: (persona: Persona) => void;
}

const PersonaSelector: React.FC<PersonaSelectorProps> = ({ personas, onSelect }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 pb-10">
      {personas.map((persona) => (
        <button
          key={persona.id}
          onClick={() => onSelect(persona)}
          className={`text-left p-8 md:p-10 rounded-[40px] glass-panel transition-all duration-500 hover:bg-white/5 group relative overflow-hidden active:scale-[0.98] border border-white/5 hover:border-white/10`}
        >
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl md:text-3xl font-bold italic text-white group-hover:text-indigo-200 transition-colors">{persona.name}</h3>
                <div className="flex flex-col gap-1 mt-2">
                    {persona.memory && (
                    <span className="text-[9px] uppercase tracking-widest text-blue-300 font-bold flex items-center gap-1">
                        <span className="w-1 h-1 bg-blue-400 rounded-full shadow-[0_0_5px_#60a5fa]"></span> Memory Evolved
                    </span>
                    )}
                    {persona.isCloned && (
                    <span className="text-[9px] uppercase tracking-widest text-green-400 font-bold flex items-center gap-1">
                        <span className="w-1 h-1 bg-green-500 rounded-full shadow-[0_0_5px_#4ade80]"></span> Voice Cloned
                    </span>
                    )}
                </div>
              </div>
              <span className="px-4 py-1.5 bg-white/5 text-zinc-400 text-[10px] tracking-widest uppercase border border-white/5 rounded-full backdrop-blur-md">
                {persona.archetype}
              </span>
            </div>
            <p className="text-zinc-400 text-base md:text-lg mb-10 leading-relaxed font-light group-hover:text-zinc-200 transition-colors">
              {persona.description}
            </p>
            <div className="flex items-center text-xs tracking-widest uppercase text-white font-semibold opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
              Initiate Voice Link
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </div>
          </div>
          
          {/* Ambient Glow */}
          <div className={`absolute -bottom-10 -right-10 w-48 h-48 opacity-20 blur-[80px] rounded-full transition-all group-hover:opacity-30 duration-700 ${
            persona.id === 'domineering' ? 'bg-red-500' : 
            (persona.id === 'vulnerable' || persona.id === 'submissive') ? 'bg-indigo-500' : 
            persona.id === 'devoted' ? 'bg-pink-500' : 
            persona.isCloned ? 'bg-green-500' :
            'bg-blue-500'
          }`}></div>
        </button>
      ))}
    </div>
  );
};

export default PersonaSelector;