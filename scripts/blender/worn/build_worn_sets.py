"""Worn armour sets: whole body regions from dressed Tripo heroes, skinned to the game hero.

    blender -b --factory-startup --python scripts/blender/worn/build_worn_sets.py -- --sets cloth,iron,mage --install

Each set is a Tripo model of the plain hero's rest pose re-dressed in one gear
set (assets/tripo-gear-sets/<set>/, ignored; the concepts were made with Gemini
from the rest render). A similarity fit on the legs lines it up with base_body.

The body is split into regions (scripts/base-hero/regions.py): head, chest,
gloves, legs, boots. A worn piece is the dressed model's whole region (helmet
with the face under it, tunic with the arms in it, ...) plus a thin overlap
band into its neighbours; in the game it replaces the plain body's region. No
armour has to be separated from skin, and the cut lines of every set meet.
Pieces are skinned from the nearest plain body surface. All pieces of a set
share one GLB and one texture (web/public/assets/rpg/gear/worn/<set>.glb);
each mesh carries extras wornGear=<gear base id> and bodyRegion=<region>.
"""
import bmesh
import bpy
import importlib.util
import json
import math
import sys
from pathlib import Path

import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('build_worn', ROOT / 'scripts' / 'blender' / 'worn' / 'build_worn.py')
worn = importlib.util.module_from_spec(spec); spec.loader.exec_module(worn)
gear = worn.gear
spec = importlib.util.spec_from_file_location('regions', ROOT / 'scripts' / 'base-hero' / 'regions.py')
regions = importlib.util.module_from_spec(spec); spec.loader.exec_module(regions)

SOURCES = ROOT / 'assets' / 'tripo-gear-sets'
OUT = ROOT / 'tmp' / 'worn-sets'
PUBLIC = ROOT / 'web' / 'public' / 'assets' / 'rpg' / 'gear' / 'worn'
TEXTURE = 2048
FACES = 60000      # whole dressed body budget before it is split into regions
OVERLAP_RINGS = 3  # face rings a piece reaches into its neighbours to hide the seam
LIFT = .0012       # outward push of a piece so its overlap never fights the body

SETS = {
    'cloth': {'helm': 'leather_cap', 'chest': 'padded_tunic', 'gloves': 'cloth_wraps', 'boots': 'soft_boots'},
    'iron': {'helm': 'iron_helm', 'chest': 'warden_plate', 'gloves': 'iron_gauntlets', 'boots': 'traveler_boots'},
    'mage': {'helm': 'rune_circlet', 'chest': 'scale_mail', 'gloves': 'spellweave_gloves', 'boots': 'windstep_boots'},
    'pants-leather': {'pants': 'leather_trousers'},
    'pants-mail': {'pants': 'mail_chausses'},
    'pants-silk': {'pants': 'starweave_trousers'},
}
REGION_OF = {'helm': ['head'], 'chest': ['chest', 'hips'], 'gloves': ['gloves'], 'boots': ['shins', 'feet'], 'pants': ['hips', 'legs', 'shins', 'feet']}


def import_set(name):
    glb = next((SOURCES / name).glob('*pbr_model.glb'))
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    meshes = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.data.transform(obj.matrix_world); obj.parent = None; obj.matrix_world = Matrix.Identity(4)
    for o in [o for o in bpy.data.objects if o not in before and o is not obj]: bpy.data.objects.remove(o)
    # Tripo exports +X forward; the rig in Blender faces -Y.
    obj.data.transform(Matrix.Rotation(-math.pi / 2, 4, 'Z'))
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(obj.data); bm.free()
    if len(obj.data.polygons) > FACES:
        gear.activate(obj)
        m = obj.modifiers.new('budget', 'DECIMATE'); m.ratio = FACES / len(obj.data.polygons); gear.apply_all(obj)
    return obj


def umeyama(src, dst):
    mu_s, mu_d = src.mean(0), dst.mean(0)
    a, b = src - mu_s, dst - mu_d
    u, d, vt = np.linalg.svd(b.T @ a / len(src))
    e = np.eye(3)
    if np.linalg.det(u) * np.linalg.det(vt) < 0: e[2, 2] = -1
    r = u @ e @ vt
    return np.trace(np.diag(d) @ e) / (a ** 2).sum(1).mean(), r, mu_d - (np.trace(np.diag(d) @ e) / (a ** 2).sum(1).mean()) * r @ mu_s


def align(hero, obj, plain='legs'):
    """Bounds first, then ICP on a band the set leaves plain: the bare knees and
    shins for armour sets, the shirt for pants sets."""
    body = np.array([tuple(p) for p in hero.points])
    pts = np.array([tuple(v.co) for v in obj.data.vertices])
    knee, hip, neck = hero.joint('L_Calf').z, hero.joint('Hip').z, hero.joint('NeckTwist01').z
    lo, hi = (knee - .06, hip - .07) if plain == 'legs' else (hip + .06, neck - .02)
    band_body = body[(body[:, 2] > lo) & (body[:, 2] < hi)]
    s0 = (body[:, 2].max() - body[:, 2].min()) / (pts[:, 2].max() - pts[:, 2].min())
    current = pts * s0
    current[:, 2] += body[:, 2].min() - current[:, 2].min()
    band = current[(current[:, 2] > lo) & (current[:, 2] < hi)]
    current[:, :2] += band_body[:, :2].mean(0) - band[:, :2].mean(0)
    tree = KDTree(len(band_body))
    for i, p in enumerate(band_body): tree.insert(p, i)
    tree.balance()
    for _ in range(30):
        sel = current[(current[:, 2] > lo) & (current[:, 2] < hi)]
        nearest = np.array([tree.find(p)[0] for p in sel])
        s, r, t = umeyama(sel, nearest)
        current = (s * (r @ current.T)).T + t
    for v, co in zip(obj.data.vertices, current): v.co = co
    obj.data.update()
    sel = current[(current[:, 2] > lo) & (current[:, 2] < hi)]
    return float(np.mean([tree.find(p)[2] for p in sel]))


def cut_regions(hero, obj, pieces):
    """One mesh per worn piece: the dressed model's faces in that piece's region,
    grown a few rings into the neighbours, lifted a hair and skinned from the body."""
    centres = np.array([tuple(p.center) for p in obj.data.polygons])
    face_region = regions.classify(centres, hero.joint)
    neighbours = [[] for _ in obj.data.polygons]
    edge_faces = {}
    for p in obj.data.polygons:
        for k in p.edge_keys: edge_faces.setdefault(k, []).append(p.index)
    for faces in edge_faces.values():
        for a in faces: neighbours[a].extend(f for f in faces if f != a)
    out = []
    for kind, base in pieces.items():
        for region_name in REGION_OF[kind]:
            keep = set(np.nonzero(face_region == regions.REGIONS.index(region_name))[0].tolist())
            ring = set(keep)
            for _ in range(OVERLAP_RINGS):
                ring = {n for f in ring for n in neighbours[f]} - keep
                keep |= ring
            piece = obj.copy(); piece.data = obj.data.copy(); piece.name = f'{base}_{region_name}'
            bpy.context.scene.collection.objects.link(piece)
            bm = bmesh.new(); bm.from_mesh(piece.data); bm.faces.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
            for v in bm.verts: v.co += v.normal * LIFT
            bm.to_mesh(piece.data); bm.free()
            if not piece.data.polygons: bpy.data.objects.remove(piece); continue
            for p in piece.data.polygons: p.use_smooth = True
            worn.transfer_weights(piece, worn.body_part(hero, set(hero.owner)))
            piece['wornGear'] = base; piece['bodyRegion'] = region_name; piece['wornKind'] = kind
            out.append(piece)
    return out


# Pants have no free-standing model: their inventory icon is the worn piece.
ICON_FROM_WORN = {'leather_trousers', 'mail_chausses', 'starweave_trousers'}
ICONS = ROOT / 'web' / 'public' / 'assets' / 'rpg' / 'gear'


def icon(pieces, path):
    """Inventory icon from the worn piece, lit like build_gear.py's studio icons."""
    scene = bpy.context.scene
    shown = set(pieces)
    hidden = [o for o in scene.objects if o.type == 'MESH' and o not in shown and not o.hide_render]
    for o in hidden: o.hide_render = True
    points = [p.matrix_world @ v.co for p in pieces for v in p.data.vertices]
    lo = Vector([min(p[i] for p in points) for i in range(3)]); hi = Vector([max(p[i] for p in points) for i in range(3)])
    target = (lo + hi) / 2
    direction = Vector((.35, -1, .25)).normalized()
    cam = bpy.data.objects.new('icon_cam', bpy.data.cameras.new('icon_cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.type = 'ORTHO'
    cam.location = target + direction * 3; cam.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    inverse = cam.rotation_euler.to_matrix().transposed()
    projected = [inverse @ (p - target) for p in points]
    cam.data.ortho_scale = max(max(p[i] for p in projected) - min(p[i] for p in projected) for i in (0, 1)) * 1.1
    lights = []
    for loc, power, color in (((-1.6, -3, -.3), 140, (1, .94, .83)), ((2.2, -2.6, 1.1), 63, (.73, .86, 1)), ((1.2, 1.1, 2.1), 186, (.77, .88, 1))):
        light = bpy.data.objects.new('softbox', bpy.data.lights.new('softbox', 'AREA')); scene.collection.objects.link(light)
        light.location = target + Vector(loc) * .5; light.data.energy = power * .25; light.data.color = color; light.data.size = 1
        light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler(); lights.append(light)
    scene.view_settings.view_transform = 'AgX'
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 48; scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 384; scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'WEBP'; scene.render.image_settings.color_mode = 'RGBA'; scene.render.image_settings.quality = 88
    scene.render.filepath = str(path); bpy.ops.render.render(write_still=True)
    scene.render.film_transparent = False; scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGB'
    for o in hidden: o.hide_render = False
    for light in lights: bpy.data.objects.remove(light)
    bpy.data.objects.remove(cam)


def build(name, install):
    directory = OUT / name; directory.mkdir(parents=True, exist_ok=True)
    hero = worn.Hero()
    obj = import_set(name)
    error = align(hero, obj, 'shirt' if name.startswith('pants') else 'legs')
    for slot in obj.material_slots:
        for node in slot.material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image and max(node.image.size) > TEXTURE: node.image.scale(TEXTURE, TEXTURE)
    pieces = cut_regions(hero, obj, SETS[name])
    bpy.data.objects.remove(obj)
    receipt = {'set': name, 'alignError': round(error, 5),
               'pieces': {p.name: sum(len(f.vertices) - 2 for f in p.data.polygons) for p in pieces}}
    all_pieces = pieces
    for piece in all_pieces:
        piece.data.transform(hero.body.matrix_world.inverted())
        piece.parent = hero.arm; piece.matrix_parent_inverse = Matrix.Identity(4)
        piece.matrix_world = hero.body.matrix_world.copy()
        mod = piece.modifiers.new('Armature', 'ARMATURE'); mod.object = hero.arm
    # Review: the body with this set's regions in place of the plain ones, as in the game.
    rest = hero.body.copy(); rest.data = hero.body.data.copy(); bpy.context.scene.collection.objects.link(rest)
    centres = np.array([tuple(hero.body.matrix_world @ p.center) for p in rest.data.polygons])
    replaced = {regions.REGIONS.index(p['bodyRegion']) for p in pieces}
    bm = bmesh.new(); bm.from_mesh(rest.data); bm.faces.ensure_lookup_table()
    gone = set(np.nonzero(np.isin(regions.classify(centres, hero.joint), list(replaced)))[0].tolist())
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index in gone], context='FACES')
    bm.to_mesh(rest.data); bm.free()
    hero.body.hide_render = True
    worn.render_preview(hero, all_pieces[min(1, len(all_pieces) - 1)], directory / f'{name}-preview.png')
    hero.body.hide_render = False; bpy.data.objects.remove(rest)
    for base in {p['wornGear'] for p in all_pieces} & ICON_FROM_WORN:
        hero.body.hide_render = True
        icon([p for p in all_pieces if p['wornGear'] == base], directory / f'{base}.webp')
        hero.body.hide_render = False
        if install: (ICONS / f'{base}.webp').write_bytes((directory / f'{base}.webp').read_bytes())
    glb = directory / f'{name}.glb'
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for piece in all_pieces: piece.select_set(True)
    hero.arm.select_set(True); bpy.context.view_layer.objects.active = all_pieces[0]
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True, export_extras=True,
                              export_image_format='JPEG', export_jpeg_quality=84, export_yup=True, export_skins=True,
                              export_animations=False, export_materials='EXPORT')
    receipt['bytes'] = glb.stat().st_size
    if install:
        PUBLIC.mkdir(parents=True, exist_ok=True)
        (PUBLIC / glb.name).write_bytes(glb.read_bytes()); receipt['installed'] = True
    print('WORN_SET_RECEIPT ' + json.dumps(receipt))


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    names = list(SETS) if '--sets' not in argv else argv[argv.index('--sets') + 1].split(',')
    for name in names: build(name, '--install' in argv)
