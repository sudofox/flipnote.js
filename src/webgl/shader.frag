precision mediump float;
varying vec2 v_texcoord;
uniform vec4 u_color1;
uniform vec4 u_color2;
uniform sampler2D u_bitmap;
uniform bool u_isSmooth;
uniform vec2 u_textureSize;
uniform vec2 u_screenSize;

void main() {
  vec2 texel = v_texcoord * u_textureSize.xy;
  vec2 texel_floored = floor(texel);
  vec2 s = fract(texel);
  float scale = floor(u_screenSize.y / u_textureSize.y + 0.01);
  float region_range = 0.5 - 0.5 / scale;
  vec2 center_dist = s - 0.5;
  vec2 f = (center_dist - clamp(center_dist, -region_range, region_range)) * scale + 0.5;
  vec2 mod_texel = texel_floored + f;
  vec2 coord = mod_texel.xy / u_textureSize.xy;

  vec2 colorWeights = texture2D(u_bitmap, coord).ra;
  gl_FragColor = vec4(u_color1.rgb, 1.0) * colorWeights.y + vec4(u_color2.rgb, 1.0) * colorWeights.x;
}
