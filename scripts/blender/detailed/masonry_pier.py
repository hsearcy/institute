"""Reviewed full-height masonry source, plus a short-post review variant.

Call build_masonry_pier(repo_root) from Blender MCP. The source
preserves separate object coordinates; do not join before texture baking.
"""
import bpy, bmesh, math, random, hashlib, json
from mathutils import Vector, noise
from pathlib import Path

def build_masonry_pier(repo_root, short=False):
    source_dir = Path(repo_root) / "scripts/blender/sources/rock-face-03"
    manifest = json.loads((source_dir / 'manifest.json').read_text())
    for name in ("Diffuse", "Rough", "Displacement"):
        path = source_dir / (name + ".jpg")
        if not path.is_file():
            raise FileNotFoundError("Restore stone maps with sources/rock-face-03/fetch.py")
        if hashlib.sha256(path.read_bytes()).hexdigest() != manifest[name]['sha256']:
            raise ValueError('Stone map differs from the reviewed source: ' + name)
    rng=random.Random(90417)
    scene=bpy.data.scenes.new('Vault masonry post study' if short else 'Vault reviewed masonry pier');bpy.context.window.scene=scene
    collection=bpy.data.collections.new('Masonry post' if short else 'Masonry pier');scene.collection.children.link(collection)
    heights=[.32,.37,.33] if short else [.38,.33,.42,.35,.37,.39,.34,.40,.31]
    capital_base=.59+sum(heights)

    def link(obj):
        for old in list(obj.users_collection):old.objects.unlink(obj)
        collection.objects.link(obj)
        return obj

    def stone_material(name, tint, worked=False):
        mat=bpy.data.materials.new(name);mat.use_nodes=True
        nodes=mat.node_tree.nodes;links=mat.node_tree.links;p=nodes.get('Principled BSDF')
        p.inputs['Roughness'].default_value=.86
        coords=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(.72,.72,.72);links.new(coords.outputs['Object'],mapping.inputs[0])
        info=nodes.new('ShaderNodeObjectInfo');offset=nodes.new('ShaderNodeVectorMath');offset.operation='SCALE';offset.inputs[0].default_value=(.431,1.319,.771);links.new(info.outputs['Color'],offset.inputs[3]);shift=nodes.new('ShaderNodeVectorMath');shift.operation='ADD';links.new(mapping.outputs['Vector'],shift.inputs[0]);links.new(offset.outputs['Vector'],shift.inputs[1])
        def texture(kind):
            t=nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(source_dir / (kind+'.jpg')),check_existing=True);t.projection='BOX';t.projection_blend=.18
            if kind!='Diffuse':t.image.colorspace_settings.name='Non-Color'
            links.new(shift.outputs['Vector'],t.inputs['Vector']);return t
        color=texture('Diffuse');sat=nodes.new('ShaderNodeHueSaturation');sat.inputs['Saturation'].default_value=.32;sat.inputs['Value'].default_value=1.25;links.new(color.outputs['Color'],sat.inputs['Color'])
        surface=nodes.new('ShaderNodeMixRGB');surface.inputs[0].default_value=.34 if worked else .7;surface.inputs[1].default_value=(.20,.205,.183,1);links.new(sat.outputs['Color'],surface.inputs[2])
        mult=nodes.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1;mult.inputs[2].default_value=(*tint,1);links.new(surface.outputs[0],mult.inputs[1]);geo=nodes.new('ShaderNodeNewGeometry');xyz=nodes.new('ShaderNodeSeparateXYZ');links.new(geo.outputs['Position'],xyz.inputs[0]);ramp=nodes.new('ShaderNodeMapRange');ramp.clamp=True;ramp.inputs['From Min'].default_value=.05;ramp.inputs['From Max'].default_value=.85;ramp.inputs['To Min'].default_value=.90 if 'fracture' in name else .48;ramp.inputs['To Max'].default_value=1;links.new(xyz.outputs['Z'],ramp.inputs['Value']);weather=nodes.new('ShaderNodeMixRGB');weather.blend_type='MULTIPLY';weather.inputs[0].default_value=1;links.new(mult.outputs[0],weather.inputs[1]);links.new(ramp.outputs['Result'],weather.inputs[2]);ao=nodes.new('ShaderNodeAmbientOcclusion');ao.inputs['Distance'].default_value=.18;ao.samples=16;dirt=nodes.new('ShaderNodeMixRGB');dirt.blend_type='MULTIPLY';dirt.inputs[0].default_value=.36;links.new(weather.outputs[0],dirt.inputs[1]);links.new(ao.outputs['Color'],dirt.inputs[2]);links.new(dirt.outputs[0],p.inputs['Base Color'])
        rough=texture('Rough');r=nodes.new('ShaderNodeMapRange');r.inputs['To Min'].default_value=.72;r.inputs['To Max'].default_value=.96;links.new(rough.outputs['Color'],r.inputs['Value']);links.new(r.outputs['Result'],p.inputs['Roughness'])
        relief=texture('Displacement');bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.28 if worked else .5;bump.inputs['Distance'].default_value=.006 if worked else .022;links.new(relief.outputs['Color'],bump.inputs['Height']);links.new(bump.outputs['Normal'],p.inputs['Normal'])
        # Broad deposition belongs to low, sheltered stone rather than every face.
        deposit=nodes.new('ShaderNodeTexNoise');deposit.inputs['Scale'].default_value=2.5;deposit.inputs['Detail'].default_value=2;links.new(geo.outputs['Position'],deposit.inputs['Vector'])
        lower=nodes.new('ShaderNodeMapRange');lower.clamp=True;lower.inputs['From Min'].default_value=.1;lower.inputs['From Max'].default_value=1.18;lower.inputs['To Min'].default_value=0 if 'fracture' in name else .85;lower.inputs['To Max'].default_value=0;links.new(xyz.outputs['Z'],lower.inputs['Value'])
        lowmask=nodes.new('ShaderNodeMath');lowmask.operation='MULTIPLY';links.new(lower.outputs['Result'],lowmask.inputs[0]);links.new(deposit.outputs['Fac'],lowmask.inputs[1])
        above=nodes.new('ShaderNodeMath');above.operation='GREATER_THAN';above.inputs[1].default_value=capital_base-.16;links.new(xyz.outputs['Z'],above.inputs[0])
        below=nodes.new('ShaderNodeMath');below.operation='LESS_THAN';below.inputs[1].default_value=capital_base+.35;links.new(xyz.outputs['Z'],below.inputs[0])
        band=nodes.new('ShaderNodeMath');band.operation='MULTIPLY';links.new(above.outputs[0],band.inputs[0]);links.new(below.outputs[0],band.inputs[1])
        sheltered=nodes.new('ShaderNodeMath');sheltered.operation='SUBTRACT';sheltered.inputs[0].default_value=1;links.new(ao.outputs['AO'],sheltered.inputs[1])
        ledge=nodes.new('ShaderNodeMath');ledge.operation='MULTIPLY';links.new(sheltered.outputs[0],ledge.inputs[0]);links.new(band.outputs[0],ledge.inputs[1])
        mask=nodes.new('ShaderNodeMath');mask.operation='MAXIMUM';links.new(lowmask.outputs[0],mask.inputs[0]);links.new(ledge.outputs[0],mask.inputs[1])
        history=nodes.new('ShaderNodeMixRGB');links.new(mask.outputs[0],history.inputs[0]);links.new(dirt.outputs[0],history.inputs[1]);history.inputs[2].default_value=(.043,.046,.039,1);links.new(history.outputs[0],p.inputs['Base Color'])
        return mat
    mats=[stone_material('V2 limestone '+str(i),t) for i,t in enumerate([(1,.98,.90),(.77,.79,.75),(1.06,1.02,.92)])]

    worked=stone_material('Dressed shaft and trim',(.96,.98,.95),True)
    fracture=stone_material('Exposed limestone fracture',(1.05,1.03,.95))

    def apply(o,modifier):
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=modifier.name)

    def finish(o,name,index):
        link(o);o.name=name;shade=rng.random();o.color=(shade,shade,shade,1);o.data.materials.append(worked if 'molding' in name or 'capital bed' in name else mats[index%len(mats)])
        return o

    def block(name,loc,size,index=0,damage=.02):
        bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=size
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        bevel=o.modifiers.new('Worn arris','BEVEL');bevel.width=min(.024,min(size)*.12);bevel.segments=3;apply(o,bevel)
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=2,use_grid_fill=True);bm.normal_update()
        for v in bm.verts:
            world=v.co+Vector(loc);wear=noise.fractal(world*6.5,.85,2,3)*damage*.3
            v.co+=v.normal*wear
        bm.to_mesh(o.data);bm.free();o.data.update()
        for p in o.data.polygons:p.use_smooth=True
        normal=o.modifiers.new('Dressed stone normals','WEIGHTED_NORMAL');normal.keep_sharp=True;normal.weight=25;apply(o,normal)
        o.rotation_euler.z=rng.uniform(-.012,.012)
        return finish(o,name,index)

    def drum(x,y,z,height,radius,index):
        # A restrained torus/scotia profile and segmented joint keep the engaged
        # shaft part of the same stone courses rather than a smooth glued-on rod.
        rings=[(0,radius*1.04),(.026,radius*1.11),(.058,radius), (height-.045,radius*.98),(height-.016,radius*1.04),(height,radius*1.04)]
        verts=[];faces=[];n=24
        for iz,(h,r) in enumerate(rings):
            for j in range(n):
                a=j/n*math.tau;rr=r*(1+noise.noise(Vector((x*3+math.cos(a)*2,y*3+math.sin(a)*2,z+h)))*.035)
                verts.append((x+math.cos(a)*rr,y+math.sin(a)*rr,z+h))
        for i in range(len(rings)-1):
            for j in range(n):a=i*n+j;b=i*n+(j+1)%n;faces.append((a,b,b+n,a+n))
        faces.extend([tuple(reversed(range(n))),tuple((len(rings)-1)*n+j for j in range(n))])
        mesh=bpy.data.meshes.new('Carved shaft drum');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Engaged shaft masonry',mesh);collection.objects.link(o);shade=rng.random();o.color=(shade,shade,shade,1);o.data.materials.append(worked)
        for p in mesh.polygons:p.use_smooth=len(p.vertices)==4

    # Four substantial footing stones, offset dressed courses and a compound shaft.
    for ix in [-1,1]:
        for iy in [-1,1]:block('Fractured footing',(.31*ix,.31*iy,.105),(.61,.61,.21),1,.028)
    for i,(z,w,d,h) in enumerate([(.285,1.1,1.1,.13),(.40,.96,.98,.10),(.515,.91,.94,.12)]):
        block('Weathered plinth molding',(0,0,z),(w,d,h),i,.014)
    z=.59
    for row,h in enumerate(heights):
        if row%2:
            for side in [-1,1]:block('Bonded pier ashlar',(side*.211,.04,z+h/2),(.406,.74,h-.02),row+side,.025)
        else:block('Through pier ashlar',(0,.04,z+h/2),(.845,.74,h-.02),row,.025)
        for side in [-1,1]:drum(side*.335,-.37,z+.008,h-.025,.125,row)
        drum(.335,.37,z+.008,h-.025,.11,row+1);drum(-.335,.37,z+.008,h-.025,.11,row+1)
        z+=h
    # Capital moldings stop at a fractured crown; missing corner exposes real depth.
    for iz,(h,w,d) in enumerate([(.10,.94,.99),(.13,1.06,1.12),(.10,1.17,1.19)]):
        block('Worn capital bed',(0,0,z+h/2),(w,d,h),iz,.018);z+=h
    crown=block('Crown stone before failure',(0,0,z+.15),(1.16,1.10,.30),0,.012)
    # A single diagonal failure removes the front-right corner through the crown
    # and capital beds; the exact crown piece is retained beside its source.
    plane=Vector((.36,-.30,z+.05));normal=Vector((.7,-.7,.22)).normalized()
    def split(obj, outer):
        bm=bmesh.new();bm.from_mesh(obj.data)
        inverse=obj.matrix_world.inverted();local_plane=plane+Vector((.022*math.sin(obj.location.z*13),.015*math.cos(obj.location.z*11),0));failure_normal=normal.copy()
        if 'capital bed' in obj.name:
            depth=z-obj.location.z
            local_plane.x+=-.10 if depth<.10 else .085 if depth<.22 else -.025
            failure_normal=Vector((.58 if depth<.10 else .82,-.70,.16)).normalized()
        point=inverse@local_plane;direction=(obj.matrix_world.to_3x3().transposed()@failure_normal).normalized()
        result=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,plane_co=point,plane_no=direction,clear_outer=not outer,clear_inner=outer)
        cut=[e for e in result['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary]
        if cut:
            faces=bmesh.ops.holes_fill(bm,edges=cut,sides=0)['faces']
            obj.data.materials.append(fracture)
            for face in faces:face.material_index=len(obj.data.materials)-1;face.smooth=False
            cut_vertices=set(v for face in faces for v in face.verts)
            bmesh.ops.poke(bm,faces=faces,offset=0,center_mode='MEAN_WEIGHTED')
            # Several small cleavages share the local failure, rather than one
            # uninterrupted saw cut. Supporting courses retain worked planes.
            for vertex in bm.verts:
                world=obj.matrix_world@vertex.co
                distance=abs((world-local_plane).dot(failure_normal))
                if vertex in cut_vertices or distance<.0001:
                    relief=noise.noise(world*11)*.012+noise.noise(world*4+Vector((3,7,2)))*.018
                    vertex.co+=direction*relief
        bm.normal_update();bm.to_mesh(obj.data);bm.free();obj.data.update()
        return obj
    bpy.context.view_layer.update()
    fallen=crown.copy();fallen.data=crown.data.copy();collection.objects.link(fallen);fallen.name='Matching broken crown corner';split(fallen,True)
    for obj in list(collection.objects):
        if obj is fallen:continue
        if obj is crown or 'capital bed' in obj.name:split(obj,False)
    # Recede actual top/front edge vertices. This makes a chipped open lip,
    # not a closed boolean pit on the face.
    for obj in list(collection.objects):
        if 'capital bed' not in obj.name:continue
        depth=z-obj.location.z
        if .10<depth<.22:
            points=[obj.matrix_world@v.co for v in obj.data.vertices]
            front=min(v.y for v in points);top=max(v.z for v in points)
            inverse=obj.matrix_world.inverted()
            for vertex,world in zip(obj.data.vertices,points):
                along=max(0,1-abs(world.x-.20)/.10)
                edge=max(0,1-abs(world.y-front)/.08)*max(0,1-abs(world.z-top)/.06)
                amount=along*edge
                world.z-=.062*amount;world.y+=.038*amount
                vertex.co=inverse@world
            obj.data.update()

    # Place the matching corner on its broken face with a slight roll, preserving
    # its actual shape and texture coordinates rather than making an unrelated box.
    fallen.rotation_euler=(0,0,.43)
    bpy.context.view_layer.update()
    points=[fallen.matrix_world@v.co for v in fallen.data.vertices]
    center=sum(points,Vector())/len(points)
    fallen.location.x+=.96-center.x;fallen.location.y+=-.13-center.y
    bpy.context.view_layer.update();bottom=min((fallen.matrix_world@v.co).z for v in fallen.data.vertices);fallen.location.z+=.01-bottom
    for i,(x,y,scale) in enumerate([(.63,-.55,.14),(.77,-.38,.085)]):
        chip=block('Small crown spall',(x,y,scale*.29),(scale*1.4,scale,scale*.58),1,.012);chip.rotation_euler.z=.3+i*.9
    for obj in collection.objects:obj.hide_render=False
    print('Coherent fracture study built',len(collection.objects),'objects')
    return scene, collection
