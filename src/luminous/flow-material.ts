import * as THREE from 'three';

type Spec = { crop: [number, number, number, number]; core: [number, number]; radius: number; desktop?: boolean };
const specs: Spec[] = [
  { crop: [176,185,851,875], core: [846,496], radius: 300 },
  { crop: [151,215,872,870], core: [518,606], radius: 177 },
  { crop: [175,355,851,890], core: [508,653], radius: 153 },
  { crop: [398,160,1500,690], core: [1262,388], radius: 277, desktop: true },
];

function blur(input: Float32Array, width: number, height: number) {
  const temp = new Float32Array(input.length), output = new Float32Array(input.length);
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    let sum=0;
    for (let k=-2;k<=2;k++) sum+=input[y*width+Math.min(width-1,Math.max(0,x+k))];
    temp[y*width+x]=sum/5;
  }
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    let sum=0;
    for (let k=-2;k<=2;k++) sum+=temp[Math.min(height-1,Math.max(0,y+k))*width+x];
    output[y*width+x]=sum/5;
  }
  return output;
}


function emissionNoise(x:number,y:number) {
  const hash=(a:number,b:number)=>{const value=Math.sin(a*127.1+b*311.7)*43758.5453;return value-Math.floor(value);};
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  const lower=hash(ix,iy)*(1-sx)+hash(ix+1,iy)*sx;
  const upper=hash(ix,iy+1)*(1-sx)+hash(ix+1,iy+1)*sx;
  return lower*(1-sy)+upper*sy;
}

/** Derive a continuous material velocity field from the image's strand orientation. */
export function prepareFlowMaterial(source: THREE.Texture, index: number) {
  const image=source.image as HTMLImageElement;
  const spec=specs[index];
  const canvas=document.createElement('canvas'); canvas.width=image.width; canvas.height=image.height;
  const context=canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image,0,0);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);
  const [left,top,right,bottom]=spec.crop;
  for(let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) {
    const i=(y*canvas.width+x)*4;
    // Clean the source before generating mipmaps, so type and enclosure cannot bleed in.
    const excluded=x<left||x>right||y<top||y>bottom||(spec.desktop&&x<780&&y<345);
    if(excluded) pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=0;
  }
  context.putImageData(pixels,0,0);
  const art=new THREE.CanvasTexture(canvas);
  art.minFilter=THREE.LinearMipmapLinearFilter; art.magFilter=THREE.LinearFilter;
  art.generateMipmaps=true;

  const width=256, height=Math.round(canvas.height/canvas.width*width);
  const grid=document.createElement('canvas'); grid.width=width; grid.height=height;
  const gridContext=grid.getContext('2d', { willReadFrequently: true })!;
  gridContext.drawImage(canvas,0,0,width,height);
  const data=gridContext.getImageData(0,0,width,height).data;
  const lum=new Float32Array(width*height);
  for(let i=0;i<lum.length;i++) lum[i]=(data[i*4]*.2126+data[i*4+1]*.7152+data[i*4+2]*.0722)/255;
  const xx=new Float32Array(lum.length),xy=new Float32Array(lum.length),yy=new Float32Array(lum.length);
  for(let y=1;y<height-1;y++) for(let x=1;x<width-1;x++) {
    const i=y*width+x, gx=(lum[i+1]-lum[i-1])*.5,gy=(lum[i+width]-lum[i-width])*.5;
    xx[i]=gx*gx;xy[i]=gx*gy;yy[i]=gy*gy;
  }
  const jxx=blur(xx,width,height),jxy=blur(xy,width,height),jyy=blur(yy,width,height);
  const vectors=new Uint8Array(width*height*4);
  const velocityX=new Float32Array(lum.length),velocityY=new Float32Array(lum.length);
  const velocityRange=spec.radius*.55;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const i=y*width+x;
    const qx=(x/width*canvas.width-spec.core[0])/spec.radius;
    const qy=(y/height*canvas.height-spec.core[1])/spec.radius;
    const r=Math.max(.1,Math.hypot(qx,qy));
    const swirl=2.0/(r*r+.3);
    let vx=-qx*.58+qy*swirl, vy=-qy*.58-qx*swirl;
    const a=jxx[i],b=jxy[i],c=jyy[i];
    const coherence=Math.hypot(a-c,2*b)/(a+c+.00001);
    const normal=.5*Math.atan2(2*b,a-c),nx=Math.cos(normal),ny=Math.sin(normal);
    const across=vx*nx+vy*ny;
    // Project onto image isophotes; this carries the silk along its existing curves.
    vx-=nx*across*coherence*.82;vy-=ny*across*coherence*.82;
    const speed=spec.radius*(.16+.30/(r+.6));
    const length=Math.max(.0001,Math.hypot(vx,vy));
    velocityX[i]=vx/length*speed;velocityY[i]=vy/length*speed;
  }
  const smoothX=blur(blur(velocityX,width,height),width,height);
  const smoothY=blur(blur(velocityY,width,height),width,height);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const i=y*width+x,out=((height-1-y)*width+x)*4;
    vectors[out]=Math.round(Math.min(1,Math.max(0,.5+smoothX[i]/(2*velocityRange)))*255);
    vectors[out+1]=Math.round(Math.min(1,Math.max(0,.5+smoothY[i]/(2*velocityRange)))*255);
    vectors[out+2]=Math.round((emissionNoise(x/18,y/18)*.7+emissionNoise(x/7+9,y/7+17)*.3)*255);vectors[out+3]=255;
  }
  const flow=new THREE.DataTexture(vectors,width,height,THREE.RGBAFormat,THREE.UnsignedByteType);
  flow.minFilter=flow.magFilter=THREE.LinearFilter;flow.generateMipmaps=false;flow.needsUpdate=true;
  return {art,flow};
}
