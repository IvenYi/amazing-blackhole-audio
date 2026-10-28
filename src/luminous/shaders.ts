/** Fixed-view art material: approved artwork supplies the light; a spiral flow transports density. */
export const luminousField = `
precision highp float;
uniform sampler2D uHome;
uniform sampler2D uRecording;
uniform sampler2D uPlayback;
uniform sampler2D uDesktop;
uniform vec2 uResolution;
uniform vec4 uWeights;
uniform float uTime;
uniform float uEnergy;
in vec2 vUv;
out vec4 fragColor;

vec2 imageUv(vec2 pixel,vec2 size,vec4 bounds) {
  if(size.x>1500.0) pixel.y=max(pixel.y,mix(345.0,pixel.y,smoothstep(740.0,830.0,pixel.x)));
  vec2 uv=clamp(pixel,bounds.xy,bounds.zw)/size;
  return vec2(uv.x,1.0-uv.y);
}
float hash(vec2 p) {
  p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);
}
float noise(vec2 p) {
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float smoke(vec2 p) {
  return noise(p)*.55+noise(p*2.03+17.0)*.28+noise(p*4.07+9.2)*.17;
}
vec2 backtrace(vec2 point,float age) {
  float radius=max(length(point),.25);
  // Trace the material backwards through an inward spiral. Its angular speed rises
  // toward the horizon. This transports density instead of rocking the image.
  float inflow=.15;
  float turn=.72/pow(radius,1.5)*(1.0-exp(-1.5*inflow*age))/(1.5*inflow);
  float c=cos(turn),s=sin(turn);
  return mat2(c,-s,s,c)*point*exp(inflow*age);
}
vec2 flowDensity(vec2 point,float age) {
  vec2 origin=backtrace(point,age);
  float originalRadius=max(length(origin),.1);
  vec2 orbit=origin/originalRadius;
  float radial=log(originalRadius);
  // Elongate density along streamlines so it reads as smoke and silk, not speckle.
  float cloud=smoke(orbit*1.35+vec2(radial*8.0,radial*2.8));
  float phase=radial*195.0+smoke(orbit*2.0+radial)*9.0;
  float fibre=pow(.5+.5*sin(phase),6.0);
  fibre=mix(fibre,.225,smoothstep(.6,2.2,fwidth(phase)));
  return vec2(cloud,fibre);
}
vec3 sampleFlow(sampler2D art,vec2 pixel,vec2 imageSize,vec2 core,float radius,float angle,float opening,vec4 bounds) {
  vec3 reference=textureLod(art,imageUv(pixel,imageSize,bounds),0.0).rgb;
  if(uTime<.0001 || max(reference.r,max(reference.g,reference.b))<.009) return reference;
  vec2 point=(pixel-core)/radius;
  float r=length(point);
  float c=cos(angle),s=sin(angle);
  vec2 plane=mat2(c,-s,s,c)*point;
  float front=(1.0-smoothstep(-.05,.25,-plane.y))*(1.0-smoothstep(.35,.9,opening));
  vec2 flowPoint=mix(point,vec2(plane.x,plane.y/max(opening,.2)),front);
  // Stagger two bounded transport intervals; the reset happens at zero weight.
  // Cartesian sampling is periodic around the whole ring: no atan branch cut.
  float phase=fract(uTime/9.0);
  vec2 density=mix(flowDensity(flowPoint,phase*9.0),flowDensity(flowPoint,fract(phase+.5)*9.0),(.5+.5*cos(phase*6.28318530718)));
  float mask=max(smoothstep(.95,1.14,r),front);
  float cloud=smoothstep(.20,.80,density.x);
  float luminance=dot(reference,vec3(.2126,.7152,.0722));
  float gain=.72+cloud*.55;
  vec3 light=reference*gain;
  // Fine travelling strands are drawn at the canvas resolution, with derivative AA.
  light+=vec3((density.y-.23)*.025)*smoothstep(.04,.35,luminance)*mask;
  light=mix(reference,light,.90*mask);
  return mix(reference,light,smoothstep(0.0,1.1,uTime));
}

vec3 phoneArt(sampler2D art, vec4 rect, vec2 core, float radius, vec2 limits, float angle, float opening) {
  // Use a single scale in x/y so a taller viewport cannot squash the dark core.
  float artWidth=min(uResolution.x,uResolution.y*.60);
  float scale=artWidth/rect.z;
  float offset=(uResolution.y-rect.w*scale)*.38;
  vec2 pixel=vec2(rect.x+(gl_FragCoord.x-(uResolution.x-artWidth)*.5)/scale,rect.y+(uResolution.y-gl_FragCoord.y-offset)/scale);
  float sideMask=smoothstep(-3.0,0.0,pixel.x-rect.x)*(1.0-smoothstep(rect.z,rect.z+3.0,pixel.x-rect.x));
  float mask=sideMask*smoothstep(limits.x,limits.x+65.0,pixel.y)*(1.0-smoothstep(limits.y-75.0,limits.y,pixel.y));
  if(mask<.0001) return vec3(0);
  // Never sample typography, status bars, controls, or the phone enclosure from the source.
  pixel=clamp(pixel,vec2(rect.x+3.0,limits.x),vec2(rect.x+rect.z-3.0,limits.y));
  return sampleFlow(art,pixel,vec2(1024,1536),core,radius,angle,opening,vec4(rect.x+8.0,limits.x+12.0,rect.x+rect.z-8.0,limits.y-12.0))*mask;
}
void main() {
  vec3 light=vec3(0);
  if(uResolution.x/uResolution.y>1.05) {
    // Desktop has its own approved composition; it is not a stretched portrait.
    float scale=uResolution.x/1110.0;
    vec2 pixel=vec2(395.0+gl_FragCoord.x/scale,160.0+(uResolution.y-gl_FragCoord.y)/scale);
    float mask=smoothstep(160.0,220.0,pixel.y)*(1.0-smoothstep(635.0,690.0,pixel.y));
    // Exclude the title in the upper-left of the design image.
    mask*=max(smoothstep(680.0,780.0,pixel.x),smoothstep(300.0,365.0,pixel.y));
    pixel=clamp(pixel,vec2(398,160),vec2(1500,690));
    if(mask>.0001 && uWeights.x+uWeights.w>.001) light=sampleFlow(uDesktop,pixel,vec2(1536,1024),vec2(1262,388),277.0,0.0,1.0,vec4(405,165,1496,680))*mask*(uWeights.x+uWeights.w);
    if(uWeights.y+uWeights.z>.001) light+=phoneArt(uRecording,vec4(151,55,721,1418),vec2(518,606),177.0,vec2(215,870),-.30,1.0)*(uWeights.y+uWeights.z);
  } else {
    if(uWeights.x>.001) light+=phoneArt(uHome,vec4(176,55,675,1415),vec2(846,496),300.0,vec2(185,875),-.12,1.0)*uWeights.x;
    if(uWeights.y+uWeights.z>.001) light+=phoneArt(uRecording,vec4(151,55,721,1418),vec2(518,606),177.0,vec2(215,870),-.30,1.0)*(uWeights.y+uWeights.z);
    if(uWeights.w>.001) light+=phoneArt(uPlayback,vec4(175,55,676,1415),vec2(508,653),153.0,vec2(355,890),-.34,.27)*uWeights.w;
  }
  // The source already contains complete, art-directed glow. Keep its luminance intact.
  fragColor=vec4(max(light*uEnergy,vec3(.012)),1.0);
}
`;
