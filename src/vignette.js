import * as THREE from 'three';

// A head-locked comfort tunnel. Peripheral optical flow is what makes turning
// in a headset feel wrong; darkening the edges while the world rotates removes
// most of it. It rides on the camera as a small sphere rather than a flat quad
// so both eyes see the same thing with no vergence conflict.
export function createVignette(camera) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uAmount: { value: 0 },
      uTint: { value: new THREE.Color(0x0a1210) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform float uAmount; uniform vec3 uTint;
      varying vec3 vDir;
      void main(){
        // angle away from where you are looking, in the camera's own space
        float a = acos(clamp(dot(normalize(vDir), vec3(0.0,0.0,-1.0)), -1.0, 1.0));
        float inner = mix(1.30, 0.52, uAmount);
        float outer = inner + 0.38;
        float m = smoothstep(inner, outer, a) * uAmount;
        if (m <= 0.002) discard;
        gl_FragColor = vec4(uTint, m * 0.92);
      }`,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(2.0, 24, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9999;
  mesh.visible = false;
  camera.add(mesh);

  return {
    mesh,
    set(amount) {
      const a = Math.max(0, Math.min(1, amount));
      material.uniforms.uAmount.value = a;
      mesh.visible = a > 0.005;
    },
  };
}
