"""Build the worn (on-body) armour: skinned shells fitted to the game hero.

Headless, one process per call (Windows Blender from WSL via build_worn.sh):

    blender -b --factory-startup --python scripts/blender/worn/build_worn.py -- --ids padded_tunic,iron_helm --install

Every piece starts from the hero's own body surface (base_body in
tripo-hero-game.glb): a region is chosen by skin weights and bind-pose height,
smoothed, pushed off the body and given thickness, then trimmed along its open
edges. The shell is skinned by copying the body's weights, so it fits exactly
and bends with every clip. Materials come from scripts/blender/items/build_gear.py
and are baked to one atlas. The GLB keeps base_body's local space and bone names;
the game binds it to the hero's own skeleton (web/src/rpg/world/wornGear.ts).

Gear icons and turntable models stay the free-standing build_gear.py models.
"""
import bmesh
import bpy
import importlib.util
import json
import math
import sys
import time
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('build_gear', ROOT / 'scripts' / 'blender' / 'items' / 'build_gear.py')
gear = importlib.util.module_from_spec(spec); spec.loader.exec_module(gear)

HERO = ROOT / 'web' / 'public' / 'assets' / 'rpg' / 'tripo-hero-game.glb'
OUT = ROOT / 'tmp' / 'worn-models'
PUBLIC = ROOT / 'web' / 'public' / 'assets' / 'rpg' / 'gear' / 'worn'
BUDGET = 9000
# Bind-pose model units are about 1/1.8 of metres; patterns are authored in metres.
PATTERN_SCALE = 1.8


# ---------------------------------------------------------------- the hero

def distance_to_segment(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (a + ab * t - p).length


class Hero:
    def __init__(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(HERO))
        self.arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
        parts = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('base_body')]
        for o in list(bpy.context.scene.objects):
            if o.type == 'MESH' and o not in parts: bpy.data.objects.remove(o)
        # The body ships as one mesh per region; work on the whole body.
        bpy.ops.object.select_all(action='DESELECT')
        for o in parts: o.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        if len(parts) > 1: bpy.ops.object.join()
        self.body = bpy.context.active_object; self.body.name = 'base_body'
        bm = bmesh.new(); bm.from_mesh(self.body.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bm.to_mesh(self.body.data); bm.free()
        world = self.body.matrix_world
        # Forward is -Y in Blender here (the rig faces game +Z); up is +Z.
        self.forward = Vector((0, -1, 0))
        # Body parts by the nearest bone segment. The skin weights are not used for
        # this: the source rig gave parts of the chest to the arm twist bones.
        segments = self.segments()
        self.points, self.owner = [], []
        for v in self.body.data.vertices:
            p = world @ v.co
            self.points.append(p)
            self.owner.append(min(segments, key=lambda s: distance_to_segment(p, s[1], s[2]))[0])

    def segments(self):
        j = self.joint; up = Vector((0, 0, 1)); out = []
        def chain(name, *points):
            for a, b in zip(points, points[1:]): out.append((name, a, b))
        chain('torso', j('Hip'), j('Spine01'), j('Spine02'), j('NeckTwist01'))
        chain('neck', j('NeckTwist01'), j('Head'))
        chain('head', j('Head'), j('Head') + up * .14)
        for side in ('L', 'R'):
            hand_dir = (j(f'{side}_Hand') - j(f'{side}_Forearm')).normalized()
            chain('torso', j('Spine02'), j(f'{side}_Upperarm'))
            chain('torso', j('Hip'), j(f'{side}_Thigh'))
            chain(f'upperarm_{side}', j(f'{side}_Upperarm'), j(f'{side}_Forearm'))
            chain(f'forearm_{side}', j(f'{side}_Forearm'), j(f'{side}_Hand'))
            chain(f'hand_{side}', j(f'{side}_Hand'), j(f'{side}_Hand') + hand_dir * .07)
            chain(f'thigh_{side}', j(f'{side}_Thigh'), j(f'{side}_Calf'))
            chain(f'calf_{side}', j(f'{side}_Calf'), j(f'{side}_Foot'))
            toe = j(f'{side}_ToeBase')
            chain(f'foot_{side}', j(f'{side}_Foot'), toe, toe + (toe - j(f'{side}_Foot')).normalized() * .04)
        return out

    def joint(self, bone):
        return self.arm.matrix_world @ self.arm.data.bones[bone].head_local

    def region(self, keep):
        """Indices of body vertices where keep(point, owner) is true."""
        return {i for i, (p, o) in enumerate(zip(self.points, self.owner)) if keep(p, o)}


# ---------------------------------------------------------------- shells

def shell(hero, name, groups, cuts, mat, gap, thickness, smooth=4, trim=None, trim_radius=.004, floor=False, hull=False):
    """Body region -> smoothed, offset, solid shell (+ trim tubes on its open edges).

    groups: skin groups that may be part of the piece (a coarse region).
    cuts: (point, normal, only) planes; faces on the normal side are removed,
    limited to faces owned by the groups in `only` when it is given. The planes
    are cut into the mesh first, so every hem, cuff and brim is a clean line.
    """
    obj = hero.body.copy(); obj.data = hero.body.data.copy(); obj.name = name
    bpy.context.scene.collection.objects.link(obj)
    obj.modifiers.clear()
    world = obj.matrix_world.copy(); obj.parent = None; obj.matrix_world = Matrix.Identity(4)
    obj.data.transform(world)
    parts = sorted(set(hero.owner)); part_id = {name: i for i, name in enumerate(parts)}
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.verts.ensure_lookup_table()
    layer = bm.verts.layers.int.new('part')
    for v in bm.verts: v[layer] = part_id[hero.owner[v.index]]
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-4)

    def vert_owner(v):
        return parts[v[layer]] if layer is not None else ''
    def face_owner(f):
        if layer is None: return ''
        count = {}
        for v in f.verts: count[v[layer]] = count.get(v[layer], 0) + 1
        return parts[max(count, key=count.get)]

    bmesh.ops.delete(bm, geom=[v for v in bm.verts if vert_owner(v) not in groups], context='VERTS')
    if hull:
        # Helmets are convex: wrap the head and hair in their hull, then remesh it evenly.
        points = [v.co.copy() for v in bm.verts]
        bm.free(); bm = bmesh.new()
        for co in points: bm.verts.new(co)
        result = bmesh.ops.convex_hull(bm, input=bm.verts[:])
        inside = {v for v in result['geom_interior'] + result['geom_unused'] if isinstance(v, bmesh.types.BMVert)}
        bmesh.ops.delete(bm, geom=list(inside), context='VERTS')
        bm.to_mesh(obj.data); bm.free()
        obj.vertex_groups.clear(); gear.activate(obj)
        r = obj.modifiers.new('even', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = .006
        m = obj.modifiers.new('round', 'LAPLACIANSMOOTH'); m.iterations = 6; m.lambda_factor = .5; m.use_volume_preserve = True
        gear.apply_all(obj)
        bm = bmesh.new(); bm.from_mesh(obj.data); layer = None
    for point, normal, only in cuts:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=point, plane_no=normal)
        doomed = [f for f in bm.faces if (f.calc_center_median() - point).dot(normal) > 0 and (only is None or face_owner(f) in only)]
        bmesh.ops.delete(bm, geom=doomed, context='FACES')
    # Slivers left by the cuts have wild normals and would spike when the shell is lifted.
    bmesh.ops.dissolve_degenerate(bm, dist=.0015, edges=bm.edges[:])
    # Keep the largest connected piece only.
    seen, best = set(), []
    for f in bm.faces:
        if f in seen: continue
        stack, island = [f], []
        seen.add(f)
        while stack:
            face = stack.pop(); island.append(face)
            for e in face.edges:
                for other in e.link_faces:
                    if other not in seen: seen.add(other); stack.append(other)
        if len(island) > len(best): best = island
    keep = set(best)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in keep], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(obj.data); bm.free()
    # Surface shells keep each vertex's own body weights; a hull has none yet.
    obj.data.materials.clear(); obj.data.materials.append(mat)
    gear.activate(obj)
    if smooth:
        # Smooth the inside only: cut edges stay on their clean planes.
        edge = {v for e in obj.data.edges if edge_is_open(obj, e) for v in e.vertices}
        inner = obj.vertex_groups.new(name='inner')
        inner.add([v.index for v in obj.data.vertices if v.index not in edge], 1.0, 'REPLACE')
        m = obj.modifiers.new('smooth', 'SMOOTH'); m.iterations = smooth * 3; m.factor = .6; m.vertex_group = 'inner'
    d = obj.modifiers.new('lift', 'DISPLACE'); d.direction = 'NORMAL'; d.mid_level = 0; d.strength = gap
    gear.apply_all(obj)
    if 'inner' in obj.vertex_groups: obj.vertex_groups.remove(obj.vertex_groups['inner'])
    if hull: transfer_weights(obj, body_part(hero, groups))
    if floor:
        for v in obj.data.vertices: v.co.z = max(v.co.z, .002)
    pieces = [obj]
    if trim:
        pieces += edge_trims(obj, f'{name}_trim', trim, trim_radius)
    s = obj.modifiers.new('solid', 'SOLIDIFY'); s.thickness = thickness; s.offset = -1; s.use_rim = True
    gear.apply_all(obj)
    for p in pieces: shade_smooth(p)
    return pieces


def body_part(hero, parts):
    """A world-space copy of the body holding only the given parts (a weight source)."""
    obj = hero.body.copy(); obj.data = hero.body.data.copy(); obj.name = 'weight_source'
    bpy.context.scene.collection.objects.link(obj)
    obj.modifiers.clear()
    world = obj.matrix_world.copy(); obj.parent = None; obj.matrix_world = Matrix.Identity(4)
    obj.data.transform(world)
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if hero.owner[v.index] not in parts], context='VERTS')
    bm.to_mesh(obj.data); bm.free()
    return obj


def transfer_weights(target, source, drop_source=True):
    """Skin weights from the nearest face of `source` (same world space)."""
    for g in source.vertex_groups:
        if g.name not in target.vertex_groups: target.vertex_groups.new(name=g.name)
    gear.activate(target)
    dt = target.modifiers.new('weights', 'DATA_TRANSFER'); dt.object = source
    dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
    dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
    bpy.ops.object.datalayout_transfer(modifier=dt.name)
    bpy.ops.object.modifier_apply(modifier=dt.name)
    if drop_source: bpy.data.objects.remove(source)


def edge_is_open(obj, edge, _cache={}):
    key = obj.data.as_pointer()
    if _cache.get('key') != key:
        count = {}
        for poly in obj.data.polygons:
            for k in poly.edge_keys: count[k] = count.get(k, 0) + 1
        _cache.clear(); _cache.update(key=key, count=count)
    return _cache['count'].get(tuple(sorted(edge.vertices)), 0) == 1


def edge_trims(obj, name, mat, radius):
    """Tubes along every open edge loop of a shell (hems, cuffs, brims)."""
    bm = bmesh.new(); bm.from_mesh(obj.data)
    boundary = [e for e in bm.edges if e.is_boundary]
    used, loops = set(), []
    for start in boundary:
        if start in used: continue
        loop = [start.verts[0]]; edge = start; vert = start.verts[1]; used.add(start)
        while vert is not loop[0]:
            loop.append(vert)
            nxt = next((e for e in vert.link_edges if e.is_boundary and e not in used), None)
            if not nxt: break
            used.add(nxt); vert = nxt.other_vert(vert)
        if len(loop) > 8: loops.append([v.co.copy() for v in loop])
    bm.free()
    tubes = []
    for i, loop in enumerate(loops):
        # Relax the path so the trim runs smoothly along the cut, then sit it on the shell.
        path = loop[::2]
        for _ in range(4):
            path = [(path[k - 1] + path[k] * 2 + path[(k + 1) % len(path)]) / 4 for k in range(len(path))]
        points = [tuple(co) for co in path]
        tubes.append(gear.tube(f'{name}{i}', points, radius, mat, cyclic=True))
    return tubes


def shade_smooth(obj):
    for p in obj.data.polygons: p.use_smooth = True


def ring(hero, name, keep, mat, radius, lift):
    """A band (belt, strap) around the body at the region's points, sorted by angle."""
    idx = hero.region(keep)
    pts = [hero.points[i] for i in idx]
    if len(pts) < 12: return []
    c = sum(pts, Vector()) / len(pts)
    pts.sort(key=lambda p: math.atan2(p.y - c.y, p.x - c.x))
    count = 36; out = []
    for k in range(count):
        a = -math.pi + 2 * math.pi * k / count
        near = min(pts, key=lambda p: abs(math.atan2(p.y - c.y, p.x - c.x) - a))
        r = (Vector((near.x, near.y, 0)) - Vector((c.x, c.y, 0))).length + lift
        out.append((c.x + math.cos(a) * r, c.y + math.sin(a) * r, c.z))
    return [gear.tube(name, out, radius, mat, cyclic=True)]


# ---------------------------------------------------------------- regions

UP = Vector((0, 0, 1))
TORSO = {'torso', 'neck'}
THIGH_TOP = {'thigh_L', 'thigh_R'}
def arm_top(side): return {f'upperarm_{side}'}
ARM_TOP = arm_top('L') | arm_top('R')


def torso(hero, sleeve, hem=.05, neck_drop=.012):
    """Groups and cuts for a torso piece: hem, crew neckline and two sleeves."""
    cuts = [(Vector((0, 0, hero.joint('Hip').z - hem)), -UP, None)]
    neck = hero.joint('NeckTwist01'); tilt = (UP + hero.forward * .45).normalized()
    cuts.append((neck - UP * neck_drop, tilt, None))
    for side in ('L', 'R'):
        shoulder, elbow = hero.joint(f'{side}_Upperarm'), hero.joint(f'{side}_Forearm')
        axis = (elbow - shoulder).normalized()
        cuts.append((shoulder + axis * sleeve, axis, arm_top(side)))
    return TORSO | ARM_TOP | THIGH_TOP, cuts


def band_cuts(low, high, normal=UP):
    return [(low, -normal, None), (high, normal, None)]


def hand(hero, side, cuff):
    wrist, elbow = hero.joint(f'{side}_Hand'), hero.joint(f'{side}_Forearm')
    axis = (wrist - elbow).normalized()
    groups = {f'hand_{side}', f'forearm_{side}'}
    return groups, [(wrist - axis * cuff, -axis, None)]


def foot(side, height):
    groups = {f'foot_{side}', f'calf_{side}'}
    return groups, [(Vector((0, 0, height)), UP, None)]


def head_tilt(hero):
    """Brims run level at the brow and dip toward the nape."""
    return (UP - hero.forward * .55).normalized()


def brow_point(hero):
    pts = [hero.points[i] for i in hero.region(lambda p, o: o == 'head')]
    top = max(p.z for p in pts); chin = min(p.z for p in pts)
    centre = hero.joint('Head')
    return Vector((centre.x, centre.y, chin + (top - chin) * .62))


def front_of(hero, groups, z, tolerance=.008):
    pts = [hero.points[i] for i in hero.region(lambda p, o: o in groups and abs(p.z - z) < tolerance)]
    return max(pts, key=lambda p: p.dot(hero.forward))


# ---------------------------------------------------------------- pieces

def belt(hero, L, mat, lift, width=.022):
    waist = Vector((0, 0, hero.joint('Hip').z + .03))
    # A belt pulls tight around the waist: a band of the torso's hull, not of its folds.
    return shell(hero, 'belt', {'torso'}, band_cuts(waist - UP * width / 2, waist + UP * width / 2), mat,
                 gap=lift, thickness=.005, smooth=2, trim=L['brass'], trim_radius=.0018, hull=True)


def padded_tunic(hero, L):
    groups, cuts = torso(hero, .085)
    return shell(hero, 'tunic', groups, cuts, L['linen'], gap=.011, thickness=.006, smooth=6, trim=L['dark_leather'], trim_radius=.0045) \
        + belt(hero, L, L['leather'], .012)


def scale_mail(hero, L):
    groups, cuts = torso(hero, .065)
    return shell(hero, 'mail', groups, cuts, L['scales'], gap=.012, thickness=.007, smooth=6, trim=L['dark_leather'], trim_radius=.005) \
        + belt(hero, L, L['dark_leather'], .013)


def warden_plate(hero, L):
    """A cuirass is convex: the torso's hull, cut at the hem, neck and shoulders."""
    spine = hero.joint('Spine02')
    neck = hero.joint('NeckTwist01'); tilt = (UP + hero.forward * .45).normalized()
    cuts = [(Vector((0, 0, hero.joint('Hip').z - .03)), -UP, None), (neck - UP * .02, tilt, None)]
    for side in ('L', 'R'):
        shoulder = hero.joint(f'{side}_Upperarm')
        lateral = Vector((shoulder.x - spine.x, shoulder.y - spine.y, 0)).normalized()
        cuts.append((shoulder - lateral * .015, lateral, None))
    out = shell(hero, 'plate', {'torso'}, cuts, L['steel'], gap=.006, thickness=.008, smooth=3, trim=L['gold'], trim_radius=.004, hull=True)
    for side in ('L', 'R'):
        shoulder = hero.joint(f'{side}_Upperarm')
        lateral = Vector((shoulder.x - spine.x, shoulder.y - spine.y, 0)).normalized()
        cuts = [(shoulder - UP * .05, -UP, None), (shoulder - lateral * .04, -lateral, None)]
        out += shell(hero, f'pauldron_{side}', {'torso', f'upperarm_{side}'}, cuts, L['steel'], gap=.03, thickness=.008, smooth=16, trim=L['gold'], trim_radius=.0035)
    chest = front_of(hero, {'torso'}, spine.z + .03, tolerance=.012)
    at = chest + hero.forward * .02
    out.append(gear.cylinder('emblem', .018, .005, L['gold'], loc=tuple(at), rot=(90, 0, 0), verts=24, bevel=.0015))
    out.append(gear.ico('emblem_gem', .0095, L['sapphire'], loc=tuple(at + hero.forward * .004), scale=(1, .55, 1.2), sub=2))
    return out


def gloves(hero, L, mat, trim, cuff, gap, thickness):
    out = []
    for side in ('L', 'R'):
        groups, cuts = hand(hero, side, cuff)
        out += shell(hero, f'glove_{side}', groups, cuts, mat, gap=gap, thickness=thickness, smooth=3, trim=trim, trim_radius=.0035)
    return out


def cloth_wraps(hero, L): return gloves(hero, L, L['wraps'], L['cord'], .05, .005, .004)
def iron_gauntlets(hero, L): return gloves(hero, L, L['black_iron'], L['steel'], .075, .009, .006)
def spellweave_gloves(hero, L): return gloves(hero, L, L['violet_leather'], L['gold'], .07, .006, .004)


def boots(hero, L, mat, trim, height, straps=(), strap_mat=None):
    out = []
    for side in ('L', 'R'):
        groups, cuts = foot(side, height)
        out += shell(hero, f'boot_{side}', groups, cuts, mat, gap=.009, thickness=.006, smooth=4, trim=trim, trim_radius=.0045, floor=True)
        for k, z in enumerate(straps):
            out += shell(hero, f'strap_{side}{k}', groups, band_cuts(Vector((0, 0, z - .006)), Vector((0, 0, z + .006))), strap_mat or trim,
                         gap=.015, thickness=.004, smooth=3)
    return out


def soft_boots(hero, L): return boots(hero, L, L['suede'], L['cord'], .11)
def traveler_boots(hero, L): return boots(hero, L, L['leather'], L['dark_leather'], .19, straps=(.09, .15), strap_mat=L['dark_leather'])
def windstep_boots(hero, L): return boots(hero, L, L['teal_leather'], L['silver'], .15, straps=(.11,), strap_mat=L['silver'])


HEAD = {'head'}


def leather_cap(hero, L):
    brow = brow_point(hero) + UP * .012
    return shell(hero, 'cap', HEAD, [(brow, -head_tilt(hero), None)], L['leather'], gap=.004, thickness=.006, smooth=3, trim=L['dark_leather'], trim_radius=.006, hull=True)


def iron_helm(hero, L):
    brow = brow_point(hero) + UP * .004
    out = shell(hero, 'helm', HEAD, [(brow, -head_tilt(hero), None)], L['iron'], gap=.008, thickness=.008, smooth=3, trim=L['black_iron'], trim_radius=.007, hull=True)
    nasal = [(-.007, .006), (.007, .006), (.005, -.034), (0, -.04), (-.005, -.034)]
    at = front_of(hero, {'head'}, brow.z) + hero.forward * .024
    out.append(gear.prism('nasal', nasal, .004, L['iron'], loc=tuple(at), rot=(90, 0, 0), bevel=.0012))
    return out


def rune_circlet(hero, L):
    brow, tilt = brow_point(hero), head_tilt(hero)
    out = shell(hero, 'circlet', HEAD, band_cuts(brow - UP * .004, brow + UP * .014, tilt), L['silver'], gap=.003, thickness=.004, smooth=2, trim=L['gold'], trim_radius=.0025, hull=True)
    at = front_of(hero, {'head'}, brow.z + .005) + hero.forward * .016
    out.append(gear.ico('circlet_gem', .009, L['sapphire'], loc=tuple(at), scale=(1, .55, 1.25), sub=2))
    return out


BUILDERS = {f.__name__: f for f in (padded_tunic, scale_mail, warden_plate, cloth_wraps, iron_gauntlets, spellweave_gloves,
                                    soft_boots, traveler_boots, windstep_boots, leather_cap, iron_helm, rune_circlet)}


# ---------------------------------------------------------------- build

def build(item_id, install=False, preview=True):
    started = time.monotonic()
    directory = OUT / item_id; directory.mkdir(parents=True, exist_ok=True)
    hero = Hero()
    L = gear.library()
    pieces = BUILDERS[item_id](hero, L)
    # Trims and ornaments take the weights of the shell they sit on.
    weighted = [p for p in pieces if len(p.vertex_groups)]
    loose = [p for p in pieces if not len(p.vertex_groups)]
    if loose and weighted:
        copies = []
        for p in weighted:
            c = p.copy(); c.data = p.data.copy(); bpy.context.scene.collection.objects.link(c); copies.append(c)
        for o in bpy.context.view_layer.objects: o.select_set(False)
        for c in copies: c.select_set(True)
        bpy.context.view_layer.objects.active = copies[0]; bpy.ops.object.join()
        source = bpy.context.active_object
        for p in loose: transfer_weights(p, source, drop_source=False)
        bpy.data.objects.remove(source)
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for p in pieces: p.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    armour = bpy.context.active_object; armour.name = f'{item_id}_worn'; armour.data.name = armour.name
    tris = sum(len(p.vertices) - 2 for p in armour.data.polygons)
    if tris > BUDGET:
        m = armour.modifiers.new('budget', 'DECIMATE'); m.ratio = BUDGET / tris; gear.apply_all(armour)
    # Bake in metre scale so procedural patterns keep their authored size.
    armour.data.transform(Matrix.Scale(PATTERN_SCALE, 4))
    gear.unwrap(armour)
    images, timings = gear.bake(armour, directory, item_id)
    for kind in ('normal', 'orm'): images[kind].scale(gear.ATLAS // 2, gear.ATLAS // 2)
    gear.runtime_material(armour, images, f'{item_id}_worn')
    armour.data.transform(Matrix.Scale(1 / PATTERN_SCALE, 4))
    # Skinned already; move into the body's parent and local space.
    to_body = hero.body.matrix_world.inverted()
    armour.data.transform(to_body)
    armour.parent = hero.arm; armour.matrix_parent_inverse = Matrix.Identity(4)
    armour.matrix_world = hero.body.matrix_world.copy()
    mod = armour.modifiers.new('Armature', 'ARMATURE'); mod.object = hero.arm
    armour['wornGear'] = item_id
    if preview: render_preview(hero, armour, directory / f'{item_id}-preview.png')
    glb = directory / f'{item_id}.glb'
    for o in bpy.context.view_layer.objects: o.select_set(False)
    armour.select_set(True); hero.arm.select_set(True); bpy.context.view_layer.objects.active = armour
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True, export_extras=True,
                              export_image_format='JPEG', export_jpeg_quality=84, export_yup=True, export_skins=True,
                              export_animations=False, export_materials='EXPORT')
    receipt = {'id': item_id, 'bytes': glb.stat().st_size, 'triangles': sum(len(p.vertices) - 2 for p in armour.data.polygons),
               'bakeSeconds': timings, 'seconds': round(time.monotonic() - started, 1)}
    if install:
        PUBLIC.mkdir(parents=True, exist_ok=True)
        (PUBLIC / glb.name).write_bytes(glb.read_bytes()); receipt['installed'] = True
    print('WORN_RECEIPT ' + json.dumps(receipt))


def render_preview(hero, armour, path):
    """Front and back of the body wearing the piece, for review (not shipped)."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 24; scene.cycles.use_denoising = True
    scene.render.resolution_x = 640; scene.render.resolution_y = 640
    scene.render.film_transparent = False
    world = bpy.data.worlds.new('w'); world.use_nodes = True; scene.world = world
    world.node_tree.nodes['Background'].inputs[0].default_value = (.16, .17, .19, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .6
    for loc, power in (((-1.5, -2.5, 2), 300), ((2, 2, 1.5), 180)):
        light = bpy.data.objects.new('l', bpy.data.lights.new('l', 'AREA')); scene.collection.objects.link(light)
        light.location = loc; light.data.energy = power; light.data.size = 2
        light.rotation_euler = (Vector((0, 0, .5)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.type = 'ORTHO'
    points = [armour.matrix_world @ v.co for v in armour.data.vertices]
    lo = Vector([min(p[i] for p in points) for i in range(3)]); hi = Vector([max(p[i] for p in points) for i in range(3)])
    close = ((lo + hi) / 2, max(hi.z - lo.z, hi.x - lo.x) * 1.35 + .05)
    full = (Vector((hero.joint('Hip').x, hero.joint('Hip').y, .5)), 1.1)
    for i, ((centre, scale), direction) in enumerate(((close, Vector((.4, -1, .2))), (close, Vector((-.5, 1, .2))), (full, Vector((.3, -1, .15))))):
        cam.data.ortho_scale = scale
        cam.location = centre + direction.normalized() * 4
        cam.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(path.with_name(path.stem + f'-{i}.png')); bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ids = list(BUILDERS) if '--ids' not in argv else argv[argv.index('--ids') + 1].split(',')
    for item_id in ids: build(item_id, '--install' in argv, '--no-preview' not in argv)
