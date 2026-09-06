"""Read-only source topology checks, independent of Blender's live scene."""
from collections import defaultdict


def inspect_mesh(vertices, faces, triangles=None):
    """Report each connected surface separately so opposite shells cannot cancel.

    Blender callers supply its actual tessellation as (polygon_index, vertex_ids).
    The fan fallback is for convex polygons and small standalone fixtures.
    """
    edges = defaultdict(list)
    for index, face in enumerate(faces):
        for a, b in zip(face, (*face[1:], face[0])):
            edges[min(a, b), max(a, b)].append((index, 1 if a < b else -1))
    adjacent = [set() for _ in faces]
    for uses in edges.values():
        ids = {index for index, _ in uses}
        for index in ids:
            adjacent[index].update(ids - {index})
    pending = set(range(len(faces)))
    components = []
    while pending:
        first = min(pending)
        pending.remove(first)
        found, stack = {first}, [first]
        while stack:
            for other in adjacent[stack.pop()]:
                if other in pending:
                    pending.remove(other)
                    found.add(other)
                    stack.append(other)
        components.append(found)
    if triangles is None:
        triangles = [(index, (face[0], face[i], face[i + 1]))
                     for index, face in enumerate(faces)
                     for i in range(1, len(face) - 1)]
    by_face = defaultdict(list)
    for index, triangle in triangles:
        by_face[index].append(triangle)
    reports = []
    for found in components:
        uses = [value for value in edges.values() if value[0][0] in found]
        boundary = sum(len(value) == 1 for value in uses)
        nonmanifold = sum(len(value) > 2 for value in uses)
        conflicts = sum(len(value) == 2 and value[0][1] == value[1][1]
                        for value in uses)
        closed = not boundary and not nonmanifold
        origin = vertices[faces[min(found)][0]]
        volume = 0.0
        for index in found:
            for triangle in by_face[index]:
                a, b, c = [tuple(vertices[v][k] - origin[k] for k in range(3))
                           for v in triangle]
                volume += (a[0] * (b[1] * c[2] - b[2] * c[1])
                           + a[1] * (b[2] * c[0] - b[0] * c[2])
                           + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
        reasons = []
        if closed and volume <= 0:
            reasons.append('closed surface has nonpositive signed volume')
        if closed and conflicts:
            reasons.append('closed surface has inconsistent face winding')
        reports.append(dict(faces=len(found), closed=closed,
                            boundaryEdges=boundary, nonManifoldEdges=nonmanifold,
                            windingConflictEdges=conflicts, signedVolume=volume,
                            rejected=bool(reasons), reasons=reasons))
    return dict(components=reports,
                openComponents=sum(not part['closed'] for part in reports),
                rejected=any(part['rejected'] for part in reports))
