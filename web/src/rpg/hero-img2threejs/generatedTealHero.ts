import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

// bevelEnabled defaults to true on THREE.ExtrudeGeometry and rounds every
// corner — sharp/pointed profiles (blades, fork tines, spikes) need
// bevelEnabled: false plus lineTo()-only path segments near the tip, since a
// curve command cannot produce a true converging point.
function buildExtrudeShape(points: [number, number][], holes?: [number, number][][]): THREE.Shape {
  const shape = new THREE.Shape();
  if (points.length > 0) {
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
      shape.lineTo(points[i][0], points[i][1]);
    }
  }
  // Cutouts (e.g. an oval wire-cutter hole) as THREE.Path added to shape.holes —
  // dep-free boolean subtraction via the tessellator, no CSG library needed.
  for (const loop of holes ?? []) {
    if (loop.length < 3) continue;
    const path = new THREE.Path();
    path.moveTo(loop[0][0], loop[0][1]);
    for (let i = 1; i < loop.length; i += 1) path.lineTo(loop[i][0], loop[i][1]);
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

// Build an N-gon oval loop (for hole authoring from a compact {cx,cy,rx,ry} descriptor).
function ovalLoop(cx: number, cy: number, rx: number, ry: number, seg = 24): [number, number][] {
  const loop: [number, number][] = [];
  for (let i = 0; i < seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    loop.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return loop;
}

function buildExtrudeGeometry(profile: { points: [number, number][]; depth: number; holes?: [number, number][][]; ovalHoles?: { cx: number; cy: number; rx: number; ry: number }[] }): THREE.ExtrudeGeometry {
  const holes = [...(profile.holes ?? []), ...((profile.ovalHoles ?? []).map((o) => ovalLoop(o.cx, o.cy, o.rx, o.ry)))];
  const shape = buildExtrudeShape(profile.points, holes);
  return new THREE.ExtrudeGeometry(shape, {
    depth: profile.depth,
    bevelEnabled: false,
    steps: 1,
  });
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [clampAlbedoChannel((value >> 16) & 255), clampAlbedoChannel((value >> 8) & 255), clampAlbedoChannel(value & 255)];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampAlbedoChannel(value: number): number {
  return Math.max(30, Math.min(240, Math.round(value)));
}

function clampPbrF0(value: number): number {
  return Math.max(0.02, Math.min(1, value));
}

function clampPbrIor(value: number): number {
  return Math.max(1, Math.min(2.5, value));
}

function clampPbrMetalness(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function clampedAlbedoColor(spec: SculptMaterialSpec): THREE.Color {
  const source = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  // setStyle with an explicit SRGBColorSpace, NOT the numeric constructor.
  //
  // `new THREE.Color(r, g, b)` treats its arguments as LINEAR working-space components,
  // while an authored `baseColor` hex is sRGB. Feeding one to the other skipped the
  // transfer function and lifted every dark albedo: #2e2a28, authored as a near-black
  // vinyl, rendered at roughly sRGB 0.46 — a mid grey. The error is largest exactly where
  // it matters most, because the transfer curve is steepest near black.
  return new THREE.Color().setStyle(source, THREE.SRGBColorSpace);
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: 'linear' | 'radial';
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [clampAlbedoChannel(Number(match[1])), clampAlbedoChannel(Number(match[2])), clampAlbedoChannel(Number(match[3]))];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(gradient: ColorGradientSpec, u: number, v: number): [number, number, number] {
  const stops = gradient.stops.length >= 2 ? gradient.stops : [{ offset: 0, color: 'rgba(138,122,95,1)' }, { offset: 1, color: 'rgba(138,122,95,1)' }];
  let t: number;
  if (gradient.type === 'radial') {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)));
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions, denseComponent = false): THREE.MeshPhysicalMaterial {
  // A material that declares -- with evidence -- that its subject carries no texture
  // detail gets NO texture set. Synthesising one anyway is not a harmless default: the
  // branch below then forces color to white and roughness to 1 and reads both from the
  // generated maps, so the authored albedo and the reference-derived roughness are both
  // discarded, and the model gains mottling the reference does not have. Measured on the
  // tuxedo cat, whose black fur rendered as speckled grey-and-white from a palette that
  // only ever described two flat regions.
  const textureless = (spec.textureless as { declared?: boolean } | undefined)?.declared === true;
  const textures = textureless
    ? null
    : makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : clampedAlbedoColor(spec),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clampPbrMetalness(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    ior: clampPbrIor(readLayerNumber(spec.ior, ['base', 'value'], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ['base', 'amount'], 0)),
    attenuationDistance: Math.max(0.001, readLayerNumber(spec.attenuationDistance, ['base', 'value'], Infinity)),
    attenuationColor: new THREE.Color(typeof spec.attenuationColor === 'string' ? spec.attenuationColor : '#ffffff'),
    sheen: clamp01(readLayerNumber(spec.sheen, ['base', 'amount'], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === 'string' ? spec.sheenColor : '#ffffff'),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ['base'], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ['base', 'amount'], 0)),
    iridescenceIOR: clampPbrIor(readLayerNumber(spec.iridescenceIOR, ['base', 'value'], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ['base', 'amount'], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ['rotation'], 0),
    specularIntensity: clampPbrF0(readLayerNumber(spec.specularF0 ?? spec.f0 ?? spec.specularIntensity, ['base', 'value'], 1.0)),
    specularColor: new THREE.Color(typeof spec.specularColor === 'string' ? spec.specularColor : '#ffffff'),
    emissive: new THREE.Color(typeof spec.emissive === 'string' ? spec.emissive : '#000000'),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ['base'], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: spec.flatShading === true,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const denseMesh = denseComponent || spec.denseMesh === true || spec.geometryDensity === 'dense' || spec.topologyClass === 'dense';
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    const effectiveBumpScale = denseMesh ? Math.max(0.05, bumpScale) : bumpScale;
    if (effectiveBumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = effectiveBumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    const effectiveDisplacementScale = denseMesh ? Math.max(0.005, displacementScale) : displacementScale;
    if (effectiveDisplacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = effectiveDisplacementScale;
      material.displacementBias = -effectiveDisplacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrConstraints = { albedoRange: [30, 240], binaryMetalness: true, f0Range: [0.02, 1], iorRange: [1, 2.5] };
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.userData.referenceMaterialId = spec.referenceMaterialId ?? spec.materialReference?.profileId ?? null;
  material.userData.materialEvidence = spec.materialEvidence ?? null;
  material.userData.validationViews = spec.materialReference?.validationViews ?? [];
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: Teal Hooded Swordsman
// Sculpt build pass: blockout
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createTealHoodedSwordsmanModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "Teal Hooded Swordsman";
  root.userData.reconstructionEvidence = {"itemFamily": null, "subtype": null, "componentAdapter": null, "route": null, "exactnessTier": null, "referenceCamera": {"solved": false, "fovDegrees": 40.0, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [0.0, 0.0, 3.0], "note": "For likeness work, solve the reference camera (forge/stage1_intake/solve_camera_pose.py) so the review render aligns with the photo and the reference can be projected. Confirm by overlay review.", "type": "perspective", "fov": 32, "azimuthDegrees": -8, "elevationDegrees": 3, "target": [-0.327, 1.114, 0], "distance": 4.1}, "approximationNotes": []};
  root.userData.materialPipeline = {};
  root.userData.materialReferenceRegistry = null;

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["cloth"] = createSculptMaterial(
    "cloth",
    {"id": "cloth", "name": "cloth", "type": "physical", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#008c98", "color": "#008c98", "albedo": {"dominant": "#008c98", "secondary": ["#008c98"], "samplingNotes": "Use image-observed local color zones, not a single averaged color."}, "colorVariation": {"palette": ["#008c98"], "pattern": "fine cloth weave", "amplitude": 0.025, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.042, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.022000000000000002, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.008, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.76, "variation": 0.06, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 0, "variation": 0.0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.055, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "cloth-edge-response", "region": "surface edges", "roughness": 0.66, "evidenceRefs": ["front"], "notes": "Slight handling polish; preserve saturated clean color."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Palette from approved concept; material evidence authored separately.", "side": "double", "referencePbr": {"version": "1.0", "sourceImage": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean-crop/cloth-clean.png", "extractor": "stage1_intake/extract_pbr_evidence.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.776, "estimatedFidelity": 0.776, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_albedo.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_roughness.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_height.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_normal.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_ao.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 95, "sourceHeight": 139, "mapSize": 256, "cropBBoxPixels": {"x": 0, "y": 0, "width": 95, "height": 139}, "mask": {"backgroundColor": "#016F7C", "backgroundNoise": 81.597, "transparentPixelFraction": 0.0, "foregroundCoverage": 1.0}, "mapStats": {"valueRange": 0.2685, "heightP90Gradient": 0.08612, "roughnessBase": 0.765, "roughnessVariation": 0.142, "normalStrength": 0.257, "blurRadius": 5}, "palette": ["#027C88", "#016975", "#015560", "#01444E", "#0796A1"]}, "warnings": ["image is not clearly isolated from background; using most pixels as material evidence", "object/background separation is weak", "single-image inverse rendering cannot prove true physical PBR; confidence is capped"], "interpretation": "Raw extractor estimate only; physical-map acceptance pending. See material-evidence/README.md. Face/hair registered color only, never tile or use their image-derived normals; gold conductor prior pending render.", "finalMaterialAccepted": false}},
    options
  );
  materialMap["cloth-dark"] = createSculptMaterial(
    "cloth-dark",
    {"id": "cloth-dark", "name": "cloth-dark", "type": "physical", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#07434a", "color": "#07434a", "albedo": {"dominant": "#07434a", "secondary": ["#07434a"], "samplingNotes": "Use image-observed local color zones, not a single averaged color."}, "colorVariation": {"palette": ["#07434a"], "pattern": "fine cloth weave", "amplitude": 0.025, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.042, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.022000000000000002, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.008, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.88, "variation": 0.06, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 0, "variation": 0.0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.055, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "cloth-dark-edge-response", "region": "surface edges", "roughness": 0.78, "evidenceRefs": ["front"], "notes": "Slight handling polish; preserve saturated clean color."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Palette from approved concept; material evidence authored separately.", "side": "double", "referencePbr": {"version": "1.0", "sourceImage": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean-crop/cloth-clean.png", "extractor": "stage1_intake/extract_pbr_evidence.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.776, "estimatedFidelity": 0.776, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_albedo.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_roughness.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_height.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_normal.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_ao.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/cloth-clean/cloth-clean_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 95, "sourceHeight": 139, "mapSize": 256, "cropBBoxPixels": {"x": 0, "y": 0, "width": 95, "height": 139}, "mask": {"backgroundColor": "#016F7C", "backgroundNoise": 81.597, "transparentPixelFraction": 0.0, "foregroundCoverage": 1.0}, "mapStats": {"valueRange": 0.2685, "heightP90Gradient": 0.08612, "roughnessBase": 0.765, "roughnessVariation": 0.142, "normalStrength": 0.257, "blurRadius": 5}, "palette": ["#027C88", "#016975", "#015560", "#01444E", "#0796A1"]}, "warnings": ["image is not clearly isolated from background; using most pixels as material evidence", "object/background separation is weak", "single-image inverse rendering cannot prove true physical PBR; confidence is capped"], "interpretation": "Raw extractor estimate only; physical-map acceptance pending. See material-evidence/README.md. Face/hair registered color only, never tile or use their image-derived normals; gold conductor prior pending render.", "finalMaterialAccepted": false}},
    options
  );
  materialMap["steel"] = createSculptMaterial(
    "steel",
    {"id": "steel", "name": "steel", "type": "physical", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#9ca4a6", "color": "#9ca4a6", "albedo": {"dominant": "#9ca4a6", "secondary": ["#9ca4a6"], "samplingNotes": "Use image-observed local color zones, not a single averaged color."}, "colorVariation": {"palette": ["#9ca4a6"], "pattern": "subtle surface variation", "amplitude": 0.025, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.042, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.022000000000000002, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.008, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.34, "variation": 0.06, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 1, "variation": 0.0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.055, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "steel-edge-response", "region": "surface edges", "roughness": 0.24000000000000002, "evidenceRefs": ["front"], "notes": "Slight handling polish; preserve saturated clean color."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Palette from approved concept; material evidence authored separately.", "side": "double", "referencePbr": {"version": "1.0", "sourceImage": "/home/houston/git/institute/docs/hero-img2threejs/reference/steel.png", "extractor": "stage1_intake/extract_pbr_evidence.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.81, "estimatedFidelity": 0.81, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/steel/steel_albedo.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/steel/steel_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/steel/steel_roughness.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/steel/steel_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/steel/steel_height.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/steel/steel_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/steel/steel_normal.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/steel/steel_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/steel/steel_ao.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/steel/steel_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 66, "sourceHeight": 53, "mapSize": 256, "cropBBoxPixels": {"x": 0, "y": 0, "width": 66, "height": 53}, "mask": {"backgroundColor": "#76655B", "backgroundNoise": 48.363, "transparentPixelFraction": 0.0, "foregroundCoverage": 0.9114}, "mapStats": {"valueRange": 0.405, "heightP90Gradient": 0.12885, "roughnessBase": 0.755, "roughnessVariation": 0.163, "normalStrength": 0.307, "blurRadius": 5}, "palette": ["#85776B", "#70645A", "#5D5248", "#9E8F82", "#C5B8AA"]}, "warnings": ["image is not clearly isolated from background; using most pixels as material evidence", "object/background separation is weak", "single-image inverse rendering cannot prove true physical PBR; confidence is capped"], "interpretation": "Raw extractor estimate only; physical-map acceptance pending. See material-evidence/README.md. Face/hair registered color only, never tile or use their image-derived normals; gold conductor prior pending render.", "finalMaterialAccepted": false}},
    options
  );
  materialMap["gold"] = createSculptMaterial(
    "gold",
    {"id": "gold", "name": "gold", "type": "physical", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#c9953b", "color": "#c9953b", "albedo": {"dominant": "#c9953b", "secondary": ["#c9953b"], "samplingNotes": "Use image-observed local color zones, not a single averaged color."}, "colorVariation": {"palette": ["#c9953b"], "pattern": "subtle surface variation", "amplitude": 0.025, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.042, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.022000000000000002, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.008, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.31, "variation": 0.06, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 1, "variation": 0.0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.055, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "gold-edge-response", "region": "surface edges", "roughness": 0.21, "evidenceRefs": ["front"], "notes": "Slight handling polish; preserve saturated clean color."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Palette from approved concept; material evidence authored separately.", "side": "double", "referencePbr": {"version": "1.0", "sourceImage": "/home/houston/git/institute/docs/hero-img2threejs/reference/gold.png", "extractor": "stage1_intake/extract_pbr_evidence.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.792, "estimatedFidelity": 0.792, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/gold/gold_albedo.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/gold/gold_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/gold/gold_roughness.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/gold/gold_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/gold/gold_height.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/gold/gold_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/gold/gold_normal.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/gold/gold_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/gold/gold_ao.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/gold/gold_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 17, "sourceHeight": 11, "mapSize": 256, "cropBBoxPixels": {"x": 0, "y": 0, "width": 17, "height": 11}, "mask": {"backgroundColor": "#988065", "backgroundNoise": 51.701, "transparentPixelFraction": 0.0, "foregroundCoverage": 1.0}, "mapStats": {"valueRange": 0.3302, "heightP90Gradient": 0.08042, "roughnessBase": 0.723, "roughnessVariation": 0.129, "normalStrength": 0.25, "blurRadius": 5}, "palette": ["#887359", "#9F886C", "#786248", "#3B2510", "#EBC881"]}, "warnings": ["image is not clearly isolated from background; using most pixels as material evidence", "object/background separation is weak", "single-image inverse rendering cannot prove true physical PBR; confidence is capped"], "interpretation": "Raw extractor estimate only; physical-map acceptance pending. See material-evidence/README.md. Face/hair registered color only, never tile or use their image-derived normals; gold conductor prior pending render.", "finalMaterialAccepted": false}},
    options
  );
  materialMap["leather"] = createSculptMaterial(
    "leather",
    {"id": "leather", "name": "leather", "type": "physical", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#67401f", "color": "#67401f", "albedo": {"dominant": "#67401f", "secondary": ["#67401f"], "samplingNotes": "Use image-observed local color zones, not a single averaged color."}, "colorVariation": {"palette": ["#67401f"], "pattern": "subtle surface variation", "amplitude": 0.025, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.042, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.022000000000000002, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.008, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.69, "variation": 0.06, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 0, "variation": 0.0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.055, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "leather-edge-response", "region": "surface edges", "roughness": 0.59, "evidenceRefs": ["front"], "notes": "Slight handling polish; preserve saturated clean color."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Palette from approved concept; material evidence authored separately.", "side": "double", "referencePbr": {"version": "1.0", "sourceImage": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/refined-crops/leather-refined.png", "extractor": "stage1_intake/extract_pbr_evidence.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.756, "estimatedFidelity": 0.756, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/leather-refined/leather-refined_albedo.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/leather-refined/leather-refined_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/leather-refined/leather-refined_roughness.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/leather-refined/leather-refined_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/leather-refined/leather-refined_height.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/leather-refined/leather-refined_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/leather-refined/leather-refined_normal.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/leather-refined/leather-refined_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/leather-refined/leather-refined_ao.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/leather-refined/leather-refined_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 42, "sourceHeight": 72, "mapSize": 256, "cropBBoxPixels": {"x": 0, "y": 0, "width": 42, "height": 72}, "mask": {"backgroundColor": "#422C1F", "backgroundNoise": 32.326, "transparentPixelFraction": 0.0, "foregroundCoverage": 0.996}, "mapStats": {"valueRange": 0.1878, "heightP90Gradient": 0.13599, "roughnessBase": 0.759, "roughnessVariation": 0.178, "normalStrength": 0.316, "blurRadius": 5}, "palette": ["#3C291E", "#4B3224", "#694731", "#2E1E15", "#BEBABE"]}, "warnings": ["image is not clearly isolated from background; using most pixels as material evidence", "object/background separation is weak", "single-image inverse rendering cannot prove true physical PBR; confidence is capped", "low value range weakens height/roughness inference"], "interpretation": "Raw extractor estimate only; physical-map acceptance pending. See material-evidence/README.md. Face/hair registered color only, never tile or use their image-derived normals; gold conductor prior pending render.", "finalMaterialAccepted": false}},
    options
  );
  materialMap["skin"] = createSculptMaterial(
    "skin",
    {"id": "skin", "name": "skin", "type": "physical", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#cf9664", "color": "#cf9664", "albedo": {"dominant": "#cf9664", "secondary": ["#cf9664"], "samplingNotes": "Use image-observed local color zones, not a single averaged color."}, "colorVariation": {"palette": ["#cf9664"], "pattern": "subtle surface variation", "amplitude": 0.025, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.042, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.022000000000000002, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.008, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.63, "variation": 0.06, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 0, "variation": 0.0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.055, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "skin-edge-response", "region": "surface edges", "roughness": 0.53, "evidenceRefs": ["front"], "notes": "Slight handling polish; preserve saturated clean color."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Palette from approved concept; material evidence authored separately.", "side": "double", "referencePbr": {"version": "1.0", "sourceImage": "/home/houston/git/institute/docs/hero-img2threejs/reference/face.png", "extractor": "stage1_intake/extract_pbr_evidence.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.829, "estimatedFidelity": 0.829, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/face/face_albedo.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/face/face_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/face/face_roughness.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/face/face_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/face/face_height.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/face/face_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/face/face_normal.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/face/face_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/face/face_ao.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/face/face_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 111, "sourceHeight": 136, "mapSize": 256, "cropBBoxPixels": {"x": 0, "y": 0, "width": 111, "height": 136}, "mask": {"backgroundColor": "#A6A6AC", "backgroundNoise": 202.914, "transparentPixelFraction": 0.0, "foregroundCoverage": 0.9616}, "mapStats": {"valueRange": 0.8012, "heightP90Gradient": 0.14526, "roughnessBase": 0.764, "roughnessVariation": 0.194, "normalStrength": 0.326, "blurRadius": 5}, "palette": ["#140D07", "#673819", "#F5BB86", "#BF7A44", "#1C7783"]}, "warnings": ["image is not clearly isolated from background; using most pixels as material evidence", "object/background separation is weak", "single-image inverse rendering cannot prove true physical PBR; confidence is capped"], "interpretation": "Raw extractor estimate only; physical-map acceptance pending. See material-evidence/README.md. Face/hair registered color only, never tile or use their image-derived normals; gold conductor prior pending render.", "finalMaterialAccepted": false}},
    options
  );
  materialMap["hair"] = createSculptMaterial(
    "hair",
    {"id": "hair", "name": "hair", "type": "physical", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#352011", "color": "#352011", "albedo": {"dominant": "#352011", "secondary": ["#352011"], "samplingNotes": "Use image-observed local color zones, not a single averaged color."}, "colorVariation": {"palette": ["#352011"], "pattern": "subtle surface variation", "amplitude": 0.025, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.042, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.022000000000000002, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.008, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.52, "variation": 0.06, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 0, "variation": 0.0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.055, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "hair-edge-response", "region": "surface edges", "roughness": 0.42000000000000004, "evidenceRefs": ["front"], "notes": "Slight handling polish; preserve saturated clean color."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Palette from approved concept; material evidence authored separately.", "side": "double", "referencePbr": {"version": "1.0", "sourceImage": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/hair-crop/hair.png", "extractor": "stage1_intake/extract_pbr_evidence.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.829, "estimatedFidelity": 0.829, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/hair/hair_albedo.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/hair/hair_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/hair/hair_roughness.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/hair/hair_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/hair/hair_height.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/hair/hair_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/hair/hair_normal.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/hair/hair_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/houston/git/institute/docs/hero-img2threejs/material-evidence/hair/hair_ao.png", "url": "/@fs/home/houston/git/institute/docs/hero-img2threejs/material-evidence/hair/hair_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 68, "sourceHeight": 40, "mapSize": 256, "cropBBoxPixels": {"x": 0, "y": 0, "width": 68, "height": 40}, "mask": {"backgroundColor": "#1A656A", "backgroundNoise": 134.078, "transparentPixelFraction": 0.0, "foregroundCoverage": 0.9982}, "mapStats": {"valueRange": 0.8366, "heightP90Gradient": 0.09065, "roughnessBase": 0.738, "roughnessVariation": 0.172, "normalStrength": 0.262, "blurRadius": 5}, "palette": ["#1C0C04", "#592E12", "#FACC9C", "#AB6D3B", "#358177"]}, "warnings": ["image is not clearly isolated from background; using most pixels as material evidence", "object/background separation is weak", "single-image inverse rendering cannot prove true physical PBR; confidence is capped"], "interpretation": "Raw extractor estimate only; physical-map acceptance pending. See material-evidence/README.md. Face/hair registered color only, never tile or use their image-derived normals; gold conductor prior pending render.", "finalMaterialAccepted": false}},
    options
  );
  materialMap["eye"] = createSculptMaterial(
    "eye",
    {"id": "eye", "name": "eye", "type": "physical", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#bbbea0", "color": "#bbbea0", "albedo": {"dominant": "#bbbea0", "secondary": ["#bbbea0"], "samplingNotes": "Use image-observed local color zones, not a single averaged color."}, "colorVariation": {"palette": ["#bbbea0"], "pattern": "subtle surface variation", "amplitude": 0.025, "heightCorrelation": 0.3}, "roughness": {"base": 0.15, "variation": 0.06, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "eye-edge-response", "region": "surface edges", "roughness": 0.12, "evidenceRefs": ["front"], "notes": "Slight handling polish; preserve saturated clean color."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Palette from approved concept; material evidence authored separately.", "side": "double", "textureless": {"declared": true, "evidence": ["Concept eye and iris span fewer than 20 pixels; only smooth optical highlights and color boundaries are visible. Amber jewel has geometric facets with no visible pattern; dark cavities carry no resolved surface detail. No image-derived microtexture is asserted."]}},
    options
  );
  materialMap["iris"] = createSculptMaterial(
    "iris",
    {"id": "iris", "name": "iris", "type": "physical", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#526047", "color": "#526047", "albedo": {"dominant": "#526047", "secondary": ["#526047"], "samplingNotes": "Use image-observed local color zones, not a single averaged color."}, "colorVariation": {"palette": ["#526047"], "pattern": "subtle surface variation", "amplitude": 0.025, "heightCorrelation": 0.3}, "roughness": {"base": 0.19, "variation": 0.06, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "iris-edge-response", "region": "surface edges", "roughness": 0.12, "evidenceRefs": ["front"], "notes": "Slight handling polish; preserve saturated clean color."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Palette from approved concept; material evidence authored separately.", "side": "double", "textureless": {"declared": true, "evidence": ["Concept eye and iris span fewer than 20 pixels; only smooth optical highlights and color boundaries are visible. Amber jewel has geometric facets with no visible pattern; dark cavities carry no resolved surface detail. No image-derived microtexture is asserted."]}},
    options
  );
  materialMap["dark"] = createSculptMaterial(
    "dark",
    {"id": "dark", "name": "dark", "type": "physical", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#1b1714", "color": "#1b1714", "albedo": {"dominant": "#1b1714", "secondary": ["#1b1714"], "samplingNotes": "Use image-observed local color zones, not a single averaged color."}, "colorVariation": {"palette": ["#1b1714"], "pattern": "subtle surface variation", "amplitude": 0.025, "heightCorrelation": 0.3}, "roughness": {"base": 0.85, "variation": 0.06, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "dark-edge-response", "region": "surface edges", "roughness": 0.75, "evidenceRefs": ["front"], "notes": "Slight handling polish; preserve saturated clean color."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Palette from approved concept; material evidence authored separately.", "side": "double", "textureless": {"declared": true, "evidence": ["Concept eye and iris span fewer than 20 pixels; only smooth optical highlights and color boundaries are visible. Amber jewel has geometric facets with no visible pattern; dark cavities carry no resolved surface detail. No image-derived microtexture is asserted."]}},
    options
  );
  materialMap["amber"] = createSculptMaterial(
    "amber",
    {"id": "amber", "name": "amber", "type": "physical", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#e99116", "color": "#e99116", "albedo": {"dominant": "#e99116", "secondary": ["#e99116"], "samplingNotes": "Use image-observed local color zones, not a single averaged color."}, "colorVariation": {"palette": ["#e99116"], "pattern": "subtle surface variation", "amplitude": 0.025, "heightCorrelation": 0.3}, "roughness": {"base": 0.15, "variation": 0.06, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 0.1, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "amber-edge-response", "region": "surface edges", "roughness": 0.12, "evidenceRefs": ["front"], "notes": "Slight handling polish; preserve saturated clean color."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Palette from approved concept; material evidence authored separately.", "side": "double", "textureless": {"declared": true, "evidence": ["Concept eye and iris span fewer than 20 pixels; only smooth optical highlights and color boundaries are visible. Amber jewel has geometric facets with no visible pattern; dark cavities carry no resolved surface detail. No image-derived microtexture is asserted."]}},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const endpoint_root_0 = makeAttachmentEndpoint(null);
  const node_root_0 = new THREE.Group();
  node_root_0.name = "Root__pivot";
  node_root_0.scale.set(1, 1, 1);
  if (endpoint_root_0) {
    node_root_0.position.copy(endpoint_root_0.start);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_root_0.position.set(0.0, 0.0, 0.0);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  }
  node_root_0.userData.sculptComponent = {"id": "root", "name": "Root", "level": "macro", "role": "container", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": null, "attachment": null, "dimensions": {"width": 0.001, "height": 0.001, "depth": 0.001, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [0.001, 0.001, 0.001]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "upper-arm-l-shoulder", "position": [0.29, 1.73, 0], "rotation": [0, 0, 0]}, {"id": "upper-arm-r-shoulder", "position": [-0.29, 1.73, 0], "rotation": [0, 0, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dark"}}, "material": "dark", "materialLayers": ["dark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(27, 23, 20, 1)", "secondaryAlbedo": "rgba(27, 23, 20, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_root_0.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "upper-arm-l-shoulder", "position": [0.29, 1.73, 0], "rotation": [0, 0, 0]}, {"id": "upper-arm-r-shoulder", "position": [-0.29, 1.73, 0], "rotation": [0, 0, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dark"}};
  (nodes["root"] ?? root).add(node_root_0);
  nodes["root"] = node_root_0;
  const mesh_root_0Geometry = endpoint_root_0
    ? new THREE.CylinderGeometry(endpoint_root_0.endRadius, endpoint_root_0.baseRadius, endpoint_root_0.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_root_0) {
    mesh_root_0Geometry.scale(0.001, 0.001, 0.001);
  }
  const mesh_root_0 = new THREE.Mesh(
    mesh_root_0Geometry,
    materialMap["dark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_root_0.name = "Root";
  if (endpoint_root_0) {
    mesh_root_0.position.copy(endpoint_root_0.midpoint);
    mesh_root_0.quaternion.copy(endpoint_root_0.quaternion);
  }
  mesh_root_0.castShadow = options.castShadow ?? true;
  mesh_root_0.receiveShadow = options.receiveShadow ?? true;
  mesh_root_0.userData.sculptComponent = {"id": "root", "name": "Root", "level": "macro", "role": "container", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": null, "attachment": null, "dimensions": {"width": 0.001, "height": 0.001, "depth": 0.001, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [0.001, 0.001, 0.001]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "upper-arm-l-shoulder", "position": [0.29, 1.73, 0], "rotation": [0, 0, 0]}, {"id": "upper-arm-r-shoulder", "position": [-0.29, 1.73, 0], "rotation": [0, 0, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dark"}}, "material": "dark", "materialLayers": ["dark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(27, 23, 20, 1)", "secondaryAlbedo": "rgba(27, 23, 20, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_root_0.add(mesh_root_0);
  meshes["root"] = mesh_root_0;
  colliders["root"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_root_0);
  const socket_root_upper_arm_l_shoulder_0 = new THREE.Object3D();
  socket_root_upper_arm_l_shoulder_0.name = "upper-arm-l-shoulder";
  socket_root_upper_arm_l_shoulder_0.position.set(0.29, 1.73, 0.0);
  socket_root_upper_arm_l_shoulder_0.rotation.set(0.0, 0.0, 0.0);
  socket_root_upper_arm_l_shoulder_0.userData.socket = {"id": "upper-arm-l-shoulder", "position": [0.29, 1.73, 0], "rotation": [0, 0, 0]};
  node_root_0.add(socket_root_upper_arm_l_shoulder_0);
  sockets["root:upper-arm-l-shoulder"] = socket_root_upper_arm_l_shoulder_0;
  const socket_root_upper_arm_r_shoulder_1 = new THREE.Object3D();
  socket_root_upper_arm_r_shoulder_1.name = "upper-arm-r-shoulder";
  socket_root_upper_arm_r_shoulder_1.position.set(-0.29, 1.73, 0.0);
  socket_root_upper_arm_r_shoulder_1.rotation.set(0.0, 0.0, 0.0);
  socket_root_upper_arm_r_shoulder_1.userData.socket = {"id": "upper-arm-r-shoulder", "position": [-0.29, 1.73, 0], "rotation": [0, 0, 0]};
  node_root_0.add(socket_root_upper_arm_r_shoulder_1);
  sockets["root:upper-arm-r-shoulder"] = socket_root_upper_arm_r_shoulder_1;

  const endpoint_pelvis_1 = makeAttachmentEndpoint(null);
  const node_pelvis_1 = new THREE.Group();
  node_pelvis_1.name = "Pelvis__pivot";
  node_pelvis_1.scale.set(1, 1, 1);
  if (endpoint_pelvis_1) {
    node_pelvis_1.position.copy(endpoint_pelvis_1.start);
    node_pelvis_1.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pelvis_1.position.set(0.0, 1.12, 0.0);
    node_pelvis_1.rotation.set(0.0, 0.0, 0.0);
  }
  node_pelvis_1.userData.sculptComponent = {"id": "pelvis", "name": "Pelvis", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0, 1.12, 0]}, "parent": "root", "attachment": null, "dimensions": {"width": 0.36, "height": 0.28, "depth": 0.27, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 1.12, 0], "rotation": [0, 0, 0], "scale": [0.36, 0.28, 0.27]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth-dark"}}, "material": "cloth-dark", "materialLayers": ["cloth-dark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "hip-taper", "kind": "contour", "description": "hip taper", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(7, 67, 74, 1)", "secondaryAlbedo": "rgba(7, 67, 74, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_pelvis_1.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth-dark"}};
  (nodes["root"] ?? root).add(node_pelvis_1);
  nodes["pelvis"] = node_pelvis_1;
  const mesh_pelvis_1Geometry = endpoint_pelvis_1
    ? new THREE.CylinderGeometry(endpoint_pelvis_1.endRadius, endpoint_pelvis_1.baseRadius, endpoint_pelvis_1.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_pelvis_1) {
    mesh_pelvis_1Geometry.scale(0.36, 0.28, 0.27);
  }
  const mesh_pelvis_1 = new THREE.Mesh(
    mesh_pelvis_1Geometry,
    materialMap["cloth-dark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pelvis_1.name = "Pelvis";
  if (endpoint_pelvis_1) {
    mesh_pelvis_1.position.copy(endpoint_pelvis_1.midpoint);
    mesh_pelvis_1.quaternion.copy(endpoint_pelvis_1.quaternion);
  }
  mesh_pelvis_1.castShadow = options.castShadow ?? true;
  mesh_pelvis_1.receiveShadow = options.receiveShadow ?? true;
  mesh_pelvis_1.userData.sculptComponent = {"id": "pelvis", "name": "Pelvis", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0, 1.12, 0]}, "parent": "root", "attachment": null, "dimensions": {"width": 0.36, "height": 0.28, "depth": 0.27, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 1.12, 0], "rotation": [0, 0, 0], "scale": [0.36, 0.28, 0.27]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth-dark"}}, "material": "cloth-dark", "materialLayers": ["cloth-dark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "hip-taper", "kind": "contour", "description": "hip taper", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(7, 67, 74, 1)", "secondaryAlbedo": "rgba(7, 67, 74, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_pelvis_1.add(mesh_pelvis_1);
  meshes["pelvis"] = mesh_pelvis_1;
  colliders["pelvis"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_pelvis_1);

  const endpoint_cuirass_2 = makeAttachmentEndpoint(null);
  const node_cuirass_2 = new THREE.Group();
  node_cuirass_2.name = "Cuirass__pivot";
  node_cuirass_2.scale.set(1, 1, 1);
  if (endpoint_cuirass_2) {
    node_cuirass_2.position.copy(endpoint_cuirass_2.start);
    node_cuirass_2.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_cuirass_2.position.set(0.0, 0.38, 0.0);
    node_cuirass_2.rotation.set(0.0, 0.0, 0.0);
  }
  node_cuirass_2.userData.sculptComponent = {"id": "cuirass", "name": "Cuirass", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "cuirass", "rings": [[1.275, 0.175, 0.12], [1.3, 0.18, 0.14], [1.55, 0.255, 0.175], [1.7, 0.245, 0.145], [1.78, 0.15, 0.11]], "frontRidge": 0.04}, "referenceAnchor": [0, 1.5, 0]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.5, "height": 0.57, "depth": 0.29, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.38, 0], "rotation": [0, 0, 0], "scale": [0.5, 0.57, 0.29]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "upper-arm-l-shoulder", "position": [0.29, 0.23, 0], "rotation": [0, 0, 0]}, {"id": "upper-arm-r-shoulder", "position": [-0.29, 0.23, 0], "rotation": [0, 0, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cuirass", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "tapered-waist", "kind": "contour", "description": "tapered waist", "evidenceRefs": ["front", "rear"]}, {"id": "central-keel", "kind": "ridge", "description": "central keel", "evidenceRefs": ["front", "rear"]}, {"id": "gold-panel-borders", "kind": "bevel", "description": "gold panel borders", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(156, 164, 166, 1)", "secondaryAlbedo": "rgba(156, 164, 166, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_cuirass_2.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "upper-arm-l-shoulder", "position": [0.29, 0.23, 0], "rotation": [0, 0, 0]}, {"id": "upper-arm-r-shoulder", "position": [-0.29, 0.23, 0], "rotation": [0, 0, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cuirass", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}};
  (nodes["pelvis"] ?? root).add(node_cuirass_2);
  nodes["cuirass"] = node_cuirass_2;
  const mesh_cuirass_2Geometry = endpoint_cuirass_2
    ? new THREE.CylinderGeometry(endpoint_cuirass_2.endRadius, endpoint_cuirass_2.baseRadius, endpoint_cuirass_2.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_cuirass_2) {
    mesh_cuirass_2Geometry.scale(0.5, 0.57, 0.29);
  }
  const mesh_cuirass_2 = new THREE.Mesh(
    mesh_cuirass_2Geometry,
    materialMap["steel"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_cuirass_2.name = "Cuirass";
  if (endpoint_cuirass_2) {
    mesh_cuirass_2.position.copy(endpoint_cuirass_2.midpoint);
    mesh_cuirass_2.quaternion.copy(endpoint_cuirass_2.quaternion);
  }
  mesh_cuirass_2.castShadow = options.castShadow ?? true;
  mesh_cuirass_2.receiveShadow = options.receiveShadow ?? true;
  mesh_cuirass_2.userData.sculptComponent = {"id": "cuirass", "name": "Cuirass", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "cuirass", "rings": [[1.275, 0.175, 0.12], [1.3, 0.18, 0.14], [1.55, 0.255, 0.175], [1.7, 0.245, 0.145], [1.78, 0.15, 0.11]], "frontRidge": 0.04}, "referenceAnchor": [0, 1.5, 0]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.5, "height": 0.57, "depth": 0.29, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.38, 0], "rotation": [0, 0, 0], "scale": [0.5, 0.57, 0.29]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "upper-arm-l-shoulder", "position": [0.29, 0.23, 0], "rotation": [0, 0, 0]}, {"id": "upper-arm-r-shoulder", "position": [-0.29, 0.23, 0], "rotation": [0, 0, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cuirass", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "tapered-waist", "kind": "contour", "description": "tapered waist", "evidenceRefs": ["front", "rear"]}, {"id": "central-keel", "kind": "ridge", "description": "central keel", "evidenceRefs": ["front", "rear"]}, {"id": "gold-panel-borders", "kind": "bevel", "description": "gold panel borders", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(156, 164, 166, 1)", "secondaryAlbedo": "rgba(156, 164, 166, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_cuirass_2.add(mesh_cuirass_2);
  meshes["cuirass"] = mesh_cuirass_2;
  colliders["cuirass"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["cuirass"] ??= [];
  destructionGroups["cuirass"].push(node_cuirass_2);
  const socket_cuirass_upper_arm_l_shoulder_0 = new THREE.Object3D();
  socket_cuirass_upper_arm_l_shoulder_0.name = "upper-arm-l-shoulder";
  socket_cuirass_upper_arm_l_shoulder_0.position.set(0.29, 0.23, 0.0);
  socket_cuirass_upper_arm_l_shoulder_0.rotation.set(0.0, 0.0, 0.0);
  socket_cuirass_upper_arm_l_shoulder_0.userData.socket = {"id": "upper-arm-l-shoulder", "position": [0.29, 0.23, 0], "rotation": [0, 0, 0]};
  node_cuirass_2.add(socket_cuirass_upper_arm_l_shoulder_0);
  sockets["cuirass:upper-arm-l-shoulder"] = socket_cuirass_upper_arm_l_shoulder_0;
  const socket_cuirass_upper_arm_r_shoulder_1 = new THREE.Object3D();
  socket_cuirass_upper_arm_r_shoulder_1.name = "upper-arm-r-shoulder";
  socket_cuirass_upper_arm_r_shoulder_1.position.set(-0.29, 0.23, 0.0);
  socket_cuirass_upper_arm_r_shoulder_1.rotation.set(0.0, 0.0, 0.0);
  socket_cuirass_upper_arm_r_shoulder_1.userData.socket = {"id": "upper-arm-r-shoulder", "position": [-0.29, 0.23, 0], "rotation": [0, 0, 0]};
  node_cuirass_2.add(socket_cuirass_upper_arm_r_shoulder_1);
  sockets["cuirass:upper-arm-r-shoulder"] = socket_cuirass_upper_arm_r_shoulder_1;

  const endpoint_neck_3 = makeAttachmentEndpoint(null);
  const node_neck_3 = new THREE.Group();
  node_neck_3.name = "Neck__pivot";
  node_neck_3.scale.set(1, 1, 1);
  if (endpoint_neck_3) {
    node_neck_3.position.copy(endpoint_neck_3.start);
    node_neck_3.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_neck_3.position.set(0.0, 0.35, 0.0);
    node_neck_3.rotation.set(0.0, 0.0, 0.0);
  }
  node_neck_3.userData.sculptComponent = {"id": "neck", "name": "Neck", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0, 1.85, 0]}, "parent": "cuirass", "attachment": null, "dimensions": {"width": 0.15, "height": 0.19, "depth": 0.15, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.35, 0], "rotation": [0, 0, 0], "scale": [0.15, 0.19, 0.15]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "neck", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L0", "colorMaterialRecipe": {"dominantAlbedo": "rgba(207, 150, 100, 1)", "secondaryAlbedo": "rgba(207, 150, 100, 1)", "materialClass": "skin", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_neck_3.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "neck", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["cuirass"] ?? root).add(node_neck_3);
  nodes["neck"] = node_neck_3;
  const mesh_neck_3Geometry = endpoint_neck_3
    ? new THREE.CylinderGeometry(endpoint_neck_3.endRadius, endpoint_neck_3.baseRadius, endpoint_neck_3.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_neck_3) {
    mesh_neck_3Geometry.scale(0.15, 0.19, 0.15);
  }
  const mesh_neck_3 = new THREE.Mesh(
    mesh_neck_3Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_neck_3.name = "Neck";
  if (endpoint_neck_3) {
    mesh_neck_3.position.copy(endpoint_neck_3.midpoint);
    mesh_neck_3.quaternion.copy(endpoint_neck_3.quaternion);
  }
  mesh_neck_3.castShadow = options.castShadow ?? true;
  mesh_neck_3.receiveShadow = options.receiveShadow ?? true;
  mesh_neck_3.userData.sculptComponent = {"id": "neck", "name": "Neck", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0, 1.85, 0]}, "parent": "cuirass", "attachment": null, "dimensions": {"width": 0.15, "height": 0.19, "depth": 0.15, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.35, 0], "rotation": [0, 0, 0], "scale": [0.15, 0.19, 0.15]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "neck", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L0", "colorMaterialRecipe": {"dominantAlbedo": "rgba(207, 150, 100, 1)", "secondaryAlbedo": "rgba(207, 150, 100, 1)", "materialClass": "skin", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_neck_3.add(mesh_neck_3);
  meshes["neck"] = mesh_neck_3;
  colliders["neck"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["neck"] ??= [];
  destructionGroups["neck"].push(node_neck_3);

  const endpoint_head_4 = makeAttachmentEndpoint(null);
  const node_head_4 = new THREE.Group();
  node_head_4.name = "Head__pivot";
  node_head_4.scale.set(1, 1, 1);
  if (endpoint_head_4) {
    node_head_4.position.copy(endpoint_head_4.start);
    node_head_4.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_head_4.position.set(0.0, 0.156, 0.015);
    node_head_4.rotation.set(0.0, 0.0, 0.0);
  }
  node_head_4.userData.sculptComponent = {"id": "head", "name": "Head", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "head", "headHeight": 0.28, "eyeLine": 0.43, "noseBase": 0.63, "mouthLine": 0.75, "widthHeight": 0.7, "depthHeight": 0.77}, "referenceAnchor": [0, 2.006, 0.015]}, "parent": "neck", "attachment": null, "dimensions": {"width": 0.19, "height": 0.28, "depth": 0.215, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.156, 0.015], "rotation": [0, 0, 0], "scale": [0.19, 0.28, 0.215]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "head", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "cheek-jaw-contour", "kind": "contour", "description": "cheek jaw contour", "evidenceRefs": ["front", "rear"]}, {"id": "orbital-recess", "kind": "hole", "description": "orbital recess", "evidenceRefs": ["front", "rear"]}, {"id": "nasal-bridge", "kind": "ridge", "description": "nasal bridge", "evidenceRefs": ["front", "rear"]}, {"id": "closed-smile", "kind": "groove", "description": "closed smile", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L0", "colorMaterialRecipe": {"dominantAlbedo": "rgba(207, 150, 100, 1)", "secondaryAlbedo": "rgba(207, 150, 100, 1)", "materialClass": "skin", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_head_4.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "head", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["neck"] ?? root).add(node_head_4);
  nodes["head"] = node_head_4;
  const mesh_head_4Geometry = endpoint_head_4
    ? new THREE.CylinderGeometry(endpoint_head_4.endRadius, endpoint_head_4.baseRadius, endpoint_head_4.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_head_4) {
    mesh_head_4Geometry.scale(0.19, 0.28, 0.215);
  }
  const mesh_head_4 = new THREE.Mesh(
    mesh_head_4Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_head_4.name = "Head";
  if (endpoint_head_4) {
    mesh_head_4.position.copy(endpoint_head_4.midpoint);
    mesh_head_4.quaternion.copy(endpoint_head_4.quaternion);
  }
  mesh_head_4.castShadow = options.castShadow ?? true;
  mesh_head_4.receiveShadow = options.receiveShadow ?? true;
  mesh_head_4.userData.sculptComponent = {"id": "head", "name": "Head", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "head", "headHeight": 0.28, "eyeLine": 0.43, "noseBase": 0.63, "mouthLine": 0.75, "widthHeight": 0.7, "depthHeight": 0.77}, "referenceAnchor": [0, 2.006, 0.015]}, "parent": "neck", "attachment": null, "dimensions": {"width": 0.19, "height": 0.28, "depth": 0.215, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.156, 0.015], "rotation": [0, 0, 0], "scale": [0.19, 0.28, 0.215]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "head", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "cheek-jaw-contour", "kind": "contour", "description": "cheek jaw contour", "evidenceRefs": ["front", "rear"]}, {"id": "orbital-recess", "kind": "hole", "description": "orbital recess", "evidenceRefs": ["front", "rear"]}, {"id": "nasal-bridge", "kind": "ridge", "description": "nasal bridge", "evidenceRefs": ["front", "rear"]}, {"id": "closed-smile", "kind": "groove", "description": "closed smile", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L0", "colorMaterialRecipe": {"dominantAlbedo": "rgba(207, 150, 100, 1)", "secondaryAlbedo": "rgba(207, 150, 100, 1)", "materialClass": "skin", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_head_4.add(mesh_head_4);
  meshes["head"] = mesh_head_4;
  colliders["head"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["head"] ??= [];
  destructionGroups["head"].push(node_head_4);

  const endpoint_hood_5 = makeAttachmentEndpoint(null);
  const node_hood_5 = new THREE.Group();
  node_hood_5.name = "Hood__pivot";
  node_hood_5.scale.set(1, 1, 1);
  if (endpoint_hood_5) {
    node_hood_5.position.copy(endpoint_hood_5.start);
    node_hood_5.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_hood_5.position.set(0.0, 0.004, -0.06);
    node_hood_5.rotation.set(0.0, 0.0, 0.0);
  }
  node_hood_5.userData.sculptComponent = {"id": "hood", "name": "Hood", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "hood", "opening": [[0, 2.2, 0.08], [0.105, 2.14, 0.14], [0.157, 1.91, 0.125], [0.095, 1.82, 0.08]], "depth": 0.3, "thickness": 0.009}, "referenceAnchor": [0, 2.01, -0.045]}, "parent": "head", "attachment": null, "dimensions": {"width": 0.37, "height": 0.43, "depth": 0.34, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.004, -0.06], "rotation": [0, 0, 0], "scale": [0.37, 0.43, 0.34]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hood", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}}, "material": "cloth", "materialLayers": ["cloth"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "pointed-open-contour", "kind": "contour", "description": "pointed open contour", "evidenceRefs": ["front", "rear"]}, {"id": "gold-opening-binding", "kind": "bevel", "description": "gold opening binding", "evidenceRefs": ["front", "rear"]}, {"id": "rear-neck-fold", "kind": "seam", "description": "rear neck fold", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 140, 152, 1)", "secondaryAlbedo": "rgba(0, 140, 152, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_hood_5.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hood", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}};
  (nodes["head"] ?? root).add(node_hood_5);
  nodes["hood"] = node_hood_5;
  const mesh_hood_5Geometry = endpoint_hood_5
    ? new THREE.CylinderGeometry(endpoint_hood_5.endRadius, endpoint_hood_5.baseRadius, endpoint_hood_5.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_hood_5) {
    mesh_hood_5Geometry.scale(0.37, 0.43, 0.34);
  }
  const mesh_hood_5 = new THREE.Mesh(
    mesh_hood_5Geometry,
    materialMap["cloth"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hood_5.name = "Hood";
  if (endpoint_hood_5) {
    mesh_hood_5.position.copy(endpoint_hood_5.midpoint);
    mesh_hood_5.quaternion.copy(endpoint_hood_5.quaternion);
  }
  mesh_hood_5.castShadow = options.castShadow ?? true;
  mesh_hood_5.receiveShadow = options.receiveShadow ?? true;
  mesh_hood_5.userData.sculptComponent = {"id": "hood", "name": "Hood", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "hood", "opening": [[0, 2.2, 0.08], [0.105, 2.14, 0.14], [0.157, 1.91, 0.125], [0.095, 1.82, 0.08]], "depth": 0.3, "thickness": 0.009}, "referenceAnchor": [0, 2.01, -0.045]}, "parent": "head", "attachment": null, "dimensions": {"width": 0.37, "height": 0.43, "depth": 0.34, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.004, -0.06], "rotation": [0, 0, 0], "scale": [0.37, 0.43, 0.34]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hood", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}}, "material": "cloth", "materialLayers": ["cloth"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "pointed-open-contour", "kind": "contour", "description": "pointed open contour", "evidenceRefs": ["front", "rear"]}, {"id": "gold-opening-binding", "kind": "bevel", "description": "gold opening binding", "evidenceRefs": ["front", "rear"]}, {"id": "rear-neck-fold", "kind": "seam", "description": "rear neck fold", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 140, 152, 1)", "secondaryAlbedo": "rgba(0, 140, 152, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_hood_5.add(mesh_hood_5);
  meshes["hood"] = mesh_hood_5;
  colliders["hood"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["hood"] ??= [];
  destructionGroups["hood"].push(node_hood_5);

  const endpoint_cowl_6 = makeAttachmentEndpoint(null);
  const node_cowl_6 = new THREE.Group();
  node_cowl_6.name = "Cowl__pivot";
  node_cowl_6.scale.set(1, 1, 1);
  if (endpoint_cowl_6) {
    node_cowl_6.position.copy(endpoint_cowl_6.start);
    node_cowl_6.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_cowl_6.position.set(0.0, 0.3, 0.025);
    node_cowl_6.rotation.set(0.0, 0.0, 0.0);
  }
  node_cowl_6.userData.sculptComponent = {"id": "cowl", "name": "Cowl", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "cowl", "foldCount": 3, "diagonalDrop": 0.1}, "referenceAnchor": [0, 1.8, 0.025]}, "parent": "cuirass", "attachment": null, "dimensions": {"width": 0.58, "height": 0.16, "depth": 0.34, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.3, 0.025], "rotation": [0, 0, 0], "scale": [0.58, 0.16, 0.34]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cowl", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}}, "material": "cloth", "materialLayers": ["cloth"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "crossing-collar-folds", "kind": "ridge", "description": "crossing collar folds", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 140, 152, 1)", "secondaryAlbedo": "rgba(0, 140, 152, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_cowl_6.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cowl", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}};
  (nodes["cuirass"] ?? root).add(node_cowl_6);
  nodes["cowl"] = node_cowl_6;
  const mesh_cowl_6Geometry = endpoint_cowl_6
    ? new THREE.CylinderGeometry(endpoint_cowl_6.endRadius, endpoint_cowl_6.baseRadius, endpoint_cowl_6.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_cowl_6) {
    mesh_cowl_6Geometry.scale(0.58, 0.16, 0.34);
  }
  const mesh_cowl_6 = new THREE.Mesh(
    mesh_cowl_6Geometry,
    materialMap["cloth"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_cowl_6.name = "Cowl";
  if (endpoint_cowl_6) {
    mesh_cowl_6.position.copy(endpoint_cowl_6.midpoint);
    mesh_cowl_6.quaternion.copy(endpoint_cowl_6.quaternion);
  }
  mesh_cowl_6.castShadow = options.castShadow ?? true;
  mesh_cowl_6.receiveShadow = options.receiveShadow ?? true;
  mesh_cowl_6.userData.sculptComponent = {"id": "cowl", "name": "Cowl", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "cowl", "foldCount": 3, "diagonalDrop": 0.1}, "referenceAnchor": [0, 1.8, 0.025]}, "parent": "cuirass", "attachment": null, "dimensions": {"width": 0.58, "height": 0.16, "depth": 0.34, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.3, 0.025], "rotation": [0, 0, 0], "scale": [0.58, 0.16, 0.34]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cowl", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}}, "material": "cloth", "materialLayers": ["cloth"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "crossing-collar-folds", "kind": "ridge", "description": "crossing collar folds", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 140, 152, 1)", "secondaryAlbedo": "rgba(0, 140, 152, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_cowl_6.add(mesh_cowl_6);
  meshes["cowl"] = mesh_cowl_6;
  colliders["cowl"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["cowl"] ??= [];
  destructionGroups["cowl"].push(node_cowl_6);

  const endpoint_cape_7 = makeAttachmentEndpoint(null);
  const node_cape_7 = new THREE.Group();
  node_cape_7.name = "Cape__pivot";
  node_cape_7.scale.set(1, 1, 1);
  if (endpoint_cape_7) {
    node_cape_7.position.copy(endpoint_cape_7.start);
    node_cape_7.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_cape_7.position.set(-0.19, -0.08, -0.2);
    node_cape_7.rotation.set(0.0, 0.0, 0.0);
  }
  node_cape_7.userData.sculptComponent = {"id": "cape", "name": "Cape", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "cape", "topY": 1.82, "bottomY": 0.33, "topWidth": 0.54, "bottomWidth": 1.02, "sweepX": -0.38, "sweepZ": -0.33, "foldAmplitude": 0.055, "foldCount": 5, "thickness": 0.008}, "referenceAnchor": [-0.19, 1.04, -0.2]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 1.14, "height": 1.43, "depth": 0.32, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.19, -0.08, -0.2], "rotation": [0, 0, 0], "scale": [1.14, 1.43, 0.32]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cape", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}}, "material": "cloth", "materialLayers": ["cloth"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "deep-diagonal-folds", "kind": "ridge", "description": "deep diagonal folds", "evidenceRefs": ["front", "rear"]}, {"id": "asymmetric-hem-notches", "kind": "hole", "description": "asymmetric hem notches", "evidenceRefs": ["front", "rear"]}, {"id": "gold-binding", "kind": "bevel", "description": "gold binding", "evidenceRefs": ["front", "rear"]}, {"id": "gold-hem-motifs", "kind": "linework", "description": "gold hem motifs", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 140, 152, 1)", "secondaryAlbedo": "rgba(0, 140, 152, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_cape_7.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cape", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}};
  (nodes["pelvis"] ?? root).add(node_cape_7);
  nodes["cape"] = node_cape_7;
  const mesh_cape_7Geometry = endpoint_cape_7
    ? new THREE.CylinderGeometry(endpoint_cape_7.endRadius, endpoint_cape_7.baseRadius, endpoint_cape_7.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_cape_7) {
    mesh_cape_7Geometry.scale(1.14, 1.43, 0.32);
  }
  const mesh_cape_7 = new THREE.Mesh(
    mesh_cape_7Geometry,
    materialMap["cloth"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_cape_7.name = "Cape";
  if (endpoint_cape_7) {
    mesh_cape_7.position.copy(endpoint_cape_7.midpoint);
    mesh_cape_7.quaternion.copy(endpoint_cape_7.quaternion);
  }
  mesh_cape_7.castShadow = options.castShadow ?? true;
  mesh_cape_7.receiveShadow = options.receiveShadow ?? true;
  mesh_cape_7.userData.sculptComponent = {"id": "cape", "name": "Cape", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "cape", "topY": 1.82, "bottomY": 0.33, "topWidth": 0.54, "bottomWidth": 1.02, "sweepX": -0.38, "sweepZ": -0.33, "foldAmplitude": 0.055, "foldCount": 5, "thickness": 0.008}, "referenceAnchor": [-0.19, 1.04, -0.2]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 1.14, "height": 1.43, "depth": 0.32, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.19, -0.08, -0.2], "rotation": [0, 0, 0], "scale": [1.14, 1.43, 0.32]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cape", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}}, "material": "cloth", "materialLayers": ["cloth"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "deep-diagonal-folds", "kind": "ridge", "description": "deep diagonal folds", "evidenceRefs": ["front", "rear"]}, {"id": "asymmetric-hem-notches", "kind": "hole", "description": "asymmetric hem notches", "evidenceRefs": ["front", "rear"]}, {"id": "gold-binding", "kind": "bevel", "description": "gold binding", "evidenceRefs": ["front", "rear"]}, {"id": "gold-hem-motifs", "kind": "linework", "description": "gold hem motifs", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 140, 152, 1)", "secondaryAlbedo": "rgba(0, 140, 152, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_cape_7.add(mesh_cape_7);
  meshes["cape"] = mesh_cape_7;
  colliders["cape"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["cape"] ??= [];
  destructionGroups["cape"].push(node_cape_7);

  const endpoint_belt_8 = makeAttachmentEndpoint(null);
  const node_belt_8 = new THREE.Group();
  node_belt_8.name = "Belt__pivot";
  node_belt_8.scale.set(1, 1, 1);
  if (endpoint_belt_8) {
    node_belt_8.position.copy(endpoint_belt_8.start);
    node_belt_8.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_belt_8.position.set(0.0, 0.135, 0.02);
    node_belt_8.rotation.set(0.0, 0.0, 0.0);
  }
  node_belt_8.userData.sculptComponent = {"id": "belt", "name": "Belt", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0, 1.255, 0.02]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.44, "height": 0.1, "depth": 0.32, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.135, 0.02], "rotation": [0, 0, 0], "scale": [0.44, 0.1, 0.32]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "belt", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "waist-wrap", "kind": "contour", "description": "waist wrap", "evidenceRefs": ["front", "rear"]}, {"id": "angular-gold-buckle", "kind": "bevel", "description": "angular gold buckle", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_belt_8.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "belt", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}};
  (nodes["pelvis"] ?? root).add(node_belt_8);
  nodes["belt"] = node_belt_8;
  const mesh_belt_8Geometry = endpoint_belt_8
    ? new THREE.CylinderGeometry(endpoint_belt_8.endRadius, endpoint_belt_8.baseRadius, endpoint_belt_8.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_belt_8) {
    mesh_belt_8Geometry.scale(0.44, 0.1, 0.32);
  }
  const mesh_belt_8 = new THREE.Mesh(
    mesh_belt_8Geometry,
    materialMap["leather"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_belt_8.name = "Belt";
  if (endpoint_belt_8) {
    mesh_belt_8.position.copy(endpoint_belt_8.midpoint);
    mesh_belt_8.quaternion.copy(endpoint_belt_8.quaternion);
  }
  mesh_belt_8.castShadow = options.castShadow ?? true;
  mesh_belt_8.receiveShadow = options.receiveShadow ?? true;
  mesh_belt_8.userData.sculptComponent = {"id": "belt", "name": "Belt", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0, 1.255, 0.02]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.44, "height": 0.1, "depth": 0.32, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.135, 0.02], "rotation": [0, 0, 0], "scale": [0.44, 0.1, 0.32]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "belt", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "waist-wrap", "kind": "contour", "description": "waist wrap", "evidenceRefs": ["front", "rear"]}, {"id": "angular-gold-buckle", "kind": "bevel", "description": "angular gold buckle", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_belt_8.add(mesh_belt_8);
  meshes["belt"] = mesh_belt_8;
  colliders["belt"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["belt"] ??= [];
  destructionGroups["belt"].push(node_belt_8);

  const endpoint_harness_9 = makeAttachmentEndpoint(null);
  const node_harness_9 = new THREE.Group();
  node_harness_9.name = "Harness__pivot";
  node_harness_9.scale.set(1, 1, 1);
  if (endpoint_harness_9) {
    node_harness_9.position.copy(endpoint_harness_9.start);
    node_harness_9.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_harness_9.position.set(0.0, 0.06, 0.19);
    node_harness_9.rotation.set(0.0, 0.0, 0.0);
  }
  node_harness_9.userData.sculptComponent = {"id": "harness", "name": "Harness", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "harness", "start": [-0.19, 1.76, 0.17], "end": [0.18, 1.35, 0.16], "width": 0.056}, "referenceAnchor": [0, 1.56, 0.19]}, "parent": "cuirass", "attachment": null, "dimensions": {"width": 0.42, "height": 0.075, "depth": 0.022, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.06, 0.19], "rotation": [0, 0, 0], "scale": [0.42, 0.075, 0.022]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "harness", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "diagonal-strap", "kind": "ridge", "description": "diagonal strap", "evidenceRefs": ["front", "rear"]}, {"id": "strap-buckle", "kind": "bevel", "description": "strap buckle", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_harness_9.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "harness", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}};
  (nodes["cuirass"] ?? root).add(node_harness_9);
  nodes["harness"] = node_harness_9;
  const mesh_harness_9Geometry = endpoint_harness_9
    ? new THREE.CylinderGeometry(endpoint_harness_9.endRadius, endpoint_harness_9.baseRadius, endpoint_harness_9.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_harness_9) {
    mesh_harness_9Geometry.scale(0.42, 0.075, 0.022);
  }
  const mesh_harness_9 = new THREE.Mesh(
    mesh_harness_9Geometry,
    materialMap["leather"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_harness_9.name = "Harness";
  if (endpoint_harness_9) {
    mesh_harness_9.position.copy(endpoint_harness_9.midpoint);
    mesh_harness_9.quaternion.copy(endpoint_harness_9.quaternion);
  }
  mesh_harness_9.castShadow = options.castShadow ?? true;
  mesh_harness_9.receiveShadow = options.receiveShadow ?? true;
  mesh_harness_9.userData.sculptComponent = {"id": "harness", "name": "Harness", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "harness", "start": [-0.19, 1.76, 0.17], "end": [0.18, 1.35, 0.16], "width": 0.056}, "referenceAnchor": [0, 1.56, 0.19]}, "parent": "cuirass", "attachment": null, "dimensions": {"width": 0.42, "height": 0.075, "depth": 0.022, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.06, 0.19], "rotation": [0, 0, 0], "scale": [0.42, 0.075, 0.022]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "harness", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "diagonal-strap", "kind": "ridge", "description": "diagonal strap", "evidenceRefs": ["front", "rear"]}, {"id": "strap-buckle", "kind": "bevel", "description": "strap buckle", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_harness_9.add(mesh_harness_9);
  meshes["harness"] = mesh_harness_9;
  colliders["harness"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["harness"] ??= [];
  destructionGroups["harness"].push(node_harness_9);

  const endpoint_tabard_10 = makeAttachmentEndpoint(null);
  const node_tabard_10 = new THREE.Group();
  node_tabard_10.name = "Tabard__pivot";
  node_tabard_10.scale.set(1, 1, 1);
  if (endpoint_tabard_10) {
    node_tabard_10.position.copy(endpoint_tabard_10.start);
    node_tabard_10.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_tabard_10.position.set(0.0, -0.16, 0.18);
    node_tabard_10.rotation.set(0.0, 0.0, 0.0);
  }
  node_tabard_10.userData.sculptComponent = {"id": "tabard", "name": "Tabard", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "tabard", "topY": 1.22, "bottomY": 0.68, "topWidth": 0.24, "bottomWidth": 0.2, "z": 0.19, "foldAmplitude": 0.023}, "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [0, 0.96, 0.18]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.25, "height": 0.57, "depth": 0.035, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, -0.16, 0.18], "rotation": [0, 0, 0], "scale": [0.25, 0.57, 0.035]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "tabard", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}}, "material": "cloth", "materialLayers": ["cloth"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "pointed-panel", "kind": "contour", "description": "pointed panel", "evidenceRefs": ["front", "rear"]}, {"id": "gold-edge-binding", "kind": "bevel", "description": "gold edge binding", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 140, 152, 1)", "secondaryAlbedo": "rgba(0, 140, 152, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_tabard_10.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "tabard", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}};
  (nodes["pelvis"] ?? root).add(node_tabard_10);
  nodes["tabard"] = node_tabard_10;
  const mesh_tabard_10Geometry = endpoint_tabard_10
    ? new THREE.CylinderGeometry(endpoint_tabard_10.endRadius, endpoint_tabard_10.baseRadius, endpoint_tabard_10.length, 32, 12)
    : buildExtrudeGeometry({"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1});
  if (!endpoint_tabard_10) {
    mesh_tabard_10Geometry.scale(0.25, 0.57, 0.035);
  }
  const mesh_tabard_10 = new THREE.Mesh(
    mesh_tabard_10Geometry,
    materialMap["cloth"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_tabard_10.name = "Tabard";
  if (endpoint_tabard_10) {
    mesh_tabard_10.position.copy(endpoint_tabard_10.midpoint);
    mesh_tabard_10.quaternion.copy(endpoint_tabard_10.quaternion);
  }
  mesh_tabard_10.castShadow = options.castShadow ?? true;
  mesh_tabard_10.receiveShadow = options.receiveShadow ?? true;
  mesh_tabard_10.userData.sculptComponent = {"id": "tabard", "name": "Tabard", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "tabard", "topY": 1.22, "bottomY": 0.68, "topWidth": 0.24, "bottomWidth": 0.2, "z": 0.19, "foldAmplitude": 0.023}, "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [0, 0.96, 0.18]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.25, "height": 0.57, "depth": 0.035, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, -0.16, 0.18], "rotation": [0, 0, 0], "scale": [0.25, 0.57, 0.035]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "tabard", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}}, "material": "cloth", "materialLayers": ["cloth"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "pointed-panel", "kind": "contour", "description": "pointed panel", "evidenceRefs": ["front", "rear"]}, {"id": "gold-edge-binding", "kind": "bevel", "description": "gold edge binding", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 140, 152, 1)", "secondaryAlbedo": "rgba(0, 140, 152, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_tabard_10.add(mesh_tabard_10);
  meshes["tabard"] = mesh_tabard_10;
  colliders["tabard"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["tabard"] ??= [];
  destructionGroups["tabard"].push(node_tabard_10);

  const endpoint_upper_arm_l_11 = makeAttachmentEndpoint(null);
  const node_upper_arm_l_11 = new THREE.Group();
  node_upper_arm_l_11.name = "Upper Arm L__pivot";
  node_upper_arm_l_11.scale.set(1, 1, 1);
  if (endpoint_upper_arm_l_11) {
    node_upper_arm_l_11.position.copy(endpoint_upper_arm_l_11.start);
    node_upper_arm_l_11.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_upper_arm_l_11.position.set(0.29, 0.23, 0.0);
    node_upper_arm_l_11.rotation.set(0.0, 0.0, 0.0);
  }
  node_upper_arm_l_11.userData.sculptComponent = {"id": "upper-arm-l", "name": "Upper Arm L", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "limb", "start": [0.29, 1.73, 0], "end": [0.4, 1.36, 0.025], "radiusStart": 0.105, "radiusEnd": 0.081}, "referenceAnchor": [0.29, 1.73, 0]}, "parent": "cuirass", "attachment": {"parentSocket": "upper-arm-l-shoulder", "localStart": [0.29, 0.23, 0], "localEnd": [0.4, -0.14, 0.025], "contactType": "rigid-weld", "baseRadius": 0.105, "endRadius": 0.081, "embedDepth": 0.025, "gapTolerance": 0.001, "parentId": "cuirass"}, "dimensions": {"width": 0.2, "height": 0.4, "depth": 0.2, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.29, 0.23, 0], "rotation": [0, 0, 0], "scale": [0.2, 0.4, 0.2]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-arm-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}}, "material": "cloth", "materialLayers": ["cloth"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "elbow-cloth-folds", "kind": "ridge", "description": "elbow cloth folds", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 140, 152, 1)", "secondaryAlbedo": "rgba(0, 140, 152, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_upper_arm_l_11.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-arm-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}};
  (nodes["cuirass"] ?? root).add(node_upper_arm_l_11);
  nodes["upper-arm-l"] = node_upper_arm_l_11;
  const mesh_upper_arm_l_11Geometry = endpoint_upper_arm_l_11
    ? new THREE.CylinderGeometry(endpoint_upper_arm_l_11.endRadius, endpoint_upper_arm_l_11.baseRadius, endpoint_upper_arm_l_11.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_upper_arm_l_11) {
    mesh_upper_arm_l_11Geometry.scale(0.2, 0.4, 0.2);
  }
  const mesh_upper_arm_l_11 = new THREE.Mesh(
    mesh_upper_arm_l_11Geometry,
    materialMap["cloth"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_upper_arm_l_11.name = "Upper Arm L";
  if (endpoint_upper_arm_l_11) {
    mesh_upper_arm_l_11.position.copy(endpoint_upper_arm_l_11.midpoint);
    mesh_upper_arm_l_11.quaternion.copy(endpoint_upper_arm_l_11.quaternion);
  }
  mesh_upper_arm_l_11.castShadow = options.castShadow ?? true;
  mesh_upper_arm_l_11.receiveShadow = options.receiveShadow ?? true;
  mesh_upper_arm_l_11.userData.sculptComponent = {"id": "upper-arm-l", "name": "Upper Arm L", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "limb", "start": [0.29, 1.73, 0], "end": [0.4, 1.36, 0.025], "radiusStart": 0.105, "radiusEnd": 0.081}, "referenceAnchor": [0.29, 1.73, 0]}, "parent": "cuirass", "attachment": {"parentSocket": "upper-arm-l-shoulder", "localStart": [0.29, 0.23, 0], "localEnd": [0.4, -0.14, 0.025], "contactType": "rigid-weld", "baseRadius": 0.105, "endRadius": 0.081, "embedDepth": 0.025, "gapTolerance": 0.001, "parentId": "cuirass"}, "dimensions": {"width": 0.2, "height": 0.4, "depth": 0.2, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.29, 0.23, 0], "rotation": [0, 0, 0], "scale": [0.2, 0.4, 0.2]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-arm-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}}, "material": "cloth", "materialLayers": ["cloth"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "elbow-cloth-folds", "kind": "ridge", "description": "elbow cloth folds", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 140, 152, 1)", "secondaryAlbedo": "rgba(0, 140, 152, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_upper_arm_l_11.add(mesh_upper_arm_l_11);
  meshes["upper-arm-l"] = mesh_upper_arm_l_11;
  colliders["upper-arm-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["upper-arm-l"] ??= [];
  destructionGroups["upper-arm-l"].push(node_upper_arm_l_11);

  const endpoint_forearm_l_12 = makeAttachmentEndpoint(null);
  const node_forearm_l_12 = new THREE.Group();
  node_forearm_l_12.name = "Forearm L__pivot";
  node_forearm_l_12.scale.set(1, 1, 1);
  if (endpoint_forearm_l_12) {
    node_forearm_l_12.position.copy(endpoint_forearm_l_12.start);
    node_forearm_l_12.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_forearm_l_12.position.set(0.145, -0.51, 0.05);
    node_forearm_l_12.rotation.set(0.0, 0.0, 0.0);
  }
  node_forearm_l_12.userData.sculptComponent = {"id": "forearm-l", "name": "Forearm L", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "limb", "start": [0.4, 1.4, 0.025], "end": [0.48, 1.065, 0.06], "radiusStart": 0.083, "radiusEnd": 0.06}, "referenceAnchor": [0.435, 1.22, 0.05]}, "parent": "upper-arm-l", "attachment": null, "dimensions": {"width": 0.16, "height": 0.34, "depth": 0.17, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.145, -0.51, 0.05], "rotation": [0, 0, 0], "scale": [0.16, 0.34, 0.17]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "forearm-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "forearm-taper", "kind": "contour", "description": "forearm taper", "evidenceRefs": ["front", "rear"]}, {"id": "gold-cuff", "kind": "bevel", "description": "gold cuff", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_forearm_l_12.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "forearm-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}};
  (nodes["upper-arm-l"] ?? root).add(node_forearm_l_12);
  nodes["forearm-l"] = node_forearm_l_12;
  const mesh_forearm_l_12Geometry = endpoint_forearm_l_12
    ? new THREE.CylinderGeometry(endpoint_forearm_l_12.endRadius, endpoint_forearm_l_12.baseRadius, endpoint_forearm_l_12.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_forearm_l_12) {
    mesh_forearm_l_12Geometry.scale(0.16, 0.34, 0.17);
  }
  const mesh_forearm_l_12 = new THREE.Mesh(
    mesh_forearm_l_12Geometry,
    materialMap["leather"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_forearm_l_12.name = "Forearm L";
  if (endpoint_forearm_l_12) {
    mesh_forearm_l_12.position.copy(endpoint_forearm_l_12.midpoint);
    mesh_forearm_l_12.quaternion.copy(endpoint_forearm_l_12.quaternion);
  }
  mesh_forearm_l_12.castShadow = options.castShadow ?? true;
  mesh_forearm_l_12.receiveShadow = options.receiveShadow ?? true;
  mesh_forearm_l_12.userData.sculptComponent = {"id": "forearm-l", "name": "Forearm L", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "limb", "start": [0.4, 1.4, 0.025], "end": [0.48, 1.065, 0.06], "radiusStart": 0.083, "radiusEnd": 0.06}, "referenceAnchor": [0.435, 1.22, 0.05]}, "parent": "upper-arm-l", "attachment": null, "dimensions": {"width": 0.16, "height": 0.34, "depth": 0.17, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.145, -0.51, 0.05], "rotation": [0, 0, 0], "scale": [0.16, 0.34, 0.17]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "forearm-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "forearm-taper", "kind": "contour", "description": "forearm taper", "evidenceRefs": ["front", "rear"]}, {"id": "gold-cuff", "kind": "bevel", "description": "gold cuff", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_forearm_l_12.add(mesh_forearm_l_12);
  meshes["forearm-l"] = mesh_forearm_l_12;
  colliders["forearm-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["forearm-l"] ??= [];
  destructionGroups["forearm-l"].push(node_forearm_l_12);

  const endpoint_hand_l_13 = makeAttachmentEndpoint(null);
  const node_hand_l_13 = new THREE.Group();
  node_hand_l_13.name = "Hand L__pivot";
  node_hand_l_13.scale.set(1, 1, 1);
  if (endpoint_hand_l_13) {
    node_hand_l_13.position.copy(endpoint_hand_l_13.start);
    node_hand_l_13.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_hand_l_13.position.set(0.055, -0.205, 0.015);
    node_hand_l_13.rotation.set(0.0, 0.0, 0.0);
  }
  node_hand_l_13.userData.sculptComponent = {"id": "hand-l", "name": "Hand L", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "hand", "side": "l", "palmWidth": 0.094, "fingerLength": 0.064}, "referenceAnchor": [0.49, 1.015, 0.065]}, "parent": "forearm-l", "attachment": null, "dimensions": {"width": 0.12, "height": 0.16, "depth": 0.09, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.055, -0.205, 0.015], "rotation": [0, 0, 0], "scale": [0.12, 0.16, 0.09]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hand-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "separate-finger-grip", "kind": "contour", "description": "separate finger grip", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L0", "colorMaterialRecipe": {"dominantAlbedo": "rgba(207, 150, 100, 1)", "secondaryAlbedo": "rgba(207, 150, 100, 1)", "materialClass": "skin", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_hand_l_13.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hand-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["forearm-l"] ?? root).add(node_hand_l_13);
  nodes["hand-l"] = node_hand_l_13;
  const mesh_hand_l_13Geometry = endpoint_hand_l_13
    ? new THREE.CylinderGeometry(endpoint_hand_l_13.endRadius, endpoint_hand_l_13.baseRadius, endpoint_hand_l_13.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_hand_l_13) {
    mesh_hand_l_13Geometry.scale(0.12, 0.16, 0.09);
  }
  const mesh_hand_l_13 = new THREE.Mesh(
    mesh_hand_l_13Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hand_l_13.name = "Hand L";
  if (endpoint_hand_l_13) {
    mesh_hand_l_13.position.copy(endpoint_hand_l_13.midpoint);
    mesh_hand_l_13.quaternion.copy(endpoint_hand_l_13.quaternion);
  }
  mesh_hand_l_13.castShadow = options.castShadow ?? true;
  mesh_hand_l_13.receiveShadow = options.receiveShadow ?? true;
  mesh_hand_l_13.userData.sculptComponent = {"id": "hand-l", "name": "Hand L", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "hand", "side": "l", "palmWidth": 0.094, "fingerLength": 0.064}, "referenceAnchor": [0.49, 1.015, 0.065]}, "parent": "forearm-l", "attachment": null, "dimensions": {"width": 0.12, "height": 0.16, "depth": 0.09, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.055, -0.205, 0.015], "rotation": [0, 0, 0], "scale": [0.12, 0.16, 0.09]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hand-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "separate-finger-grip", "kind": "contour", "description": "separate finger grip", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L0", "colorMaterialRecipe": {"dominantAlbedo": "rgba(207, 150, 100, 1)", "secondaryAlbedo": "rgba(207, 150, 100, 1)", "materialClass": "skin", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_hand_l_13.add(mesh_hand_l_13);
  meshes["hand-l"] = mesh_hand_l_13;
  colliders["hand-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["hand-l"] ??= [];
  destructionGroups["hand-l"].push(node_hand_l_13);

  const endpoint_pauldron_l_14 = makeAttachmentEndpoint(null);
  const node_pauldron_l_14 = new THREE.Group();
  node_pauldron_l_14.name = "Pauldron L__pivot";
  node_pauldron_l_14.scale.set(1, 1, 1);
  if (endpoint_pauldron_l_14) {
    node_pauldron_l_14.position.copy(endpoint_pauldron_l_14.start);
    node_pauldron_l_14.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pauldron_l_14.position.set(0.295, 0.22, 0.0);
    node_pauldron_l_14.rotation.set(0.0, 0.0, 0.0);
  }
  node_pauldron_l_14.userData.sculptComponent = {"id": "pauldron-l", "name": "Pauldron L", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "pauldron", "side": "l", "radius": 0.155, "layerCount": 3}, "referenceAnchor": [0.295, 1.72, 0]}, "parent": "cuirass", "attachment": null, "dimensions": {"width": 0.3, "height": 0.2, "depth": 0.31, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.295, 0.22, 0], "rotation": [0, 0, 0], "scale": [0.3, 0.2, 0.31]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pauldron-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "compact-dome", "kind": "contour", "description": "compact dome", "evidenceRefs": ["front", "rear"]}, {"id": "layered-gold-lames", "kind": "bevel", "description": "layered gold lames", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(156, 164, 166, 1)", "secondaryAlbedo": "rgba(156, 164, 166, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_pauldron_l_14.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pauldron-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}};
  (nodes["cuirass"] ?? root).add(node_pauldron_l_14);
  nodes["pauldron-l"] = node_pauldron_l_14;
  const mesh_pauldron_l_14Geometry = endpoint_pauldron_l_14
    ? new THREE.CylinderGeometry(endpoint_pauldron_l_14.endRadius, endpoint_pauldron_l_14.baseRadius, endpoint_pauldron_l_14.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_pauldron_l_14) {
    mesh_pauldron_l_14Geometry.scale(0.3, 0.2, 0.31);
  }
  const mesh_pauldron_l_14 = new THREE.Mesh(
    mesh_pauldron_l_14Geometry,
    materialMap["steel"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pauldron_l_14.name = "Pauldron L";
  if (endpoint_pauldron_l_14) {
    mesh_pauldron_l_14.position.copy(endpoint_pauldron_l_14.midpoint);
    mesh_pauldron_l_14.quaternion.copy(endpoint_pauldron_l_14.quaternion);
  }
  mesh_pauldron_l_14.castShadow = options.castShadow ?? true;
  mesh_pauldron_l_14.receiveShadow = options.receiveShadow ?? true;
  mesh_pauldron_l_14.userData.sculptComponent = {"id": "pauldron-l", "name": "Pauldron L", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "pauldron", "side": "l", "radius": 0.155, "layerCount": 3}, "referenceAnchor": [0.295, 1.72, 0]}, "parent": "cuirass", "attachment": null, "dimensions": {"width": 0.3, "height": 0.2, "depth": 0.31, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.295, 0.22, 0], "rotation": [0, 0, 0], "scale": [0.3, 0.2, 0.31]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pauldron-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "compact-dome", "kind": "contour", "description": "compact dome", "evidenceRefs": ["front", "rear"]}, {"id": "layered-gold-lames", "kind": "bevel", "description": "layered gold lames", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(156, 164, 166, 1)", "secondaryAlbedo": "rgba(156, 164, 166, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_pauldron_l_14.add(mesh_pauldron_l_14);
  meshes["pauldron-l"] = mesh_pauldron_l_14;
  colliders["pauldron-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pauldron-l"] ??= [];
  destructionGroups["pauldron-l"].push(node_pauldron_l_14);

  const endpoint_thigh_l_15 = makeAttachmentEndpoint(null);
  const node_thigh_l_15 = new THREE.Group();
  node_thigh_l_15.name = "Thigh L__pivot";
  node_thigh_l_15.scale.set(1, 1, 1);
  if (endpoint_thigh_l_15) {
    node_thigh_l_15.position.copy(endpoint_thigh_l_15.start);
    node_thigh_l_15.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_thigh_l_15.position.set(0.17625, -0.22, 0.0);
    node_thigh_l_15.rotation.set(0.0, 0.0, 0.0);
  }
  node_thigh_l_15.userData.sculptComponent = {"id": "thigh-l", "name": "Thigh L", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "limb", "start": [0.105, 1.12, 0], "end": [0.27, 0.64, 0.01], "radiusStart": 0.115, "radiusEnd": 0.091, "stanceSpread": {"kneeOffset": 0.09, "soleOffset": 0.14, "evidence": "Front boot spread approximately300px versus959px height."}}, "referenceAnchor": [0.17625000000000002, 0.9, 0]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.22, "height": 0.46, "depth": 0.24, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.17625, -0.22, 0], "rotation": [0, 0, 0], "scale": [0.22, 0.46, 0.24]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "thigh-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth-dark"}}, "material": "cloth-dark", "materialLayers": ["cloth-dark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "trouser-folds", "kind": "ridge", "description": "trouser folds", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(7, 67, 74, 1)", "secondaryAlbedo": "rgba(7, 67, 74, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_thigh_l_15.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "thigh-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth-dark"}};
  (nodes["pelvis"] ?? root).add(node_thigh_l_15);
  nodes["thigh-l"] = node_thigh_l_15;
  const mesh_thigh_l_15Geometry = endpoint_thigh_l_15
    ? new THREE.CylinderGeometry(endpoint_thigh_l_15.endRadius, endpoint_thigh_l_15.baseRadius, endpoint_thigh_l_15.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_thigh_l_15) {
    mesh_thigh_l_15Geometry.scale(0.22, 0.46, 0.24);
  }
  const mesh_thigh_l_15 = new THREE.Mesh(
    mesh_thigh_l_15Geometry,
    materialMap["cloth-dark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_thigh_l_15.name = "Thigh L";
  if (endpoint_thigh_l_15) {
    mesh_thigh_l_15.position.copy(endpoint_thigh_l_15.midpoint);
    mesh_thigh_l_15.quaternion.copy(endpoint_thigh_l_15.quaternion);
  }
  mesh_thigh_l_15.castShadow = options.castShadow ?? true;
  mesh_thigh_l_15.receiveShadow = options.receiveShadow ?? true;
  mesh_thigh_l_15.userData.sculptComponent = {"id": "thigh-l", "name": "Thigh L", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "limb", "start": [0.105, 1.12, 0], "end": [0.27, 0.64, 0.01], "radiusStart": 0.115, "radiusEnd": 0.091, "stanceSpread": {"kneeOffset": 0.09, "soleOffset": 0.14, "evidence": "Front boot spread approximately300px versus959px height."}}, "referenceAnchor": [0.17625000000000002, 0.9, 0]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.22, "height": 0.46, "depth": 0.24, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.17625, -0.22, 0], "rotation": [0, 0, 0], "scale": [0.22, 0.46, 0.24]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "thigh-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth-dark"}}, "material": "cloth-dark", "materialLayers": ["cloth-dark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "trouser-folds", "kind": "ridge", "description": "trouser folds", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(7, 67, 74, 1)", "secondaryAlbedo": "rgba(7, 67, 74, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_thigh_l_15.add(mesh_thigh_l_15);
  meshes["thigh-l"] = mesh_thigh_l_15;
  colliders["thigh-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["thigh-l"] ??= [];
  destructionGroups["thigh-l"].push(node_thigh_l_15);

  const endpoint_boot_l_16 = makeAttachmentEndpoint(null);
  const node_boot_l_16 = new THREE.Group();
  node_boot_l_16.name = "Boot L__pivot";
  node_boot_l_16.scale.set(1, 1, 1);
  if (endpoint_boot_l_16) {
    node_boot_l_16.position.copy(endpoint_boot_l_16.start);
    node_boot_l_16.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_boot_l_16.position.set(0.135313, -0.6, 0.025);
    node_boot_l_16.rotation.set(0.0, 0.0, 0.0);
  }
  node_boot_l_16.userData.sculptComponent = {"id": "boot-l", "name": "Boot L", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "boot", "side": "l", "kneeY": 0.64, "ankleY": 0.15, "toeZ": 0.24, "width": 0.19, "stanceSpread": {"kneeOffset": 0.09, "soleOffset": 0.14, "evidence": "Front boot spread approximately300px versus959px height."}}, "referenceAnchor": [0.3115625, 0.3, 0.025]}, "parent": "thigh-l", "attachment": null, "dimensions": {"width": 0.18, "height": 0.6, "depth": 0.19, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.135313, -0.6, 0.025], "rotation": [0, 0, 0], "scale": [0.18, 0.6, 0.19]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "continuous-shaft-instep", "kind": "contour", "description": "continuous shaft instep", "evidenceRefs": ["front", "rear"]}, {"id": "ankle-straps", "kind": "ridge", "description": "ankle straps", "evidenceRefs": ["front", "rear"]}, {"id": "separate-sole", "kind": "seam", "description": "separate sole", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_boot_l_16.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}};
  (nodes["thigh-l"] ?? root).add(node_boot_l_16);
  nodes["boot-l"] = node_boot_l_16;
  const mesh_boot_l_16Geometry = endpoint_boot_l_16
    ? new THREE.CylinderGeometry(endpoint_boot_l_16.endRadius, endpoint_boot_l_16.baseRadius, endpoint_boot_l_16.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_boot_l_16) {
    mesh_boot_l_16Geometry.scale(0.18, 0.6, 0.19);
  }
  const mesh_boot_l_16 = new THREE.Mesh(
    mesh_boot_l_16Geometry,
    materialMap["leather"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_boot_l_16.name = "Boot L";
  if (endpoint_boot_l_16) {
    mesh_boot_l_16.position.copy(endpoint_boot_l_16.midpoint);
    mesh_boot_l_16.quaternion.copy(endpoint_boot_l_16.quaternion);
  }
  mesh_boot_l_16.castShadow = options.castShadow ?? true;
  mesh_boot_l_16.receiveShadow = options.receiveShadow ?? true;
  mesh_boot_l_16.userData.sculptComponent = {"id": "boot-l", "name": "Boot L", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "boot", "side": "l", "kneeY": 0.64, "ankleY": 0.15, "toeZ": 0.24, "width": 0.19, "stanceSpread": {"kneeOffset": 0.09, "soleOffset": 0.14, "evidence": "Front boot spread approximately300px versus959px height."}}, "referenceAnchor": [0.3115625, 0.3, 0.025]}, "parent": "thigh-l", "attachment": null, "dimensions": {"width": 0.18, "height": 0.6, "depth": 0.19, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.135313, -0.6, 0.025], "rotation": [0, 0, 0], "scale": [0.18, 0.6, 0.19]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "continuous-shaft-instep", "kind": "contour", "description": "continuous shaft instep", "evidenceRefs": ["front", "rear"]}, {"id": "ankle-straps", "kind": "ridge", "description": "ankle straps", "evidenceRefs": ["front", "rear"]}, {"id": "separate-sole", "kind": "seam", "description": "separate sole", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_boot_l_16.add(mesh_boot_l_16);
  meshes["boot-l"] = mesh_boot_l_16;
  colliders["boot-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["boot-l"] ??= [];
  destructionGroups["boot-l"].push(node_boot_l_16);

  const endpoint_knee_l_17 = makeAttachmentEndpoint(null);
  const node_knee_l_17 = new THREE.Group();
  node_knee_l_17.name = "Knee L__pivot";
  node_knee_l_17.scale.set(1, 1, 1);
  if (endpoint_knee_l_17) {
    node_knee_l_17.position.copy(endpoint_knee_l_17.start);
    node_knee_l_17.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_knee_l_17.position.set(-0.041563, 0.34, 0.083);
    node_knee_l_17.rotation.set(0.0, 0.0, 0.0);
  }
  node_knee_l_17.userData.sculptComponent = {"id": "knee-l", "name": "Knee L", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [0.27, 0.64, 0.108]}, "parent": "boot-l", "attachment": null, "dimensions": {"width": 0.185, "height": 0.235, "depth": 0.072, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.041563, 0.34, 0.083], "rotation": [0, 0, 0], "scale": [0.185, 0.235, 0.072]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "knee-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "faceted-shield", "kind": "ridge", "description": "faceted shield", "evidenceRefs": ["front", "rear"]}, {"id": "gold-knee-rim", "kind": "bevel", "description": "gold knee rim", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(156, 164, 166, 1)", "secondaryAlbedo": "rgba(156, 164, 166, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_knee_l_17.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "knee-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}};
  (nodes["boot-l"] ?? root).add(node_knee_l_17);
  nodes["knee-l"] = node_knee_l_17;
  const mesh_knee_l_17Geometry = endpoint_knee_l_17
    ? new THREE.CylinderGeometry(endpoint_knee_l_17.endRadius, endpoint_knee_l_17.baseRadius, endpoint_knee_l_17.length, 32, 12)
    : buildExtrudeGeometry({"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1});
  if (!endpoint_knee_l_17) {
    mesh_knee_l_17Geometry.scale(0.185, 0.235, 0.072);
  }
  const mesh_knee_l_17 = new THREE.Mesh(
    mesh_knee_l_17Geometry,
    materialMap["steel"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_knee_l_17.name = "Knee L";
  if (endpoint_knee_l_17) {
    mesh_knee_l_17.position.copy(endpoint_knee_l_17.midpoint);
    mesh_knee_l_17.quaternion.copy(endpoint_knee_l_17.quaternion);
  }
  mesh_knee_l_17.castShadow = options.castShadow ?? true;
  mesh_knee_l_17.receiveShadow = options.receiveShadow ?? true;
  mesh_knee_l_17.userData.sculptComponent = {"id": "knee-l", "name": "Knee L", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [0.27, 0.64, 0.108]}, "parent": "boot-l", "attachment": null, "dimensions": {"width": 0.185, "height": 0.235, "depth": 0.072, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.041563, 0.34, 0.083], "rotation": [0, 0, 0], "scale": [0.185, 0.235, 0.072]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "knee-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "faceted-shield", "kind": "ridge", "description": "faceted shield", "evidenceRefs": ["front", "rear"]}, {"id": "gold-knee-rim", "kind": "bevel", "description": "gold knee rim", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(156, 164, 166, 1)", "secondaryAlbedo": "rgba(156, 164, 166, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_knee_l_17.add(mesh_knee_l_17);
  meshes["knee-l"] = mesh_knee_l_17;
  colliders["knee-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["knee-l"] ??= [];
  destructionGroups["knee-l"].push(node_knee_l_17);

  const endpoint_pouch_l_18 = makeAttachmentEndpoint(null);
  const node_pouch_l_18 = new THREE.Group();
  node_pouch_l_18.name = "Pouch L__pivot";
  node_pouch_l_18.scale.set(1, 1, 1);
  if (endpoint_pouch_l_18) {
    node_pouch_l_18.position.copy(endpoint_pouch_l_18.start);
    node_pouch_l_18.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pouch_l_18.position.set(0.245, 0.0, 0.11);
    node_pouch_l_18.rotation.set(0.0, 0.0, 0.0);
  }
  node_pouch_l_18.userData.sculptComponent = {"id": "pouch-l", "name": "Pouch L", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "assembled-solid", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [0.245, 1.12, 0.11]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.13, "height": 0.19, "depth": 0.09, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.245, 0.0, 0.11], "rotation": [0, 0, 0], "scale": [0.13, 0.19, 0.09]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pouch-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dimensional-flap", "kind": "seam", "description": "dimensional flap", "evidenceRefs": ["front", "rear"]}, {"id": "closure-fastener", "kind": "fastener", "description": "closure fastener", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_pouch_l_18.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pouch-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}};
  (nodes["pelvis"] ?? root).add(node_pouch_l_18);
  nodes["pouch-l"] = node_pouch_l_18;
  const mesh_pouch_l_18Geometry = endpoint_pouch_l_18
    ? new THREE.CylinderGeometry(endpoint_pouch_l_18.endRadius, endpoint_pouch_l_18.baseRadius, endpoint_pouch_l_18.length, 32, 12)
    : buildExtrudeGeometry({"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1});
  if (!endpoint_pouch_l_18) {
    mesh_pouch_l_18Geometry.scale(0.13, 0.19, 0.09);
  }
  const mesh_pouch_l_18 = new THREE.Mesh(
    mesh_pouch_l_18Geometry,
    materialMap["leather"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pouch_l_18.name = "Pouch L";
  if (endpoint_pouch_l_18) {
    mesh_pouch_l_18.position.copy(endpoint_pouch_l_18.midpoint);
    mesh_pouch_l_18.quaternion.copy(endpoint_pouch_l_18.quaternion);
  }
  mesh_pouch_l_18.castShadow = options.castShadow ?? true;
  mesh_pouch_l_18.receiveShadow = options.receiveShadow ?? true;
  mesh_pouch_l_18.userData.sculptComponent = {"id": "pouch-l", "name": "Pouch L", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "assembled-solid", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [0.245, 1.12, 0.11]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.13, "height": 0.19, "depth": 0.09, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.245, 0.0, 0.11], "rotation": [0, 0, 0], "scale": [0.13, 0.19, 0.09]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pouch-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dimensional-flap", "kind": "seam", "description": "dimensional flap", "evidenceRefs": ["front", "rear"]}, {"id": "closure-fastener", "kind": "fastener", "description": "closure fastener", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_pouch_l_18.add(mesh_pouch_l_18);
  meshes["pouch-l"] = mesh_pouch_l_18;
  colliders["pouch-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pouch-l"] ??= [];
  destructionGroups["pouch-l"].push(node_pouch_l_18);

  const endpoint_side_tabard_l_19 = makeAttachmentEndpoint(null);
  const node_side_tabard_l_19 = new THREE.Group();
  node_side_tabard_l_19.name = "Side Tabard L__pivot";
  node_side_tabard_l_19.scale.set(1, 1, 1);
  if (endpoint_side_tabard_l_19) {
    node_side_tabard_l_19.position.copy(endpoint_side_tabard_l_19.start);
    node_side_tabard_l_19.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_side_tabard_l_19.position.set(0.22, -0.115, 0.07);
    node_side_tabard_l_19.rotation.set(0.0, 0.0, 0.0);
  }
  node_side_tabard_l_19.userData.sculptComponent = {"id": "side-tabard-l", "name": "Side Tabard L", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [0.22, 1.005, 0.07]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.2, "height": 0.4, "depth": 0.05, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.22, -0.115, 0.07], "rotation": [0, 0, 0], "scale": [0.2, 0.4, 0.05]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "side-tabard-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}}, "material": "cloth", "materialLayers": ["cloth"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "flared-gold-hem", "kind": "bevel", "description": "flared gold hem", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 140, 152, 1)", "secondaryAlbedo": "rgba(0, 140, 152, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_side_tabard_l_19.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "side-tabard-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}};
  (nodes["pelvis"] ?? root).add(node_side_tabard_l_19);
  nodes["side-tabard-l"] = node_side_tabard_l_19;
  const mesh_side_tabard_l_19Geometry = endpoint_side_tabard_l_19
    ? new THREE.CylinderGeometry(endpoint_side_tabard_l_19.endRadius, endpoint_side_tabard_l_19.baseRadius, endpoint_side_tabard_l_19.length, 32, 12)
    : buildExtrudeGeometry({"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1});
  if (!endpoint_side_tabard_l_19) {
    mesh_side_tabard_l_19Geometry.scale(0.2, 0.4, 0.05);
  }
  const mesh_side_tabard_l_19 = new THREE.Mesh(
    mesh_side_tabard_l_19Geometry,
    materialMap["cloth"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_side_tabard_l_19.name = "Side Tabard L";
  if (endpoint_side_tabard_l_19) {
    mesh_side_tabard_l_19.position.copy(endpoint_side_tabard_l_19.midpoint);
    mesh_side_tabard_l_19.quaternion.copy(endpoint_side_tabard_l_19.quaternion);
  }
  mesh_side_tabard_l_19.castShadow = options.castShadow ?? true;
  mesh_side_tabard_l_19.receiveShadow = options.receiveShadow ?? true;
  mesh_side_tabard_l_19.userData.sculptComponent = {"id": "side-tabard-l", "name": "Side Tabard L", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [0.22, 1.005, 0.07]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.2, "height": 0.4, "depth": 0.05, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.22, -0.115, 0.07], "rotation": [0, 0, 0], "scale": [0.2, 0.4, 0.05]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "side-tabard-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}}, "material": "cloth", "materialLayers": ["cloth"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "flared-gold-hem", "kind": "bevel", "description": "flared gold hem", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 140, 152, 1)", "secondaryAlbedo": "rgba(0, 140, 152, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_side_tabard_l_19.add(mesh_side_tabard_l_19);
  meshes["side-tabard-l"] = mesh_side_tabard_l_19;
  colliders["side-tabard-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["side-tabard-l"] ??= [];
  destructionGroups["side-tabard-l"].push(node_side_tabard_l_19);

  const endpoint_bracer_band_upper_l_20 = makeAttachmentEndpoint(null);
  const node_bracer_band_upper_l_20 = new THREE.Group();
  node_bracer_band_upper_l_20.name = "Bracer Band Upper L__pivot";
  node_bracer_band_upper_l_20.scale.set(1, 1, 1);
  if (endpoint_bracer_band_upper_l_20) {
    node_bracer_band_upper_l_20.position.copy(endpoint_bracer_band_upper_l_20.start);
    node_bracer_band_upper_l_20.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_bracer_band_upper_l_20.position.set(-0.03, 0.155, -0.02);
    node_bracer_band_upper_l_20.rotation.set(0.0, 0.0, 0.0);
  }
  node_bracer_band_upper_l_20.userData.sculptComponent = {"id": "bracer-band-upper-l", "name": "Bracer Band Upper L", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0.405, 1.375, 0.03]}, "parent": "forearm-l", "attachment": null, "dimensions": {"width": 0.18, "height": 0.045, "depth": 0.18, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.03, 0.155, -0.02], "rotation": [0, 0, 0], "scale": [0.18, 0.045, 0.18]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bracer-band-upper-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_bracer_band_upper_l_20.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bracer-band-upper-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}};
  (nodes["forearm-l"] ?? root).add(node_bracer_band_upper_l_20);
  nodes["bracer-band-upper-l"] = node_bracer_band_upper_l_20;
  const mesh_bracer_band_upper_l_20Geometry = endpoint_bracer_band_upper_l_20
    ? new THREE.CylinderGeometry(endpoint_bracer_band_upper_l_20.endRadius, endpoint_bracer_band_upper_l_20.baseRadius, endpoint_bracer_band_upper_l_20.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_bracer_band_upper_l_20) {
    mesh_bracer_band_upper_l_20Geometry.scale(0.18, 0.045, 0.18);
  }
  const mesh_bracer_band_upper_l_20 = new THREE.Mesh(
    mesh_bracer_band_upper_l_20Geometry,
    materialMap["gold"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_bracer_band_upper_l_20.name = "Bracer Band Upper L";
  if (endpoint_bracer_band_upper_l_20) {
    mesh_bracer_band_upper_l_20.position.copy(endpoint_bracer_band_upper_l_20.midpoint);
    mesh_bracer_band_upper_l_20.quaternion.copy(endpoint_bracer_band_upper_l_20.quaternion);
  }
  mesh_bracer_band_upper_l_20.castShadow = options.castShadow ?? true;
  mesh_bracer_band_upper_l_20.receiveShadow = options.receiveShadow ?? true;
  mesh_bracer_band_upper_l_20.userData.sculptComponent = {"id": "bracer-band-upper-l", "name": "Bracer Band Upper L", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0.405, 1.375, 0.03]}, "parent": "forearm-l", "attachment": null, "dimensions": {"width": 0.18, "height": 0.045, "depth": 0.18, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.03, 0.155, -0.02], "rotation": [0, 0, 0], "scale": [0.18, 0.045, 0.18]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bracer-band-upper-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_bracer_band_upper_l_20.add(mesh_bracer_band_upper_l_20);
  meshes["bracer-band-upper-l"] = mesh_bracer_band_upper_l_20;
  colliders["bracer-band-upper-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["bracer-band-upper-l"] ??= [];
  destructionGroups["bracer-band-upper-l"].push(node_bracer_band_upper_l_20);

  const endpoint_bracer_band_lower_l_21 = makeAttachmentEndpoint(null);
  const node_bracer_band_lower_l_21 = new THREE.Group();
  node_bracer_band_lower_l_21.name = "Bracer Band Lower L__pivot";
  node_bracer_band_lower_l_21.scale.set(1, 1, 1);
  if (endpoint_bracer_band_lower_l_21) {
    node_bracer_band_lower_l_21.position.copy(endpoint_bracer_band_lower_l_21.start);
    node_bracer_band_lower_l_21.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_bracer_band_lower_l_21.position.set(0.035, -0.13, -0.02);
    node_bracer_band_lower_l_21.rotation.set(0.0, 0.0, 0.0);
  }
  node_bracer_band_lower_l_21.userData.sculptComponent = {"id": "bracer-band-lower-l", "name": "Bracer Band Lower L", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0.47, 1.09, 0.03]}, "parent": "forearm-l", "attachment": null, "dimensions": {"width": 0.18, "height": 0.045, "depth": 0.18, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.035, -0.13, -0.02], "rotation": [0, 0, 0], "scale": [0.18, 0.045, 0.18]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bracer-band-lower-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_bracer_band_lower_l_21.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bracer-band-lower-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}};
  (nodes["forearm-l"] ?? root).add(node_bracer_band_lower_l_21);
  nodes["bracer-band-lower-l"] = node_bracer_band_lower_l_21;
  const mesh_bracer_band_lower_l_21Geometry = endpoint_bracer_band_lower_l_21
    ? new THREE.CylinderGeometry(endpoint_bracer_band_lower_l_21.endRadius, endpoint_bracer_band_lower_l_21.baseRadius, endpoint_bracer_band_lower_l_21.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_bracer_band_lower_l_21) {
    mesh_bracer_band_lower_l_21Geometry.scale(0.18, 0.045, 0.18);
  }
  const mesh_bracer_band_lower_l_21 = new THREE.Mesh(
    mesh_bracer_band_lower_l_21Geometry,
    materialMap["gold"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_bracer_band_lower_l_21.name = "Bracer Band Lower L";
  if (endpoint_bracer_band_lower_l_21) {
    mesh_bracer_band_lower_l_21.position.copy(endpoint_bracer_band_lower_l_21.midpoint);
    mesh_bracer_band_lower_l_21.quaternion.copy(endpoint_bracer_band_lower_l_21.quaternion);
  }
  mesh_bracer_band_lower_l_21.castShadow = options.castShadow ?? true;
  mesh_bracer_band_lower_l_21.receiveShadow = options.receiveShadow ?? true;
  mesh_bracer_band_lower_l_21.userData.sculptComponent = {"id": "bracer-band-lower-l", "name": "Bracer Band Lower L", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0.47, 1.09, 0.03]}, "parent": "forearm-l", "attachment": null, "dimensions": {"width": 0.18, "height": 0.045, "depth": 0.18, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.035, -0.13, -0.02], "rotation": [0, 0, 0], "scale": [0.18, 0.045, 0.18]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bracer-band-lower-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_bracer_band_lower_l_21.add(mesh_bracer_band_lower_l_21);
  meshes["bracer-band-lower-l"] = mesh_bracer_band_lower_l_21;
  colliders["bracer-band-lower-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["bracer-band-lower-l"] ??= [];
  destructionGroups["bracer-band-lower-l"].push(node_bracer_band_lower_l_21);

  const endpoint_boot_strap_0_l_22 = makeAttachmentEndpoint(null);
  const node_boot_strap_0_l_22 = new THREE.Group();
  node_boot_strap_0_l_22.name = "Boot Strap 0 L__pivot";
  node_boot_strap_0_l_22.scale.set(1, 1, 1);
  if (endpoint_boot_strap_0_l_22) {
    node_boot_strap_0_l_22.position.copy(endpoint_boot_strap_0_l_22.start);
    node_boot_strap_0_l_22.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_boot_strap_0_l_22.position.set(0.010156, -0.13, 0.04);
    node_boot_strap_0_l_22.rotation.set(0.0, 0.0, 0.0);
  }
  node_boot_strap_0_l_22.userData.sculptComponent = {"id": "boot-strap-0-l", "name": "Boot Strap 0 L", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0.32171875, 0.17, 0.065]}, "parent": "boot-l", "attachment": null, "dimensions": {"width": 0.2, "height": 0.035, "depth": 0.21, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.010156, -0.13, 0.04], "rotation": [0, 0, 0], "scale": [0.2, 0.035, 0.21]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-0-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_boot_strap_0_l_22.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-0-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}};
  (nodes["boot-l"] ?? root).add(node_boot_strap_0_l_22);
  nodes["boot-strap-0-l"] = node_boot_strap_0_l_22;
  const mesh_boot_strap_0_l_22Geometry = endpoint_boot_strap_0_l_22
    ? new THREE.CylinderGeometry(endpoint_boot_strap_0_l_22.endRadius, endpoint_boot_strap_0_l_22.baseRadius, endpoint_boot_strap_0_l_22.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_boot_strap_0_l_22) {
    mesh_boot_strap_0_l_22Geometry.scale(0.2, 0.035, 0.21);
  }
  const mesh_boot_strap_0_l_22 = new THREE.Mesh(
    mesh_boot_strap_0_l_22Geometry,
    materialMap["gold"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_boot_strap_0_l_22.name = "Boot Strap 0 L";
  if (endpoint_boot_strap_0_l_22) {
    mesh_boot_strap_0_l_22.position.copy(endpoint_boot_strap_0_l_22.midpoint);
    mesh_boot_strap_0_l_22.quaternion.copy(endpoint_boot_strap_0_l_22.quaternion);
  }
  mesh_boot_strap_0_l_22.castShadow = options.castShadow ?? true;
  mesh_boot_strap_0_l_22.receiveShadow = options.receiveShadow ?? true;
  mesh_boot_strap_0_l_22.userData.sculptComponent = {"id": "boot-strap-0-l", "name": "Boot Strap 0 L", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0.32171875, 0.17, 0.065]}, "parent": "boot-l", "attachment": null, "dimensions": {"width": 0.2, "height": 0.035, "depth": 0.21, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.010156, -0.13, 0.04], "rotation": [0, 0, 0], "scale": [0.2, 0.035, 0.21]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-0-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_boot_strap_0_l_22.add(mesh_boot_strap_0_l_22);
  meshes["boot-strap-0-l"] = mesh_boot_strap_0_l_22;
  colliders["boot-strap-0-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["boot-strap-0-l"] ??= [];
  destructionGroups["boot-strap-0-l"].push(node_boot_strap_0_l_22);

  const endpoint_boot_strap_1_l_23 = makeAttachmentEndpoint(null);
  const node_boot_strap_1_l_23 = new THREE.Group();
  node_boot_strap_1_l_23.name = "Boot Strap 1 L__pivot";
  node_boot_strap_1_l_23.scale.set(1, 1, 1);
  if (endpoint_boot_strap_1_l_23) {
    node_boot_strap_1_l_23.position.copy(endpoint_boot_strap_1_l_23.start);
    node_boot_strap_1_l_23.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_boot_strap_1_l_23.position.set(0.005859, -0.075, 0.04);
    node_boot_strap_1_l_23.rotation.set(0.0, 0.0, 0.0);
  }
  node_boot_strap_1_l_23.userData.sculptComponent = {"id": "boot-strap-1-l", "name": "Boot Strap 1 L", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0.317421875, 0.225, 0.065]}, "parent": "boot-l", "attachment": null, "dimensions": {"width": 0.2, "height": 0.035, "depth": 0.21, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.005859, -0.075, 0.04], "rotation": [0, 0, 0], "scale": [0.2, 0.035, 0.21]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-1-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_boot_strap_1_l_23.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-1-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}};
  (nodes["boot-l"] ?? root).add(node_boot_strap_1_l_23);
  nodes["boot-strap-1-l"] = node_boot_strap_1_l_23;
  const mesh_boot_strap_1_l_23Geometry = endpoint_boot_strap_1_l_23
    ? new THREE.CylinderGeometry(endpoint_boot_strap_1_l_23.endRadius, endpoint_boot_strap_1_l_23.baseRadius, endpoint_boot_strap_1_l_23.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_boot_strap_1_l_23) {
    mesh_boot_strap_1_l_23Geometry.scale(0.2, 0.035, 0.21);
  }
  const mesh_boot_strap_1_l_23 = new THREE.Mesh(
    mesh_boot_strap_1_l_23Geometry,
    materialMap["leather"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_boot_strap_1_l_23.name = "Boot Strap 1 L";
  if (endpoint_boot_strap_1_l_23) {
    mesh_boot_strap_1_l_23.position.copy(endpoint_boot_strap_1_l_23.midpoint);
    mesh_boot_strap_1_l_23.quaternion.copy(endpoint_boot_strap_1_l_23.quaternion);
  }
  mesh_boot_strap_1_l_23.castShadow = options.castShadow ?? true;
  mesh_boot_strap_1_l_23.receiveShadow = options.receiveShadow ?? true;
  mesh_boot_strap_1_l_23.userData.sculptComponent = {"id": "boot-strap-1-l", "name": "Boot Strap 1 L", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0.317421875, 0.225, 0.065]}, "parent": "boot-l", "attachment": null, "dimensions": {"width": 0.2, "height": 0.035, "depth": 0.21, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.005859, -0.075, 0.04], "rotation": [0, 0, 0], "scale": [0.2, 0.035, 0.21]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-1-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_boot_strap_1_l_23.add(mesh_boot_strap_1_l_23);
  meshes["boot-strap-1-l"] = mesh_boot_strap_1_l_23;
  colliders["boot-strap-1-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["boot-strap-1-l"] ??= [];
  destructionGroups["boot-strap-1-l"].push(node_boot_strap_1_l_23);

  const endpoint_boot_strap_2_l_24 = makeAttachmentEndpoint(null);
  const node_boot_strap_2_l_24 = new THREE.Group();
  node_boot_strap_2_l_24.name = "Boot Strap 2 L__pivot";
  node_boot_strap_2_l_24.scale.set(1, 1, 1);
  if (endpoint_boot_strap_2_l_24) {
    node_boot_strap_2_l_24.position.copy(endpoint_boot_strap_2_l_24.start);
    node_boot_strap_2_l_24.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_boot_strap_2_l_24.position.set(0.001562, -0.02, 0.04);
    node_boot_strap_2_l_24.rotation.set(0.0, 0.0, 0.0);
  }
  node_boot_strap_2_l_24.userData.sculptComponent = {"id": "boot-strap-2-l", "name": "Boot Strap 2 L", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0.313125, 0.28, 0.065]}, "parent": "boot-l", "attachment": null, "dimensions": {"width": 0.2, "height": 0.035, "depth": 0.21, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.001562, -0.02, 0.04], "rotation": [0, 0, 0], "scale": [0.2, 0.035, 0.21]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-2-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_boot_strap_2_l_24.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-2-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}};
  (nodes["boot-l"] ?? root).add(node_boot_strap_2_l_24);
  nodes["boot-strap-2-l"] = node_boot_strap_2_l_24;
  const mesh_boot_strap_2_l_24Geometry = endpoint_boot_strap_2_l_24
    ? new THREE.CylinderGeometry(endpoint_boot_strap_2_l_24.endRadius, endpoint_boot_strap_2_l_24.baseRadius, endpoint_boot_strap_2_l_24.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_boot_strap_2_l_24) {
    mesh_boot_strap_2_l_24Geometry.scale(0.2, 0.035, 0.21);
  }
  const mesh_boot_strap_2_l_24 = new THREE.Mesh(
    mesh_boot_strap_2_l_24Geometry,
    materialMap["leather"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_boot_strap_2_l_24.name = "Boot Strap 2 L";
  if (endpoint_boot_strap_2_l_24) {
    mesh_boot_strap_2_l_24.position.copy(endpoint_boot_strap_2_l_24.midpoint);
    mesh_boot_strap_2_l_24.quaternion.copy(endpoint_boot_strap_2_l_24.quaternion);
  }
  mesh_boot_strap_2_l_24.castShadow = options.castShadow ?? true;
  mesh_boot_strap_2_l_24.receiveShadow = options.receiveShadow ?? true;
  mesh_boot_strap_2_l_24.userData.sculptComponent = {"id": "boot-strap-2-l", "name": "Boot Strap 2 L", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0.313125, 0.28, 0.065]}, "parent": "boot-l", "attachment": null, "dimensions": {"width": 0.2, "height": 0.035, "depth": 0.21, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.001562, -0.02, 0.04], "rotation": [0, 0, 0], "scale": [0.2, 0.035, 0.21]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-2-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_boot_strap_2_l_24.add(mesh_boot_strap_2_l_24);
  meshes["boot-strap-2-l"] = mesh_boot_strap_2_l_24;
  colliders["boot-strap-2-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["boot-strap-2-l"] ??= [];
  destructionGroups["boot-strap-2-l"].push(node_boot_strap_2_l_24);

  const endpoint_upper_arm_r_25 = makeAttachmentEndpoint(null);
  const node_upper_arm_r_25 = new THREE.Group();
  node_upper_arm_r_25.name = "Upper Arm R__pivot";
  node_upper_arm_r_25.scale.set(1, 1, 1);
  if (endpoint_upper_arm_r_25) {
    node_upper_arm_r_25.position.copy(endpoint_upper_arm_r_25.start);
    node_upper_arm_r_25.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_upper_arm_r_25.position.set(-0.29, 0.23, 0.0);
    node_upper_arm_r_25.rotation.set(0.0, 0.0, 0.0);
  }
  node_upper_arm_r_25.userData.sculptComponent = {"id": "upper-arm-r", "name": "Upper Arm R", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "limb", "start": [-0.29, 1.73, 0], "end": [-0.4, 1.36, 0.025], "radiusStart": 0.105, "radiusEnd": 0.081}, "referenceAnchor": [-0.29, 1.73, 0]}, "parent": "cuirass", "attachment": {"parentSocket": "upper-arm-r-shoulder", "localStart": [-0.29, 0.23, 0], "localEnd": [-0.4, -0.14, 0.025], "contactType": "rigid-weld", "baseRadius": 0.105, "endRadius": 0.081, "embedDepth": 0.025, "gapTolerance": 0.001, "parentId": "cuirass"}, "dimensions": {"width": 0.2, "height": 0.4, "depth": 0.2, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.29, 0.23, 0], "rotation": [0, 0, 0], "scale": [0.2, 0.4, 0.2]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-arm-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}}, "material": "cloth", "materialLayers": ["cloth"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "elbow-cloth-folds", "kind": "ridge", "description": "elbow cloth folds", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 140, 152, 1)", "secondaryAlbedo": "rgba(0, 140, 152, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_upper_arm_r_25.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-arm-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}};
  (nodes["cuirass"] ?? root).add(node_upper_arm_r_25);
  nodes["upper-arm-r"] = node_upper_arm_r_25;
  const mesh_upper_arm_r_25Geometry = endpoint_upper_arm_r_25
    ? new THREE.CylinderGeometry(endpoint_upper_arm_r_25.endRadius, endpoint_upper_arm_r_25.baseRadius, endpoint_upper_arm_r_25.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_upper_arm_r_25) {
    mesh_upper_arm_r_25Geometry.scale(0.2, 0.4, 0.2);
  }
  const mesh_upper_arm_r_25 = new THREE.Mesh(
    mesh_upper_arm_r_25Geometry,
    materialMap["cloth"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_upper_arm_r_25.name = "Upper Arm R";
  if (endpoint_upper_arm_r_25) {
    mesh_upper_arm_r_25.position.copy(endpoint_upper_arm_r_25.midpoint);
    mesh_upper_arm_r_25.quaternion.copy(endpoint_upper_arm_r_25.quaternion);
  }
  mesh_upper_arm_r_25.castShadow = options.castShadow ?? true;
  mesh_upper_arm_r_25.receiveShadow = options.receiveShadow ?? true;
  mesh_upper_arm_r_25.userData.sculptComponent = {"id": "upper-arm-r", "name": "Upper Arm R", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "limb", "start": [-0.29, 1.73, 0], "end": [-0.4, 1.36, 0.025], "radiusStart": 0.105, "radiusEnd": 0.081}, "referenceAnchor": [-0.29, 1.73, 0]}, "parent": "cuirass", "attachment": {"parentSocket": "upper-arm-r-shoulder", "localStart": [-0.29, 0.23, 0], "localEnd": [-0.4, -0.14, 0.025], "contactType": "rigid-weld", "baseRadius": 0.105, "endRadius": 0.081, "embedDepth": 0.025, "gapTolerance": 0.001, "parentId": "cuirass"}, "dimensions": {"width": 0.2, "height": 0.4, "depth": 0.2, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.29, 0.23, 0], "rotation": [0, 0, 0], "scale": [0.2, 0.4, 0.2]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-arm-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}}, "material": "cloth", "materialLayers": ["cloth"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "elbow-cloth-folds", "kind": "ridge", "description": "elbow cloth folds", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 140, 152, 1)", "secondaryAlbedo": "rgba(0, 140, 152, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_upper_arm_r_25.add(mesh_upper_arm_r_25);
  meshes["upper-arm-r"] = mesh_upper_arm_r_25;
  colliders["upper-arm-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["upper-arm-r"] ??= [];
  destructionGroups["upper-arm-r"].push(node_upper_arm_r_25);

  const endpoint_forearm_r_26 = makeAttachmentEndpoint(null);
  const node_forearm_r_26 = new THREE.Group();
  node_forearm_r_26.name = "Forearm R__pivot";
  node_forearm_r_26.scale.set(1, 1, 1);
  if (endpoint_forearm_r_26) {
    node_forearm_r_26.position.copy(endpoint_forearm_r_26.start);
    node_forearm_r_26.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_forearm_r_26.position.set(-0.145, -0.51, 0.05);
    node_forearm_r_26.rotation.set(0.0, 0.0, 0.0);
  }
  node_forearm_r_26.userData.sculptComponent = {"id": "forearm-r", "name": "Forearm R", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "limb", "start": [-0.4, 1.4, 0.025], "end": [-0.48, 1.065, 0.06], "radiusStart": 0.083, "radiusEnd": 0.06}, "referenceAnchor": [-0.435, 1.22, 0.05]}, "parent": "upper-arm-r", "attachment": null, "dimensions": {"width": 0.16, "height": 0.34, "depth": 0.17, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.145, -0.51, 0.05], "rotation": [0, 0, 0], "scale": [0.16, 0.34, 0.17]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "forearm-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "forearm-taper", "kind": "contour", "description": "forearm taper", "evidenceRefs": ["front", "rear"]}, {"id": "gold-cuff", "kind": "bevel", "description": "gold cuff", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_forearm_r_26.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "forearm-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}};
  (nodes["upper-arm-r"] ?? root).add(node_forearm_r_26);
  nodes["forearm-r"] = node_forearm_r_26;
  const mesh_forearm_r_26Geometry = endpoint_forearm_r_26
    ? new THREE.CylinderGeometry(endpoint_forearm_r_26.endRadius, endpoint_forearm_r_26.baseRadius, endpoint_forearm_r_26.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_forearm_r_26) {
    mesh_forearm_r_26Geometry.scale(0.16, 0.34, 0.17);
  }
  const mesh_forearm_r_26 = new THREE.Mesh(
    mesh_forearm_r_26Geometry,
    materialMap["leather"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_forearm_r_26.name = "Forearm R";
  if (endpoint_forearm_r_26) {
    mesh_forearm_r_26.position.copy(endpoint_forearm_r_26.midpoint);
    mesh_forearm_r_26.quaternion.copy(endpoint_forearm_r_26.quaternion);
  }
  mesh_forearm_r_26.castShadow = options.castShadow ?? true;
  mesh_forearm_r_26.receiveShadow = options.receiveShadow ?? true;
  mesh_forearm_r_26.userData.sculptComponent = {"id": "forearm-r", "name": "Forearm R", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "limb", "start": [-0.4, 1.4, 0.025], "end": [-0.48, 1.065, 0.06], "radiusStart": 0.083, "radiusEnd": 0.06}, "referenceAnchor": [-0.435, 1.22, 0.05]}, "parent": "upper-arm-r", "attachment": null, "dimensions": {"width": 0.16, "height": 0.34, "depth": 0.17, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.145, -0.51, 0.05], "rotation": [0, 0, 0], "scale": [0.16, 0.34, 0.17]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "forearm-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "forearm-taper", "kind": "contour", "description": "forearm taper", "evidenceRefs": ["front", "rear"]}, {"id": "gold-cuff", "kind": "bevel", "description": "gold cuff", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_forearm_r_26.add(mesh_forearm_r_26);
  meshes["forearm-r"] = mesh_forearm_r_26;
  colliders["forearm-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["forearm-r"] ??= [];
  destructionGroups["forearm-r"].push(node_forearm_r_26);

  const endpoint_hand_r_27 = makeAttachmentEndpoint(null);
  const node_hand_r_27 = new THREE.Group();
  node_hand_r_27.name = "Hand R__pivot";
  node_hand_r_27.scale.set(1, 1, 1);
  if (endpoint_hand_r_27) {
    node_hand_r_27.position.copy(endpoint_hand_r_27.start);
    node_hand_r_27.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_hand_r_27.position.set(-0.055, -0.205, 0.015);
    node_hand_r_27.rotation.set(0.0, 0.0, 0.0);
  }
  node_hand_r_27.userData.sculptComponent = {"id": "hand-r", "name": "Hand R", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "hand", "side": "r", "palmWidth": 0.094, "fingerLength": 0.064}, "referenceAnchor": [-0.49, 1.015, 0.065]}, "parent": "forearm-r", "attachment": null, "dimensions": {"width": 0.12, "height": 0.16, "depth": 0.09, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.055, -0.205, 0.015], "rotation": [0, 0, 0], "scale": [0.12, 0.16, 0.09]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hand-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "separate-finger-grip", "kind": "contour", "description": "separate finger grip", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L0", "colorMaterialRecipe": {"dominantAlbedo": "rgba(207, 150, 100, 1)", "secondaryAlbedo": "rgba(207, 150, 100, 1)", "materialClass": "skin", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_hand_r_27.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hand-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["forearm-r"] ?? root).add(node_hand_r_27);
  nodes["hand-r"] = node_hand_r_27;
  const mesh_hand_r_27Geometry = endpoint_hand_r_27
    ? new THREE.CylinderGeometry(endpoint_hand_r_27.endRadius, endpoint_hand_r_27.baseRadius, endpoint_hand_r_27.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_hand_r_27) {
    mesh_hand_r_27Geometry.scale(0.12, 0.16, 0.09);
  }
  const mesh_hand_r_27 = new THREE.Mesh(
    mesh_hand_r_27Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hand_r_27.name = "Hand R";
  if (endpoint_hand_r_27) {
    mesh_hand_r_27.position.copy(endpoint_hand_r_27.midpoint);
    mesh_hand_r_27.quaternion.copy(endpoint_hand_r_27.quaternion);
  }
  mesh_hand_r_27.castShadow = options.castShadow ?? true;
  mesh_hand_r_27.receiveShadow = options.receiveShadow ?? true;
  mesh_hand_r_27.userData.sculptComponent = {"id": "hand-r", "name": "Hand R", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "hand", "side": "r", "palmWidth": 0.094, "fingerLength": 0.064}, "referenceAnchor": [-0.49, 1.015, 0.065]}, "parent": "forearm-r", "attachment": null, "dimensions": {"width": 0.12, "height": 0.16, "depth": 0.09, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.055, -0.205, 0.015], "rotation": [0, 0, 0], "scale": [0.12, 0.16, 0.09]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hand-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "separate-finger-grip", "kind": "contour", "description": "separate finger grip", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L0", "colorMaterialRecipe": {"dominantAlbedo": "rgba(207, 150, 100, 1)", "secondaryAlbedo": "rgba(207, 150, 100, 1)", "materialClass": "skin", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_hand_r_27.add(mesh_hand_r_27);
  meshes["hand-r"] = mesh_hand_r_27;
  colliders["hand-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["hand-r"] ??= [];
  destructionGroups["hand-r"].push(node_hand_r_27);

  const endpoint_pauldron_r_28 = makeAttachmentEndpoint(null);
  const node_pauldron_r_28 = new THREE.Group();
  node_pauldron_r_28.name = "Pauldron R__pivot";
  node_pauldron_r_28.scale.set(1, 1, 1);
  if (endpoint_pauldron_r_28) {
    node_pauldron_r_28.position.copy(endpoint_pauldron_r_28.start);
    node_pauldron_r_28.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pauldron_r_28.position.set(-0.295, 0.22, 0.0);
    node_pauldron_r_28.rotation.set(0.0, 0.0, 0.0);
  }
  node_pauldron_r_28.userData.sculptComponent = {"id": "pauldron-r", "name": "Pauldron R", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "pauldron", "side": "r", "radius": 0.155, "layerCount": 3}, "referenceAnchor": [-0.295, 1.72, 0]}, "parent": "cuirass", "attachment": null, "dimensions": {"width": 0.3, "height": 0.2, "depth": 0.31, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.295, 0.22, 0], "rotation": [0, 0, 0], "scale": [0.3, 0.2, 0.31]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pauldron-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "compact-dome", "kind": "contour", "description": "compact dome", "evidenceRefs": ["front", "rear"]}, {"id": "layered-gold-lames", "kind": "bevel", "description": "layered gold lames", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(156, 164, 166, 1)", "secondaryAlbedo": "rgba(156, 164, 166, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_pauldron_r_28.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pauldron-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}};
  (nodes["cuirass"] ?? root).add(node_pauldron_r_28);
  nodes["pauldron-r"] = node_pauldron_r_28;
  const mesh_pauldron_r_28Geometry = endpoint_pauldron_r_28
    ? new THREE.CylinderGeometry(endpoint_pauldron_r_28.endRadius, endpoint_pauldron_r_28.baseRadius, endpoint_pauldron_r_28.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_pauldron_r_28) {
    mesh_pauldron_r_28Geometry.scale(0.3, 0.2, 0.31);
  }
  const mesh_pauldron_r_28 = new THREE.Mesh(
    mesh_pauldron_r_28Geometry,
    materialMap["steel"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pauldron_r_28.name = "Pauldron R";
  if (endpoint_pauldron_r_28) {
    mesh_pauldron_r_28.position.copy(endpoint_pauldron_r_28.midpoint);
    mesh_pauldron_r_28.quaternion.copy(endpoint_pauldron_r_28.quaternion);
  }
  mesh_pauldron_r_28.castShadow = options.castShadow ?? true;
  mesh_pauldron_r_28.receiveShadow = options.receiveShadow ?? true;
  mesh_pauldron_r_28.userData.sculptComponent = {"id": "pauldron-r", "name": "Pauldron R", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "pauldron", "side": "r", "radius": 0.155, "layerCount": 3}, "referenceAnchor": [-0.295, 1.72, 0]}, "parent": "cuirass", "attachment": null, "dimensions": {"width": 0.3, "height": 0.2, "depth": 0.31, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.295, 0.22, 0], "rotation": [0, 0, 0], "scale": [0.3, 0.2, 0.31]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pauldron-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "compact-dome", "kind": "contour", "description": "compact dome", "evidenceRefs": ["front", "rear"]}, {"id": "layered-gold-lames", "kind": "bevel", "description": "layered gold lames", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(156, 164, 166, 1)", "secondaryAlbedo": "rgba(156, 164, 166, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_pauldron_r_28.add(mesh_pauldron_r_28);
  meshes["pauldron-r"] = mesh_pauldron_r_28;
  colliders["pauldron-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pauldron-r"] ??= [];
  destructionGroups["pauldron-r"].push(node_pauldron_r_28);

  const endpoint_thigh_r_29 = makeAttachmentEndpoint(null);
  const node_thigh_r_29 = new THREE.Group();
  node_thigh_r_29.name = "Thigh R__pivot";
  node_thigh_r_29.scale.set(1, 1, 1);
  if (endpoint_thigh_r_29) {
    node_thigh_r_29.position.copy(endpoint_thigh_r_29.start);
    node_thigh_r_29.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_thigh_r_29.position.set(-0.17625, -0.22, 0.0);
    node_thigh_r_29.rotation.set(0.0, 0.0, 0.0);
  }
  node_thigh_r_29.userData.sculptComponent = {"id": "thigh-r", "name": "Thigh R", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "limb", "start": [-0.105, 1.12, 0], "end": [-0.27, 0.64, 0.01], "radiusStart": 0.115, "radiusEnd": 0.091, "stanceSpread": {"kneeOffset": 0.09, "soleOffset": 0.14, "evidence": "Front boot spread approximately300px versus959px height."}}, "referenceAnchor": [-0.17625000000000002, 0.9, 0]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.22, "height": 0.46, "depth": 0.24, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.17625, -0.22, 0], "rotation": [0, 0, 0], "scale": [0.22, 0.46, 0.24]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "thigh-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth-dark"}}, "material": "cloth-dark", "materialLayers": ["cloth-dark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "trouser-folds", "kind": "ridge", "description": "trouser folds", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(7, 67, 74, 1)", "secondaryAlbedo": "rgba(7, 67, 74, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_thigh_r_29.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "thigh-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth-dark"}};
  (nodes["pelvis"] ?? root).add(node_thigh_r_29);
  nodes["thigh-r"] = node_thigh_r_29;
  const mesh_thigh_r_29Geometry = endpoint_thigh_r_29
    ? new THREE.CylinderGeometry(endpoint_thigh_r_29.endRadius, endpoint_thigh_r_29.baseRadius, endpoint_thigh_r_29.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_thigh_r_29) {
    mesh_thigh_r_29Geometry.scale(0.22, 0.46, 0.24);
  }
  const mesh_thigh_r_29 = new THREE.Mesh(
    mesh_thigh_r_29Geometry,
    materialMap["cloth-dark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_thigh_r_29.name = "Thigh R";
  if (endpoint_thigh_r_29) {
    mesh_thigh_r_29.position.copy(endpoint_thigh_r_29.midpoint);
    mesh_thigh_r_29.quaternion.copy(endpoint_thigh_r_29.quaternion);
  }
  mesh_thigh_r_29.castShadow = options.castShadow ?? true;
  mesh_thigh_r_29.receiveShadow = options.receiveShadow ?? true;
  mesh_thigh_r_29.userData.sculptComponent = {"id": "thigh-r", "name": "Thigh R", "level": "macro", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "limb", "start": [-0.105, 1.12, 0], "end": [-0.27, 0.64, 0.01], "radiusStart": 0.115, "radiusEnd": 0.091, "stanceSpread": {"kneeOffset": 0.09, "soleOffset": 0.14, "evidence": "Front boot spread approximately300px versus959px height."}}, "referenceAnchor": [-0.17625000000000002, 0.9, 0]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.22, "height": 0.46, "depth": 0.24, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.17625, -0.22, 0], "rotation": [0, 0, 0], "scale": [0.22, 0.46, 0.24]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "thigh-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth-dark"}}, "material": "cloth-dark", "materialLayers": ["cloth-dark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "trouser-folds", "kind": "ridge", "description": "trouser folds", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(7, 67, 74, 1)", "secondaryAlbedo": "rgba(7, 67, 74, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_thigh_r_29.add(mesh_thigh_r_29);
  meshes["thigh-r"] = mesh_thigh_r_29;
  colliders["thigh-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["thigh-r"] ??= [];
  destructionGroups["thigh-r"].push(node_thigh_r_29);

  const endpoint_boot_r_30 = makeAttachmentEndpoint(null);
  const node_boot_r_30 = new THREE.Group();
  node_boot_r_30.name = "Boot R__pivot";
  node_boot_r_30.scale.set(1, 1, 1);
  if (endpoint_boot_r_30) {
    node_boot_r_30.position.copy(endpoint_boot_r_30.start);
    node_boot_r_30.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_boot_r_30.position.set(-0.135313, -0.6, 0.025);
    node_boot_r_30.rotation.set(0.0, 0.0, 0.0);
  }
  node_boot_r_30.userData.sculptComponent = {"id": "boot-r", "name": "Boot R", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "boot", "side": "r", "kneeY": 0.64, "ankleY": 0.15, "toeZ": 0.24, "width": 0.19, "stanceSpread": {"kneeOffset": 0.09, "soleOffset": 0.14, "evidence": "Front boot spread approximately300px versus959px height."}}, "referenceAnchor": [-0.3115625, 0.3, 0.025]}, "parent": "thigh-r", "attachment": null, "dimensions": {"width": 0.18, "height": 0.6, "depth": 0.19, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.135313, -0.6, 0.025], "rotation": [0, 0, 0], "scale": [0.18, 0.6, 0.19]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "continuous-shaft-instep", "kind": "contour", "description": "continuous shaft instep", "evidenceRefs": ["front", "rear"]}, {"id": "ankle-straps", "kind": "ridge", "description": "ankle straps", "evidenceRefs": ["front", "rear"]}, {"id": "separate-sole", "kind": "seam", "description": "separate sole", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_boot_r_30.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}};
  (nodes["thigh-r"] ?? root).add(node_boot_r_30);
  nodes["boot-r"] = node_boot_r_30;
  const mesh_boot_r_30Geometry = endpoint_boot_r_30
    ? new THREE.CylinderGeometry(endpoint_boot_r_30.endRadius, endpoint_boot_r_30.baseRadius, endpoint_boot_r_30.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_boot_r_30) {
    mesh_boot_r_30Geometry.scale(0.18, 0.6, 0.19);
  }
  const mesh_boot_r_30 = new THREE.Mesh(
    mesh_boot_r_30Geometry,
    materialMap["leather"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_boot_r_30.name = "Boot R";
  if (endpoint_boot_r_30) {
    mesh_boot_r_30.position.copy(endpoint_boot_r_30.midpoint);
    mesh_boot_r_30.quaternion.copy(endpoint_boot_r_30.quaternion);
  }
  mesh_boot_r_30.castShadow = options.castShadow ?? true;
  mesh_boot_r_30.receiveShadow = options.receiveShadow ?? true;
  mesh_boot_r_30.userData.sculptComponent = {"id": "boot-r", "name": "Boot R", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "boot", "side": "r", "kneeY": 0.64, "ankleY": 0.15, "toeZ": 0.24, "width": 0.19, "stanceSpread": {"kneeOffset": 0.09, "soleOffset": 0.14, "evidence": "Front boot spread approximately300px versus959px height."}}, "referenceAnchor": [-0.3115625, 0.3, 0.025]}, "parent": "thigh-r", "attachment": null, "dimensions": {"width": 0.18, "height": 0.6, "depth": 0.19, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.135313, -0.6, 0.025], "rotation": [0, 0, 0], "scale": [0.18, 0.6, 0.19]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "continuous-shaft-instep", "kind": "contour", "description": "continuous shaft instep", "evidenceRefs": ["front", "rear"]}, {"id": "ankle-straps", "kind": "ridge", "description": "ankle straps", "evidenceRefs": ["front", "rear"]}, {"id": "separate-sole", "kind": "seam", "description": "separate sole", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_boot_r_30.add(mesh_boot_r_30);
  meshes["boot-r"] = mesh_boot_r_30;
  colliders["boot-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["boot-r"] ??= [];
  destructionGroups["boot-r"].push(node_boot_r_30);

  const endpoint_knee_r_31 = makeAttachmentEndpoint(null);
  const node_knee_r_31 = new THREE.Group();
  node_knee_r_31.name = "Knee R__pivot";
  node_knee_r_31.scale.set(1, 1, 1);
  if (endpoint_knee_r_31) {
    node_knee_r_31.position.copy(endpoint_knee_r_31.start);
    node_knee_r_31.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_knee_r_31.position.set(0.041563, 0.34, 0.083);
    node_knee_r_31.rotation.set(0.0, 0.0, 0.0);
  }
  node_knee_r_31.userData.sculptComponent = {"id": "knee-r", "name": "Knee R", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [-0.27, 0.64, 0.108]}, "parent": "boot-r", "attachment": null, "dimensions": {"width": 0.185, "height": 0.235, "depth": 0.072, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.041563, 0.34, 0.083], "rotation": [0, 0, 0], "scale": [0.185, 0.235, 0.072]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "knee-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "faceted-shield", "kind": "ridge", "description": "faceted shield", "evidenceRefs": ["front", "rear"]}, {"id": "gold-knee-rim", "kind": "bevel", "description": "gold knee rim", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(156, 164, 166, 1)", "secondaryAlbedo": "rgba(156, 164, 166, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_knee_r_31.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "knee-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}};
  (nodes["boot-r"] ?? root).add(node_knee_r_31);
  nodes["knee-r"] = node_knee_r_31;
  const mesh_knee_r_31Geometry = endpoint_knee_r_31
    ? new THREE.CylinderGeometry(endpoint_knee_r_31.endRadius, endpoint_knee_r_31.baseRadius, endpoint_knee_r_31.length, 32, 12)
    : buildExtrudeGeometry({"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1});
  if (!endpoint_knee_r_31) {
    mesh_knee_r_31Geometry.scale(0.185, 0.235, 0.072);
  }
  const mesh_knee_r_31 = new THREE.Mesh(
    mesh_knee_r_31Geometry,
    materialMap["steel"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_knee_r_31.name = "Knee R";
  if (endpoint_knee_r_31) {
    mesh_knee_r_31.position.copy(endpoint_knee_r_31.midpoint);
    mesh_knee_r_31.quaternion.copy(endpoint_knee_r_31.quaternion);
  }
  mesh_knee_r_31.castShadow = options.castShadow ?? true;
  mesh_knee_r_31.receiveShadow = options.receiveShadow ?? true;
  mesh_knee_r_31.userData.sculptComponent = {"id": "knee-r", "name": "Knee R", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [-0.27, 0.64, 0.108]}, "parent": "boot-r", "attachment": null, "dimensions": {"width": 0.185, "height": 0.235, "depth": 0.072, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.041563, 0.34, 0.083], "rotation": [0, 0, 0], "scale": [0.185, 0.235, 0.072]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "knee-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "faceted-shield", "kind": "ridge", "description": "faceted shield", "evidenceRefs": ["front", "rear"]}, {"id": "gold-knee-rim", "kind": "bevel", "description": "gold knee rim", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(156, 164, 166, 1)", "secondaryAlbedo": "rgba(156, 164, 166, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_knee_r_31.add(mesh_knee_r_31);
  meshes["knee-r"] = mesh_knee_r_31;
  colliders["knee-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["knee-r"] ??= [];
  destructionGroups["knee-r"].push(node_knee_r_31);

  const endpoint_pouch_r_32 = makeAttachmentEndpoint(null);
  const node_pouch_r_32 = new THREE.Group();
  node_pouch_r_32.name = "Pouch R__pivot";
  node_pouch_r_32.scale.set(1, 1, 1);
  if (endpoint_pouch_r_32) {
    node_pouch_r_32.position.copy(endpoint_pouch_r_32.start);
    node_pouch_r_32.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pouch_r_32.position.set(-0.245, 0.0, 0.11);
    node_pouch_r_32.rotation.set(0.0, 0.0, 0.0);
  }
  node_pouch_r_32.userData.sculptComponent = {"id": "pouch-r", "name": "Pouch R", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "assembled-solid", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [-0.245, 1.12, 0.11]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.13, "height": 0.19, "depth": 0.09, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.245, 0.0, 0.11], "rotation": [0, 0, 0], "scale": [0.13, 0.19, 0.09]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pouch-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dimensional-flap", "kind": "seam", "description": "dimensional flap", "evidenceRefs": ["front", "rear"]}, {"id": "closure-fastener", "kind": "fastener", "description": "closure fastener", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_pouch_r_32.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pouch-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}};
  (nodes["pelvis"] ?? root).add(node_pouch_r_32);
  nodes["pouch-r"] = node_pouch_r_32;
  const mesh_pouch_r_32Geometry = endpoint_pouch_r_32
    ? new THREE.CylinderGeometry(endpoint_pouch_r_32.endRadius, endpoint_pouch_r_32.baseRadius, endpoint_pouch_r_32.length, 32, 12)
    : buildExtrudeGeometry({"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1});
  if (!endpoint_pouch_r_32) {
    mesh_pouch_r_32Geometry.scale(0.13, 0.19, 0.09);
  }
  const mesh_pouch_r_32 = new THREE.Mesh(
    mesh_pouch_r_32Geometry,
    materialMap["leather"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pouch_r_32.name = "Pouch R";
  if (endpoint_pouch_r_32) {
    mesh_pouch_r_32.position.copy(endpoint_pouch_r_32.midpoint);
    mesh_pouch_r_32.quaternion.copy(endpoint_pouch_r_32.quaternion);
  }
  mesh_pouch_r_32.castShadow = options.castShadow ?? true;
  mesh_pouch_r_32.receiveShadow = options.receiveShadow ?? true;
  mesh_pouch_r_32.userData.sculptComponent = {"id": "pouch-r", "name": "Pouch R", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "assembled-solid", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [-0.245, 1.12, 0.11]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.13, "height": 0.19, "depth": 0.09, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.245, 0.0, 0.11], "rotation": [0, 0, 0], "scale": [0.13, 0.19, 0.09]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pouch-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dimensional-flap", "kind": "seam", "description": "dimensional flap", "evidenceRefs": ["front", "rear"]}, {"id": "closure-fastener", "kind": "fastener", "description": "closure fastener", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_pouch_r_32.add(mesh_pouch_r_32);
  meshes["pouch-r"] = mesh_pouch_r_32;
  colliders["pouch-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pouch-r"] ??= [];
  destructionGroups["pouch-r"].push(node_pouch_r_32);

  const endpoint_side_tabard_r_33 = makeAttachmentEndpoint(null);
  const node_side_tabard_r_33 = new THREE.Group();
  node_side_tabard_r_33.name = "Side Tabard R__pivot";
  node_side_tabard_r_33.scale.set(1, 1, 1);
  if (endpoint_side_tabard_r_33) {
    node_side_tabard_r_33.position.copy(endpoint_side_tabard_r_33.start);
    node_side_tabard_r_33.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_side_tabard_r_33.position.set(-0.22, -0.115, 0.07);
    node_side_tabard_r_33.rotation.set(0.0, 0.0, 0.0);
  }
  node_side_tabard_r_33.userData.sculptComponent = {"id": "side-tabard-r", "name": "Side Tabard R", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [-0.22, 1.005, 0.07]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.2, "height": 0.4, "depth": 0.05, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.22, -0.115, 0.07], "rotation": [0, 0, 0], "scale": [0.2, 0.4, 0.05]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "side-tabard-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}}, "material": "cloth", "materialLayers": ["cloth"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "flared-gold-hem", "kind": "bevel", "description": "flared gold hem", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 140, 152, 1)", "secondaryAlbedo": "rgba(0, 140, 152, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_side_tabard_r_33.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "side-tabard-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}};
  (nodes["pelvis"] ?? root).add(node_side_tabard_r_33);
  nodes["side-tabard-r"] = node_side_tabard_r_33;
  const mesh_side_tabard_r_33Geometry = endpoint_side_tabard_r_33
    ? new THREE.CylinderGeometry(endpoint_side_tabard_r_33.endRadius, endpoint_side_tabard_r_33.baseRadius, endpoint_side_tabard_r_33.length, 32, 12)
    : buildExtrudeGeometry({"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1});
  if (!endpoint_side_tabard_r_33) {
    mesh_side_tabard_r_33Geometry.scale(0.2, 0.4, 0.05);
  }
  const mesh_side_tabard_r_33 = new THREE.Mesh(
    mesh_side_tabard_r_33Geometry,
    materialMap["cloth"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_side_tabard_r_33.name = "Side Tabard R";
  if (endpoint_side_tabard_r_33) {
    mesh_side_tabard_r_33.position.copy(endpoint_side_tabard_r_33.midpoint);
    mesh_side_tabard_r_33.quaternion.copy(endpoint_side_tabard_r_33.quaternion);
  }
  mesh_side_tabard_r_33.castShadow = options.castShadow ?? true;
  mesh_side_tabard_r_33.receiveShadow = options.receiveShadow ?? true;
  mesh_side_tabard_r_33.userData.sculptComponent = {"id": "side-tabard-r", "name": "Side Tabard R", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [-0.22, 1.005, 0.07]}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.2, "height": 0.4, "depth": 0.05, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.22, -0.115, 0.07], "rotation": [0, 0, 0], "scale": [0.2, 0.4, 0.05]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "side-tabard-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "cloth"}}, "material": "cloth", "materialLayers": ["cloth"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "flared-gold-hem", "kind": "bevel", "description": "flared gold hem", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L4", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 140, 152, 1)", "secondaryAlbedo": "rgba(0, 140, 152, 1)", "materialClass": "fabric", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_side_tabard_r_33.add(mesh_side_tabard_r_33);
  meshes["side-tabard-r"] = mesh_side_tabard_r_33;
  colliders["side-tabard-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["side-tabard-r"] ??= [];
  destructionGroups["side-tabard-r"].push(node_side_tabard_r_33);

  const endpoint_bracer_band_upper_r_34 = makeAttachmentEndpoint(null);
  const node_bracer_band_upper_r_34 = new THREE.Group();
  node_bracer_band_upper_r_34.name = "Bracer Band Upper R__pivot";
  node_bracer_band_upper_r_34.scale.set(1, 1, 1);
  if (endpoint_bracer_band_upper_r_34) {
    node_bracer_band_upper_r_34.position.copy(endpoint_bracer_band_upper_r_34.start);
    node_bracer_band_upper_r_34.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_bracer_band_upper_r_34.position.set(0.03, 0.155, -0.02);
    node_bracer_band_upper_r_34.rotation.set(0.0, 0.0, 0.0);
  }
  node_bracer_band_upper_r_34.userData.sculptComponent = {"id": "bracer-band-upper-r", "name": "Bracer Band Upper R", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [-0.405, 1.375, 0.03]}, "parent": "forearm-r", "attachment": null, "dimensions": {"width": 0.18, "height": 0.045, "depth": 0.18, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.03, 0.155, -0.02], "rotation": [0, 0, 0], "scale": [0.18, 0.045, 0.18]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bracer-band-upper-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_bracer_band_upper_r_34.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bracer-band-upper-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}};
  (nodes["forearm-r"] ?? root).add(node_bracer_band_upper_r_34);
  nodes["bracer-band-upper-r"] = node_bracer_band_upper_r_34;
  const mesh_bracer_band_upper_r_34Geometry = endpoint_bracer_band_upper_r_34
    ? new THREE.CylinderGeometry(endpoint_bracer_band_upper_r_34.endRadius, endpoint_bracer_band_upper_r_34.baseRadius, endpoint_bracer_band_upper_r_34.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_bracer_band_upper_r_34) {
    mesh_bracer_band_upper_r_34Geometry.scale(0.18, 0.045, 0.18);
  }
  const mesh_bracer_band_upper_r_34 = new THREE.Mesh(
    mesh_bracer_band_upper_r_34Geometry,
    materialMap["gold"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_bracer_band_upper_r_34.name = "Bracer Band Upper R";
  if (endpoint_bracer_band_upper_r_34) {
    mesh_bracer_band_upper_r_34.position.copy(endpoint_bracer_band_upper_r_34.midpoint);
    mesh_bracer_band_upper_r_34.quaternion.copy(endpoint_bracer_band_upper_r_34.quaternion);
  }
  mesh_bracer_band_upper_r_34.castShadow = options.castShadow ?? true;
  mesh_bracer_band_upper_r_34.receiveShadow = options.receiveShadow ?? true;
  mesh_bracer_band_upper_r_34.userData.sculptComponent = {"id": "bracer-band-upper-r", "name": "Bracer Band Upper R", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [-0.405, 1.375, 0.03]}, "parent": "forearm-r", "attachment": null, "dimensions": {"width": 0.18, "height": 0.045, "depth": 0.18, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.03, 0.155, -0.02], "rotation": [0, 0, 0], "scale": [0.18, 0.045, 0.18]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bracer-band-upper-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_bracer_band_upper_r_34.add(mesh_bracer_band_upper_r_34);
  meshes["bracer-band-upper-r"] = mesh_bracer_band_upper_r_34;
  colliders["bracer-band-upper-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["bracer-band-upper-r"] ??= [];
  destructionGroups["bracer-band-upper-r"].push(node_bracer_band_upper_r_34);

  const endpoint_bracer_band_lower_r_35 = makeAttachmentEndpoint(null);
  const node_bracer_band_lower_r_35 = new THREE.Group();
  node_bracer_band_lower_r_35.name = "Bracer Band Lower R__pivot";
  node_bracer_band_lower_r_35.scale.set(1, 1, 1);
  if (endpoint_bracer_band_lower_r_35) {
    node_bracer_band_lower_r_35.position.copy(endpoint_bracer_band_lower_r_35.start);
    node_bracer_band_lower_r_35.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_bracer_band_lower_r_35.position.set(-0.035, -0.13, -0.02);
    node_bracer_band_lower_r_35.rotation.set(0.0, 0.0, 0.0);
  }
  node_bracer_band_lower_r_35.userData.sculptComponent = {"id": "bracer-band-lower-r", "name": "Bracer Band Lower R", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [-0.47, 1.09, 0.03]}, "parent": "forearm-r", "attachment": null, "dimensions": {"width": 0.18, "height": 0.045, "depth": 0.18, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.035, -0.13, -0.02], "rotation": [0, 0, 0], "scale": [0.18, 0.045, 0.18]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bracer-band-lower-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_bracer_band_lower_r_35.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bracer-band-lower-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}};
  (nodes["forearm-r"] ?? root).add(node_bracer_band_lower_r_35);
  nodes["bracer-band-lower-r"] = node_bracer_band_lower_r_35;
  const mesh_bracer_band_lower_r_35Geometry = endpoint_bracer_band_lower_r_35
    ? new THREE.CylinderGeometry(endpoint_bracer_band_lower_r_35.endRadius, endpoint_bracer_band_lower_r_35.baseRadius, endpoint_bracer_band_lower_r_35.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_bracer_band_lower_r_35) {
    mesh_bracer_band_lower_r_35Geometry.scale(0.18, 0.045, 0.18);
  }
  const mesh_bracer_band_lower_r_35 = new THREE.Mesh(
    mesh_bracer_band_lower_r_35Geometry,
    materialMap["gold"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_bracer_band_lower_r_35.name = "Bracer Band Lower R";
  if (endpoint_bracer_band_lower_r_35) {
    mesh_bracer_band_lower_r_35.position.copy(endpoint_bracer_band_lower_r_35.midpoint);
    mesh_bracer_band_lower_r_35.quaternion.copy(endpoint_bracer_band_lower_r_35.quaternion);
  }
  mesh_bracer_band_lower_r_35.castShadow = options.castShadow ?? true;
  mesh_bracer_band_lower_r_35.receiveShadow = options.receiveShadow ?? true;
  mesh_bracer_band_lower_r_35.userData.sculptComponent = {"id": "bracer-band-lower-r", "name": "Bracer Band Lower R", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [-0.47, 1.09, 0.03]}, "parent": "forearm-r", "attachment": null, "dimensions": {"width": 0.18, "height": 0.045, "depth": 0.18, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.035, -0.13, -0.02], "rotation": [0, 0, 0], "scale": [0.18, 0.045, 0.18]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bracer-band-lower-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_bracer_band_lower_r_35.add(mesh_bracer_band_lower_r_35);
  meshes["bracer-band-lower-r"] = mesh_bracer_band_lower_r_35;
  colliders["bracer-band-lower-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["bracer-band-lower-r"] ??= [];
  destructionGroups["bracer-band-lower-r"].push(node_bracer_band_lower_r_35);

  const endpoint_boot_strap_0_r_36 = makeAttachmentEndpoint(null);
  const node_boot_strap_0_r_36 = new THREE.Group();
  node_boot_strap_0_r_36.name = "Boot Strap 0 R__pivot";
  node_boot_strap_0_r_36.scale.set(1, 1, 1);
  if (endpoint_boot_strap_0_r_36) {
    node_boot_strap_0_r_36.position.copy(endpoint_boot_strap_0_r_36.start);
    node_boot_strap_0_r_36.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_boot_strap_0_r_36.position.set(-0.010156, -0.13, 0.04);
    node_boot_strap_0_r_36.rotation.set(0.0, 0.0, 0.0);
  }
  node_boot_strap_0_r_36.userData.sculptComponent = {"id": "boot-strap-0-r", "name": "Boot Strap 0 R", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [-0.32171875, 0.17, 0.065]}, "parent": "boot-r", "attachment": null, "dimensions": {"width": 0.2, "height": 0.035, "depth": 0.21, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.010156, -0.13, 0.04], "rotation": [0, 0, 0], "scale": [0.2, 0.035, 0.21]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-0-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_boot_strap_0_r_36.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-0-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}};
  (nodes["boot-r"] ?? root).add(node_boot_strap_0_r_36);
  nodes["boot-strap-0-r"] = node_boot_strap_0_r_36;
  const mesh_boot_strap_0_r_36Geometry = endpoint_boot_strap_0_r_36
    ? new THREE.CylinderGeometry(endpoint_boot_strap_0_r_36.endRadius, endpoint_boot_strap_0_r_36.baseRadius, endpoint_boot_strap_0_r_36.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_boot_strap_0_r_36) {
    mesh_boot_strap_0_r_36Geometry.scale(0.2, 0.035, 0.21);
  }
  const mesh_boot_strap_0_r_36 = new THREE.Mesh(
    mesh_boot_strap_0_r_36Geometry,
    materialMap["gold"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_boot_strap_0_r_36.name = "Boot Strap 0 R";
  if (endpoint_boot_strap_0_r_36) {
    mesh_boot_strap_0_r_36.position.copy(endpoint_boot_strap_0_r_36.midpoint);
    mesh_boot_strap_0_r_36.quaternion.copy(endpoint_boot_strap_0_r_36.quaternion);
  }
  mesh_boot_strap_0_r_36.castShadow = options.castShadow ?? true;
  mesh_boot_strap_0_r_36.receiveShadow = options.receiveShadow ?? true;
  mesh_boot_strap_0_r_36.userData.sculptComponent = {"id": "boot-strap-0-r", "name": "Boot Strap 0 R", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [-0.32171875, 0.17, 0.065]}, "parent": "boot-r", "attachment": null, "dimensions": {"width": 0.2, "height": 0.035, "depth": 0.21, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.010156, -0.13, 0.04], "rotation": [0, 0, 0], "scale": [0.2, 0.035, 0.21]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-0-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_boot_strap_0_r_36.add(mesh_boot_strap_0_r_36);
  meshes["boot-strap-0-r"] = mesh_boot_strap_0_r_36;
  colliders["boot-strap-0-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["boot-strap-0-r"] ??= [];
  destructionGroups["boot-strap-0-r"].push(node_boot_strap_0_r_36);

  const endpoint_boot_strap_1_r_37 = makeAttachmentEndpoint(null);
  const node_boot_strap_1_r_37 = new THREE.Group();
  node_boot_strap_1_r_37.name = "Boot Strap 1 R__pivot";
  node_boot_strap_1_r_37.scale.set(1, 1, 1);
  if (endpoint_boot_strap_1_r_37) {
    node_boot_strap_1_r_37.position.copy(endpoint_boot_strap_1_r_37.start);
    node_boot_strap_1_r_37.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_boot_strap_1_r_37.position.set(-0.005859, -0.075, 0.04);
    node_boot_strap_1_r_37.rotation.set(0.0, 0.0, 0.0);
  }
  node_boot_strap_1_r_37.userData.sculptComponent = {"id": "boot-strap-1-r", "name": "Boot Strap 1 R", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [-0.317421875, 0.225, 0.065]}, "parent": "boot-r", "attachment": null, "dimensions": {"width": 0.2, "height": 0.035, "depth": 0.21, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.005859, -0.075, 0.04], "rotation": [0, 0, 0], "scale": [0.2, 0.035, 0.21]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-1-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_boot_strap_1_r_37.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-1-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}};
  (nodes["boot-r"] ?? root).add(node_boot_strap_1_r_37);
  nodes["boot-strap-1-r"] = node_boot_strap_1_r_37;
  const mesh_boot_strap_1_r_37Geometry = endpoint_boot_strap_1_r_37
    ? new THREE.CylinderGeometry(endpoint_boot_strap_1_r_37.endRadius, endpoint_boot_strap_1_r_37.baseRadius, endpoint_boot_strap_1_r_37.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_boot_strap_1_r_37) {
    mesh_boot_strap_1_r_37Geometry.scale(0.2, 0.035, 0.21);
  }
  const mesh_boot_strap_1_r_37 = new THREE.Mesh(
    mesh_boot_strap_1_r_37Geometry,
    materialMap["leather"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_boot_strap_1_r_37.name = "Boot Strap 1 R";
  if (endpoint_boot_strap_1_r_37) {
    mesh_boot_strap_1_r_37.position.copy(endpoint_boot_strap_1_r_37.midpoint);
    mesh_boot_strap_1_r_37.quaternion.copy(endpoint_boot_strap_1_r_37.quaternion);
  }
  mesh_boot_strap_1_r_37.castShadow = options.castShadow ?? true;
  mesh_boot_strap_1_r_37.receiveShadow = options.receiveShadow ?? true;
  mesh_boot_strap_1_r_37.userData.sculptComponent = {"id": "boot-strap-1-r", "name": "Boot Strap 1 R", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [-0.317421875, 0.225, 0.065]}, "parent": "boot-r", "attachment": null, "dimensions": {"width": 0.2, "height": 0.035, "depth": 0.21, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.005859, -0.075, 0.04], "rotation": [0, 0, 0], "scale": [0.2, 0.035, 0.21]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-1-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_boot_strap_1_r_37.add(mesh_boot_strap_1_r_37);
  meshes["boot-strap-1-r"] = mesh_boot_strap_1_r_37;
  colliders["boot-strap-1-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["boot-strap-1-r"] ??= [];
  destructionGroups["boot-strap-1-r"].push(node_boot_strap_1_r_37);

  const endpoint_boot_strap_2_r_38 = makeAttachmentEndpoint(null);
  const node_boot_strap_2_r_38 = new THREE.Group();
  node_boot_strap_2_r_38.name = "Boot Strap 2 R__pivot";
  node_boot_strap_2_r_38.scale.set(1, 1, 1);
  if (endpoint_boot_strap_2_r_38) {
    node_boot_strap_2_r_38.position.copy(endpoint_boot_strap_2_r_38.start);
    node_boot_strap_2_r_38.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_boot_strap_2_r_38.position.set(-0.001562, -0.02, 0.04);
    node_boot_strap_2_r_38.rotation.set(0.0, 0.0, 0.0);
  }
  node_boot_strap_2_r_38.userData.sculptComponent = {"id": "boot-strap-2-r", "name": "Boot Strap 2 R", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [-0.313125, 0.28, 0.065]}, "parent": "boot-r", "attachment": null, "dimensions": {"width": 0.2, "height": 0.035, "depth": 0.21, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.001562, -0.02, 0.04], "rotation": [0, 0, 0], "scale": [0.2, 0.035, 0.21]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-2-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_boot_strap_2_r_38.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-2-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}};
  (nodes["boot-r"] ?? root).add(node_boot_strap_2_r_38);
  nodes["boot-strap-2-r"] = node_boot_strap_2_r_38;
  const mesh_boot_strap_2_r_38Geometry = endpoint_boot_strap_2_r_38
    ? new THREE.CylinderGeometry(endpoint_boot_strap_2_r_38.endRadius, endpoint_boot_strap_2_r_38.baseRadius, endpoint_boot_strap_2_r_38.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_boot_strap_2_r_38) {
    mesh_boot_strap_2_r_38Geometry.scale(0.2, 0.035, 0.21);
  }
  const mesh_boot_strap_2_r_38 = new THREE.Mesh(
    mesh_boot_strap_2_r_38Geometry,
    materialMap["leather"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_boot_strap_2_r_38.name = "Boot Strap 2 R";
  if (endpoint_boot_strap_2_r_38) {
    mesh_boot_strap_2_r_38.position.copy(endpoint_boot_strap_2_r_38.midpoint);
    mesh_boot_strap_2_r_38.quaternion.copy(endpoint_boot_strap_2_r_38.quaternion);
  }
  mesh_boot_strap_2_r_38.castShadow = options.castShadow ?? true;
  mesh_boot_strap_2_r_38.receiveShadow = options.receiveShadow ?? true;
  mesh_boot_strap_2_r_38.userData.sculptComponent = {"id": "boot-strap-2-r", "name": "Boot Strap 2 R", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [-0.313125, 0.28, 0.065]}, "parent": "boot-r", "attachment": null, "dimensions": {"width": 0.2, "height": 0.035, "depth": 0.21, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.001562, -0.02, 0.04], "rotation": [0, 0, 0], "scale": [0.2, 0.035, 0.21]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "boot-strap-2-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "leather"}}, "material": "leather", "materialLayers": ["leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(103, 64, 31, 1)", "secondaryAlbedo": "rgba(103, 64, 31, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_boot_strap_2_r_38.add(mesh_boot_strap_2_r_38);
  meshes["boot-strap-2-r"] = mesh_boot_strap_2_r_38;
  colliders["boot-strap-2-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["boot-strap-2-r"] ??= [];
  destructionGroups["boot-strap-2-r"].push(node_boot_strap_2_r_38);

  const endpoint_sword_39 = makeAttachmentEndpoint(null);
  const node_sword_39 = new THREE.Group();
  node_sword_39.name = "Sword__pivot";
  node_sword_39.scale.set(1, 1, 1);
  if (endpoint_sword_39) {
    node_sword_39.position.copy(endpoint_sword_39.start);
    node_sword_39.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_sword_39.position.set(-0.12, -0.365, 0.04);
    node_sword_39.rotation.set(0.0, 0.0, 0.0);
  }
  node_sword_39.userData.sculptComponent = {"id": "sword", "name": "Sword", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "sword", "grip": [-0.49, 1.035, 0.075], "tip": [-1.2, 0.09, 0.16], "guardWidth": 0.25, "bladeWidth": 0.09, "bevel": 0.018}, "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [-0.61, 0.65, 0.105]}, "parent": "hand-r", "attachment": null, "dimensions": {"width": 0.075, "height": 0.98, "depth": 0.025, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.12, -0.365, 0.04], "rotation": [0, 0, 0], "scale": [0.075, 0.98, 0.025]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "sword", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "tapered-blade-tip", "kind": "contour", "description": "tapered blade tip", "evidenceRefs": ["front", "rear"]}, {"id": "long-bevel-planes", "kind": "bevel", "description": "long bevel planes", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(156, 164, 166, 1)", "secondaryAlbedo": "rgba(156, 164, 166, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_sword_39.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "sword", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}};
  (nodes["hand-r"] ?? root).add(node_sword_39);
  nodes["sword"] = node_sword_39;
  const mesh_sword_39Geometry = endpoint_sword_39
    ? new THREE.CylinderGeometry(endpoint_sword_39.endRadius, endpoint_sword_39.baseRadius, endpoint_sword_39.length, 32, 12)
    : buildExtrudeGeometry({"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1});
  if (!endpoint_sword_39) {
    mesh_sword_39Geometry.scale(0.075, 0.98, 0.025);
  }
  const mesh_sword_39 = new THREE.Mesh(
    mesh_sword_39Geometry,
    materialMap["steel"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_sword_39.name = "Sword";
  if (endpoint_sword_39) {
    mesh_sword_39.position.copy(endpoint_sword_39.midpoint);
    mesh_sword_39.quaternion.copy(endpoint_sword_39.quaternion);
  }
  mesh_sword_39.castShadow = options.castShadow ?? true;
  mesh_sword_39.receiveShadow = options.receiveShadow ?? true;
  mesh_sword_39.userData.sculptComponent = {"id": "sword", "name": "Sword", "level": "macro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "sword", "grip": [-0.49, 1.035, 0.075], "tip": [-1.2, 0.09, 0.16], "guardWidth": 0.25, "bladeWidth": 0.09, "bevel": 0.018}, "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [-0.61, 0.65, 0.105]}, "parent": "hand-r", "attachment": null, "dimensions": {"width": 0.075, "height": 0.98, "depth": 0.025, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.12, -0.365, 0.04], "rotation": [0, 0, 0], "scale": [0.075, 0.98, 0.025]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "sword", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "steel"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "tapered-blade-tip", "kind": "contour", "description": "tapered blade tip", "evidenceRefs": ["front", "rear"]}, {"id": "long-bevel-planes", "kind": "bevel", "description": "long bevel planes", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(156, 164, 166, 1)", "secondaryAlbedo": "rgba(156, 164, 166, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_sword_39.add(mesh_sword_39);
  meshes["sword"] = mesh_sword_39;
  colliders["sword"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["sword"] ??= [];
  destructionGroups["sword"].push(node_sword_39);

  const endpoint_guard_40 = makeAttachmentEndpoint(null);
  const node_guard_40 = new THREE.Group();
  node_guard_40.name = "Guard__pivot";
  node_guard_40.scale.set(1, 1, 1);
  if (endpoint_guard_40) {
    node_guard_40.position.copy(endpoint_guard_40.start);
    node_guard_40.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_guard_40.position.set(-0.03, -0.105, 0.01);
    node_guard_40.rotation.set(0.0, 0.0, 0.0);
  }
  node_guard_40.userData.sculptComponent = {"id": "guard", "name": "Guard", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "assembled-solid", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [-0.52, 0.91, 0.075]}, "parent": "hand-r", "attachment": null, "dimensions": {"width": 0.26, "height": 0.12, "depth": 0.04, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.03, -0.105, 0.01], "rotation": [0, 0, 0], "scale": [0.26, 0.12, 0.04]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "guard", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "angular-quillons", "kind": "contour", "description": "angular quillons", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_guard_40.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "guard", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}};
  (nodes["hand-r"] ?? root).add(node_guard_40);
  nodes["guard"] = node_guard_40;
  const mesh_guard_40Geometry = endpoint_guard_40
    ? new THREE.CylinderGeometry(endpoint_guard_40.endRadius, endpoint_guard_40.baseRadius, endpoint_guard_40.length, 32, 12)
    : buildExtrudeGeometry({"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1});
  if (!endpoint_guard_40) {
    mesh_guard_40Geometry.scale(0.26, 0.12, 0.04);
  }
  const mesh_guard_40 = new THREE.Mesh(
    mesh_guard_40Geometry,
    materialMap["gold"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_guard_40.name = "Guard";
  if (endpoint_guard_40) {
    mesh_guard_40.position.copy(endpoint_guard_40.midpoint);
    mesh_guard_40.quaternion.copy(endpoint_guard_40.quaternion);
  }
  mesh_guard_40.castShadow = options.castShadow ?? true;
  mesh_guard_40.receiveShadow = options.receiveShadow ?? true;
  mesh_guard_40.userData.sculptComponent = {"id": "guard", "name": "Guard", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "extrude", "topologyClass": "assembled-solid", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.003, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "profile2D": {"points": [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.25], [0, -0.5], [-0.5, -0.25]], "depth": 1}, "referenceAnchor": [-0.52, 0.91, 0.075]}, "parent": "hand-r", "attachment": null, "dimensions": {"width": 0.26, "height": 0.12, "depth": 0.04, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.03, -0.105, 0.01], "rotation": [0, 0, 0], "scale": [0.26, 0.12, 0.04]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "guard", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "angular-quillons", "kind": "contour", "description": "angular quillons", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_guard_40.add(mesh_guard_40);
  meshes["guard"] = mesh_guard_40;
  colliders["guard"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["guard"] ??= [];
  destructionGroups["guard"].push(node_guard_40);

  const endpoint_guard_jewel_41 = makeAttachmentEndpoint(null);
  const node_guard_jewel_41 = new THREE.Group();
  node_guard_jewel_41.name = "Guard Jewel__pivot";
  node_guard_jewel_41.scale.set(1, 1, 1);
  if (endpoint_guard_jewel_41) {
    node_guard_jewel_41.position.copy(endpoint_guard_jewel_41.start);
    node_guard_jewel_41.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_guard_jewel_41.position.set(-0.03, -0.105, 0.035);
    node_guard_jewel_41.rotation.set(0.0, 0.0, 0.0);
  }
  node_guard_jewel_41.userData.sculptComponent = {"id": "guard-jewel", "name": "Guard Jewel", "level": "micro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [-0.52, 0.91, 0.1]}, "parent": "hand-r", "attachment": null, "dimensions": {"width": 0.045, "height": 0.063, "depth": 0.025, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.03, -0.105, 0.035], "rotation": [0, 0, 0], "scale": [0.045, 0.063, 0.025]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "guard-jewel", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "amber"}}, "material": "amber", "materialLayers": ["amber"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "amber-diamond-facets", "kind": "gloss", "description": "amber diamond facets", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(233, 145, 22, 1)", "secondaryAlbedo": "rgba(233, 145, 22, 1)", "materialClass": "glass", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_guard_jewel_41.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "guard-jewel", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "amber"}};
  (nodes["hand-r"] ?? root).add(node_guard_jewel_41);
  nodes["guard-jewel"] = node_guard_jewel_41;
  const mesh_guard_jewel_41Geometry = endpoint_guard_jewel_41
    ? new THREE.CylinderGeometry(endpoint_guard_jewel_41.endRadius, endpoint_guard_jewel_41.baseRadius, endpoint_guard_jewel_41.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_guard_jewel_41) {
    mesh_guard_jewel_41Geometry.scale(0.045, 0.063, 0.025);
  }
  const mesh_guard_jewel_41 = new THREE.Mesh(
    mesh_guard_jewel_41Geometry,
    materialMap["amber"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_guard_jewel_41.name = "Guard Jewel";
  if (endpoint_guard_jewel_41) {
    mesh_guard_jewel_41.position.copy(endpoint_guard_jewel_41.midpoint);
    mesh_guard_jewel_41.quaternion.copy(endpoint_guard_jewel_41.quaternion);
  }
  mesh_guard_jewel_41.castShadow = options.castShadow ?? true;
  mesh_guard_jewel_41.receiveShadow = options.receiveShadow ?? true;
  mesh_guard_jewel_41.userData.sculptComponent = {"id": "guard-jewel", "name": "Guard Jewel", "level": "micro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [-0.52, 0.91, 0.1]}, "parent": "hand-r", "attachment": null, "dimensions": {"width": 0.045, "height": 0.063, "depth": 0.025, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.03, -0.105, 0.035], "rotation": [0, 0, 0], "scale": [0.045, 0.063, 0.025]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "guard-jewel", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "amber"}}, "material": "amber", "materialLayers": ["amber"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "amber-diamond-facets", "kind": "gloss", "description": "amber diamond facets", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(233, 145, 22, 1)", "secondaryAlbedo": "rgba(233, 145, 22, 1)", "materialClass": "glass", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_guard_jewel_41.add(mesh_guard_jewel_41);
  meshes["guard-jewel"] = mesh_guard_jewel_41;
  colliders["guard-jewel"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["guard-jewel"] ??= [];
  destructionGroups["guard-jewel"].push(node_guard_jewel_41);

  const endpoint_clasp_42 = makeAttachmentEndpoint(null);
  const node_clasp_42 = new THREE.Group();
  node_clasp_42.name = "Clasp__pivot";
  node_clasp_42.scale.set(1, 1, 1);
  if (endpoint_clasp_42) {
    node_clasp_42.position.copy(endpoint_clasp_42.start);
    node_clasp_42.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_clasp_42.position.set(0.0, 0.27, 0.19);
    node_clasp_42.rotation.set(0.0, 0.0, 0.0);
  }
  node_clasp_42.userData.sculptComponent = {"id": "clasp", "name": "Clasp", "level": "micro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0, 1.77, 0.19]}, "parent": "cuirass", "attachment": null, "dimensions": {"width": 0.07, "height": 0.082, "depth": 0.025, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.27, 0.19], "rotation": [0, 0, 0], "scale": [0.07, 0.082, 0.025]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "clasp", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "diamond-clasp", "kind": "bevel", "description": "diamond clasp", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_clasp_42.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "clasp", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}};
  (nodes["cuirass"] ?? root).add(node_clasp_42);
  nodes["clasp"] = node_clasp_42;
  const mesh_clasp_42Geometry = endpoint_clasp_42
    ? new THREE.CylinderGeometry(endpoint_clasp_42.endRadius, endpoint_clasp_42.baseRadius, endpoint_clasp_42.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_clasp_42) {
    mesh_clasp_42Geometry.scale(0.07, 0.082, 0.025);
  }
  const mesh_clasp_42 = new THREE.Mesh(
    mesh_clasp_42Geometry,
    materialMap["gold"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_clasp_42.name = "Clasp";
  if (endpoint_clasp_42) {
    mesh_clasp_42.position.copy(endpoint_clasp_42.midpoint);
    mesh_clasp_42.quaternion.copy(endpoint_clasp_42.quaternion);
  }
  mesh_clasp_42.castShadow = options.castShadow ?? true;
  mesh_clasp_42.receiveShadow = options.receiveShadow ?? true;
  mesh_clasp_42.userData.sculptComponent = {"id": "clasp", "name": "Clasp", "level": "micro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0, 1.77, 0.19]}, "parent": "cuirass", "attachment": null, "dimensions": {"width": 0.07, "height": 0.082, "depth": 0.025, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.27, 0.19], "rotation": [0, 0, 0], "scale": [0.07, 0.082, 0.025]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "clasp", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "diamond-clasp", "kind": "bevel", "description": "diamond clasp", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_clasp_42.add(mesh_clasp_42);
  meshes["clasp"] = mesh_clasp_42;
  colliders["clasp"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["clasp"] ??= [];
  destructionGroups["clasp"].push(node_clasp_42);

  const endpoint_buckle_43 = makeAttachmentEndpoint(null);
  const node_buckle_43 = new THREE.Group();
  node_buckle_43.name = "Buckle__pivot";
  node_buckle_43.scale.set(1, 1, 1);
  if (endpoint_buckle_43) {
    node_buckle_43.position.copy(endpoint_buckle_43.start);
    node_buckle_43.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_buckle_43.position.set(0.0, 0.0, 0.17);
    node_buckle_43.rotation.set(0.0, 0.0, 0.0);
  }
  node_buckle_43.userData.sculptComponent = {"id": "buckle", "name": "Buckle", "level": "micro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0, 1.255, 0.19]}, "parent": "belt", "attachment": null, "dimensions": {"width": 0.13, "height": 0.09, "depth": 0.025, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.0, 0.17], "rotation": [0, 0, 0], "scale": [0.13, 0.09, 0.025]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "buckle", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "angular-belt-frame", "kind": "bevel", "description": "angular belt frame", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_buckle_43.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "buckle", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}};
  (nodes["belt"] ?? root).add(node_buckle_43);
  nodes["buckle"] = node_buckle_43;
  const mesh_buckle_43Geometry = endpoint_buckle_43
    ? new THREE.CylinderGeometry(endpoint_buckle_43.endRadius, endpoint_buckle_43.baseRadius, endpoint_buckle_43.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_buckle_43) {
    mesh_buckle_43Geometry.scale(0.13, 0.09, 0.025);
  }
  const mesh_buckle_43 = new THREE.Mesh(
    mesh_buckle_43Geometry,
    materialMap["gold"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_buckle_43.name = "Buckle";
  if (endpoint_buckle_43) {
    mesh_buckle_43.position.copy(endpoint_buckle_43.midpoint);
    mesh_buckle_43.quaternion.copy(endpoint_buckle_43.quaternion);
  }
  mesh_buckle_43.castShadow = options.castShadow ?? true;
  mesh_buckle_43.receiveShadow = options.receiveShadow ?? true;
  mesh_buckle_43.userData.sculptComponent = {"id": "buckle", "name": "Buckle", "level": "micro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0, 1.255, 0.19]}, "parent": "belt", "attachment": null, "dimensions": {"width": 0.13, "height": 0.09, "depth": 0.025, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.0, 0.17], "rotation": [0, 0, 0], "scale": [0.13, 0.09, 0.025]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "buckle", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "gold"}}, "material": "gold", "materialLayers": ["gold"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "angular-belt-frame", "kind": "bevel", "description": "angular belt frame", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 149, 59, 1)", "secondaryAlbedo": "rgba(201, 149, 59, 1)", "materialClass": "metal", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_buckle_43.add(mesh_buckle_43);
  meshes["buckle"] = mesh_buckle_43;
  colliders["buckle"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["buckle"] ??= [];
  destructionGroups["buckle"].push(node_buckle_43);

  const endpoint_eye_l_44 = makeAttachmentEndpoint(null);
  const node_eye_l_44 = new THREE.Group();
  node_eye_l_44.name = "Eye L__pivot";
  node_eye_l_44.scale.set(1, 1, 1);
  if (endpoint_eye_l_44) {
    node_eye_l_44.position.copy(endpoint_eye_l_44.start);
    node_eye_l_44.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_eye_l_44.position.set(0.042, 0.026, 0.097);
    node_eye_l_44.rotation.set(0.0, 0.0, 0.0);
  }
  node_eye_l_44.userData.sculptComponent = {"id": "eye-l", "name": "Eye L", "level": "micro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0.042, 2.032, 0.112]}, "parent": "head", "attachment": null, "dimensions": {"width": 0.04, "height": 0.019, "depth": 0.016, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.042, 0.026, 0.097], "rotation": [0, 0, 0], "scale": [0.04, 0.019, 0.016]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "eye"}}, "material": "eye", "materialLayers": ["eye"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "recessed-eye", "kind": "gloss", "description": "recessed eye", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(187, 190, 160, 1)", "secondaryAlbedo": "rgba(187, 190, 160, 1)", "materialClass": "glass", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_eye_l_44.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "eye"}};
  (nodes["head"] ?? root).add(node_eye_l_44);
  nodes["eye-l"] = node_eye_l_44;
  const mesh_eye_l_44Geometry = endpoint_eye_l_44
    ? new THREE.CylinderGeometry(endpoint_eye_l_44.endRadius, endpoint_eye_l_44.baseRadius, endpoint_eye_l_44.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_eye_l_44) {
    mesh_eye_l_44Geometry.scale(0.04, 0.019, 0.016);
  }
  const mesh_eye_l_44 = new THREE.Mesh(
    mesh_eye_l_44Geometry,
    materialMap["eye"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_eye_l_44.name = "Eye L";
  if (endpoint_eye_l_44) {
    mesh_eye_l_44.position.copy(endpoint_eye_l_44.midpoint);
    mesh_eye_l_44.quaternion.copy(endpoint_eye_l_44.quaternion);
  }
  mesh_eye_l_44.castShadow = options.castShadow ?? true;
  mesh_eye_l_44.receiveShadow = options.receiveShadow ?? true;
  mesh_eye_l_44.userData.sculptComponent = {"id": "eye-l", "name": "Eye L", "level": "micro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0.042, 2.032, 0.112]}, "parent": "head", "attachment": null, "dimensions": {"width": 0.04, "height": 0.019, "depth": 0.016, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.042, 0.026, 0.097], "rotation": [0, 0, 0], "scale": [0.04, 0.019, 0.016]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "eye"}}, "material": "eye", "materialLayers": ["eye"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "recessed-eye", "kind": "gloss", "description": "recessed eye", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(187, 190, 160, 1)", "secondaryAlbedo": "rgba(187, 190, 160, 1)", "materialClass": "glass", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_eye_l_44.add(mesh_eye_l_44);
  meshes["eye-l"] = mesh_eye_l_44;
  colliders["eye-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["eye-l"] ??= [];
  destructionGroups["eye-l"].push(node_eye_l_44);

  const endpoint_brow_l_45 = makeAttachmentEndpoint(null);
  const node_brow_l_45 = new THREE.Group();
  node_brow_l_45.name = "Brow L__pivot";
  node_brow_l_45.scale.set(1, 1, 1);
  if (endpoint_brow_l_45) {
    node_brow_l_45.position.copy(endpoint_brow_l_45.start);
    node_brow_l_45.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_brow_l_45.position.set(0.043, 0.046, 0.102);
    node_brow_l_45.rotation.set(0.0, 0.0, 0.0);
  }
  node_brow_l_45.userData.sculptComponent = {"id": "brow-l", "name": "Brow L", "level": "micro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0.043, 2.052, 0.117]}, "parent": "head", "attachment": null, "dimensions": {"width": 0.047, "height": 0.012, "depth": 0.012, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.043, 0.046, 0.102], "rotation": [0, 0, 0], "scale": [0.047, 0.012, 0.012]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brow-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}}, "material": "hair", "materialLayers": ["hair"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "tapered-dark-brow", "kind": "contour", "description": "tapered dark brow", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(53, 32, 17, 1)", "secondaryAlbedo": "rgba(53, 32, 17, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_brow_l_45.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brow-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}};
  (nodes["head"] ?? root).add(node_brow_l_45);
  nodes["brow-l"] = node_brow_l_45;
  const mesh_brow_l_45Geometry = endpoint_brow_l_45
    ? new THREE.CylinderGeometry(endpoint_brow_l_45.endRadius, endpoint_brow_l_45.baseRadius, endpoint_brow_l_45.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_brow_l_45) {
    mesh_brow_l_45Geometry.scale(0.047, 0.012, 0.012);
  }
  const mesh_brow_l_45 = new THREE.Mesh(
    mesh_brow_l_45Geometry,
    materialMap["hair"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_brow_l_45.name = "Brow L";
  if (endpoint_brow_l_45) {
    mesh_brow_l_45.position.copy(endpoint_brow_l_45.midpoint);
    mesh_brow_l_45.quaternion.copy(endpoint_brow_l_45.quaternion);
  }
  mesh_brow_l_45.castShadow = options.castShadow ?? true;
  mesh_brow_l_45.receiveShadow = options.receiveShadow ?? true;
  mesh_brow_l_45.userData.sculptComponent = {"id": "brow-l", "name": "Brow L", "level": "micro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [0.043, 2.052, 0.117]}, "parent": "head", "attachment": null, "dimensions": {"width": 0.047, "height": 0.012, "depth": 0.012, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.043, 0.046, 0.102], "rotation": [0, 0, 0], "scale": [0.047, 0.012, 0.012]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brow-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}}, "material": "hair", "materialLayers": ["hair"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "tapered-dark-brow", "kind": "contour", "description": "tapered dark brow", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(53, 32, 17, 1)", "secondaryAlbedo": "rgba(53, 32, 17, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_brow_l_45.add(mesh_brow_l_45);
  meshes["brow-l"] = mesh_brow_l_45;
  colliders["brow-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["brow-l"] ??= [];
  destructionGroups["brow-l"].push(node_brow_l_45);

  const endpoint_eye_r_46 = makeAttachmentEndpoint(null);
  const node_eye_r_46 = new THREE.Group();
  node_eye_r_46.name = "Eye R__pivot";
  node_eye_r_46.scale.set(1, 1, 1);
  if (endpoint_eye_r_46) {
    node_eye_r_46.position.copy(endpoint_eye_r_46.start);
    node_eye_r_46.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_eye_r_46.position.set(-0.042, 0.026, 0.097);
    node_eye_r_46.rotation.set(0.0, 0.0, 0.0);
  }
  node_eye_r_46.userData.sculptComponent = {"id": "eye-r", "name": "Eye R", "level": "micro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [-0.042, 2.032, 0.112]}, "parent": "head", "attachment": null, "dimensions": {"width": 0.04, "height": 0.019, "depth": 0.016, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.042, 0.026, 0.097], "rotation": [0, 0, 0], "scale": [0.04, 0.019, 0.016]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "eye"}}, "material": "eye", "materialLayers": ["eye"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "recessed-eye", "kind": "gloss", "description": "recessed eye", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(187, 190, 160, 1)", "secondaryAlbedo": "rgba(187, 190, 160, 1)", "materialClass": "glass", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_eye_r_46.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "eye"}};
  (nodes["head"] ?? root).add(node_eye_r_46);
  nodes["eye-r"] = node_eye_r_46;
  const mesh_eye_r_46Geometry = endpoint_eye_r_46
    ? new THREE.CylinderGeometry(endpoint_eye_r_46.endRadius, endpoint_eye_r_46.baseRadius, endpoint_eye_r_46.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_eye_r_46) {
    mesh_eye_r_46Geometry.scale(0.04, 0.019, 0.016);
  }
  const mesh_eye_r_46 = new THREE.Mesh(
    mesh_eye_r_46Geometry,
    materialMap["eye"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_eye_r_46.name = "Eye R";
  if (endpoint_eye_r_46) {
    mesh_eye_r_46.position.copy(endpoint_eye_r_46.midpoint);
    mesh_eye_r_46.quaternion.copy(endpoint_eye_r_46.quaternion);
  }
  mesh_eye_r_46.castShadow = options.castShadow ?? true;
  mesh_eye_r_46.receiveShadow = options.receiveShadow ?? true;
  mesh_eye_r_46.userData.sculptComponent = {"id": "eye-r", "name": "Eye R", "level": "micro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [-0.042, 2.032, 0.112]}, "parent": "head", "attachment": null, "dimensions": {"width": 0.04, "height": 0.019, "depth": 0.016, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.042, 0.026, 0.097], "rotation": [0, 0, 0], "scale": [0.04, 0.019, 0.016]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "eye"}}, "material": "eye", "materialLayers": ["eye"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "recessed-eye", "kind": "gloss", "description": "recessed eye", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(187, 190, 160, 1)", "secondaryAlbedo": "rgba(187, 190, 160, 1)", "materialClass": "glass", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_eye_r_46.add(mesh_eye_r_46);
  meshes["eye-r"] = mesh_eye_r_46;
  colliders["eye-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["eye-r"] ??= [];
  destructionGroups["eye-r"].push(node_eye_r_46);

  const endpoint_brow_r_47 = makeAttachmentEndpoint(null);
  const node_brow_r_47 = new THREE.Group();
  node_brow_r_47.name = "Brow R__pivot";
  node_brow_r_47.scale.set(1, 1, 1);
  if (endpoint_brow_r_47) {
    node_brow_r_47.position.copy(endpoint_brow_r_47.start);
    node_brow_r_47.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_brow_r_47.position.set(-0.043, 0.046, 0.102);
    node_brow_r_47.rotation.set(0.0, 0.0, 0.0);
  }
  node_brow_r_47.userData.sculptComponent = {"id": "brow-r", "name": "Brow R", "level": "micro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [-0.043, 2.052, 0.117]}, "parent": "head", "attachment": null, "dimensions": {"width": 0.047, "height": 0.012, "depth": 0.012, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.043, 0.046, 0.102], "rotation": [0, 0, 0], "scale": [0.047, 0.012, 0.012]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brow-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}}, "material": "hair", "materialLayers": ["hair"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "tapered-dark-brow", "kind": "contour", "description": "tapered dark brow", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(53, 32, 17, 1)", "secondaryAlbedo": "rgba(53, 32, 17, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_brow_r_47.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brow-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}};
  (nodes["head"] ?? root).add(node_brow_r_47);
  nodes["brow-r"] = node_brow_r_47;
  const mesh_brow_r_47Geometry = endpoint_brow_r_47
    ? new THREE.CylinderGeometry(endpoint_brow_r_47.endRadius, endpoint_brow_r_47.baseRadius, endpoint_brow_r_47.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_brow_r_47) {
    mesh_brow_r_47Geometry.scale(0.047, 0.012, 0.012);
  }
  const mesh_brow_r_47 = new THREE.Mesh(
    mesh_brow_r_47Geometry,
    materialMap["hair"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_brow_r_47.name = "Brow R";
  if (endpoint_brow_r_47) {
    mesh_brow_r_47.position.copy(endpoint_brow_r_47.midpoint);
    mesh_brow_r_47.quaternion.copy(endpoint_brow_r_47.quaternion);
  }
  mesh_brow_r_47.castShadow = options.castShadow ?? true;
  mesh_brow_r_47.receiveShadow = options.receiveShadow ?? true;
  mesh_brow_r_47.userData.sculptComponent = {"id": "brow-r", "name": "Brow R", "level": "micro", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "referenceAnchor": [-0.043, 2.052, 0.117]}, "parent": "head", "attachment": null, "dimensions": {"width": 0.047, "height": 0.012, "depth": 0.012, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.043, 0.046, 0.102], "rotation": [0, 0, 0], "scale": [0.047, 0.012, 0.012]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brow-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}}, "material": "hair", "materialLayers": ["hair"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "tapered-dark-brow", "kind": "contour", "description": "tapered dark brow", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(53, 32, 17, 1)", "secondaryAlbedo": "rgba(53, 32, 17, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_brow_r_47.add(mesh_brow_r_47);
  meshes["brow-r"] = mesh_brow_r_47;
  colliders["brow-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["brow-r"] ??= [];
  destructionGroups["brow-r"].push(node_brow_r_47);

  const endpoint_hair_48 = makeAttachmentEndpoint(null);
  const node_hair_48 = new THREE.Group();
  node_hair_48.name = "Hair__pivot";
  node_hair_48.scale.set(1, 1, 1);
  if (endpoint_hair_48) {
    node_hair_48.position.copy(endpoint_hair_48.start);
    node_hair_48.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_hair_48.position.set(0.0, 0.094, -0.017);
    node_hair_48.rotation.set(0.0, 0.0, 0.0);
  }
  node_hair_48.userData.sculptComponent = {"id": "hair", "name": "Hair", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "hair", "scalpUVRoots": [[0.38, 0.18], [0.45, 0.12], [0.56, 0.13], [0.63, 0.2], [0.31, 0.31], [0.7, 0.33]], "rootEmbedDepth": 0.009, "standProud": 0.004, "lockCount": 6}, "referenceAnchor": [0, 2.1, -0.002]}, "parent": "head", "attachment": null, "dimensions": {"width": 0.205, "height": 0.13, "depth": 0.22, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.094, -0.017], "rotation": [0, 0, 0], "scale": [0.205, 0.13, 0.22]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hair", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}}, "material": "hair", "materialLayers": ["hair"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "parted-root-mass", "kind": "contour", "description": "parted root mass", "evidenceRefs": ["front", "rear"]}, {"id": "swept-bangs", "kind": "ridge", "description": "swept bangs", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(53, 32, 17, 1)", "secondaryAlbedo": "rgba(53, 32, 17, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_hair_48.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hair", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}};
  (nodes["head"] ?? root).add(node_hair_48);
  nodes["hair"] = node_hair_48;
  const mesh_hair_48Geometry = endpoint_hair_48
    ? new THREE.CylinderGeometry(endpoint_hair_48.endRadius, endpoint_hair_48.baseRadius, endpoint_hair_48.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  if (!endpoint_hair_48) {
    mesh_hair_48Geometry.scale(0.205, 0.13, 0.22);
  }
  const mesh_hair_48 = new THREE.Mesh(
    mesh_hair_48Geometry,
    materialMap["hair"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hair_48.name = "Hair";
  if (endpoint_hair_48) {
    mesh_hair_48.position.copy(endpoint_hair_48.midpoint);
    mesh_hair_48.quaternion.copy(endpoint_hair_48.quaternion);
  }
  mesh_hair_48.castShadow = options.castShadow ?? true;
  mesh_hair_48.receiveShadow = options.receiveShadow ?? true;
  mesh_hair_48.userData.sculptComponent = {"id": "hair", "name": "Hair", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "Continuous shaped reference contour; discrete shells overlap at anatomical attachments.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "heroSurface": {"kind": "hair", "scalpUVRoots": [[0.38, 0.18], [0.45, 0.12], [0.56, 0.13], [0.63, 0.2], [0.31, 0.31], [0.7, 0.33]], "rootEmbedDepth": 0.009, "standProud": 0.004, "lockCount": 6}, "referenceAnchor": [0, 2.1, -0.002]}, "parent": "head", "attachment": null, "dimensions": {"width": 0.205, "height": 0.13, "depth": 0.22, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.094, -0.017], "rotation": [0, 0, 0], "scale": [0.205, 0.13, 0.22]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hair", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}}, "material": "hair", "materialLayers": ["hair"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "parted-root-mass", "kind": "contour", "description": "parted root mass", "evidenceRefs": ["front", "rear"]}, {"id": "swept-bangs", "kind": "ridge", "description": "swept bangs", "evidenceRefs": ["front", "rear"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["front", "rear"], "details": [], "fidelityTier": "blockout", "primaryGeometryLayer": "L3", "colorMaterialRecipe": {"dominantAlbedo": "rgba(53, 32, 17, 1)", "secondaryAlbedo": "rgba(53, 32, 17, 1)", "materialClass": "unknown", "materialClassConfidence": 0.85, "evidenceRefs": ["front", "rear"]}};
  node_hair_48.add(mesh_hair_48);
  meshes["hair"] = mesh_hair_48;
  colliders["hair"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["hair"] ??= [];
  destructionGroups["hair"].push(node_hair_48);

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createTealHoodedSwordsmanLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "Teal Hooded Swordsman look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = ["Large warm-neutral key light above camera left at [-3,5,4], intensity4; broad soft highlights on plate.", "Cool fill camera right [4,3,3], intensity1.3; rim light behind [-3,4,-3], intensity3.", "Neutral grey background #9c9da6; soft ground contact shadow; ACES tone mapping exposure1.0."];
  lights.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createTealHoodedSwordsmanEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameTealHoodedSwordsmanCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createTealHoodedSwordsmanPresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: { dof?: boolean; bloom?: boolean; bloomStrength?: number; dofFocus?: number; dofAperture?: number } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(new BokehPass(scene, camera, {
      focus: options.dofFocus ?? 10.0,
      aperture: options.dofAperture ?? 0.0002,
      maxblur: 0.01,
    }));
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85));
  }
  return composer;
}

export function configureTealHoodedSwordsmanRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createTealHoodedSwordsmanInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 8.0;
  controls.autoRotate = false;
  return controls;
}
