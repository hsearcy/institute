"""Six local solid staff models derived from original concept sheets.

No provider or old model input. Grip coordinates use the original sheet.
The shared helper traces closed topology and projects the concept surface.
"""
import bpy, math, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
IDS=('cinderwand','moonstaff','phoenix','wintercrown','tempest','winterbranch')
GRIPS={'cinderwand':(350,745),'moonstaff':(271,390),'phoenix':(239,660),'wintercrown':(293,744),'tempest':(240,440),'winterbranch':(251,550)}

def build(item_id):
    """Build rounded closed solids. Distance controls local section curvature.

    The traced face has full topology around holes. Front and back surfaces
    meet at thin boundaries and bulge to round shafts and thick metal roots.
    There are no alpha cards or a second coincident shaft surface.
    """
    import sys,numpy as np
    sys.path.insert(0,str(Path(__file__).parent))
    import common
    crops=json.loads((ROOT/'docs/concepts/weapon-model-review/references/crops.json').read_text())['items']
    crop=next(i['crop_xyxy'] for i in crops if i['id']==item_id)
    gp=GRIPS[item_id];grip=(gp[0]-crop[0],gp[1]-crop[1])
    root,data,unit,xyz=common.init(item_id,grip)
    mat=common.material(item_id,.05 if item_id in ('cinderwand','winterbranch') else .42,.64 if item_id in ('cinderwand','winterbranch') else .44)
    pts=np.array(data['points']);xy=pts[:,:2];ds=pts[:,2]
    # Radius sampled from nearby interior distances follows each branch/tine
    # independently, unlike a constant-depth extrusion.
    radii=[]
    for p,d in zip(xy,ds):
        near=np.sum((xy-p)**2,axis=1)<max(12,d*1.25)**2
        radii.append(max(d,float(ds[near].max())))
    lookup={tuple(p):r for p,r in zip(xy,radii)}
    def depth(x,y,d,l,u):
        r=lookup[(x,y)];bulge=math.sqrt(max(0,d*(2*r-d)))
        factor=.90 if item_id in ('cinderwand','winterbranch') else .70
        return max(.00045,bulge*u*factor)
    common.solid(root,data,unit,xyz,mat,depth,name='Rounded concept-shaped '+item_id)
    root['sourceDesign']='Original concept silhouette with locally rounded solid cross-sections; engraved concept surface'
    root['existingModelGeometryUsed']=False
    common.finish(root,item_id,'Rounded wood/metal cross-sections, complete open head silhouette and original concept surface. Locally authored; no provider asset.')

if __name__=='__main__':
    for item in IDS:build(item)
