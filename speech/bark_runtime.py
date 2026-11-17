"""Offline Bark inference. No Institute app, database, credentials or audio storage."""
import gc
import importlib.util
import json
import os
import time
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ.setdefault('OMP_NUM_THREADS', '2')
import numpy as np
import torch
from transformers import AutoProcessor, GenerationConfig, ParakeetForTDT, ParakeetTDTConfig
from model_config import MODEL_REVISION, MAX_AUDIO_BYTES, default_model_dir, validate_model_dir

class BarkTranscriber:
    def __init__(self, model_dir=None):
        started = time.perf_counter()
        directory = validate_model_dir(model_dir or default_model_dir())
        torch.set_num_threads(2)
        torch.set_num_interop_threads(1)
        if not torch.cuda.is_available():
            raise RuntimeError('Bark requires a compatible CUDA GPU; typing remains available without it')
        spec = importlib.util.spec_from_file_location('pinned_bark_loader', directory/'bark_loader.py')
        if spec is None or spec.loader is None: raise RuntimeError('Could not load the verified Bark decoder')
        loader = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(loader)
        print('Loading verified local Bark weights', flush=True)
        state, config = loader.load_state_dict(directory/'model.bark')
        # GPU construction keeps generated buffers real without a second full CPU model.
        # Meta + assign leaves nonpersistent buffers on meta and cannot be moved safely.
        with torch.device('cuda'):
            model = ParakeetForTDT(ParakeetTDTConfig.from_dict(config))
        missing, unexpected = model.load_state_dict(state, strict=False)
        if unexpected or any('num_batches_tracked' not in key for key in missing):
            raise RuntimeError(f'Checkpoint mismatch: {missing}, {unexpected}')
        model.generation_config = GenerationConfig.from_pretrained(directory/'processor', local_files_only=True)
        self.model = model.eval().to(device='cuda', dtype=torch.float32)
        del state
        gc.collect()
        self.processor = AutoProcessor.from_pretrained(directory/'processor', local_files_only=True)
        print(json.dumps({'model':'Underdog Bark 3.0', 'revision':MODEL_REVISION,
                          'load_seconds':time.perf_counter()-started,
                          'device':torch.cuda.get_device_name(),
                          'cuda_allocated_mib':torch.cuda.memory_allocated()/1024**2}), flush=True)

    def warmup(self):
        # Exercise the real feature extractor and model without a saved voice recording.
        self._decode(np.zeros(16000, dtype=np.float32))

    def transcribe(self, pcm_bytes):
        if not pcm_bytes: return ''
        if len(pcm_bytes) % 2 or len(pcm_bytes) > MAX_AUDIO_BYTES:
            raise ValueError('Audio must be bounded mono PCM16 at 16 kHz')
        wave = np.frombuffer(pcm_bytes, dtype='<i2').astype(np.float32) / 32768.0
        if not np.any(wave): return ''
        return self._decode(wave)

    def _decode(self, wave):
        wave = np.concatenate([np.zeros(4000, np.float32), wave])
        inputs = self.processor([wave], sampling_rate=16000, return_tensors='pt', padding=True)
        inputs = {key:(value.to('cuda',torch.float32) if value.dtype.is_floating_point else value.to('cuda'))
                  for key,value in inputs.items()}
        with torch.inference_mode():
            result = self.model.generate(**inputs)
        return self.processor.batch_decode(result.sequences, skip_special_tokens=True)[0].strip()
