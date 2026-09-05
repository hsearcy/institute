"""Extend nearest surface texels into unused UV space before mip generation.

The baked ORM atlas marks unused texels as exact RGB zero. Real surface texels
have nonzero roughness, even where AO/albedo are dark. Using the same nearest
source coordinate for all three maps preserves their alignment and never changes
a valid source texel. Padding precedes texture resizing and compression.
"""
import numpy as np
from scipy.ndimage import distance_transform_edt

def pad_atlases(images):
    arrays={role:np.asarray(image.convert('RGB')).copy() for role,image in images.items()}
    orm=arrays['orm'];unused=np.all(orm==0,axis=2)
    if not unused.any():return arrays
    if unused.all():raise ValueError('Cannot pad an atlas without any valid surface texels')
    nearest=distance_transform_edt(unused,return_distances=False,return_indices=True)
    for role,pixels in arrays.items():
        if pixels.shape!=orm.shape:raise ValueError('Source atlas dimensions differ')
        pixels[unused]=pixels[nearest[0][unused],nearest[1][unused]]
    return arrays
