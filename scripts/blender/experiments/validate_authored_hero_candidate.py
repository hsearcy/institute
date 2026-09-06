"""Validate the extended hero contract before any production promotion."""
from pathlib import Path
import json,struct
import numpy as np

PARENTS={'root':None,'pelvis':'root','chest':'pelvis','head':'chest',
         'cape':'chest','cape.mid':'cape','cape.hem':'cape.mid'}
for side in ('R','L'):
    PARENTS.update({'arm.'+side:'chest','forearm.'+side:'arm.'+side,'hand.'+side:'forearm.'+side,
                    'leg.'+side:'pelvis','shin.'+side:'leg.'+side,'foot.'+side:'shin.'+side})
DURATIONS={'idle':3.2,'walk':.8,'cast':1.1,'cleave':1.1}


def validate(path):
    path=Path(path);data=path.read_bytes();size,kind=struct.unpack_from('<II',data,12)
    assert kind==0x4e4f534a
    doc=json.loads(data[20:20+size]);binary=data[28+size:]
    assert 'KHR_materials_transmission' not in doc.get('extensionsUsed',[]), 'Hero cornea must not trigger a second scene render'
    assert all('KHR_materials_transmission' not in m.get('extensions',{}) for m in doc.get('materials',[])), 'No hero transmission materials'
    corneas=[m for m in doc['materials'] if m.get('name')=='AuthoredHero cornea']
    assert len(corneas)==1 and corneas[0].get('alphaMode')=='MASK'
    assert corneas[0]['pbrMetallicRoughness']['baseColorFactor'][3]==0, 'Keep authored irises visible beneath discarded corneal shells'
    assert len(doc.get('skins',[]))==1
    skin=doc['skins'][0];nodes=doc['nodes'];joint_indices=skin['joints']
    names={nodes[i]['name']:i for i in joint_indices};assert set(names)==set(PARENTS)
    node_parents={child:i for i,n in enumerate(nodes) for child in n.get('children',[])}
    for name,parent in PARENTS.items():
        if parent:assert node_parents[names[name]]==names[parent],name
    origins=[i for i,n in enumerate(nodes) if n.get('name')=='CastOrigin'];assert len(origins)==1
    assert node_parents[origins[0]]==names['hand.L']
    assert all('bufferView' in im and not im.get('uri') for im in doc['images'])
    assert all(not b.get('uri') for b in doc['buffers'])

    def read(index):
        accessor=doc['accessors'][index];view=doc['bufferViews'][accessor['bufferView']]
        dtype={5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[accessor['componentType']]
        count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[accessor['type']]
        item=np.dtype(dtype).itemsize;offset=view.get('byteOffset',0)+accessor.get('byteOffset',0)
        result=np.ndarray((accessor['count'],count),dtype=dtype,buffer=binary,offset=offset,strides=(view.get('byteStride',item*count),item)).copy()
        if accessor.get('normalized'):result=result/np.iinfo(np.dtype(dtype)).max
        assert np.isfinite(result).all()
        return result

    triangles=0
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            a=primitive['attributes'];assert {'POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0'}<=set(a)
            weights=read(a['WEIGHTS_0']);assert np.max(abs(weights.sum(1)-1))<.0001
            assert np.min(weights)>=0 and np.max(weights)<=1
            joints=read(a['JOINTS_0']);assert joints.min()>=0 and joints.max()<19
            triangles+=doc['accessors'][primitive['indices']]['count']//3
    clips={a['name']:a for a in doc['animations']};assert set(clips)==set(DURATIONS)
    for name,animation in clips.items():
        times=[read(s['input'])[:,0] for s in animation['samplers']]
        assert all(abs(t[0])<.000001 for t in times),name
        assert abs(max(t[-1] for t in times)-DURATIONS[name])<.000001,name
        assert all(np.all(np.diff(t)>0) for t in times)
        for channel in animation['channels']:
            if channel['target']=={'node':names['root'],'path':'translation'}:
                values=read(animation['samplers'][channel['sampler']]['output'])
                assert abs(values[:,[0,2]]).max()<.00001,'Horizontal root travel in '+name
    print(path.name,{'bytes':len(data),'triangles':triangles,'joints':19,'clips':DURATIONS,'embeddedImages':len(doc['images'])})
    return doc

if __name__=='__main__':
    import sys
    validate(sys.argv[1])
