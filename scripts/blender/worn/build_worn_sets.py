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
from mathutils.bvhtree import BVHTree
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
REGION_OF = {'helm': ['head'], 'chest': ['chest', 'hips', 'neck'], 'gloves': ['gloves'], 'boots': ['shins', 'feet'], 'pants': ['hips', 'legs', 'shins', 'feet']}


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


def _lab(rgb):
    """sRGB [0, 1] -> CIE Lab (D65), rows of 3."""
    lin = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    xyz = lin @ np.array([[.4124, .3576, .1805], [.2126, .7152, .0722], [.0193, .1192, .9505]]).T / np.array([.9505, 1, 1.089])
    f = np.where(xyz > .008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], 1)


def _srgb(lab):
    fy = (lab[:, 0] + 16) / 116; f = np.stack([fy + lab[:, 1] / 500, fy, fy - lab[:, 2] / 200], 1)
    xyz = np.where(f > .2069, f ** 3, (f - 16 / 116) / 7.787) * np.array([.9505, 1, 1.089])
    lin = np.clip(xyz @ np.array([[3.2406, -1.5372, -.4986], [-.9689, 1.8758, .0415], [.0557, -.2040, 1.0570]]).T, 0, 1)
    return np.where(lin <= .0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - .055)


def _base_image(obj):
    for slot in obj.material_slots:
        for node in slot.material.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED' and node.inputs['Base Color'].links:
                image = node.inputs['Base Color'].links[0].from_node
                if image.type == 'TEX_IMAGE' and image.image: return image.image
    return None


def _face_colours(obj, image, faces):
    """Texture colour at the UV centre of each face."""
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32); image.pixels.foreach_get(px); px = px.reshape(h, w, 4)
    uv = obj.data.uv_layers.active.data
    out = []
    for f in faces:
        p = obj.data.polygons[f]
        u = np.mean([uv[i].uv for i in p.loop_indices], 0)
        out.append(px[min(h - 1, max(0, int(u[1] * h))), min(w - 1, max(0, int(u[0] * w))), :3])
    return np.array(out)


def _skin_stats(lab):
    """Mean and spread of the main colour cluster (skin), robust to a stray collar or eye."""
    centre = np.median(lab, 0)
    for _ in range(3):
        near = lab[np.linalg.norm(lab - centre, axis=1) < 14]
        if len(near) < 20: break
        centre = near.mean(0)
    return centre, np.maximum(near.std(0), 1.5)


def skin_match(hero, obj):
    """The dressed model's skin (face under a helm, neck, hands) recoloured to the
    hero's own skin: Gemini and Tripo paint each set a little paler or pinker, and
    the worn face must look like the same boy as the bare-headed hero."""
    image = _base_image(obj)
    if not image: return None
    neck, gloves, head = (regions.REGIONS.index(r) for r in ('neck', 'gloves', 'head'))
    # Faces, not hands or collars, are compared: the front of the head below the brow.
    brow, skull = hero.joint('Head'), hero.joint('Head').z + .05
    front_of = lambda centres, region: np.nonzero((region == head) & (centres[:, 1] < brow.y - .04) & (centres[:, 2] < skull))[0]
    hero_centres = np.array([tuple(hero.body.matrix_world @ p.center) for p in hero.body.data.polygons])
    want, want_std = _skin_stats(_lab(_face_colours(hero.body, _base_image(hero.body), front_of(hero_centres, regions.classify(hero_centres, hero.joint)))))
    # The dressed skin: faces of the head, neck and hands lying on the hero's own surface
    # (a helm shell or a gauntlet stands off it), whose colour is near the neck's.
    centres = np.array([tuple(p.center) for p in obj.data.polygons])
    region = regions.classify(centres, hero.joint)
    tree = KDTree(len(hero.points))
    for i, p in enumerate(hero.points): tree.insert(p, i)
    tree.balance()
    candidates = np.nonzero(np.isin(region, [neck, gloves, head]))[0]
    near = np.array([tree.find(Vector(centres[f]))[2] < .04 for f in candidates], dtype=bool)
    candidates = candidates[near]
    if len(candidates) < 40: return None
    lab = _lab(_face_colours(obj, image, candidates))
    seed = np.intersect1d(front_of(centres, region), candidates)
    if len(seed) < 20: return None
    have, have_std = _skin_stats(_lab(_face_colours(obj, image, seed)))
    skin = candidates[np.linalg.norm(lab - have, axis=1) < 22]
    # Paint a texture mask of those faces, grown over UV seams and softened.
    w, h = image.size
    mask = np.zeros((h, w), dtype=np.float32)
    uv = obj.data.uv_layers.active.data
    for f in skin:
        pts = np.array([uv[i].uv for i in obj.data.polygons[f].loop_indices]) * (w, h)
        for k in range(1, len(pts) - 1):
            tri = pts[[0, k, k + 1]]
            x0, y0 = np.floor(tri.min(0)).astype(int) - 1; x1, y1 = np.ceil(tri.max(0)).astype(int) + 1
            x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, w - 1), min(y1, h - 1)
            if x1 < x0 or y1 < y0: continue
            ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1] + .5
            (ax, ay), (bx, by), (cx, cy) = tri
            d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(d) < 1e-9: continue
            l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d
            l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
            inside = (l1 >= -.02) & (l2 >= -.02) & (1 - l1 - l2 >= -.02)
            mask[y0:y1 + 1, x0:x1 + 1][inside] = 1
    for _ in range(3):  # grow 3 px, then soften 4 px
        grown = mask.copy()
        grown[1:] = np.maximum(grown[1:], mask[:-1]); grown[:-1] = np.maximum(grown[:-1], mask[1:])
        grown[:, 1:] = np.maximum(grown[:, 1:], mask[:, :-1]); grown[:, :-1] = np.maximum(grown[:, :-1], mask[:, 1:])
        mask = grown
    for axis in (0, 1):
        c = np.cumsum(np.pad(mask, [(5, 4) if a == axis else (0, 0) for a in (0, 1)]), axis=axis)
        mask = (np.take(c, range(9, c.shape[axis]), axis=axis) - np.take(c, range(0, c.shape[axis] - 9), axis=axis)) / 9
    px = np.empty(w * h * 4, dtype=np.float32); image.pixels.foreach_get(px); px = px.reshape(-1, 4)
    flat = mask.reshape(-1); idx = np.nonzero(flat > .01)[0]
    lab = _lab(px[idx, :3].astype(np.float64))
    # Each texel moves by how much it is skin: brows, lips and hair edges keep their own shade.
    weight = flat[idx] * np.exp(-(np.linalg.norm(lab - have, axis=1) / 18) ** 2)
    moved = (lab - have) * np.clip(want_std / have_std, .7, 1.3) + want
    px[idx, :3] = (px[idx, :3] * (1 - weight[:, None]) + _srgb(moved) * weight[:, None]).astype(np.float32)
    image.pixels.foreach_set(px.reshape(-1)); image.update()
    return {'faces': int(len(skin)), 'from': [round(float(v), 1) for v in have], 'to': [round(float(v), 1) for v in want]}


def neck_snap(hero):
    """Moves a dressed model's skin near the neck onto the hero's own neck surface.
    Every dressed model's neck is a little thinner or thicker than the hero's, so where
    a collar or helm rim meets the bare neck the two surfaces part and the cut shows.
    Armour standing off the body (gorgets, collar trims) is left where it is."""
    bm = bmesh.new(); bm.from_mesh(hero.body.data); bm.transform(hero.body.matrix_world)
    bvh = BVHTree.FromBMesh(bm); bm.free()
    base, head = hero.joint('NeckTwist01'), hero.joint('Head')
    length = (head - base).length
    def snap(co):
        h = (co.z - base.z) / length
        if not -.5 < h < 1.1: return co
        hit = bvh.find_nearest(co)
        if not hit[0]: return co
        # Full on the skin itself, fading out by a third of a neck length off the body.
        weight = min(1, max(0, (.34 * length - hit[3]) / (.14 * length))) * min(1, (1.1 - h) / .3, (h + .5) / .3)
        return co.lerp(hit[0], weight)
    return snap


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
    snap = neck_snap(hero)
    out = []
    for kind, base in pieces.items():
        for region_name in REGION_OF[kind]:
            keep = set(np.nonzero(face_region == regions.REGIONS.index(region_name))[0].tolist())
            ring = set(keep)
            # Overlap into neighbours hides seams. Only a helm owns the face; a helm's rim and
            # a collar's top each reach one ring over the seam between them.
            head = set(np.nonzero(face_region == regions.REGIONS.index('head'))[0].tolist())
            below_head = set(np.nonzero(face_region != regions.REGIONS.index('head'))[0].tolist())
            for step in range(OVERLAP_RINGS):
                blocked = (below_head if step else set()) if region_name == 'head' else set() if region_name == 'neck' and step < 1 else head
                ring = {n for f in ring for n in neighbours[f]} - keep - blocked
                keep |= ring
            piece = obj.copy(); piece.data = obj.data.copy(); piece.name = f'{base}_{region_name}'
            bpy.context.scene.collection.objects.link(piece)
            bm = bmesh.new(); bm.from_mesh(piece.data); bm.faces.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
            for v in bm.verts:
                v.co = snap(v.co)
                v.co += v.normal * LIFT
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
    skin = skin_match(hero, obj)
    pieces = cut_regions(hero, obj, SETS[name])
    bpy.data.objects.remove(obj)
    receipt = {'set': name, 'alignError': round(error, 5), 'skin': skin,
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
