import * as THREE from 'three';

export const FLOW_POINTS = 12;
const HISTORY = 128;
const SPACING = 0.35;

// Distance-spaced world positions let the stream remember a curve independently
// of frame rate. This is visual history only; it never changes camera motion.
export function createPetalPath() {
  const history = Array.from({length: HISTORY}, () => new THREE.Vector3());
  const points = Array.from({length: FLOW_POINTS}, () => new THREE.Vector3());
  const forward = new THREE.Vector3(0,0,-1);
  const direction = new THREE.Vector3();
  const delta = new THREE.Vector3();
  const previous = new THREE.Vector3();
  let newest = 0, count = 0, lastTime = null;

  function behind(position, distance, out) {
    previous.copy(position);
    for (let k=0; k<count; k++) {
      const next = history[(newest-k+HISTORY)%HISTORY];
      const length = previous.distanceTo(next);
      if (length > 0.0001 && distance <= length) return out.copy(previous).lerp(next,distance/length);
      distance -= length;
      previous.copy(next);
    }
    // Before enough travel has accumulated, extend the last known heading.
    direction.copy(forward);
    if (count > 1) {
      const oldest = history[(newest-count+1+HISTORY)%HISTORY];
      const next = history[(newest-count+2+HISTORY)%HISTORY];
      direction.subVectors(next,oldest).normalize();
    }
    return out.copy(previous).addScaledVector(direction,-distance);
  }

  function update(position, heading, time, speed) {
    const reset = !count || position.distanceTo(history[newest]) > 40 || (lastTime !== null && time < lastTime);
    const dt = lastTime === null ? 0 : Math.max(0,time-lastTime);
    lastTime = time;
    direction.copy(heading);
    if (direction.lengthSq() < 0.0001) direction.copy(forward);
    direction.normalize();
    if (reset) {
      newest = 0; count = 1;
      history[0].copy(position);
      forward.copy(direction);
    } else {
      forward.lerp(direction,1-Math.exp(-dt*6));
      if (forward.lengthSq() < 0.0001) forward.copy(direction);
      forward.normalize();
      delta.subVectors(position,history[newest]);
      let distance = delta.length();
      if (distance > 0) delta.multiplyScalar(1/distance);
      while (distance >= SPACING) {
        const next = (newest+1)%HISTORY;
        history[next].copy(history[newest]).addScaledVector(delta,SPACING);
        newest = next; count = Math.min(HISTORY,count+1);
        distance -= SPACING;
      }
    }
    // A few petals lead at the edges of the view; the rest trail along the route.
    points[0].copy(position).addScaledVector(forward,5);
    points[1].copy(position).addScaledVector(forward,2.5);
    points[2].copy(position);
    const length = 7 + Math.min(Math.max(speed,0),40)*0.32;
    for (let i=3;i<FLOW_POINTS;i++) behind(position,(i-2)/(FLOW_POINTS-3)*length,points[i]);
    return points;
  }
  return { points, update };
}
