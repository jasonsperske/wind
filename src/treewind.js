// Predictive steering around visible trees. The bypass side stays fixed while
// approaching a tree so a head-on approach cannot oscillate left and right.
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function createTreeWind() {
  let target = null, side = 1, rate = 0;
  return function sample(pos, heading, speed, trees, dt, out) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const rx = fz, rz = -fx;
    let best = null, strength = 0;
    for (const tree of trees) {
      if (pos.y < tree.y - 0.5 || pos.y > tree.y + tree.height + 1) continue;
      const dx = tree.x - pos.x, dz = tree.z - pos.z;
      const ahead = dx * fx + dz * fz;
      const across = dx * rx + dz * rz;
      const reach = Math.max(8, speed * 1.15) + tree.radius;
      if (ahead < -tree.radius || ahead > reach) continue;
      const corridor = tree.radius + 1.5;
      if (Math.abs(across) >= corridor) continue;
      const urgency = (1 - clamp(ahead / reach, 0, 1))
        * (1 - Math.pow(across / corridor, 2));
      if (urgency > strength) { strength = urgency; best = tree; }
    }
    if (best) {
      if (target !== best.id) {
        const across = (best.x-pos.x)*rx + (best.z-pos.z)*rz;
        side = across > 0.05 ? -1 : across < -0.05 ? 1 : 1;
        target = best.id;
      }
    } else target = null;
    // Smooth steering, including its release. Translation carries the wind
    // sideways too, so a fast gust can slip around a tree without a sharp yaw.
    const want = best ? side * strength * 0.85 : 0;
    rate += (want-rate) * (1-Math.exp(-dt*5));
    out.turn = rate;
    out.amount = Math.abs(rate) / 0.85;
    out.x = rx * rate * speed * 0.85;
    out.z = rz * rate * speed * 0.85;
    return out;
  };
}
