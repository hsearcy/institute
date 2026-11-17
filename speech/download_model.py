"""Explicit one-time download only; the running worker never downloads artifacts."""
import argparse
from huggingface_hub import snapshot_download
from model_config import (MODEL_REPO, MODEL_REVISION, PROCESSOR_REPO,
                          PROCESSOR_REVISION, PROCESSOR_FILES, default_model_dir,
                          validate_model_dir)

def main():
    parser = argparse.ArgumentParser(description='Download pinned Bark artifacts for personal noncommercial use')
    parser.add_argument('--model-dir', default=str(default_model_dir()))
    args = parser.parse_args()
    from pathlib import Path
    target = Path(args.model_dir).expanduser()
    snapshot_download(repo_id=MODEL_REPO, revision=MODEL_REVISION, local_dir=str(target),
                      allow_patterns=['model.bark', 'bark_loader.py', 'LICENSE', 'NOTICE'])
    snapshot_download(repo_id=PROCESSOR_REPO, revision=PROCESSOR_REVISION, local_dir=str(target/'processor'),
                      allow_patterns=PROCESSOR_FILES)
    validate_model_dir(target)
    print(f'Pinned model and loader verified: {target}')

if __name__ == '__main__': main()
