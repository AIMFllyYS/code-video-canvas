#version 100
precision mediump float;

/** @resolution */
uniform vec2 u_resolution;

/**
 * @label Background
 * @color
 * @default #E8ECFA
 */
uniform vec3 u_background;

/**
 * @label Dot Color
 * @color
 * @default #68728F
 */
uniform vec3 u_dot_color;

/**
 * @label Grid Spacing
 * @default 20
 * @range 12, 32
 */
uniform float u_spacing;

/**
 * @label Dot Radius
 * @default 1
 * @range 0.5, 2
 */
uniform float u_radius;

/**
 * @label Dot Opacity
 * @default 0.24
 * @range 0.08, 0.5
 */
uniform float u_opacity;

void main() {
  vec2 cell = mod(gl_FragCoord.xy, u_spacing) - vec2(u_spacing * 0.5);
  float distance_to_dot = length(cell);
  float dot_mask = 1.0 - smoothstep(u_radius - 0.35, u_radius + 0.35, distance_to_dot);
  vec3 color = mix(u_background, u_dot_color, dot_mask * u_opacity);
  gl_FragColor = vec4(color, 1.0);
}
