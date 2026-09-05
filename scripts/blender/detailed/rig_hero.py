"""Eight-bone game hero rig and short authored action clips, without root travel."""
import bpy,math
from mathutils import Vector
from pathlib import Path

def rig_hero(collection):
    scene=bpy.context.scene;scene.render.fps=30
    bpy.ops.object.select_all(action='DESELECT')
    data=bpy.data.armatures.new('VaultHeroSkeleton');rig=bpy.data.objects.new('HeroRig',data)
    collection.objects.link(rig);rig.show_in_front=True;rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    specs={
      'root':((0,0,0),(0,0,.20),None),
      'chest':((0,0,.98),(0,0,1.43),'root'),
      'head':((0,.01,1.46),(0,.01,1.85),'chest'),
      'arm.L':((-.235,.015,1.34),(-.33,-.18,.985),'chest'),
      'arm.R':((.235,.015,1.34),(.345,-.19,1.05),'chest'),
      'leg.L':((-.112,.01,.87),(-.136,.04,.10),'root'),
      'leg.R':((.112,.01,.87),(.136,-.07,.10),'root'),
      'cape':((0,.13,1.405),(.20,.47,.31),'chest'),
    }
    for name,(head,tail,parent) in specs.items():
        bone=data.edit_bones.new(name);bone.head=head;bone.tail=tail
        if parent:bone.parent=data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj in list(collection.objects):
        if obj.type!='MESH':continue
        groups={name:obj.vertex_groups.new(name=name) for name in specs}
        if obj.name.startswith('Cape'):
            for v in obj.data.vertices:
                z=(obj.matrix_world@v.co).z;t=max(0,min(1,(1.36-z)/.8))
                groups['cape'].add([v.index],t,'REPLACE');groups['chest'].add([v.index],1-t,'REPLACE')
        elif obj.name.startswith('Head'):
            groups['head'].add(list(range(len(obj.data.vertices))),1,'REPLACE')
        elif obj.name.startswith('Sword'):
            groups['arm.R'].add(list(range(len(obj.data.vertices))),1,'REPLACE')
        else:
            # Armor is disconnected construction. Assign each connected island
            # as a rigid piece so a pauldron cannot stretch across a joint.
            adjacency=[[] for _ in obj.data.vertices]
            for edge in obj.data.edges:
                a,b=edge.vertices;adjacency[a].append(b);adjacency[b].append(a)
            seen=set()
            for vertex in obj.data.vertices:
                if vertex.index in seen:continue
                pending=[vertex.index];seen.add(vertex.index);island=[]
                while pending:
                    i=pending.pop();island.append(i)
                    for j in adjacency[i]:
                        if j not in seen:seen.add(j);pending.append(j)
                center=sum((obj.matrix_world@obj.data.vertices[i].co for i in island),Vector())/len(island)
                x,y,z=center
                if z<.87:bone='leg.R' if x>0 else 'leg.L'
                elif abs(x)>.213 and z>1.0:bone='arm.R' if x>0 else 'arm.L'
                elif abs(x)>.28 and z>.91:bone='arm.R' if x>0 else 'arm.L'
                elif z>1.04:bone='chest'
                else:bone='root'
                groups[bone].add(island,1,'REPLACE')
        mod=obj.modifiers.new('Hero skeletal deformation','ARMATURE');mod.object=rig;mod.use_vertex_groups=True
        obj.parent=rig
    rig.animation_data_create()
    def reset():
        for p in rig.pose.bones:p.rotation_mode='XYZ';p.rotation_euler=(0,0,0);p.location=(0,0,0);p.scale=(1,1,1)
    def key(frame):
        for p in rig.pose.bones:
            p.keyframe_insert('rotation_euler',frame=frame)
            p.keyframe_insert('location',frame=frame)
            p.keyframe_insert('scale',frame=frame)
    def rotate(name,xyz):rig.pose.bones[name].rotation_euler=xyz
    actions={}
    def stash(action,end,name):
        actions[name]=action
        track=rig.animation_data.nla_tracks.new();track.name=name
        strip=track.strips.new(action.name,1,action);strip.action_frame_start=1;strip.action_frame_end=end
        track.mute=True
        rig.animation_data.action=None
    # Breathing/sway belongs to the shoulders/cape; the feet stay grounded.
    action=bpy.data.actions.new('idle');rig.animation_data.action=action
    for frame in (1,13,25,37,49,61,73,85,97):
        reset();t=(frame-1)/96*2*math.pi
        rotate('chest',(.009*math.sin(t),0,.014*math.sin(t)))
        rig.pose.bones['chest'].scale.y=1+.009*math.sin(t)
        rotate('head',(.007*math.sin(t+.3),0,-.017*math.sin(t)))
        rotate('arm.L',(.022*math.sin(t+.5),0,.008*math.sin(t)))
        rotate('arm.R',(-.018*math.sin(t+.5),0,-.008*math.sin(t)))
        rotate('cape',(.034*math.sin(t-.5),.012*math.sin(t),.036*math.sin(t-.9)));key(frame)
    stash(action,97,'idle')
    action=bpy.data.actions.new('walk');rig.animation_data.action=action
    for frame in (1,4,7,10,13,16,19,22,25):
        reset();t=(frame-1)/24*2*math.pi;s=math.sin(t)
        rotate('leg.L',(.35*s,0,.015));rotate('leg.R',(-.35*s,0,-.015))
        rotate('arm.L',(-.22*s,0,.07));rotate('arm.R',(.20*s,0,-.07))
        rotate('chest',(.025,0,-.03*s));rotate('head',(-.015,0,.025*s))
        rig.pose.bones['chest'].location.y=.008*(1-math.cos(2*t))
        rotate('cape',(.075+.06*math.sin(t+.5),0,.05*math.sin(t-.4)));key(frame)
    stash(action,25,'walk')
    action=bpy.data.actions.new('cleave');rig.animation_data.action=action
    for frame,arm,chest in [(1,(.05,0,-.10),-.015),(5,(-.45,.08,-.85),-.20),(8,(-.13,-.10,1.06),.24),(11,(.14,-.12,1.15),.28),(20,(.08,0,.36),.09),(35,(0,0,0),0)]:
        reset();rotate('arm.R',arm);rotate('chest',(.035,0,chest));rotate('head',(0,0,-chest*.45))
        rotate('arm.L',(-.15,0,-chest*.50));rotate('leg.R',(-.10,0,-.025));rotate('leg.L',(.06,0,.025))
        rotate('cape',(.06,0,-chest*.55));key(frame)
    stash(action,35,'cleave')
    action=bpy.data.actions.new('cast');rig.animation_data.action=action
    for frame,right,left,lean in [(1,(0,0,0),(0,0,0),0),(5,(-.48,.05,-.40),(-.31,-.04,.32),-.025),(8,(-1.02,.08,-.70),(-.82,-.06,.75),-.055),(12,(-.81,.04,-.55),(-.67,-.04,.58),.025),(21,(-.28,0,.05),(-.18,0,-.03),.012),(35,(0,0,0),(0,0,0),0)]:
        reset();rotate('arm.R',right);rotate('arm.L',left);rotate('chest',(lean,0,0))
        rotate('head',(-lean*.6,0,0));rotate('cape',(-lean*1.2,0,.02));key(frame)
    stash(action,35,'cast')
    reset();scene.frame_set(1)
    rig.animation_data.action=None
    # Export each named track as an independent clip, including muted tracks.
    for track in rig.animation_data.nla_tracks:track.mute=False
    bpy.ops.object.select_all(action='DESELECT')
    for o in collection.objects:o.select_set(True);o.hide_render=False
    bpy.context.view_layer.objects.active=rig
    path=Path('/home/houston/git/institute/web/public/assets/rpg/hero.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_animations=True,export_skins=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_extras=True)
    for track in rig.animation_data.nla_tracks:track.mute=True
    rig.animation_data.action=actions['idle']
    scene.frame_set(1)
    print('Exported hero rig: 8 bones; idle, walk, cleave, cast. No root travel.')
    return rig
