/**
 * Landscape tilt → steer.
 *
 * Returned degrees are positive when the right edge of the *screen* is lower.
 * Positive steer then turns the car to the driver's right.
 *
 * W3C deviceorientation, right-hand rule, device axes in portrait:
 *   gamma > 0 rotates about +Y and lowers the device's right side.
 *   beta  > 0 rotates about +X and lifts the device's top (flat screen-up is 0;
 *   upright, top up, facing you, is about 90).
 * These signs were not flipped. The reversed arrows on iPhone were the chase
 * camera: screen-right is world -X when the camera looks along +Z. Tilt has
 * not been checked on a physical phone. Meny → Vänd styrning flips tilt only.
 *
 * screen.orientation.angle is clockwise from portrait:
 *   90  landscape, device top toward screen-right (home indicator on the left)
 *   270 the other landscape (home indicator on the right)
 * window.orientation is counterclockwise-positive, so -90 → angle 90 and 90 → 270.
 *
 *   angle 0:   gamma
 *   angle 90:  -beta
 *   angle 270: beta
 *   angle 180: -gamma
 */

export const TILT_DEAD_DEG = 6;
export const TILT_SPAN_DEG = 20;

export function orientationToScreenAngle(screenAngle, windowOrientation, viewportLandscape) {
  let angle = null;
  if (Number.isFinite(screenAngle)) angle = norm360(screenAngle);
  else if (Number.isFinite(windowOrientation)) {
    const o = windowOrientation;
    if (o === -90) angle = 90;
    else if (o === 90) angle = 270;
    else if (o === 180 || o === -180) angle = 180;
    else angle = 0;
  }
  if (viewportLandscape && (angle === null || angle === 0 || angle === 180)) return 90;
  return angle == null ? 0 : angle;
}

export function tiltRightDownDegrees(beta, gamma, screenAngle) {
  const b = Number.isFinite(beta) ? beta : 0;
  const g = Number.isFinite(gamma) ? gamma : 0;
  const a = norm360(Number.isFinite(screenAngle) ? screenAngle : 0);
  if (a === 90) return -b;
  if (a === 270) return b;
  if (a === 180) return -g;
  return g;
}

/** Map a centered tilt in degrees to a steer in [-1, 1]. Positive steers right. */
export function steerFromTiltDegrees(raw, zero, dead = TILT_DEAD_DEG, span = TILT_SPAN_DEG) {
  const d = (Number.isFinite(raw) ? raw : 0) - (Number.isFinite(zero) ? zero : 0);
  const mag = Math.abs(d);
  if (mag <= dead || span <= 0) return 0;
  const steered = ((mag - dead) / span) * Math.sign(d);
  return Math.max(-1, Math.min(1, steered));
}

function norm360(deg) {
  return ((Math.round(deg) % 360) + 360) % 360;
}
