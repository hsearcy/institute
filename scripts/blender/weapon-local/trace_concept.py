"""Local silhouette measurement and triangulation. No external services."""
from pathlib import Path
import argparse,json,cv2,numpy as np
from scipy.spatial import Delaunay
from PIL import Image
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'docs/concepts/weapon-model-review/local'
def trace(item,mask_edit=None):
 path=ROOT/'docs/concepts/weapon-model-review/references'/f'{item}-front.png'
 rgb=np.array(Image.open(path).convert('RGB'));h,w=rgb.shape[:2]
 # Background samples come from the crop margins, never from the object.
 bg=np.median(np.concatenate([rgb[:,:5],rgb[:,-5:]],axis=1),axis=1)[:,None,:]
 diff=np.linalg.norm(rgb.astype(float)-bg,axis=2)
 seed=np.where(diff>25,cv2.GC_PR_FGD,cv2.GC_PR_BGD).astype('uint8');seed[diff>75]=cv2.GC_FGD
 seed[:3]=0;seed[-3:]=0;seed[:,:3]=0;seed[:,-3:]=0
 cv2.grabCut(rgb,seed,None,np.zeros((1,65)),np.zeros((1,65)),4,cv2.GC_INIT_WITH_MASK)
 mask=np.isin(seed,[cv2.GC_FGD,cv2.GC_PR_FGD]).astype('uint8')
 n,labels,stats,_=cv2.connectedComponentsWithStats(mask,8)
 mask=np.isin(labels,[i for i in range(1,n) if stats[i,cv2.CC_STAT_AREA]>max(12,mask.sum()*.0002)]).astype('uint8')
 if mask_edit is not None:mask=mask_edit(mask)
 contours,_=cv2.findContours(mask,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
 spacing=max(3,int(np.ceil(np.sqrt(mask.sum()/1650))))
 pts=[]
 for contour in contours:
  c=cv2.approxPolyDP(contour,.65,True).reshape(-1,2)
  if len(c)<3:continue
  for a,b in zip(c,np.roll(c,-1,axis=0)):
   count=max(1,int(np.ceil(np.linalg.norm(b-a)/spacing)))
   pts.extend(a+(b-a)*j/count for j in range(count))
 for y in range(0,h,spacing):
  for x in range(0,w,spacing):
   if mask[y,x]:pts.append([x,y])
 pts=np.unique(np.round(pts,3),axis=0);faces=Delaunay(pts).simplices
 tri=pts[faces];samples=np.concatenate([tri.mean(axis=1)[:,None,:],(tri+np.roll(tri,1,axis=1))/2],axis=1).round().astype(int)
 keep=np.all(mask[np.clip(samples[:,:,1],0,h-1),np.clip(samples[:,:,0],0,w-1)]>0,axis=1);faces=faces[keep]
 used=np.unique(faces);remap=np.full(len(pts),-1);remap[used]=np.arange(len(used));pts=pts[used];faces=remap[faces]
 distance=cv2.distanceTransform(mask,cv2.DIST_L2,5)
 yy,xx=np.nonzero(mask);bounds=[int(xx.min()),int(yy.min()),int(xx.max()),int(yy.max())]
 # Local cross-section radius also supports round organic shafts.
 values=[]
 for x,y in pts:
  ix,iy=int(round(x)),int(round(y));values.append([float(x),float(y),float(distance[iy,ix]),float(rgb[iy,ix].mean()/255)])
 dest=OUT/item;dest.mkdir(parents=True,exist_ok=True)
 Image.fromarray(mask*255).save(dest/'mask.png')
 overlay=rgb.copy();overlay[mask==0]=(overlay[mask==0]*.35).astype('uint8');Image.fromarray(overlay).save(dest/'mask-review.png')
 (dest/'trace.json').write_text(json.dumps(dict(id=item,width=w,height=h,bounds=bounds,points=values,faces=faces.tolist(),reference=str(path.relative_to(ROOT)))))
 print(item,len(pts),len(faces),'mask',int(mask.sum()))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('ids',nargs='+');a=p.parse_args()
 for item in a.ids:trace(item)
