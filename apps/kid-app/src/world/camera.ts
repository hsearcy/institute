// apps/kid-app/src/world/camera.ts

/** Spherical → cartesian camera placement, with hero at origin. */
export type CameraSpec = {
  /** Distance from hero, in world units. */
  distance: number;
  /** Elevation angle from horizontal, in radians (0 = horizon, π/2 = directly above). */
  pitch: number;
  /** Horizontal angle around hero, in radians (0 = south of hero, +π/2 = east). */
  yaw: number;
};

/** Maximum yaw deviation from the default (south-facing) orientation. */
export const YAW_RANGE_RAD = Math.PI / 6; // 30°

/** Clamp yaw to [-YAW_RANGE_RAD, YAW_RANGE_RAD]. */
export function clampYaw(yaw: number): number {
  if (yaw > YAW_RANGE_RAD) return YAW_RANGE_RAD;
  if (yaw < -YAW_RANGE_RAD) return -YAW_RANGE_RAD;
  return yaw;
}

/** Compute the camera world position given a CameraSpec. */
export function cameraPosition(spec: CameraSpec): readonly [number, number, number] {
  const horizontal = spec.distance * Math.cos(spec.pitch);
  const x = horizontal * Math.sin(spec.yaw);
  const y = spec.distance * Math.sin(spec.pitch);
  const z = horizontal * Math.cos(spec.yaw);
  return [x, y, z] as const;
}
