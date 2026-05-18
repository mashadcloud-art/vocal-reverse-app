import React, { useState, useRef, useEffect } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { 
  Mic, Music, Play, Pause, Download, Upload, Settings, Sparkles, 
  Volume2, Waves, Zap, ShieldCheck, RefreshCw, Scissors, Split, 
  Layers, VolumeX, Maximize2, Trash2, ChevronRight, Activity, 
  Cpu, BarChart3, Dna, Plus, Disc, FileAudio, Guitar, Piano, Shield, Globe, Link, Check, Heart,
  X, SkipBack, SkipForward, Repeat, Shuffle, Clock, List
} from 'lucide-react';

// Specialized WAV Encoder for client-side Trojan Horse processing
function audioBufferToWav(buffer) {
  const sampleRate = 44101;
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const buffer_out = new ArrayBuffer(length);
  const view = new DataView(buffer_out);
  const channels = [];
  let i, sample, offset = 0, pos = 0;
  function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
  setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157);
  setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
  setUint32(sampleRate); setUint32(sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164); setUint32(length - pos - 4);
  for (i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }
  return new Blob([buffer_out], { type: "audio/wav" });
}

const cleanSongTitle = (title) => {
  if (!title) return '';
  let cleaned = title.replace(/_\d{10,}\.\w+$/i, '');
  cleaned = cleaned.replace(/\.\w+$/i, '');
  cleaned = cleaned.replace(/_+/g, ' ');
  return cleaned.trim();
};

const API_URL = typeof window !== 'undefined'
  ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3005/api'
      : `${window.location.protocol}//${window.location.hostname}/soundrip-api`
    )
  : 'http://localhost:3005/api';

const formatApiUrl = (url) => {
  if (!url) return '';
  let targetUrl = url;
  if (targetUrl.includes('localhost:3001') || targetUrl.includes('localhost:3005') || targetUrl.includes(':3001') || targetUrl.includes(':3005')) {
    targetUrl = targetUrl.replace(/^https?:\/\/[^/]+:\d+/, '');
  }
  if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) return targetUrl;

  // On the cloud: Nginx handles standard /files/ proxy on port 80/443 directly
  if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
    if (targetUrl.startsWith('/files')) {
      return `${window.location.protocol}//${window.location.hostname}${targetUrl}`;
    }
  }

  // On localhost: strip '/api' suffix if loading static asset files
  let base = API_URL;
  if (base.endsWith('/api') && targetUrl.startsWith('/files')) {
    base = base.replace(/\/api$/, '');
  }
  return base + (targetUrl.startsWith('/') ? targetUrl : '/' + targetUrl);
};

const App = () => {
  // Navigation: 'landing', 'downloader', 'fullPlayer', 'separator', 'stealth'
  const [view, setView] = useState('landing'); 
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  // Dual-persistence load to survive browser hard resets (combines localStorage + Cookie fallback)
  const [sessionCookies, setSessionCookies] = useState(() => {
    try {
      const local = localStorage.getItem('soundrip_cookies');
      if (local) return local;
    } catch (e) {}
    
    try {
      const match = document.cookie.match(/(?:^|; )soundrip_cookies=([^;]*)/);
      if (match) return decodeURIComponent(match[1]);
    } catch (e) {}
    
    return '';
  });

  useEffect(() => {
    try {
      localStorage.setItem('soundrip_cookies', sessionCookies);
    } catch (e) {}
    
    try {
      // Set 10-year persistent cookie backup
      document.cookie = `soundrip_cookies=${encodeURIComponent(sessionCookies)}; max-age=315360000; path=/; SameSite=Lax; Secure`;
    } catch (e) {}
  }, [sessionCookies]);

  const abortControllerRef = useRef(null);
  const processingIntervalRef = useRef(null);

  const cancelProcessing = async () => {
    if (processingIntervalRef.current) {
      clearInterval(processingIntervalRef.current);
      processingIntervalRef.current = null;
    }
    if (abortControllerRef.current) {
      if (typeof abortControllerRef.current.abort === 'function') {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = null;
    }
    if (activeDownloadId) {
      try {
        await fetch(`${API_URL}/cancel/${activeDownloadId}`, { method: 'POST' });
      } catch (e) {
        console.error("Failed to cancel download on server", e);
      }
      setActiveDownloadId(null);
    }
    setIsProcessing(false);
    setUploadProgress(0);
    setProcessingStage('');
  };

  // --- Downloader and Library States ---
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadFormat, setDownloadFormat] = useState('wav'); // 'wav', 'mp3', 'flac'
  const [downloadBitrate, setDownloadBitrate] = useState('320k');
  const [library, setLibrary] = useState([
    { id: '1', title: 'ARZ_KIYA_HAI__OFFICIAL_VIDEO', artist: 'COKE STUDIO BHARAT', format: 'WAV', quality: 'Lossless', url: API_URL + '/files/uploads/Anuv_Jain_X_Lost_Stories___Arz_Kiya_Hai__Official_Video____Coke_Studio_Bharat.wav', thumbnail: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop' }
  ]);
  const [activeTrack, setActiveTrack] = useState(library[0]);
  const [selectedLibraryTrack, setSelectedLibraryTrack] = useState(null);
  const [activeDownloadId, setActiveDownloadId] = useState(null);

  // --- Separator (Splitter) States ---
  const [file, setFile] = useState(null);
  const [songName, setSongName] = useState('');
  const [vocalsUrl, setVocalsUrl] = useState('');
  const [instrumentalUrl, setInstrumentalUrl] = useState('');
  const [bassUrl, setBassUrl] = useState('');
  const [drumsUrl, setDrumsUrl] = useState('');
  const [otherUrl, setOtherUrl] = useState('');
  const [guitarUrl, setGuitarUrl] = useState('');
  const [pianoUrl, setPianoUrl] = useState('');

  const [activeStemId, setActiveStemId] = useState('vocals');
  const [musicVolume, setMusicVolume] = useState(0.8);
  const [vocalVolume, setVocalVolume] = useState(0.8);

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [separationModel, setSeparationModel] = useState('fast'); // 'fast', 'deep'

  // --- Stealth Bypass States ---
  const [speed, setSpeed] = useState(1.04);
  const [semitones, setSemitones] = useState(2);
  const [antiMono, setAntiMono] = useState(false);
  const [combFilter, setCombFilter] = useState(false);
  const [microChop, setMicroChop] = useState(false);
  const [noiseFloor, setNoiseFloor] = useState(true);
  const [reverseVocals, setReverseVocals] = useState(false);
  const [includeDecoy, setIncludeDecoy] = useState(false);

  // Stems Mixing configuration
  const [includeVocals, setIncludeVocals] = useState(true);
  const [includeBass, setIncludeBass] = useState(true);
  const [includeDrums, setIncludeDrums] = useState(true);
  const [includeOther, setIncludeOther] = useState(true);
  const [includeGuitar, setIncludeGuitar] = useState(true);
  const [includePiano, setIncludePiano] = useState(true);

  // HTML Audio & Visualizer References
  const musicAudio = useRef(null);
  const vocalAudio = useRef(null);
  const bassAudio = useRef(null);
  const drumsAudio = useRef(null);
  const otherAudio = useRef(null);
  const guitarAudio = useRef(null);
  const pianoAudio = useRef(null);
  const directAudio = useRef(null);

  const wavesurfer = useRef(null);

  const handleLibraryTrackSelect = (track) => {
    if (!track.vocalsUrl) {
      setSelectedLibraryTrack(track);
      setVocalsUrl('');
      setInstrumentalUrl('');
      setView('separator');
      return;
    }

    setSongName(track.title);
    setIsProcessing(true);
    setUploadProgress(0);
    setProcessingStage('LOADING CACHED AUDIO...');
    
    if (processingIntervalRef.current) clearInterval(processingIntervalRef.current);
    
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          processingIntervalRef.current = null;
          setIsProcessing(false);
          setVocalsUrl(formatApiUrl(track.vocalsUrl));
          setInstrumentalUrl(formatApiUrl(track.instrumentalUrl));
          setBassUrl(formatApiUrl(track.bassUrl || ''));
          setDrumsUrl(formatApiUrl(track.drumsUrl || ''));
          setOtherUrl(formatApiUrl(track.otherUrl || ''));
          setGuitarUrl(formatApiUrl(track.guitarUrl || ''));
          setPianoUrl(formatApiUrl(track.pianoUrl || ''));
          return 100;
        }
        return prev + 25;
      });
    }, 150);
    processingIntervalRef.current = interval;
  };

  const handleLibrarySplit = async () => {
    if (!selectedLibraryTrack) return;
    setIsProcessing(true);
    setUploadProgress(10);
    setProcessingStage('INITIALIZING AI PIPELINE...');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const modelParam = separationModel === 'deep' ? 'pro' : 'fast';
      const response = await fetch(API_URL + '/api/separate-vocals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: `uploads/${selectedLibraryTrack.title}`,
          fileName: selectedLibraryTrack.title,
          model: modelParam
        }),
        signal: controller.signal
      });

      if (!response.ok) throw new Error('AI separator backend error');

      setUploadProgress(60);
      setProcessingStage('DESTRUCTURING SIGNAL STREAMS...');

      const data = await response.json();
      
      setUploadProgress(90);
      setProcessingStage('COMPILING MULTITRACK OUTPUT...');
      
      const timeout1 = setTimeout(() => {
        finishProcessing(data);
        setSongName(selectedLibraryTrack.title);
        setUploadProgress(100);
        setProcessingStage('AI SEPARATION COMPLETE');
        const timeout2 = setTimeout(() => {
          setIsProcessing(false);
          setSelectedLibraryTrack(null);
          abortControllerRef.current = null;
        }, 800);
        processingIntervalRef.current = timeout2;
      }, 1000);
      processingIntervalRef.current = timeout1;

    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('AI Separation cancelled by user.');
        return;
      }
      console.error(err);
      alert('AI Separation failed: ' + (err.message || 'Server error.'));
      setIsProcessing(false);
    }
  };
  const directWavesurfer = useRef(null);

  const waveformRef = useRef(null);
  const playerContainerRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // WaveSurfer Visualizer Effect for main Splitter View
  useEffect(() => {
    if (!waveformRef.current || !vocalsUrl) return;

    if (wavesurfer.current) wavesurfer.current.destroy();

    // Setup master and stems instances
    musicAudio.current = new Audio(instrumentalUrl);
    vocalAudio.current = new Audio(vocalsUrl);
    
    // Instantiate all 6 stems for HQ Deep live mixing
    bassAudio.current = bassUrl ? new Audio(bassUrl) : null;
    drumsAudio.current = drumsUrl ? new Audio(drumsUrl) : null;
    otherAudio.current = otherUrl ? new Audio(otherUrl) : null;
    guitarAudio.current = guitarUrl ? new Audio(guitarUrl) : null;
    pianoAudio.current = pianoUrl ? new Audio(pianoUrl) : null;

    // Set initial volumes
    const isDeep = separationModel === 'deep' && bassUrl;
    vocalAudio.current.volume = includeVocals ? vocalVolume : 0;
    
    if (isDeep) {
      musicAudio.current.volume = 0;
      if (bassAudio.current) bassAudio.current.volume = includeBass ? musicVolume : 0;
      if (drumsAudio.current) drumsAudio.current.volume = includeDrums ? musicVolume : 0;
      if (otherAudio.current) otherAudio.current.volume = includeOther ? musicVolume : 0;
      if (guitarAudio.current) guitarAudio.current.volume = includeGuitar ? musicVolume : 0;
      if (pianoAudio.current) pianoAudio.current.volume = includePiano ? musicVolume : 0;
    } else {
      musicAudio.current.volume = musicVolume;
    }

    wavesurfer.current = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: 'rgba(200, 245, 100, 0.1)',
      progressColor: '#c8f564',
      barWidth: 3,
      barRadius: 3,
      height: 120,
      normalize: true,
      media: musicAudio.current
    });

    const getActiveAudios = () => {
      return [
        vocalAudio.current,
        musicAudio.current,
        bassAudio.current,
        drumsAudio.current,
        otherAudio.current,
        guitarAudio.current,
        pianoAudio.current
      ].filter(Boolean);
    };

    wavesurfer.current.on('play', () => {
      setIsPlaying(true);
      const currentTime = musicAudio.current.currentTime;
      getActiveAudios().forEach(aud => {
        if (aud !== musicAudio.current) {
          aud.currentTime = currentTime;
          aud.play().catch(e => console.log("Stem play error", e));
        }
      });
    });

    wavesurfer.current.on('pause', () => {
      setIsPlaying(false);
      getActiveAudios().forEach(aud => {
        if (aud !== musicAudio.current) {
          aud.pause();
        }
      });
    });

    wavesurfer.current.on('timeupdate', () => {
      const masterTime = wavesurfer.current.getCurrentTime();
      setCurrentTime(masterTime);
      
      // Auto-synchronize stems dynamically if they drift by more than 0.03s (30ms perfect live lock)
      getActiveAudios().forEach(aud => {
        if (aud !== musicAudio.current && !aud.paused) {
          if (Math.abs(aud.currentTime - masterTime) > 0.03) {
            aud.currentTime = masterTime;
          }
        }
      });
    });

    musicAudio.current.addEventListener('loadedmetadata', () => {
      setDuration(musicAudio.current.duration);
      setTrimEnd(musicAudio.current.duration);
    });

    const handleSeeking = () => {
      const currentTime = musicAudio.current.currentTime;
      getActiveAudios().forEach(aud => {
        if (aud !== musicAudio.current) {
          aud.currentTime = currentTime;
        }
      });
    };
    musicAudio.current.addEventListener('seeking', handleSeeking);

    return () => {
      if (wavesurfer.current) wavesurfer.current.destroy();
      if (musicAudio.current) musicAudio.current.removeEventListener('seeking', handleSeeking);
      
      // Clean up and stop all stems to prevent background noise leaking
      getActiveAudios().forEach(aud => {
        aud.pause();
        aud.src = "";
      });
    };
  }, [vocalsUrl, view, bassUrl, drumsUrl, otherUrl, guitarUrl, pianoUrl]);

  // Sync HTML5 Audio element volumes with React states in real-time
  useEffect(() => {
    const isDeep = separationModel === 'deep' && vocalsUrl && bassUrl;
    
    if (vocalAudio.current) {
      vocalAudio.current.volume = includeVocals ? vocalVolume : 0;
    }
    
    if (isDeep) {
      if (musicAudio.current) musicAudio.current.volume = 0;
      if (bassAudio.current) bassAudio.current.volume = includeBass ? musicVolume : 0;
      if (drumsAudio.current) drumsAudio.current.volume = includeDrums ? musicVolume : 0;
      if (otherAudio.current) otherAudio.current.volume = includeOther ? musicVolume : 0;
      if (guitarAudio.current) guitarAudio.current.volume = includeGuitar ? musicVolume : 0;
      if (pianoAudio.current) pianoAudio.current.volume = includePiano ? musicVolume : 0;
    } else {
      if (musicAudio.current) musicAudio.current.volume = musicVolume;
    }
  }, [
    vocalVolume, musicVolume, separationModel, vocalsUrl, bassUrl,
    includeVocals, includeBass, includeDrums, includeOther, includeGuitar, includePiano
  ]);

  // WaveSurfer Visualizer Effect for Fullscreen player (Downloader stream preview)
  useEffect(() => {
    if (view !== 'fullPlayer' || !activeTrack.url || !playerContainerRef.current) return;

    if (directWavesurfer.current) directWavesurfer.current.destroy();

    const audio = new Audio(activeTrack.url);
    directAudio.current = audio;

    try {
      directWavesurfer.current = WaveSurfer.create({
        container: playerContainerRef.current,
        waveColor: 'rgba(200, 245, 100, 0.1)',
        progressColor: '#c8f564',
        barWidth: 2,
        barGap: 3,
        height: 80,
        normalize: true,
        media: audio
      });

      directWavesurfer.current.on('play', () => setIsPlaying(true));
      directWavesurfer.current.on('pause', () => setIsPlaying(false));
      directWavesurfer.current.on('ready', () => {
        setDuration(directWavesurfer.current.getDuration());
      });
      directWavesurfer.current.on('timeupdate', () => {
        setCurrentTime(directWavesurfer.current.getCurrentTime());
      });

      audio.play().then(() => {
        setIsPlaying(true);
      }).catch(e => {
        console.log("Auto-play blocked or failed", e);
        setIsPlaying(false);
      });
    } catch (createErr) {
      console.error("Error creating wavesurfer in player:", createErr);
    }

    return () => {
      try {
        if (directWavesurfer.current) {
          directWavesurfer.current.destroy();
          directWavesurfer.current = null;
        }
      } catch (e) {
        console.error("Error destroying wavesurfer:", e);
      }
      try {
        if (directAudio.current) {
          directAudio.current.pause();
          directAudio.current.src = "";
          directAudio.current = null;
        }
      } catch (e) {
        console.error("Error cleaning up audio:", e);
      }
    };
  }, [view, activeTrack]);

  // Helper for Same-Origin secure downloads (Zero-lag background trigger)
  const downloadBlob = async (url, filename) => {
    try {
      const fullUrl = formatApiUrl(url);
      const a = document.createElement('a');
      a.href = fullUrl;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download trigger failed', err);
      window.open(url, '_blank');
    }
  };

  // Upload file local separate API trigger
  const handleFileUpload = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setSongName(f.name);
    setIsProcessing(true);
    setUploadProgress(0);
    setProcessingStage('INITIALIZING SIGNAL INTERCEPT...');

    const formData = new FormData();
    formData.append('audio', f);
    formData.append('model', separationModel);

    const xhr = new XMLHttpRequest();
    abortControllerRef.current = xhr;
    xhr.open('POST', API_URL + '/separate-vocals', true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent * 0.8);
        setProcessingStage(`SIPHONING TRACK DATA: ${percent}%`);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        finishProcessing(data);
      } else {
        setProcessingStage('EXTRACTION FAILURE');
        alert('AI Separation failed. Server error.');
        setIsProcessing(false);
      }
      abortControllerRef.current = null;
    };

    xhr.onerror = () => {
      if (xhr.status === 0) {
        console.log('Upload aborted by user.');
        return;
      }
      alert('Network Error connecting to separator backend.');
      setIsProcessing(false);
      abortControllerRef.current = null;
    };

    xhr.onabort = () => {
      console.log('Upload aborted by user.');
    };

    xhr.send(formData);
  };

  // URL downloader and dynamic YouTube siphoning
  const handleUniversalCapture = async () => {
    if (!downloadUrl) return;
    setIsProcessing(true);
    setUploadProgress(10);
    setProcessingStage('VERIFYING HANDSHAKE OVERRIDE...');

    let cleanedUrl = downloadUrl.trim();
    // Auto-healing URL parser: if the browser's form manager autofilled the site domain before the actual URL
    const ytSoundcloudMatch = cleanedUrl.match(/(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|soundcloud\.com|snd\.sc)\S+)/i);
    if (ytSoundcloudMatch) {
      cleanedUrl = ytSoundcloudMatch[1];
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const dId = Date.now().toString();
    setActiveDownloadId(dId);

    try {
      const response = await fetch(API_URL + '/download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: cleanedUrl,
          format: downloadFormat,
          bitrate: downloadBitrate,
          skipSeparation: true,
          downloadId: dId,
          cookies: sessionCookies
        }),
        signal: controller.signal
      });
      const dlData = await response.json();
      if (!dlData.success) throw new Error(dlData.error || 'YouTube fetch denied.');

      setProcessingStage('SIGNAL ACQUIRED. PIPING BLOB...');
      setUploadProgress(70);

      const capturedTrack = {
        id: Date.now().toString(),
        title: dlData.fileName,
        artist: 'REMOTE STREAM',
        format: downloadFormat.toUpperCase(),
        quality: downloadBitrate === '340k' || downloadBitrate === 'lossless' ? 'Lossless' : '320K',
        url: dlData.directUrl,
        thumbnail: dlData.thumbnail || 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=800&h=800&fit=crop'
      };

      setLibrary(prev => [capturedTrack, ...prev]);
      setActiveTrack(capturedTrack);

      setUploadProgress(100);
      setProcessingStage('CAPTURE COMPLETED');
      setActiveDownloadId(null);

      const timeoutId = setTimeout(() => {
        setIsProcessing(false);
        setView('fullPlayer');
        downloadBlob(dlData.directUrl, dlData.fileName);
      }, 1000);
      processingIntervalRef.current = timeoutId;

    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Capture cancelled by user.');
        return;
      }
      alert('Capture failed: ' + (err.message || 'Server offline. Check local server terminal.'));
      setIsProcessing(false);
    }
  };

  const finishProcessing = (data) => {
    setVocalsUrl(formatApiUrl(data.vocalsUrl));
    setInstrumentalUrl(formatApiUrl(data.instrumentalUrl));
    setBassUrl(formatApiUrl(data.bassUrl || data.vocalsUrl)); 
    setDrumsUrl(formatApiUrl(data.drumsUrl || data.vocalsUrl));
    setOtherUrl(formatApiUrl(data.otherUrl || data.vocalsUrl));
    if (data.guitarUrl) setGuitarUrl(formatApiUrl(data.guitarUrl));
    if (data.pianoUrl) setPianoUrl(formatApiUrl(data.pianoUrl));

    setProcessingStage('TOPOLOGY SYNAPSE COMPLETED');
    setUploadProgress(100);
    setTimeout(() => {
      setIsProcessing(false);
      setView('separator');
    }, 1200);
  };

  // Complex multi-stem Web Audio API mixer + phase reversal
  const handleSave = async () => {
    if (!vocalsUrl || !bassUrl || !drumsUrl || !otherUrl) return alert("Analyze/Split a signal track first!");
    setIsProcessing(true);
    setUploadProgress(20);
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      setProcessingStage('MAPPING AUDIO MATRIX...');
      
      const vBuf = await audioCtx.decodeAudioData(await (await fetch(vocalsUrl)).arrayBuffer());
      setUploadProgress(40);
      const bBuf = await audioCtx.decodeAudioData(await (await fetch(bassUrl)).arrayBuffer());
      setUploadProgress(60);
      const dBuf = await audioCtx.decodeAudioData(await (await fetch(drumsUrl)).arrayBuffer());
      setUploadProgress(80);
      const oBuf = await audioCtx.decodeAudioData(await (await fetch(otherUrl)).arrayBuffer());

      let gBuf = null; let pBuf = null;
      if (guitarUrl) gBuf = await audioCtx.decodeAudioData(await (await fetch(guitarUrl)).arrayBuffer());
      if (pianoUrl) pBuf = await audioCtx.decodeAudioData(await (await fetch(pianoUrl)).arrayBuffer());

      setProcessingStage('INJECTING BYPASS GHOST SIGNATURE...');
      for (let i = 0; i < vBuf.numberOfChannels; i++) {
        const vChannel = vBuf.getChannelData(i);
        if (reverseVocals) vChannel.reverse();
        if (antiMono && i === 1) {
          for (let j = 0; j < vChannel.length; j++) {
            vChannel[j] = -vChannel[j];
            [bBuf, dBuf, oBuf, gBuf, pBuf].forEach(buf => {
              if (buf && i < buf.numberOfChannels) buf.getChannelData(i)[j] = -buf.getChannelData(i)[j];
            });
          }
        }
        if (microChop) {
          const chopInterval = Math.floor(44100 * 0.4);
          const chopDuration = Math.floor(44100 * 0.015);
          for (let j = 0; j < vChannel.length; j++) {
            if (j % chopInterval < chopDuration) {
              vChannel[j] = 0;
              [bBuf, dBuf, oBuf, gBuf, pBuf].forEach(buf => {
                if (buf && i < buf.numberOfChannels) buf.getChannelData(i)[j] = 0;
              });
            }
          }
        }
      }

      setProcessingStage('RENDERING DYNAMIC GHOST WAVEFORM...');
      const totalLen = (vBuf.duration / speed);
      const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalLen * 44100), 44100);

      const sources = [];
      const addSrc = (buf, include) => {
        if (!buf || !include) return;
        const s = offlineCtx.createBufferSource(); s.buffer = buf;
        s.playbackRate.value = speed; s.detune.value = semitones * 100;
        sources.push(s);
      };
      addSrc(vBuf, includeVocals); addSrc(bBuf, includeBass); addSrc(dBuf, includeDrums);
      addSrc(oBuf, includeOther); addSrc(gBuf, includeGuitar); addSrc(pBuf, includePiano);

      const master = offlineCtx.createGain();
      if (noiseFloor) {
        const nBuf = offlineCtx.createBuffer(1, totalLen * 44100, 44100);
        const nD = nBuf.getChannelData(0);
        for (let i = 0; i < nD.length; i++) nD[i] = (Math.random() * 2 - 1) * 0.01;
        const nS = offlineCtx.createBufferSource(); nS.buffer = nBuf;
        nS.connect(master); nS.start(0);
      }

      const hp = offlineCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 100;
      const lp = offlineCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 15000;
      sources.forEach(s => s.connect(hp));
      hp.connect(lp);

      if (combFilter) {
        const d = offlineCtx.createDelay(); d.delayTime.value = 0.015;
        const dg = offlineCtx.createGain(); dg.gain.value = 0.8;
        lp.connect(d); d.connect(dg); dg.connect(master);
      }
      lp.connect(master);

      if (includeDecoy) {
        [261.63, 329.63, 392.00].forEach(f => {
          const osc = offlineCtx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = f;
          const g = offlineCtx.createGain(); g.gain.value = 0.1;
          const lfo = offlineCtx.createOscillator(); lfo.frequency.value = 4;
          const lg = offlineCtx.createGain(); lg.gain.value = 0.08;
          lfo.connect(lg); lg.connect(g.gain);
          osc.connect(g); g.connect(master);
          osc.start(0); lfo.start(0);
        });
      }
      master.connect(offlineCtx.destination);
      sources.forEach(s => s.start(0));

      const rendered = await offlineCtx.startRendering();
      const blob = audioBufferToWav(rendered);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `M_CORE_BYPASS_${Date.now()}.wav`;
      a.click();
      setProcessingStage('SUCCESS: STEALTH SIGNAL SAVED');
      setUploadProgress(100);
      setTimeout(() => setIsProcessing(false), 2000);
    } catch (e) { 
      alert('Error during matrix bypass mix: ' + e.message); 
      setIsProcessing(false); 
    }
  };

  const handleMixDownloader = async () => {
    if (!vocalsUrl || !instrumentalUrl) return alert("Siphon a target stream first.");
    setIsProcessing(true);
    setProcessingStage('MIXING BALANCED STEALTH SIGNALS...');
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const vBuf = await audioCtx.decodeAudioData(await (await fetch(vocalsUrl)).arrayBuffer());
      const mBuf = await audioCtx.decodeAudioData(await (await fetch(instrumentalUrl)).arrayBuffer());

      const offlineCtx = new OfflineAudioContext(2, vBuf.duration * 44100, 44100);
      const vS = offlineCtx.createBufferSource(); vS.buffer = vBuf;
      const mS = offlineCtx.createBufferSource(); mS.buffer = mBuf;

      const vG = offlineCtx.createGain(); vG.gain.value = vocalVolume;
      const mG = offlineCtx.createGain(); mG.gain.value = musicVolume;

      vS.connect(vG); vG.connect(offlineCtx.destination);
      mS.connect(mG); mG.connect(offlineCtx.destination);

      vS.start(0); mS.start(0);
      const rendered = await offlineCtx.startRendering();
      const wavBlob = audioBufferToWav(rendered);

      const a = document.createElement('a');
      a.href = URL.createObjectURL(wavBlob);
      a.download = `mixed_capture_${Date.now()}.wav`;
      a.click();
      setIsProcessing(false);
    } catch (err) {
      alert("Mix failed: " + err.message);
      setIsProcessing(false);
    }
  };

  // Stems configuration mapping
  const stemsList = [
    { id: 'vocals', name: 'Vocals', icon: <Mic size={18} />, color: '#00f0ff', active: includeVocals, set: setIncludeVocals, url: vocalsUrl },
    { id: 'bass', name: 'Bass', icon: <Waves size={18} />, color: '#7000ff', active: includeBass, set: setIncludeBass, url: bassUrl },
    { id: 'drums', name: 'Drums', icon: <Music size={18} />, color: '#ff007f', active: includeDrums, set: setIncludeDrums, url: drumsUrl },
    { id: 'other', name: 'Other', icon: <Layers size={18} />, color: '#00ffaa', active: includeOther, set: setIncludeOther, url: otherUrl },
    { id: 'guitar', name: 'Guitar', icon: <Guitar size={18} />, color: '#ffd700', active: includeGuitar, set: setIncludeGuitar, url: guitarUrl },
    { id: 'piano', name: 'Piano', icon: <Piano size={18} />, color: '#ffffff', active: includePiano, set: setIncludePiano, url: pianoUrl },
  ];

  // Visualizer Animation Component
  const SpectralHeart = ({ isPlaying, color }) => (
    <div className="relative w-28 h-28 md:w-36 md:h-36 flex items-center justify-center">
      <div className={`absolute inset-0 border border-dashed opacity-10 rounded-full ${isPlaying ? 'animate-spin-slow' : ''}`} style={{ borderColor: color }} />
      <div className="absolute inset-2 border border-white/5 rounded-full" />
      <div className="flex items-end justify-center gap-1 h-20">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className={`w-1 rounded-full transition-all duration-300 ${isPlaying ? 'animate-pulse' : ''}`}
            style={{
              height: isPlaying ? `${30 + (i % 6) * 12}%` : '15%',
              background: `linear-gradient(to top, ${color}, transparent)`,
              animationDelay: `${i * 0.04}s`
            }} />
        ))}
      </div>
    </div>
  );

  // Premium Custom Dropdown Component
  const CustomSelect = ({ value, onChange, options, className = "", compact = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (containerRef.current && !containerRef.current.contains(event.target)) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const activeOption = options.find(opt => opt.value === value) || options[0];

    return (
      <div ref={containerRef} className={`relative select-none ${className}`}>
        <div 
          onClick={() => setIsOpen(!isOpen)} 
          className={`w-full bg-white/5 text-white border border-white/10 hover:border-[#c8f564] focus:outline-none cursor-pointer transition-all uppercase flex items-center justify-between gap-2 ${
            compact ? 'rounded-xl px-4 py-2.5 text-[10px] font-black' : 'rounded-2xl px-6 py-4 text-xs font-black'
          }`}
        >
          <span className="flex-1 text-center">{activeOption.label}</span>
          <ChevronRight size={compact ? 12 : 14} className={`transform transition-transform text-white/55 duration-300 ${isOpen ? 'rotate-90' : ''}`} />
        </div>
        {isOpen && (
          <div className="absolute left-0 right-0 mt-2 bg-[#0d0d18]/95 backdrop-blur-3xl border border-white/10 rounded-2xl overflow-hidden z-[2000] shadow-[0_20px_50px_rgba(0,0,0,0.8)] animate-in fade-in slide-in-from-top-2 duration-200">
            {options.map((opt) => (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`font-black uppercase text-center cursor-pointer transition-colors ${
                  compact ? 'px-4 py-2.5 text-[10px]' : 'px-6 py-4 text-xs'
                } ${
                  opt.value === value 
                    ? 'bg-[#c8f564] text-black' 
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                {opt.label}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const Navigation = () => (
    <nav className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-4 md:px-[6vw] py-5 md:py-6 bg-[#080810]/80 backdrop-blur-3xl border-b border-white/5">
      <div onClick={() => setView('landing')} className="flex items-center gap-2 md:gap-3 cursor-pointer group flex-shrink-0">
        <div className="w-2.5 h-2.5 rounded-full bg-[#c8f564] shadow-[0_0_15px_#c8f564] animate-pulse" />
        <div className="flex flex-col">
          <span className="font-extrabold text-base md:text-2xl tracking-tighter leading-none text-white">SoundRip</span>
          <span className="text-[7px] md:text-[9px] font-bold text-[#c8f564] uppercase tracking-widest leading-none mt-1">by mashad</span>
        </div>
      </div>
      <div className="flex items-center gap-3.5 md:gap-10">
        <button onClick={() => setView('landing')} className={`text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.3em] transition-all ${view === 'landing' ? 'text-[#c8f564]' : 'text-gray-500 hover:text-white'}`}>Home</button>
        <button onClick={() => setView('downloader')} className={`text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.3em] transition-all ${view === 'downloader' ? 'text-[#c8f564]' : 'text-gray-500 hover:text-white'}`}>Capture</button>
        <button onClick={() => setView('separator')} className={`text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.3em] transition-all ${view === 'separator' ? 'text-[#c8f564]' : 'text-gray-500 hover:text-white'}`}>Splitter</button>
        <button onClick={() => setView('stealth')} className={`text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.3em] transition-all ${view === 'stealth' ? 'text-[#c8f564]' : 'text-gray-500 hover:text-white'}`}>Stealth</button>
        <button onClick={() => setShowSettingsModal(true)} className="flex p-2.5 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-[#c8f564] hover:text-black transition-all">
          <Settings size={18} />
        </button>
      </div>
    </nav>
  );

  const FullScreenPlayer = () => (
    <div className="fixed inset-0 z-[2000] bg-[#020204] flex flex-col items-center justify-center overflow-hidden animate-in fade-in slide-in-from-bottom-20 duration-1000">
      <div className="absolute inset-0 z-0">
        <img src={activeTrack.thumbnail} className="w-full h-full object-cover opacity-20 blur-[120px] scale-110" alt="bg" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#020204]/80 to-[#020204]" />
      </div>

      <header className="absolute top-0 left-0 right-0 p-8 flex justify-between items-center z-50">
        <button onClick={() => setView('downloader')} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white hover:text-black transition-all">
          <ChevronRight size={24} className="rotate-180" />
        </button>
        <div className="text-center">
          <span className="text-[10px] font-black uppercase tracking-[0.6em] text-[#c8f564] animate-pulse">Now Playing</span>
          <p className="text-[12px] font-bold text-white/40 uppercase tracking-widest mt-1.5">{activeTrack.format} • {activeTrack.quality}</p>
        </div>
        <button onClick={() => setView('landing')} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-red-500 transition-all">
          <X size={20} />
        </button>
      </header>

      <main className="relative z-10 flex flex-col items-center w-full max-w-2xl px-6 mt-10">
        <div className="relative mb-12">
          <div className={`absolute -inset-20 bg-[#c8f564]/10 blur-[150px] rounded-full transition-opacity duration-1000 ${isPlaying ? 'opacity-100' : 'opacity-0'}`} />
          <div className={`relative w-[60vw] h-[60vw] max-w-[280px] max-h-[280px] rounded-full p-2 bg-[#0a0a0a] border-[12px] border-white/5 shadow-[0_60px_120px_-30px_rgba(0,0,0,1)] transition-transform duration-[500ms] ${isPlaying ? 'animate-[spin_12s_linear_infinite]' : ''}`}>
             <div className="w-full h-full rounded-full overflow-hidden relative">
                <img src={activeTrack.thumbnail} className="w-full h-full object-cover" alt="Art" />
                <div className="absolute inset-0 bg-[repeating-radial-gradient(circle,rgba(0,0,0,0.4)_0px,rgba(0,0,0,0.4)_1px,transparent_2px,transparent_8px)] opacity-50" />
             </div>
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-[#020204] border-2 border-white/10 flex items-center justify-center shadow-2xl">
                <div className="w-2 h-2 rounded-full bg-[#c8f564] shadow-[0_0_15px_#c8f564] animate-pulse" />
             </div>
          </div>
        </div>

        <div className="text-center mb-8 space-y-2 w-full max-w-lg">
          <h2 className="text-base md:text-lg font-black text-white uppercase tracking-tight leading-relaxed px-6 break-all">{cleanSongTitle(activeTrack.title)}</h2>
          <p className="text-[#c8f564] font-black tracking-[0.4em] uppercase text-[8px] opacity-65">Source Authentication: Verified</p>
        </div>

        <div className="w-full mb-10 px-4 space-y-3">
          {/* Waveform hidden element for backend lifecycle if needed */}
          <div ref={playerContainerRef} className="hidden" />

          {/* Premium Bulletproof Seek Bar */}
          <div className="relative group w-full h-1.5 bg-white/10 rounded-full cursor-pointer overflow-visible">
            {/* Glowing progress line */}
            <div 
              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-[#c8f564] to-cyan-400 rounded-full shadow-[0_0_10px_#c8f564]"
              style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            />
            {/* Range input overlay for bulletproof clicking and dragging */}
            <input 
              type="range"
              min="0"
              max={duration || 100}
              step="0.01"
              value={currentTime}
              onChange={(e) => {
                const newTime = parseFloat(e.target.value);
                setCurrentTime(newTime);
                if (directAudio.current) {
                  directAudio.current.currentTime = newTime;
                }
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            />
            {/* Scrubber thumb */}
            <div 
              className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] -top-1 -ml-1.5 transition-transform group-hover:scale-125 pointer-events-none"
              style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] font-mono font-black text-white/20 uppercase tracking-widest">
            <span>{Math.floor(currentTime/60)}:{(Math.floor(currentTime%60)).toString().padStart(2,'0')}</span>
            <span>{Math.floor(duration/60)}:{(Math.floor(duration%60)).toString().padStart(2,'0')}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 md:gap-10 w-full mb-6">
          <button className="text-white/20 hover:text-white transition-all"><Shuffle size={18} /></button>
          <button className="text-white/40 hover:text-white transition-all"><SkipBack size={24} fill="currentColor" /></button>
          <button 
            onClick={() => {
              if (directAudio.current) {
                if (isPlaying) {
                  directAudio.current.pause();
                  setIsPlaying(false);
                } else {
                  directAudio.current.play().catch(e => console.log("Play error", e));
                  setIsPlaying(true);
                }
              }
            }} 
            className="w-16 h-16 rounded-full bg-[#c8f564] text-black flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all"
          >
            {isPlaying ? <Pause size={22} fill="black" /> : <Play size={22} fill="black" className="ml-0.5" />}
          </button>
          <button className="text-white/40 hover:text-white transition-all"><SkipForward size={24} fill="currentColor" /></button>
          <button className="text-white/20 hover:text-white transition-all"><Repeat size={18} /></button>
        </div>

        <button 
          onClick={() => {
            if (directAudio.current) {
              directAudio.current.pause();
            }
            setIsPlaying(false);
            
            setSelectedLibraryTrack(activeTrack);
            setVocalsUrl('');
            setInstrumentalUrl('');
            setView('separator');
          }}
          className="mt-8 px-8 py-4 bg-purple-600/10 border border-purple-500/30 hover:bg-purple-600 hover:text-white text-purple-300 font-black text-[9px] tracking-[0.25em] uppercase rounded-xl transition-all active:scale-95 shadow-[0_0_35px_rgba(147,51,234,0.15)] flex items-center gap-2"
        >
          <Mic size={12} />
          Isolate Vocals (AI Split)
        </button>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080810] text-[#f0eef8] font-sans flex flex-col selection:bg-[#c8f564] selection:text-black">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;600;900&display=swap');
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin 20s linear infinite; }
        @keyframes spin-slow-reverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        .orb-glow { filter: blur(100px); opacity: 0.5; }
        .glass-card { background: rgba(255, 255, 255, 0.02); backdrop-filter: blur(60px); -webkit-backdrop-filter: blur(60px); border: 1px solid rgba(255, 255, 255, 0.04); border-radius: 40px; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #c8f5641a; border-radius: 10px; }
        select {
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>") !important;
          background-repeat: no-repeat !important;
          background-position: right 18px center !important;
          background-size: 11px !important;
          padding-right: 44px !important;
          text-align: left !important;
          text-align-last: center !important;
        }
        select option {
          background-color: #0d0d18 !important;
          color: white !important;
          font-family: 'Outfit', sans-serif !important;
          font-weight: 600 !important;
          padding: 12px !important;
        }
      `}</style>

      {view !== 'fullPlayer' && view !== 'landing' && <Navigation />}

      {/* BACKGROUND ORBS */}
      {view === 'landing' && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute w-[500px] h-[500px] bg-purple-600/10 rounded-full orb-glow -top-40 -left-40 animate-pulse" />
          <div className="absolute w-[450px] h-[450px] bg-[#c8f564]/5 rounded-full orb-glow bottom-0 -right-40 animate-pulse" style={{ animationDelay: '2s' }} />
          <div className="absolute w-[300px] h-[300px] bg-cyan-500/5 rounded-full orb-glow top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
      )}

      {/* OLD LANDING HEADER NAV BAR */}
      {view === 'landing' && (
        <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-[6vw] py-4 md:py-5 bg-[#080810]/70 backdrop-blur-2xl border-b border-white/5">
          <div className="flex items-center gap-2 cursor-pointer flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-[#c8f564] shadow-[0_0_10px_#c8f564] animate-pulse" />
            <div className="flex flex-col">
              <span className="font-extrabold text-base md:text-xl tracking-tight leading-none text-white">SoundRip</span>
              <span className="text-[7px] md:text-[8px] font-bold text-[#c8f564] uppercase tracking-widest leading-none mt-1">by mashad</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowSettingsModal(true)} className="flex p-2 bg-white/5 border border-white/10 text-white rounded-full hover:bg-[#c8f564] hover:text-black transition-all">
              <Settings size={14} />
            </button>
            <a href="upi://pay?pa=919746717166@upi&pn=SoundRip&cu=INR" className="px-4 py-2 md:px-5 md:py-2.5 bg-[#c8f564] text-black text-[9px] md:text-[11px] font-black uppercase tracking-widest rounded-full hover:scale-105 active:scale-95 transition-all shadow-lg shadow-lime-400/20 flex items-center gap-1.5 md:gap-2">
              <Heart size={10} fill="black" />
              DONATE
            </a>
          </div>
        </nav>
      )}

      {view === 'landing' && (
        <div className="w-full flex flex-col items-center">
          {/* HERO */}
          <section className="min-h-screen flex flex-col items-center justify-center text-center px-[6vw] relative z-10 pt-24 w-full">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#c8f564]/10 border border-[#c8f564]/20 text-[#c8f564] text-[10px] font-bold uppercase tracking-[0.2em] mb-10">
              <div className="w-1.5 h-1.5 rounded-full bg-[#c8f564]" />
              No limits. Any platform. Any track.
            </div>

            {/* HERO CIRCLES */}
            <div className="flex flex-row justify-center gap-6 md:gap-10 mb-12 scale-[0.85] md:scale-100">
              <div className="flex flex-col items-center gap-3 group cursor-pointer" onClick={() => setView('downloader')}>
                <div className="w-20 h-20 md:w-[100px] md:h-[100px] rounded-full flex items-center justify-center bg-cyan-500/10 border-2 border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.15)] group-hover:scale-110 group-hover:border-cyan-500 transition-all duration-300 relative">
                  <div className="absolute inset-[-6px] rounded-full border border-dashed border-cyan-500/30 animate-spin-slow" />
                  <Download size={26} className="text-cyan-400" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 group-hover:text-cyan-400 transition-colors">Download</span>
              </div>

              <div className="flex flex-col items-center gap-3 group cursor-pointer" onClick={() => setView('separator')}>
                <div className="w-20 h-20 md:w-[100px] md:h-[100px] rounded-full flex items-center justify-center bg-purple-600/10 border-2 border-purple-600/30 shadow-[0_0_30px_rgba(147,51,234,0.15)] group-hover:scale-110 group-hover:border-purple-600 transition-all duration-300 relative">
                  <div className="absolute inset-[-6px] rounded-full border border-dashed border-purple-600/30 animate-[spin-slow-reverse_12s_linear_infinite]" />
                  <Mic size={26} className="text-purple-400" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 group-hover:text-purple-400 transition-colors">Split</span>
              </div>

              <div className="flex flex-col items-center gap-3 group cursor-pointer" onClick={() => { setSeparationModel('deep'); setView('separator'); }}>
                <div className="w-20 h-20 md:w-[100px] md:h-[100px] rounded-full flex items-center justify-center bg-lime-400/10 border-2 border-lime-400/30 shadow-[0_0_30px_rgba(163,230,53,0.15)] group-hover:scale-110 group-hover:border-lime-400 transition-all duration-300 relative">
                  <div className="absolute inset-[-6px] rounded-full border border-dashed border-lime-400/30 animate-spin-slow" />
                  <Layers size={26} className="text-[#c8f564]" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 group-hover:text-[#c8f564] transition-colors">Stems</span>
              </div>
            </div>

            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tighter leading-[1.1] max-w-3xl mb-8 uppercase">
              Music tools at your <span className="bg-gradient-to-r from-[#c8f564] to-[#7edd24] bg-clip-text text-transparent">fingertips.</span>
            </h1>

            <p className="text-gray-400 font-semibold tracking-tight max-w-xl text-xs md:text-sm mb-12 uppercase opacity-85 leading-relaxed">
              Download, split vocals & instrumentals, or extract clean stems — all from one link.
            </p>

            <div className="flex justify-center mb-16">
              <button onClick={() => setView('separator')} className="px-10 py-4 border-2 border-white/10 hover:border-[#c8f564] hover:bg-[#c8f564] hover:text-black text-white font-black uppercase tracking-widest rounded-full transition-all active:scale-95 shadow-2xl">
                Explore Tools
              </button>
            </div>
          </section>

          {/* FEATURES */}
          <section id="features" className="py-24 px-[6vw] max-w-5xl mx-auto relative z-10 w-full">
            <div className="text-center mb-20">
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] mb-4 block">What it does</span>
              <h2 className="text-2xl md:text-4xl font-black text-white tracking-tighter uppercase leading-tight">Three powerful tools.<br />One seamless app.</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
              {[
                { icon: Globe, title: "Download", body: "Paste any link from YouTube or Spotify.", tag: "Unlimited", color: "cyan" },
                { icon: Mic, title: "Splitter", body: "Remove vocals from any track instantly.", tag: "AI Power", color: "purple" },
                { icon: Layers, title: "Stems", body: "Extract clean drum, bass, and key stems.", tag: "Multitrack", color: "lime" }
              ].map((f, i) => (
                <div key={i} className={`p-5 md:p-8 bg-[#13131f]/40 backdrop-blur-xl border border-white/5 rounded-[24px] md:rounded-[32px] hover:border-white/20 transition-all group relative overflow-hidden ${i === 2 ? 'col-span-2 md:col-span-1' : ''}`}>
                  <div className="absolute top-4 right-4 md:top-6 md:right-6 text-[8px] md:text-[10px] font-bold text-white/5 uppercase">0{i + 1}</div>
                  <div className={`w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center mb-5 md:mb-8 ${f.color === 'cyan' ? 'bg-cyan-500/10 text-cyan-400' : f.color === 'purple' ? 'bg-purple-600/10 text-purple-400' : 'bg-[#c8f564]/10 text-[#c8f564]'}`}>
                    <f.icon size={20} className="md:w-[26px] md:h-[26px]" />
                  </div>
                  <h3 className="text-sm md:text-lg font-black text-white uppercase tracking-tight mb-2 md:mb-3">{f.title}</h3>
                  <p className="text-gray-500 text-[9px] md:text-[11px] leading-relaxed font-bold mb-4 md:mb-6 uppercase opacity-70">{f.body}</p>
                  <span className={`inline-block px-2.5 py-0.5 md:px-3 md:py-1 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest ${f.color === 'cyan' ? 'bg-cyan-500/10 text-cyan-400' : f.color === 'purple' ? 'bg-purple-600/10 text-purple-400' : 'bg-[#c8f564]/10 text-[#c8f564]'}`}>
                    {f.tag}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* FOOTER */}
          <footer className="py-12 px-[6vw] border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-8 relative z-10 w-full">
            <div className="flex items-center gap-2.5 font-extrabold text-lg tracking-tight uppercase text-white">
              <div className="w-2 h-2 rounded-full bg-[#c8f564]" />
              SoundRip
            </div>
            <p className="text-gray-600 text-[9px] font-bold uppercase tracking-widest">© 2025 SoundRip Studio. Built by Mashad.</p>
          </footer>
        </div>
      )}

      {view === 'downloader' && (
        <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 pt-32 animate-in slide-in-from-bottom-10">
          <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-8">
             
             {/* Rip Matrix */}
             <div className="flex-1 glass-card p-6 md:p-12 relative overflow-hidden shadow-4xl">
                <div className="relative z-10 text-center mb-10">
                   <div className="w-16 h-16 rounded-[24px] bg-[#c8f564]/10 border border-[#c8f564]/20 flex items-center justify-center text-[#c8f564] mx-auto mb-6">
                      <Globe size={28} />
                   </div>
                   <h2 className="text-2xl md:text-4xl font-black text-white uppercase tracking-tighter">Capture Hub</h2>
                </div>
                
                <div className="relative z-10 space-y-8">
                   <div className="relative group">
                     <input 
                       type="text" 
                       placeholder="PASTE SOURCE LINK..." 
                       className="w-full bg-black/40 border-2 border-white/5 rounded-[24px] pl-6 pr-32 py-6 text-xs font-black tracking-[0.2em] text-white focus:outline-none focus:border-[#c8f564] transition-all placeholder:text-gray-800 uppercase" 
                       value={downloadUrl} 
                       onChange={(e) => setDownloadUrl(e.target.value)} 
                     />
                     <div className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-700">
                       <Link size={18} />
                     </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                         <span className="text-[9px] font-black uppercase tracking-widest text-gray-600 px-3">Container</span>
                         <div className="flex gap-2 bg-black/20 p-1.5 rounded-[18px] border border-white/5">
                            {['wav', 'mp3', 'flac'].map(fmt => (
                              <button key={fmt} onClick={() => setDownloadFormat(fmt)} className={`flex-1 py-3.5 rounded-xl text-[9px] font-black transition-all uppercase ${downloadFormat === fmt ? 'bg-white text-black' : 'text-gray-500 hover:text-white'}`}>{fmt}</button>
                            ))}
                         </div>
                      </div>
                      <div className="space-y-3">
                         <span className="text-[9px] font-black uppercase tracking-widest text-gray-600 px-3">Sample Grade</span>
                         <div className="flex gap-2 bg-black/20 p-1.5 rounded-[18px] border border-white/5">
                            {['320k', 'lossless'].map(bit => (
                              <button key={bit} onClick={() => setDownloadBitrate(bit)} className={`flex-1 py-3.5 rounded-xl text-[9px] font-black transition-all uppercase ${downloadBitrate === bit ? 'bg-[#c8f564] text-black' : 'text-gray-500 hover:text-white'}`}>{bit}</button>
                            ))}
                         </div>
                      </div>
                   </div>

                   <button 
                     onClick={handleUniversalCapture} 
                     disabled={!downloadUrl || isProcessing}
                     className="w-full py-6 rounded-[24px] bg-white text-black font-black uppercase tracking-[0.5em] text-[9px] hover:bg-[#c8f564] transition-all active:scale-95 shadow-3xl disabled:opacity-20"
                   >
                     Initiate Extraction
                   </button>
                </div>
             </div>

             {/* Signal History Sidebar */}
             <div className="w-full lg:w-80 glass-card p-6 md:p-8 flex flex-col max-h-[480px]">
                <div className="flex items-center gap-3 mb-6 px-2">
                   <Clock size={16} className="text-[#c8f564]" />
                   <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Capture Log</h3>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                   {library.map((track) => (
                      <div 
                        key={track.id} 
                        onClick={() => { setActiveTrack(track); setView('fullPlayer'); }}
                        className="group flex items-center gap-4 p-3.5 rounded-xl bg-white/5 border border-white/5 hover:border-[#c8f564]/30 cursor-pointer transition-all"
                      >
                         <div className="w-10 h-10 rounded-lg overflow-hidden relative group-hover:scale-105 transition-transform flex-shrink-0">
                            <img src={track.thumbnail} className="w-full h-full object-cover opacity-60" alt="t" />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                               <Play size={14} fill="white" className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                         </div>
                         <div className="flex-1 min-w-0">
                            <h4 className="text-[10px] font-black text-white uppercase truncate break-all">{cleanSongTitle(track.title)}</h4>
                            <p className="text-[8px] font-bold text-gray-600 uppercase tracking-widest mt-1">{track.format} • {track.quality}</p>
                         </div>
                      </div>
                   ))}
                </div>
             </div>
          </div>
        </main>
      )}

      {view === 'separator' && (
        <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 pt-32 animate-in fade-in duration-500">
          {!vocalsUrl ? (
            <div className="text-center space-y-8 max-w-xl p-6 glass-card w-full py-16">
              <div className="w-20 h-20 rounded-[32px] bg-[#c8f564]/10 border border-[#c8f564]/20 flex items-center justify-center text-[#c8f564] mx-auto shadow-2xl">
                 <Dna size={40} />
              </div>
              <div className="space-y-2">
                 <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter">Signal Splitter</h2>
                 <p className="text-gray-500 font-bold uppercase tracking-[0.5em] text-[9px]">Neural Isolation active</p>
              </div>

              <div className="flex flex-col sm:flex-row justify-center gap-4 border-t border-white/5 pt-8 max-w-md mx-auto">
                 <CustomSelect 
                    value={separationModel} 
                    onChange={setSeparationModel} 
                    className="w-full sm:w-[220px]"
                    options={[
                      { value: 'fast', label: '2-Stem (Fast AI)' },
                      { value: 'deep', label: '6-Stem (HQ Deep)' }
                    ]} 
                  />
                 <label className="flex-1 py-4 px-8 bg-white text-black font-black rounded-2xl hover:bg-[#c8f564] cursor-pointer transition-all uppercase tracking-[0.4em] text-[10px] shadow-3xl text-center active:scale-95">
                   Import Audio
                   <input type="file" hidden onChange={handleFileUpload} />
                 </label>
              </div>

              {library.length > 0 && (
                <div className="space-y-4 pt-8 border-t border-white/5 max-w-md mx-auto text-left">
                  <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest block text-center">Or choose from downloaded songs</span>
                  <CustomSelect 
                    value={selectedLibraryTrack?.id || ""} 
                    onChange={(val) => {
                      const track = library.find(t => t.id === val);
                      setSelectedLibraryTrack(track || null);
                    }}
                    className="w-full"
                    options={[
                      { value: '', label: 'Select a downloaded track...' },
                      ...library.map(t => ({ value: t.id, label: cleanSongTitle(t.title) }))
                    ]}
                  />
                  {selectedLibraryTrack && (
                    <button 
                      onClick={handleLibrarySplit}
                      className="w-full py-4 bg-gradient-to-r from-[#c8f564] to-[#7edd24] hover:from-[#d2f97c] hover:to-[#8ae633] text-black font-black text-[10px] tracking-[0.3em] uppercase rounded-2xl active:scale-95 transition-all shadow-[0_0_20px_rgba(200,245,100,0.3)] animate-pulse"
                    >
                      Process & Split Track
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full max-w-4xl space-y-8">
              <div className="glass-card p-6 md:p-12 relative overflow-hidden shadow-4xl">
                <div className="flex flex-col md:flex-row items-center gap-8 mb-10 border-b border-white/5 pb-8">
                  <button 
                    onClick={() => {
                      if (musicAudio.current) {
                        if (isPlaying) {
                          musicAudio.current.pause();
                          setIsPlaying(false);
                        } else {
                          musicAudio.current.play().catch(e => console.log("Play error", e));
                          setIsPlaying(true);
                        }
                      }
                    }} 
                    className="w-16 h-16 rounded-full bg-[#c8f564] text-black flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all flex-shrink-0"
                  >
                    {isPlaying ? <Pause size={24} fill="black" /> : <Play size={24} fill="black" className="ml-0.5" />}
                  </button>
                  <div className="text-center md:text-left min-w-0 w-full">
                    <h3 className="text-xs md:text-sm font-bold text-white uppercase tracking-wider break-all leading-relaxed">{songName || 'Signal Separator'}</h3>
                    <p className="text-[#c8f564] text-[9px] font-black uppercase tracking-[0.4em] mt-1.5">Neural Topology Active • {separationModel === 'deep' ? '6-Stems' : '2-Stems'}</p>
                  </div>
                  <button onClick={() => { setVocalsUrl(''); setFile(null); }} className="text-xs font-black uppercase tracking-widest text-cyan-500 hover:text-white transition-colors">Import Another</button>
                </div>

                <div ref={waveformRef} className="mb-10 cursor-pointer opacity-80 hover:opacity-100 transition-opacity rounded-xl overflow-hidden" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-white/5 pt-10">
                  <div className="space-y-4 bg-black/20 p-5 rounded-2xl border border-white/5">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/40">
                      <span className="flex items-center gap-2 text-cyan-400"><Mic size={14} /> Isolated Vocals</span>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => {
                            if (vocalVolume === 1 && musicVolume === 0) {
                              setVocalVolume(0.8);
                              setMusicVolume(0.8);
                            } else {
                              setVocalVolume(1);
                              setMusicVolume(0);
                            }
                          }}
                          className={`px-3 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border transition-all ${vocalVolume === 1 && musicVolume === 0 ? 'bg-[#c8f564] text-black border-[#c8f564]' : 'bg-white/5 text-gray-400 border-white/10 hover:border-white/20'}`}
                        >
                          {vocalVolume === 1 && musicVolume === 0 ? 'Solo Active' : 'Solo'}
                        </button>
                        <button onClick={() => downloadBlob(vocalsUrl, 'isolated_vocals.wav')} className="text-[#c8f564] hover:scale-110 transition-transform"><Download size={16} /></button>
                      </div>
                    </div>
                    <input 
                      type="range" 
                      className="w-full h-1 bg-white/10 accent-[#c8f564] rounded-lg appearance-none cursor-pointer" 
                      min="0" 
                      max="1" 
                      step="0.01" 
                      value={vocalVolume} 
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setVocalVolume(val);
                        if (vocalAudio.current) vocalAudio.current.volume = val;
                      }} 
                    />
                  </div>
                  <div className="space-y-4 bg-black/20 p-5 rounded-2xl border border-white/5">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/40">
                      <span className="flex items-center gap-2 text-purple-400"><Music size={14} /> Isolated Instrumental</span>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => {
                            if (musicVolume === 1 && vocalVolume === 0) {
                              setVocalVolume(0.8);
                              setMusicVolume(0.8);
                            } else {
                              setMusicVolume(1);
                              setVocalVolume(0);
                            }
                          }}
                          className={`px-3 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border transition-all ${musicVolume === 1 && vocalVolume === 0 ? 'bg-[#c8f564] text-black border-[#c8f564]' : 'bg-white/5 text-gray-400 border-white/10 hover:border-white/20'}`}
                        >
                          {musicVolume === 1 && vocalVolume === 0 ? 'Solo Active' : 'Solo'}
                        </button>
                        <button onClick={() => downloadBlob(instrumentalUrl, 'isolated_instrumental.wav')} className="text-[#c8f564] hover:scale-110 transition-transform"><Download size={16} /></button>
                      </div>
                    </div>
                    <input 
                      type="range" 
                      className="w-full h-1 bg-white/10 accent-[#c8f564] rounded-lg appearance-none cursor-pointer" 
                      min="0" 
                      max="1" 
                      step="0.01" 
                      value={musicVolume} 
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setMusicVolume(val);
                        if (musicAudio.current) musicAudio.current.volume = val;
                      }} 
                    />
                  </div>
                </div>

                {separationModel === 'deep' && (
                  <div className="mt-8 border-t border-white/5 pt-8">
                     <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-6">HQ Deep Stems Mixer</h4>
                     <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                        {stemsList.map(stem => (
                           <div key={stem.id} onClick={() => stem.set(!stem.active)} className={`p-4 rounded-xl border text-center transition-all cursor-pointer select-none active:scale-95 ${stem.active ? 'bg-white text-black border-white' : 'bg-white/5 border-white/5 text-gray-500 hover:border-white/15'}`}>
                              <div className="flex justify-center mb-3">{stem.icon}</div>
                              <span className="text-[9px] font-black uppercase tracking-widest">{stem.name}</span>
                           </div>
                        ))}
                     </div>
                  </div>
                )}

                <div className="mt-10 pt-8 border-t border-white/5 flex flex-col md:flex-row gap-4 items-center justify-between">
                   <div className="flex items-center gap-3">
                      <select value={downloadFormat} onChange={e => setDownloadFormat(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black text-white uppercase focus:outline-none">
                         <option value="wav" className="bg-[#0f0f1a]">WAV</option>
                         <option value="mp3" className="bg-[#0f0f1a]">MP3</option>
                         <option value="flac" className="bg-[#0f0f1a]">FLAC</option>
                      </select>
                   </div>
                   <button onClick={separationModel === 'deep' ? handleSave : handleMixDownloader} className="w-full md:w-auto px-8 py-5 bg-white text-black font-black text-[10px] tracking-widest uppercase rounded-2xl hover:bg-[#c8f564] active:scale-95 transition-all shadow-xl">
                      Download Mixed Stem Output
                   </button>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {view === 'stealth' && (
        <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 pt-32 animate-in slide-in-from-bottom-10">
          {!vocalsUrl ? (
            <div className="text-center space-y-8 max-w-xl p-6 glass-card w-full py-16">
              <div className="w-20 h-20 rounded-[32px] bg-[#c8f564]/10 border border-[#c8f564]/20 flex items-center justify-center text-[#c8f564] mx-auto shadow-2xl animate-bounce">
                 <ShieldCheck size={40} />
              </div>
              <div className="space-y-2">
                 <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter">Stealth Matrix</h2>
                 <p className="text-gray-500 font-bold uppercase tracking-[0.5em] text-[9px]">Neural Ghost Signature Active</p>
              </div>

              <div className="flex flex-col sm:flex-row justify-center gap-4 border-t border-white/5 pt-8 max-w-md mx-auto">
                 <CustomSelect 
                    value={separationModel} 
                    onChange={setSeparationModel} 
                    className="w-full sm:w-[220px]"
                    options={[
                      { value: 'fast', label: '2-Stem (Fast AI)' },
                      { value: 'deep', label: '6-Stem (HQ Deep)' }
                    ]} 
                  />
                 <label className="flex-1 py-4 px-8 bg-white text-black font-black rounded-2xl hover:bg-[#c8f564] cursor-pointer transition-all uppercase tracking-[0.4em] text-[10px] shadow-3xl text-center active:scale-95">
                   Import Audio
                   <input type="file" hidden onChange={handleFileUpload} />
                 </label>
              </div>

              {library.length > 0 && (
                <div className="space-y-4 pt-8 border-t border-white/5 max-w-md mx-auto text-left">
                  <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest block text-center">Or choose from downloaded songs</span>
                  <CustomSelect 
                    value={selectedLibraryTrack?.id || ""} 
                    onChange={(val) => {
                      const track = library.find(t => t.id === val);
                      setSelectedLibraryTrack(track || null);
                    }}
                    className="w-full"
                    options={[
                      { value: '', label: 'Select a downloaded track...' },
                      ...library.map(t => ({ value: t.id, label: cleanSongTitle(t.title) }))
                    ]}
                  />
                  {selectedLibraryTrack && (
                    <button 
                      onClick={handleLibrarySplit}
                      className="w-full py-4 bg-gradient-to-r from-[#c8f564] to-[#7edd24] hover:from-[#d2f97c] hover:to-[#8ae633] text-black font-black text-[10px] tracking-[0.3em] uppercase rounded-2xl active:scale-95 transition-all shadow-[0_0_20px_rgba(200,245,100,0.3)] animate-pulse"
                    >
                      Process & Protect Track
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full max-w-2xl glass-card p-6 md:p-12 text-center space-y-10 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none">
                 <Shield size={120} />
              </div>
              <div className="w-16 h-16 bg-[#c8f564]/10 rounded-full flex items-center justify-center mx-auto border border-[#c8f564]/20 shadow-2xl">
                 <ShieldCheck size={32} className="text-[#c8f564]" />
              </div>
              <div className="space-y-2">
                 <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Bypass Matrix</h2>
                 <p className="text-[9px] font-black text-[#c8f564] uppercase tracking-[0.5em] mt-1.5">{songName || 'Protected Session Active'}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                {[
                  { n: 'Anti-Mono Drift', s: antiMono, v: setAntiMono, desc: 'L/R Phase Offset' },
                  { n: 'Comb Notch Mask', s: combFilter, v: setCombFilter, desc: 'Detection Inversion' },
                  { n: 'Micro-Chop Loop', s: microChop, v: setMicroChop, desc: 'Waveform Fragmenting' },
                  { n: 'Stealth Vocal Reverse', s: reverseVocals, v: setReverseVocals, desc: 'Phase Flip Vocals' }
                ].map(opt => (
                  <div key={opt.n} onClick={() => opt.v(!opt.s)} className={`p-5 rounded-2xl border transition-all cursor-pointer active:scale-95 ${opt.s ? 'border-[#c8f564]/40 bg-[#c8f564]/5 text-[#c8f564]' : 'border-white/5 bg-white/2 text-gray-500 hover:border-white/10'}`}>
                    <h4 className="text-[10px] font-black uppercase tracking-widest mb-1">{opt.n}</h4>
                    <p className="text-[8px] font-bold opacity-30 uppercase tracking-widest">{opt.desc}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-6 pt-6 border-t border-white/5 text-left">
                 <div className="space-y-3">
                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest"><span className="text-gray-500">Bypass Pitch</span><span className="text-[#c8f564]">+{semitones}st</span></div>
                    <input type="range" className="w-full" min="-3" max="3" value={semitones} onChange={e => setSemitones(parseInt(e.target.value))} />
                 </div>
                 <div className="space-y-3">
                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest"><span className="text-gray-500">Bypass Speed</span><span className="text-[#c8f564]">{speed}x</span></div>
                    <input type="range" className="w-full" min="0.8" max="1.2" step="0.01" value={speed} onChange={e => setSpeed(parseFloat(e.target.value))} />
                 </div>
              </div>

              {/* STEALTH DOWNLOAD & CONTROLS */}
              <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row gap-4 items-center justify-between">
                 <div className="flex items-center gap-3">
                    <select value={downloadFormat} onChange={e => setDownloadFormat(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black text-white uppercase focus:outline-none">
                       <option value="wav" className="bg-[#0f0f1a]">WAV</option>
                       <option value="mp3" className="bg-[#0f0f1a]">MP3</option>
                       <option value="flac" className="bg-[#0f0f1a]">FLAC</option>
                    </select>
                 </div>
                 <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <button onClick={() => { setVocalsUrl(''); setFile(null); }} className="px-6 py-4 border border-white/10 hover:border-white/20 text-white font-black text-[10px] tracking-widest uppercase rounded-2xl transition-all">
                       Import Another
                    </button>
                    <button onClick={separationModel === 'deep' ? handleSave : handleMixDownloader} className="px-8 py-4 bg-white text-black font-black text-[10px] tracking-widest uppercase rounded-2xl hover:bg-[#c8f564] active:scale-95 transition-all shadow-xl">
                       Download Protected Output
                    </button>
                 </div>
              </div>
            </div>
          )}
        </main>
      )}

      {view === 'fullPlayer' && <FullScreenPlayer />}

      {/* Ripping Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-[#020204]/98 backdrop-blur-[80px] z-[3000] flex items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="w-full max-w-md space-y-10 text-center">
              <div className="relative mx-auto w-24 h-24">
                  <div className="absolute inset-0 rounded-full border-4 border-white/5 border-t-[#c8f564] animate-spin shadow-[0_0_30px_rgba(200,245,100,0.2)]" />
                  <div className="absolute inset-3 rounded-full border-4 border-white/5 border-b-cyan-400 animate-[spin_1.2s_linear_infinite_reverse]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                     <Cpu size={24} className="text-white opacity-20" />
                  </div>
              </div>
              <div className="space-y-6">
                 <div className="flex justify-between text-[10px] font-mono font-black uppercase tracking-[0.4em] text-[#c8f564] px-2">
                    <span className="animate-pulse">{processingStage}</span>
                    <span className="text-white">{uploadProgress}%</span>
                 </div>
                 <div className="h-3.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-1">
                    <div className="h-full bg-gradient-to-r from-[#c8f564] to-cyan-500 rounded-full transition-all duration-300 shadow-[0_0_20px_rgba(200,245,100,0.4)]" style={{ width: `${uploadProgress}%` }} />
                 </div>
                 <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.6em] mb-4">Establishing virtual pipeline</p>
                 <div className="pt-6">
                    <button 
                      onClick={cancelProcessing}
                      className="px-8 py-3 bg-white/5 border border-white/10 text-white hover:bg-white hover:text-black hover:border-white text-[10px] font-black tracking-widest uppercase rounded-2xl active:scale-95 transition-all shadow-md"
                    >
                      Cancel & Go Back
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-[#020204]/95 backdrop-blur-[50px] z-[4000] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="w-full max-w-lg glass-card p-6 md:p-10 space-y-6 relative overflow-hidden shadow-[0_30px_100px_rgba(0,0,0,0.8)] border border-white/10 rounded-[35px] text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="text-[#c8f564]" size={20} />
                <h3 className="font-extrabold text-base md:text-xl tracking-tight text-white uppercase">Studio Settings</h3>
              </div>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-red-500 hover:border-red-500 transition-all animate-in fade-in"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#c8f564]">YouTube Session Cookies</label>
                  {sessionCookies && (
                    <span className="text-[8px] font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20 uppercase tracking-widest animate-pulse">Active</span>
                  )}
                </div>
                <textarea
                  value={sessionCookies}
                  onChange={(e) => setSessionCookies(e.target.value)}
                  placeholder="# Netscape HTTP Cookie File&#10;# Exported from YouTube..."
                  className="w-full h-48 bg-[#080810]/70 border border-white/10 hover:border-white/20 focus:border-[#c8f564] focus:outline-none rounded-2xl p-4 text-[10px] font-mono text-white/80 transition-all resize-none"
                />
                <p className="text-[8px] font-bold text-white/35 uppercase tracking-wide leading-relaxed">
                  💡 export your youtube cookies in netscape format using a browser extension like <span className="text-[#c8f564] font-black">"Get cookies.txt LOCALLY"</span>. paste the raw text here to bypass all youtube bot limits instantly.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5 flex gap-3">
              {sessionCookies && (
                <button
                  onClick={() => {
                    setSessionCookies('');
                    localStorage.removeItem('soundrip_cookies');
                  }}
                  className="px-5 py-3 border border-red-500/30 hover:border-red-500 text-red-400 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95"
                >
                  Clear Cookies
                </button>
              )}
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="flex-1 py-3 bg-[#c8f564] text-black hover:bg-white text-[9px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 text-center font-bold"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;