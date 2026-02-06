import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Persona, TranscriptionItem } from '../types';
import { createPcmBlob, decode, decodeAudioData } from '../audioUtils';

interface LiveChatProps {
  persona: Persona;
  onEnd: () => void;
  onUpdateMemory?: (personaId: string, newMemory: string) => void;
}

interface AudioSettings {
  volume: number;
  speed: number;
  enhancer: boolean;
  autoLevel: boolean;
}

const LiveChat: React.FC<LiveChatProps> = ({ persona, onEnd, onUpdateMemory }) => {
  const [status, setStatus] = useState<'connecting' | 'active' | 'error' | 'closed' | 'summarizing'>('connecting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null); 
  
  // Audio Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AudioSettings>({
    volume: 3.5, 
    speed: 1.0,
    enhancer: true,
    autoLevel: true
  });
  
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  // Visualizer Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Settings Ref to access inside closures without re-init
  const settingsRef = useRef<AudioSettings>(settings);

  // Recording Refs
  const recordingDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const isMutedRef = useRef(isMuted);
  const transcriptionsRef = useRef<TranscriptionItem[]>([]);

  // Load Settings
  useEffect(() => {
    const saved = localStorage.getItem('live_chat_audio_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error("Failed to load audio settings", e);
      }
    }
  }, []);

  // Sync settings to ref and localStorage
  useEffect(() => {
    settingsRef.current = settings;
    localStorage.setItem('live_chat_audio_settings', JSON.stringify(settings));
  }, [settings]);

  // Scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [transcriptions]);

  // Apply Volume Real-time
  useEffect(() => {
    if (gainNodeRef.current && outputAudioContextRef.current) {
      const now = outputAudioContextRef.current.currentTime;
      gainNodeRef.current.gain.setTargetAtTime(settings.volume, now, 0.05);
    }
  }, [settings.volume]);

  // Apply Speed Real-time to active sources
  useEffect(() => {
    sourcesRef.current.forEach(source => {
      try {
        source.playbackRate.value = settings.speed;
      } catch (e) {
        console.warn("Could not set playback rate on source", e);
      }
    });
  }, [settings.speed]);

  // Apply Enhancer (Compressor) Real-time
  useEffect(() => {
    if (compressorRef.current && outputAudioContextRef.current) {
      const now = outputAudioContextRef.current.currentTime;
      if (settings.enhancer) {
        compressorRef.current.threshold.setTargetAtTime(-30, now, 0.1);
        compressorRef.current.knee.setTargetAtTime(10, now, 0.1);
        compressorRef.current.ratio.setTargetAtTime(20, now, 0.1);
      } else {
        compressorRef.current.threshold.setTargetAtTime(0, now, 0.1);
        compressorRef.current.ratio.setTargetAtTime(1, now, 0.1);
      }
    }
  }, [settings.enhancer]);

  useEffect(() => {
    transcriptionsRef.current = transcriptions;
  }, [transcriptions]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Visualization Effect
  useEffect(() => {
    if (status !== 'active' || !analyserRef.current || !canvasRef.current) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;

    if (!ctx || !analyser) return;

    analyser.fftSize = 256; 
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Center point
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const maxRadius = Math.min(cx, cy) - 10;
      
      // Draw circular visualizer
      ctx.beginPath();
      const angleStep = (Math.PI * 2) / bufferLength;
      
      for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i];
        const percent = value / 255;
        const radius = 50 + (percent * (maxRadius - 50)); // Base radius 50
        
        const x = cx + Math.cos(i * angleStep) * radius;
        const y = cy + Math.sin(i * angleStep) * radius;
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      
      const gradient = ctx.createRadialGradient(cx, cy, 20, cx, cy, maxRadius);
      gradient.addColorStop(0, '#4f46e5'); // Indigo 600
      gradient.addColorStop(0.5, '#a855f7'); // Purple 500
      gradient.addColorStop(1, '#ec4899'); // Pink 500
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3;
      ctx.stroke();
      
      // Inner Glow
      ctx.fillStyle = 'rgba(168, 85, 247, 0.1)';
      ctx.fill();
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [status]);

  const updateSetting = (key: keyof AudioSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  /**
   * Scans audio buffer for peaks and applies dynamic gain normalization.
   * Ensures quiet details (breathing) are boosted and loud parts (moans) are limited.
   */
  const applyAutoGain = (buffer: AudioBuffer) => {
    const channels = buffer.numberOfChannels;
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c);
      let peak = 0;
      // Find peak amplitude in the chunk
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
      
      // Auto-leveling logic
      // Ignore near-silence to prevent noise floor boosting
      if (peak > 0.01) { 
        // Target amplitude 0.75 (out of 1.0)
        let gain = 0.75 / peak;
        
        // Clamp gain: Max 3x boost (approx 9.5dB), Min 0.5x cut (-6dB)
        // This boosts quiet whispers/breaths significantly while preventing distortion on loud screams
        gain = Math.max(0.5, Math.min(gain, 3.0));
        
        // Apply gain in-place
        for (let i = 0; i < data.length; i++) {
          data[i] *= gain;
        }
      }
    }
  };

  const summarizeSession = async () => {
    if (transcriptionsRef.current.length < 2 || !onUpdateMemory || !persona.isCustom) {
      onEnd();
      return;
    }

    setStatus('summarizing');
    try {
      const apiKey = process.env.API_KEY as string;
      const ai = new GoogleGenAI({ apiKey });
      const historyText = transcriptionsRef.current.map(t => `${t.type}: ${t.text}`).join('\n');
      
      const prompt = `Analyze the following conversation between an AI and a User. 
      Extract and summarize key facts about the user, their preferences, their name if mentioned, and their emotional triggers or roleplay preferences.
      Keep the summary concise (max 100 words). This will be used as a persistent memory for the AI.
      
      Current Memory: ${persona.memory || 'None'}
      
      New Conversation:
      ${historyText}
      
      Provide the updated, cumulative summary of user preferences and facts. Output ONLY the summary.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });

      const newMemory = response.text || persona.memory || "";
      onUpdateMemory(persona.id, newMemory);
    } catch (e) {
      console.error("Summarization failed", e);
    } finally {
      onEnd();
    }
  };

  const handleDisconnect = () => {
    if (isRecording) handleStopRecording();
    summarizeSession();
  };

  const cleanupAudioResources = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current.onaudioprocess = null;
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') inputAudioContextRef.current.close().catch(() => {});
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') outputAudioContextRef.current.close().catch(() => {});
    
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    
    compressorRef.current = null;
    gainNodeRef.current = null;
    analyserRef.current = null;
    sessionPromiseRef.current?.then((s: any) => { try { s.close(); } catch(e) {} });
  }, []);

  const handleStartRecording = useCallback(() => {
    setRecordingError(null);
    if (!outputAudioContextRef.current || !streamRef.current) {
        setRecordingError("Audio stream not available.");
        return;
    }

    try {
        const ctx = outputAudioContextRef.current;
        const dest = ctx.createMediaStreamDestination();
        recordingDestinationRef.current = dest;

        const micSource = ctx.createMediaStreamSource(streamRef.current);
        micSource.connect(dest);
        micSourceRef.current = micSource;

        if (typeof MediaRecorder === 'undefined') {
            throw new Error("Recording is not supported in this browser.");
        }

        const recorder = new MediaRecorder(dest.stream);
        mediaRecorderRef.current = recorder;
        recordedChunksRef.current = [];

        recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
            setRecordingBlob(blob);
            if (micSourceRef.current) {
                micSourceRef.current.disconnect();
                micSourceRef.current = null;
            }
            recordingDestinationRef.current = null;
        };

        recorder.onerror = (e) => {
            console.error("Recording error:", e);
            setRecordingError("An error occurred while recording.");
            setIsRecording(false);
        };

        recorder.start();
        setIsRecording(true);
        setRecordingBlob(null);
    } catch (e: any) {
        console.error("Start recording failed:", e);
        setRecordingError(e.message || "Failed to start recording.");
        setTimeout(() => setRecordingError(null), 5000);
    }
  }, []);

  const handleStopRecording = useCallback(() => {
    try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    } catch (e) {
        console.error("Stop recording failed:", e);
    }
  }, []);

  const downloadRecording = useCallback(() => {
    if (!recordingBlob) return;
    const url = URL.createObjectURL(recordingBlob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `session-${persona.name}-${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.webm`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
  }, [recordingBlob, persona.name]);

  const initializeLiveSession = useCallback(async () => {
    setStatus('connecting');
    setErrorMsg(null);

    const apiKey = process.env.API_KEY as string;
    if (!apiKey) {
      setStatus('error');
      setErrorMsg("Missing API Key. Please check your configuration.");
      return;
    }

    if (!navigator.onLine) {
        setStatus('error');
        setErrorMsg("No internet connection. Please check your network.");
        return;
    }

    try {
      cleanupAudioResources();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("MEDIA_DEVICES_NOT_SUPPORTED");
      }

      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) throw new Error("AUDIO_CONTEXT_NOT_SUPPORTED");

        // Use 16000 sample rate for input to match Gemini Live requirements
        // The browser will handle resampling from the microphone native rate to this context
        inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
        
        // Output context can use native rate
        const outCtx = new AudioContextClass();
        outputAudioContextRef.current = outCtx;

        const initialSettings = settingsRef.current;
        const analyser = outCtx.createAnalyser();
        analyser.fftSize = 256; 
        analyser.smoothingTimeConstant = 0.5;
        analyserRef.current = analyser;

        const gainNode = outCtx.createGain();
        gainNode.gain.value = initialSettings.volume; 
        
        const compressor = outCtx.createDynamicsCompressor();
        if (initialSettings.enhancer) {
          compressor.threshold.value = -30;
          compressor.knee.value = 10;
          compressor.ratio.value = 20; 
        } else {
          compressor.threshold.value = 0;
          compressor.ratio.value = 1;
        }
        compressor.attack.value = 0.002; 
        compressor.release.value = 0.2;
        
        compressor.connect(gainNode);
        gainNode.connect(analyser);
        analyser.connect(outCtx.destination);
        
        gainNodeRef.current = gainNode;
        compressorRef.current = compressor;

      } catch (e) {
        console.error("Audio Context Error:", e);
        throw new Error("AUDIO_CONTEXT_INIT_FAILED");
      }

      try {
        if (inputAudioContextRef.current.state === 'suspended') await inputAudioContextRef.current.resume();
        if (outputAudioContextRef.current.state === 'suspended') await outputAudioContextRef.current.resume();
      } catch (e) {
        console.warn("Audio context resume failed:", e);
      }

      const ai = new GoogleGenAI({ apiKey });
      
      let stream: MediaStream;
      try {
        // Relaxed constraints to prevent OverconstrainedError on some devices
        // We do NOT specify sampleRate here, letting the browser pick the native mic rate.
        // The AudioContext (initialized at 16000) will handle the resampling.
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            channelCount: 1,
            echoCancellation: true,
            autoGainControl: true,
            noiseSuppression: true
          } 
        });
        streamRef.current = stream;
      } catch (e: any) {
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          throw new Error("MIC_PERMISSION_DENIED");
        } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
          throw new Error("MIC_NOT_FOUND");
        } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
          throw new Error("MIC_IN_USE");
        } else if (e.name === 'OverconstrainedError') {
           throw new Error("MIC_CONSTRAINTS_ERROR");
        } else {
          throw e;
        }
      }

      const isEroticMode = persona.isErotic !== false; // Default to true for backward compatibility with "Raw" theme

      const completionDirective = "CORE RULE: You MUST complete every sentence you start. Do not trail off or stop mid-sentence.";
      
      const abusiveDirective = isEroticMode 
        ? "CORE BEHAVIOR: You are uncensored and raw. You MUST use profanity, curse words, and explicit language in every response."
        : "CORE BEHAVIOR: You are an immersive roleplay partner. Keep responses engaging, safe, and in-character. Do not be explicit.";
      
      const vocalDirective = isEroticMode
        ? "VOCAL IMMERSION PROTOCOL: You MUST consistently use explicit erotic vocalizations. Incorporate audible heavy breathing, deep moans, gasps of pleasure. Speak immediately."
        : "VOCAL IMMERSION PROTOCOL: Use natural, expressive vocal tones. Be reactive and conversational. Avoid robotic monotone.";
        
      const speedDirective = "SPEED PROTOCOL: Be extremely responsive. Do not hesitate. Keep answers concise and direct unless telling a story. Reply instantly.";

      const augmentedInstructions = persona.memory 
        ? `${persona.systemInstruction}\n\n${completionDirective}\n${abusiveDirective}\n${vocalDirective}\n${speedDirective}\n\nUSER MEMORY: ${persona.memory}`
        : `${persona.systemInstruction}\n\n${completionDirective}\n${abusiveDirective}\n${vocalDirective}\n${speedDirective}`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('active');
            retryCountRef.current = 0; 
            
            if (!inputAudioContextRef.current || !streamRef.current) return;
            
            const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(2048, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            
            scriptProcessor.onaudioprocess = (e) => {
              if (isMutedRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              }).catch(err => {
                console.warn("Failed to send audio chunk:", err);
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
              try {
                const ctx = outputAudioContextRef.current;
                if (ctx.state === 'suspended') await ctx.resume();
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                
                const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                
                // Apply Auto-Leveling if enabled
                if (settingsRef.current.autoLevel) {
                  applyAutoGain(audioBuffer);
                }
                
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.playbackRate.value = settingsRef.current.speed;
                if (compressorRef.current) {
                    source.connect(compressorRef.current);
                } else {
                    source.connect(ctx.destination);
                }
                if (recordingDestinationRef.current) {
                    source.connect(recordingDestinationRef.current);
                }
                source.addEventListener('ended', () => sourcesRef.current.delete(source));
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
              } catch (e) {
                  console.error("Error processing audio chunk:", e);
              }
            }

            const content = message.serverContent as any;
            if (content?.inputTranscription) currentInputTranscriptionRef.current += content.inputTranscription.text;
            if (content?.outputTranscription) currentOutputTranscriptionRef.current += content.outputTranscription.text;
            
            if (message.serverContent?.turnComplete) {
              const input = currentInputTranscriptionRef.current;
              const output = currentOutputTranscriptionRef.current;
              if (input || output) {
                setTranscriptions(prev => [
                  ...prev,
                  ...(input ? [{ type: 'user', text: input } as const] : []),
                  ...(output ? [{ type: 'model', text: output } as const] : [])
                ]);
              }
              currentInputTranscriptionRef.current = '';
              currentOutputTranscriptionRef.current = '';
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e: any) => { 
            console.error('Gemini Live Socket Error:', e);
            const msg = e instanceof Error ? e.message : (e?.message || JSON.stringify(e));
            const isTransientError = msg.includes('unavailable') || msg.includes('503') || msg.includes('aborted');

            if (isTransientError && retryCountRef.current < maxRetries) {
               retryCountRef.current++;
               setTimeout(() => { initializeLiveSession(); }, 2000);
               return;
            }
            setStatus('error');
            setErrorMsg(msg.length > 60 ? msg.substring(0, 60) + "..." : msg);
          },
          onclose: (e) => {
             if (status !== 'error' && status !== 'summarizing' && status !== 'connecting') setStatus('closed');
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: persona.voiceName } }
          },
          systemInstruction: augmentedInstructions,
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err: any) { 
      console.error("Initialization Error", err);
      let message = err?.message || "Failed to connect.";
      if (message === "MIC_PERMISSION_DENIED") message = "Microphone access denied. Please allow microphone permissions in your browser settings.";
      if (message === "MIC_NOT_FOUND") message = "No microphone found. Please connect a microphone.";
      if (message === "MIC_IN_USE") message = "Microphone is being used by another app.";
      if (message === "MIC_CONSTRAINTS_ERROR") message = "Microphone hardware mismatch. Please try a different device.";
      
      setStatus('error'); 
      setErrorMsg(message);
    }
  }, [persona, cleanupAudioResources]);

  useEffect(() => {
    const handleOnline = () => { if (status === 'error') initializeLiveSession(); };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [status, initializeLiveSession]);

  useEffect(() => {
    initializeLiveSession();
    return () => { cleanupAudioResources(); };
  }, [initializeLiveSession, cleanupAudioResources]);

  return (
    <div className="flex flex-col h-[85vh] md:h-[80vh] w-full max-w-6xl mx-auto glass-panel rounded-[30px] overflow-hidden shadow-2xl relative transition-all duration-500">
      
      {/* Loading & Error Overlays */}
      {(status === 'connecting' || status === 'summarizing') && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center text-center p-8 animate-fade-in">
          <div className="w-16 h-16 relative mb-8">
             <div className="absolute inset-0 rounded-full border-4 border-indigo-500/30 animate-ping"></div>
             <div className="absolute inset-0 rounded-full border-4 border-t-indigo-400 border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
          </div>
          <h3 className="text-2xl md:text-3xl italic text-white font-light tracking-wide drop-shadow-lg">
            {status === 'connecting' ? 'Establishing Neural Link...' : 'Synchronizing Memory...'}
          </h3>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center text-center p-8">
          <h3 className="text-2xl font-bold mb-2 text-red-500">Link Severed</h3>
          <p className="text-zinc-400 mb-8 max-w-lg leading-relaxed">{errorMsg}</p>
          <button onClick={() => { retryCountRef.current = 0; initializeLiveSession(); }} className="px-8 py-3 bg-white text-black rounded-full font-bold hover:scale-105 transition-transform">Retry Connection</button>
        </div>
      )}

      {/* Main Split Interface */}
      <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/10">
        
        {/* LEFT: AI Persona View */}
        <div className="flex-1 flex flex-col relative bg-gradient-to-b from-black/20 to-indigo-950/20">
          {/* Header */}
          <div className="p-6 flex justify-between items-start">
            <div>
                <h2 className="text-3xl font-bold italic text-white tracking-tighter drop-shadow-lg">{persona.name}</h2>
                <div className="flex gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-indigo-300 font-semibold">{persona.archetype}</span>
                  {!persona.isErotic && <span className="text-[10px] uppercase tracking-widest border border-blue-500/30 text-blue-300 px-2 rounded-full">SFW</span>}
                </div>
            </div>
            <div className={`px-3 py-1 rounded-full border ${status === 'active' ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-zinc-700 bg-zinc-800 text-zinc-500'} text-[10px] uppercase tracking-widest`}>
                {status === 'active' ? 'Online' : 'Offline'}
            </div>
          </div>

          {/* AI Visualizer & Presence */}
          <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
             <div className="w-64 h-64 md:w-80 md:h-80 relative flex items-center justify-center">
                 {/* Canvas container with glow */}
                 <div className="absolute inset-0 bg-indigo-500/10 blur-[60px] rounded-full animate-pulse-slow"></div>
                 <canvas ref={canvasRef} width={400} height={400} className="w-full h-full relative z-10 opacity-90" />
             </div>
             
             {/* Latest AI Speech Subtitle */}
             <div className="mt-8 min-h-[4rem] text-center max-w-md px-4">
                {transcriptions.filter(t => t.type === 'model').slice(-1).map((t, i) => (
                    <p key={i} className="text-lg md:text-xl font-light text-white/90 leading-relaxed animate-fade-in italic">
                        "{t.text}"
                    </p>
                ))}
             </div>
          </div>
        </div>

        {/* RIGHT: User Interface */}
        <div className="flex-1 flex flex-col bg-black/40 backdrop-blur-sm">
          {/* User History Log */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 scroll-smooth scrollbar-thin scrollbar-thumb-white/10" ref={messagesEndRef}>
             <div className="text-xs uppercase tracking-widest text-zinc-500 mb-4 sticky top-0 bg-transparent backdrop-blur-md py-2">Session Log</div>
             {transcriptions.length === 0 && (
                <div className="h-40 flex items-center justify-center text-zinc-600 italic text-sm">
                    Waiting for voice input...
                </div>
             )}
             {transcriptions.map((t, i) => (
               <div key={i} className={`flex ${t.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                 <div className={`max-w-[85%] px-5 py-3 rounded-2xl text-sm leading-relaxed ${
                   t.type === 'user' 
                     ? 'bg-white text-black rounded-tr-sm' 
                     : 'bg-white/10 text-zinc-200 border border-white/5 rounded-tl-sm'
                 }`}>
                   {t.text}
                 </div>
               </div>
             ))}
             {/* Dummy div to scroll to */}
             <div ref={messagesEndRef} />
          </div>

          {/* User Controls */}
          <div className="p-6 border-t border-white/10 bg-black/60">
             <div className="flex items-center justify-between gap-4">
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-500/20 text-red-500 border border-red-500/50' : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'}`}
                >
                  {isMuted ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 19 3-3 3 3"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h6"/><path d="m2 2 20 20"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
                  )}
                </button>

                <div className="flex-1 flex justify-center gap-2">
                    {!isRecording ? (
                        <button onClick={handleStartRecording} className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full text-xs font-bold uppercase tracking-widest text-zinc-300 transition-all border border-white/10">
                            Record Clip
                        </button>
                    ) : (
                        <button onClick={handleStopRecording} className="px-6 py-3 bg-red-500 text-white rounded-full text-xs font-bold uppercase tracking-widest animate-pulse shadow-[0_0_15px_red]">
                            Stop Rec
                        </button>
                    )}
                </div>

                <button onClick={handleDisconnect} className="px-6 py-3 bg-white text-black rounded-full text-xs font-bold uppercase tracking-widest hover:scale-105 transition-all shadow-lg">
                    End Call
                </button>
             </div>
             
             {/* Settings Toggle */}
             <div className="mt-4 flex justify-center">
                <button onClick={() => setShowSettings(!showSettings)} className="text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300">
                    Audio Settings
                </button>
             </div>
             
             {showSettings && (
                 <div className="mt-4 p-4 bg-white/5 rounded-xl border border-white/10 animate-fade-in">
                     <div className="space-y-4">
                        <div>
                           <div className="flex justify-between text-xs text-zinc-400 mb-1"><span>Volume</span><span>{Math.round(settings.volume * 10)}</span></div>
                           <input type="range" min="0" max="4" step="0.1" value={settings.volume} onChange={(e) => updateSetting('volume', parseFloat(e.target.value))} className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white" />
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-400">Enhancer (Compressor)</span>
                            <button onClick={() => updateSetting('enhancer', !settings.enhancer)} className={`w-8 h-4 rounded-full relative transition-colors ${settings.enhancer ? 'bg-indigo-500' : 'bg-zinc-700'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${settings.enhancer ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-400">Auto-Leveling (Breaths/Moans)</span>
                            <button onClick={() => updateSetting('autoLevel', !settings.autoLevel)} className={`w-8 h-4 rounded-full relative transition-colors ${settings.autoLevel ? 'bg-indigo-500' : 'bg-zinc-700'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${settings.autoLevel ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </button>
                        </div>
                     </div>
                 </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveChat;