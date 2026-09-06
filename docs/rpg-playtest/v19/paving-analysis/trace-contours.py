"""Trace bounded photo-registered stones from the existing cleaned mortar mask."""
from pathlib import Path
import base64,json
import numpy as np
from scipy import ndimage
r=Path('/home/houston/git/institute');f=json.loads((r/'tmp/paving-joint-field.json').read_text());n=f['size']
joints=np.frombuffer(base64.b64decode(f['jointsBase64']),dtype=np.uint8).reshape(n,n)
labels,count=ndimage.label(joints==0);regions=[]
# Keep closed interior regions only. Open mortar runs are deliberately reported,
# not silently converted into a made-up regular grid.
for label,sl in enumerate(ndimage.find_objects(labels),1):
 if sl is None:continue
 ys,xs=sl;mask=labels[sl]==label;area=int(mask.sum());w=xs.stop-xs.start;h=ys.stop-ys.start
 if area<1200 or area>70000 or xs.start<5 or ys.start<5 or xs.stop>n-5 or ys.stop>n-5:continue
 edges={}
 for y,x in zip(*np.nonzero(mask)):
  gy,gx=int(y+ys.start),int(x+xs.start)
  for neighbor,a,b in [((y-1,x),(gx,gy),(gx+1,gy)),((y,x+1),(gx+1,gy),(gx+1,gy+1)),((y+1,x),(gx+1,gy+1),(gx,gy+1)),((y,x-1),(gx,gy+1),(gx,gy))]:
   yy,xx=neighbor
   if yy<0 or xx<0 or yy>=h or xx>=w or not mask[yy,xx]:edges.setdefault(a,[]).append(b)
 loops=[]
 while edges:
  start=next(iter(edges));path=[start];current=start
  for _ in range(area*4+4):
   opts=edges.get(current)
   if not opts:break
   current=opts.pop()
   if not opts:del edges[path[-1]]
   path.append(current)
   if current==start:loops.append(path);break
  else:raise RuntimeError('Contour did not close')
 if not loops:continue
 signed=lambda p:sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(p,p[1:]))/2
 outer=max(loops,key=lambda p:abs(signed(p)))
 # Collinear run removal preserves every original corner and pixel extent.
 simple=[outer[i] for i in range(len(outer)-1) if (outer[i][0]-outer[i-1][0])*(outer[(i+1)%(len(outer)-1)][1]-outer[i][1])!=(outer[i][1]-outer[i-1][1])*(outer[(i+1)%(len(outer)-1)][0]-outer[i][0])]
 regions.append({'label':label,'pixels':area,'bounds':[xs.start,ys.start,xs.stop,ys.stop],'contour':simple})
regions.sort(key=lambda p:p['pixels'],reverse=True)
out={'photo':f['photo'],'size':n,'worldTileMeters':4.8,'floorY':-.05,'closedRegions':regions,'allComponents':count,'jointPixels':int(joints.sum()),'status':'unreviewed contours; no generated floor geometry'}
(r/'tmp/paving-closed-contours.json').write_text(json.dumps(out))
print(json.dumps({'allComponents':count,'closedRegions':len(regions),'areas':[p['pixels'] for p in regions[:15]]}))
