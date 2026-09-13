"""Submit once, then query and download the Skeleton source model.

Uses the installed Tripo skill client. Never writes credentials or signed URLs.
Run from the repository root. `submit` refuses to replace an existing task.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import os
import shlex

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
SKILL = Path.home() / '.agents/skills/threejs-3d-generator/scripts/threejs_3d_asset.py'
spec = importlib.util.spec_from_file_location('tripo_skill', SKILL)
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


def key():
    for line in (ROOT / '.env').read_text().splitlines():
        if line.strip().startswith(('TRIPO_API_KEY=', 'export TRIPO_API_KEY=')):
            value = line.split('=', 1)[1].strip()
            return shlex.split(value)[0] if value else ''
    return os.environ.get('TRIPO_API_KEY', '')


def save(name, data):
    (OUT / name).write_text(json.dumps(data, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['submit', 'status'])
    args = parser.parse_args()
    api_key = key()
    if not api_key:
        raise SystemExit('TRIPO_API_KEY=MISSING')
    print('TRIPO_API_KEY=SET')
    task_path = OUT / 'task.json'
    if args.action == 'submit':
        if task_path.exists():
            raise SystemExit('A task already exists. Use status.')
        inputs = {view: OUT / 'reference' / f'{view}.png' for view in ['front', 'back']}
        tokens = {view: api.multipart_upload(api_key, path) for view, path in inputs.items()}
        settings = dict(type='multiview_to_model', model_version='v3.1-20260211',
                        geometry_quality='detailed', texture_quality='detailed',
                        texture=True, pbr=True, texture_alignment='original_image',
                        orientation='align_image', auto_size=True,
                        enable_image_autofix=False, quad=False, generate_parts=False,
                        smart_low_poly=False, export_uv=True,
                        model_seed=20260912, texture_seed=20260912)
        files = [{'type': 'png', 'file_token': tokens['front']}, {},
                 {'type': 'png', 'file_token': tokens['back']}, {}]
        task_id = api.submit_task(api_key, dict(settings, files=files))
        save('task.json', dict(task_id=task_id, settings=settings,
                              view_order=['front', None, 'back', None],
                              inputs={v: dict(path=str(p.relative_to(ROOT)), sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for v,p in inputs.items()}))
    else:
        task_id = json.loads(task_path.read_text())['task_id']
    task = api.get_task(api_key, task_id)
    safe = {k: task[k] for k in ['task_id', 'type', 'status', 'progress', 'create_time', 'start_time', 'finish_time', 'error_code', 'error_msg', 'consumed_credit', 'credits_consumed'] if k in task}
    output = task.get('output') or {}
    safe['output_fields'] = list(output)
    if task.get('status') == 'success':
        downloaded = {}
        for name, url in output.items():
            if isinstance(url, str) and url.startswith('https://'):
                local = OUT / 'source'
                found = list(local.glob(f'skeleton-{name}.*'))
                path = found[0] if found else api.download_url(url, local, 'skeleton', name)
                downloaded[name] = dict(path=str(path.relative_to(ROOT)), bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest())
        safe['downloads'] = downloaded
    save('status.json', safe)
    print(json.dumps(safe, indent=2))


if __name__ == '__main__':
    main()
