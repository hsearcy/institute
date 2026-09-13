"""Extend interior surface colors across silhouette seams, without background pixels."""
from pathlib import Path
import sys
import cv2
import numpy as np
from scipy.ndimage import distance_transform_edt
from PIL import Image
ROOT=Path(__file__).resolve().parents[3]
for item in sys.argv[1:]:
 folder=ROOT/'docs/concepts/weapon-model-review/local'/item
 rgb=np.array(Image.open(ROOT/'docs/concepts/weapon-model-review/references'/f'{item}-front.png').convert('RGB'))
 mask=np.array(Image.open(folder/'mask.png'))>0
 # Retain fine details on faces; replace only edge pixels with nearby interior color.
 core=cv2.erode(mask.astype('uint8'),np.ones((5,5),np.uint8))>0
 nearest=distance_transform_edt(~core,return_distances=False,return_indices=True)
 rgb[~core]=rgb[nearest[0][~core],nearest[1][~core]]
 Image.fromarray(rgb).save(folder/'albedo.png')
 print(item)
