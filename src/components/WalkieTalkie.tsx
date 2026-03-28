import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Mic, MicOff, Radio, Volume2, Users, Settings, MessageSquare, Info, Activity, SignalHigh, Globe, User, Sliders, ChevronDown, ChevronUp, Search, Sparkles, Loader2, Map as MapIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';


const SOCKET_URL = window.location.origin;

const COMMON_FREQUENCIES = [
  { label: 'PMR CH1', value: '446.00625' },
  { label: 'PMR CH2', value: '446.01875' },
  { label: 'FRS CH1', value: '462.5625' },
  { label: 'GMRS CH1', value: '462.5500' },
  { label: 'FREE CH', value: 'FREE' },
];

const AVAILABLE_CHANNELS = ['Global Net', 'Emergency', 'Public', 'Tactical', 'Event A', 'Event B'];

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, isOpen, onToggle, icon }) => {
  return (
    <div className="bg-[#151619] rounded-2xl border-2 border-[#2A2B2F] shadow-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-[#1A1B1E] transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon && <div className="text-[#8E9299]">{icon}</div>}
          <h3 className="text-[#8E9299] text-[10px] uppercase tracking-widest font-bold">{title}</h3>
        </div>
        {isOpen ? <ChevronUp className="w-3 h-3 text-[#8E9299]" /> : <ChevronDown className="w-3 h-3 text-[#8E9299]" />}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <div className="p-6 pt-0 border-t border-[#2A2B2F]/50">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function WalkieTalkie() {
  const [isConnected, setIsConnected] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const isTalkingRef = useRef(false);
  const [showGatewayInfo, setShowGatewayInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [userList, setUserList] = useState<string[]>([]);
  const [globalDirectory, setGlobalDirectory] = useState<{username: string, room: string}[]>([]);
  
  const [isGatewayMode, setIsGatewayMode] = useState(false);
  const [isHighGain, setIsHighGain] = useState(false);
  const [channel, setChannel] = useState('Global Net');
  const [frequency, setFrequency] = useState('446.00625');
  const [tone, setTone] = useState('67.0'); // CTCSS Tone
  const [username, setUsername] = useState(`Op_${Math.floor(Math.random() * 1000)}`);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const [volume, setVolume] = useState(0.8);
  const [squelch, setSquelch] = useState(0.3);
  
  const [showSOSModal, setShowSOSModal] = useState(false);
  const [targetOperatorId, setTargetOperatorId] = useState('');
  const [isSendingSOS, setIsSendingSOS] = useState(false);
  const [activeSOSFrom, setActiveSOSFrom] = useState<string | null>(null);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'profile' | 'audio' | 'network' | 'search' | 'map'>('profile');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResponse, setSearchResponse] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    operatorId: true,
    activeOps: true,
    levels: true,
    gateway: true,
    netSelector: true,
    directory: true,
    radioSettings: true,
    aiSearch: true,
    audioProcessing: true
  });
  const [smartFeed, setSmartFeed] = useState<string>('Initializing Smart Feed...');
  const [isSmartFeedLoading, setIsSmartFeedLoading] = useState(false);

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const fetchSmartFeed = async () => {
    setIsSmartFeedLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      // Try to get location
      let location = "Global";
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        location = `${pos.coords.latitude}, ${pos.coords.longitude}`;
      } catch (e) {
        console.log("Location access denied or timed out, using Global.");
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Provide a very short (max 15 words) summary of the current weather and top news for ${location}. Format as a single line for a scrolling ticker.`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      
      setSmartFeed(response.text || 'No feed data available.');
    } catch (error) {
      console.error('Smart Feed error:', error);
      setSmartFeed('Internet connection active. Standby for updates.');
    } finally {
      setIsSmartFeedLoading(false);
    }
  };

  useEffect(() => {
    fetchSmartFeed();
    const interval = setInterval(fetchSmartFeed, 300000); // Update every 5 minutes
    return () => clearInterval(interval);
  }, []);

  const handleInternetSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setSearchResponse('');
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: searchQuery,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      
      setSearchResponse(response.text || 'No information found.');
    } catch (error) {
      console.error('Search error:', error);
      setSearchResponse('Error connecting to the internet services. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };
  
  const socketRef = useRef<Socket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Refs to avoid stale closures in socket listeners
  const volumeRef = useRef(volume);
  const usernameRef = useRef(username);
  
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  const [isFreeChannelAudioOn, setIsFreeChannelAudioOn] = useState(true);
  const [freeChannelActiveSender, setFreeChannelActiveSender] = useState<string | null>(null);
  const freeChannelActiveSenderRef = useRef<string | null>(null);
  const isFreeChannelAudioOnRef = useRef(isFreeChannelAudioOn);

  useEffect(() => {
    isFreeChannelAudioOnRef.current = isFreeChannelAudioOn;
  }, [isFreeChannelAudioOn]);

  const playNotificationBeep = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    
    const playToxicTone = (time: number, duration: number) => {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      // Gritty "toxic" buzz using sawtooth and square waves
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(180, time);
      osc1.frequency.exponentialRampToValueAtTime(450, time + duration);
      
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(185, time); // Dissonant offset for "heavy" feel
      osc2.frequency.exponentialRampToValueAtTime(460, time + duration);
      
      gain.gain.setValueAtTime(0.07, time);
      gain.gain.linearRampToValueAtTime(0.001, time + duration);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.start(time);
      osc2.start(time);
      osc1.stop(time + duration);
      osc2.stop(time + duration);
    };

    const now = ctx.currentTime;
    // Play 3 times with a heavy, industrial rhythm
    for (let i = 0; i < 3; i++) {
      playToxicTone(now + (i * 0.35), 0.25);
    }
  };

  const playEmergencySOS = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    const now = ctx.currentTime;
    
    const playAlarmTone = (startTime: number, freq1: number, freq2: number, type: OscillatorType = 'square') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq1, startTime);
      osc.frequency.exponentialRampToValueAtTime(freq2, startTime + 0.25);
      osc.frequency.exponentialRampToValueAtTime(freq1, startTime + 0.5);
      osc.frequency.exponentialRampToValueAtTime(freq2, startTime + 0.75);
      osc.frequency.exponentialRampToValueAtTime(freq1, startTime + 1.0);
      osc.frequency.exponentialRampToValueAtTime(freq2, startTime + 1.25);
      osc.frequency.exponentialRampToValueAtTime(freq1, startTime + 1.5);
      osc.frequency.exponentialRampToValueAtTime(freq2, startTime + 1.75);
      osc.frequency.exponentialRampToValueAtTime(freq1, startTime + 2.0);

      gain.gain.setValueAtTime(0.6, startTime); // Even Louder
      gain.gain.linearRampToValueAtTime(0.6, startTime + 1.8);
      gain.gain.linearRampToValueAtTime(0.001, startTime + 2.0);

      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + 2.0);
    };

    // Layered piercing siren for maximum attention
    playAlarmTone(now, 1500, 3000, 'square');
    playAlarmTone(now + 0.05, 800, 1600, 'sawtooth');
    playAlarmTone(now + 0.1, 400, 800, 'triangle');
  };

  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1024);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);





  // Initialize Socket once
  useEffect(() => {
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on('connect', () => {
      setIsConnected(true);
    });

    socketRef.current.on('user-count', (count: number) => {
      setUserCount(count);
    });

    socketRef.current.on('user-list', (list: string[]) => {
      setUserList(list);
    });

    socketRef.current.on('global-directory', (directory: {username: string, room: string}[]) => {
      setGlobalDirectory(directory);
    });

    socketRef.current.on('emergency-sos', (data: { from: string, targetId: string }) => {
      // If targetId matches our username (case-insensitive and trimmed)
      if (data.targetId.trim().toLowerCase() === usernameRef.current.trim().toLowerCase()) {
        playEmergencySOS();
        setActiveSOSFrom(data.from);
        console.log(`EMERGENCY SOS RECEIVED FROM ${data.from}`);
        
        // Clear after 10 seconds
        setTimeout(() => {
          setActiveSOSFrom(prev => prev === data.from ? null : prev);
        }, 10000);
      }
    });

    socketRef.current.on('audio-receive', async (data: { userId: string, audio: any, username: string, frequency: string, isFreeChannel?: boolean }) => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Handle Free Channel Audio
      if (data.isFreeChannel) {
        if (!isFreeChannelAudioOnRef.current) {
          setFreeChannelActiveSender(data.username);
          playNotificationBeep();
          
          // Clear sender after 3 seconds
          setTimeout(() => {
            setFreeChannelActiveSender(prev => prev === data.username ? null : prev);
          }, 3000);
          
          return; // Don't play the audio
        }
      }

      if (!data.audio) {
        return;
      }

      try {
        let audioData = data.audio;
        
        // Handle Socket.io binary data which might arrive as Uint8Array, Blob, or Buffer-like object
        if (audioData instanceof Uint8Array) {
          audioData = audioData.buffer;
        } else if (audioData instanceof Blob) {
          audioData = await audioData.arrayBuffer();
        } else if (audioData && typeof audioData === 'object' && audioData.type === 'Buffer' && Array.isArray(audioData.data)) {
          // Handle case where Buffer was serialized to JSON
          audioData = new Uint8Array(audioData.data).buffer;
        }

        if (!(audioData instanceof ArrayBuffer)) {
          console.warn('Received audio data is not an ArrayBuffer:', typeof audioData, audioData);
          return;
        }

        if (audioData.byteLength === 0) {
          return;
        }

        // Use ref to get current volume
        const currentVol = volumeRef.current;
        const effectiveVolume = (currentVol < 0.1 ? 0 : currentVol) * (isHighGain ? 2.0 : 1.0);

        try {
          // Attempt decoding via AudioContext (preferred for low latency)
          const audioBuffer = await audioContextRef.current.decodeAudioData(audioData.slice(0));
          const source = audioContextRef.current.createBufferSource();
          const gainNode = audioContextRef.current.createGain();
          
          gainNode.gain.value = effectiveVolume;
          source.buffer = audioBuffer;
          source.connect(gainNode);
          gainNode.connect(audioContextRef.current.destination);
          
          source.start(0);
          
          setActiveSpeakers(prev => {
            const next = new Set(prev);
            next.add(data.username);
            return next;
          });
          
          source.onended = () => {
            setActiveSpeakers(prev => {
              const next = new Set(prev);
              next.delete(data.username);
              return next;
            });
          };
        } catch (decodeErr) {
          console.warn('AudioContext decoding failed, falling back to HTMLAudioElement:', decodeErr);
          
          // Fallback to HTMLAudioElement (more lenient with formats)
          const blob = new Blob([audioData]);
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.volume = effectiveVolume;
          
          setActiveSpeakers(prev => {
            const next = new Set(prev);
            next.add(data.username);
            return next;
          });

          audio.onended = () => {
            setActiveSpeakers(prev => {
              const next = new Set(prev);
              next.delete(data.username);
              return next;
            });
            URL.revokeObjectURL(url);
          };

          audio.onerror = (e) => {
            console.error('HTMLAudioElement fallback failed:', e);
            setActiveSpeakers(prev => {
              const next = new Set(prev);
              next.delete(data.username);
              return next;
            });
            URL.revokeObjectURL(url);
          };

          await audio.play();
        }
      } catch (err) {
        console.error('Error playing audio:', err);
      }
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []); // Run once on mount

  const [isScanning, setIsScanning] = useState(false);
  
  // Handle Channel/Frequency/Username changes
  useEffect(() => {
    if (isConnected) {
      setIsScanning(true);
      const timer = setTimeout(() => {
        socketRef.current?.emit('join-channel', { channelId: channel, frequency, username: usernameRef.current });
        setIsScanning(false);
      }, 500);
      
      // Clear active speakers when changing frequency
      setActiveSpeakers(new Set());
      return () => clearTimeout(timer);
    }
  }, [channel, frequency, username, isConnected]);

  const startRecording = async (e?: React.MouseEvent | React.TouchEvent) => {
    if (e && 'preventDefault' in e) e.preventDefault();
    if (isTalkingRef.current) return;
    
    // Immediate visual feedback
    isTalkingRef.current = true;
    setIsTalking(true);

    try {
      // Gateway mode uses raw audio without processing for better radio compatibility
      const constraints = isGatewayMode ? {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      } : { audio: true };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Check if we should still be talking (user might have released during getUserMedia)
      if (!isTalkingRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      // Choose supported mime type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : 'audio/webm';

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioChunks = audioChunksRef.current;
        const audioBlob = new Blob(audioChunks, { type: mimeType });
        
        const arrayBuffer = await audioBlob.arrayBuffer();
        
        socketRef.current?.emit('audio-stream', {
          channelId: channel,
          frequency,
          audio: arrayBuffer,
          username: usernameRef.current
        });
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
    } catch (err) {
      isTalkingRef.current = false;
      setIsTalking(false);
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e && 'preventDefault' in e) e.preventDefault();
    if (!isTalkingRef.current) return;
    
    // Immediate visual feedback
    isTalkingRef.current = false;
    setIsTalking(false);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  return (
    <div className="min-h-screen bg-[#E6E6E6] flex flex-col lg:flex-row items-center justify-center p-4 font-mono overflow-x-hidden">
      <div className="w-full max-w-md bg-[#151619] rounded-3xl shadow-2xl border-4 border-[#2A2B2F] relative z-10">
        {/* Antenna */}
        <div className="hidden sm:block absolute -top-12 left-12 w-4 h-16 bg-[#2A2B2F] rounded-t-full shadow-lg" />
        
        {/* Top Controls */}
        <div className="p-6 flex justify-between items-center border-b border-[#2A2B2F]">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
            <span className="text-[#8E9299] text-[10px] uppercase tracking-widest">Gateway Link</span>
            <div className="ml-2 px-2 py-0.5 bg-[#2A2B2F] rounded text-[8px] text-green-500 font-bold border border-green-500/20">
              {userCount} OPS ONLINE
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="lg:hidden text-[#8E9299] hover:text-white transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setShowGatewayInfo(!showGatewayInfo)}
              className="text-[#8E9299] hover:text-white transition-colors"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Display Screen */}
        <div className="p-6">
          <div className="bg-[#1A1B1E] rounded-xl p-4 border border-[#2A2B2F] shadow-inner relative overflow-hidden min-h-[200px] flex flex-col">
            <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
            
            {/* Smart Feed Ticker */}
            <div className="absolute top-0 left-0 w-full bg-blue-500/10 border-b border-blue-500/20 py-1 overflow-hidden z-10">
              <motion.div
                animate={{ x: [-400, 400] }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                className="whitespace-nowrap text-[8px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2"
              >
                <Globe className="w-2 h-2" />
                {smartFeed}
              </motion.div>
            </div>

            <div className="flex justify-between items-start mb-2 mt-4">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-[#8E9299] text-[10px] uppercase tracking-widest">Net:</h2>
                  <span className="text-blue-400 text-[10px] font-bold uppercase">{channel}</span>
                </div>
                <h2 className="text-[#8E9299] text-[10px] uppercase tracking-widest mb-1">Frequency (MHz)</h2>
                {isScanning ? (
                  <div className="text-white text-2xl font-bold tracking-widest animate-pulse h-[36px] flex items-center">
                    SCANNING...
                  </div>
                ) : (
                  <div className="flex items-baseline gap-2 h-[36px] flex items-center">
                    <p className="text-white text-3xl font-bold tracking-tighter">{frequency}</p>
                    <span className="text-green-500 text-[10px] font-bold">CTCSS: {tone}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <button 
                  onClick={() => {
                    setActiveSettingsTab('search');
                    setShowSettings(true);
                  }}
                  className="p-1 bg-orange-500/10 border border-orange-500/20 rounded-md hover:bg-orange-500/20 transition-colors group"
                  title="Smart Assistant"
                >
                  <Sparkles className="w-3 h-3 text-orange-500 group-hover:scale-110 transition-transform" />
                </button>
                <SignalHigh className={`w-5 h-5 ${isConnected ? 'text-green-500' : 'text-[#8E9299]'}`} />
                <Activity className={`w-4 h-4 ${isTalking || activeSpeakers.size > 0 ? 'text-red-500 animate-pulse' : 'text-[#8E9299]'}`} />
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-end space-y-2 py-2">
              <AnimatePresence mode="popLayout">
                {activeSpeakers.size > 0 ? (
                  Array.from(activeSpeakers).map(speaker => (
                    <motion.div
                      key={speaker}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="flex items-center gap-2 text-sm mb-1 text-green-400"
                    >
                      <Volume2 className="w-3 h-3" />
                      <span className="truncate">{`RX: ${speaker}`}</span>
                    </motion.div>
                  ))
                ) : (
                  <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.5 }}
                    className="text-[#8E9299] text-[10px] italic"
                  >
                    Standby...
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Waveform Visualization */}
            <div className="mt-2 flex items-end gap-1 h-6">
              {[...Array(24)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    height: isTalking || activeSpeakers.size > 0 
                      ? [4, Math.random() * 20 + 4, 4] 
                      : 4
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: Infinity,
                    delay: i * 0.04
                  }}
                  className={`flex-1 rounded-full bg-green-500/30`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Frequency Selector */}
        <div className="px-6 grid grid-cols-3 gap-2 mb-4">
          {COMMON_FREQUENCIES.map((freq) => (
            <button
              key={freq.value}
              onClick={() => setFrequency(freq.value)}
              className={`py-2 rounded-lg text-[9px] font-bold transition-all border ${
                frequency === freq.value 
                  ? 'bg-green-500/20 border-green-500 text-green-400' 
                  : 'bg-[#1A1B1E] border-[#2A2B2F] text-[#8E9299] hover:border-[#3A3B3F]'
              }`}
            >
              {freq.label}
            </button>
          ))}
        </div>

        {/* Main PTT Button */}
        <div className="px-6 pb-8 flex flex-col items-center gap-6">
          <div className="relative flex items-center justify-center w-full">
            {/* Integrated Button - Free Channel (Moved to Left Side Border) */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-50">
              <div className="bg-[#1A1B1E] p-1 rounded-full border border-[#3A3B3F] shadow-inner relative">
                <motion.button
                  onClick={() => setIsFreeChannelAudioOn(!isFreeChannelAudioOn)}
                  whileTap={{ scale: 0.9 }}
                  className={`w-11 h-11 rounded-full flex flex-col items-center justify-center border-2 transition-all duration-300 relative group ${
                    isFreeChannelAudioOn 
                      ? 'bg-green-500/10 border-green-500/50 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]' 
                      : 'bg-[#151619] border-[#2A2B2F] text-[#8E9299]'
                  } ${!isFreeChannelAudioOn && freeChannelActiveSender ? 'border-red-500/60 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : ''}`}
                >
                  {/* Status Glow */}
                  {isFreeChannelAudioOn && (
                    <div className="absolute inset-0 rounded-full bg-green-500/10 animate-pulse" />
                  )}
                  {!isFreeChannelAudioOn && freeChannelActiveSender && (
                    <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
                  )}

                  <div className="relative z-10 flex flex-col items-center">
                    {isFreeChannelAudioOn ? (
                      <Volume2 className="w-4 h-4 mb-0.5" />
                    ) : (
                      <div className="flex flex-col items-center">
                        {freeChannelActiveSender ? (
                          <Activity className="w-3.5 h-3.5 mb-0.5 animate-bounce" />
                        ) : (
                          <MicOff className="w-3.5 h-3.5 mb-0.5 opacity-40" />
                        )}
                      </div>
                    )}
                    <span className={`text-[5px] font-black uppercase tracking-tighter ${
                      isFreeChannelAudioOn ? 'text-green-400' : (freeChannelActiveSender ? 'text-red-400' : 'text-[#8E9299]')
                    }`}>
                      {isFreeChannelAudioOn ? 'MONITOR' : (freeChannelActiveSender ? freeChannelActiveSender : 'MUTE')}
                    </span>
                  </div>
                </motion.button>
              </div>
              
              <div className="flex items-center gap-1 bg-[#1A1B1E] px-1.5 py-0.5 rounded-full border border-[#2A2B2F]">
                <div className={`w-1 h-1 rounded-full ${isFreeChannelAudioOn ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)]' : 'bg-[#3A3B3F]'}`} />
                <span className="text-[#8E9299] text-[6px] uppercase font-black tracking-[0.1em]">Free CH</span>
              </div>
            </div>

            {/* Emergency SOS Switch (Right Side) */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-50">
              <div className={`bg-[#1A1B1E] p-1.5 rounded-xl border transition-all duration-300 shadow-inner relative ${
                activeSOSFrom ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'border-[#3A3B3F]'
              }`}>
                {activeSOSFrom && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[7px] font-black px-2 py-1 rounded-md whitespace-nowrap animate-bounce shadow-lg border border-red-400">
                    SOS: {activeSOSFrom}
                  </div>
                )}
                
                <motion.button
                  onClick={() => setShowSOSModal(true)}
                  whileTap={{ scale: 0.95 }}
                  className={`w-10 h-14 bg-[#151619] rounded-lg flex flex-col items-center justify-between p-1 border transition-all duration-300 relative overflow-hidden group ${
                    activeSOSFrom ? 'border-red-500/50' : 'border-[#2A2B2F]'
                  }`}
                >
                  {/* Switch Base */}
                  <div className={`absolute inset-0 bg-gradient-to-b from-red-900/20 to-transparent transition-opacity ${
                    activeSOSFrom ? 'opacity-80' : 'opacity-50'
                  }`} />
                  
                  {/* Switch Toggle */}
                  <div className={`w-full h-1/2 rounded shadow-[0_2px_10px_rgba(220,38,38,0.4)] flex items-center justify-center relative z-10 border-t transition-all duration-300 ${
                    activeSOSFrom ? 'bg-red-500 border-red-300 animate-pulse' : 'bg-red-600 border-red-400/30'
                  }`}>
                    <SignalHigh className={`w-4 h-4 text-white ${activeSOSFrom ? 'animate-bounce' : 'animate-pulse'}`} />
                  </div>
                  
                  <div className="flex flex-col items-center pb-1 relative z-10">
                    <span className={`text-[6px] font-black uppercase tracking-widest transition-colors ${
                      activeSOSFrom ? 'text-white' : 'text-red-500'
                    }`}>
                      {activeSOSFrom ? 'ACTIVE' : 'SOS'}
                    </span>
                    <div className={`w-1 h-1 rounded-full mt-0.5 transition-all ${
                      activeSOSFrom ? 'bg-white animate-ping' : 'bg-red-500/50'
                    }`} />
                  </div>
                </motion.button>
              </div>
              
              <div className="flex items-center gap-1 bg-[#1A1B1E] px-1.5 py-0.5 rounded-full border border-[#2A2B2F]">
                <div className={`w-1 h-1 rounded-full transition-all ${
                  activeSOSFrom ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,1)]' : 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]'
                }`} />
                <span className="text-[#8E9299] text-[6px] uppercase font-black tracking-[0.1em]">
                  {activeSOSFrom ? 'ALARM ON' : 'SWITCH'}
                </span>
              </div>
            </div>

            <div className="relative">
              <motion.button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                onTouchCancel={stopRecording}
                onContextMenu={(e) => e.preventDefault()}
                whileTap={{ scale: 0.95 }}
                className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-200 border-8 touch-none ${
                  isTalking 
                    ? 'bg-red-600 border-red-800 shadow-[0_0_30px_rgba(220,38,38,0.4)]'
                    : 'bg-[#2A2B2F] border-[#3A3B3F] hover:bg-[#3A3B3F]'
                }`}
              >
                {isTalking ? (
                  <Mic className="w-10 h-10 text-white" />
                ) : (
                  <MicOff className="w-10 h-10 text-[#8E9299]" />
                )}
              </motion.button>
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[#8E9299] text-[9px] uppercase tracking-[0.2em] font-bold">
                TX / PTT
              </div>
            </div>
          </div>

          {/* Controls Grid */}
          <div className="w-full grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[9px] text-[#8E9299] uppercase font-bold">
                <span>Volume</span>
                <span>{Math.round(volume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full h-2 bg-[#2A2B2F] rounded-full appearance-none cursor-pointer accent-green-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[9px] text-[#8E9299] uppercase font-bold">
                <span>Squelch</span>
                <span>{Math.round(squelch * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={squelch}
                onChange={(e) => setSquelch(parseFloat(e.target.value))}
                className="w-full h-2 bg-[#2A2B2F] rounded-full appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Bottom Branding */}
        <div className="p-4 bg-[#1A1B1E] flex justify-between items-center border-t border-[#2A2B2F]">
          <div className="flex items-center gap-2">
            <Radio className="w-3 h-3 text-[#8E9299]" />
            <span className="text-[#8E9299] text-[9px] uppercase tracking-widest font-bold">RoIP Gateway v2.0</span>
          </div>
          <div className="flex items-center gap-1 text-[#8E9299] text-[9px]">
            <span>READY</span>
          </div>
        </div>

        {/* Gateway Info Modal */}
        <AnimatePresence>
          {showSOSModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#151619] border-2 border-red-500/50 w-full max-w-xs rounded-2xl p-6 shadow-[0_0_50px_rgba(239,68,68,0.2)]"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                    <SignalHigh className="w-6 h-6 text-red-500 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-white text-sm font-black uppercase tracking-wider">Emergency SOS</h3>
                    <p className="text-red-500/70 text-[8px] font-bold uppercase">Priority Transmission</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[#8E9299] text-[9px] uppercase font-bold block mb-2 tracking-widest">Target Operator ID</label>
                    <input
                      type="text"
                      placeholder="Enter Operator ID"
                      value={targetOperatorId}
                      onChange={(e) => setTargetOperatorId(e.target.value)}
                      className="w-full bg-[#1A1B1E] border border-[#2A2B2F] rounded-xl p-3 text-white text-xs focus:border-red-500 outline-none transition-all placeholder:text-[#3A3B3F]"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowSOSModal(false)}
                      className="flex-1 py-3 bg-[#1A1B1E] text-[#8E9299] text-[10px] font-black uppercase rounded-xl border border-[#2A2B2F] hover:bg-[#2A2B2F] transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!targetOperatorId.trim()) return;
                        setIsSendingSOS(true);
                        socketRef.current?.emit('emergency-sos', { 
                          from: usernameRef.current, 
                          targetId: targetOperatorId.trim() 
                        });
                        
                        // Show a brief "Sent" status
                        setIsSendingSOS(true);
                        
                        setTimeout(() => {
                          setIsSendingSOS(false);
                          setShowSOSModal(false);
                          setTargetOperatorId('');
                        }, 1500);
                      }}
                      disabled={isSendingSOS || !targetOperatorId.trim()}
                      className="flex-1 py-3 bg-red-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-red-700 transition-all shadow-[0_4px_15px_rgba(220,38,38,0.3)] disabled:opacity-50"
                    >
                      {isSendingSOS ? 'Sending...' : 'Send SOS'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gateway Info Modal */}
        <AnimatePresence>
          {showGatewayInfo && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute inset-0 bg-[#151619]/95 z-50 p-8 flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-white text-lg font-bold flex items-center gap-2">
                  <Activity className="w-5 h-5 text-green-500" />
                  Gateway Setup
                </h3>
                <button onClick={() => setShowGatewayInfo(false)} className="text-[#8E9299] hover:text-white">✕</button>
              </div>
              
              <div className="space-y-4 text-[#8E9299] text-xs leading-relaxed overflow-y-auto">
                <p>To connect a real walkie-talkie to this internet frequency:</p>
                <ol className="list-decimal list-inside space-y-3">
                  <li>
                    <span className="text-white font-bold">Hardware:</span> Connect your radio to your computer using an audio interface (3.5mm jack).
                  </li>
                  <li>
                    <span className="text-white font-bold">VOX Mode:</span> Enable <span className="text-green-500">VOX</span> on your real radio so it transmits when it hears audio from this app.
                  </li>
                  <li>
                    <span className="text-white font-bold">Frequency:</span> Set your real radio to the frequency shown on the screen (e.g., <span className="text-green-500">446.00625 MHz</span>).
                  </li>
                  <li>
                    <span className="text-white font-bold">CTCSS:</span> Match the Tone (e.g., <span className="text-green-500">67.0 Hz</span>) if your radio uses sub-channels.
                  </li>
                </ol>
                <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl mt-4">
                  <p className="text-green-400 font-bold mb-1 italic">Pro Tip:</p>
                  <p>Use a dedicated "Gateway" device (like a Raspberry Pi) to keep this frequency active 24/7.</p>
                </div>
              </div>
              
              <button 
                onClick={() => setShowGatewayInfo(false)}
                className="mt-auto w-full py-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors"
              >
                Got it, Over.
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sidebar for User Info - Mobile Drawer & Desktop Sidebar */}
      <AnimatePresence>
        {(showSettings || isLargeScreen) && (
          <motion.div 
            initial={isLargeScreen ? { opacity: 1, x: 0 } : { x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className={`fixed lg:relative top-0 right-0 h-full lg:h-auto w-80 lg:w-64 bg-[#151619] lg:bg-transparent p-6 lg:p-0 z-50 lg:z-0 shadow-2xl lg:shadow-none border-l-4 lg:border-l-0 border-[#2A2B2F] lg:border-none flex flex-col gap-4 overflow-y-auto lg:ml-8 transition-all`}
          >
            {/* Mobile Close Button */}
            <div className="lg:hidden flex justify-between items-center mb-6">
              <h2 className="text-white font-bold uppercase tracking-widest">Radio Config</h2>
              <button onClick={() => setShowSettings(false)} className="text-[#8E9299] hover:text-white">
                <Settings className="w-6 h-6" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 bg-[#1A1B1E] p-1 rounded-xl border border-[#2A2B2F] mb-2">
              <button
                onClick={() => setActiveSettingsTab('profile')}
                className={`flex-1 flex flex-col items-center py-2 rounded-lg transition-all ${
                  activeSettingsTab === 'profile' ? 'bg-green-600 text-white' : 'text-[#8E9299] hover:text-white'
                }`}
              >
                <User className="w-4 h-4 mb-1" />
                <span className="text-[8px] font-black uppercase">Operator</span>
              </button>
              <button
                onClick={() => setActiveSettingsTab('audio')}
                className={`flex-1 flex flex-col items-center py-2 rounded-lg transition-all ${
                  activeSettingsTab === 'audio' ? 'bg-blue-600 text-white' : 'text-[#8E9299] hover:text-white'
                }`}
              >
                <Sliders className="w-4 h-4 mb-1" />
                <span className="text-[8px] font-black uppercase">Audio</span>
              </button>
              <button
                onClick={() => setActiveSettingsTab('network')}
                className={`flex-1 flex flex-col items-center py-2 rounded-lg transition-all ${
                  activeSettingsTab === 'network' ? 'bg-purple-600 text-white' : 'text-[#8E9299] hover:text-white'
                }`}
              >
                <Globe className="w-4 h-4 mb-1" />
                <span className="text-[8px] font-black uppercase">Network</span>
              </button>
              <button
                onClick={() => setActiveSettingsTab('search')}
                className={`flex-1 flex flex-col items-center py-2 rounded-lg transition-all ${
                  activeSettingsTab === 'search' ? 'bg-orange-600 text-white' : 'text-[#8E9299] hover:text-white'
                }`}
              >
                <Search className="w-4 h-4 mb-1" />
                <span className="text-[8px] font-black uppercase">Search</span>
              </button>
              <button
                onClick={() => setActiveSettingsTab('map')}
                className={`flex-1 flex flex-col items-center py-2 rounded-lg transition-all ${
                  activeSettingsTab === 'map' ? 'bg-red-600 text-white' : 'text-[#8E9299] hover:text-white'
                }`}
              >
                <MapIcon className="w-4 h-4 mb-1" />
                <span className="text-[8px] font-black uppercase">Map</span>
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-4">
              {activeSettingsTab === 'map' && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <div className="bg-[#1A1B1E] rounded-2xl border-2 border-[#2A2B2F] p-4 h-80 relative overflow-hidden">
                    <div className="absolute inset-0 opacity-20 bg-[url('https://picsum.photos/seed/map/800/800')] bg-cover bg-center grayscale" />
                    <div className="relative z-10 h-full flex flex-col">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-white text-[10px] uppercase font-black tracking-widest">Global Operator Map</h3>
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-red-500 text-[8px] font-bold">LIVE</span>
                        </div>
                      </div>
                      
                      <div className="flex-1 relative">
                        {/* Simulated Map Markers */}
                        {globalDirectory.map((entry, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute"
                            style={{
                              left: `${(idx * 37) % 80 + 10}%`,
                              top: `${(idx * 23) % 80 + 10}%`
                            }}
                          >
                            <div className="relative group">
                              <div className="w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow-lg cursor-pointer" />
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-black/80 text-white text-[6px] px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                {entry.username}
                              </div>
                            </div>
                          </motion.div>
                        ))}
                        
                        {/* Current User Marker */}
                        <motion.div
                          className="absolute"
                          style={{ left: '50%', top: '50%' }}
                        >
                          <div className="relative">
                            <div className="w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-lg animate-bounce" />
                            <div className="absolute -inset-2 bg-green-500/20 rounded-full animate-ping" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-green-600 text-white text-[6px] px-1 py-0.5 rounded font-bold whitespace-nowrap">
                              YOU
                            </div>
                          </div>
                        </motion.div>
                      </div>
                      
                      <p className="text-[#8E9299] text-[7px] uppercase text-center mt-2">
                        Visualizing active RoIP nodes across the network.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
              {activeSettingsTab === 'search' && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <CollapsibleSection
                    title="Internet Search"
                    isOpen={collapsedSections.aiSearch}
                    onToggle={() => toggleSection('aiSearch')}
                    icon={<Sparkles className="w-3 h-3" />}
                  >
                    <div className="space-y-4">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Ask anything..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleInternetSearch()}
                          className="w-full bg-[#1A1B1E] border border-[#2A2B2F] rounded-lg p-3 pr-10 text-white text-xs focus:border-orange-500 outline-none transition-all"
                        />
                        <button 
                          onClick={handleInternetSearch}
                          disabled={isSearching}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8E9299] hover:text-orange-500 disabled:opacity-50"
                        >
                          {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        </button>
                      </div>
                      
                      {searchResponse && (
                        <div className="bg-[#1A1B1E] border border-[#2A2B2F] rounded-xl p-4 text-[10px] text-[#E4E3E0] leading-relaxed max-h-80 overflow-y-auto custom-scrollbar">
                          <div className="markdown-body">
                            <Markdown>{searchResponse}</Markdown>
                          </div>
                        </div>
                      )}
                      
                      {!searchResponse && !isSearching && (
                        <p className="text-[#8E9299] text-[8px] uppercase text-center py-4">
                          Use the internet to find frequencies, weather, or technical data.
                        </p>
                      )}
                    </div>
                  </CollapsibleSection>
                </motion.div>
              )}
              {activeSettingsTab === 'profile' && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <CollapsibleSection
                    title="Operator ID"
                    isOpen={collapsedSections.operatorId}
                    onToggle={() => toggleSection('operatorId')}
                    icon={<User className="w-3 h-3" />}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
                        <Users className="w-5 h-5 text-green-500" />
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="w-full bg-transparent text-white text-sm font-bold focus:outline-none border-b border-transparent focus:border-green-500 transition-colors"
                        />
                        <p className="text-[#8E9299] text-[9px] uppercase mt-1">Base Operator</p>
                      </div>
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection
                    title="Active Operators"
                    isOpen={collapsedSections.activeOps}
                    onToggle={() => toggleSection('activeOps')}
                    icon={<Activity className="w-3 h-3" />}
                  >
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                      {userList.length > 0 ? (
                        userList.map((user, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-[10px] text-green-400 font-bold">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            {user} {user === username && <span className="text-[#8E9299] font-normal">(YOU)</span>}
                          </div>
                        ))
                      ) : (
                        <p className="text-[#8E9299] text-[9px] italic">Scanning for signals...</p>
                      )}
                    </div>
                  </CollapsibleSection>
                </motion.div>
              )}

              {activeSettingsTab === 'audio' && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <CollapsibleSection
                    title="Levels"
                    isOpen={collapsedSections.levels}
                    onToggle={() => toggleSection('levels')}
                    icon={<Sliders className="w-3 h-3" />}
                  >
                    <div className="space-y-6">
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between text-[9px] text-[#8E9299] uppercase font-bold">
                          <span>Volume</span>
                          <span>{Math.round(volume * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={volume}
                          onChange={(e) => setVolume(parseFloat(e.target.value))}
                          className="w-full h-2 bg-[#2A2B2F] rounded-full appearance-none cursor-pointer accent-green-500"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between text-[9px] text-[#8E9299] uppercase font-bold">
                          <span>Squelch</span>
                          <span>{Math.round(squelch * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={squelch}
                          onChange={(e) => setSquelch(parseFloat(e.target.value))}
                          className="w-full h-2 bg-[#2A2B2F] rounded-full appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection
                    title="Gateway Config"
                    isOpen={collapsedSections.gateway}
                    onToggle={() => toggleSection('gateway')}
                    icon={<Radio className="w-3 h-3" />}
                  >
                    <div className="flex items-center justify-between p-3 bg-[#1A1B1E] rounded-xl border border-[#2A2B2F]">
                      <div className="flex items-center gap-2">
                        <Activity className={`w-4 h-4 ${isGatewayMode ? 'text-green-500' : 'text-[#8E9299]'}`} />
                        <span className="text-white text-[10px] font-bold uppercase">Gateway Mode</span>
                      </div>
                      <button 
                        onClick={() => setIsGatewayMode(!isGatewayMode)}
                        className={`w-10 h-5 rounded-full transition-colors relative ${isGatewayMode ? 'bg-green-600' : 'bg-[#2A2B2F]'}`}
                      >
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isGatewayMode ? 'right-1' : 'left-1'}`} />
                      </button>
                    </div>
                    <p className="text-[#8E9299] text-[8px] mt-3 leading-relaxed">
                      Enable for RoIP hardware. Disables browser echo cancellation for raw radio signal pass-through.
                    </p>
                  </CollapsibleSection>

                  <CollapsibleSection
                    title="Audio Processing"
                    isOpen={collapsedSections.audioProcessing}
                    onToggle={() => toggleSection('audioProcessing')}
                    icon={<Volume2 className="w-3 h-3" />}
                  >
                    <div className="flex items-center justify-between p-3 bg-[#1A1B1E] rounded-xl border border-[#2A2B2F]">
                      <div className="flex items-center gap-2">
                        <Activity className={`w-4 h-4 ${isHighGain ? 'text-orange-500' : 'text-[#8E9299]'}`} />
                        <span className="text-white text-[10px] font-bold uppercase">High Gain Mode</span>
                      </div>
                      <button 
                        onClick={() => setIsHighGain(!isHighGain)}
                        className={`w-10 h-5 rounded-full transition-colors relative ${isHighGain ? 'bg-orange-600' : 'bg-[#2A2B2F]'}`}
                      >
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isHighGain ? 'right-1' : 'left-1'}`} />
                      </button>
                    </div>
                    <p className="text-[#8E9299] text-[8px] mt-3 leading-relaxed">
                      Boosts incoming audio signals. Use with caution to avoid distortion or speaker damage.
                    </p>
                  </CollapsibleSection>
                </motion.div>
              )}

              {activeSettingsTab === 'network' && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <CollapsibleSection
                    title="Net Selector"
                    isOpen={collapsedSections.netSelector}
                    onToggle={() => toggleSection('netSelector')}
                    icon={<Globe className="w-3 h-3" />}
                  >
                    <div className="grid grid-cols-1 gap-2">
                      {AVAILABLE_CHANNELS.map((ch) => (
                        <button
                          key={ch}
                          onClick={() => {
                            setChannel(ch);
                            if (!isLargeScreen) setShowSettings(false);
                          }}
                          className={`w-full py-2 px-4 rounded-lg text-[10px] font-bold transition-all border text-left flex items-center justify-between ${
                            channel === ch 
                              ? 'bg-blue-500/20 border-blue-500 text-blue-400' 
                              : 'bg-[#1A1B1E] border-[#2A2B2F] text-[#8E9299] hover:border-[#3A3B3F]'
                          }`}
                        >
                          {ch}
                          {channel === ch && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                        </button>
                      ))}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection
                    title="Global Directory"
                    isOpen={collapsedSections.directory}
                    onToggle={() => toggleSection('directory')}
                    icon={<Users className="w-3 h-3" />}
                  >
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {globalDirectory.length > 0 ? (
                        globalDirectory.map((entry, idx) => (
                          <div key={idx} className="flex flex-col gap-0.5 border-b border-[#2A2B2F] pb-2 last:border-0">
                            <div className="flex items-center gap-2 text-[10px] text-blue-400 font-bold">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              {entry.username}
                            </div>
                            <div className="text-[8px] text-[#8E9299] uppercase pl-3.5">
                              {entry.room}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-[#8E9299] text-[9px] italic">No other signals found...</p>
                      )}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection
                    title="Radio Settings"
                    isOpen={collapsedSections.radioSettings}
                    onToggle={() => toggleSection('radioSettings')}
                    icon={<Radio className="w-3 h-3" />}
                  >
                    <div className="space-y-4">
                      <div>
                        <label className="text-[#8E9299] text-[9px] uppercase block mb-2">Manual Frequency</label>
                        <input
                          type="text"
                          value={frequency}
                          onChange={(e) => setFrequency(e.target.value)}
                          className="w-full bg-[#1A1B1E] border border-[#2A2B2F] rounded-lg p-2 text-white text-xs focus:border-green-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[#8E9299] text-[9px] uppercase block mb-2">CTCSS Tone (Hz)</label>
                        <input
                          type="text"
                          value={tone}
                          onChange={(e) => setTone(e.target.value)}
                          className="w-full bg-[#1A1B1E] border border-[#2A2B2F] rounded-lg p-2 text-white text-xs focus:border-green-500 outline-none"
                        />
                      </div>
                    </div>
                  </CollapsibleSection>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Backdrop */}
      {showSettings && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}


