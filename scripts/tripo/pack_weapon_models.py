"""Pack reviewed Tripo source geometry for HeldEquipment. Never installs assets.

Run with a normal Python that has Pillow; --bpy-python selects the isolated bpy
interpreter (or use BLENDER_MCP_BPY_PYTHON). Its runtime library environment must
already be configured. Example:
  python3 scripts/tripo/pack_weapon_models.py apprentice --mounts mounts.json \
    --bpy-python /path/to/bpy/python

Mount JSON: {"apprentice": {"rotation_degrees": [0,0,0],
  "grip_fraction": [0.5,0.12,0.5], "review_note": "Measured handle midpoint"}}
All coordinates are glTF +Y up/+Z front. Rotation is extrinsic X, then Y,
then Z, in degrees. Fractions refer to the ROTATED, pre-scale mesh bounds.
They are measured inputs, not automatic guesses. Optional tip_fraction chooses
its nearest real mesh vertex. Hand tip otherwise uses the highest real Y vertex;
wearables use the farthest vertex from the mount. The candidate remains subject
to visual/equipped review. No texture baking, extra generation, or silhouette cuts.
"""
import argparse
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
GENERATED = ROOT / 'docs/concepts/weapon-model-review/generated'
CANDIDATES = ROOT / 'web/public/assets/rpg/items/candidates'
CATALOGUE = ROOT / 'scripts/blender/items/catalogue.json'


def glb_read(path):
    raw = Path(path).read_bytes()
    magic, version, total = struct.unpack_from('<4sII', raw)
    assert magic == b'glTF' and version == 2 and total == len(raw)
    n, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4e4f534a
    return json.loads(raw[20:20+n]), raw[28+n:]


def geometry(job):
    import bpy
    from mathutils import Matrix, Vector
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=job['source'])
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    assert objects, 'Source contains no mesh'
    assert not any(o.type == 'ARMATURE' for o in bpy.context.scene.objects), 'Expected a rigid item'
    # Blender import maps glTF (x,y,z) to Blender (x,-z,y).
    to_blender = Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
    to_gltf = to_blender.inverted()
    rotation = Matrix.Identity(4)
    for axis, degrees in zip('XYZ', job['mount'].get('rotation_degrees', [0,0,0])):
        rotation = Matrix.Rotation(math.radians(degrees), 4, axis) @ rotation
    # Bake node transforms into copied mesh data, keep every source component.
    points = []
    for o in objects:
        o.data = o.data.copy()
        transform = rotation @ to_gltf @ o.matrix_world
        o.parent = None; o.matrix_world = Matrix.Identity(4)
        o.data.transform(transform)
        points.extend(v.co.copy() for v in o.data.vertices)
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    span = high-low
    grip = low + Vector(tuple(span[i]*job['mount']['grip_fraction'][i] for i in range(3)))
    spec = job['spec']; scale = spec['length'] / (span.y if spec['attachment']=='hand.R' else max(span))
    if 'tip_fraction' in job['mount']:
        target = low + Vector(tuple(span[i]*job['mount']['tip_fraction'][i] for i in range(3)))
        distal = min(points, key=lambda p: (p-target).length_squared)
    else:
        distal = max(points, key=(lambda p: p.y) if spec['attachment']=='hand.R' else (lambda p: (p-grip).length_squared))
    tip = (distal-grip)*scale
    assert spec['attachment']!='hand.R' or tip.y>0, 'Rotate tip upward before packing'
    for o in objects:
        o.data.transform(to_blender @ Matrix.Scale(scale,4) @ Matrix.Translation(-grip))
        o.data.update()
    materials = {m for o in objects for m in o.data.materials if m}
    assert len(materials)<=3, 'More than three source materials: needs a separate reviewed atlas bake'
    def triangles():
        for o in objects: o.data.calc_loop_triangles()
        return sum(len(o.data.loop_triangles) for o in objects)
    before = triangles()
    uv_repairs = 0
    if before > 12000:
        ratio = 11980 / before
        for o in objects:
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
            bpy.context.view_layer.objects.active = o
            from mathutils.bvhtree import BVHTree
            from mathutils.geometry import barycentric_transform
            source_vertices = [v.co.copy() for v in o.data.vertices]
            source_triangles = [tuple(t.vertices) for t in o.data.loop_triangles]
            source_uv = [[Vector((*o.data.uv_layers.active.data[i].uv,0)) for i in t.loops] for t in o.data.loop_triangles] if o.data.uv_layers.active else None
            if source_uv:
                assert all(-1e-5<=v<=1.00001 for tri in source_uv for uv in tri for v in uv[:2]), 'Source UV atlas is out of bounds'
                tree = BVHTree.FromPolygons(source_vertices, source_triangles, all_triangles=True)
            mod = o.modifiers.new('Conservative game budget', 'DECIMATE')
            mod.ratio = ratio; mod.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
            if source_uv:
                for poly in o.data.polygons:
                    for i in poly.loop_indices:
                        uv = o.data.uv_layers.active.data[i].uv
                        if all(-1e-5<=v<=1.00001 for v in uv): continue
                        point = o.data.vertices[o.data.loops[i].vertex_index].co.lerp(poly.center,1e-5)
                        nearest, _, triangle, _ = tree.find_nearest(point)
                        projected = barycentric_transform(nearest, *(source_vertices[j] for j in source_triangles[triangle]), *source_uv[triangle])
                        uv[:] = (max(0,min(1,projected.x)),max(0,min(1,projected.y)))
                        uv_repairs += 1
    after = triangles()
    assert after <= 12000, f'Decimation still exceeds budget: {after}'
    root = bpy.data.objects.new('Item_'+spec['id'], None); bpy.context.scene.collection.objects.link(root)
    root['itemId']=spec['id']; root['attachment']=spec['attachment']; root['sourceUnits']='meters'
    root['gripNode']=spec['id']+'_Grip'; root['tipNode']=spec['id']+'_Tip'
    for field, default in [('azimuth',20),('elevation',12),('margin',1.18),('roll',0)]:
        root['preview'+field.capitalize()] = spec['preview'].get(field, default)
    root['sourceProvider']='Tripo'; root['sourceSha256']=job['source_sha256']
    for role, position in [('Grip',Vector()),('Tip',to_blender@tip)]:
        marker=bpy.data.objects.new(root[role.lower()+'Node'],None)
        bpy.context.scene.collection.objects.link(marker); marker.parent=root
        marker.location=position; marker['attachmentRole']=role
    for o in objects: o.parent=root
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for o in root.children: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=job['raw_output'],export_format='GLB',use_selection=True,
        export_yup=True,export_animations=False,export_extras=True,export_image_format='AUTO')
    report={'source_triangles':before,'candidate_triangles':after,'projected_out_of_bounds_uv_corners':uv_repairs,'source_bounds_gltf':[list(low),list(high)],
        'scale_to_meters':scale,'grip_source_gltf':list(grip),'tip_candidate_gltf':list(tip),
        'length_axis':'Y' if spec['attachment']=='hand.R' else 'maximum dimension',
        'method':'UV-preserving collapse only when over budget; no disconnected component removal'}
    Path(job['geometry_report']).write_text(json.dumps(report,indent=2)+'\n')


def compress(raw, output, data_jpeg=False):
    from PIL import Image
    doc, binary = glb_read(raw)
    replacement={}; receipts=[]
    # Lossless resized normal/ORM maps retain data accuracy. JPEG only color.
    color_images=set()
    for material in doc.get('materials',[]):
        pbr=material.get('pbrMetallicRoughness',{})
        for info in (pbr.get('baseColorTexture'),material.get('emissiveTexture')):
            if info: color_images.add(doc['textures'][info['index']]['source'])
    for index, image in enumerate(doc.get('images', [])):
        view=doc['bufferViews'][image['bufferView']]
        payload=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        im=Image.open(io.BytesIO(payload)); original_size=list(im.size)
        im.thumbnail((1024,1024),Image.Resampling.LANCZOS)
        out=io.BytesIO()
        alpha='A' in im.getbands() and im.getchannel('A').getextrema()!=(255,255)
        if (index in color_images or data_jpeg) and not alpha:
            im.convert('RGB').save(out,'JPEG',quality=90 if index in color_images else 96,subsampling=0,optimize=True); mime='image/jpeg'
        else:
            im.convert('RGBA' if alpha else 'RGB').save(out,'PNG',optimize=True); mime='image/png'
        replacement[image['bufferView']]=out.getvalue(); image['mimeType']=mime
        receipts.append({'index':index,'source_size':original_size,'size':list(im.size),'mime':mime,'bytes':len(out.getvalue())})
    packed=bytearray()
    for index, view in enumerate(doc['bufferViews']):
        packed.extend(b'\0'*((-len(packed))%4))
        payload=replacement.get(index,binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])
        view['byteOffset']=len(packed);view['byteLength']=len(payload);packed.extend(payload)
    packed.extend(b'\0'*((-len(packed))%4));doc['buffers'][0]['byteLength']=len(packed)
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    output.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(packed))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(packed),0x004e4942)+packed)
    return receipts


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ids',nargs='*');parser.add_argument('--mounts',type=Path)
    parser.add_argument('--bpy-python',default=os.environ.get('BLENDER_MCP_BPY_PYTHON'))
    parser.add_argument('--geometry-job',type=Path,help=argparse.SUPPRESS)
    args=parser.parse_args()
    if args.geometry_job: geometry(json.loads(args.geometry_job.read_text()));return
    if not args.ids or not args.mounts or not args.bpy_python: parser.error('Supply item IDs, --mounts and --bpy-python')
    mounts=json.loads(args.mounts.read_text()); specs={s['id']:s for s in json.loads(CATALOGUE.read_text())['items']}
    validator_spec=importlib.util.spec_from_file_location('item_validator',ROOT/'scripts/blender/items/validate_candidate.py')
    validator=importlib.util.module_from_spec(validator_spec);validator_spec.loader.exec_module(validator)
    for item in args.ids:
        spec=specs[item];mount=mounts[item]
        for key in ('grip_fraction','rotation_degrees','tip_fraction'):
            value=mount.get(key)
            if key=='grip_fraction' or value is not None:
                assert isinstance(value,list) and len(value)==3 and all(isinstance(x,(int,float)) and math.isfinite(x) for x in value), f'{item}: invalid {key}'
                if 'fraction' in key: assert all(0<=x<=1 for x in value), f'{item}: fraction outside source bounds'
        folder=GENERATED/item
        sources=sorted((folder/'source').glob('*-pbr_model.glb')) or sorted((folder/'source').glob('*-model.glb'))
        assert len(sources)==1,f'{item}: expected exactly one source model, found {len(sources)}'
        source=sources[0]; source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory(prefix='weapon-pack-',dir='/tmp') as work:
            work=Path(work);job={'source':str(source),'source_sha256':source_hash,'spec':spec,'mount':mount,
                'raw_output':str(work/'geometry.glb'),'geometry_report':str(work/'geometry.json')}
            job_path=work/'job.json';job_path.write_text(json.dumps(job))
            completed=subprocess.run([args.bpy_python,str(Path(__file__).resolve()),'--geometry-job',str(job_path)],capture_output=True,text=True)
            if completed.returncode: raise RuntimeError(completed.stdout+completed.stderr)
            packed=work/'packed.glb';textures=compress(Path(job['raw_output']),packed)
            if packed.stat().st_size>=3_000_000:
                textures=compress(Path(job['raw_output']),packed,data_jpeg=True)
            receipt=validator.validate(packed,item)
            assert hashlib.sha256(source.read_bytes()).hexdigest()==source_hash, 'Source unexpectedly changed'
            CANDIDATES.mkdir(parents=True,exist_ok=True);destination=CANDIDATES/(item+'.glb')
            # Structural validation succeeds before the prior candidate is replaced.
            destination.write_bytes(packed.read_bytes())
            receipt.update({'source':str(source.relative_to(ROOT)),'source_sha256':source_hash,'mount':mount,
                'candidate':str(destination.relative_to(ROOT)),'textures':textures,
                'geometry':json.loads(Path(job['geometry_report']).read_text()),
                'limitations':'Structural checks only. Grip, front face, silhouette and equipped pose need visual approval.'})
            (folder/'packing.json').write_text(json.dumps(receipt,indent=2)+'\n')
            print(json.dumps(receipt))

if __name__=='__main__': main()
