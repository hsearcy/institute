"""Focused replacement of helmet and hand anatomy; preserve accepted skull/body."""
import bpy,math,numpy as np
from math import sin,cos,pi
from mathutils import Vector
ROOT='/home/hfsearcy/git/institute';OUT=ROOT+'/docs/concepts/skeleton-model'
parts=[];groups={};current='head'
bone=bpy.data.materials['Old ivory - porous mineral'];metal=bpy.data.materials['Blackened steel - iron corrosion'];edge=bpy.data.materials['Worn steel edges'];leather=bpy.data.materials['Old leather straps']
source=open(ROOT+'/scripts/blender/skeleton-concept/build.py').read();exec(source[source.index('def mesh('):source.index('def cloth(')])
for m in bpy.data.materials:
 if m.use_nodes:
  p=m.node_tree.nodes.get('Principled BSDF');out=m.node_tree.nodes.get('Material Output')
  if p and out:m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface'])
for o in list(bpy.data.objects):
 if o.type=='MESH' and o.parent and (o.parent.name in ['leftHand','rightHand'] or (o.parent.name=='head' and ('Blackened steel' in o.name or 'Worn steel' in o.name))):bpy.data.objects.remove(o,do_unlink=True)
# Fitted dome, vertical brow band, and continuous temple/back shell.
N=64;R=18;vs=[];fs=[]
for i in range(R+1):
 t=i/R*pi/2
 for j in range(N):
  a=j/N*2*pi;vs.append((.084*sin(t)*cos(a),.005+.094*sin(t)*sin(a),1.742+.092*cos(t)**.9+.009*math.exp(-((abs(cos(a))-.38)/.25)**2)*sin(t)**6))
  if i:q=(i-1)*N+j;r=(i-1)*N+(j+1)%N;fs.append((q,r,r+N,q+N))
o=mesh('Fitted forged helmet crown',vs,fs,metal)
def solid(o,thickness=.003):
 bpy.context.view_layer.objects.active=o;m=o.modifiers.new('Forged metal thickness','SOLIDIFY');m.thickness=thickness;bpy.ops.object.modifier_apply(modifier=m.name)
solid(o)
# The band has depth; it does not flare out from the dome.
vs=[];fs=[]
for row in range(3):
 for j in range(N):
  a=j/N*2*pi;z=1.742+row*.007+.009*math.exp(-((abs(cos(a))-.38)/.25)**2);vs.append((.0842*cos(a),.005+.0942*sin(a),z))
  if row:q=(row-1)*N+j;r=(row-1)*N+(j+1)%N;fs.append((q,r,r+N,q+N))
solid(mesh('Raised fitted brow band',vs,fs,metal))
for z in [1.742,1.756]:tube('Brow band narrow rolled border',[(.0845*cos(a),.005+.0945*sin(a),z+.009*math.exp(-((abs(cos(a))-.38)/.25)**2)) for a in np.linspace(0,2*pi,81)],.0017,edge,8)
# One shell wraps both temples and the rear. Open face edges are part of this shell.
vs=[];fs=[];S=48
for row in range(7):
 t=row/6
 for j in range(S+1):
  a=-.98+.32*t+j/S*(pi+1.96-.64*t);rear=max(0,sin(a));end=1.674+.037*abs(cos(a))**4;r=1-.055*t+.14*t*t*rear
  vs.append((.084*r*cos(a),.005+.094*r*sin(a),(1.744+.009*math.exp(-((abs(cos(a))-.38)/.25)**2))*(1-t)+end*t))
  if row and j:q=(row-1)*(S+1)+j-1;fs.append((q,q+1,q+S+2,q+S+1))
solid(mesh('Integrated temple and nape shell',vs,fs,metal),.0035)
tube('Nape shell turned edge',vs[-S-1:],.0022,edge,8)
for j in [0,S]:tube('Face opening rolled edge',[vs[row*(S+1)+j] for row in range(7)],.0022,edge,8)
# Raised crown seam follows the forged dome; short front nasal strip.
tube('Crown reinforcing seam',[(0,.005-.095*cos(a),1.744+.092*sin(a)**.9) for a in np.linspace(0,pi,51)],.0028,edge,8)
nasal=[(-.005,-.091,1.749),(.005,-.091,1.749),(-.004,-.094,1.725),(.004,-.094,1.725),(-.0025,-.093,1.702),(.0025,-.093,1.702)];solid(mesh('Tapered nasal bridge',nasal,[(0,1,3,2),(2,3,5,4)],metal),.0025)
for a in np.linspace(0,2*pi,18,endpoint=False):rivet((.085*cos(a),.005+.095*sin(a),1.750+.003*abs(cos(a))),.0022)
# Left relaxed hand: palm normal points medially (-X), thumb axis points forward (-Y).
current='leftHand';w=Vector((.293,-.035,1.016));uvball('Left connected carpal arch',w,(.015,.020,.013),bone,16,10)
for f in range(4):
 y=-.055+f*.012;kn=Vector((.297,y,.964+abs(f-1.1)*.003))
 longbone('Left metacarpal',w+Vector((.001,(f-1.5)*.009,-.010)),kn,.0049)
 end=.912+abs(f-1.1)*.009
 pts=[kn,Vector((.292,y,.940+abs(f-1.1)*.006)),Vector((.281,y,end+.010)),Vector((.275,y,end))]
 for j in range(3):longbone('Left finger phalanx',pts[j],pts[j+1],.0042-j*.0006)
for a,b in [((.292,-.051,.997),(.279,-.077,.975)),((.279,-.077,.975),(.266,-.080,.956))]:longbone('Left forward opposing thumb',a,b,.0057)
# Right hand: palm lies behind/outside the hilt and fingers encircle its cross-section.
current='rightHand';w=Vector((-.293,-.035,1.016));uvball('Right connected carpal arch',w,(.016,.019,.013),bone,16,10)
cx=-.312;cy=-.079
for f in range(4):
 z=.978-f*.012
 root=Vector((-.328,-.065,z+.005))
 longbone('Right metacarpal',w+Vector((-.005,-.007-f*.004,-.009)),root,.0047)
 pts=[root,Vector((cx-.020,cy-.008,z)),Vector((cx-.010,cy-.021,z-.002)),Vector((cx+.008,cy-.018,z-.004))]
 for j in range(3):longbone('Right wrapped finger phalanx',pts[j],pts[j+1],.0044-j*.0006)
# Thumb crosses the upper grip from the radial side, opposite the curled fingers.
for a,b in [((-.289,-.052,.994),(-.292,-.079,.982)),((-.292,-.079,.982),(-.307,-.092,.976))]:longbone('Right opposing grip thumb',a,b,.006)
# Source texture UVs use metre-scaled projections; atlas UVs are separate.
for o in parts:
 uv=o.data.uv_layers.new(name='SurfaceUV')
 for poly in o.data.polygons:
  axis=max(range(3),key=lambda i:abs(poly.normal[i]));axes=[i for i in range(3) if i!=axis]
  for li in poly.loop_indices:
   v=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(math.atan2(v.y-.005,v.x)*.23,v.z*2.3) if groups[o.name]=='head' else (v[axes[0]]*2.3,v[axes[1]]*2.3)
 mw=o.matrix_world.copy();o.parent=bpy.data.objects[groups[o.name]];o.matrix_world=mw
# Join the new pieces by articulation parent and source material before the detail bake.
for parent in ['head','leftHand','rightHand']:
 for mat in [bone,metal,edge]:
  obs=[o for o in list(bpy.data.objects) if o.type=='MESH' and o.parent and o.parent.name==parent and o.data.materials[0]==mat]
  if len(obs)>1:
   bpy.ops.object.select_all(action='DESELECT')
   for o in obs:o.select_set(True)
   bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();obs[0].name=parent+'__'+mat.name.split(' - ')[0]
bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=OUT+'/helmet-hands-v25.blend')
result={'helmet':'new continuous dome, brow, temples and nape','hands':'new coherent palm and thumb axes, wrapped right sword grip','body_changed':False,'skull_changed':False}
