import * as THREE from 'three';
import { SKY_TOP, SKY_LOW, SUN, SUN_COL, HAZE } from './config.js';

// The dome. In daylight it is a gradient with the sun's glow in it; after dark
// the same shader grows a moon and a sky full of stars.
//
// The stars are procedural rather than geometry — a hash per cell of a grid laid
// over the view direction, with the star placed somewhere inside its own cell so
// the field does not look like a lattice. That costs one extra fragment
// function and no draw call, no buffer, and nothing to keep in sync as you fly.

export function createSky() {
  const uniforms = {
    uTop: { value: SKY_TOP }, uLow: { value: SKY_LOW },
    uSun: { value: SUN }, uSunCol: { value: SUN_COL }, uHaze: { value: HAZE },
    // x = how strongly the stars come out, y = whether there is a moon,
    // z = how tight the glow around the sun or moon is, w = time
    uSky: { value: new THREE.Vector4(0, 0, 22, 0) },
    // and how bright that glow is at all — nothing is in the sky on a new moon
    uGlow: { value: 0.45 },
  };

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms,
      vertexShader: `
        varying vec3 vD;
        void main(){
          vD = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: `
        uniform vec3 uTop,uLow,uSun,uSunCol,uHaze; uniform vec4 uSky; uniform float uGlow;
        varying vec3 vD;

        float hash31(vec3 p){
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        }

        // One star per cell of a coarse grid over the direction, placed at a
        // random point inside its cell, most cells empty.
        float stars(vec3 d, float t){
          vec3 p = d * 190.0;
          vec3 g = floor(p), f = fract(p);
          float h = hash31(g);
          if (h < 0.9815) return 0.0;
          vec3 c = vec3(hash31(g + 1.7), hash31(g + 3.3), hash31(g + 5.9));
          float m = smoothstep(0.17, 0.0, length(f - c));
          float bright = 0.30 + 0.70 * hash31(g + 9.1);
          float twinkle = 0.72 + 0.28 * sin(t * 1.7 + h * 90.0);
          return m * bright * twinkle;
        }

        void main(){
          float t = clamp(vD.y*1.25+0.06, 0.0, 1.0);
          vec3 c = mix(uLow, uTop, pow(t,0.72));

          float sd = dot(normalize(vD), uSun);

          // stars first, so the moon and the horizon haze sit over them
          if (uSky.x > 0.001) {
            float up = smoothstep(-0.04, 0.30, vD.y);
            c += vec3(0.86,0.90,1.0) * stars(normalize(vD), uSky.w) * uSky.x * up;
          }

          // the moon: a disc, and a halo that survives thin cloud
          if (uSky.y > 0.001) {
            float disc = smoothstep(0.99930, 0.99955, sd);
            float halo = pow(max(sd, 0.0), 900.0);
            c = mix(c, vec3(0.96,0.97,1.0), disc * uSky.y);
            c += uSunCol * halo * 0.5 * uSky.y;
          }

          c += uSunCol * pow(max(sd, 0.0), uSky.z) * uGlow;

          float band = smoothstep(0.30, 0.0, abs(vD.y - 0.03));
          c = mix(c, uHaze, band * 0.42);
          gl_FragColor = vec4(c,1.0);
        }`,
    })
  );
  sky.frustumCulled = false;

  return {
    mesh: sky,
    // stars 0..1, moon 0..1, glow exponent and amplitude, elapsed seconds
    set(stars, moon, glow, glowAmt, time) {
      uniforms.uSky.value.set(stars, moon, glow, time);
      uniforms.uGlow.value = glowAmt;
    },
  };
}
