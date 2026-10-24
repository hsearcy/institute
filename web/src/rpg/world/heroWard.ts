import * as THREE from 'three';

const vertexShader = /* glsl */`
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vViewW;
void main() {
  vLocal = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewW = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const fragmentShader = /* glsl */`
uniform vec3 uColor;
uniform vec3 uDir;
uniform float uAge;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vViewW;
// Distance from a point to the edge of its hexagonal cell (0 at the edge).
float hexEdge(vec2 uv) {
  vec2 r = vec2(1., 1.732), h = r * .5;
  vec2 a = mod(uv, r) - h, b = mod(uv - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  g = abs(g);
  return .5 - max(dot(g, normalize(r)), g.x);
}
void main() {
  float flash = exp(-uAge * 6.5) * step(0., uAge);
  if (flash < .003) discard;
  vec2 uv = vec2(atan(vLocal.z, vLocal.x) * 1.9, asin(clamp(vLocal.y, -1., 1.)) * 2.6);
  float lines = 1. - smoothstep(.0, .06, hexEdge(uv * 2.2));
  float aim = dot(vLocal, uDir);
  // The struck cells light first; a ripple carries the energy round the shell.
  float contact = smoothstep(.55, .98, aim);
  float ripple = exp(-pow((1. - aim) * 3. - uAge * 9., 2.) * 2.5) * smoothstep(-.4, .3, aim);
  float rim = pow(1. - abs(dot(normalize(vNormalW), normalize(vViewW))), 2.2);
  float energy = (contact * (.35 + lines * 2.4) + ripple * lines * 1.1 + rim * .12) * flash;
  gl_FragColor = vec4(uColor * energy, 1.);
}`;

/**
 * The hero's protective ward. It shows only when an enemy strike meets it:
 * hexagonal cells light at the contact point and a ripple runs round the shell.
 */
export class HeroWard {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private flashedAt = -99;

  constructor() {
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      uniforms: { uColor: { value: new THREE.Color(0x9fe8ff) }, uDir: { value: new THREE.Vector3(0, 0, 1) }, uAge: { value: 99 } },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), material);
    this.mesh.name = 'HeroWard'; this.mesh.scale.set(1.15, 1.35, 1.15); this.mesh.position.y = 1.05;
    this.mesh.renderOrder = 4; this.mesh.visible = false;
  }

  /** `from` is the world point the strike came from. */
  flash(from: THREE.Vector3, elapsed: number, color = 0x9fe8ff): void {
    const center = this.mesh.getWorldPosition(new THREE.Vector3());
    const direction = from.clone().sub(center).setY(from.y - center.y).normalize();
    // The shell is not rotated, so its local frame matches the world axes.
    this.mesh.material.uniforms.uDir.value.copy(direction);
    this.mesh.material.uniforms.uColor.value.setHex(color);
    this.flashedAt = elapsed;
  }

  update(elapsed: number): void {
    const age = elapsed - this.flashedAt;
    this.mesh.visible = age < 1.1;
    this.mesh.material.uniforms.uAge.value = age;
  }

  dispose(): void { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
