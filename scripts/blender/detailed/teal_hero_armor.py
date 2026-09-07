"""Small fitted metal construction details for the approved teal Wayfarer.

Every strip is projected onto the actual chest shell before skinning. This
keeps the gold edging in contact with the curved source plate; the separate
leather sash naturally occludes it instead of receiving decorative gold lines.
"""
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def build_teal_armor(collection, rig, mats):
    cloth = next(obj for obj in collection.objects if obj.get('sourcePart') == 'clothing')
    # The sash is a separate connected shell in the source mesh. Raycasting
    # the whole clothing object would emboss the leather as well as the steel.
    neighbours = [set() for vertex in cloth.data.vertices]
    for edge in cloth.data.edges:
        a, b = edge.vertices
        neighbours[a].add(b); neighbours[b].add(a)
    unseen = set(range(len(neighbours)))
    candidates = []
    while unseen:
        first = unseen.pop(); island = {first}; queue = [first]
        while queue:
            for other in neighbours[queue.pop()] & unseen:
                unseen.remove(other); island.add(other); queue.append(other)
        points = [cloth.data.vertices[index].co for index in island]
        low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
        high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
        if 1.08 < low.z < 1.20 and high.z > 1.54 and low.x < -.15 and high.x > .15 and low.y < -.15:
            candidates.append(island)
    if len(candidates) != 1:
        raise ValueError('Expected one broad source steel breastplate shell, found ' + str(len(candidates)))
    plate = candidates[0]
    surface = BVHTree.FromPolygons(
        [vertex.co.copy() for vertex in cloth.data.vertices],
        [tuple(polygon.vertices) for polygon in cloth.data.polygons if polygon.vertices[0] in plate],
    )
    made = []

    def project(x, z, relief):
        point, normal, face, distance = surface.ray_cast(Vector((x, -1, z)), Vector((0, 1, 0)), 2)
        if point is None or point.y > -.02:
            raise ValueError('Chest detail missed the source front shell at ' + repr((x, z)))
        # A few millimeters of raised metal, measured from the actual surface.
        return (x, point.y - relief, z)

    def ribbon(name, controls, width, material, closed=False, subdivisions=4):
        controls = [Vector(point) for point in controls]
        path = []
        segments = len(controls) if closed else len(controls) - 1
        for index in range(segments):
            a, b = controls[index], controls[(index + 1) % len(controls)]
            path.extend(a.lerp(b, step / subdivisions) for step in range(subdivisions))
        if not closed:
            path.append(controls[-1])
        vertices, faces = [], []
        for index, point in enumerate(path):
            previous = path[(index - 1) % len(path)] if closed or index else point
            following = path[(index + 1) % len(path)] if closed or index < len(path) - 1 else point
            tangent = (following - previous).normalized()
            across = Vector((-tangent.y, tangent.x))
            for offset, relief in ((-.5, .0012), (0, .0032), (.5, .0012)):
                position = point + across * (width * offset)
                vertices.append(project(position.x, position.y, relief))
        for index in range(len(path) if closed else len(path) - 1):
            following = (index + 1) % len(path)
            for column in range(2):
                faces.append((index * 3 + column, following * 3 + column,
                              following * 3 + column + 1, index * 3 + column + 1))
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.materials.append(material)
        uv = mesh.uv_layers.new(name='UVMap')
        for polygon in mesh.polygons:
            polygon.use_smooth = True
            # Source front is -Y. Keep all strips facing outward irrespective
            # of clockwise or counterclockwise path construction.
            if polygon.normal.y > 0:
                polygon.flip()
            for loop in polygon.loop_indices:
                coordinate = mesh.vertices[mesh.loops[loop].vertex_index].co
                uv.data[loop].uv = ((coordinate.x + .2) / .4, (coordinate.z - 1.15) / .4)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        obj['sourcePart'] = 'teal_concept_armor_detail'
        obj['construction'] = 'Surface-fitted raised metal binding'
        obj.parent = rig
        group = obj.vertex_groups.new(name='chest')
        group.add(list(range(len(vertices))), 1, 'REPLACE')
        modifier = obj.modifiers.new('Chest plate articulation', 'ARMATURE')
        modifier.object = rig
        made.append(obj)

    # Shaped breastplate rim: broad shoulders taper to a pointed lower edge.
    ribbon('TealHero fitted breastplate gold rim', [
        (-.045, 1.505), (0, 1.515), (.045, 1.505), (.105, 1.445),
        (.130, 1.400), (.167, 1.330), (.153, 1.205), (.090, 1.170), (0, 1.161),
        (-.090, 1.170), (-.153, 1.205), (-.167, 1.330), (-.130, 1.400), (-.105, 1.445),
    ], .009, mats['gold'], closed=True, subdivisions=5)
    # A recessed-looking dark joint beneath a fine gold seam gives the chest
    # a readable pair of fitted plates, rather than one inflated silver shell.
    chevron = [(-.108, 1.353), (-.060, 1.331), (0, 1.299), (.060, 1.331), (.108, 1.353)]
    ribbon('TealHero breastplate inset joint', chevron, .011, mats['dark_teal'], subdivisions=5)
    ribbon('TealHero breastplate chevron binding', [(x, z + .0035) for x, z in chevron],
           .0045, mats['gold'], subdivisions=5)
    triangles = sum(sum(len(polygon.vertices) - 2 for polygon in obj.data.polygons) for obj in made)
    if triangles > 900:
        raise ValueError('Fitted armor detail exceeded its triangle budget: ' + str(triangles))
    print('Teal hero fitted chest construction:', triangles, 'triangles')
    return made
