"""Restore pinned public-domain/CC0 item study inputs into ignored workspace."""
import hashlib
import json
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'tmp/item-models/references'
FILES=[
 ('Diffuse','pine_bark_diff_1k.jpg','89ddfbff0388d30caff902ba600cdf75eb1e651ca71ece6594b5a9b27abb47ab'),
 ('Displacement','pine_bark_disp_1k.jpg','c60297bdf591983f2d2fa69066ba3a6556d79011780bf0f950a2f5194b5978d1'),
 ('Rough','pine_bark_rough_1k.jpg','04f466447098d0b6d3d4abdc69ce5766d5da67eedfa076e4a3f22fe6996a60a8'),
]

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    for name,file,expected in FILES:
        path=OUT/(name+'.jpg')
        if not path.exists():
            url='https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/pine_bark/'+file
            path.write_bytes(urllib.request.urlopen(url,timeout=60).read())
        actual=hashlib.sha256(path.read_bytes()).hexdigest()
        if actual!=expected:raise ValueError('Reference hash mismatch: '+name)
    print('Pinned CC0 bark references verified')

if __name__=='__main__':main()
