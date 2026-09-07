"""Tailored cloth for the approved teal / gold Wayfarer concept.

Called by the hero rebuild while its authored 19-bone rig is in rest pose.
Geometry is authored in the source's normalized Z-up, forward-minus-Y space.
This module never deletes source geometry, loads a scene, or exports assets.
"""
import math

import bpy
from mathutils import Vector


def _clamp(value):
    return max(0.0, min(1.0, value))


def _cape_weights(point):
    # Smooth interpolation along the existing three-joint cloth chain. The
    # shortened hem still follows cape.hem, retaining authored attack followthrough.
    z = point[2]
    if z >= 1.32:
        chest = _clamp((z - 1.43) / .12) * .35
        return {'chest': chest, 'cape': 1 - chest}
    if z >= .92:
        upper = _clamp((z - .92) / .4)
        return {'cape': upper, 'cape.mid': 1 - upper}
    middle = _clamp((z - .49) / .43)
    return {'cape.mid': middle, 'cape.hem': 1 - middle}


def _head_weights(point):
    head = _clamp((point[2] - 1.53) / .12)
    return {'head': head, 'chest': 1 - head}


def _object(collection, rig, name, vertices, faces, uvs, material, weights):
    mesh = bpy.data.meshes.new(name + ' UV mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop_index in polygon.loop_indices:
            uv.data[loop_index].uv = uvs[mesh.loops[loop_index].vertex_index]
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj['sourcePart'] = 'teal_garment'
    obj['conceptRole'] = name
    groups = {}
    for vertex in mesh.vertices:
        for bone, weight in weights(vertex.co).items():
            if weight <= 0:
                continue
            if bone not in rig.data.bones:
                raise ValueError('Missing preserved hero bone: ' + bone)
            if bone not in groups:
                groups[bone] = obj.vertex_groups.new(name=bone)
            groups[bone].add([vertex.index], weight, 'REPLACE')
    modifier = obj.modifiers.new('Preserved authored hero skeleton', 'ARMATURE')
    modifier.object = rig
    obj.parent = rig
    return obj


def _cloth(collection, rig, name, surface, material, weights,
           columns=28, rows=28, thickness=.003, normal_sign=1):
    """Closed two-sided cloth; separate inner/outer UV islands prevent bake overlap."""
    vertices, faces, uvs = [], [], []
    for side in (0, 1):
        for row in range(rows + 1):
            v = row / rows
            for column in range(columns + 1):
                u = column / columns
                p = Vector(surface(u, v))
                p.y += normal_sign * thickness * (.5 - side)
                vertices.append(tuple(p))
                uvs.append((u * .48 + side * .5, v))
    stride = columns + 1
    layer = stride * (rows + 1)
    tangent_u = Vector(surface(.51, .5)) - Vector(surface(.49, .5))
    tangent_v = Vector(surface(.5, .51)) - Vector(surface(.5, .49))
    natural_sign = 1 if tangent_u.cross(tangent_v).y >= 0 else -1
    forward_winding = natural_sign == normal_sign
    for side in (0, 1):
        for row in range(rows):
            for column in range(columns):
                a = side * layer + row * stride + column
                quad = (a, a + 1, a + stride + 1, a + stride)
                faces.append(quad if (side == 0) == forward_winding else tuple(reversed(quad)))
    border = (list(range(stride)) +
              [r * stride + columns for r in range(1, rows + 1)] +
              [rows * stride + c for c in range(columns - 1, -1, -1)] +
              [r * stride for r in range(rows - 1, 0, -1)])
    for i, a in enumerate(border):
        b = border[(i + 1) % len(border)]
        quad = (a, a + layer, b + layer, b)
        faces.append(quad if forward_winding else tuple(reversed(quad)))
    return _object(collection, rig, name, vertices, faces, uvs, material, weights)


def _ribbon(collection, rig, name, surface, uv_path, material, weights,
            segments=32, lift=.0032, normal_sign=1):
    """A narrow finished binding that follows the cloth instead of a floating tube."""
    def ribbon(u, v):
        a, b = uv_path(v)
        p = Vector(surface(a[0] * (1-u) + b[0] * u,
                           a[1] * (1-u) + b[1] * u))
        p.y += normal_sign * lift
        return p
    return _cloth(collection, rig, name, ribbon, material, weights,
                  columns=1, rows=segments, thickness=.0015,
                  normal_sign=normal_sign)


def _cape_surface(u, v):
    transverse = 2 * u - 1
    # Draw fabric together beneath the hood, then let it billow out below the
    # shoulder blades. A gentle asymmetrical S silhouette breaks the old curtain.
    width = .163 + .231 * math.sin(v * math.pi * .5) ** .58
    sweep = .078 * math.sin(v * math.pi * .9) - .125 * v ** 2
    x = transverse * width + sweep
    fold = (.016 + .055 * math.sin(v * math.pi * .5)) * (
        math.cos(5 * math.pi * u + 1.05 * v) +
        .24 * math.sin(9 * math.pi * u - 1.2 * v))
    gather = .038 * math.sin(19 * v + .8 * math.sin(math.pi * u)) * math.exp(-5 * v)
    y = .135 + .158 * v + (.026 + .024 * v) * (1 - transverse * transverse) + fold + gather
    y += .043 * math.sin(v * math.pi * 1.3) * math.sin(u * math.pi)
    # Secondary folds release from the shoulder gathering, becoming quieter as
    # the cloth hangs toward the hem. Low amplitude preserves broad readable mass.
    release = math.sin(math.pi*v) * math.exp(-((v-.32)/.30)**2)
    y += .011 * math.sin(11*math.pi*u-7*v+.4*math.sin(3*v)) * release
    diagonal = u-(.27+.39*v)
    y += .016 * math.exp(-(diagonal/.057)**2) * math.sin(math.pi*v)
    z = 1.611 - 1.020 * v
    z -= .051 * transverse * transverse * (1-v)
    z -= .050 * math.sin(u * math.pi) * math.exp(-((v - .15) / .10) ** 2)
    # Two large rounded lobes, asymmetrically lifted, not torn or pointed teeth.
    z += (.047 * math.cos(3 * math.pi * u + .35) + .040 * transverse) * v ** 5
    # The hem of the underlying hip wrap and retained shoulder bindings previously
    # pierced two deep folds. Round only the inward valleys against conservative
    # body envelopes; the stronger authored crests and flowing silhouette survive.
    def clearance(current, minimum, weight):
        difference = current-minimum
        rounded_max = .5*(current+minimum+math.sqrt(difference*difference+.003**2))
        return current+(rounded_max-current)*weight
    if abs(x) < .292:
        hip_back = .253*math.sqrt(max(0,1-(x/.292)**2))+.016
        hip_weight = math.exp(-((z-.780)/.125)**4)
        y = clearance(y,hip_back,hip_weight)
    if abs(x) < .335:
        shoulder_back = .254*math.sqrt(max(0,1-(x/.335)**2))+.015
        shoulder_weight = math.exp(-((z-1.51)/.100)**4)
        shoulder_weight *= _clamp((abs(x)-.060)/.050)
        y = clearance(y,shoulder_back,shoulder_weight)
    return x, y, z


def _tabard_surface(side):
    def surface(u, v):
        # Belt-hung pair with a central split and gently outward-cut lower corners.
        inner = .012 + .014 * v
        outer = .175 + .014 * math.sin(math.pi * v) - .010 * v
        x = side * (inner * (1 - u) + outer * u)
        settle = _clamp(v / .15)
        settle = settle * settle * (3 - 2 * settle)
        y = -.18 - .060 * settle - .040 * v
        y -= (.010 + .025 * v) * settle * math.sin(2.2 * math.pi * u + .75 * v)
        z = 1.105 - .375 * v + .070 * (2 * u - 1) ** 2 * v ** 3
        return x, y, z
    return surface


def _cowl_surface(u,v):
    """A second scarf layer laid on the cape with two soft falling neck folds."""
    # More drop at the middle creates the scarf's naturally hanging U contour.
    lower = .125+.070*math.sin(math.pi*u)
    cape_v = .006+lower*v
    p = Vector(_cape_surface(u,cape_v))
    # The loft follows the collision-correct cape and stays wholly in front of it
    # from the rear camera. A rolled lower edge conceals the rough attachment seam.
    loft = .009 + .010*math.sin(math.pi*v)
    loft += .010 * math.sin(2*math.pi*v)**2
    p.y += loft
    return p


def _tabard_weights(point):
    return {'pelvis': 1.0}


def _wrap_skirt(collection, rig, teal, gold):
    """Closed-thickness hip wrap with front vent, softly fluted and belt-weighted."""
    columns, rows = 36, 12
    vertices, faces, uv = [], [], []
    def surface(u, v, inner=0):
        angle = .15 + (2 * math.pi - .30) * u
        pleat = (.004 + .017 * v) * math.cos(angle * 8 + .8 * v)
        radius_x = .20 + .073 * v + pleat - inner * .003
        radius_y = .17 + .075 * v + pleat - inner * .003
        return (radius_x * math.sin(angle), -radius_y * math.cos(angle),
                1.13 - .37 * v + .025 * math.cos(2 * angle + .3) * v ** 4)
    stride = columns + 1
    layer = stride * (rows + 1)
    for inner in (0, 1):
        for row in range(rows+1):
            for col in range(columns+1):
                u, v = col / columns, row / rows
                vertices.append(surface(u, v, inner))
                uv.append((u * .48 + inner * .5, v))
    for inner in (0, 1):
        for row in range(rows):
            for col in range(columns):
                a = inner * layer + row * stride + col
                # Increasing theta then descending points inward; reverse the
                # outer skin so its normals face away from the character.
                quad = (a, a+1, a+stride+1, a+stride)
                faces.append(tuple(reversed(quad)) if inner == 0 else quad)
    border = (list(range(stride)) +
              [r * stride + columns for r in range(1, rows + 1)] +
              [rows * stride + c for c in range(columns - 1, -1, -1)] +
              [r * stride for r in range(rows - 1, 0, -1)])
    for i, a in enumerate(border):
        b = border[(i+1) % len(border)]
        faces.append((b, b+layer, a+layer, a))
    wrap = _object(collection, rig, 'Wayfarer tailored teal hip wrap', vertices,
                   faces, uv, teal, _tabard_weights)
    # Gold hem is a narrow strip offset radially, so all faces remain outside.
    vertices, faces, uv = [], [], []
    for row, v in enumerate((.977, .996)):
        for col in range(columns+1):
            u = col / columns
            p = Vector(surface(u, v))
            radial = Vector((p.x, p.y, 0)).normalized()
            p += radial * .0018
            vertices.append(tuple(p)); uv.append((u, row))
    for col in range(columns):
        faces.append((stride+col, stride+col+1, col+1, col))
    hem = _object(collection, rig, 'Wayfarer hip wrap gold binding', vertices,
                  faces, uv, gold, _tabard_weights)
    return [wrap, hem]


def build_teal_garments(collection, rig, materials):
    """Return new cape, bindings and split tabard; caller removes old cape separately.

    Required material keys: teal, gold. Optional teal_inner is reserved for future
    lining variants. Materials should be bake-compatible cloth and muted warm gold.
    Expected ~9,100 triangles including hood piping and cowl, one preserved armature,
    no new bones.
    """
    teal, gold = materials['teal'], materials['gold']
    objects = [_cloth(collection, rig, 'Wayfarer folded teal cape',
                      _cape_surface, teal, _cape_weights)]
    objects.append(_cloth(collection, rig, 'Wayfarer draped shoulder cowl',
                          _cowl_surface,teal,_cape_weights,columns=24,rows=7,
                          thickness=.003))
    objects.extend(_wrap_skirt(collection, rig, teal, gold))
    for edge in (0, 1):
        objects.append(_ribbon(
            collection, rig, 'Wayfarer cape side binding ' + str(edge),
            _cape_surface,
            lambda t, edge=edge: ((.008 if edge == 0 else .977, t),
                                   (.023 if edge == 0 else .992, t)),
            gold, _cape_weights))
    objects.append(_ribbon(
        collection, rig, 'Wayfarer flowing gold cape hem', _cape_surface,
        lambda t: ((t, .980), (t, .995)), gold, _cape_weights, segments=40))
    # Sparse angular embroidered leaves, visible as designed ornament at portrait
    # distance rather than random high-frequency noise across the fabric.
    verts, faces, uv = [], [], []
    for center in (.10, .25, .43, .62, .78, .91):
        start = len(verts)
        for u, v in ((center, .935), (center + .012, .955),
                     (center, .976), (center - .012, .955)):
            p = Vector(_cape_surface(u, v)); p.y += .0044
            verts.append(tuple(p)); uv.append((u, v))
        faces.append(tuple(start + i for i in range(4)))
    ornament = _object(collection, rig, 'Wayfarer hem embroidery', verts,
                       faces, uv, gold, _cape_weights)
    # glTF preserves the material's double-sided flag; these tiny inlaid patches
    # are intentionally coplanar ornaments with a small lift, not thick jewels.
    objects.append(ornament)
    for side in (-1, 1):
        surface = _tabard_surface(side)
        # Reflection reverses winding, so normalize surface parameter orientation.
        if side == -1:
            raw = surface
            surface = lambda u, v, raw=raw: raw(1-u, v)
        label = 'left' if side == 1 else 'right'
        objects.append(_cloth(collection, rig, 'Wayfarer split tabard ' + label,
                              surface, teal, _tabard_weights, columns=9, rows=12,
                              thickness=.003, normal_sign=-1))
        for edge in (0, 1):
            objects.append(_ribbon(
                collection, rig, 'Wayfarer tabard binding ' + label + str(edge),
                surface,
                lambda t, edge=edge: ((.012 if edge == 0 else .956, t),
                                       (.044 if edge == 0 else .988, t)),
                gold, _tabard_weights, segments=12, normal_sign=-1))
        objects.append(_ribbon(
            collection, rig, 'Wayfarer tabard hem ' + label, surface,
            lambda t: ((t, .971), (t, .993)), gold, _tabard_weights,
            segments=12, normal_sign=-1))
    # Fitted to the retained authored hood: x[-.135,.131], front y~-.13,
    # crown z1.85. The opening stops above the existing teal scarf at z1.55.
    controls = [(-.105, -.130, 1.662), (-.083, -.135, 1.718),
                (-.052, -.130, 1.767), (-.019, -.113, 1.802),
                (0, -.106, 1.812), (.019, -.113, 1.802),
                (.052, -.130, 1.767), (.083, -.135, 1.718),
                (.105, -.130, 1.662)]
    points = []
    for i in range(len(controls)-1):
        p0 = Vector(controls[max(0, i-1)])
        p1 = Vector(controls[i]); p2 = Vector(controls[i+1])
        p3 = Vector(controls[min(len(controls)-1, i+2)])
        for step in range(4):
            t = step / 4
            points.append(.5 * ((2*p1) + (-p0+p2)*t +
                               (2*p0-5*p1+4*p2-p3)*t*t +
                               (-p0+3*p1-3*p2+p3)*t*t*t))
    points.append(Vector(controls[-1]))
    objects.append(build_hood_binding(collection, rig, gold, points, radius=.003))
    return objects


def build_hood_binding(collection, rig, material, points, radius=.0045):
    """Gold piping along a caller-measured existing hood opening, in source space.

    Pass an ordered open or closed polyline sitting 1–2mm outside the hood rim.
    The rim follows head/chest blends without guessing where the face opening is.
    """
    points = [Vector(p) for p in points]
    if len(points) < 3:
        raise ValueError('Hood binding needs at least three measured points')
    vertices, faces, uv = [], [], []
    sides = 6
    for i, point in enumerate(points):
        tangent = (points[min(i + 1, len(points)-1)] - points[max(0, i-1)]).normalized()
        normal = tangent.cross(Vector((0, -1, 0)))
        if normal.length < .001:
            normal = tangent.cross(Vector((1, 0, 0)))
        normal.normalize(); binormal = tangent.cross(normal).normalized()
        for j in range(sides):
            angle = 2 * math.pi * j / sides
            p = point + radius * (math.cos(angle)*normal + math.sin(angle)*binormal)
            vertices.append(tuple(p)); uv.append((j / sides, i / (len(points)-1)))
    for i in range(len(points)-1):
        for j in range(sides):
            faces.append((i*sides+j, i*sides+(j+1)%sides,
                          (i+1)*sides+(j+1)%sides, (i+1)*sides+j))
    faces.extend((tuple(reversed(range(sides))),
                  tuple((len(points)-1)*sides + j for j in range(sides))))
    return _object(collection, rig, 'Wayfarer tailored gold hood rim',
                   vertices, faces, uv, material, _head_weights)


def _rounded_accessory(collection, rig, name, center, dimensions, material,
                       corner=.009, bevel=.003):
    """Four-ring rounded leather form with real beveled seams, no modifiers."""
    width, depth, height = dimensions
    vertices, faces, uvs = [], [], []
    rings = ((depth/2, bevel), (depth/2-bevel, 0),
             (-depth/2+bevel, 0), (-depth/2, bevel))
    for ring, (y, inset) in enumerate(rings):
        half_x, half_z = width/2-inset, height/2-inset
        radius = min(corner, half_x*.7, half_z*.7)
        for sector in range(4):
            sign_x = 1 if sector in (0, 3) else -1
            sign_z = 1 if sector in (0, 1) else -1
            for segment in range(4):
                angle = sector * math.pi/2 + segment/3 * math.pi/2
                x = sign_x * (half_x-radius) + radius * math.cos(angle)
                z = sign_z * (half_z-radius) + radius * math.sin(angle)
                vertices.append((center[0]+x, center[1]+y, center[2]+z))
                uvs.append((x/width+.5, z/height+.5))
    stride = 16
    for ring in range(3):
        for i in range(stride):
            a, b = ring*stride+i, ring*stride+(i+1)%stride
            faces.append((a, b, b+stride, a+stride))
    faces.append(tuple(reversed(range(stride))))
    faces.append(tuple(3*stride+i for i in range(stride)))
    obj = _object(collection, rig, name, vertices, faces, uvs, material,
                  _tabard_weights)
    # Per-face dominant-axis projection keeps the narrow seam UVs nondegenerate,
    # including straight edges which share an XZ point between depth rings.
    uv = obj.data.uv_layers.active
    for polygon in obj.data.polygons:
        dominant = max(range(3), key=lambda axis: abs(polygon.normal[axis]))
        axes = [axis for axis in range(3) if axis != dominant]
        for loop_index in polygon.loop_indices:
            p = obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = tuple((p[axis]-center[axis])/dimensions[axis]+.5
                                           for axis in axes)
    obj['sourcePart'] = 'teal_accessory'
    return obj


def _pouch_stud(collection, rig, center, material, radius=.0035):
    vertices, faces, uv = [], [], []
    segments, rows = 10, 5
    # Lathed shallow domed rivet, facing forward. Narrow pole rings avoid zero-area
    # triangles while producing a rounded glint instead of a floating emissive dot.
    for row in range(rows+1):
        latitude = .025 + (math.pi-.05) * row/rows
        for segment in range(segments):
            angle = 2*math.pi*segment/segments
            vertices.append((center[0]+radius*math.sin(latitude)*math.cos(angle),
                             center[1]+radius*.5*math.cos(latitude),
                             center[2]+radius*math.sin(latitude)*math.sin(angle)))
            uv.append((segment/segments, row/rows))
    for row in range(rows):
        for segment in range(segments):
            a = row*segments+segment
            b = row*segments+(segment+1)%segments
            faces.append((a, b, b+segments, a+segments))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple(rows*segments+i for i in range(segments)))
    obj = _object(collection, rig, 'Wayfarer pouch gold rivet', vertices,
                  faces, uv, material, _tabard_weights)
    layer = obj.data.uv_layers.active
    for polygon in obj.data.polygons:
        if len(polygon.vertices) <= 4:
            continue
        for loop_index in polygon.loop_indices:
            p = obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
            layer.data[loop_index].uv = ((p.x-center[0])/(2*radius)+.5,
                                       (p.z-center[2])/(2*radius)+.5)
    obj['sourcePart'] = 'teal_accessory'
    return obj


def build_hero_accessories(collection, rig, materials):
    """Optional pair of tailored hip pouches (<1,500 tris), with existing pelvis rig.

    Required material keys: leather, gold. The measured waist fitting leaves the
    central buckle visible and places the bags outside the tabard's upper corners.
    """
    leather, gold = materials['leather'], materials['gold']
    objects = []
    for side in (-1, 1):
        x = side * .205
        label = 'left' if side == 1 else 'right'
        vertices, faces, uv = [], [], []
        # The gathered neck tucks inward beneath the belt; belly and asymmetrical
        # low corner make a filled soft bag rather than a box glued to the waist.
        sections = ((.980, .024, .012, -.184),
                    (.990, .041, .024, -.187),
                    (1.023, .047, .028, -.188),
                    (1.061, .044, .023, -.178),
                    (1.084, .035, .017, -.162))
        segments = 16
        for row, (z, rx, ry, cy) in enumerate(sections):
            for segment in range(segments):
                angle = 2*math.pi*segment/segments
                # A gentle four-lobed cross section makes stitched side gussets.
                fold = 1 + .055*math.cos(4*angle+.5)
                vertices.append((x+rx*math.sin(angle)*fold,
                                 cy-ry*math.cos(angle)*fold,
                                 z+.004*math.sin(angle)*math.sin(row*math.pi/4)))
                uv.append((segment/segments, row/4))
        for row in range(len(sections)-1):
            for segment in range(segments):
                a = row*segments+segment
                b = row*segments+(segment+1)%segments
                faces.append((a, b, b+segments, a+segments))
        faces.extend((tuple(reversed(range(segments))),
                      tuple(4*segments+i for i in range(segments))))
        bag = _object(collection, rig, 'Wayfarer slumped leather pouch '+label,
                      vertices, faces, uv, leather, _tabard_weights)
        # Non-degenerate end-cap UVs for baking.
        for polygon in bag.data.polygons:
            if len(polygon.vertices) > 4:
                for li in polygon.loop_indices:
                    p = bag.data.vertices[bag.data.loops[li].vertex_index].co
                    bag.data.uv_layers.active.data[li].uv = ((p.x-x)/.10+.5, (p.y+.18)/.07+.5)
        objects.append(bag)
        # Rounded shield flap, dipping into a curved point below a folded top.
        outline = [(-.038,1.080), (-.043,1.071), (-.040,1.047),
                   (-.028,1.031), (-.014,1.021), (0,1.018),
                   (.014,1.021), (.028,1.031), (.040,1.047),
                   (.043,1.071), (.038,1.080)]
        # One corner-cutting pass makes the leather contour round, not angular.
        rounded = []
        for i, a in enumerate(outline):
            b = outline[(i+1)%len(outline)]
            rounded.extend(((.75*a[0]+.25*b[0], .75*a[1]+.25*b[1]),
                            (.25*a[0]+.75*b[0], .25*a[1]+.75*b[1])))
        def flap_point(px, z, back=0):
            drop = _clamp((1.083-z)/.065)
            y = -.185-.035*drop-.004*(1-(px/.047)**2)
            return (x+px, y+back*.003, z)
        vertices, faces, uv = [], [], []
        count = len(rounded)
        for back in (0,1):
            for px,z in rounded:
                vertices.append(flap_point(px,z,back));uv.append((px/.1+.5,(z-1.01)/.08))
            vertices.append(flap_point(0,1.05,back));uv.append((.5,.5))
        for i in range(count):
            j = (i+1)%count
            # Rounded outline is counterclockwise in XZ, hence faces minus Y.
            faces.append((count,i,j))
            faces.append((2*count+1,count+1+j,count+1+i))
            faces.append((i,count+1+i,count+1+j,j))
        objects.append(_object(collection, rig, 'Wayfarer shield pouch flap '+label,
                               vertices, faces, uv, leather, _tabard_weights))
        objects.append(_rounded_accessory(
            collection, rig, 'Wayfarer pouch belt loop ' + label,
            (x, -.143, 1.102), (.022, .010, .043), leather, corner=.005,
            bevel=.002))
        # Fine broken stitches follow the inset curved flap border.
        vertices, faces, uv = [], [], []
        for i, a in enumerate(rounded):
            b = rounded[(i+1)%count]
            if a[1] > 1.077 and b[1] > 1.077:
                continue
            pa = Vector((a[0]*.88, 1.05+(a[1]-1.05)*.88))
            pb = Vector((b[0]*.88, 1.05+(b[1]-1.05)*.88))
            start = pa.lerp(pb,.18);end = pa.lerp(pb,.72)
            tangent = (end-start).normalized()
            across = Vector((-tangent.y,tangent.x))*.00045
            first = len(vertices)
            for p in (start-across,end-across,end+across,start+across):
                point = Vector(flap_point(p.x,p.y));point.y -= .0010
                vertices.append(tuple(point));uv.append((p.x/.1+.5,(p.y-1.01)/.08))
            faces.append((first,first+1,first+2,first+3))
        objects.append(_object(collection, rig, 'Wayfarer sewn pouch border '+label,
                               vertices, faces, uv, materials.get('stitch',gold),
                               _tabard_weights))
        # Compact hollow buckle is visibly different from a gold dot. Four-sided
        # tubing keeps this detail readable without spending hundreds of triangles.
        vertices, faces, uv = [], [], []
        buckle = [(-.0055,1.055),(-.0070,1.053),(-.0070,1.043),
                  (-.0055,1.041),(.0055,1.041),(.0070,1.043),
                  (.0070,1.053),(.0055,1.055)]
        for i,(px,z) in enumerate(buckle):
            previous = Vector(buckle[(i-1)%len(buckle)])
            following = Vector(buckle[(i+1)%len(buckle)])
            tangent = (following-previous).normalized()
            normal = Vector((-tangent.y,tangent.x))
            for j in range(4):
                angle = j*math.pi/2
                vertices.append((x+px+normal.x*.00125*math.cos(angle),
                                 flap_point(px,z)[1]-.003-.00125*math.sin(angle),
                                 z+normal.y*.00125*math.cos(angle)))
                uv.append((i/len(buckle),j/4))
        for i in range(len(buckle)):
            for j in range(4):
                faces.append((i*4+j,i*4+(j+1)%4,
                              ((i+1)%len(buckle))*4+(j+1)%4,
                              ((i+1)%len(buckle))*4+j))
        objects.append(_object(collection, rig, 'Wayfarer pouch buckle '+label,
                               vertices, faces, uv, gold, _tabard_weights))
        def strap_surface(u,v):
            p = Vector(flap_point((u-.5)*.008,1.063-.027*v))
            p.y -= .0017
            return p
        objects.append(_cloth(collection, rig, 'Wayfarer pouch clasp strap '+label,
                              strap_surface,leather,_tabard_weights,columns=1,
                              rows=4,thickness=.001,normal_sign=-1))
    for obj in objects:
        obj['sourcePart'] = 'teal_accessory'
    return objects
