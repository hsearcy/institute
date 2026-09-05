import * as THREE from 'three';

/** Hand-painted stone maps keep the dungeon readable without downloading textures. */
export function stoneMaterial(color: number, seed = 7): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  let state = seed;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  context.fillStyle = '#8d9293'; context.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6500; i++) {
    const shade = 50 + Math.floor(random() * 135);
    context.fillStyle = `rgba(${shade},${shade},${shade},${random() * .28})`;
    context.fillRect(random() * 256, random() * 256, 1 + random() * 10, 1 + random() * 4);
  }
  context.strokeStyle = '#45494b'; context.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    let x = random() * 256, y = random() * 256;
    context.beginPath(); context.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += (random() - .5) * 30; y += random() * 14; context.lineTo(x, y); }
    context.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ color, map, bumpMap: map, bumpScale: .055, roughness: .94 });
}

export function glowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.16, '#ffffff');
  gradient.addColorStop(.35, 'rgba(255,255,255,.4)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function waveTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#000000'; context.fillRect(0, 0, 256, 256);
  const gradient = context.createRadialGradient(128, 128, 75, 128, 128, 127);
  gradient.addColorStop(0, '#000000'); gradient.addColorStop(.35, '#111111');
  gradient.addColorStop(.62, '#ffffff'); gradient.addColorStop(.78, '#777777'); gradient.addColorStop(1, '#000000');
  context.fillStyle = gradient; context.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 270; i++) {
    const angle = i / 270 * Math.PI * 2;
    const length = 9 + Math.sin(i * 9.3) * 8;
    context.strokeStyle = `rgba(255,255,255,${.2 + (Math.sin(i * 7.1) + 1) * .22})`;
    context.lineWidth = 1 + (i % 3);
    context.beginPath(); context.moveTo(128 + Math.sin(angle) * 105, 128 + Math.cos(angle) * 105);
    context.lineTo(128 + Math.sin(angle + .025) * (107 + length), 128 + Math.cos(angle + .025) * (107 + length)); context.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}
