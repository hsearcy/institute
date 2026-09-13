"""Add a small manual skin to approved enemy geometry. KIND is supplied by MCP."""
import bpy,numpy as np,json,os,hashlib,math
from mathutils import Vector
ROOT='/home/hfsearcy/git/institute';KIND=globals().get('KIND','skeleton');REV=globals().get('REV',1)
OUT=ROOT+'/docs/concepts/enemy-animation/'+KIND;os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
source=ROOT+'/web/public/assets/rpg/'+KIND+'.glb';bpy.ops.import_scene.gltf(filepath=source)
meshes=[o for o in bpy.data.objects if o.type=='MESH'];points=np.array([tuple(o.matrix_world@v.co) for o in meshes for v in o.data.vertices]);floor=points[:,2].min();H=float(np.ptp(points[:,2]))
# Apply source orientation/scale and move only the floor. No vertex shape edits.
for o in meshes:
 mw=o.matrix_world.copy()
 for v in o.data.vertices:p=mw@v.co;p.z-=floor;v.co=p
 o.parent=None;o.matrix_world.identity();o.data.update()
rock=KIND in ['guardian','vault-guardian-boss'];boss=KIND=='vault-guardian-boss'
cfg={
 'skeleton':dict(pelvis=.57,chest=.78,neck=.855,head=.945,shoulder=(.125,.80),elbow=(.165,.65),wrist=(.184,.485),hip=(.074,.56),knee=(.090,.315),ankle=(.105,.085)),
 'revenant':dict(pelvis=.565,chest=.775,neck=.865,head=.94,shoulder=(.148,.79),elbow=(.182,.645),wrist=(.194,.505),hip=(.083,.55),knee=(.105,.32),ankle=(.125,.085)),
 'guardian':dict(pelvis=.475,chest=.72,neck=.79,head=.88,shoulder=(.235,.76),elbow=(.278,.565),wrist=(.300,.365),hip=(.095,.465),knee=(.107,.32),ankle=(.135,.105)),
 'vault-guardian-boss':dict(pelvis=.455,chest=.675,neck=.735,head=.83,shoulder=(.23,.70),elbow=(.295,.515),wrist=(.313,.30),hip=(.092,.445),knee=(.107,.30),ankle=(.14,.095))}[KIND]
def point(x,y,z):return Vector((x*H,y*H,z*H))
heads={'Pelvis':point(0,0,cfg['pelvis']),'Spine':point(0,0,(cfg['pelvis']+cfg['chest'])/2),'Chest':point(0,0,cfg['chest']),'Head':point(0,-.015 if rock else 0,cfg['neck'])}
parents={'Pelvis':None,'Spine':'Pelvis','Chest':'Spine','Head':'Chest'};tails={}
for side,s in [('L',1),('R',-1)]:
 for name,key,y in [('UpperArm','shoulder',0),('Forearm','elbow',-.005),('Hand','wrist',-.025),('Thigh','hip',0),('Shin','knee',-.012),('Foot','ankle',0)]:
  x,z=cfg[key];heads[name+side]=point(s*x,y,z)
 parents.update({f'UpperArm{side}':'Chest',f'Forearm{side}':f'UpperArm{side}',f'Hand{side}':f'Forearm{side}',f'Thigh{side}':'Pelvis',f'Shin{side}':f'Thigh{side}',f'Foot{side}':f'Shin{side}'})
 for name,nextname in [('UpperArm','Forearm'),('Forearm','Hand'),('Thigh','Shin'),('Shin','Foot')]:tails[name+side]=heads[nextname+side]
 tails['Hand'+side]=heads['Hand'+side]+point(0,-.01,-.055)
 tails['Foot'+side]=heads['Foot'+side]+point(0,-.07,-.05)
tails.update({'Pelvis':heads['Spine'],'Spine':heads['Chest'],'Chest':heads['Head'],'Head':point(0,-.02 if rock else 0,cfg['head'])})
if not rock:
 heads['WeaponR']=point(-.154,.008,.465) if KIND=='skeleton' else heads['HandR'].copy();tails['WeaponR']=heads['WeaponR']+point(0,0,-.20);parents['WeaponR']='HandR'
 heads['Cloth']=point(0,.01,cfg['pelvis']);tails['Cloth']=point(0,.01,.32);parents['Cloth']='Pelvis'
if KIND=='revenant':heads['ShieldL']=heads['HandL'].copy();tails['ShieldL']=heads['ShieldL']+point(0,0,-.15);parents['ShieldL']='HandL'
armdata=bpy.data.armatures.new(KIND+' manual rig');arm=bpy.data.objects.new('EnemyRig',armdata);bpy.context.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for name,head in heads.items():
 b=armdata.edit_bones.new(name);b.head=head;b.tail=tails[name];b.use_deform=True
for name,p in parents.items():
 if p:armdata.edit_bones[name].parent=armdata.edit_bones[p]
bpy.ops.object.mode_set(mode='OBJECT');arm['animationRig']='tripo-manual-v1';arm['enemyKind']=KIND;arm['floorNormalized']=True
# Region assignment then narrow joint blending avoids pulling far props into legs.
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def between(z,upper,lower,cut,width):
 t=smooth((z-cut+width)/(2*width));return {upper:t,lower:1-t}
def weights(p,is_cloth=False):
 x,y,z=np.array(p)/H;ax=abs(x);side='L' if x>=0 else 'R'
 if not rock and z>cfg['neck']-.007:return {'Head':1}
 if rock and z>cfg['neck'] and z<cfg['head']+.025 and ax<.09 and y<-.055:return {'Head':1}
 if not rock:
  # Sword below the hand sits outside the right thigh in both approved sources.
  blade_x=-.192-(cfg['wrist'][1]-z)*.14
  # Prop ownership is assigned by connected surface below, not a point cutoff.
  if KIND=='revenant' and y>.060 and .24<z<.74 and ax<(.17 if z>.50 else .245):
   return between(z,'Chest','Cloth',.62,.10) if z>.52 else {'Cloth':1}

  # Long central tabard remains connected to the belt; later motion can bend Cloth.
  if KIND=='skeleton' and is_cloth and .20<z<cfg['pelvis']-.015:return {'Cloth':1}
  if KIND=='revenant' and ax<.085 and .28<z<cfg['pelvis']-.025 and y<.008:return {'Cloth':1}
 # Arm body separator follows the armpit toward elbow, with narrow neck near waist.
 cut=(.185 if z<.51 else .175) if rock else ((.174 if z<.59 else .123) if KIND=='revenant' else (.152 if z<.59 else .104))
 armzone=ax>cut and z>((.12 if boss else .15) if rock else cfg['wrist'][1]-.17) and z<cfg['shoulder'][1]+(.105 if rock else .06)
 if armzone:
  ez=cfg['elbow'][1];wz=cfg['wrist'][1]
  if z>ez+.028:return {'UpperArm'+side:1}
  if z>ez-.028:return between(z,'UpperArm'+side,'Forearm'+side,ez,.028)
  if z>wz+.018:return {'Forearm'+side:1}
  if z>wz-.018:return between(z,'Forearm'+side,'Hand'+side,wz,.018)
  return {'Hand'+side:1}
 if z<cfg['pelvis']-.025 and ax>.037:
  kz=cfg['knee'][1];az=cfg['ankle'][1]
  if z>kz+.025:return {'Thigh'+side:1}
  if z>kz-.025:return between(z,'Thigh'+side,'Shin'+side,kz,.025)
  if z>az+.020:return {'Shin'+side:1}
  if z>az-.020:return between(z,'Shin'+side,'Foot'+side,az,.020)
  return {'Foot'+side:1}
 if z<cfg['pelvis']+.025:return {'Pelvis':1}
 spine=(cfg['pelvis']+cfg['chest'])/2
 if z<spine:return between(z,'Spine','Pelvis',cfg['pelvis']+.045,.045)
 return between(z,'Chest','Spine',cfg['chest']-.025,.045)
def chain_weights(z,side,arm=False):
 width=.025
 if arm:
  if z>cfg['elbow'][1]-.028:return between(z,'UpperArm'+side,'Forearm'+side,cfg['elbow'][1],.028)
  if z>cfg['wrist'][1]-.018:return between(z,'Forearm'+side,'Hand'+side,cfg['wrist'][1],.018)
  return {'Hand'+side:1}
 if z>cfg['knee'][1]-width:return between(z,'Thigh'+side,'Shin'+side,cfg['knee'][1],width)
 if z>cfg['ankle'][1]-.020:return between(z,'Shin'+side,'Foot'+side,cfg['ankle'][1],.020)
 return {'Foot'+side:1}
def component_ownership(o):
 import collections
 par=list(range(len(o.data.vertices)))
 def find(x):
  while par[x]!=x:par[x]=par[par[x]];x=par[x]
  return x
 def union(a,b):par[find(a)]=find(b)
 lookup={}
 for v in o.data.vertices:
  key=tuple(round(c/H,5) for c in v.co)
  if key in lookup:union(v.index,lookup[key])
  else:lookup[key]=v.index
 for e in o.data.edges:union(*e.vertices)
 comps=collections.defaultdict(list)
 for v in o.data.vertices:comps[find(v.index)].append(v.index)
 rules={};audit=[]
 for ids in comps.values():
  ps=np.array([o.data.vertices[i].co[:] for i in ids])/H;lo=ps.min(axis=0);hi=ps.max(axis=0);mid=ps.mean(axis=0);side='L' if mid[0]>0 else 'R';rule=None
  if len(ids)<20000:
   if hi[2]<.115:rule='Foot'+side
   elif not rock and hi[0]<-.115 and lo[2]<.10 and hi[2]>.4:rule='RightGear'
   elif KIND=='revenant' and lo[0]>.11 and lo[2]>.3 and hi[2]>.7 and len(ids)>5000:rule='ShieldL'
   elif lo[2]<.1 and hi[2]<.60 and (lo[0]>.03 or hi[0]<-.03):rule='Leg'+side
   elif (lo[0]>.105 or hi[0]<-.105) and lo[2]>.35 and hi[2]<.75:rule='Arm'+side
   elif rock and abs(mid[0])>.24 and hi[2]<cfg['wrist'][1]+.035 and lo[2]>(.14 if boss else .18):rule='Hand'+side
   elif not rock and lo[2]>.72 and hi[2]<.86 and abs(mid[0])>.065:rule='UpperArm'+side
  audit.append({'vertices':len(ids),'lo':lo.tolist(),'hi':hi.tolist(),'rule':rule})
  if rule:
   for i in ids:rules[i]=rule
 open(OUT+'/component-ownership.json','w').write(json.dumps(sorted(audit,key=lambda x:-x['vertices']),indent=2))
 return rules
def rock_surface_regions(o,cloth_flags=None,bone_flags=None):
 # Geodesic paths follow the connected stone surface and cannot jump the air gap
 # between a thumb and thigh, unlike a coordinate-plane cut.
 import heapq
 N=len(o.data.vertices);adj=[[] for _ in range(N)];lookup={};points=np.array([v.co[:] for v in o.data.vertices])/H
 for i,p in enumerate(points):
  key=tuple(np.round(p,5))
  if key in lookup:
   j=lookup[key];adj[i].append((j,0));adj[j].append((i,0))
  else:lookup[key]=i
 for e in o.data.edges:
  a,b=e.vertices;d=float(np.linalg.norm(points[a]-points[b]));adj[a].append((b,d));adj[b].append((a,d))
 dist=np.full(N,np.inf);labels=[None]*N;queue=[]
 for i,(x,y,z) in enumerate(points):
  ax=abs(x);side='L' if x>0 else 'R';label=None
  if rock:
   if ax>.25 and .25<z<cfg['shoulder'][1]-.03:label='Arm'+side
   elif ax<.15 and z<cfg['pelvis']-.055:label='Leg'+side
   elif ax<.095 and z>cfg['pelvis']+.03:label='Core'
  else:
   if cloth_flags[i] and .19<z<.56:label='Cloth'
   elif bone_flags[i] and ax>.028 and z<.54:label='Leg'+side
   elif z>.59 and ax<.10:label='Core'
   elif ax>.155 and .42<z<.70:label='Arm'+side
  if label:dist[i]=0;labels[i]=label;heapq.heappush(queue,(0,i))
 while queue:
  d,i=heapq.heappop(queue)
  if d>dist[i]:continue
  for j,length in adj[i]:
   nd=d+length
   if nd<dist[j]:dist[j]=nd;labels[j]=labels[i];heapq.heappush(queue,(nd,j))
 return {i:label for i,label in enumerate(labels) if label}
counts={n:0 for n in heads}
for o in meshes:
 groups={n:o.vertex_groups.new(name=n) for n in heads};rules=component_ownership(o)
 if rock:rules.update(rock_surface_regions(o))
 cloth_flags=np.zeros(len(o.data.vertices),dtype=bool)
 if KIND=='skeleton':
  mat=o.data.materials[0];bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');texture=bsdf.inputs['Base Color'].links[0].from_node.image
  w0,h0=texture.size;px=np.array(texture.pixels[:],dtype=np.float32).reshape(h0,w0,4);colors=np.zeros((len(o.data.vertices),3))
  for loop in o.data.loops:
   uv=o.data.uv_layers.active.data[loop.index].uv;colors[loop.vertex_index]=px[min(h0-1,int(uv.y*h0)%h0),min(w0-1,int(uv.x*w0)%w0),:3]
  r,g,b=colors.T;cloth_flags=(g>r*1.06)&(b>r*.96)&(r<.35)
  points=np.array([v.co[:] for v in o.data.vertices])/H
  allowed=(np.abs(points[:,0])<.10)&(points[:,2]>.19)&(points[:,2]<.57)
  allowed &= ((points[:,1]>.068)|(np.abs(points[:,0])<np.where(points[:,2]<.34,.031,.067)))
  cloth_flags &= allowed
  # Extend the clear teal seeds over dark folds within the same local surface.
  edges=np.array([e.vertices[:] for e in o.data.edges]);a,b0=edges.T
  for iteration in range(4):
   grown=cloth_flags.copy();grown[a]|=cloth_flags[b0];grown[b0]|=cloth_flags[a];cloth_flags=grown&allowed
  bone_flags=(r>.27)&(r>g*1.015)
  surface_rules={i:label for i,label in rock_surface_regions(o,cloth_flags,bone_flags).items() if points[i,2]<(.845 if KIND=='skeleton' else .57)};surface_rules.update(rules);rules=surface_rules

 for v in o.data.vertices:
  w=weights(v.co,bool(cloth_flags[v.index]));rule=rules.get(v.index);z=v.co.z/H
  if rule=='RightGear':w={'WeaponR':1} if KIND=='skeleton' or z<cfg['wrist'][1]-.04 else chain_weights(z,'R',True)
  elif rule and rule.startswith('Arm'):w=chain_weights(z,rule[-1],True)
  elif rule and rule.startswith('Leg'):w=chain_weights(z,rule[-1],False)
  elif rule=='Core':
   if KIND=='skeleton' and z>.57:
    w=weights(v.co,bool(cloth_flags[v.index]))
    if any(n.startswith(('UpperArm','Forearm')) for n in w):w=between(z,'Chest','Spine',cfg['chest']-.025,.045)
   elif not rock and z<cfg['pelvis']-.035 and not bone_flags[v.index]:w={'Cloth':1}
   elif rock:w=between(z,'Chest','Pelvis',cfg['pelvis']+.055,.035)
   elif z<cfg['pelvis']+.025:w={'Pelvis':1}
   else:w=between(z,'Chest','Spine',cfg['chest']-.025,.06)
  elif rule:w={rule:1}
  if not rock and w.get('Pelvis',0)>.5 and z<.46:w={'Cloth':1}
  for n,value in w.items():
   if value>1e-6:groups[n].add([v.index],value,'REPLACE');counts[n]+=1
 mod=o.modifiers.new('Manual deformation','ARMATURE');mod.object=arm;o.parent=arm
# Rest metadata in glTF coordinates (X, Z, -Y).
def gltf(v):return [float(v.x),float(v.z),float(-v.y)]
metadata={'kind':KIND,'revision':REV,'height':H,'front':'+Z','up':'+Y','floor':0,'source_sha256':hashlib.sha256(open(source,'rb').read()).hexdigest(),'bone_names':list(heads),'bones':{n:{'parent':parents[n],'head':gltf(heads[n]),'tail':gltf(tails[n]),'weighted_vertices':counts[n]} for n in heads},'geometry_rebuilt':False,'source_triangles':sum(len(o.data.polygons) for o in meshes),'reference_ledger':{'skill':True,'api_notes':True,'threejs_integration':True},'method':'manual anatomy regions and short joint blend zones; approved source geometry retained'}
arm['rigMetadata']=json.dumps(metadata)
bpy.ops.object.select_all(action='SELECT');glb=ROOT+'/web/public/assets/rpg/animated/'+KIND+'.glb'
bpy.ops.export_scene.gltf(filepath=glb,export_format='GLB',export_image_format='AUTO',export_skins=True,export_animations=False,export_extras=True,export_apply=False,use_selection=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/rig-v'+str(REV)+'.blend');metadata['bytes']=os.path.getsize(glb);metadata['sha256']=hashlib.sha256(open(glb,'rb').read()).hexdigest();open(OUT+'/rig-metadata.json','w').write(json.dumps(metadata,indent=2));result={'kind':KIND,'bones':len(heads),'counts':counts,'bytes':metadata['bytes'],'output':glb}
