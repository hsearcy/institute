"""Bounded catalogue export jobs called through Blender MCP.

Load this module once or on every call; live bake state lives in Blender's
namespace. run_next() completes one observable stage. Finished candidates are
skipped from disk, while an interrupted item can rebuild from its saved source.
No writes to public assets and no automatic visual acceptance.
"""
import hashlib
import importlib.util
import json
import time
from pathlib import Path

try:
    import bpy
except ModuleNotFoundError:
    bpy=None  # The --pack stage deliberately runs outside Blender.

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'tmp/item-models/catalogue-v1'
KEY='item_catalogue_export_v1'
INSTALLED={'apprentice','thunderrod','cleaver','moonstaff','phoenix'}
ITEMS=[x['id'] for x in json.loads((ROOT/'scripts/blender/items/catalogue.json').read_text())['items'] if x['id'] not in INSTALLED]


def module(name):
    path=ROOT/'scripts/blender/items'/f'{name}.py'
    spec=importlib.util.spec_from_file_location('catalogue_'+name,path)
    result=importlib.util.module_from_spec(spec)
    exec(compile(path.read_bytes(),str(path),'exec'),result.__dict__)
    return result


def _json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_suffix('.pending.json')
    temporary.write_text(json.dumps(value,indent=2)+'\n');temporary.replace(path)


def status():
    result=[]
    for item_id in ITEMS:
        path=OUT/item_id/'receipt.json'
        result.append(json.loads(path.read_text()) if path.exists() else {'id':item_id,'stage':'pending'})
    return result


def repair_source(scene,item_id,directory):
    """Repair only closed inward/inconsistent face order; preserve positions.

    Materialize the evaluated mesh only for defective parts so bevel output is
    retained exactly. Open surfaces stay open; nonmanifold parts remain errors.
    The ordinary bake preflight independently validates the repaired result.
    """
    import bmesh
    topology=module('source_topology');caller=bpy.context.window.scene;repairs=[]
    try:
        bpy.context.window.scene=scene;bpy.context.view_layer.update()
        root=next(obj for obj in scene.objects if obj.get('itemId')==item_id)
        inverse=root.matrix_world.inverted();graph=bpy.context.evaluated_depsgraph_get()
        for obj in root.children:
            if obj.type!='MESH':continue
            evaluated=obj.evaluated_get(graph)
            data=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=graph)
            transform=inverse@obj.matrix_world
            def inspect():
                data.calc_loop_triangles()
                return topology.inspect_mesh([tuple(transform@v.co) for v in data.vertices],
                    [tuple(f.vertices) for f in data.polygons],
                    [(t.polygon_index,tuple(t.vertices)) for t in data.loop_triangles])
            before=inspect()
            if any(part['nonManifoldEdges'] for part in before['components']):
                raise ValueError('Source nonmanifold topology requires authored repair: '+obj.name)
            if not before['rejected']:
                bpy.data.meshes.remove(data);continue
            vertices=[tuple(vertex.co) for vertex in data.vertices]
            bm=bmesh.new();bm.from_mesh(data);pending=set(bm.faces)
            while pending:
                seed=pending.pop();component={seed};stack=[seed]
                while stack:
                    for edge in stack.pop().edges:
                        for face in edge.link_faces:
                            if face in pending:pending.remove(face);component.add(face);stack.append(face)
                if all(len(edge.link_faces)==2 for face in component for edge in face.edges):
                    bmesh.ops.recalc_face_normals(bm,faces=list(component))
                    if transform.determinant()<0:bmesh.ops.reverse_faces(bm,faces=list(component))
            bm.to_mesh(data);bm.free();data.update()
            assert [tuple(vertex.co) for vertex in data.vertices]==vertices,'Repair changed vertex positions'
            after=inspect()
            if after['rejected']:raise ValueError('Closed winding repair failed: '+obj.name)
            obj.modifiers.clear();obj.data=data
            repairs.append({'part':obj.name,'verticesUnchanged':True,'before':before,'after':after})
        _json(Path(directory)/'source-winding-repairs.json',{'id':item_id,'repairs':repairs})
        return repairs
    finally:bpy.context.window.scene=caller


def run_next(item_id=None):
    """Prepare one item, bake one channel, or export raw GLB per MCP call."""
    if item_id is None:
        item_id=next((item for item in ITEMS if not (OUT/item/(item+'-raw.glb')).exists()),None)
        if item_id is None:return {'stage':'all_raw_exports_complete','items':len(ITEMS)}
    if item_id not in ITEMS:raise ValueError('Expected a missing catalogue item')
    directory=OUT/item_id;directory.mkdir(parents=True,exist_ok=True)
    raw=directory/(item_id+'-raw.glb')
    if raw.exists():return {'id':item_id,'stage':'raw_export_complete','raw':str(raw)}
    started=time.monotonic();caller=bpy.context.window.scene
    previous_undo=bpy.context.preferences.edit.use_global_undo
    bpy.context.preferences.edit.use_global_undo=False
    cache=bpy.app.driver_namespace.setdefault(KEY,{})
    receipt={'id':item_id,'stage':'starting','visualStatus':'Unreviewed candidate'}
    try:
        if item_id not in cache:
            timings={};step_started=time.monotonic()
            source_file=directory/'source.blend'
            if source_file.exists():
                with bpy.data.libraries.load(str(source_file),link=False) as (data,target):
                    target.scenes=list(data.scenes)
                scene=target.scenes[0]
            else:
                scene=module('build_studies').build_study([item_id])
            timings['sourceBuildOrLoad']=round(time.monotonic()-step_started,3)
            step_started=time.monotonic()
            repair_source(scene,item_id,directory)
            timings['sourceRepair']=round(time.monotonic()-step_started,3)
            step_started=time.monotonic()
            if not source_file.exists():
                bpy.data.libraries.write(str(source_file),{scene},path_remap='ABSOLUTE',fake_user=True,compress=True)
            timings['sourceSnapshot']=round(time.monotonic()-step_started,3)
            baker=module('bake_items')
            step_started=time.monotonic()
            state=baker.prepare(scene,item_id,1024,structured_blade=item_id=='starfall',
                                structured_grip=True,split_material_boundaries=True,
                                max_triangles=12000,fast_uv_pack=True)
            timings['bakePrepare']=round(time.monotonic()-step_started,3)
            state['directory']=directory
            cache[item_id]=(baker,state)
            receipt.update(stage='prepared',sourceRecipe=scene.get('itemRecipeSha256'),
                           sourceTriangles=state['source_triangles'],
                           prepareTimings=timings,blenderObjects=len(bpy.data.objects),blenderScenes=len(bpy.data.scenes),
                           bakePrepareTimings=state.get('prepare_timings',{}),
                           triangles=state['helper'].triangle_count([state['low'],*state['glows']]),
                           projectionGroups=len(state['batches']))
        else:
            baker,state=cache[item_id]
            previous=directory/'receipt.json'
            if previous.exists():receipt.update(json.loads(previous.read_text()))
            channel=next((kind for kind in ('albedo','normal','orm') if kind not in state['completed']),None)
            if channel:
                baker.bake(state,channel)
                image=state['images'][channel]
                image.filepath_raw=str(directory/(item_id+'-'+channel+'.png'))
                image.file_format='PNG';image.save()
                receipt.update(stage='baked_'+channel,completedChannels=sorted(state['completed']))
            else:
                output=baker.finish(state)
                receipt.update(stage='raw_export_complete',raw=str(output),
                               rawSHA256=hashlib.sha256(output.read_bytes()).hexdigest())
        receipt['lastStageSeconds']=round(time.monotonic()-started,3)
        _json(directory/'receipt.json',receipt)
        print(json.dumps(receipt));return receipt
    except Exception as error:
        receipt.update(stage='failed',error=str(error),lastStageSeconds=round(time.monotonic()-started,3))
        _json(directory/'failure.json',receipt)
        raise
    finally:
        bpy.context.window.scene=caller
        bpy.context.preferences.edit.use_global_undo=previous_undo


def thumbnail(item_id,size=512):
    """Render the exact externally packed GLB once; returns structural review."""
    if item_id not in ITEMS:raise ValueError(item_id)
    directory=OUT/item_id;candidate=directory/(item_id+'.glb')
    validation=module('validate_candidate').validate(candidate,item_id)
    caller=bpy.context.window.scene
    scene=bpy.data.scenes.new('Catalogue exact '+item_id)
    try:
        bpy.context.window.scene=scene
        bpy.ops.import_scene.gltf(filepath=str(candidate))
        world=bpy.data.worlds.new('Catalogue thumbnail world');world.use_nodes=True;scene.world=world
        world.node_tree.nodes['Background'].inputs[0].default_value=(.13,.16,.20,1)
        world.node_tree.nodes['Background'].inputs[1].default_value=.32
        scene.view_settings.view_transform='AgX'
        output=directory/(item_id+'.png')
        root=next(obj for obj in scene.objects if obj.get('itemId')==item_id)
        pose={'azimuth':20,'elevation':14,'roll':-28} if root.get('attachment')=='hand.R' else {'roll':0}
        module('review_candidate').thumbnail(scene,item_id,str(output),size=size,studio='metal',
                                             pose=pose,light_gain=.28)
        validation.update(thumbnail=str(output),thumbnailSHA256=hashlib.sha256(output.read_bytes()).hexdigest(),
                          visualStatus='Awaiting independent exact-item review')
        _json(directory/'candidate.json',validation)
        print(json.dumps(validation));return validation
    finally:bpy.context.window.scene=caller


def pack_ready():
    """CPU-only packaging; no render ownership and no public installation."""
    packer=module('pack_candidate');validator=module('validate_candidate');results=[]
    for item_id in ITEMS:
        directory=OUT/item_id;raw=directory/(item_id+'-raw.glb');candidate=directory/(item_id+'.glb')
        if not raw.exists():continue
        try:
            if not candidate.exists():packer.pack(raw,candidate)
            result=validator.validate(candidate,item_id)
            _json(directory/'structural-review.json',result)
        except Exception as error:
            result={'id':item_id,'stage':'structural_failure','error':str(error)}
            _json(directory/'structural-failure.json',result)
        results.append(result)
    return results


def run_item(item_id,max_seconds=45):
    """Advance at stage boundaries; a single stage can exceed the soft limit.

    A failed item returns its own error receipt, so run_items can continue the
    rest of the catalogue. It never substitutes another source or skips checks.
    """
    started=time.monotonic()
    try:
        while True:
            result=run_next(item_id)
            if result['stage']=='raw_export_complete' or time.monotonic()-started>=max_seconds:
                return result
    except Exception as error:
        return {'id':item_id,'stage':'failed','error':str(error)}


def run_items(ids=None,max_seconds=45):
    """Process a bounded selection, continuing beyond individual failures."""
    started=time.monotonic();results=[]
    for item_id in ids or ITEMS:
        if (OUT/item_id/(item_id+'-raw.glb')).exists():continue
        results.append(run_item(item_id,max_seconds=max(1,max_seconds-(time.monotonic()-started))))
        if time.monotonic()-started>=max_seconds:break
    print(json.dumps(results));return results


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--pack',action='store_true',help='Pack and validate completed raw exports on CPU')
    args=parser.parse_args()
    if args.pack:print(json.dumps(pack_ready(),indent=2))
    else:print(json.dumps(status(),indent=2))
