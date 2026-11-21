// Everyday NPCs - PS1-style material: vertex snapping (wobble), affine texture mapping,
// per-vertex lighting and nearest filtering. Works with the skinned characters and props.
shader_type spatial;
render_mode vertex_lighting, diffuse_lambert, specular_disabled, cull_back;

uniform sampler2D albedo_tex : source_color, filter_nearest, repeat_disable;
uniform vec4 albedo_color : source_color = vec4(1.0);
uniform sampler2D emission_tex : source_color, filter_nearest, hint_default_black;
uniform float emission_energy = 1.0;
uniform vec2 snap_resolution = vec2(320.0, 240.0); // virtual PS1 screen for vertex snapping
uniform float affine_amount : hint_range(0.0, 1.0) = 1.0; // 0 = perspective-correct, 1 = PS1 warping

varying vec3 affine_uv;

void vertex() {
	vec4 clip = PROJECTION_MATRIX * MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	vec2 half_res = snap_resolution * 0.5;
	clip.xy = round(clip.xy / clip.w * half_res) / half_res * clip.w;
	POSITION = clip;
	affine_uv = vec3(UV * clip.w, clip.w);
}

void fragment() {
	vec2 uv = mix(UV, affine_uv.xy / affine_uv.z, affine_amount);
	vec4 tex = texture(albedo_tex, uv) * albedo_color;
	ALBEDO = tex.rgb;
	EMISSION = texture(emission_tex, uv).rgb * emission_energy;
}
