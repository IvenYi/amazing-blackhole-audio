/** V3: moving filaments and smoke wakes illuminate the same dark horizon. */
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
vec3 softMaterial(sampler2D field,vec2 uv,vec2 size) {
  vec2 stepUv=vec2(7.0)/size;
  return (texture(field,uv).rgb*4.0+texture(field,uv+vec2(stepUv.x,0)).rgb+texture(field,uv-vec2(stepUv.x,0)).rgb
    +texture(field,uv+vec2(0,stepUv.y)).rgb+texture(field,uv-vec2(0,stepUv.y)).rgb)/8.0;
}
vec3 sampleFlow(sampler2D art,sampler2D material,vec2 pixel,vec2 imageSize,vec2 core,float radius,float angle,float opening,vec4 bounds) {
  vec2 uv=imageUv(pixel,imageSize,bounds);
  vec3 reference=textureLod(art,uv,0.0).rgb;
  if(uTime<.0001) return reference;
  vec2 q=(pixel-core)/radius;
  float r=length(q);
  float c=cos(angle),s=sin(angle);
  vec2 plane=mat2(c,-s,s,c)*q;
  float front=(1.0-smoothstep(-.05,.25,-plane.y))*(1.0-smoothstep(.35,.9,opening));
  float mask=max(smoothstep(1.01,1.12,r),front);
  float envelope=smoothstep(.025,.18,dot(reference,vec3(.333)));
  vec3 emission=texture(material,uv).rgb*envelope;
  vec3 soft=softMaterial(material,uv,imageSize)*envelope;
  // Bright heads stretch the underlying silk locally in the direction of capture.
  // This small deformation follows the moving material; no global image rocking.
  vec2 tangent=vec2(-q.x*.5+q.y,-q.y*.5-q.x);
  tangent/=max(length(tangent),.001);
  vec2 shifted=imageUv(pixel-tangent*radius*min(emission.r*.045,.018),imageSize,bounds);
  vec3 silk=textureLod(art,shifted,0.0).rgb;
  float edgeDistance=min(min(pixel.x-bounds.x,bounds.z-pixel.x),min(pixel.y-bounds.y,bounds.w-pixel.y));
  float guard=smoothstep(0.0,radius*.23,edgeDistance);
  vec3 light=mix(reference,silk,mask*guard*.80);
  light*=mix(1.0,.72+.30*smoothstep(.015,.40,soft.r),mask*guard);
  light+=(emission*.65+soft*.30)*mask*guard;
  // Incoming highlights and their shadow wakes are sampled from the actual
  // emitter pass, so the dark core and its rim react to the same moving light.
  vec2 direction=q/max(r,.001);
  vec2 rimUv=imageUv(core+direction*radius*1.105,imageSize,bounds);
  vec2 shadowDirection=mat2(.988,-.154,.154,.988)*direction;
  vec2 shadowUv=imageUv(core+shadowDirection*radius*1.105,imageSize,bounds);
  float incident=dot(softMaterial(material,rimUv,imageSize),vec3(.333));
  float shadow=dot(softMaterial(material,shadowUv,imageSize),vec3(.333));
  float gain=clamp(1.0+incident*2.2-shadow*.85,.78,1.85);
  float rim=exp(-pow((r-1.015)/.048,2.0))*(1.0-front);
  light*=mix(1.0,gain,rim);
  light=mix(reference*mix(1.0,gain,rim),light,mask);
  return mix(reference,light,smoothstep(0.0,1.0,uTime));
}

vec3 phoneArt(sampler2D art, sampler2D field, vec4 rect, vec2 core, float radius, vec2 limits, float angle, float opening) {
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
  return sampleFlow(art,field,pixel,vec2(1024,1536),core,radius,angle,opening,vec4(rect.x+8.0,limits.x+12.0,rect.x+rect.z-8.0,limits.y-12.0))*mask;
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
    if(mask>.0001 && uWeights.x+uWeights.w>.001) light=sampleFlow(uDesktop,uFlowDesktop,pixel,vec2(1536,1024),vec2(1262,388),277.0,0.0,1.0,vec4(405,165,1496,680))*mask*(uWeights.x+uWeights.w);
    if(uWeights.y+uWeights.z>.001) light+=phoneArt(uRecording,uFlowRecording,vec4(151,55,721,1418),vec2(518,606),177.0,vec2(215,870),-.30,1.0)*(uWeights.y+uWeights.z);
  } else {
    if(uWeights.x>.001) light+=phoneArt(uHome,uFlowHome,vec4(176,55,675,1415),vec2(846,496),300.0,vec2(185,875),-.12,1.0)*uWeights.x;
    if(uWeights.y+uWeights.z>.001) light+=phoneArt(uRecording,uFlowRecording,vec4(151,55,721,1418),vec2(518,606),177.0,vec2(215,870),-.30,1.0)*(uWeights.y+uWeights.z);
    if(uWeights.w>.001) light+=phoneArt(uPlayback,uFlowPlayback,vec4(175,55,676,1415),vec2(508,653),153.0,vec2(355,890),-.34,.27)*uWeights.w;
  }
  // Preserve the original full glow envelope and keep output in the silver palette.
  fragColor=vec4(max(light*uEnergy,vec3(.012)),1.0);
}
`;
