import unittest

from source_topology import inspect_mesh


VERTICES = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1)]
FACES = [(0, 2, 1), (0, 1, 3), (1, 2, 3), (2, 0, 3)]


class SourceTopologyTests(unittest.TestCase):
    def test_outward_closed_source_passes_without_mutation(self):
        result = inspect_mesh(VERTICES, FACES)
        self.assertFalse(result['rejected'])
        self.assertAlmostEqual(result['components'][0]['signedVolume'], 1 / 6)
        self.assertEqual(FACES[0], (0, 2, 1))

    def test_inward_closed_source_is_rejected(self):
        result = inspect_mesh(VERTICES, [tuple(reversed(f)) for f in FACES])
        self.assertTrue(result['rejected'])
        self.assertLess(result['components'][0]['signedVolume'], 0)

    def test_open_surface_is_reported_without_volume_rejection(self):
        result = inspect_mesh(VERTICES, FACES[:1])
        self.assertFalse(result['rejected'])
        self.assertEqual(result['openComponents'], 1)
        self.assertEqual(result['components'][0]['boundaryEdges'], 3)

    def test_positive_outer_shell_cannot_hide_inward_component(self):
        vertices = VERTICES + [(x * .1 + 3, y * .1, z * .1) for x, y, z in VERTICES]
        faces = FACES + [tuple(v + 4 for v in reversed(f)) for f in FACES]
        result = inspect_mesh(vertices, faces)
        self.assertTrue(result['rejected'])
        self.assertEqual(len(result['components']), 2)
        self.assertGreater(sum(c['signedVolume'] for c in result['components']), 0)

    def test_single_reversed_face_is_rejected_even_with_positive_volume(self):
        result = inspect_mesh(VERTICES, [tuple(reversed(FACES[0])), *FACES[1:]])
        self.assertTrue(result['rejected'])
        self.assertGreater(result['components'][0]['windingConflictEdges'], 0)

    def test_large_world_offset_does_not_change_volume(self):
        translated = [(x + 1e6, y - 1e6, z + 1e6) for x, y, z in VERTICES]
        self.assertAlmostEqual(inspect_mesh(translated, FACES)['components'][0]['signedVolume'], 1 / 6)


if __name__ == '__main__':
    unittest.main()
