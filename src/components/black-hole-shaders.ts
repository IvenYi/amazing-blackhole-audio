export const vertexShader = `
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const fieldShader = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uZoom;
uniform float uCount;
uniform float uOrbSize;
uniform float uGlow;
uniform float uContrast;
uniform float uSplits;
uniform float uWarp;
uniform float uDistFade;
uniform vec3 uColorShift;
uniform float uColorRate;
uniform float uFade;
in vec2 vUv;
out vec4 fragColor;

const float TAU = 6.2831853;
const float PI = 3.14159265;

vec2 mirror(vec2 p, float seg) {
  float a = atan(p.y, p.x);
  a = ((a / PI) + 1.0) * 0.5;
  a = mod(a, 1.0 / seg) * seg;
  a = -abs(2.0 * a - 1.0) + 1.0;
  float r = length(p);
  a *= r;
  return vec2(a, r);
}

void main() {
  vec2 st = 2.0 * vUv - 1.0;
  st.x *= uRes.x / uRes.y;
  st *= uZoom;

  float dist = length(st);

  vec2 warpSt = uWarp > 0.5 ? st * mirror(st, uSplits) : st;
  float soft = max(length(fwidth(warpSt)) * 1.25, 0.0004);
  float swing = fwidth(PI / max(dist, 0.0001)) / uCount;

  vec3 acc = vec3(0.0);

  for (float i = 0.0; i < 30.0; i++) {
    if (i >= uCount) break;
    float t = uTime - i * PI / uCount * cos(uTime / max(i, 0.0001));
    float lens = sin(i / uCount * PI / dist + uTime);
    vec2 orb = vec2(cos(t), sin(t)) / (abs(lens) < 0.0001 ? 0.0001 : lens);
    vec3 hue = cos(uColorShift * TAU / PI + PI * (uTime / (i + 1.0) * uColorRate)) * uGlow + uGlow;
    vec2 gap = warpSt - orb * uOrbSize;
    float calm = 1.0 - smoothstep(0.9, 2.2, swing * i);
    acc += dist * uDistFade * inversesqrt(dot(gap, gap) + soft * soft) * hue * calm;
  }

  acc = pow(max(acc * uFade, 0.0), vec3(uContrast));
  fragColor = vec4(min(acc, vec3(1024.0)), 1.0);
}
`;

export const downsampleShader = `
precision highp float;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uFirst;
in vec2 vUv;
out vec4 fragColor;
vec3 tap(vec2 d) {
  vec3 c = texture(uSource, vUv + d * uTexel).rgb;
  if (uFirst > 0.5) c = clamp(c - 1.0, 0.0, 8.0);
  return c;
}
void main() {
  vec3 a = tap(vec2(-2.0, 2.0));
  vec3 b = tap(vec2(0.0, 2.0));
  vec3 c = tap(vec2(2.0, 2.0));
  vec3 d = tap(vec2(-2.0, 0.0));
  vec3 e = tap(vec2(0.0, 0.0));
  vec3 f = tap(vec2(2.0, 0.0));
  vec3 g = tap(vec2(-2.0, -2.0));
  vec3 h = tap(vec2(0.0, -2.0));
  vec3 i = tap(vec2(2.0, -2.0));
  vec3 j = tap(vec2(-1.0, 1.0));
  vec3 k = tap(vec2(1.0, 1.0));
  vec3 l = tap(vec2(-1.0, -1.0));
  vec3 m = tap(vec2(1.0, -1.0));
  vec3 color = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  fragColor = vec4(color, 1.0);
}
`;

export const upsampleShader = `
precision highp float;
uniform sampler2D uSource;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 fragColor;
vec3 tap(vec2 d) { return texture(uSource, vUv + d * uTexel).rgb; }
void main() {
  vec3 color = tap(vec2(0.0)) * 4.0
    + (tap(vec2(-1.0, 0.0)) + tap(vec2(1.0, 0.0)) + tap(vec2(0.0, -1.0)) + tap(vec2(0.0, 1.0))) * 2.0
    + tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0));
  fragColor = vec4(color / 16.0, 1.0);
}
`;

export const compositeShader = `
precision highp float;
uniform sampler2D uField;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uBloomStrength;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uLine;
uniform float uRing;
uniform float uTint;
uniform vec3 uLabA;
uniform vec3 uLabB;
uniform vec3 uCool;
uniform float uInk;
uniform vec3 uInkLab;
uniform vec3 uBg;
uniform float uSolid;
uniform float uAlpha;
uniform float uFrame;
in vec2 vUv;
out vec4 fragColor;

vec3 decode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 toLab(vec3 c) {
  vec3 lms = mat3(0.4122214708, 0.2119034982, 0.0883024619, 0.5363325363, 0.6806995451, 0.2817188376, 0.0514459929, 0.1073969566, 0.6299787005) * c;
  lms = pow(max(lms, 0.0), vec3(1.0 / 3.0));
  return mat3(0.2104542553, 1.9779984951, 0.0259040371, 0.793617785, -2.428592205, 0.7827717662, -0.0040720468, 0.4505937099, -0.808675766) * lms;
}

vec3 fromLab(vec3 lab) {
  vec3 lms = mat3(1.0, 1.0, 1.0, 0.3963377774, -0.1055613458, -0.0894841775, 0.2158037573, -0.0638541728, -1.291485548) * lab;
  lms = lms * lms * lms;
  return max(mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147, 0.2309699292, -0.3413193965, 1.707614701) * lms, 0.0);
}

vec3 knee(vec3 x) {
  vec3 u = max(x - 0.68, 0.0) / 0.32;
  return mix(x, 0.68 + 0.32 * (1.0 - pow(1.0 + u * 0.25, vec3(-4.0))), step(0.68, x));
}

float pearl(float e) {
  float sheen = clamp((log(max(e, 0.000001)) - 0.18232) / 4.19970, 0.0, 1.0);
  return 1.0 - 0.11 * (1.0 - pow(sheen, 0.7)) * smoothstep(0.8, 1.6, e);
}

float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec3 field = texture(uField, vUv).rgb;
  vec3 glow = texture(uBloom, vUv).rgb;
  vec2 offset = gl_FragCoord.xy - uCenter;
  float r = length(offset);
  float edge = r - uRadius;
  vec2 probe = (uCenter + offset / max(r, 0.0001) * uRadius * 1.22) / uRes;
  float near = dot(texture(uBloom, probe).rgb, vec3(0.3333)) * 0.25;
  float line = exp(-edge * edge / (uLine * uLine)) + 0.25 * exp(-abs(edge) / (uLine * 6.0));
  float halo = 1.0 - exp(-line * uRing * (0.14 + 0.9 * clamp(near, 0.0, 1.5)));
  vec3 base = knee(field) * pearl(dot(field, vec3(0.3333)));
  vec3 lift = 1.0 - exp(-glow * uBloomStrength);
  vec3 tone = 1.0 - (1.0 - base) * (1.0 - lift);
  float y = dot(tone, vec3(0.3333));
  float dither = (ign(gl_FragCoord.xy + uFrame * 5.588238) - 0.5) / 255.0;

  if (uInk > 0.5) {
    vec3 lab = toLab(decode(tone / max(max(tone.r, max(tone.g, tone.b)), 0.0001)));
    float chroma = length(lab.yz);
    vec2 hue = uTint < 0.5 && chroma > 0.03 ? lab.yz / chroma * clamp(chroma * 1.2, 0.07, 0.16) : uInkLab.yz;
    float cover = max(clamp(pow(y, 1.1) * 1.03 * clamp(y * 6.0, 0.0, 1.0), 0.0, 1.0), halo);
    vec3 ink = encode(fromLab(vec3(uInkLab.x + 0.4 * pow(1.0 - clamp(max(y, halo), 0.0, 1.0), 0.6), hue)));
    if (uSolid > 0.5) {
      fragColor = vec4(mix(uBg, ink, cover) + dither, uAlpha);
    } else {
      fragColor = vec4(ink, clamp(cover * uAlpha + dither, 0.0, 1.0));
    }
    return;
  }

  float shade = clamp(y / 0.12, 0.0, 1.0) * (1.0 - clamp((y - 0.3) / 0.45, 0.0, 1.0));
  vec3 color;
  if (uTint > 0.5) {
    color = encode(fromLab(mix(uLabB, uLabA, smoothstep(0.45, 0.99, y)))) * y;
  } else {
    color = tone * mix(vec3(1.0), uCool, shade);
  }

  float cover = max(clamp(y * 6.0, 0.0, 1.0), halo);
  color = 1.0 - (1.0 - color) * (1.0 - halo);
  if (uSolid > 0.5) {
    fragColor = vec4(mix(uBg, color, cover) + dither, uAlpha);
  } else {
    fragColor = vec4(color, clamp(cover * uAlpha + dither, 0.0, 1.0));
  }
}
`;
