"""Apply the reviewed candidate and matching source after integration acceptance.

This script is intentionally not called by any build. It never commits files.
"""
from pathlib import Path
import ast, json, shutil, struct

root=Path(__file__).resolve().parents[3]
source=root/'scripts/blender'
public=root/'web/public/assets/rpg'
candidate=public/'review/wraith-cloth-lift.glb'
assert candidate.exists(), 'Reviewed candidate is required'
backup=Path('/tmp/embercrypt-wraith-before-cc0');backup.mkdir(exist_ok=True)
for path in [public/'wraith.glb',*(source/'textures'/f'wraith-{role}.png' for role in ('albedo','normal','orm'))]:
    if not (backup/path.name).exists():shutil.copyfile(path,backup/path.name)
# The canonical builder explicitly loads the licensed source helper. Missing
# source cache reports the documented fetch command; there is no old-art fallback.
p=source/'detailed/characters.py';text=p.read_text();node=next(n for n in ast.parse(text).body if isinstance(n,ast.FunctionDef) and n.name=='make_wraith_v2')
assert 'return make_wraith_cc0(RPG_REPO_ROOT)' not in text, 'Canonical switch already applied'
lines=text.splitlines(keepends=True)
replacement="""def make_wraith_v2():
    helper=RPG_REPO_ROOT/'scripts/blender/detailed/wraith_cc0.py'
    exec(compile(helper.read_text(),str(helper),'exec'),globals())
    return make_wraith_cc0(RPG_REPO_ROOT)
"""
p.write_text(''.join(lines[:node.lineno-1])+replacement+''.join(lines[node.end_lineno:]))
p=source/'detailed/bake.py';text=p.read_text()
text=text.replace('    started=time.time();scene=bpy.context.scene','    started=time.time();scene=bpy.context.scene\n    size=int(collection.get(\'atlasSize\',size))')
text=text.replace('    bpy.ops.uv.smart_project(angle_limit=math.radians(62),island_margin=.006,correct_aspect=True,scale_to_bounds=True)', '    if not collection.get(\'preserveAuthoredUV\'):\n        bpy.ops.uv.smart_project(angle_limit=math.radians(62),island_margin=.006,correct_aspect=True,scale_to_bounds=True)')
text=text.replace('    tex={}\n', '    if \'runtimeSpecular\' in collection:p.inputs[\'Specular IOR Level\'].default_value=collection[\'runtimeSpecular\']\n    tex={}\n')
p.write_text(text)
p=source/'build_assets.py';text=p.read_text();text=text.replace("    if name in ('skeleton','revenant','guardian'):articulate_enemy(name,collection)","    if name in ('skeleton','revenant','guardian'):articulate_enemy(name,collection)\n    if name=='wraith':export_wraith_joints(collection,OUT/'wraith.glb')")
p.write_text(text)
# Keep the exact reviewed texture/geometry payload. Add only provenance and an
# explicit equipment tag, matching the canonical joint-export helper.
data=candidate.read_bytes();length=struct.unpack_from('<I',data,12)[0]
doc=json.loads(data[20:20+length]);binary=data[28+length:]
doc['asset']['copyright']='CC0 lich foundation shared by Samfa12-tech; created with Meshy; adapted for Embercrypt.'
for node in doc['nodes']:
    if 'mesh' in node and node.get('name','').startswith('ArmLowerL'):
        node.setdefault('extras',{})['rigidEquipment']='staff'
meta=json.dumps(doc,separators=(',',':')).encode();meta+=b' '*((-len(meta))%4)
result=struct.pack('<4sII',b'glTF',2,28+len(meta)+len(binary))+struct.pack('<II',len(meta),0x4e4f534a)+meta+struct.pack('<II',len(binary),0x004e4942)+binary
temporary=public/'wraith.glb.new'
temporary.write_bytes(result);temporary.replace(public/'wraith.glb')
for role in ('albedo','normal','orm'):
    filename='wraith-cloth-lift-albedo.png' if role=='albedo' else f'wraith-candidate-{role}.png'
    shutil.copyfile(source/'experiments/exports/maps'/filename,source/'textures'/f'wraith-{role}.png')
print('Reviewed wraith and matching canonical source installed; backup:',backup)
p=source/'validate_assets.py';text=p.read_text()
block="""    if name=='wraith':
        joints={i:node.get('extras',{}).get('enemyJoint') for i,node in enumerate(doc['nodes']) if node.get('extras',{}).get('enemyJoint')}
        assert set(joints.values())=={'Body','Head','Cape','ArmUpperL','ArmUpperR','ArmLowerL','ArmLowerR'}
        assert not doc.get('skins') and not doc.get('animations')
        parents={child:i for i,node in enumerate(doc['nodes']) for child in node.get('children',[])}
        for index,key in joints.items():
            expected_parent='ArmUpper'+key[-1] if key.startswith('ArmLower') else 'Body' if key!='Body' else None
            assert joints.get(parents.get(index))==expected_parent
        staff=next(i for i,node in enumerate(doc['nodes']) if node.get('extras',{}).get('rigidEquipment')=='staff')
        assert joints[parents[staff]]=='ArmLowerL'
        assert triangles<12_000 and primitives==7 and len(doc['images'])==3
        stats[name]['rigidJoints']=list(joints.values())
        stats[name]['provenance']={'license':'CC0','creator':'Samfa12-tech / Meshy','source':'https://github.com/Samfa12-tech/The-Horde-RT-demo','commit':'463aed23d879ea673600bd1121fd0989a518599b','sourceSha256':'049979a83aca55358f54af8d3af1f7d518607bef634474a4ef015bfdff947a42','licenseEvidence':'scripts/blender/sources/cc0-lich'}
"""
text=text.replace("    if name=='hero' or name.startswith('hero-'):",block+"    if name=='hero' or name.startswith('hero-'):")
p.write_text(text)
p=source/'README.md';text=p.read_text()
text=text.replace('# Sunken Vault original model library','# Sunken Vault model library')
text=text.replace('These original models were built, UV-baked, exported, inspected, and revised with','These models were authored or adapted, UV-baked, exported, inspected, and revised with')
text=text.replace('**“use blender mcp to create high quality models.”** No downloaded models or\nthird-party textures are included. The procedural Blender sources are reproducible.', '**“use blender mcp to create high quality models.”** The wraith adapts an explicitly\nCC0 creator-published lich foundation; its source, fixed hashes, license evidence,\nand cache recovery are documented in [sources/cc0-lich](sources/cc0-lich/README.md).\nOther runtime models retain their project-authored procedural sources.')
text=text.replace('Runtime albedo atlases retain up to 1024 pixels;', 'Runtime albedo atlases retain up to 1024 pixels (2048 for the authored wraith);')
text=text.replace('## Layered wraith cloth','## Previous layered wraith cloth (superseded)')
text += '''\n\n## CC0 wraith foundation and rigid articulation\n\nThe current wraith preserves a layered robe, crown, skull-like face and held staff\nfrom a creator-published CC0 Meshy foundation, with coherent cloth normals,\nrestrained teal coloring, matte roughness breakup and a UV-preserving Blender bake.\nThe exact source is pinned to commit `463aed23d879ea673600bd1121fd0989a518599b`;\nits SHA-256 is `049979a83aca55358f54af8d3af1f7d518607bef634474a4ef015bfdff947a42`.\nCredit: Lich foundation created and animated with Meshy, shared CC0 by\nSamfa12-tech; adapted for Embercrypt. No generation service is required to run it.\n\n`detailed/wraith_cc0.py` is the canonical builder. Restore a missing ignored\nsource cache with `python scripts/blender/sources/cc0-lich/fetch.py` before a\nfull Blender rebuild. The builder checks its fixed hash and explicitly fails\nif it is missing or altered; it never falls back to a rejected procedural model.\nThe shipped GLB embeds everything needed at runtime.\n\nThe model has 9,188 triangles, seven rigid mesh parts and seven joints:\nBody, Head, Cape, ArmUpperL/R and ArmLowerL/R. Forearms parent to upper arms;\nhead, cape and shoulders parent to Body. The staff is ordinary geometry in\nthe holding ArmLowerL mesh, so it cannot distort with biped leg/skin weights.\nThere are no skins, clips or artificial leg joints. Keep motion restrained to\npreserve the rigid garment overlaps. The previous exact vertical bounds\n0.06131713–1.93340003 meters are retained; width is 1.294m including the staff.\n\nThe authored UVs retain a 2048px albedo; normal and ORM maps are packed at512px.\nThe full build honors the wraith's UV/atlas/specular metadata, then adds the\nrigid hierarchy. The manifest records final byte counts and provenance; the\nvalidator verifies all seven joints and that the staff follows its forearm.\n\nThe final GLB reimport and a moderate reaching pose each passed independent\n8/10 asset review. Source/clay studies and rejected experiments remain isolated\nunder `experiments`, with their limitations recorded rather than called finished.\n\n![Final GLB reimport at the actual camera elevation](previews/v2/wraith-cc0-cloth-v2-exported-game-angle.png)\n'''
p.write_text(text)
