/**
 * Landscape tilt → steer.
 *
 * DeviceOrientation (portrait device axes):
 *   gamma > 0 when the device's right side is down.
 *   beta  > 0 when the top is lifted toward the user from flat (flat screen-up is 0).
 *
 * screen.orientation.angle is clockwise from natural portrait:
 *   0 portrait, 90 landscape with the device top toward screen-right,
 *   270 the other landscape, 180 upside down.
 *
 * Returned degrees are positive when the right edge of the *screen* is lower.
 *   angle 0:   gamma
 *   angle 90:  -beta
 *   angle 270: beta
 *   angle 180: -gamma
 *
 * If the window is landscape but the browser still reports a portrait angle
 * (common on desktop and some headless sessions), angle 90 is assumed.
 * A real phone that reports 90 or 270 keeps that value.
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

/** Map a centered tilt in degrees to a steer in [-1, 1]. */
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
