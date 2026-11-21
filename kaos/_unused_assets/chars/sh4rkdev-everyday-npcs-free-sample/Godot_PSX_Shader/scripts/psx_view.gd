class_name PSXView
## Everyday NPCs - optional PS1 look for any 3D scene.
## Renders the 3D world into a low-resolution SubViewport (nearest upscale) and applies
## 15-bit colour + dithering. Characters/props get the psx_lit shader (vertex wobble,
## affine textures). Toggle with set_enabled().

const PSX_SHADER := preload("res://shaders/psx_lit.gdshader")
const POST_SHADER := preload("res://shaders/psx_post.gdshader")

static var enabled := true
static var _containers: Array = []

## Creates the screen under `host` and returns the Node3D to add 3D content to.
static func create(host: Node, shrink := 3) -> Node3D:
	var layer := CanvasLayer.new()
	layer.layer = -1
	host.add_child(layer)
	var box := SubViewportContainer.new()
	box.set_anchors_preset(Control.PRESET_FULL_RECT)
	box.stretch = true
	box.stretch_shrink = shrink if enabled else 1
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var mat := ShaderMaterial.new()
	mat.shader = POST_SHADER
	mat.set_shader_parameter("enabled", enabled)
	mat.set_shader_parameter("pixel_size", float(shrink))
	box.material = mat
	box.set_meta("shrink", shrink)
	layer.add_child(box)
	var vp := SubViewport.new()
	vp.handle_input_locally = false
	vp.audio_listener_enable_3d = true
	box.add_child(vp)
	var world := Node3D.new()
	world.name = "World"
	vp.add_child(world)
	_containers.append(box)
	return world

static func set_enabled(on: bool, root: Node) -> void:
	enabled = on
	for box in _containers:
		if is_instance_valid(box):
			box.stretch_shrink = box.get_meta("shrink") if on else 1
			(box.material as ShaderMaterial).set_shader_parameter("enabled", on)
	apply(root)

## Swaps textured materials under `node` to the PSX shader (or back).
static func apply(node: Node) -> void:
	for mi in node.find_children("*", "MeshInstance3D", true, false):
		var m := mi as MeshInstance3D
		if m.mesh == null:
			continue
		for s in m.mesh.get_surface_count():
			var cur := m.get_surface_override_material(s)
			var base: BaseMaterial3D = null
			if cur is BaseMaterial3D:
				base = cur
			elif cur is ShaderMaterial and cur.has_meta("base"):
				base = cur.get_meta("base")
			elif cur == null and m.mesh.surface_get_material(s) is BaseMaterial3D:
				base = m.mesh.surface_get_material(s)
			if base == null or base.albedo_texture == null:
				continue
			if enabled:
				var sm := ShaderMaterial.new()
				sm.shader = PSX_SHADER
				sm.set_shader_parameter("albedo_tex", base.albedo_texture)
				sm.set_shader_parameter("albedo_color", base.albedo_color)
				if base.emission_enabled and base.emission_texture:
					sm.set_shader_parameter("emission_tex", base.emission_texture)
					sm.set_shader_parameter("emission_energy", base.emission_energy_multiplier)
				sm.set_meta("base", base)
				m.set_surface_override_material(s, sm)
			else:
				m.set_surface_override_material(s, base if base != m.mesh.surface_get_material(s) else null)
