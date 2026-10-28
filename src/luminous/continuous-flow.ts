import * as THREE from 'three';
import type { prepareFlowMaterial } from './flow-material';

type Source=ReturnType<typeof prepareFlowMaterial>;
const vertex=`
precision highp float;
uniform vec2 uSize;
uniform float uTime;
in vec3 position;
in vec2 normal;
in float side;
in float along;
in vec4 packet;
in vec2 appearance;
out float vSide;
out float vAlong;
out vec4 vPacket;
out vec2 vAppearance;
void main() {
  // Only local filaments curl. The source composition and camera stay still.
  float curl=sin(along*3.1-uTime*.62+packet.y)*.65;
  vec2 pixel=position.xy+normal*(side*appearance.x+curl);
  gl_Position=vec4(pixel.x/uSize.x*2.0-1.0,1.0-pixel.y/uSize.y*2.0,0,1);
  vSide=side;vAlong=along;vPacket=packet;vAppearance=appearance;
}
`;
const fragment=`
precision highp float;
uniform float uTime;
in float vSide;
in float vAlong;
in vec4 vPacket;
in vec2 vAppearance;
out vec4 fragColor;
void main() {
  // Each emitter has an independent lifetime and phase, rather than a common
  // short scene loop. The light head precedes a long, soft, asymmetric wake.
  float head=mod(uTime*vPacket.z+vPacket.y,vPacket.x+vPacket.w);
  float behind=head-vAlong;
  float wake=exp(-max(behind,0.0)/1.05)*exp(-pow(min(behind,0.0)/.24,2.0));
  float tip=exp(-pow(behind/.24,2.0));
  float crossSection=exp(-vSide*vSide*4.8);
  float ends=smoothstep(0.0,.24,vAlong)*(1.0-smoothstep(vPacket.x-.3,vPacket.x,vAlong));
  float evolution=.80+.20*sin(uTime*.083+vPacket.y*.71);
  float lifetime=smoothstep(0.0,.35,head)*(1.0-smoothstep(vPacket.x+.7,vPacket.x+2.2,head));
  float light=(wake*.80+tip*.12)*crossSection*ends*vAppearance.y*evolution*lifetime;
  fragColor=vec4(vec3(.97,.985,1.0)*light,1);
}
`;

/** Trace luminous filaments through the measured image field, from supply to core. */
function filaments(source:Source,index:number) {
  const image=source.art.image as HTMLCanvasElement;
  const width=image.width,height=image.height;
  const pixels=image.getContext('2d')!.getImageData(0,0,width,height).data;
  const grid=source.flow.image as {data:Uint8Array;width:number;height:number};
  const [left,top,right,bottom]=source.crop;
  let seed=901+index*173;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const luminance=(x:number,y:number)=>{
    const p=(Math.max(0,Math.min(height-1,Math.round(y)))*width+Math.max(0,Math.min(width-1,Math.round(x))))*4;
    return (pixels[p]+pixels[p+1]+pixels[p+2])/765;
  };
  const field=(x:number,y:number)=>{
    const p=(Math.max(0,Math.min(grid.height-1,Math.round((1-y/height)*(grid.height-1))))*grid.width+Math.max(0,Math.min(grid.width-1,Math.round(x/width*(grid.width-1)))))*4;
    let vx=(grid.data[p]/255*2-1)*source.radius*.55,vy=(grid.data[p+1]/255*2-1)*source.radius*.55;
    const qx=x-source.core[0],qy=y-source.core[1],r=Math.max(1,Math.hypot(qx,qy));
    const outward=Math.max(0,(vx*qx+vy*qy)/r+source.radius*.075);
    vx-=outward*qx/r;vy-=outward*qy/r;
    return [vx,vy];
  };
  const inside=(x:number,y:number)=>x>left+8&&x<right-8&&y>top+12&&y<bottom-12&&Math.hypot(x-source.core[0],y-source.core[1])>source.radius*1.018;
  const positions:number[]=[],normals:number[]=[],sides:number[]=[],times:number[]=[],packets:number[]=[],looks:number[]=[],indices:number[]=[];
  for(let attempt=0,count=0;attempt<6500&&count<180;attempt++) {
    let x=left+random()*(right-left),y=top+random()*(bottom-top);
    const lum=luminance(x,y);
    if(!inside(x,y)||lum<.045||random()>Math.sqrt(lum)) continue;
    // Walk upstream first, so a luminous head can be followed into the bright arc.
    for(let n=0;n<35;n++) { const v=field(x,y);const nx=x-v[0]*.06,ny=y-v[1]*.06;if(!inside(nx,ny)||luminance(nx,ny)<.018)break;x=nx;y=ny; }
    const points:[number,number,number][]=[];
    for(let n=0;n<150;n++) {
      if(!inside(x,y)||luminance(x,y)<.014)break;
      points.push([x,y,luminance(x,y)]);
      const v=field(x,y),mid=field(x+v[0]*.03,y+v[1]*.03);x+=mid[0]*.06;y+=mid[1]*.06;
    }
    if(points.length<18)continue;
    const length=(points.length-1)*.06;
    const phase=random()*25,pace=.85+random()*.55,gap=2.9+random()*11.7;
    const haze=count%3===0;
    const lineWidth=haze?20+random()*22:1.5+random()*2.7;
    const strength=haze?.48:.65+random()*.70;
    const start=positions.length/3;
    for(let n=0;n<points.length;n++) {
      const p=points[n],previous=points[Math.max(0,n-1)],next=points[Math.min(points.length-1,n+1)];
      const dx=next[0]-previous[0],dy=next[1]-previous[1],distance=Math.max(.001,Math.hypot(dx,dy));
      for(const side of [-1,1]) {
        positions.push(p[0],p[1],0);normals.push(-dy/distance,dx/distance);sides.push(side);times.push(n*.06);
        packets.push(length,phase,pace,gap);looks.push(lineWidth,strength*Math.sqrt(p[2]));
      }
      if(n) {const a=start+(n-1)*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    count++;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,2));
  geometry.setAttribute('side',new THREE.Float32BufferAttribute(sides,1));
  geometry.setAttribute('along',new THREE.Float32BufferAttribute(times,1));
  geometry.setAttribute('packet',new THREE.Float32BufferAttribute(packets,4));
  geometry.setAttribute('appearance',new THREE.Float32BufferAttribute(looks,2));geometry.setIndex(indices);
  return geometry;
}

/** Real moving emitters and smoke wakes; source art is never repeatedly blurred. */
export class ContinuousFlow {
  private graph=new THREE.Scene();
  private camera=new THREE.OrthographicCamera(-1,1,1,-1,-1,1);
  private material:THREE.RawShaderMaterial;
  private mesh:THREE.Mesh;
  private geometries=new Map<number,THREE.BufferGeometry>();
  private targets=new Map<number,THREE.WebGLRenderTarget>();
  private empty=new THREE.BufferGeometry();
  constructor(private sources:Source[]) {
    this.material=new THREE.RawShaderMaterial({
      glslVersion:THREE.GLSL3,vertexShader:vertex,fragmentShader:fragment,
      depthTest:false,depthWrite:false,transparent:true,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
      uniforms:{uSize:{value:new THREE.Vector2()},uTime:{value:0}},
    });
    this.mesh=new THREE.Mesh(this.empty,this.material);this.mesh.frustumCulled=false;this.graph.add(this.mesh);
  }
  update(renderer:THREE.WebGLRenderer,indices:number[],time:number) {
    for(const [index,target] of this.targets) if(!indices.includes(index)) {target.dispose();this.targets.delete(index);}
    const previous=renderer.getRenderTarget(),clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
    renderer.setClearColor(0,0);
    for(const index of indices) {
      const source=this.sources[index],image=source.art.image as HTMLCanvasElement;
      let geometry=this.geometries.get(index);
      if(!geometry) {geometry=filaments(source,index);this.geometries.set(index,geometry);}
      let target=this.targets.get(index);
      if(!target) {
        target=new THREE.WebGLRenderTarget(image.width,image.height,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false});
        this.targets.set(index,target);
      }
      this.mesh.geometry=geometry;
      this.material.uniforms.uSize.value.set(image.width,image.height);this.material.uniforms.uTime.value=time;
      renderer.setRenderTarget(target);renderer.clear();renderer.render(this.graph,this.camera);
    }
    renderer.setRenderTarget(previous);renderer.setClearColor(clear,alpha);
    return this.sources.map((source,index)=>this.targets.get(index)?.texture??source.art);
  }
  release() {this.targets.forEach(target=>target.dispose());this.targets.clear();}
  dispose() {this.release();this.geometries.forEach(geometry=>geometry.dispose());this.empty.dispose();this.material.dispose();}
}
