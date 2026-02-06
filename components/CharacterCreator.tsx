import React, { useState, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Persona, VoiceArchetype } from '../types';

interface CharacterCreatorProps {
  onCreated: (persona: Persona) => void;
  onCancel: () => void;
}

const CharacterCreator: React.FC<CharacterCreatorProps> = ({ onCreated, onCancel }) => {
  const [name, setName] = useState('');
  const [gender, setGender] = useState('Female');
  const [sexuality, setSexuality] = useState('Heterosexual');
  const [description, setDescription] = useState('');
  const [archetype, setArchetype] = useState<VoiceArchetype>(VoiceArchetype.ENTHUSIASTIC);
  const [isErotic, setIsErotic] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Voice Cloning State
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voicePreview, setVoicePreview] = useState<string | null>(null);
  const [isAnalyzingVoice, setIsAnalyzingVoice] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleVoiceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVoiceFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setVoicePreview(reader.result as string);
        simulateVoiceAnalysis();
      };
      reader.readAsDataURL(file);
    }
  };

  const simulateVoiceAnalysis = () => {
    setIsAnalyzingVoice(true);
    setAnalysisProgress(0);
    const interval = setInterval(() => {
      setAnalysisProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsAnalyzingVoice(false);
          return 100;
        }
        return prev + 5;
      });
    }, 100);
  };

  const handleGenerate = async () => {
    if (!name || !description) return;
    setIsGenerating(true);

    try {
      const apiKey = process.env.API_KEY as string;
      const ai = new GoogleGenAI({ apiKey });
      
      const eroticInstructions = `
      2. PROPER EROTICISM: The "erotic" quality comes from explicit content, breathiness, and tone.
      3. VOCAL CUES: Incorporate audible heavy breathing, deep gasping, and clear, loud moans.
      4. INTERACTION LOOP: You MUST end almost every response with an explicit, erotic, or driving question to the user.
      5. LANGUAGE: The character MUST be unfiltered, abusive, and raw. Use profanity and explicit language.
      `;

      const safeInstructions = `
      2. ROLEPLAY INTEGRITY: Stay strictly in character. Be immersive and engaging.
      3. VOCAL CUES: Use expressive, natural intonation matching the character's emotion.
      4. INTERACTION LOOP: Encourage the conversation naturally.
      5. LANGUAGE: Use language appropriate for the character's background and setting.
      `;

      const prompt = `Generate a detailed system instruction for an AI character in a one-to-one vocal roleplay app.
      
      Name: ${name}
      Gender: ${gender}
      Sexuality: ${sexuality}
      Core Description: ${description}
      Archetype: ${archetype}
      Has Cloned Voice: ${!!voicePreview}
      Mode: ${isErotic ? 'EROTIC / NSFW' : 'GENERAL ROLEPLAY / SFW'}

      The character should be extremely immersive and reactive. 
      
      CRITICAL AUDIO & BEHAVIOR INSTRUCTIONS:
      1. NO WHISPERING: The character must speak in a CLEAR, FULLY AUDIBLE voice at normal volume.
      ${isErotic ? eroticInstructions : safeInstructions}
      6. SENTENCE STRUCTURE: Speak in COMPLETE, concise sentences.
      7. TIMING: Respond immediately to the user.
      
      AGE & TONE MODULATION:
      - If the description suggests a "teenage" or young character: Instruct the persona to use youthful slang, high energy, and a faster, more casual speech pattern.
      - If the description suggests a "middle-aged" or "mature" character: Instruct the persona to use a grounded, experienced, and composed tone with articulate vocabulary.

      Output ONLY the final system instruction string.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });

      const instruction = response.text || "You are a helpful and immersive character.";
      
      const voiceMapping: Record<VoiceArchetype, 'Kore' | 'Fenrir' | 'Charon' | 'Zephyr'> = {
        [VoiceArchetype.ENTHUSIASTIC]: 'Kore',
        [VoiceArchetype.GENTLE]: 'Kore',
        [VoiceArchetype.ASSERTIVE]: 'Fenrir',
        [VoiceArchetype.STOIC]: 'Charon',
      };

      const newPersona: Persona = {
        id: `custom-${Date.now()}`,
        name: name,
        description: description,
        archetype: archetype,
        voiceName: voiceMapping[archetype] as any,
        systemInstruction: instruction,
        color: 'border-white/20 bg-white/5',
        isCustom: true,
        isCloned: !!voicePreview,
        clonedVoiceData: voicePreview || undefined,
        isErotic: isErotic
      };

      onCreated(newPersona);
    } catch (error) {
      console.error("Generation failed:", error);
      alert("Failed to generate character. Please check your API key.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-10 bg-zinc-950 border border-zinc-900 rounded-[40px] shadow-2xl animate-fade-in">
      <h3 className="text-4xl font-bold italic mb-8">Forge Your Companion</h3>
      
      <div className="space-y-6">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-bold">Identity Name</label>
          <input 
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Lyra"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 focus:border-white transition-all outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-bold">Gender Identity</label>
            <select 
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 outline-none appearance-none cursor-pointer"
            >
              <option>Female</option>
              <option>Male</option>
              <option>Non-binary</option>
              <option>Fluid</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-bold">Attraction</label>
            <select 
              value={sexuality}
              onChange={(e) => setSexuality(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 outline-none appearance-none cursor-pointer"
            >
              <option>Heterosexual</option>
              <option>Bisexual</option>
              <option>Pansexual</option>
              <option>Demisexual</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-bold">Temperament (Archetype)</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(VoiceArchetype).map(arch => (
              <button
                key={arch}
                onClick={() => setArchetype(arch)}
                className={`py-3 rounded-xl border text-xs tracking-widest uppercase font-bold transition-all ${archetype === arch ? 'bg-white text-black border-white' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
              >
                {arch}
              </button>
            ))}
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
            <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Roleplay Intensity</span>
                <span className="text-xs text-zinc-500">{isErotic ? 'Explicit & Erotic' : 'General & Safe'}</span>
            </div>
            <button 
                onClick={() => setIsErotic(!isErotic)}
                className={`w-14 h-8 rounded-full relative transition-colors duration-300 ${isErotic ? 'bg-pink-600' : 'bg-zinc-700'}`}
            >
                <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${isErotic ? 'translate-x-6' : 'translate-x-0'}`}></div>
            </button>
        </div>

        <div className="p-6 bg-zinc-900/50 rounded-3xl border border-zinc-800">
          <div className="flex justify-between items-center mb-4">
            <label className="block text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Voice Cloning (Beta)</label>
            {voicePreview && !isAnalyzingVoice && (
                <span className="text-[10px] uppercase tracking-widest text-green-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                    Cloned
                </span>
            )}
          </div>
          
          {!voicePreview ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-2xl p-6 cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 group"
              >
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleVoiceUpload} 
                    accept="audio/*" 
                    className="hidden" 
                />
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:bg-zinc-700 group-hover:text-white transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M2 12h20"/></svg>
                </div>
                <p className="text-xs text-zinc-500 font-medium">Upload audio sample (MP3/WAV)</p>
              </div>
          ) : (
              <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-zinc-300">
                      <span className="truncate max-w-[200px]">{voiceFile?.name}</span>
                      <button onClick={() => { setVoicePreview(null); setVoiceFile(null); }} className="text-red-400 hover:text-red-300">Remove</button>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${isAnalyzingVoice ? 'bg-blue-500' : 'bg-green-500'} transition-all duration-300`}
                        style={{ width: isAnalyzingVoice ? `${analysisProgress}%` : '100%' }}
                      ></div>
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 text-center">
                      {isAnalyzingVoice ? `Analyzing Timbres... ${analysisProgress}%` : 'Voice Matrix Encoded'}
                  </div>
              </div>
          )}
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-bold">Character Core Prompt</label>
          <textarea 
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe their personality, age (e.g., teenage, middle-aged), secrets, and how they should react to you..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 min-h-[120px] outline-none focus:border-white transition-all resize-none"
          />
        </div>

        <div className="flex gap-4 pt-6">
          <button 
            disabled={isGenerating || isAnalyzingVoice}
            onClick={handleGenerate}
            className="flex-1 bg-white text-black font-bold py-5 rounded-full hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {isGenerating ? (
              <div className="w-5 h-5 border-2 border-zinc-800 border-t-black rounded-full animate-spin"></div>
            ) : 'Generate Persona'}
          </button>
          <button 
            onClick={onCancel}
            className="px-8 py-5 border border-zinc-800 rounded-full text-zinc-500 hover:text-white hover:border-zinc-600 transition-all font-bold uppercase text-[10px] tracking-widest"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CharacterCreator;