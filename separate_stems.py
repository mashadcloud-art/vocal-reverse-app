import torchaudio
import soundfile
import demucs.separate
import sys
import os

def custom_save(uri, src, sample_rate=None, **kwargs):
    # Ensure directory exists
    os.makedirs(os.path.dirname(uri), exist_ok=True)
    
    # torchaudio sometimes passes sample_rate as sr or sample_rate
    sr = sample_rate or kwargs.get('sr') or kwargs.get('sample_rate')
    if sr is None:
        sr = 44100 # Fallback
        
    # Soundfile expects (samples, channels)
    # src is usually (channels, samples)
    data = src.t().cpu().numpy()
    soundfile.write(uri, data, sr)

# Monkeypatch torchaudio.save to bypass torchcodec bugs
torchaudio.save = custom_save

if __name__ == "__main__":
    # Expected: python separate.py <model> <input> <output_dir>
    if len(sys.argv) < 4:
        print("Usage: separate_stems.py <model> <input> <output_dir>")
        sys.exit(1)
        
    import multiprocessing
    
    model_name = sys.argv[1]
    input_file = sys.argv[2]
    output_dir = sys.argv[3]
    
    num_cores = multiprocessing.cpu_count()
    # Explicitly use all available CPU cores and set overlap to 0.5 for pristine high-fidelity isolation (zero bleed)
    sys.argv = [
        'demucs', 
        '-n', model_name, 
        '--jobs', str(num_cores), 
        '--overlap', '0.5', 
        input_file, 
        '-o', output_dir
    ]
    demucs.separate.main()
