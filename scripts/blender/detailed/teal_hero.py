"""Approved teal/gold Wayfarer adaptation, built in an isolated Blender scene.

Keeps the CC0 anatomical foundation, authored armor construction, UVs and
nineteen-bone gameplay contract; replaces garments and facial-hair silhouette.
Run stages through Blender MCP. Public promotion is a separate explicit step.
"""
from pathlib import Path
import math, runpy, subprocess
import bpy, bmesh
from mathutils import Vector


def surface(name, color, metallic=0, roughness=.6, cloth=False):
    material=bpy.data.materials.new(name);material.use_nodes=True
    nodes=material.node_tree.nodes;links=material.node_tree.links
    p=nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metallic
    p.inputs['Roughness'].default_value=roughness
    uv=nodes.new('ShaderNodeTexCoord')
    noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=36
    noise.inputs['Detail'].default_value=2;links.new(uv.outputs['UV'],noise.inputs['Vector'])
    ramp=nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color=(*(v*.94 for v in color),1)
    ramp.color_ramp.elements[1].color=(*(min(1,v*1.04) for v in color),1)
    links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs[0],p.inputs['Base Color'])
    if cloth:
        wave=nodes.new('ShaderNodeTexWave');wave.bands_direction='X';wave.inputs['Scale'].default_value=220
        links.new(uv.outputs['UV'],wave.inputs['Vector'])
        bump=nodes.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.0011;bump.inputs['Strength'].default_value=.32
        links.new(wave.outputs['Color'],bump.inputs['Height']);links.new(bump.outputs['Normal'],p.inputs['Normal'])
        p.inputs['Sheen Weight'].default_value=.035
        p.inputs['Specular IOR Level'].default_value=.22
    return material


def _delete_vertices(obj, selected):
    bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index in selected],context='VERTS')
    bm.to_mesh(obj.data);bm.free();obj.data.update()


def _skin(obj, rig, bone):
    obj.parent=rig
    group=obj.vertex_groups.new(name=bone);group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
    modifier=obj.modifiers.new('Approved hero armor articulation','ARMATURE');modifier.object=rig


def _shield(collection, rig, name, x, y, z, width, height, steel, gold, bone):
    control=[Vector(p) for p in [(-.65,1),(.65,1),(1,.48),(.78,-.53),(0,-1),(-.78,-.53),(-1,.48)]]
    outline=[]
    for i,p1 in enumerate(control):
        p0,p2,p3=control[(i-1)%7],control[(i+1)%7],control[(i+2)%7]
        for j in range(4):
            t=j/4
            outline.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
    count=len(outline)
    verts=[];faces=[]
    for scale,depth in ((1,0),(.89,-.010),(.72,-.024),(.25,-.036)):
        verts.extend((x+u*width*scale,y+depth,z+v*height*scale) for u,v in outline)
    for ring in range(3):
        for i in range(count):faces.append((ring*count+i,ring*count+(i+1)%count,(ring+1)*count+(i+1)%count,(ring+1)*count+i))
    faces.append(tuple(range(3*count,4*count)))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.materials.append(gold);mesh.materials.append(steel)
    for poly in mesh.polygons:
        poly.material_index=0 if poly.index<count else 1
        poly.use_smooth=True
    uv=mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        for loop in poly.loop_indices:
            v=mesh.vertices[mesh.loops[loop].vertex_index].co
            uv.data[loop].uv=((v.x-x)/(width*2)+.5,(v.z-z)/(height*2)+.5)
    obj=bpy.data.objects.new(name,mesh);collection.objects.link(obj)
    obj['sourcePart']='teal_concept_armor';_skin(obj,rig,bone)
    return obj


def _hair_fringe(collection, rig, material):
    for lock in range(5):
        vertices=[];faces=[];rows=14;sides=8
        for i in range(rows+1):
            t=i/rows
            x=.065-lock*.019-.056*t
            y=-.063-.057*math.sin(t*math.pi*.6)
            z=1.800-.008*lock/4-.030*t+.010*math.sin(t*math.pi)
            width=.0135*max(.03,math.sin(math.pi*(.1+.9*t)))**.7
            for j in range(sides):
                angle=j*math.tau/sides
                vertices.append((x+width*math.cos(angle),y+.0038*math.sin(angle),z+width*.22*math.cos(angle)))
        for i in range(rows):
            for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
        faces.extend((tuple(reversed(range(sides))),tuple(range(rows*sides,(rows+1)*sides))))
        mesh=bpy.data.meshes.new('Swept chestnut fringe');mesh.from_pydata(vertices,[],faces);mesh.materials.append(material)
        uv=mesh.uv_layers.new(name='UVMap')
        for p in mesh.polygons:
            p.use_smooth=True
            for index in p.loop_indices:
                vertex=mesh.loops[index].vertex_index;uv.data[index].uv=((vertex%sides)/sides,(vertex//sides)/rows)
        obj=bpy.data.objects.new('TealHero swept hair '+str(lock),mesh);collection.objects.link(obj)
        obj['sourcePart']='teal_concept_hair';_skin(obj,rig,'head')


def _belt(collection, rig, leather, gold):
    vertices=[];faces=[];count=64
    for radius,z in ((1,1.08),(1,1.139),(.965,1.08),(.965,1.139)):
        for i in range(count):
            angle=i*math.tau/count
            vertices.append((.207*radius*math.sin(angle),-.217*radius*math.cos(angle),z))
    for a,b in ((0,1),(3,2),(2,0),(1,3)):
        for i in range(count):faces.append((a*count+i,a*count+(i+1)%count,b*count+(i+1)%count,b*count+i))
    mesh=bpy.data.meshes.new('Tailored waist belt');mesh.from_pydata(vertices,[],faces);mesh.materials.append(leather)
    uv=mesh.uv_layers.new(name='UVMap')
    for p in mesh.polygons:
        p.use_smooth=True
        for index in p.loop_indices:
            vertex=mesh.loops[index].vertex_index;uv.data[index].uv=((vertex%count)/count,(vertex//count)%2)
    obj=bpy.data.objects.new('TealHero waist belt',mesh);collection.objects.link(obj);obj['sourcePart']='teal_concept_belt';_skin(obj,rig,'pelvis')
    vertices=[];faces=[]
    outline=[(-.041,.025),(.041,.025),(.049,.017),(.049,-.017),(.041,-.025),(-.041,-.025),(-.049,-.017),(-.049,.017)]
    for scale,y in ((1,-.242),(.75,-.244),(1,-.233),(.75,-.233)):
        vertices.extend((x*scale,y,1.11+z*scale) for x,z in outline)
    for a,b in ((0,1),(2,0),(1,3),(3,2)):
        for i in range(8):faces.append((a*8+i,a*8+(i+1)%8,b*8+(i+1)%8,b*8+i))
    mesh=bpy.data.meshes.new('Forged open belt buckle');mesh.from_pydata(vertices,[],faces);mesh.materials.append(gold)
    uv=mesh.uv_layers.new(name='UVMap')
    for p in mesh.polygons:
        for index in p.loop_indices:
            v=mesh.vertices[mesh.loops[index].vertex_index].co;uv.data[index].uv=(v.x/.1+.5,(v.z-1.11)/.06+.5)
    obj=bpy.data.objects.new('TealHero open belt buckle',mesh);collection.objects.link(obj);obj['sourcePart']='teal_concept_belt';_skin(obj,rig,'pelvis')
    bevel=obj.modifiers.new('Soft forged edges','BEVEL');bevel.width=.0017;bevel.segments=2
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=bevel.name)


def _boot_straps(collection, rig, leather, gold):
    from mathutils.bvhtree import BVHTree
    cloth=next(o for o in collection.objects if o.get('sourcePart')=='clothing')
    bvh=BVHTree.FromPolygons([v.co for v in cloth.data.vertices],[tuple(p.vertices) for p in cloth.data.polygons])
    for side,sign in (('R',-1),('L',1)):
        for level in (.38,.12):
            vertices=[];faces=[];count=32
            for z in (level-.013,level-.009,level+.009,level+.013):
                for i in range(count):
                    a=math.tau*i/count
                    direction=Vector((math.sin(a),-math.cos(a),0))
                    center=Vector((sign*.145,.025,z))
                    start=center+direction*.20
                    hit=bvh.ray_cast(start,-direction,.3)[0]
                    p=(hit+direction*.003) if hit else center+direction*.085
                    vertices.append(tuple(p))
            for row in range(3):
                for i in range(count):faces.append((row*count+i,row*count+(i+1)%count,(row+1)*count+(i+1)%count,(row+1)*count+i))
            mesh=bpy.data.meshes.new('Fitted boot fastening');mesh.from_pydata(vertices,[],faces);mesh.materials.append(leather);mesh.materials.append(gold)
            uv=mesh.uv_layers.new(name='UVMap')
            for p in mesh.polygons:
                p.use_smooth=True;p.material_index=1 if p.index//count in (0,2) else 0
                for index in p.loop_indices:
                    v=mesh.loops[index].vertex_index;uv.data[index].uv=((v%count)/count,(v//count)/3)
            obj=bpy.data.objects.new('TealHero boot strap '+side+str(level),mesh);collection.objects.link(obj);obj['sourcePart']='teal_concept_boots';_skin(obj,rig,'shin.'+side if level>.2 else 'foot.'+side)


def remodel(root, collection, rig):
    root=Path(root)
    helpers=runpy.run_path(str(root/'scripts/blender/experiments/rig_authored_hero.py'))
    mats={
        'teal':surface('TealHero woven turquoise',(.004,.135,.15),roughness=.78,cloth=True),
        'gold':surface('TealHero warm gold binding',(.48,.235,.045),metallic=.8,roughness=.36),
        'leather':surface('TealHero saddle leather',(.18,.073,.026),roughness=.6),
        'steel':surface('TealHero satin silver',(.48,.55,.59),metallic=.82,roughness=.3),
        'dark_teal':surface('TealHero deep teal trousers',(.006,.053,.065),roughness=.76,cloth=True),
        'hair':surface('TealHero chestnut fringe',(.065,.022,.007),roughness=.48),
    }
    cloth=next(o for o in collection.objects if o.get('sourcePart')=='clothing')
    islands=list(helpers['mesh_islands'](cloth.data));remove=set();removed=[]
    gold_index=len(cloth.data.materials);cloth.data.materials.append(mats['gold'])
    pants_index=len(cloth.data.materials);cloth.data.materials.append(mats['dark_teal'])
    gold_vertices=set()
    pants_vertices=set()
    for ids in islands:
        points=[cloth.data.vertices[i].co for i in ids]
        low=Vector(tuple(min(p[j] for p in points) for j in range(3)))
        high=Vector(tuple(max(p[j] for p in points) for j in range(3)))
        cape=len(ids)>500 and high.z-low.z>1.25 and high.x-low.x>.6
        skirt=len(ids)>2000 and low.z<.50 and high.z<1.23 and high.x-low.x>.6
        if cape or skirt:
            remove.update(ids);removed.append('cape' if cape else 'skirt');continue
        # The source armor is assembled as distinct shells and narrow bindings.
        # Retain its steel plates; make the separate shoulder/arm bindings gold.
        selected=set(ids)
        area=sum(poly.area for poly in cloth.data.polygons if poly.vertices[0] in selected)
        if 40<len(ids)<450 and area<.018 and low.z>1.15 and abs((low.x+high.x)/2)>.12:
            gold_vertices.update(ids)
        if high.z>1.50 and low.z>1.12 and high.z-low.z>.28 and area<.022 and max(abs(low.x),abs(high.x))<.2:
            gold_vertices.update(ids)
        if len(ids)>100 and .35<low.z<.5 and .9<high.z<1.06:
            pants_vertices.update(ids)
            center=.145 if high.x>0.1 else -.145
            for index in ids:cloth.data.vertices[index].co.x=center+(cloth.data.vertices[index].co.x-center)*.9
    if sorted(removed)!=['cape','skirt']:raise ValueError('Reviewed cape/skirt topology changed: '+repr(removed))
    for poly in cloth.data.polygons:
        if poly.vertices[0] in gold_vertices and any(key in cloth.data.materials[poly.material_index].name for key in ('set1','set3')):poly.material_index=gold_index
        if poly.vertices[0] in pants_vertices:poly.material_index=pants_index
    _delete_vertices(cloth,remove)
    # Remove beard and moustache cards; retain scalp hair and eyebrows.
    for obj in list(collection.objects):
        part=obj.get('sourcePart','')
        if part in ('head_lowpoly_sdiv2.002','head_lowpoly_sdiv2.004'):
            bpy.data.objects.remove(obj,do_unlink=True)
        elif part=='head_lowpoly_sdiv2.003':
            _delete_vertices(obj,{v.index for v in obj.data.vertices if v.co.z<1.70})
        elif part=='head.001':
            for v in obj.data.vertices:
                x,y,z=v.co
                # A softer jaw and shorter lower face; eye sockets remain fixed.
                lower=max(0,1-abs(z-1.65)/.075)
                v.co.x*=1+.12*lower
                if z<1.70:v.co.z+=.018*max(0,(1.70-z)/.12)
                nose=math.exp(-((x/.021)**2+((z-1.681)/.035)**2))
                if y<-.105:v.co.y+=.009*nose
                smile=math.exp(-(((abs(x)-.026)/.018)**2+((z-1.637)/.012)**2))
                if y<-.085:v.co.z+=.006*smile
        elif part=='eyelashes':
            bpy.context.view_layer.objects.active=obj
            modifier=obj.modifiers.new('Game-scale eyelash density','DECIMATE');modifier.ratio=.25
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    # Improve material separation while retaining original armor/skin UV detail.
    replacements={}
    for obj in collection.objects:
        if obj.type!='MESH':continue
        for index,old in enumerate(list(obj.data.materials)):
            if old in mats.values() or old is None:continue
            original_name=old.get('authoredSourceName',old.name)
            if 'set2' in old.name:
                obj.data.materials[index]=mats['teal'];continue
            if old not in replacements and ('set1' in old.name or 'set3' in old.name or original_name=='face'):
                material=old.copy();material.name=('face' if original_name=='face' else old.name)+' teal concept'
                n=material.node_tree.nodes;l=material.node_tree.links;p=next(v for v in n if v.type=='BSDF_PRINCIPLED')
                metal=None
                source=p.inputs['Base Color'].links[0].from_socket if p.inputs['Base Color'].is_linked else None
                if source:
                    mix=n.new('ShaderNodeMixRGB');mix.blend_type='MIX'
                    mix.inputs[0].default_value=.30 if original_name=='face' else .32
                    mix.inputs[2].default_value=(.38,.17,.075,1) if original_name=='face' else (.22,.10,.04,1)
                    l.new(source,mix.inputs[1]);base=mix.outputs[0]
                    if original_name!='face' and p.inputs['Metallic'].is_linked:
                        metal=p.inputs['Metallic'].links[0].from_socket
                        silver=n.new('ShaderNodeMixRGB');silver.inputs[2].default_value=(.43,.49,.52,1)
                        l.new(metal,silver.inputs[0]);l.new(base,silver.inputs[1]);base=silver.outputs[0]
                        rough=n.new('ShaderNodeMapRange');rough.inputs['To Min'].default_value=.67;rough.inputs['To Max'].default_value=.34
                        l.new(metal,rough.inputs['Value']);l.new(rough.outputs['Result'],p.inputs['Roughness'])
                    l.new(base,p.inputs['Base Color'])
                for normal in [node for node in n if node.type=='NORMAL_MAP']:
                    for link in list(normal.inputs['Strength'].links):l.remove(link)
                    normal.inputs['Strength'].default_value=.20 if original_name=='face' else .55
                    if metal is not None:
                        grain=n.new('ShaderNodeMapRange');grain.inputs['To Min'].default_value=.55;grain.inputs['To Max'].default_value=.16
                        l.new(metal,grain.inputs['Value']);l.new(grain.outputs['Result'],normal.inputs['Strength'])
                replacements[old]=material
            if old in replacements:obj.data.materials[index]=replacements[old]
    garments=runpy.run_path(str(root/'scripts/blender/detailed/teal_hero_garments.py'))
    garments['build_teal_garments'](collection,rig,mats)
    garments['build_hero_accessories'](collection,rig,mats)
    runpy.run_path(str(root/'scripts/blender/detailed/teal_hero_armor.py'))['build_teal_armor'](collection,rig,mats)
    _belt(collection,rig,mats['leather'],mats['gold'])
    _hair_fringe(collection,rig,mats['hair'])
    _boot_straps(collection,rig,mats['leather'],mats['gold'])
    for side,sign in (('R',-1),('L',1)):
        _shield(collection,rig,'TealHero knee '+side,sign*.145,-.10,.565,.071,.088,mats['steel'],mats['gold'],'shin.'+side)
    _shield(collection,rig,'TealHero cloak clasp',0,-.153,1.544,.022,.028,mats['gold'],mats['gold'],'chest')
    collection['approvedConcept']='docs/concepts/math-dungeon-rpg/07-teal-hero.png'
    collection['designRevision']='teal-gold-2026-09-07'
    rig['approvedConcept']=collection['approvedConcept'];rig['designRevision']=collection['designRevision']
    print('Teal hero remodeled',sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in collection.objects if o.type=='MESH'),'triangles')
    return mats


def build_teal_hero(root, output=None):
    root=Path(root);directory=root/'scripts/blender/experiments'
    output=Path(output) if output else directory/'exports/teal-hero'
    ns={}
    for filename in ('rebuild_authored_hero_study.py','rig_authored_hero.py','bake_authored_hero.py','export_authored_hero.py'):
        exec(compile((directory/filename).read_text(),str(directory/filename),'exec'),ns)
    previous=bpy.context.window.scene
    try:
        scene,collection,rig=ns['rebuild_authored_hero_study'](root,name='teal-hero-build')
        rig.data.pose_position='REST';mats=remodel(root,collection,rig)
        converted={m:ns['bake_authored_material'](m,output/'maps','tealhero_'+key,1024 if key=='teal' else 512) for key,m in mats.items()}
        ns['bake_hero_collection_materials'](collection,output/'maps',converted)
        ns['author_hero_actions'](rig);rig.data.pose_position='POSE'
        raw=ns['export_authored_hero_candidate'](collection,rig,output/'hero-raw.glb')
        packed=output/'hero-packed.glb'
        subprocess.run(['python',str(directory/'pack_authored_hero.py'),str(raw),str(packed)],check=True)
        return packed
    finally:bpy.context.window.scene=previous
