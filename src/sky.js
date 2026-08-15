import * as THREE from 'three';
import { SKY_TOP, SKY_LOW, SUN } from './config.js';

export function createSky() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: SKY_TOP.clone() },
        uLow: { value: SKY_LOW.clone() },
        uSun: { value: SUN },
      },
      vertexShader: `
        varying vec3 vD;
        void main(){
          vD = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: `
        uniform vec3 uTop,uLow,uSun; varying vec3 vD;
        void main(){
          float t = clamp(vD.y*1.25+0.06, 0.0, 1.0);
          vec3 c = mix(uLow, uTop, pow(t,0.72));
          float g = pow(max(dot(normalize(vD), uSun),0.0), 22.0);
          c += vec3(1.0,0.93,0.78)*g*0.45;
          float band = smoothstep(0.30,0.0,abs(vD.y-0.03));
          c = mix(c, vec3(0.94,0.97,0.93), band*0.35);
          gl_FragColor = vec4(c,1.0);
        }`,
    })
  );
  sky.frustumCulled = false;

  // The haze of whatever you are flying over reaches a long way up the sky —
  // that is how you see the next landscape coming before you are in it.
  function setHaze(c) {
    sky.material.uniforms.uLow.value.copy(SKY_LOW).lerp(c, 0.62);
    sky.material.uniforms.uTop.value.copy(SKY_TOP).lerp(c, 0.16);
  }

  return { mesh: sky, setHaze };
}
