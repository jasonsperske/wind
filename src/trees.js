import * as THREE from 'three';

// Three small, opaque meshes: rounded oak, silver birch, and layered pine.
// No leaf alpha cards or textures, so both eyes get stable silhouettes.
export function treeGeometry(type) {
  const positions=[], normals=[], colours=[], bends=[];
  const up=new THREE.Vector3(0,1,0);
  function add(geo, centre, scale, colour, foliage=false, rotation=null) {
    if (geo.index) { const expanded=geo.toNonIndexed(); geo.dispose(); geo=expanded; }
    geo.scale(...scale);
    if (rotation) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(rotation));
    geo.translate(...centre);
    const p=geo.attributes.position, n=geo.attributes.normal;
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
      positions.push(x,y,z); normals.push(n.getX(i),n.getY(i),n.getZ(i));
      const shade=foliage ? 0.83+0.15*n.getY(i)+0.07*Math.sin(x*7+y*5+z*9) :
        type===1 ? 0.83+0.14*Math.sin(y*31+Math.sin(x*13)*2) : 0.85+0.10*n.getY(i);
      colours.push(...colour.map(c=>c*shade));
      bends.push(Math.min(1,Math.max(0,y/4))*(foliage ? 1 : 0.35));
    }
    geo.dispose();
  }
  function branch(a,b,r,colour) {
    const from=new THREE.Vector3(...a), to=new THREE.Vector3(...b), d=to.clone().sub(from);
    add(new THREE.CylinderGeometry(r*0.45,r,d.length(),7),from.add(to).multiplyScalar(0.5).toArray(),
      [1,1,1],colour,false,new THREE.Quaternion().setFromUnitVectors(up,d.normalize()));
  }
  function crown(x,y,z,sx,sy,sz,colour) {
    const geo=new THREE.SphereGeometry(1,10,6);
    // Distort by position, preserving seam/pole continuity.
    const p=geo.attributes.position;
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
      const r=1+0.07*Math.sin(x*8+y*5+z*7);
      p.setXYZ(i,x*r,y*r,z*r);
    }
    geo.computeVertexNormals();
    add(geo,[x,y,z],[sx,sy,sz],colour,true);
  }
  if(type===0) {
    const bark=[0.29,0.21,0.13], leaf=[0.26,0.43,0.13];
    branch([0,-0.18,0],[0.08,2.8,0],0.18,bark);
    for(let i=0;i<5;i++) {
      const a=i*2.399, x=Math.cos(a)*0.77,z=Math.sin(a)*0.77,y=2.05+(i%3)*0.28;
      branch([0,1.2,0],[x,y,z],0.09,bark);
      crown(x,y+0.35,z,0.82,0.75,0.77,leaf);
    }
    crown(0.03,3.05,0.05,0.96,0.8,0.9,[0.32,0.49,0.16]);
  } else if(type===1) {
    const bark=[0.79,0.77,0.65], leaf=[0.40,0.54,0.20];
    branch([0,-0.18,0],[0.10,3.6,0],0.105,bark);
    branch([0,1.0,0],[-0.43,3.1,0.18],0.065,bark);
    for(let i=0;i<5;i++) {
      const a=i*2.399;
      const x=Math.cos(a)*0.38,z=Math.sin(a)*0.36,y=2.2+i*0.32;
      branch([0,y-0.65,0],[x,y,z],0.035,bark);
      crown(x,y,z,0.52,0.69,0.46,leaf);
    }
    crown(0.09,3.85,0,0.45,0.65,0.42,[0.46,0.59,0.23]);
  } else {
    branch([0,-0.18,0],[0,3.65,0],0.14,[0.30,0.20,0.12]);
    for(let i=0;i<6;i++) {
      const y=1.0+i*0.5, r=1.05-i*0.14;
      const geo=new THREE.ConeGeometry(r,1.4-i*0.07,11,2);
      const p=geo.attributes.position;
      for(let j=0;j<p.count;j++) {
        const x=p.getX(j),z=p.getZ(j);
        const wobble=1+0.10*Math.sin(x*7+z*5+i);
        p.setXYZ(j,x*wobble,p.getY(j),z*wobble);
      }
      geo.computeVertexNormals();
      add(geo,[Math.sin(i*2)*0.07,y+0.45,Math.cos(i)*0.05],[1,1,1],
        [0.13+i*0.014,0.29+i*0.018,0.17+i*0.010],true);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('aNrm',new THREE.Float32BufferAttribute(normals,3));
  g.setAttribute('aCol',new THREE.Float32BufferAttribute(colours,3));
  g.setAttribute('aBend',new THREE.Float32BufferAttribute(bends,1));
  g.computeBoundingBox();
  return g;
}
