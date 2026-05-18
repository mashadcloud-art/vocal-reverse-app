import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { exec, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import dns from 'dns';
import ytSearch from 'yt-search';

// Force Node.js to prioritize IPv4 over IPv6 to resolve Oracle Cloud outbound DNS failures
dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Ensure temp directories exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const SEPARATED_DIR = path.join(__dirname, 'separated');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(SEPARATED_DIR)) fs.mkdirSync(SEPARATED_DIR);

// Serve both directories statically
const staticOptions = {
  setHeaders: (res, path) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    // Force download for audio files
    if (path.endsWith('.mp3') || path.endsWith('.wav') || path.endsWith('.flac')) {
      const fileName = encodeURIComponent(path.split(/[\\/]/).pop());
      res.set('Content-Disposition', `attachment; filename="${fileName}"`);
    }
  }
};

app.use('/files/uploads', express.static(UPLOADS_DIR, staticOptions));
app.use('/files', express.static(SEPARATED_DIR, staticOptions));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'audio-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// High-performance Telegram-Style caching & queue engine
const audioCache = {};

class JobQueue {
  constructor(concurrency = 2) {
    this.concurrency = concurrency;
    this.queue = [];
    this.running = 0;
  }
  
  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processNext();
    });
  }
  
  async processNext() {
    if (this.running >= this.concurrency || this.queue.length === 0) return;
    
    this.running++;
    const { task, resolve, reject } = this.queue.shift();
    
    try {
      const result = await task();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.running--;
      this.processNext();
    }
  }
}

const downloadQueue = new JobQueue(2);
const activeDownloads = {};

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || ''; // Paste your YouTube API key here if you want to use the official Google API

app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Search query is required' });

    // 1. Try Google YouTube Data API v3 if a key is provided
    if (YOUTUBE_API_KEY) {
      try {
        console.log(`[Search API] Querying Official YouTube Data API for: ${q}`);
        const response = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=10&key=${YOUTUBE_API_KEY}`
        );
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
          const videos = data.items.map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            artist: item.snippet.channelTitle || 'YouTube',
            duration: 'HQ Stream', // official snippet doesn't return duration, so we use a premium badge tag
            thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
            url: `https://youtube.com/watch?v=${item.id.videoId}`
          }));
          return res.json({ success: true, results: videos });
        } else if (data.error) {
          console.warn(`[Search API] Google API returned quota/auth error: ${data.error.message}. Bypassing to keyless fallback scraper.`);
        }
      } catch (apiErr) {
        console.warn('[Search API] Google API request failed. Bypassing to keyless fallback scraper:', apiErr);
      }
    }

    // 2. Fallback: High-Performance Keyless Scraper (Unlimited & Free)
    console.log(`[Search API] Querying keyless scraping engine for: ${q}`);
    const results = await ytSearch(q);
    
    // Return top 10 video results
    const videos = results.videos.slice(0, 10).map(v => ({
      id: v.videoId,
      title: v.title,
      artist: v.author?.name || 'YouTube',
      duration: v.timestamp,
      thumbnail: v.thumbnail,
      url: v.url
    }));
    
    res.json({ success: true, results: videos });
  } catch (error) {
    console.error('[Search API] Failed:', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

app.post('/api/download-url', async (req, res) => {
  const { url, format = 'wav', skipSeparation = false, bitrate = '320k', downloadId = Date.now().toString(), cookies: clientCookies } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  // 0. Cache lookup for instant Telegram-style response delivery
  const cacheKey = `${url.trim()}_${format}_${bitrate}`;
  const cachedSong = audioCache[cacheKey];
  
  if (cachedSong && fs.existsSync(cachedSong.filePath)) {
    console.log(`[Downloader Cache] HIT! Delivering instantly for key: ${cacheKey}`);
    if (skipSeparation) {
      return res.json({
        success: true,
        downloadId,
        directUrl: cachedSong.directUrl,
        fileName: cachedSong.fileName,
        thumbnail: cachedSong.thumbnail,
        cached: true
      });
    }
    return res.json({
      success: true,
      downloadId,
      filePath: cachedSong.filePath,
      fileName: cachedSong.fileName,
      thumbnail: cachedSong.thumbnail,
      previewUrl: cachedSong.directUrl,
      cached: true
    });
  }

  const uniqueId = Date.now();
  let activeCookiesPath = null;
  const tempCookiesFile = path.join(__dirname, `cookies_${downloadId}.txt`);

  // Write client-provided cookies dynamically if sent, otherwise fallback to server's cookies.txt
  if (clientCookies && clientCookies.trim()) {
    try {
      fs.writeFileSync(tempCookiesFile, clientCookies.trim());
      activeCookiesPath = tempCookiesFile;
      console.log(`[Downloader] Created dynamic session cookies file: ${tempCookiesFile}`);
    } catch (e) {
      console.error("[Downloader] Failed to write dynamic cookies file:", e);
    }
  } else {
    const COOKIES_PATH = path.join(__dirname, 'cookies.txt');
    if (fs.existsSync(COOKIES_PATH)) {
      activeCookiesPath = COOKIES_PATH;
    }
  }

  try {
    // Queue the heavy download subprocess execution task to protect server CPU/RAM
    console.log(`[Downloader Queue] Enqueueing job for url: ${url}`);
    const downloadResult = await downloadQueue.enqueue(async () => {
      // 1. Primary Zero-Cookie Bypass Strategy (via RapidAPI youtube-mp36)
      let rapidApiSuccess = false;
      let rapidApiFile = null;
      let rapidApiTitle = 'downloaded_audio';
      const fileExt = format === 'mp3' ? 'mp3' : format === 'flac' ? 'flac' : 'wav';
      const cleanTitle = `audio_${Date.now()}`;
      const rapidApiOutputPath = path.join(UPLOADS_DIR, `${cleanTitle}_${uniqueId}.${fileExt}`);

      try {
        const videoIdMatch = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;

        if (videoId) {
          console.log(`[RapidAPI Bypass] Attempting extraction for videoId: ${videoId}`);
          
          let rapidData = null;
          let attempts = 0;
          const maxAttempts = 20; // 60 seconds total

          while (attempts < maxAttempts) {
            const rapidResponse = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
              method: 'GET',
              headers: {
                'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com',
                'x-rapidapi-key': '219cb6dd57mshade28004b8f12cfp12a153jsnc7f53ea593b0'
              }
            });

            if (!rapidResponse.ok) throw new Error(`HTTP Status ${rapidResponse.status}`);
            rapidData = await rapidResponse.json();

            if (rapidData.status === 'ok' && rapidData.link) {
              console.log(`[RapidAPI Bypass] Stream ready! Progress: ${rapidData.progress}%`);
              break; // Ready to download!
            }

            if (rapidData.msg && rapidData.msg.toLowerCase().includes('fail')) {
              throw new Error(rapidData.msg);
            }

            console.log(`[RapidAPI Bypass] Processing... Progress: ${rapidData.progress || 0}% (Attempt ${attempts + 1}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 3000)); // wait 3 seconds before polling
            attempts++;
          }

          if (!rapidData || rapidData.status !== 'ok' || !rapidData.link) {
            throw new Error(rapidData?.msg || 'RapidAPI timeout: File never became ready.');
          }

          rapidApiTitle = (rapidData.title || 'downloaded_audio')
            .replace(/\.[^/.]+$/, "") // strip extension
            .replace(/[^a-z0-9]/gi, '_')
            .substring(0, 50);

          console.log(`[RapidAPI Bypass] Stream URL acquired! Downloading direct audio stream...`);
          const fileStreamResponse = await fetch(rapidData.link);
          if (!fileStreamResponse.ok) throw new Error(`Failed to stream direct audio file. HTTP ${fileStreamResponse.status}`);

          const arrayBuf = await fileStreamResponse.arrayBuffer();
          fs.writeFileSync(rapidApiOutputPath, Buffer.from(arrayBuf));
          console.log(`[RapidAPI Bypass] Direct stream successfully saved: ${rapidApiOutputPath}`);

          rapidApiFile = `${cleanTitle}_${uniqueId}.${fileExt}`;
          rapidApiSuccess = true;
          
          return {
            filePath: rapidApiOutputPath,
            fileName: rapidApiFile,
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            directUrl: `/files/uploads/${rapidApiFile}`
          };
        }
      } catch (e) {
        console.warn(`[RapidAPI Bypass] Failed:`, e.message);
      }
      // 2. Secondary Zero-Cookie Bypass (Piped API Network)
      let pipedSuccess = false;
      let pipedFile = null;
      let pipedOutputPath = null;

      const videoIdMatch = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
      const videoId = videoIdMatch ? videoIdMatch[1] : null;

      if (videoId) {
        const pipedInstances = [
          'https://pipedapi.kavin.rocks',
          'https://pipedapi.drgns.space',
          'https://api.piped.projectsegfau.lt'
        ];

        for (const instance of pipedInstances) {
          try {
            console.log(`[Piped Bypass] Attempting extraction via: ${instance}`);
            const pipedRes = await fetch(`${instance}/streams/${videoId}`);
            if (!pipedRes.ok) throw new Error(`HTTP Status ${pipedRes.status}`);
            const pipedData = await pipedRes.json();
            
            const audioStream = (pipedData.audioStreams || []).find(f => f.mimeType && f.mimeType.includes('audio'));
            if (!audioStream || !audioStream.url) throw new Error('No audio stream found');

            const pipedExt = audioStream.format ? audioStream.format.toLowerCase() : 'm4a';
            pipedOutputPath = path.join(UPLOADS_DIR, `${cleanTitle}_${uniqueId}_piped.${pipedExt}`);

            console.log(`[Piped Bypass] Stream URL acquired! Downloading from Proxy...`);
            const fileStreamResponse = await fetch(audioStream.url);
            if (!fileStreamResponse.ok) throw new Error(`HTTP ${fileStreamResponse.status}`);

            const arrayBuf = await fileStreamResponse.arrayBuffer();
            fs.writeFileSync(pipedOutputPath, Buffer.from(arrayBuf));
            console.log(`[Piped Bypass] Proxy stream successfully saved: ${pipedOutputPath}`);

            pipedFile = `${cleanTitle}_${uniqueId}_piped.${pipedExt}`;
            pipedSuccess = true;
            break;
          } catch (e) {
            console.warn(`[Piped Bypass] Instance ${instance} failed:`, e.message);
          }
        }
      }

      if (pipedSuccess) {
        console.log(`[Downloader] Piped bypass strategy succeeded! File: ${pipedFile}`);
        return {
          filePath: pipedOutputPath,
          fileName: pipedFile,
          thumbnail: null,
          directUrl: `/files/uploads/${pipedFile}`
        };
      }

      console.log(`[Downloader] Zero-cookie bypasses failed. Falling back to local yt-dlp...`);

      // 2. Fallback Strategy: Get metadata using sequential failover strategies
      const metadata = await new Promise(async (resolve) => {
        const baseArgs = ['--js-runtimes', 'node'];
        if (activeCookiesPath) baseArgs.push('--cookies', activeCookiesPath);
        
        const strategies = [
          { name: 'Standard Session', extractorArgs: null, userAgent: null },
          { 
            name: 'iOS App Spoofing', 
            extractorArgs: 'youtube:player_client=ios', 
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1' 
          },
          { 
            name: 'Android App Spoofing', 
            extractorArgs: 'youtube:player_client=android', 
            userAgent: 'com.google.android.youtube/19.29.37 (Linux; U; Android 11; GMT) Mozilla/5.0 (Linux; Android 11; Premium Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.115 Mobile Safari/537.36' 
          }
        ];

        for (const strategy of strategies) {
          try {
            const args = [...baseArgs];
            if (strategy.extractorArgs) args.push('--extractor-args', strategy.extractorArgs);
            if (strategy.userAgent) args.push('--user-agent', strategy.userAgent);
            args.push('--get-title', '--get-thumbnail', '--get-id', '--no-playlist', url);

            const result = await new Promise((res, rej) => {
              const proc = spawn('yt-dlp', args);
              let output = '';
              proc.stdout.on('data', d => output += d.toString());
              proc.on('close', code => {
                if (code === 0) res(output);
                else rej(new Error(`Exit code ${code}`));
              });
              proc.on('error', rej);
            });

            const lines = result.trim().split('\n');
            console.log(`[Metadata] Successfully fetched using ${strategy.name}`);
            return resolve({
              title: (lines[0]?.trim() || 'downloaded_audio').replace(/[^a-z0-9]/gi, '_').substring(0, 50),
              thumbnail: lines[1]?.trim() || null
            });
          } catch (e) {
            console.warn(`[Metadata] Strategy ${strategy.name} failed:`, e.message);
          }
        }
        resolve({ title: 'downloaded_audio', thumbnail: null });
      });

      const safeTitle = `${metadata.title}_${uniqueId}`;
      const extension = format === 'mp3' ? 'mp3' : format === 'flac' ? 'flac' : 'wav';
      const outputPath = path.join(UPLOADS_DIR, `${safeTitle}.%(ext)s`);

      // 2. Build base download args
      const baseArgs = ['--js-runtimes', 'node'];
      if (activeCookiesPath) baseArgs.push('--cookies', activeCookiesPath);
      baseArgs.push('--no-playlist', '-f', 'ba', '-x', '--audio-format', extension);
      if (extension === 'mp3') baseArgs.push('--audio-quality', bitrate);
      else baseArgs.push('--audio-quality', '0');
      baseArgs.push('-o', outputPath, url);

      // 3. Sequential bulletproof download failover execution
      const strategies = [
        { name: 'Standard Session', extractorArgs: null, userAgent: null },
        { 
          name: 'iOS App Spoofing', 
          extractorArgs: 'youtube:player_client=ios', 
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1' 
        },
        { 
          name: 'Android App Spoofing', 
          extractorArgs: 'youtube:player_client=android', 
          userAgent: 'com.google.android.youtube/19.29.37 (Linux; U; Android 11; GMT) Mozilla/5.0 (Linux; Android 11; Premium Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.115 Mobile Safari/537.36' 
        },
        { 
          name: 'Mobile Web Spoofing', 
          extractorArgs: 'youtube:player_client=mweb', 
          userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36' 
        }
      ];

      let downloadSuccess = false;
      let lastError = null;

      for (const strategy of strategies) {
        console.log(`[Downloader] Attempting strategy: ${strategy.name}...`);
        try {
          const args = [...baseArgs];
          if (strategy.extractorArgs) args.push('--extractor-args', strategy.extractorArgs);
          if (strategy.userAgent) args.push('--user-agent', strategy.userAgent);

          await new Promise((resolve, reject) => {
            const proc = spawn('yt-dlp', args);
            activeDownloads[downloadId] = proc;

            proc.stderr.on('data', d => {
              console.log(`[yt-dlp ${strategy.name}]:`, d.toString().trim());
            });

            proc.on('close', code => {
              delete activeDownloads[downloadId];
              if (code === 0) resolve();
              else reject(new Error(`yt-dlp exited with code ${code}`));
            });

            proc.on('error', err => {
              delete activeDownloads[downloadId];
              reject(err);
            });
          });

          console.log(`[Downloader] Strategy ${strategy.name} succeeded!`);
          downloadSuccess = true;
          break; // Stop trying other strategies!
        } catch (err) {
          console.warn(`[Downloader] Strategy ${strategy.name} failed:`, err.message);
          lastError = err;
        }
      }

      if (!downloadSuccess) {
        throw new Error(`All download strategies exhausted. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
      }

      // 4. Find and return file
      const files = fs.readdirSync(UPLOADS_DIR);
      const downloadedFile = files.find(f => f.startsWith(safeTitle));
      if (!downloadedFile) throw new Error('File not found after download');

      const fullPath = path.join(UPLOADS_DIR, downloadedFile);
      const stats = fs.statSync(fullPath);
      if (stats.size < 10000) throw new Error(`File too small (${stats.size} bytes)`);

      return {
        filePath: fullPath,
        fileName: downloadedFile,
        thumbnail: metadata.thumbnail,
        directUrl: `/files/uploads/${downloadedFile}`
      };
    });

    // 5. Save the downloaded result into the instant delivery cache
    audioCache[cacheKey] = downloadResult;
    console.log(`[Downloader Cache] Successfully cached key: ${cacheKey}`);

    if (skipSeparation) {
      return res.json({
        success: true,
        downloadId,
        directUrl: downloadResult.directUrl,
        fileName: downloadResult.fileName,
        thumbnail: downloadResult.thumbnail
      });
    }

    res.json({
      success: true,
      downloadId,
      filePath: downloadResult.filePath,
      fileName: downloadResult.fileName,
      thumbnail: downloadResult.thumbnail,
      previewUrl: downloadResult.directUrl
    });

  } catch (err) {
    console.error('Download failed:', err);
    res.status(500).json({ error: err.message || 'Failed to download audio.' });
  } finally {
    // Dynamic temporary cookies cleanup
    if (clientCookies && fs.existsSync(tempCookiesFile)) {
      try {
        fs.unlinkSync(tempCookiesFile);
        console.log(`[Downloader] Successfully cleaned up temp session cookies: ${tempCookiesFile}`);
      } catch (e) {
        console.error("[Downloader] Temp cookies cleanup error:", e);
      }
    }
  }
});

// ⏹️ Cancel endpoint
app.post('/api/cancel/:id', (req, res) => {
  const proc = activeDownloads[req.params.id];
  if (proc) {
    proc.kill('SIGTERM');
    delete activeDownloads[req.params.id];
    return res.json({ success: true, message: 'Download cancelled' });
  }
  res.status(404).json({ error: 'Download not found' });
});

// 📊 Progress endpoint (poll this from frontend)
app.get('/api/status/:id', (req, res) => {
  const isActive = !!activeDownloads[req.params.id];
  res.json({ active: isActive, downloadId: req.params.id });
});

app.post('/api/upload', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ success: true, filePath: req.file.path, fileName: req.file.filename });
});

app.post('/api/convert', async (req, res) => {
  const { filePath, targetFormat, bitrate = '320k' } = req.body;
  if (!filePath || !targetFormat) return res.status(400).json({ error: 'Missing parameters' });

  let absolutePath = path.isAbsolute(filePath) ? filePath : path.join(UPLOADS_DIR, filePath);
  
  if (!fs.existsSync(absolutePath)) {
    // Check SEPARATED_DIR
    absolutePath = path.join(SEPARATED_DIR, filePath);
  }

  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const outputFileName = `conv-${Date.now()}.${targetFormat}`;
  const outputPath = path.join(SEPARATED_DIR, outputFileName);

  try {
    await new Promise((resolve, reject) => {
      const bitrateFlag = targetFormat === 'mp3' ? `-b:a ${bitrate}` : '';
      exec(`ffmpeg -i "${absolutePath}" ${bitrateFlag} "${outputPath}" -y`, (error) => {
        if (error) return reject(error);
        resolve();
      });
    });

    res.json({ 
      success: true, 
      url: `/files/${outputFileName}`,
      fileName: outputFileName
    });
  } catch (err) {
    console.error('Conversion error:', err);
    res.status(500).json({ error: 'Conversion failed' });
  }
});

app.post('/api/separate-vocals', upload.single('audio'), async (req, res) => {
  let inputFilePath = req.file ? req.file.path : req.body.filePath;
  if (!inputFilePath) {
    return res.status(400).json({ error: 'No audio source provided.' });
  }

  const modelType = req.body.model || 'fast';
  const originalName = req.file ? req.file.originalname.split('.')[0] : (req.body.fileName || 'remote_audio').split('.')[0];
  const folderName = originalName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const wavFilePath = path.join(UPLOADS_DIR, `${folderName}_work.wav`);
  const outputDir = path.join(SEPARATED_DIR, folderName);

  // CACHE CHECK: If this song was already processed, just return the URLs
  const hasGuitar = fs.existsSync(path.join(outputDir, 'guitar.wav'));
  const hasPiano = fs.existsSync(path.join(outputDir, 'piano.wav'));
  
  // Only use cache if it matches the requested model (Pro needs guitar/piano)
  const isCacheComplete = fs.existsSync(path.join(outputDir, 'vocals.wav')) && fs.existsSync(path.join(outputDir, 'instrumental.wav'));
  const matchesModel = modelType === 'fast' || (modelType === 'pro' && hasGuitar);

  if (isCacheComplete && matchesModel) {
    console.log(`Cache hit for ${folderName}! Skipping processing.`);
    return res.json({
      vocalsUrl: `/files/${folderName}/vocals.wav`,
      instrumentalUrl: `/files/${folderName}/instrumental.wav`,
      bassUrl: `/files/${folderName}/bass.wav`,
      drumsUrl: `/files/${folderName}/drums.wav`,
      otherUrl: `/files/${folderName}/other.wav`,
      guitarUrl: hasGuitar ? `/files/${folderName}/guitar.wav` : null,
      pianoUrl: hasPiano ? `/files/${folderName}/piano.wav` : null
    });
  }

  console.log(`Processing ${inputFilePath}...`);

  try {
    // 1. Convert to 44.1kHz WAV
    console.log('Converting to WAV...');
    await new Promise((resolve, reject) => {
      exec(`ffmpeg -i "${inputFilePath}" -ar 44100 -ac 2 "${wavFilePath}" -y`, (error) => {
        if (error) return reject(error);
        resolve();
      });
    });

    // Dynamic Python Virtual Environment path detection
    const localVenvLinux = path.join(__dirname, 'venv', 'bin', 'python');
    const localVenvWin = path.join(__dirname, 'venv', 'Scripts', 'python.exe');
    const PYTHON_PATH = fs.existsSync(localVenvLinux) ? localVenvLinux : (fs.existsSync(localVenvWin) ? localVenvWin : 'python');

    console.log(`Running separation engine with: ${PYTHON_PATH}`);

    // 2. Run Demucs
    if (modelType === 'pro') {
      console.log('Running Demucs PRO (6-Stem)... This will be slow.');
      await new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, 'separate_stems.py');
        const pythonCommand = `"${PYTHON_PATH}" "${pythonScript}" htdemucs_6s "${wavFilePath}" "${SEPARATED_DIR}"`;
        
        exec(pythonCommand, { 
          env: { ...process.env, TORCHAUDIO_BACKEND: 'soundfile' }
        }, (error) => {
          if (error) return reject(error);
          
          const proSourceDir = path.join(SEPARATED_DIR, 'htdemucs_6s', `${folderName}_work`);
          if (fs.existsSync(proSourceDir)) {
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
            fs.readdirSync(proSourceDir).forEach(file => {
              fs.renameSync(path.join(proSourceDir, file), path.join(outputDir, file));
            });
          }
          resolve();
        });
      });
    } else {
      console.log('Running Demucs FAST (4-Stem) via PyTorch...');
      await new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, 'separate_stems.py');
        const pythonCommand = `"${PYTHON_PATH}" "${pythonScript}" htdemucs "${wavFilePath}" "${SEPARATED_DIR}"`;
        
        exec(pythonCommand, { 
          env: { ...process.env, TORCHAUDIO_BACKEND: 'soundfile' }
        }, (error) => {
          if (error) return reject(error);
          
          const fastSourceDir = path.join(SEPARATED_DIR, 'htdemucs', `${folderName}_work`);
          if (fs.existsSync(fastSourceDir)) {
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
            fs.readdirSync(fastSourceDir).forEach(file => {
              fs.renameSync(path.join(fastSourceDir, file), path.join(outputDir, file));
            });
          }
          resolve();
        });
      });
    }

    // 3. Mix bass, drums, and other into an instrumental track
    console.log('Mixing instrumental tracks...');
    const bassPath = path.join(outputDir, 'bass.wav');
    const drumsPath = path.join(outputDir, 'drums.wav');
    const otherPath = path.join(outputDir, 'other.wav');
    const guitarPath = path.join(outputDir, 'guitar.wav');
    const pianoPath = path.join(outputDir, 'piano.wav');
    const instrumentalPath = path.join(outputDir, 'instrumental.wav');

    const mixInputs = [bassPath, drumsPath, otherPath];
    if (fs.existsSync(guitarPath)) mixInputs.push(guitarPath);
    if (fs.existsSync(pianoPath)) mixInputs.push(pianoPath);

    if (mixInputs.every(p => fs.existsSync(p))) {
      await new Promise((resolve, reject) => {
        const inputArgs = mixInputs.map(p => `-i "${p}"`).join(' ');
        exec(`ffmpeg ${inputArgs} -filter_complex amix=inputs=${mixInputs.length}:duration=longest "${instrumentalPath}" -y`, (error) => {
          if (error) return reject(error);
          resolve();
        });
      });
    }

    const vocalsUrl = `/files/${folderName}/vocals.wav`;
    const instrumentalUrl = `/files/${folderName}/instrumental.wav`;
    const bassUrl = `/files/${folderName}/bass.wav`;
    const drumsUrl = `/files/${folderName}/drums.wav`;
    const otherUrl = `/files/${folderName}/other.wav`;
    const guitarUrl = fs.existsSync(guitarPath) ? `/files/${folderName}/guitar.wav` : null;
    const pianoUrl = fs.existsSync(pianoPath) ? `/files/${folderName}/piano.wav` : null;

    console.log('Separation complete!');
    res.json({
      vocalsUrl,
      instrumentalUrl,
      bassUrl,
      drumsUrl,
      otherUrl,
      guitarUrl,
      pianoUrl
    });

    // We do NOT delete the separated folder immediately because the frontend needs to fetch them via the static URL.
    // We only clean up the initial upload.
    try {
      if (fs.existsSync(inputFilePath)) fs.unlinkSync(inputFilePath);
      if (fs.existsSync(wavFilePath)) fs.unlinkSync(wavFilePath);
    } catch (e) {
      console.error("Cleanup error:", e);
    }

  } catch (err) {
    console.error('Processing failed:', err);
    res.status(500).json({ error: 'Failed to process audio.' });
  }
});

const PORT = 3005;
app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
