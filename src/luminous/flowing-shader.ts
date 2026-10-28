/** V2.1: preserve the V2 material; advect the ribbon and curl its existing mist. */
export const luminousField = `
precision highp float;
uniform sampler2D uHome;
uniform sampler2D uRecording;
uniform sampler2D uPlayback;
uniform sampler2D uDesktop;
uniform sampler2D uFlowHome;
uniform sampler2D uFlowRecording;
uniform sampler2D uFlowPlayback;
uniform sampler2D uFlowDesktop;
uniform sampler2D uGuideHome;
uniform sampler2D uGuideRecording;
uniform sampler2D uGuidePlayback;
uniform sampler2D uGuideDesktop;
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
vec2 velocity(sampler2D guide,vec2 pixel,vec2 size,vec2 core,float radius,vec4 bounds) {
  vec2 v=(texture(guide,imageUv(pixel,size,bounds)).rg*2.0-1.0)*radius*.55;
  vec2 radial=(pixel-core)/max(length(pixel-core),.001);
  v-=radial*max(0.0,dot(v,radial)+radius*.075);
  return v;
}
vec3 sampleFlow(sampler2D art,sampler2D material,sampler2D guide,vec2 pixel,vec2 imageSize,vec2 core,float radius,float angle,float opening,vec4 bounds) {
  vec2 uv=imageUv(pixel,imageSize,bounds);
  vec3 reference=textureLod(art,uv,0.0).rgb;
  vec2 q=(pixel-core)/radius;
  float r=length(q),c=cos(angle),s=sin(angle);
  vec2 plane=mat2(c,-s,s,c)*q;
  float front=(1.0-smoothstep(-.05,.25,-plane.y))*(1.0-smoothstep(.35,.9,opening));
  float mask=max(smoothstep(1.01,1.12,r),front);
  float edge=min(min(pixel.x-bounds.x,bounds.z-pixel.x),min(pixel.y-bounds.y,bounds.w-pixel.y));
  float guard=smoothstep(0.0,radius*.26,edge);
  vec2 v=velocity(guide,pixel,imageSize,core,radius,bounds);
  vec2 tangent=v/max(length(v),.001),normal=vec2(-tangent.y,tangent.x);
  vec3 incoming=textureLod(material,uv,4.3).rgb;
  float drive=smoothstep(.005,.22,incoming.r);
  vec2 stepUv=vec2(radius*.075)/imageSize;
  float gx=textureLod(material,uv+vec2(stepUv.x,0),4.3).r-textureLod(material,uv-vec2(stepUv.x,0),4.3).r;
  float gy=textureLod(material,uv+vec2(0,stepUv.y),4.3).r-textureLod(material,uv-vec2(0,stepUv.y),4.3).r;
  vec2 curl=clamp(vec2(-gy,-gx),vec2(-1),vec2(1));
  float freeSpace=max(smoothstep(1.04,1.42,r),front*.45);
  // A broad travelling supply bends and pulls the actual original ribbon. The
  // full-resolution silk is sampled once, rather than replaced by generated hair.
  vec2 bend=normal*radius*.035*drive*freeSpace;
  vec2 origin=pixel-bend;
  float age=(.04+drive*.26)*mask*guard;
  vec2 midpoint=origin-velocity(guide,origin,imageSize,core,radius,bounds)*age*.5;
  origin-=velocity(guide,midpoint,imageSize,core,radius,bounds)*age;
  vec2 movedUv=imageUv(mix(pixel,origin,mask*guard),imageSize,bounds);
  vec3 moved=textureLod(art,movedUv,0.0).rgb;
  float luminance=dot(moved,vec3(.333));
  // Curl and diffusion affect the existing dim mist only. They never lay a gray
  // volume over the bright filaments or fill the original dark negative space.
  float mistMask=smoothstep(.012,.045,luminance)*(1.0-smoothstep(.10,.29,luminance));
  vec2 mistPixel=origin-v*.25+curl*radius*.045;
  vec2 mistUv=imageUv(mistPixel,imageSize,bounds);
  vec3 originalMist=textureLod(art,movedUv,2.1).rgb;
  vec3 diffusedMist=textureLod(art,mistUv,2.1+drive*.7).rgb;
  vec3 light=moved+(diffusedMist-originalMist)*mistMask*mask*guard*.42;
  light*=mix(1.0,.91+.12*drive,mask*guard);
  // Soft transported light replaces the conspicuous point-like emitter overlay.
  light+=incoming*.085*smoothstep(.035,.35,luminance)*mask*guard;
  vec2 direction=q/max(r,.001);
  vec2 rimUv=imageUv(core+direction*radius*1.10,imageSize,bounds);
  vec2 shadowDirection=mat2(.988,-.154,.154,.988)*direction;
  vec2 shadowUv=imageUv(core+shadowDirection*radius*1.10,imageSize,bounds);
  float incident=dot(textureLod(material,rimUv,2.8).rgb,vec3(.333));
  float shadow=dot(textureLod(material,shadowUv,2.8).rgb,vec3(.333));
  float rim=exp(-pow((r-1.015)/.058,2.0))*(1.0-front);
  float gain=clamp(1.0+incident*1.65-shadow*.7,.78,1.65);
  light*=mix(1.0,gain,rim);
  // Preserve V2's actual dark-core occlusion, including its foreground disk.
  light=mix(reference*mix(1.0,gain,rim),light,mask);
  return max(vec3(0),light);
}

vec3 phoneArt(sampler2D art, sampler2D field,sampler2D guide, vec4 rect, vec2 core, float radius, vec2 limits, float angle, float opening) {
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
  return sampleFlow(art,field,guide,pixel,vec2(1024,1536),core,radius,angle,opening,vec4(rect.x+8.0,limits.x+12.0,rect.x+rect.z-8.0,limits.y-12.0))*mask;
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
    if(mask>.0001 && uWeights.x+uWeights.w>.001) light=sampleFlow(uDesktop,uFlowDesktop,uGuideDesktop,pixel,vec2(1536,1024),vec2(1262,388),277.0,0.0,1.0,vec4(405,165,1496,680))*mask*(uWeights.x+uWeights.w);
    if(uWeights.y+uWeights.z>.001) light+=phoneArt(uRecording,uFlowRecording,uGuideRecording,vec4(151,55,721,1418),vec2(518,606),177.0,vec2(215,870),-.30,1.0)*(uWeights.y+uWeights.z);
  } else {
    if(uWeights.x>.001) light+=phoneArt(uHome,uFlowHome,uGuideHome,vec4(176,55,675,1415),vec2(846,496),300.0,vec2(185,875),-.12,1.0)*uWeights.x;
    if(uWeights.y+uWeights.z>.001) light+=phoneArt(uRecording,uFlowRecording,uGuideRecording,vec4(151,55,721,1418),vec2(518,606),177.0,vec2(215,870),-.30,1.0)*(uWeights.y+uWeights.z);
    if(uWeights.w>.001) light+=phoneArt(uPlayback,uFlowPlayback,uGuidePlayback,vec4(175,55,676,1415),vec2(508,653),153.0,vec2(355,890),-.34,.27)*uWeights.w;
  }
  // Preserve the original full glow envelope and keep output in the silver palette.
  fragColor=vec4(max(light*uEnergy,vec3(.012)),1.0);
}
`;
