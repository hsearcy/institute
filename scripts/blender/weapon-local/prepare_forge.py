"""Clean background at grounded tips and smooth forged outlines before meshing."""
import sys
from pathlib import Path
import cv2,numpy as np
from scipy.ndimage import gaussian_filter1d
from PIL import Image
from trace_concept import trace,ROOT
def prepare(item):
 rgb=np.array(Image.open(ROOT/'docs/concepts/weapon-model-review/references'/f'{item}-front.png').convert('RGB'))
 def edit(mask):
  h,w=mask.shape
  bg=np.median(np.concatenate([rgb[:,:5],rgb[:,-5:]],axis=1),axis=1)[:,None,:]
  delta=np.linalg.norm(rgb.astype(float)-bg,axis=2)
  # Ground shadows and neutral crop masks are not part of the physical object.
  footer=np.indices(mask.shape)[0]>h*.945
  mask[footer & (delta<72)]=0
  mask=(cv2.GaussianBlur(mask.astype(float),(5,5),.85)>.5).astype('uint8')
  n,labels,stats,_=cv2.connectedComponentsWithStats(mask,8)
  mask=np.isin(labels,[i for i in range(1,n) if stats[i,cv2.CC_STAT_AREA]>30]).astype('uint8')
  if item=='cleaver':
   mask[904:,201:]=0
   mask[913:]=0
  if item=='sunforged':
   # The polished right cutting edge was falsely removed by foreground thresholding.
   tip=np.array([[139,828],[180,828],[174,883],[160,931],[148,899]],np.int32)
   mask[828:]=0;cv2.fillPoly(mask,[tip],1)
  if item=='apprentice':
   # The reference has continuous straight edges, not the tiny scratches GrabCut follows.
   rows=[y for y in range(22,620) if mask[y].any()]
   left=gaussian_filter1d(np.array([np.flatnonzero(mask[y])[0] for y in rows],float),2)
   right=gaussian_filter1d(np.array([np.flatnonzero(mask[y])[-1] for y in rows],float),2)
   for y,a,b in zip(rows,left,right):mask[y]=0;mask[y,int(round(a)):int(round(b))+1]=1
  return mask
 trace(item,edit)
if __name__=='__main__':
 for item in sys.argv[1:]:prepare(item)
