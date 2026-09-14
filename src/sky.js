import * as THREE from 'three';
import { SKY_TOP, SKY_LOW, SUN, SUN_COL, HAZE, LIGHT } from './config.js';

// A single dome holds the atmosphere, drifting clouds, stars and distant
// alpine ranges. No extra draw calls or screen-space effects in stereo.
//
// The stars are procedural rather than geometry — a hash per cell of a grid laid
// over the view direction, with the star placed somewhere inside its own cell so
// the field does not look like a lattice. That costs one extra fragment
// function and no draw call, no buffer, and nothing to keep in sync as you fly.

export function createSky(conditions) {
  const uniforms = {
    uTop: { value: SKY_TOP }, uLow: { value: SKY_LOW },
    uSun: { value: SUN }, uSunCol: { value: SUN_COL }, uHaze: { value: HAZE },
    // x = how strongly the stars come out, y = whether there is a moon,
    // z = how tight the glow around the sun or moon is, w = time
    uSky: { value: new THREE.Vector4(0, 0, 22, 0) },
    // and how bright that glow is at all — nothing is in the sky on a new moon
    uGlow: { value: 0.45 },
    uLight: { value: LIGHT },
    uVisibility: { value: conditions.view },
    uCloud: { value: 0.16 + conditions.damp * 1.2 },
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
        uniform vec3 uLight; uniform float uVisibility, uCloud;
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

        float noise2(vec2 p){
          vec2 i = floor(p), f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(mix(hash31(vec3(i,0.0)),hash31(vec3(i+vec2(1,0),0.0)),f.x),
                     mix(hash31(vec3(i+vec2(0,1),0.0)),hash31(vec3(i+vec2(1,1),0.0)),f.x),f.y);
        }
        float cloudNoise(vec2 p){
          return noise2(p)*0.57 + noise2(p*2.03+17.0)*0.28 + noise2(p*4.11+31.0)*0.15;
        }
        // Periodic angular ridges close seamlessly behind the viewer. These
        // are distant scenery, beyond the playable field, with no new draws.
        float ridge(float a, float seed){
          return 0.075 + pow(1.0-abs(sin(a*3.0+seed)),1.35)*0.17
            + abs(sin(a*11.0+seed*2.0))*0.060
            + abs(sin(a*23.0+seed))*0.023;
        }
        void main(){
          vec3 d = normalize(vD);
          float t = clamp(vD.y*1.25+0.06, 0.0, 1.0);
          vec3 c = mix(uLow, uTop, pow(t,0.72));

          float sd = dot(d, uSun);

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
          if (uSky.x < 0.5) {
            float sunDisc = smoothstep(0.99988,0.99996,sd);
            c += uSunCol*(sunDisc*1.4+pow(max(sd,0.0),180.0)*0.14)*uVisibility;
          }

          // Broad, slow cloud banks and feathered high cloud. Fade the
          // projection before the horizon; no rapidly shrinking cloud pixels.
          vec2 cp = d.xz / max(d.y + 0.18, 0.12);
          cp = cp*2.6 + vec2(uSky.w*0.007, uSky.w*0.003);
          float density = cloudNoise(cp);
          float cloud = smoothstep(0.58-uCloud*0.22,0.79-uCloud*0.18,density);
          cloud *= smoothstep(0.015,0.16,d.y);
          vec3 cloudCol = mix(uLow*0.78,uLow*0.65+uSunCol*uLight*0.48,
                              smoothstep(0.42,0.75,density));
          cloudCol = mix(cloudCol, uSunCol*uLight, pow(max(sd,0.0),12.0)*0.24);
          c = mix(c,cloudCol,cloud*0.88);

          float band = 1.0 - smoothstep(0.0, 0.30, abs(d.y - 0.03));
          c = mix(c, uHaze, band * 0.42);
          // Three overlapping alpine ranges, lit facets and irregular snow
          // lines. Weather hides the ranges together with the playable world.
          float az = atan(d.z,d.x);
          for (int layer=0; layer<3; layer++) {
            float l = float(layer);
            float peak = ridge(az,1.7+l*2.4)*(1.0-l*0.20)-l*0.025;
            float slope = (ridge(az+0.008,1.7+l*2.4)-ridge(az-0.008,1.7+l*2.4))/0.016;
            float facet = clamp(0.5+slope*0.25*(uSun.x*cos(az)+uSun.z*sin(az)),0.0,1.0);
            vec3 rock = mix(vec3(0.19,0.25,0.30),vec3(0.40,0.43,0.44),facet);
            float snowline = peak*0.68 + sin(az*37.0+l)*0.012;
            float snow = smoothstep(snowline,snowline+0.025,d.y);
            snow *= smoothstep(0.10,0.20,peak);
            rock = mix(rock,vec3(0.79,0.85,0.88)*(0.72+facet*0.28),snow);
            vec3 mountain = mix(rock*uLight,uHaze,0.72-l*0.13);
            mountain = mix(mountain,uHaze,1.0-smoothstep(-0.03,0.13,d.y));
            float edge = 1.0-smoothstep(peak-0.0015,peak+0.0015,d.y);
            c = mix(c,mountain,edge*smoothstep(0.28,0.9,uVisibility));
          }
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
