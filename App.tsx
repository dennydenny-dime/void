import React, { useState, useCallback, useEffect } from 'react';
import { Persona } from './types';
import { PERSONAS } from './constants';
import PersonaSelector from './components/PersonaSelector';
import LiveChat from './components/LiveChat';
import Header from './components/Header';
import CharacterCreator from './components/CharacterCreator';

const App: React.FC = () => {
  const [customPersonas, setCustomPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Load custom personas from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('custom_personas_memory');
    if (saved) {
      try {
        setCustomPersonas(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load custom personas", e);
      }
    }
  }, []);

  // Save custom personas to local storage
  const saveCustomPersonas = (updated: Persona[]) => {
    setCustomPersonas(updated);
    localStorage.setItem('custom_personas_memory', JSON.stringify(updated));
  };

  const handleStartSession = useCallback((persona: Persona) => {
    setSelectedPersona(persona);
    setIsSessionActive(true);
    setIsCreating(false);
  }, []);

  const handleEndSession = useCallback(() => {
    setIsSessionActive(false);
    setSelectedPersona(null);
  }, []);

  const handleUpdateMemory = useCallback((personaId: string, newMemory: string) => {
    const updated = customPersonas.map(p => 
      p.id === personaId ? { ...p, memory: newMemory } : p
    );
    saveCustomPersonas(updated);
    
    // Also update selected persona if it's the one active
    if (selectedPersona?.id === personaId) {
      setSelectedPersona(prev => prev ? { ...prev, memory: newMemory } : null);
    }
  }, [customPersonas, selectedPersona]);

  const handleCreatePersona = useCallback((persona: Persona) => {
    const updated = [...customPersonas, persona];
    saveCustomPersonas(updated);
    handleStartSession(persona);
  }, [customPersonas, handleStartSession]);

  const handleBack = useCallback(() => {
    if (isSessionActive) {
      handleEndSession();
    } else if (isCreating) {
      setIsCreating(false);
    }
  }, [isSessionActive, isCreating, handleEndSession]);

  const allPersonas = [...PERSONAS, ...customPersonas];

  return (
    <div className="flex flex-col min-h-screen font-sans text-zinc-100">
      <Header onBack={(isSessionActive || isCreating) ? handleBack : undefined} />
      
      <main className="flex-1 container mx-auto px-4 py-6 md:py-12 max-w-5xl flex flex-col">
        {!isSessionActive && !isCreating && (
          <div className="animate-fade-in flex-1 flex flex-col justify-center">
            <div className="mb-12 md:mb-16 text-center">
              <h2 className="text-4xl md:text-6xl font-bold mb-6 italic tracking-tight text-white drop-shadow-xl">
                Vocal Intensity <span className="text-white/40 font-light not-italic">Sandbox</span>
              </h2>
              <p className="text-zinc-300 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-10 drop-shadow-md font-light">
                Connect one-to-one with advanced vocal personas. Now with evolved cognitive memory.
              </p>
              
              <button 
                onClick={() => setIsCreating(true)}
                className="group relative inline-flex items-center gap-4 px-8 py-4 md:px-10 md:py-5 glass-button rounded-full transition-all active:scale-95 hover:bg-white/10"
              >
                <span className="text-xs uppercase tracking-[0.2em] font-bold text-white">Generate Custom Entity</span>
                <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                </div>
              </button>
            </div>
            <PersonaSelector personas={allPersonas} onSelect={handleStartSession} />
          </div>
        )}

        {isCreating && !isSessionActive && (
          <CharacterCreator 
            onCreated={handleCreatePersona} 
            onCancel={() => setIsCreating(false)} 
          />
        )}

        {isSessionActive && selectedPersona && (
          <LiveChat 
            persona={selectedPersona} 
            onEnd={handleEndSession}
            onUpdateMemory={handleUpdateMemory}
          />
        )}
      </main>

      <footer className="py-8 text-center flex flex-col items-center gap-4">
        <div className="text-white/30 text-[10px] md:text-xs tracking-[0.2em] uppercase mix-blend-overlay">
          Vocal Synthesis &bull; Cognitive Memory &bull; Live API
        </div>
        
        <div className="flex flex-col items-center gap-2 mt-4">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Follwh meh Ohn</span>
          <a 
            href="https://www.instagram.com/swear2godyousuck/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="p-4 glass-button rounded-full text-zinc-400 hover:text-pink-500 hover:border-pink-500/30 transition-all duration-300 group"
            aria-label="Instagram"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-110 transition-transform">
              <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
              <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
            </svg>
          </a>
        </div>
      </footer>
    </div>
  );
};

export default App;