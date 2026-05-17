import React, { useState, useRef, useEffect } from 'react';
import WaveSurfer from 'wavesurfer.js';
import {
  Mic, Music, Play, Pause, Download, Upload, Settings, Sparkles,
  Volume2, Waves, Zap, ShieldCheck, RefreshCw, Scissors, Split,
  Layers, VolumeX, Maximize2, Trash2, ChevronRight, Activity,
  Cpu, BarChart3, Dna, Plus, Disc, FileAudio, Guitar, Piano, Shield, Globe, Link, Check, Heart
} from 'lucide-react';
import './App.css';

// Specialized WAV Encoder
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

const App = () => {
  // Navigation
  const [view, setView] = useState('landing'); // 'landing', 'separator', 'stealth', 'downloader'

  // Core States
  const [file, setFile] = useState(null);
  const [introFile, setIntroFile] = useState(null);
  const [vocalsUrl, setVocalsUrl] = useState('');
  const [instrumentalUrl, setInstrumentalUrl] = useState('');
  const [bassUrl, setBassUrl] = useState('');
  const [drumsUrl, setDrumsUrl] = useState('');
  const [otherUrl, setOtherUrl] = useState('');
  const [guitarUrl, setGuitarUrl] = useState('');
  const [pianoUrl, setPianoUrl] = useState('');

  const [activeStemId, setActiveStemId] = useState('vocals');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [songName, setSongName] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadFormat, setDownloadFormat] = useState('wav'); // 'wav', 'mp3', 'flac'
  const [downloadBitrate, setDownloadBitrate] = useState('320k');
  const [exportFormat, setExportFormat] = useState('wav');
  const [exportBitrate, setExportBitrate] = useState('320k');
  const [skipSeparation, setSkipSeparation] = useState(false);
  const [directAudioUrl, setDirectAudioUrl] = useState('');
  const [directSongName, setDirectSongName] = useState('');
  const [directThumbnail, setDirectThumbnail] = useState('');
  const [directDuration, setDirectDuration] = useState(0);
  const [directCurrentTime, setDirectCurrentTime] = useState(0);
  const [isDirectPlaying, setIsDirectPlaying] = useState(false);
  const directWaveformRef = useRef(null);
  const directWavesurfer = useRef(null);
  const directAudio = useRef(null);

  // Real-time Mixer States
  const [musicVolume, setMusicVolume] = useState(0.8);
  const [vocalVolume, setVocalVolume] = useState(0.8);
  const musicAudio = useRef(null);
  const vocalAudio = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Trim States
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  // Bypass Controls
  const [speed, setSpeed] = useState(1.04);
  const [semitones, setSemitones] = useState(2);
  const [noiseFloor, setNoiseFloor] = useState(true);
  const [filterBypass, setFilterBypass] = useState(true);
  const [reverseVocals, setReverseVocals] = useState(false);
  const [combFilter, setCombFilter] = useState(false);
  const [microChop, setMicroChop] = useState(false);
  const [antiMono, setAntiMono] = useState(false);
  const [includeDecoy, setIncludeDecoy] = useState(false);
  const [separationModel, setSeparationModel] = useState('fast');

  // Stem Mixer
  const [includeVocals, setIncludeVocals] = useState(false);
  const [includeBass, setIncludeBass] = useState(true);
  const [includeDrums, setIncludeDrums] = useState(true);
  const [includeOther, setIncludeOther] = useState(true);
  const [includeGuitar, setIncludeGuitar] = useState(true);
  const [includePiano, setIncludePiano] = useState(true);

  const waveformRef = useRef(null);
  const wavesurfer = useRef(null);

  useEffect(() => {
    if (!waveformRef.current) return;
    wavesurfer.current = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: 'rgba(0, 240, 255, 0.1)',
      progressColor: '#00f0ff',
      barWidth: 3,
      barRadius: 3,
      height: 120,
      normalize: true
    });
    wavesurfer.current.on('play', () => setIsPlaying(true));
    wavesurfer.current.on('pause', () => setIsPlaying(false));
    wavesurfer.current.on('interaction', (newTime) => {
      if (musicAudio.current) musicAudio.current.currentTime = newTime;
      if (vocalAudio.current) vocalAudio.current.currentTime = newTime;
    });
    return () => { if (wavesurfer.current) wavesurfer.current.destroy(); };
  }, [vocalsUrl]);

  useEffect(() => {
    if (!directWaveformRef.current || !directAudioUrl) return;
    if (directWavesurfer.current) directWavesurfer.current.destroy();

    directWavesurfer.current = WaveSurfer.create({
      container: directWaveformRef.current,
      waveColor: 'rgba(255, 255, 255, 0.05)',
      progressColor: '#00f0ff',
      barWidth: 2,
      barGap: 3,
      height: 80,
      normalize: true,
      cursorWidth: 0
    });

    directWavesurfer.current.load(directAudioUrl);
    directAudio.current = new Audio(directAudioUrl);

    directWavesurfer.current.on('play', () => setIsDirectPlaying(true));
    directWavesurfer.current.on('pause', () => setIsDirectPlaying(false));
    directWavesurfer.current.on('ready', () => setDirectDuration(directWavesurfer.current.getDuration()));
    directWavesurfer.current.on('audioprocess', () => setDirectCurrentTime(directWavesurfer.current.getCurrentTime()));
    directWavesurfer.current.on('interaction', (newTime) => {
      if (directAudio.current) directAudio.current.currentTime = newTime * directWavesurfer.current.getDuration();
      setDirectCurrentTime(newTime * directWavesurfer.current.getDuration());
    });

    return () => { if (directWavesurfer.current) directWavesurfer.current.destroy(); };
  }, [directAudioUrl]);

  const handleFileUpload = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setSongName(f.name);
    setIsProcessing(true);
    setUploadProgress(0);
    setProcessingStage('INITIALIZING DATA...');

    const formData = new FormData();
    formData.append('audio', f);
    formData.append('model', separationModel);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'http://localhost:3001/api/separate-vocals', true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
        if (percent < 100) {
          setProcessingStage(`UPLOADING: ${percent}%`);
        } else {
          setProcessingStage(`AI ANALYZING SIGNAL...`);
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        finishProcessing(data);
      } else {
        setProcessingStage('ERROR: FAILED');
        alert('Separation failed: Server Error');
        setIsProcessing(false);
      }
    };

    xhr.onerror = () => {
      alert('Separation failed: Network Error');
      setIsProcessing(false);
    };

    xhr.send(formData);
  };

  const handleUrlSubmit = async (mode = 'process') => {
    if (!downloadUrl) return;
    setIsProcessing(true);
    setUploadProgress(10);
    setProcessingStage('FETCHING FROM URL...');

    const isDirect = mode === 'direct';

    try {
      const response = await fetch('http://localhost:3001/api/download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: downloadUrl,
          format: downloadFormat,
          bitrate: downloadBitrate,
          skipSeparation: isDirect
        })
      });
      const dlData = await response.json();
      if (!dlData.success) throw new Error(dlData.error || 'Download failed');

      if (isDirect) {
        setProcessingStage('SUCCESS: STARTING DOWNLOAD');
        setUploadProgress(100);

        setDirectAudioUrl(dlData.directUrl);
        setDirectSongName(dlData.fileName);
        setDirectThumbnail(dlData.thumbnail);

        // REVERTED TO FAST DIRECT DOWNLOAD METHOD
        const a = document.createElement('a');
        a.href = dlData.directUrl;
        a.download = dlData.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => {
          setIsProcessing(false);
          if (directWavesurfer.current) directWavesurfer.current.play();
          if (directAudio.current) directAudio.current.play();
        }, 800);
        return;
      }

      setDownloadUrl('');
      setUploadProgress(50);
      setProcessingStage('NEURAL SIGNAL SEPARATION (EST. 2 MIN)...');

      const crawlInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 95) {
            clearInterval(crawlInterval);
            return 95;
          }
          return prev + 0.5;
        });
      }, 2000);

      setSongName(dlData.fileName);

      const sepResponse = await fetch('http://localhost:3001/api/separate-vocals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: dlData.filePath,
          fileName: dlData.fileName,
          model: separationModel
        })
      });
      const data = await sepResponse.json();
      clearInterval(crawlInterval);
      finishProcessing(data);
    } catch (err) {
      alert('Failed: ' + (err.message || 'Unknown Error'));
      setIsProcessing(false);
    }
  };

  const finishProcessing = (data) => {
    setVocalsUrl(data.vocalsUrl);
    setInstrumentalUrl(data.instrumentalUrl);
    setBassUrl(data.bassUrl);
    setDrumsUrl(data.drumsUrl);
    setOtherUrl(data.otherUrl);
    if (data.guitarUrl) setGuitarUrl(data.guitarUrl);
    if (data.pianoUrl) setPianoUrl(data.pianoUrl);

    musicAudio.current = new Audio(data.instrumentalUrl);
    vocalAudio.current = new Audio(data.vocalsUrl);
    musicAudio.current.volume = musicVolume;
    vocalAudio.current.volume = vocalVolume;

    musicAudio.current.addEventListener('timeupdate', () => {
      setCurrentTime(musicAudio.current.currentTime);
    });
    musicAudio.current.addEventListener('loadedmetadata', () => {
      setDuration(musicAudio.current.duration);
      setTrimEnd(musicAudio.current.duration);
    });

    if (wavesurfer.current) wavesurfer.current.load(data.instrumentalUrl);
    setProcessingStage('SIGNAL READY');
    setUploadProgress(100);
    setTimeout(() => {
      setIsProcessing(false);
      setView('separator');
    }, 1500);
  };

  const downloadRawStem = async (url, type) => {
    if (!url) return;
    try {
      if (exportFormat === 'wav') {
        const response = await fetch(url);
        const blob = await response.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `raw_${type}.wav`;
        a.click();
      } else {
        setProcessingStage(`CONVERTING ${type.toUpperCase()} TO ${exportFormat.toUpperCase()}...`);
        setIsProcessing(true);
        const relativePath = url.replace('http://localhost:3001/files/', '');
        const convRes = await fetch('http://localhost:3001/api/convert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: relativePath,
            targetFormat: exportFormat,
            bitrate: exportBitrate
          })
        });
        const convData = await convRes.json();
        if (!convData.success) throw new Error(convData.error);
        const a = document.createElement('a');
        a.href = convData.url;
        a.download = convData.fileName;
        a.click();
        setProcessingStage('SUCCESS');
        setTimeout(() => setIsProcessing(false), 1500);
      }
    } catch (e) {
      console.error(e);
      alert('Download/Conversion failed');
      setIsProcessing(false);
    }
  };

  const togglePlayback = () => {
    if (!musicAudio.current || !vocalAudio.current) return;
    if (isPlaying) {
      musicAudio.current.pause();
      vocalAudio.current.pause();
      if (wavesurfer.current) wavesurfer.current.pause();
      setIsPlaying(false);
    } else {
      vocalAudio.current.currentTime = musicAudio.current.currentTime;
      musicAudio.current.play();
      vocalAudio.current.play();
      if (wavesurfer.current) wavesurfer.current.play();
      setIsPlaying(true);
    }
  };

  const skipAudio = (seconds) => {
    if (!musicAudio.current || !vocalAudio.current) return;
    const newTime = Math.max(0, musicAudio.current.currentTime + seconds);
    musicAudio.current.currentTime = newTime;
    vocalAudio.current.currentTime = newTime;
    if (wavesurfer.current) wavesurfer.current.setTime(newTime);
  };

  useEffect(() => {
    if (musicAudio.current) musicAudio.current.volume = musicVolume;
    if (vocalAudio.current) vocalAudio.current.volume = vocalVolume;
  }, [musicVolume, vocalVolume]);

  const handleSaveSimple = async () => {
    if (!vocalsUrl || !instrumentalUrl) return alert("Upload a song first!");
    setIsProcessing(true);
    setProcessingStage('Generating Export...');
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const vBuf = await audioCtx.decodeAudioData(await (await fetch(vocalsUrl)).arrayBuffer());
      const mBuf = await audioCtx.decodeAudioData(await (await fetch(instrumentalUrl)).arrayBuffer());

      const startOffset = trimStart;
      const endOffset = trimEnd;
      const lengthInSeconds = endOffset - startOffset;
      const offlineCtx = new OfflineAudioContext(2, lengthInSeconds * 44100, 44100);

      const vS = offlineCtx.createBufferSource(); vS.buffer = vBuf;
      const mS = offlineCtx.createBufferSource(); mS.buffer = mBuf;

      vS.detune.value = semitones * 100;
      mS.detune.value = semitones * 100;

      const vG = offlineCtx.createGain(); vG.gain.value = vocalVolume;
      const mG = offlineCtx.createGain(); mG.gain.value = musicVolume;

      vS.connect(vG); vG.connect(offlineCtx.destination);
      mS.connect(mG); mG.connect(offlineCtx.destination);

      vS.start(0, startOffset, lengthInSeconds);
      mS.start(0, startOffset, lengthInSeconds);

      const renderedBuffer = await offlineCtx.startRendering();

      const wavBlob = audioBufferToWav(renderedBuffer);

      if (exportFormat === 'wav') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(wavBlob);
        a.download = `separated_audio.wav`;
        a.click();
        setIsProcessing(false);
      } else {
        setProcessingStage(`CONVERTING TO ${exportFormat.toUpperCase()}...`);
        const formData = new FormData();
        formData.append('audio', wavBlob, 'temp.wav');

        const uploadRes = await fetch('http://localhost:3001/api/upload', {
          method: 'POST',
          body: formData
        });
        const uploadData = await uploadRes.json();

        const convRes = await fetch('http://localhost:3001/api/convert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: uploadData.filePath,
            targetFormat: exportFormat,
            bitrate: exportBitrate
          })
        });
        const convData = await convRes.json();

        const a = document.createElement('a');
        a.href = convData.url;
        a.download = convData.fileName;
        a.click();
        setProcessingStage('SUCCESS: FILE EXPORTED');
        setTimeout(() => setIsProcessing(false), 2000);
      }
    } catch (e) { alert(e.message); setIsProcessing(false); }
  };

  const handleSave = async () => {
    if (!vocalsUrl || !bassUrl || !drumsUrl || !otherUrl) return alert("Upload a song first!");
    setIsProcessing(true);
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      setProcessingStage('DECODING NEURAL DATA...');
      const vBuf = await audioCtx.decodeAudioData(await (await fetch(vocalsUrl)).arrayBuffer());
      const bBuf = await audioCtx.decodeAudioData(await (await fetch(bassUrl)).arrayBuffer());
      const dBuf = await audioCtx.decodeAudioData(await (await fetch(drumsUrl)).arrayBuffer());
      const oBuf = await audioCtx.decodeAudioData(await (await fetch(otherUrl)).arrayBuffer());
      let gBuf = null; let pBuf = null;
      if (guitarUrl) gBuf = await audioCtx.decodeAudioData(await (await fetch(guitarUrl)).arrayBuffer());
      if (pianoUrl) pBuf = await audioCtx.decodeAudioData(await (await fetch(pianoUrl)).arrayBuffer());
      let introBuf = null;
      if (introFile) introBuf = await audioCtx.decodeAudioData(await introFile.arrayBuffer());

      setProcessingStage('APPLYING STEALTH BYPASS...');
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

      setProcessingStage('RENDERING BYPASS V4...');
      const totalLen = (introBuf ? introBuf.duration : 0) + (vBuf.duration / speed);
      const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalLen * 44100), 44100);
      let offset = 0;
      if (introBuf) {
        const iS = offlineCtx.createBufferSource(); iS.buffer = introBuf;
        iS.connect(offlineCtx.destination); iS.start(0);
        offset = introBuf.duration;
      }

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
      sources.forEach(s => s.start(offset));

      const rendered = await offlineCtx.startRendering();
      const blob = audioBufferToWav(rendered);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `M_CORE_BYPASS_${Date.now()}.wav`;
      a.click();
      setProcessingStage('SUCCESS: FILE EXPORTED');
      setTimeout(() => setIsProcessing(false), 2000);
    } catch (e) { alert('Error: ' + e.message); setIsProcessing(false); }
  };

  const stems = [
    { id: 'vocals', name: 'Vocals', icon: <Mic size={18} />, color: '#00f0ff', active: includeVocals, set: setIncludeVocals, url: vocalsUrl },
    { id: 'bass', name: 'Bass', icon: <Waves size={18} />, color: '#7000ff', active: includeBass, set: setIncludeBass, url: bassUrl },
    { id: 'drums', name: 'Drums', icon: <Music size={18} />, color: '#ff007f', active: includeDrums, set: setIncludeDrums, url: drumsUrl },
    { id: 'other', name: 'Other', icon: <Layers size={18} />, color: '#00ffaa', active: includeOther, set: setIncludeOther, url: otherUrl },
    { id: 'guitar', name: 'Guitar', icon: <Guitar size={18} />, color: '#ffd700', active: includeGuitar, set: setIncludeGuitar, url: guitarUrl },
    { id: 'piano', name: 'Piano', icon: <Piano size={18} />, color: '#ffffff', active: includePiano, set: setIncludePiano, url: pianoUrl },
  ];

  const currentStem = stems.find(s => s.id === activeStemId) || stems[0];

  const SpectralHeart = ({ isPlaying, color }) => (
    <div className="relative w-48 h-48 md:w-64 md:h-64 flex items-center justify-center">
      <div className={`absolute inset-0 border-2 rounded-full border-dashed opacity-10 ${isPlaying ? 'animate-spin-slow' : ''}`} style={{ borderColor: color }} />
      <div className="absolute inset-4 border border-white/5 rounded-full" />
      <div className="flex items-center justify-center gap-1.5 h-32">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className={`w-1 md:w-1.5 rounded-full transition-all duration-300 ${isPlaying ? 'animate-pulse-fast' : ''}`}
            style={{
              height: isPlaying ? `${40 + (i % 5) * 10}%` : '10%',
              background: `linear-gradient(to bottom, ${color}, transparent)`,
              boxShadow: isPlaying ? `0 0 15px ${color}40` : 'none',
              animationDelay: `${i * 0.05}s`
            }} />
        ))}
      </div>
    </div>
  );

  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-[#080810] text-[#f0eef8] font-sans overflow-x-hidden relative">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Outfit:wght@300;600;900&display=swap');
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #080810; }
          .app-layout { font-family: 'Outfit', sans-serif; }
          .orb-glow { filter: blur(100px); opacity: 0.5; }
          @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes spin-slow-reverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        `}</style>

        {/* BACKGROUND ORBS */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute w-[500px] h-[500px] bg-purple-600/20 rounded-full orb-glow -top-40 -left-40 animate-pulse" />
          <div className="absolute w-[450px] h-[450px] bg-lime-400/10 rounded-full orb-glow bottom-0 -right-40 animate-pulse" style={{ animationDelay: '2s' }} />
          <div className="absolute w-[300px] h-[300px] bg-pink-500/10 rounded-full orb-glow top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>

        {/* NAV */}
        <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-[6vw] py-5 bg-[#080810]/70 backdrop-blur-2xl border-b border-white/5">
          <div className="flex items-center gap-2.5 font-extrabold text-xl tracking-tight">
            <div className="w-2 h-2 rounded-full bg-[#c8f564] shadow-[0_0_10px_#c8f564] animate-pulse" />
            SoundRip
          </div>
          <a href="upi://pay?pa=919746717166@upi&pn=SoundRip&cu=INR" className="px-5 py-2.5 bg-[#c8f564] text-black text-[11px] font-black uppercase tracking-widest rounded-full hover:scale-105 active:scale-95 transition-all shadow-lg shadow-lime-400/20 flex items-center gap-2">
            <Heart size={12} fill="black" />
            DONATE
          </a>
        </nav>

        {/* HERO */}
        <section className="min-h-screen flex flex-col items-center justify-center text-center px-[6vw] relative z-10 pt-20">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#c8f564]/10 border border-[#c8f564]/20 text-[#c8f564] text-[10px] font-bold uppercase tracking-[0.2em] mb-10">
            <div className="w-1.5 h-1.5 rounded-full bg-[#c8f564]" />
            No limits. Any platform. Any track.
          </div>

          {/* HERO CIRCLES */}
          <div className="flex flex-row justify-center gap-4 md:gap-10 mb-12 scale-[0.85] md:scale-100">
            <div className="flex flex-col items-center gap-3 group cursor-pointer" onClick={() => setView('downloader')}>
              <div className="w-20 h-20 md:w-[100px] md:h-[100px] rounded-full flex items-center justify-center bg-cyan-500/10 border-2 border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.15)] group-hover:scale-110 group-hover:border-cyan-500 transition-all duration-300 relative">
                <div className="absolute inset-[-6px] rounded-full border border-dashed border-cyan-500/30 animate-[spin-slow_12s_linear_infinite]" />
                <Download size={30} className="text-cyan-400" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 group-hover:text-cyan-400 transition-colors">Download</span>
            </div>

            <div className="flex flex-col items-center gap-3 group cursor-pointer" onClick={() => setView('separator')}>
              <div className="w-20 h-20 md:w-[100px] md:h-[100px] rounded-full flex items-center justify-center bg-purple-600/10 border-2 border-purple-600/30 shadow-[0_0_30px_rgba(147,51,234,0.15)] group-hover:scale-110 group-hover:border-purple-600 transition-all duration-300 relative">
                <div className="absolute inset-[-6px] rounded-full border border-dashed border-purple-600/30 animate-[spin-slow-reverse_12s_linear_infinite]" />
                <Mic size={30} className="text-purple-400" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 group-hover:text-purple-400 transition-colors">Split</span>
            </div>

            <div className="flex flex-col items-center gap-3 group cursor-pointer" onClick={() => setView('separator')}>
              <div className="w-20 h-20 md:w-[100px] md:h-[100px] rounded-full flex items-center justify-center bg-lime-400/10 border-2 border-lime-400/30 shadow-[0_0_30px_rgba(163,230,53,0.15)] group-hover:scale-110 group-hover:border-lime-400 transition-all duration-300 relative">
                <div className="absolute inset-[-6px] rounded-full border border-dashed border-lime-400/30 animate-[spin-slow_12s_linear_infinite]" />
                <Layers size={30} className="text-lime-400" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 group-hover:text-lime-400 transition-colors">Stems</span>
            </div>
          </div>

          <h1 className="text-3xl md:text-5xl font-black text-white tracking-tighter leading-[1.1] max-w-3xl mb-8 uppercase">
            Music tools at your <span className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent italic">fingertips.</span>
          </h1>

          <p className="text-gray-400 font-medium tracking-tight max-w-xl text-xs md:text-base mb-12 uppercase opacity-80">
            Download, split vocals & instrumentals, or extract clean stems — all from one link.
          </p>

          <div className="flex justify-center mb-16">
            <button onClick={() => setView('separator')} className="px-10 py-4 border-2 border-white/10 hover:border-[#c8f564] hover:bg-[#c8f564] hover:text-black text-white font-black uppercase tracking-widest rounded-full transition-all active:scale-95 shadow-2xl">
              Explore Tools
            </button>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="py-32 px-[6vw] max-w-5xl mx-auto relative z-10">
          <div className="text-center mb-24">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] mb-4 block">What it does</span>
            <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter uppercase">Three powerful tools.<br />One seamless app.</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Globe, title: "Download", body: "Paste any link from YouTube or Spotify.", tag: "Unlimited", color: "cyan" },
              { icon: Mic, title: "Splitter", body: "Remove vocals from any track instantly.", tag: "AI Power", color: "purple" },
              { icon: Layers, title: "Stems", body: "Extract clean drum, bass, and key stems.", tag: "Multitrack", color: "lime" }
            ].map((f, i) => (
              <div key={i} className="p-8 bg-[#13131f] border border-white/5 rounded-[32px] hover:border-white/20 transition-all group relative overflow-hidden">
                <div className="absolute top-6 right-6 text-[10px] font-bold text-white/5 uppercase">0{i + 1}</div>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 ${f.color === 'cyan' ? 'bg-cyan-500/10 text-cyan-400' : f.color === 'purple' ? 'bg-purple-600/10 text-purple-400' : 'bg-lime-400/10 text-lime-400'}`}>
                  <f.icon size={28} />
                </div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight mb-3">{f.title}</h3>
                <p className="text-gray-500 text-[11px] leading-relaxed font-medium mb-6 uppercase opacity-70">{f.body}</p>
                <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${f.color === 'cyan' ? 'bg-cyan-500/10 text-cyan-400' : f.color === 'purple' ? 'bg-purple-600/10 text-purple-400' : 'bg-lime-400/10 text-lime-400'}`}>
                  {f.tag}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* FOOTER */}
        <footer className="py-16 px-[6vw] border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
          <div className="flex items-center gap-2.5 font-extrabold text-lg tracking-tight uppercase">
            <div className="w-2 h-2 rounded-full bg-[#c8f564]" />
            SoundRip
          </div>
          <p className="text-gray-600 text-[10px] font-bold uppercase tracking-widest">© 2025 SoundRip Studio. Built by Mashad.</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="app-layout min-h-screen flex flex-col md:flex-row bg-[#020204] text-gray-400 font-sans">
      <style>{`
        .mono { font-family: 'JetBrains Mono', monospace; }
        .side-nav { width: 100%; height: 64px; position: fixed; bottom: 0; left: 0; z-index: 100; border-top: 1px solid rgba(255,255,255,0.03); background: #050507; }
        @media (min-width: 768px) { .side-nav { width: 72px; height: 100vh; position: relative; border-top: 0; border-right: 1px solid rgba(255,255,255,0.03); } }
        .main-stage { flex: 1; display: flex; flex-direction: column; min-height: 0; }
        .data-panel { width: 100%; border-top: 1px solid rgba(255,255,255,0.03); background: #050507; overflow-y: auto; }
        @media (min-width: 768px) { .data-panel { width: 340px; border-top: 0; border-left: 1px solid rgba(255,255,255,0.03); } }
        .player-card { background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%); backdrop-filter: blur(20px); box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
        .vinyl-record { border-radius: 50%; border: 4px solid rgba(255,255,255,0.1); box-shadow: 0 0 20px rgba(0,0,0,0.5); }
        .full-screen-player { position: fixed; inset: 0; z-index: 1000; background: #000; display: flex; flex-direction: column; padding: 40px 20px; overflow: hidden; }
        @media (max-width: 768px) { .mobile-compact { padding: 16px 20px !important; font-size: 12px !important; } }
      `}</style>

      <aside className="side-nav flex md:flex-col items-center justify-around md:py-8 md:gap-8 shadow-2xl">
        <div onClick={() => setView('landing')} className="hidden md:flex w-10 h-10 rounded-xl bg-[#c8f564] items-center justify-center text-black shadow-[0_0_20px_rgba(200,245,100,0.4)] cursor-pointer hover:scale-105 transition-all">
          <Music size={24} />
        </div>
        <div className="flex md:flex-col gap-4 md:gap-6 flex-1 md:mt-8 text-gray-600 items-center justify-center">
          <button onClick={() => setView('separator')} className={`p-3 rounded-xl transition-all ${view === 'separator' ? 'text-cyan-400 bg-cyan-400/10 shadow-inner' : 'hover:text-white'}`}>
            <Split size={22} />
          </button>
          <button onClick={() => setView('downloader')} className={`p-3 rounded-xl transition-all ${view === 'downloader' ? 'text-cyan-400 bg-cyan-400/10 shadow-inner' : 'hover:text-white'}`}>
            <Globe size={22} />
          </button>
          <button onClick={() => setView('stealth')} className={`p-3 rounded-xl transition-all ${view === 'stealth' ? 'text-cyan-400 bg-cyan-400/10 shadow-inner' : 'hover:text-white'}`}>
            <Shield size={22} />
          </button>
        </div>
        <button className="hidden md:block p-3 rounded-xl hover:text-white transition-colors mb-4"><Settings size={22} /></button>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden pb-16 md:pb-0">
        {view === 'separator' ? (
          <main className="main-stage overflow-y-auto bg-[#020204]">
            <header className="px-6 md:px-12 py-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-white/5">
              <div>
                <h1 className="text-xl font-black text-white uppercase tracking-tight">SOUNDRIP REMOVER</h1>
                <p className="text-[10px] mono text-cyan-500 mt-1 uppercase font-black">Professional Isolation Engine</p>
              </div>
              <label className="w-full md:w-auto px-8 py-4 rounded-2xl text-[10px] font-black tracking-widest flex items-center justify-center gap-3 cursor-pointer bg-cyan-500 text-black hover:bg-white shadow-[0_0_25px_rgba(0,240,255,0.4)] transition-all active:scale-95">
                <Upload size={16} /> IMPORT SIGNAL
                <input type="file" hidden onChange={handleFileUpload} />
              </label>
            </header>

            <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12">
              {!vocalsUrl ? (
                <div className="text-center max-w-lg space-y-10 group">
                  <div className="relative inline-block">
                    <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full scale-150 group-hover:scale-[2] transition-transform duration-1000" />
                    <div className="w-32 h-32 rounded-[40px] border border-white/10 flex items-center justify-center relative z-10 bg-black/40 backdrop-blur-xl mx-auto shadow-2xl transition-all group-hover:border-cyan-500/50">
                      <Dna size={50} className="text-cyan-500" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h2 className="text-3xl md:text-5xl font-black text-white leading-tight uppercase tracking-tighter">Ready for parsing</h2>
                    <p className="text-gray-500 leading-relaxed text-xs md:text-sm uppercase tracking-widest font-bold opacity-60">Upload any track to begin extraction</p>
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-5xl space-y-12">
                  <div className="bg-black/40 p-8 md:p-12 rounded-[48px] border border-white/5 relative overflow-hidden group shadow-2xl">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-8">
                      <div className="flex items-center gap-6">
                        <div className="hidden lg:block">
                          <SpectralHeart isPlaying={isPlaying} color="#00f0ff" />
                        </div>
                        <div>
                          <span className="text-[10px] mono text-cyan-500 uppercase font-black tracking-widest mb-2 block">Active Signal Analysis</span>
                          <h3 className="text-white font-black text-lg md:text-2xl uppercase truncate max-w-full md:max-w-md tracking-tighter leading-none">{songName}</h3>
                        </div>
                      </div>
                      <div className="flex items-center gap-8 w-full md:w-auto justify-center bg-white/5 p-5 rounded-[28px] border border-white/5">
                        <button onClick={() => skipAudio(-10)} className="text-gray-500 hover:text-white transition-colors active:scale-75"><RefreshCw size={22} className="scale-x-[-1]" /></button>
                        <button onClick={togglePlayback} className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-all shadow-xl active:scale-95">
                          {isPlaying ? <Pause size={28} fill="black" /> : <Play size={28} fill="black" className="ml-1" />}
                        </button>
                        <button onClick={() => skipAudio(10)} className="text-gray-500 hover:text-white transition-colors active:scale-75"><RefreshCw size={22} /></button>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="relative group/seek">
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden relative">
                          <div className="h-full bg-cyan-500 shadow-[0_0_25px_#00f0ff] transition-all duration-100" style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} />
                        </div>
                        <input type="range" className="absolute -top-2 left-0 w-full h-6 opacity-0 cursor-pointer z-20" min="0" max={duration || 0} step="0.1" value={currentTime}
                          onChange={(e) => {
                            const time = parseFloat(e.target.value);
                            setCurrentTime(time);
                            if (musicAudio.current) musicAudio.current.currentTime = time;
                            if (vocalAudio.current) vocalAudio.current.currentTime = time;
                          }}
                        />
                      </div>
                      <div className="flex justify-between items-center px-1">
                        <div className="text-[14px] mono text-cyan-400 font-black">{`${Math.floor(currentTime / 60)}:${Math.floor(currentTime % 60).toString().padStart(2, '0')}`}</div>
                        <div className="text-[14px] mono text-gray-600 font-black">{`${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}`}</div>
                      </div>
                    </div>

                    <div className="bg-white/2 p-8 rounded-[32px] border border-white/5 grid grid-cols-1 md:grid-cols-2 gap-12 mt-12">
                      <div className="space-y-6">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_10px_#00f0ff]" />
                            <span className="font-black text-white uppercase text-[11px] tracking-widest">Studio Music</span>
                          </div>
                          <button onClick={() => downloadRawStem(instrumentalUrl, 'music')} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-white hover:text-black transition-all">
                            <Download size={16} />
                          </button>
                        </div>
                        <input type="range" className="w-full h-1.5 bg-white/5 accent-cyan-500 rounded-lg appearance-none cursor-pointer" min="0" max="1" step="0.01" value={musicVolume} onChange={(e) => setMusicVolume(parseFloat(e.target.value))} />
                      </div>
                      <div className="space-y-6">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_#a855f7]" />
                            <span className="font-black text-white uppercase text-[11px] tracking-widest">Isolated Vocals</span>
                          </div>
                          <button onClick={() => downloadRawStem(vocalsUrl, 'vocals')} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-white hover:text-black transition-all">
                            <Download size={16} />
                          </button>
                        </div>
                        <input type="range" className="w-full h-1.5 bg-white/5 accent-purple-500 rounded-lg appearance-none cursor-pointer" min="0" max="1" step="0.01" value={vocalVolume} onChange={(e) => setVocalVolume(parseFloat(e.target.value))} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {[
                      { id: 'vocals', label: 'Vocals', url: vocalsUrl, icon: <Mic />, color: 'cyan' },
                      { id: 'instrumental', label: 'Instrumental', url: instrumentalUrl, icon: <Music />, color: 'purple' },
                      { id: 'drums', label: 'Drums', url: drumsUrl, icon: <Disc />, color: 'lime' },
                      { id: 'bass', label: 'Bass', url: bassUrl, icon: <Guitar />, color: 'pink' }
                    ].map(stem => (
                      <div key={stem.id} onClick={() => setActiveStemId(stem.id)} className={`p-8 rounded-[40px] border transition-all cursor-pointer group relative overflow-hidden ${activeStemId === stem.id ? 'bg-white text-black border-white shadow-2xl scale-105' : 'bg-black/40 border-white/5 text-gray-500 hover:border-white/20'}`}>
                        <div className="mb-8 flex justify-between items-center">
                          <div className={`${activeStemId === stem.id ? 'text-cyan-600' : 'text-gray-600 group-hover:text-white'}`}>{stem.icon}</div>
                          {stem.url && <a href={stem.url} download={`${songName}_${stem.id}.wav`} onClick={e => e.stopPropagation()} className={`p-2.5 rounded-xl transition-all ${activeStemId === stem.id ? 'bg-black/5 text-black hover:bg-black/10' : 'bg-white/5 text-white hover:bg-cyan-500 hover:text-black'}`}><Download size={18} /></a>}
                        </div>
                        <h4 className="text-[11px] font-black uppercase tracking-[0.2em]">{stem.label}</h4>
                      </div>
                    ))}
                  </div>

                  <button onClick={handleSaveSimple} disabled={isProcessing} className="w-full py-8 bg-white text-black font-black text-base rounded-[32px] hover:bg-cyan-500 shadow-2xl transition-all uppercase tracking-[0.5em] flex items-center justify-center gap-5 active:scale-95 disabled:opacity-50">
                    <Download size={28} /> DOWNLOAD MIXED SIGNAL
                  </button>
                </div>
              )}
            </div>
          </main>
        ) : view === 'downloader' ? (
          <main className="main-stage overflow-y-auto bg-[#020204]">
            <header className="px-6 md:px-12 py-10 border-b border-white/5">
              <h1 className="text-xl font-black text-white uppercase tracking-tight">Signal Downloader</h1>
              <p className="text-[10px] mono text-gray-500 mt-1 uppercase font-black">Any platform. Original quality.</p>
            </header>
            <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12">
              <div className="w-full max-w-3xl space-y-12 bg-black/40 p-10 md:p-16 rounded-[56px] border border-white/5 shadow-3xl">
                <div className="text-center space-y-6">
                  <div className="w-24 h-24 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center text-white mx-auto">
                    <Globe size={40} />
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter leading-none">Universal Stream Capture</h2>
                </div>

                <div className="space-y-8">
                  <div className="relative group">
                    <input type="text" placeholder="PASTE URL HERE (YOUTUBE, SPOTIFY, ETC)" className="w-full bg-black/60 border border-white/10 rounded-[32px] px-10 py-8 text-sm font-black tracking-widest text-white focus:outline-none focus:border-cyan-500/50 transition-all placeholder:text-gray-700 uppercase" value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)} />
                    <div className="absolute left-4 top-4 flex gap-2 items-center">
                      <select value={downloadFormat} onChange={(e) => setDownloadFormat(e.target.value)} className="bg-black/70 text-white rounded px-2 py-1 text-xs">
                        <option value="wav">WAV</option>
                        <option value="mp3">MP3</option>
                        <option value="flac">FLAC</option>
                      </select>
                      <select value={downloadBitrate} onChange={(e) => setDownloadBitrate(e.target.value)} className="bg-black/70 text-white rounded px-2 py-1 text-xs">
                        <option value="120k">120 kbps</option>
                        <option value="256k">256 kbps</option>
                        <option value="340k">340 kbps</option>
                      </select>
                    </div>
                    <button onClick={() => handleUrlSubmit('direct')} disabled={isProcessing || !downloadUrl} className="absolute right-4 top-4 bottom-4 px-10 rounded-[24px] bg-white text-black font-black text-[11px] tracking-widest hover:bg-cyan-500 transition-all shadow-xl">
                      {isProcessing ? 'SCANNING...' : 'FETCH SIGNAL'}
                    </button>
                  </div>
                  <div className="flex justify-center gap-8 text-[10px] font-black tracking-[0.3em] text-gray-600 uppercase">
                    <div className="flex items-center gap-2.5"><div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" /> YouTube</div>
                    <div className="flex items-center gap-2.5"><div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" /> Spotify</div>
                    <div className="flex items-center gap-2.5"><div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]" /> SoundCloud</div>
                  </div>
                </div>

                {directAudioUrl && (
                  <div className="animate-in fade-in zoom-in-95 duration-500 w-full">
                    {/* DESKTOP CARD */}
                    <div className="hidden md:flex player-card p-10 rounded-[48px] border border-white/10 items-center gap-12">
                      <div className="relative group">
                        <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full group-hover:scale-150 transition-transform" />
                        <div className="relative z-10 w-48 h-48 rounded-[40px] overflow-hidden shadow-2xl border-4 border-white/5">
                          <img src={directThumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop'} className="w-full h-full object-cover" alt="Art" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                            <SpectralHeart isPlaying={isDirectPlaying} color="#00f0ff" />
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] mono text-cyan-500 font-black tracking-widest uppercase mb-3 block">Source Verified</span>
                        <h3 className="text-white text-3xl font-black uppercase tracking-tighter line-clamp-2 leading-none mb-8">{directSongName || 'Processing...'}</h3>
                        <div className="flex items-center gap-6">
                          <button onClick={() => { if (isDirectPlaying) { directWavesurfer.current.pause(); directAudio.current.pause(); } else { directWavesurfer.current.play(); directAudio.current.play(); } }} className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-all shadow-xl active:scale-95">
                            {isDirectPlaying ? <Pause size={28} fill="black" /> : <Play size={28} fill="black" className="ml-1" />}
                          </button>
                          <button onClick={() => { setDirectAudioUrl(''); setDownloadUrl(''); }} className="text-gray-500 hover:text-red-500 transition-colors"><Trash2 size={24} /></button>
                          <a href={directAudioUrl} download={directSongName} className="p-4 rounded-2xl bg-white/5 text-white hover:bg-white hover:text-black transition-all">
                            <Download size={20} />
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* MOBILE FULL SCREEN PLAYER */}
                    <div className="md:hidden fixed inset-0 z-[1000] bg-[#020204] flex flex-col p-8 animate-in slide-in-from-bottom-full duration-700">
                      <div className="flex justify-between items-center mb-12">
                        <button onClick={() => setDirectAudioUrl('')} className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white"><ChevronRight className="rotate-180" size={24} /></button>
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Now Playing</span>
                        <button className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white"><Settings size={20} /></button>
                      </div>

                      <div className="flex-1 flex flex-col items-center justify-center space-y-12">
                        <div className="relative group">
                          <div className={`absolute -inset-10 bg-cyan-500/20 blur-[80px] rounded-full transition-opacity duration-1000 ${isDirectPlaying ? 'opacity-100' : 'opacity-0'}`} />
                          <img src={directThumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=500&h=500&fit=crop'} className={`w-[75vw] h-[75vw] object-cover rounded-[50px] shadow-[0_40px_80px_rgba(0,0,0,0.8)] border-4 border-white/10 transition-transform duration-700 ${isDirectPlaying ? 'scale-105' : 'scale-95'}`} alt="Art" />
                        </div>

                        <div className="text-center space-y-3 w-full px-4">
                          <h3 className="text-2xl font-black text-white uppercase tracking-tight line-clamp-2 leading-tight">{directSongName || 'Signal...'}</h3>
                          <p className="text-cyan-500 text-[10px] font-black uppercase tracking-[0.3em]">SoundRip Capture</p>
                        </div>

                        <div className="w-full space-y-6">
                          <div className="relative group/seek">
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden relative">
                              <div className="h-full bg-cyan-500 shadow-[0_0_15px_#00f0ff]" style={{ width: `${directDuration > 0 ? (directCurrentTime / directDuration) * 100 : 0}%` }} />
                            </div>
                            <input type="range" className="absolute -top-3 left-0 w-full h-8 opacity-0 cursor-pointer z-20" min="0" max={directDuration || 0} step="0.1" value={directCurrentTime} onChange={(e) => { const time = parseFloat(e.target.value); if (directAudio.current) directAudio.current.currentTime = time; if (directWavesurfer.current) directWavesurfer.current.setTime(time); setDirectCurrentTime(time); }} />
                          </div>
                          <div className="flex justify-between text-[10px] mono font-black text-white/40 uppercase">
                            <span>{Math.floor(directCurrentTime / 60)}:{(Math.floor(directCurrentTime % 60)).toString().padStart(2, '0')}</span>
                            <span>{Math.floor(directDuration / 60)}:{(Math.floor(directDuration % 60)).toString().padStart(2, '0')}</span>
                          </div>
                        </div>
                      </div>

                      <div className="py-12 flex items-center justify-around">
                        <button className="text-white/40 hover:text-white transition-colors"><RefreshCw size={24} className="scale-x-[-1]" /></button>
                        <button onClick={() => { if (isDirectPlaying) { directWavesurfer.current.pause(); directAudio.current.pause(); } else { directWavesurfer.current.play(); directAudio.current.play(); } }} className="w-24 h-24 rounded-full bg-white text-black flex items-center justify-center shadow-[0_20px_50px_rgba(255,255,255,0.2)] active:scale-90 transition-transform">
                          {isDirectPlaying ? <Pause size={32} fill="black" /> : <Play size={32} fill="black" className="ml-1" />}
                        </button>
                        <a href={directAudioUrl} download={directSongName} className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white border border-white/10 active:scale-90">
                          <Download size={24} />
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        ) : (
          <main className="main-stage overflow-y-auto bg-[#020204]">
            <header className="px-6 md:px-12 py-10 border-b border-white/5 flex justify-between items-center">
              <h1 className="text-xl font-black text-white uppercase tracking-tight tracking-[0.3em]">Bypass Console</h1>
              <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                <button onClick={() => setSeparationModel('fast')} className={`px-5 py-2 text-[10px] font-black rounded-lg transition-all ${separationModel === 'fast' ? 'bg-cyan-500 text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}>FAST</button>
                <button onClick={() => setSeparationModel('pro')} className={`px-5 py-2 text-[10px] font-black rounded-lg transition-all ${separationModel === 'pro' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}>PRO</button>
              </div>
            </header>
            <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12">
              <div className="w-full max-w-lg bg-black/60 p-12 rounded-[56px] border border-white/10 text-center space-y-10 shadow-3xl backdrop-blur-3xl relative overflow-hidden">
                <div className="w-24 h-24 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto border border-cyan-500/30">
                  <Shield size={48} className="text-cyan-500" />
                </div>
                <div className="space-y-4">
                  <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter leading-none">AI Bypass Mode</h2>
                  <p className="text-[10px] mono text-gray-500 uppercase tracking-widest font-black opacity-60 leading-relaxed">Neural waveform modification suite</p>
                </div>
                <div className="p-8 rounded-[32px] bg-white/2 border border-white/5 text-left space-y-6">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest leading-relaxed">Applying phase inversion, sample shift, and harmonic noise injection to bypass copyright detection signatures.</p>
                  <div className="flex items-center gap-3 text-cyan-400">
                    <Check size={18} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Active Signal Ready</span>
                  </div>
                </div>
              </div>
            </div>
          </main>
        )}
      </div>

      {view === 'stealth' && (
        <aside className="data-panel hidden md:flex md:flex-col p-10 border-l border-white/5 animate-slide-left bg-[#050507]">
          <div className="flex flex-col h-full space-y-12">
            <h3 className="text-[11px] font-black tracking-[0.4em] uppercase text-white/40 flex items-center gap-3">
              <Sparkles size={18} className="text-cyan-500" />
              Bypass Controls
            </h3>
            <div className="grid grid-cols-1 gap-4">
              {[
                { n: 'Anti-Mono Stealth', s: antiMono, v: setAntiMono, icon: <Split size={18} /> },
                { n: 'Comb Filter Notch', s: combFilter, v: setCombFilter, icon: <Activity size={18} /> },
                { n: 'Micro-Chopping', s: microChop, v: setMicroChop, icon: <Scissors size={18} /> },
                { n: 'Decoy Synth Mask', s: includeDecoy, v: setIncludeDecoy, icon: <Zap size={18} /> },
                { n: 'Noise Floor', s: noiseFloor, v: setNoiseFloor, icon: <Volume2 size={18} /> },
                { n: 'Reverse Vocals', s: reverseVocals, v: setReverseVocals, icon: <RefreshCw size={18} /> },
              ].map(mod => (
                <div key={mod.n} onClick={() => mod.v(!mod.s)} className={`p-5 rounded-[24px] flex items-center justify-between cursor-pointer border transition-all active:scale-[0.98] ${mod.s ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400 shadow-lg' : 'bg-white/2 border-white/5 text-gray-600 hover:border-white/10'}`}>
                  <div className="flex items-center gap-5">
                    {mod.icon}
                    <span className="text-[11px] font-black uppercase tracking-widest">{mod.n}</span>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${mod.s ? 'bg-cyan-400 shadow-[0_0_15px_#00f0ff]' : 'bg-white/10'}`} />
                </div>
              ))}
            </div>

            <div className="space-y-8 pt-8 border-t border-white/10">
              <div className="space-y-5">
                <div className="flex justify-between text-[11px] mono font-black uppercase tracking-widest"><span className="text-gray-500">Bypass Pitch</span><span className="text-cyan-400">+{semitones}st</span></div>
                <input type="range" className="w-full h-1.5 bg-white/5 accent-cyan-500 rounded-lg appearance-none cursor-pointer" min="-3" max="3" step="1" value={semitones} onChange={e => setSemitones(parseInt(e.target.value))} />
              </div>
              <div className="space-y-5">
                <div className="flex justify-between text-[11px] mono font-black uppercase tracking-widest"><span className="text-gray-500">Bypass Speed</span><span className="text-cyan-400">{speed}x</span></div>
                <input type="range" className="w-full h-1.5 bg-white/5 accent-cyan-500 rounded-lg appearance-none cursor-pointer" min="0.8" max="1.2" step="0.01" value={speed} onChange={e => setSpeed(parseFloat(e.target.value))} />
              </div>
            </div>

            <label className="mt-auto p-6 rounded-[32px] bg-white text-black flex items-center justify-between cursor-pointer hover:bg-cyan-500 hover:shadow-2xl transition-all group active:scale-95 shadow-xl">
              <div className="flex items-center gap-5">
                <ShieldCheck size={24} className="text-black" />
                <span className="text-[12px] font-black uppercase tracking-[0.2em]">Safe Signal Injection</span>
              </div>
              <span className="text-[11px] mono font-black opacity-40">{introFile ? 'READY' : 'INJECT'}</span>
              <input type="file" hidden onChange={e => setIntroFile(e.target.files[0])} />
            </label>
          </div>
        </aside>
      )}

      {isProcessing && (
        <div className="fixed bottom-24 md:bottom-10 left-1/2 -translate-x-1/2 w-[90%] md:w-[450px] bg-black/90 backdrop-blur-2xl p-8 rounded-[40px] border border-cyan-500/20 shadow-3xl z-[200] animate-in fade-in slide-in-from-bottom-10">
          <div className="flex justify-between text-[11px] mono font-black mb-5 text-cyan-400 uppercase tracking-widest">
            <span>{processingStage}</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
            <div className="h-full bg-cyan-500 transition-all duration-300 shadow-[0_0_20px_#00f0ff]" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;