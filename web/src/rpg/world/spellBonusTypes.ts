import type * as THREE from 'three';
import type { RpgSpellId, RpgSpellShape } from '@institute/shared';

/** Presentation-only bridge. Targets are the authoritative cast's hit list. */
export interface SpellBonusContext {
  spellId: RpgSpellId;
  shape: RpgSpellShape;
  origin: THREE.Vector3;
  target: THREE.Vector3;
  targets: { id: string; position: THREE.Vector3; height: number }[];
  view: THREE.Vector3;
  time: () => number;
  castOrigin: () => THREE.Vector3;
  effect: (mesh: THREE.Mesh, duration: number, update?: (t: number, delta: number) => void) => THREE.Mesh;
  schedule: (delay: number, action: () => void) => void;
  emit: (at: THREE.Vector3, color: number, count: number, speed: number, life: number) => void;
  debris: (at: THREE.Vector3, count: number, hot?: boolean, force?: number) => void;
  bolt: (from: THREE.Vector3, to: THREE.Vector3, color: number, width: number, duration: number) => void;
  ring: (at: THREE.Vector3, color: number, radius: number, duration: number) => void;
  firePillar: (at: THREE.Vector3, height: number, duration: number) => void;
  fireContact: (at: THREE.Vector3, scale: number) => void;
  /** Frost Guardian: where each guardian's fists meet the floor, when, and the victims its ice runs to. */
  slams?: { at: THREE.Vector3; delay: number; targets: THREE.Vector3[] }[];
  meteorImpact: (at: THREE.Vector3, incoming: THREE.Vector3, scale: number) => void;
}
