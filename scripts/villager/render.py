"""Frame sheets: headless Workbench renders of skinned villagers (game coords,
y up) for judging by eye — side view, front view, filmstrips of a clip."""
import math

import bpy
import numpy as np


def _to_blender(v):
    v = np.asarray(v, float)
    return np.stack([v[:, 0], -v[:, 2], v[:, 1]], 1)


def clear():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)


def add_mesh(name, verts, tris, rgba):
    me = bpy.data.meshes.new(name)
    me.from_pydata(_to_blender(verts).tolist(), [], np.asarray(tris).tolist())
    me.shade_flat() if hasattr(me, 'shade_flat') else None
    ob = bpy.data.objects.new(name, me)
    ob.color = rgba
    bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    return ob


def ground(x0, x1, z0, z1, y=0.0, rgba=(0.55, 0.5, 0.42, 1)):
    v = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]
    v2 = [[x0, y - 0.02, z0], [x1, y - 0.02, z0], [x1, y - 0.02, z1], [x0, y - 0.02, z1]]
    verts = v + v2
    tris = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]]
    return add_mesh('ground', verts, tris, rgba)


def render(path, center, size, view='side', res=(1600, 800), elevation=0.0):
    """Orthographic render. `view`: 'side' looks along −x at the figure's left
    side (+z to the right), 'front' looks along −z at its face, 'back',
    'other' (+x right), or an azimuth in degrees. `center` (game coords) and
    `size` (ortho width, figure units) frame the shot."""
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'OBJECT'
    sc.display.shading.show_cavity = True
    sc.display.shading.show_shadows = False
    sc.display.shading.show_object_outline = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    sc.world = sc.world or bpy.data.worlds.new('w')
    sc.display.shading.background_type = 'VIEWPORT'
    sc.display.shading.background_color = (0.86, 0.88, 0.9)
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = size
    cam = bpy.data.objects.new('cam', cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    az = {'side': 90.0, 'front': 0.0, 'back': 180.0, 'other': -90.0}.get(view, view)
    a = math.radians(float(az))
    e = math.radians(elevation)
    # camera position in game coords: on the figure's +z (front) for az 0, +x (left) for 90
    d = 20.0
    cx, cy, cz = center
    pos = (cx + d * math.sin(a) * math.cos(e), cy + d * math.sin(e), cz + d * math.cos(a) * math.cos(e))
    b = _to_blender([pos])[0]
    cam.location = b.tolist()
    tgt = _to_blender([center])[0]
    direction = tgt - b
    from mathutils import Vector
    cam.rotation_euler = Vector(direction.tolist()).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
