import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

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

app.post('/api/download-url', async (req, res) => {
  const { url, format = 'wav', skipSeparation = false, bitrate = '320k' } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  // Dynamic cookies.txt shield detection
  const COOKIES_PATH = path.join(__dirname, 'cookies.txt');
  const cookiesFlag = fs.existsSync(COOKIES_PATH) ? `--cookies "${COOKIES_PATH}"` : '';

  console.log(`Fetching metadata for: ${url} (Cookies: ${fs.existsSync(COOKIES_PATH)})`);
  
  try {
    // 1. Get Title, Thumbnail and Sanitize
    const metadata = await new Promise((resolve, reject) => {
      exec(`yt-dlp ${cookiesFlag} --get-title --get-thumbnail --get-id --no-playlist "${url}"`, (error, stdout) => {
        if (error) return reject(error);
        const lines = stdout.trim().split('\n');
        const title = lines[0]?.trim() || 'downloaded_audio';
        let thumbnail = lines[1]?.trim() || null;
        const videoId = lines[2]?.trim() || null;
        
        if (!thumbnail && videoId && url.includes('youtube.com')) {
          thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        }

        resolve({
          title: title.replace(/[^a-z0-9]/gi, '_').substring(0, 50),
          thumbnail: thumbnail
        });
      });
    }).catch(() => ({ title: 'downloaded_audio', thumbnail: null }));

    const uniqueId = Date.now();
    const safeTitle = `${metadata.title}_${uniqueId}`;
    const extension = format === 'mp3' ? 'mp3' : (format === 'flac' ? 'flac' : 'wav');
    const outputPath = path.join(UPLOADS_DIR, `${safeTitle}.%(ext)s`);
    
    console.log(`Downloading: ${safeTitle} in ${extension} (${bitrate})`);
    
    // 2. Download with cookies and explicit output template
    await new Promise((resolve, reject) => {
      const formatFlag = extension === 'wav' ? 'wav' : (extension === 'mp3' ? 'mp3' : 'flac');
      const qualityFlag = extension === 'mp3' ? `--audio-quality ${bitrate}` : '--audio-quality 0';
      
      exec(`yt-dlp ${cookiesFlag} --no-playlist -f "ba" -x --audio-format ${formatFlag} ${qualityFlag} -o "${outputPath}" "${url}"`, (error, stdout, stderr) => {
        if (error) {
          console.error('yt-dlp error:', stderr || stdout || error.message);
          return reject(error);
        }
        resolve();
      });
    });

    // 3. Find the file
    const files = fs.readdirSync(UPLOADS_DIR);
    const downloadedFile = files.find(f => f.startsWith(safeTitle));
    
    if (!downloadedFile) throw new Error('Download failed: File not found');

    const fullPath = path.join(UPLOADS_DIR, downloadedFile);
    const stats = fs.statSync(fullPath);
    
    if (stats.size < 10000) {
        throw new Error(`Download failed: File too small (${stats.size} bytes). Check URL.`);
    }

    if (skipSeparation) {
      return res.json({ 
        success: true, 
        directUrl: `/files/uploads/${downloadedFile}`,
        fileName: downloadedFile,
        thumbnail: metadata.thumbnail
      });
    }

    res.json({ 
      success: true, 
      filePath: fullPath,
      fileName: downloadedFile,
      thumbnail: metadata.thumbnail,
      previewUrl: `/files/uploads/${downloadedFile}`
    });
  } catch (err) {
    console.error('Download process failed:', err);
    res.status(500).json({ error: err.message || 'Failed to download audio.' });
  }
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
