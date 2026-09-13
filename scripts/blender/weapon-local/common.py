"""Local solid geometry and concept surface projection for rigid equipment."""
from pathlib import Path
import json,math,bpy,bmesh
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
DATA=ROOT/'docs/concepts/weapon-model-review/local'
SPECS={x['id']:x for x in json.loads((ROOT/'scripts/blender/items/catalogue.json').read_text())['items']}
def init(item,grip_px,flip=False):
 bpy.ops.wm.read_factory_settings(use_empty=True)
 data=json.loads((DATA/item/'trace.json').read_text());box=data['bounds'];unit=SPECS[item]['length']/(box[3]-box[1]);sign=-1 if flip else 1
 root=bpy.data.objects.new(item+'_LocalConcept',None);bpy.context.scene.collection.objects.link(root)
 root['itemId']=item;root['attachment']=SPECS[item]['attachment'];root['sourceUnits']='meters';root['gripNode']=item+'_Grip';root['tipNode']=item+'_Tip'
 for k,v in SPECS[item]['preview'].items():
  if isinstance(v,(int,float)):root['preview'+k[0].upper()+k[1:]]=v
 def xyz(x,y,depth=0):return Vector(((x-grip_px[0])*unit*sign,-depth,(grip_px[1]-y)*unit*sign))
 return root,data,unit,xyz

def material(item,metal=.4,rough=.55):
 m=bpy.data.materials.new(item+'_ConceptPBR');m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
 texture=DATA/item/'albedo.png'
 if not texture.exists():texture=ROOT/'docs/concepts/weapon-model-review/references'/f'{item}-front.png'
 tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(texture));m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color']);return m

def solid(root,data,unit,xyz,mat,depth_fn,region=None,name='Forged shaped surface'):
 pts=data['points'];selected=[]
 for face in data['faces']:
  if region and not all(region(pts[i][0],pts[i][1]) for i in face):continue
  selected.append(face)
 used=sorted({i for f in selected for i in f});mapping={old:i for i,old in enumerate(used)};points=[pts[i] for i in used];faces=[[mapping[i] for i in f] for f in selected]
 edges={}
 for f in faces:
  for a,b in zip(f,f[1:]+f[:1]):
   key=tuple(sorted((a,b)));edges[key]=edges.get(key,0)+1
 boundary={i for edge,uses in edges.items() if uses==1 for i in edge}
 count=len(points);verts=[];uvs=[]
 for side in [1,-1]:
  for i,(x,y,d,l) in enumerate(points):
   depth=.00035 if i in boundary else max(.00035,depth_fn(x,y,d,l,unit));verts.append(xyz(x,y,depth*side));uvs.append(((x+.5)/data['width'],1-(y+.5)/data['height']))
 allfaces=[tuple(f) for f in faces]+[tuple(i+count for i in reversed(f)) for f in faces]
 edges={}
 for f in faces:
  for a,b in zip(f,f[1:]+f[:1]):
   key=tuple(sorted((a,b)));edges[key]=edges.get(key,0)+1
 for (a,b),uses in edges.items():
  if uses==1:allfaces.append((a,b,b+count,a+count))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],allfaces);mesh.update();mesh.materials.append(mat)
 layer=mesh.uv_layers.new(name='ConceptUV')
 for poly in mesh.polygons:
  poly.use_smooth=True
  for li in poly.loop_indices:layer.data[li].uv=uvs[mesh.loops[li].vertex_index]
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update()
 obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj);obj.parent=root
 return obj

def finish(root,item,extra=None):
 objects=[o for o in root.children_recursive if o.type=='MESH'];bpy.context.view_layer.update()
 vertices=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
 grip=bpy.data.objects.new(item+'_Grip',None);bpy.context.scene.collection.objects.link(grip);grip.parent=root;grip['attachmentRole']='Grip'
 tip=bpy.data.objects.new(item+'_Tip',None);bpy.context.scene.collection.objects.link(tip);tip.parent=root;tip.location=max(vertices,key=lambda v:v.z);tip['attachmentRole']='Tip'
 root['buildMethod']='Local Blender solid geometry with concept surface projection'
 if extra:root['designNotes']=extra
 out=DATA/item;out.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(out/'source.blend'))
 dest=ROOT/'web/public/assets/rpg/items/candidates';dest.mkdir(parents=True,exist_ok=True)
 bpy.ops.export_scene.gltf(filepath=str(dest/(item+'.glb')),export_format='GLB',export_yup=True,export_extras=True,export_image_format='JPEG',export_jpeg_quality=90)
 triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
 result=dict(id=item,triangles=triangles,meshes=len(objects),bytes=(dest/(item+'.glb')).stat().st_size,method='Local solid geometry and original concept projection',grip=[0,0,0],tip=list(tip.location))
 (out/'build.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
