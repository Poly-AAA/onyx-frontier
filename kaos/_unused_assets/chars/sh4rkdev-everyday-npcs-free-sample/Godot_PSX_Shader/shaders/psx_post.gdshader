// Everyday NPCs - PS1 screen: 15-bit colour (5 bits per channel) with 4x4 ordered dithering.
shader_type canvas_item;
uniform float color_depth = 32.0;   // levels per channel (PS1 = 32)
uniform float dither_strength = 1.0;
uniform bool enabled = true;
uniform float pixel_size = 3.0;  // matches the SubViewport shrink

const mat4 BAYER = mat4(vec4(0.0, 8.0, 2.0, 10.0), vec4(12.0, 4.0, 14.0, 6.0),
		vec4(3.0, 11.0, 1.0, 9.0), vec4(15.0, 7.0, 13.0, 5.0));

void fragment() {
	vec4 c = texture(TEXTURE, UV);
	if (enabled) {
		ivec2 p = ivec2(mod(floor(FRAGCOORD.xy / pixel_size), 4.0));
		float d = (BAYER[p.x][p.y] / 16.0 - 0.5) * dither_strength / color_depth;
		c.rgb = floor((c.rgb + d) * (color_depth - 1.0) + 0.5) / (color_depth - 1.0);
	}
	COLOR = c;
}
