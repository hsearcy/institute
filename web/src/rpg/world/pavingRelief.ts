import { CanvasTexture, RepeatWrapping } from 'three';

/** Photo-registered mortar runs and distance field, shared by relief and
 * authored paving contour studies. This does not alter the rendered floor. */
export function pavingJointField(heightImage: CanvasImageSource) {
  const size = 1024, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.drawImage(heightImage, 0, 0, size, size);
  const image = context.getImageData(0, 0, size, size);
  const source = new Float32Array(size * size);
  for (let i = 0; i < source.length; i++) source[i] = image.data[i * 4];
  // Periodic box filters keep the repeating texture's edge derivatives joined.
  const blur = (radius: number): Float32Array => {
    const horizontal = new Float32Array(source.length), result = new Float32Array(source.length);
    const count = radius * 2 + 1;
    for (let y = 0; y < size; y++) {
      const row = y * size; let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += source[row + (k + size) % size];
      for (let x = 0; x < size; x++) {
        horizontal[row + x] = sum / count;
        sum += source[row + (x + radius + 1) % size] - source[row + (x - radius + size) % size];
      }
    }
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += horizontal[((k + size) % size) * size + x];
      for (let y = 0; y < size; y++) {
        result[y * size + x] = sum / count;
        sum += horizontal[((y + radius + 1) % size) * size + x] - horizontal[((y - radius + size) % size) * size + x];
      }
    }
    return result;
  };
  const fine = blur(3), broad = blur(18), distance = new Float32Array(source.length);
  let joints: Uint8Array = new Uint8Array(source.length);
  for (let i = 0; i < source.length; i++) joints[i] = fine[i] < broad[i] * .76 ? 1 : 0;
  // Bridge small breaks in a mortar run before building its shoulder. Without
  // closing, photographic speckles become a string of deep circular pits.
  const morphology = (input: Uint8Array, dilate: boolean): Uint8Array => {
    const output = new Uint8Array(input.length);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let value = dilate ? 0 : 1;
      scan: for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy > 10) continue;
        const sample = input[((y + dy + size) % size) * size + (x + dx + size) % size];
        if (dilate ? sample === 1 : sample === 0) { value = dilate ? 1 : 0; break scan; }
      }
      output[y * size + x] = value;
    }
    return output;
  };
  joints = morphology(morphology(joints, true), false);
  // Isolated dark mineral flecks are not mortar. Keep connected runs only;
  // periodic adjacency treats a run crossing a tile seam as one component.
  const visited = new Uint8Array(source.length), queue = new Int32Array(source.length);
  for (let start = 0; start < joints.length; start++) {
    if (!joints[start] || visited[start]) continue;
    let count = 1; queue[0] = start; visited[start] = 1;
    for (let head = 0; head < count; head++) {
      const i = queue[head], x = i % size, y = Math.floor(i / size);
      for (const next of [y * size + (x + 1) % size, y * size + (x + size - 1) % size,
        ((y + 1) % size) * size + x, ((y + size - 1) % size) * size + x]) {
        if (joints[next] && !visited[next]) { visited[next] = 1; queue[count++] = next; }
      }
    }
    if (count < 90) for (let n = 0; n < count; n++) joints[queue[n]] = 0;
  }
  for (let i = 0; i < source.length; i++) distance[i] = joints[i] ? 0 : 20;
  // Short periodic chamfer field: broad bevels, not a normal spike at each
  // bright fleck. Two passes in each direction also propagate across seams.
  for (let pass = 0; pass < 2; pass++) {
    for (const direction of [1, -1]) {
      for (let n = 0; n < distance.length; n++) {
        const i = direction === 1 ? n : distance.length - 1 - n;
        const x = i % size, y = Math.floor(i / size);
        const side = (x - direction + size) % size, row = ((y - direction + size) % size) * size;
        distance[i] = Math.min(distance[i], distance[y * size + side] + 1,
          distance[row + x] + 1, distance[row + side] + Math.SQRT2,
          distance[row + (x + direction + size) % size] + Math.SQRT2);
      }
    }
  }
  return { size, canvas, context, image, source, fine, broad, joints, distance };
}

/** Separate wide stone shoulders from photographic grain and mineral color. */
export function pavingBevelHeight(heightImage: CanvasImageSource): HTMLCanvasElement {
  const { canvas, context, image, source, fine, broad, distance } = pavingJointField(heightImage);
  for (let i = 0; i < source.length; i++) {
    const t = Math.min(1, distance[i] / 10), shoulder = t * t * (3 - 2 * t);
    const grain = (source[i] - fine[i]) / 255 * .018;
    const top = (broad[i] / 255 - .5) * .025;
    const height = Math.max(0, Math.min(255, (.08 + shoulder * (.82 + top) + grain) * 255));
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = height;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Tangent normals with a physical height/texel ratio, independent of viewport. */
export function pavingNormalMap(heightImage: CanvasImageSource, heightMeters = .035, tileMeters = 4.8): CanvasTexture {
  const size = 1024, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.drawImage(heightImage, 0, 0, size, size);
  const source = context.getImageData(0, 0, size, size).data;
  const result = context.createImageData(size, size);
  const slope = heightMeters * size / (2 * tileMeters * 255);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const left = source[(y * size + (x + size - 1) % size) * 4];
    const right = source[(y * size + (x + 1) % size) * 4];
    const up = source[(((y + size - 1) % size) * size + x) * 4];
    const down = source[(((y + 1) % size) * size + x) * 4];
    // Canvas rows run opposite texture V. Wrap both derivatives at tile edges.
    const nx = (left - right) * slope, ny = (down - up) * slope;
    const length = Math.hypot(nx, ny, 1), offset = (y * size + x) * 4;
    result.data[offset] = (nx / length * .5 + .5) * 255;
    result.data[offset + 1] = (ny / length * .5 + .5) * 255;
    result.data[offset + 2] = (1 / length * .5 + .5) * 255;
    result.data[offset + 3] = 255;
  }
  context.putImageData(result, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping; texture.anisotropy = 8;
  return texture;
}
