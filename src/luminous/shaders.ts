/** V2: image-aligned material advection transports the actual smoke and silk detail. */
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
vec2 velocity(sampler2D field,vec2 point,vec2 size,vec4 bounds,float radius) {
  return (texture(field,imageUv(point,size,bounds)).rg*2.0-1.0)*radius*.55;
}
vec2 trace(sampler2D field,vec2 point,vec2 size,vec4 bounds,float radius,float age) {
  float stepTime=age/3.0;
  for(int i=0;i<3;i++) {
    vec2 first=velocity(field,point,size,bounds,radius);
    vec2 midpoint=point-first*stepTime*.5;
    point-=velocity(field,midpoint,size,bounds,radius)*stepTime;
  }
  return imageUv(point,size,bounds);
}
vec3 sampleFlow(sampler2D art,sampler2D field,vec2 pixel,vec2 imageSize,vec2 core,float radius,float angle,float opening,vec4 bounds) {
  vec2 uv=imageUv(pixel,imageSize,bounds);
  vec3 reference=textureLod(art,uv,0.0).rgb;
  if(uTime<.0001 || max(reference.r,max(reference.g,reference.b))<.009) return reference;
  vec2 q=(pixel-core)/radius;
  float c=cos(angle),s=sin(angle);
  vec2 plane=mat2(c,-s,s,c)*q;
  float front=(1.0-smoothstep(-.05,.25,-plane.y))*(1.0-smoothstep(.35,.9,opening));
  float mask=max(smoothstep(1.025,1.18,length(q)),front);
  if(mask<.001) return reference;
  // Material texels, not just their brightness, travel along the measured silk field.
  float edgeDistance=min(min(pixel.x-bounds.x,bounds.z-pixel.x),min(pixel.y-bounds.y,bounds.w-pixel.y));
  float guard=smoothstep(0.0,radius*.30,edgeDistance);
  float phase=fract(uTime/1.35);
  vec2 uvA=trace(field,pixel,imageSize,bounds,radius,phase*1.35*guard);
  vec2 uvB=trace(field,pixel,imageSize,bounds,radius,fract(phase+.5)*1.35*guard);
  float blend=.5+.5*cos(phase*6.28318530718);
  vec3 a=textureLod(art,uvA,0.0).rgb,b=textureLod(art,uvB,0.0).rgb;
  vec3 lowA=textureLod(art,uvA,3.5).rgb,lowB=textureLod(art,uvB,3.5).rgb;
  vec3 low=textureLod(art,uv,3.5).rgb;
  // Anchor the broad glow; transport the actual smoke and filament detail at full resolution.
  vec3 movingLow=mix(lowA,lowB,blend);
  vec3 fine=mix(a-lowA,b-lowB,blend);
  vec3 light=low+fine+(movingLow-low)*.22;
  // Irregular light concentrations travel with the material, giving the eye a
  // direction to follow. They are carried by the same field, without radial bands.
  float packet=mix(texture(field,uvA).b,texture(field,uvB).b,blend);
  light*=.80+.42*smoothstep(.22,.78,packet);
  light=max(light,vec3(0));
  return mix(reference,light,mask*guard*.85*smoothstep(0.0,1.0,uTime));
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
  // The source already contains complete, art-directed glow. Keep its luminance intact.
  fragColor=vec4(max(light*uEnergy,vec3(.012)),1.0);
}
`;
