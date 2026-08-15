import * as THREE from 'three';
import { GLSL_FIELD, fieldUniforms } from './field.js';
import { SUN, HAZE, VIEW } from './config.js';

export function createTerrain() {
  const geo = new THREE.PlaneGeometry(320, 320, 128, 128);
  geo.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    uniforms: Object.assign({
      uSun: { value: SUN }, uHaze: { value: HAZE.clone() }, uView: { value: VIEW },
      uCam: { value: new THREE.Vector3() }, uTime: { value: 0 },
    }, fieldUniforms()),
    vertexShader: GLSL_FIELD + `
      varying vec3 vW; varying vec3 vN; varying vec3 vL;
      varying float vBase; varying float vEdge;
      void main(){
        vec3 w = (modelMatrix * vec4(position,1.0)).xyz;
        w.y = terrainH(w.xz);
        float e = 1.6;
        float hx = terrainH(w.xz + vec2(e,0.0)) - terrainH(w.xz - vec2(e,0.0));
        float hz = terrainH(w.xz + vec2(0.0,e)) - terrainH(w.xz - vec2(0.0,e));
        vN = normalize(vec3(-hx, 2.0*e, -hz));
        vec4 f = fieldA(w.xz);
        vBase = f.x;            // what this region calls sea level
        vEdge = f.z;            // metres to the edge of the world, negative outside
        vL = fieldLand(w.xz);
        vW = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uSun,uHaze,uCam; uniform float uView;
      varying vec3 vW; varying vec3 vN; varying vec3 vL;
      varying float vBase; varying float vEdge;
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

        c = mix(c, uHaze, smoothstep(uView*0.35, uView*0.95, length(vW.xz - uCam.xz)));
        // past the last of the ground the world simply gives out into haze
        c = mix(c, uHaze, (1.0 - smoothstep(-34.0, 4.0, vEdge)) * 0.92);
        gl_FragColor = vec4(c,1.0);
      }`,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return {
    mesh, material,
    setHaze(c) { material.uniforms.uHaze.value.copy(c); },
  };
}
