import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { exec, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

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

// Store active downloads globally
const activeDownloads = {};

app.post('/api/download-url', async (req, res) => {
  const { url, format = 'wav', skipSeparation = false, bitrate = '320k', downloadId = Date.now().toString() } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const uniqueId = Date.now();
  const extension = format === 'mp3' ? 'mp3' : format === 'flac' ? 'flac' : 'wav';

  // 1. Dynamic YouTube / generic thumbnail constructor
  let thumbnail = null;
  const ytIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytIdMatch) {
    thumbnail = `https://img.youtube.com/vi/${ytIdMatch[1]}/hqdefault.jpg`;
  } else {
    thumbnail = 'https://images.unsplash.com/photo-1614680376593-902f74fa0d41?q=80&w=300&auto=format&fit=crop';
  }

  // 2. High-performance, unblocked Cobalt API instances with bulletproof failover
  const cobaltInstances = [
    'https://api.cobalt.tools/api/json',
    'https://cobalt-api.lunes.host/api/json',
    'https://cobalt.api.ryuko.space/api/json'
  ];

  let downloadUrl = null;
  let cleanTitle = 'downloaded_audio';
  let successInstance = null;

  for (const instance of cobaltInstances) {
    console.log(`[Downloader] Trying Cobalt instance: ${instance}...`);
    try {
      const response = await fetch(instance, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: url,
          isAudioOnly: true,
          aFormat: extension,
          audioBitrate: bitrate === '320k' ? '320' : '128'
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'stream' || data.status === 'redirect') {
          downloadUrl = data.url;
          cleanTitle = (data.picker || 'downloaded_audio').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
          successInstance = instance;
          break;
        }
      }
    } catch (err) {
      console.warn(`[Downloader] Cobalt instance ${instance} failed:`, err.message);
    }
  }

  if (!downloadUrl) {
    return res.status(500).json({ error: 'All free Cobalt bypass gateways are temporarily down or rate-limited. Please try again in a moment.' });
  }

  console.log(`[Downloader] Cobalt siphoning succeeded via: ${successInstance}!`);

  // 3. Stream unblocked audio directly into local uploads/ folder to keep demucs stems & splitter pipeline intact
  const safeTitle = `${cleanTitle}_${uniqueId}`;
  const finalFileName = `${safeTitle}.${extension}`;
  const fullPath = path.join(UPLOADS_DIR, finalFileName);

  try {
    console.log(`[Downloader] Streaming audio bypass download directly to: ${fullPath}...`);
    const streamResponse = await fetch(downloadUrl);
    if (!streamResponse.ok) {
      throw new Error(`Failed to stream from Cobalt server: ${streamResponse.statusText}`);
    }

    const fileStream = fs.createWriteStream(fullPath);
    await pipeline(Readable.fromWeb(streamResponse.body), fileStream);

    const stats = fs.statSync(fullPath);
    if (stats.size < 10000) throw new Error(`Stream resulted in empty/corrupted file (${stats.size} bytes)`);

    console.log(`[Downloader] Stream finished successfully. File size: ${stats.size} bytes.`);

    if (skipSeparation) {
      return res.json({
        success: true,
        downloadId,
        directUrl: `/files/uploads/${finalFileName}`,
        fileName: finalFileName,
        thumbnail: thumbnail
      });
    }

    res.json({
      success: true,
      downloadId,
      filePath: fullPath,
      fileName: finalFileName,
      thumbnail: thumbnail,
      previewUrl: `/files/uploads/${finalFileName}`
    });

  } catch (err) {
    console.error('Download stream writing failed:', err);
    // Cleanup partial file if it exists
    if (fs.existsSync(fullPath)) {
      try { fs.unlinkSync(fullPath); } catch (e) {}
    }
    res.status(500).json({ error: err.message || 'Failed to download and stream audio.' });
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
