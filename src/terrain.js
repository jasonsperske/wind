import * as THREE from 'three';
import { GLSL_FIELD, fieldUniforms } from './field.js';
import { SUN, LIGHT, HAZE, FOG } from './config.js';

export function createTerrain() {
  const geo = new THREE.PlaneGeometry(320, 320, 128, 128);
  geo.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    // uSun / uLight / uHaze / uFog are the live objects out of config.js, so
    // the hour and the weather reach every material without being passed down.
    uniforms: Object.assign({
      uSun: { value: SUN }, uLight: { value: LIGHT },
      uHaze: { value: HAZE }, uFog: { value: FOG },
      uCam: { value: new THREE.Vector3() }, uTime: { value: 0 },
    }, fieldUniforms()),
    vertexShader: GLSL_FIELD + `
      uniform float uTime;
      varying vec3 vW; varying vec3 vN; varying vec3 vL;
      varying float vBase; varying float vEdge; varying float vWet;
      void main(){
        vec3 w = (modelMatrix * vec4(position,1.0)).xyz;
        w.y = terrainH(w.xz);
        float e = 1.6;
        float hx = terrainH(w.xz + vec2(e,0.0)) - terrainH(w.xz - vec2(e,0.0));
        float hz = terrainH(w.xz + vec2(0.0,e)) - terrainH(w.xz - vec2(0.0,e));
        vN = normalize(vec3(-hx, 2.0*e, -hz));
        vec4 f = fieldA(w.xz);
        vec4 b = fieldB(w.xz);
        vBase = f.x;            // what this region calls sea level
        vEdge = f.z;            // metres to the edge of the world, negative outside
        vWet = b.a;
        vL = b.rgb;
        // A lake is dead flat, so it needs a normal of its own or it reads as
        // painted concrete. Ripple the normal, not the vertex — the surface you
        // skim along should stay exactly where the collision thinks it is.
        if (vWet > 0.02) {
          float a = w.x*0.90 + uTime*1.5;
          float b2 = w.z*0.75 - uTime*1.1;
          vec3 wn = normalize(vec3(-cos(a)*0.042, 1.0, sin(b2)*0.036));
          vN = normalize(mix(vN, wn, clamp(vWet, 0.0, 1.0)));
        }
        vW = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uSun,uLight,uHaze,uCam; uniform vec2 uFog;
      varying vec3 vW; varying vec3 vN; varying vec3 vL;
      varying float vBase; varying float vEdge; varying float vWet;
      void main(){
        vec3 n = normalize(vN);
        float lam = max(dot(n, uSun), 0.0)*0.7 + 0.42;
        float m = sin(vW.x*0.061+0.4)*cos(vW.z*0.053+1.2)*0.5+0.5;
        // height above this region's own floor, not above the world's
        float rise = smoothstep(3.0, 11.0, vW.y - vBase);

        vec3 meadow = mix(vec3(0.20,0.33,0.14), vec3(0.33,0.44,0.17), m);
        meadow = mix(meadow, vec3(0.42,0.47,0.24), rise*0.55);

        float rip = sin(vW.x*0.196 + vW.z*0.121 + m*3.0)*0.5+0.5;
        vec3 dune = mix(vec3(0.70,0.56,0.35), vec3(0.93,0.84,0.61), rip*0.5 + rise*0.5);

        vec3 tundra = mix(vec3(0.62,0.69,0.77), vec3(0.96,0.98,1.00), m*0.35 + rise*0.65);

        vec3 lw = vL / max(vL.x+vL.y+vL.z, 1e-3);
        vec3 base = meadow*lw.x + dune*lw.y + tundra*lw.z;

        // ice throws the light back, sand is very nearly matte
        float glint = pow(max(dot(n, uSun), 0.0), 9.0) * lw.z * 0.55;
        vec3 c = base*lam + vec3(0.85,0.92,1.0)*glint;

        // water: darker, bluer, and it holds a real highlight
        if (vWet > 0.001) {
          vec3 eye = normalize(uCam - vW);
          vec3 h = normalize(eye + uSun);
          float spec = pow(max(dot(n, h), 0.0), 90.0);
          float fres = pow(1.0 - max(dot(n, eye), 0.0), 3.0);
          vec3 deep = vec3(0.09,0.20,0.27), shallow = vec3(0.20,0.40,0.46);
          vec3 wc = mix(deep, shallow, m) * (0.55 + lam*0.45);
          wc = mix(wc, uHaze, fres*0.55);        // glancing angles turn to sky
          wc += vec3(1.0,0.98,0.92) * spec * 1.3;
          c = mix(c, wc, clamp(vWet, 0.0, 1.0));
        }

        c *= uLight;
        c = mix(c, uHaze, smoothstep(uFog.x, uFog.y, length(vW.xz - uCam.xz)));
        // past the last of the ground the world simply gives out into haze
        c = mix(c, uHaze, (1.0 - smoothstep(-34.0, 4.0, vEdge)) * 0.92);
        gl_FragColor = vec4(c,1.0);
      }`,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return { mesh, material };
}
