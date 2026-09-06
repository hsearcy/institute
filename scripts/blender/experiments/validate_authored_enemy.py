"""Validate the rigid skeleton candidate without replacing public assets."""
import json,struct,sys
from pathlib import Path
import numpy as np


def validate(path):
    path=Path(path);data=path.read_bytes();assert data[:4]==b'glTF'
    length=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+length]);binary=data[28+length:]
    assert not doc.get('skins'),'Rigid horde candidate must not introduce per-enemy skins'
    assert not doc.get('animations'),'Guard metadata is separate from runtime animation'
    expected={'Body','Head','ArmUpperR','ArmLowerR','ArmUpperL','ArmLowerL','LegUpperR','LegLowerR','LegUpperL','LegLowerL','Sword'}
    joints={node.get('extras',{}).get('enemyJoint'):i for i,node in enumerate(doc['nodes']) if node.get('extras',{}).get('enemyJoint')}
    assert set(joints)==expected,(set(joints),expected)
    assert sum(bool(node.get('extras',{}).get('enemyJoint')) for node in doc['nodes'])==len(expected),'Duplicate joint identities'
    roots=[i for i,node in enumerate(doc['nodes']) if node.get('extras',{}).get('authoredEnemy') is True]
    assert len(roots)==1,'Exactly one authored root is required'
    authored_height=doc['nodes'][roots[0]]['extras'].get('authoredEnemyHeight')
    if authored_height is not None:assert authored_height==1.85,'Only the reviewed candidate height override is supported'
    guard=json.loads(doc['nodes'][roots[0]]['extras']['guardPoseYUp'])
    assert set(guard)==expected
    for pose in guard.values():
        assert len(pose['position'])==3 and np.isfinite(pose['position']).all()
        assert len(pose['quaternion'])==4 and abs(np.linalg.norm(pose['quaternion'])-1)<1e-5
    parents={child:i for i,node in enumerate(doc['nodes']) for child in node.get('children',[])}
    for name,index in joints.items():
        node=doc['nodes'][index]
        assert node['name'].startswith('Joint_'+name)
        if name!='Sword':assert np.allclose(node.get('rotation',[0,0,0,1]),[0,0,0,1],atol=1e-6),'Anatomical joints must use neutral bases'
        else:assert abs(np.linalg.norm(node.get('rotation',[0,0,0,1]))-1)<1e-6
        assert np.allclose(node.get('scale',[1,1,1]),[1,1,1])
        parent='ArmLowerR' if name=='Sword' else 'Body' if name=='Head' or name.startswith('ArmUpper') else 'ArmUpper'+name[-1] if name.startswith('ArmLower') else 'LegUpper'+name[-1] if name.startswith('LegLower') else None
        assert parents[index]==(joints[parent] if parent else roots[0]),(name,parent)
    for image in doc['images']:assert 'bufferView' in image and 'uri' not in image,'All textures must be embedded'
    for material in doc['materials']:assert material.get('extensions',{}).get('KHR_materials_transmission',{}).get('transmissionFactor',0)==0
    def accessor(index):
        a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
        dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
        return np.ndarray((a['count'],count),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dtype).itemsize*count),np.dtype(dtype).itemsize))
    transforms={}
    def world(index):
        if index in transforms:return transforms[index]
        node=doc['nodes'][index]
        if 'matrix' in node:m=np.array(node['matrix']).reshape(4,4).T
        else:
            x,y,z,w=node.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0])
        if index in parents:m=world(parents[index])@m
        transforms[index]=m;return m
    points=[];triangles=0;mesh_parts=set();uv_area=0
    for i,node in enumerate(doc['nodes']):
        if 'mesh' not in node:continue
        part=node['name'].split('_Baked')[0];assert part in joints;assert parents[i]==joints[part]
        assert part not in mesh_parts,'Duplicate rigid part';mesh_parts.add(part)
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            assert primitive.get('mode',4)==4
            positions=accessor(primitive['attributes']['POSITION']);assert np.isfinite(positions).all()
            uv=accessor(primitive['attributes']['TEXCOORD_0']);assert np.isfinite(uv).all()
            assert uv.min()>=-.0001 and uv.max()<=1.0001,'Atlas UV outside unit square'
            indices=accessor(primitive['indices']).reshape(-1,3)
            a=uv[indices[:,1]]-uv[indices[:,0]];b=uv[indices[:,2]]-uv[indices[:,0]]
            area=np.abs(a[:,0]*b[:,1]-a[:,1]*b[:,0]).sum()*.5
            assert area>1e-7,'Rigid part has collapsed atlas coordinates'
            uv_area+=float(area)
            points.append((world(i)@np.column_stack([positions,np.ones(len(positions))]).T).T[:,:3])
            triangles+=doc['accessors'][primitive['indices']]['count']//3
    assert mesh_parts==expected
    points=np.concatenate(points);bounds=[points.min(0).tolist(),points.max(0).tolist()]
    assert abs(bounds[0][1])<.015,bounds
    assert 1.76<bounds[1][1]-bounds[0][1]<1.84,bounds
    assert triangles<=55000,triangles
    assert uv_area>.01,'Atlas coordinates lost during edit-mode synchronization'
    report={'path':str(path),'bytes':len(data),'triangles':triangles,'joints':sorted(joints),'meshes':len(mesh_parts),'boundsYUp':bounds,'embeddedImages':len(doc['images']),'atlasTriangleArea':uv_area,'authoredEnemyHeight':authored_height}
    print(json.dumps(report,indent=2));return report


if __name__=='__main__':validate(sys.argv[1])
