"""The villager skeleton: the bones the game's dress and pose layers expect
(src/render/figureBody.ts BONE_NAMES) plus a clavicle per shoulder and a toe
(ball) joint per foot — the foot is never one rigid block (work-order "glTF
villager body", final state 7).

Every bone's head is a MakeHuman joint (the centroid of a `joint-*` vertex
group of the base mesh), so the skeleton follows each morph exactly as
MakeHuman's own rigs do.
"""

# name, parent, MakeHuman joint group of the head, joint group (or None) of the tail
BONES = [
    ('hips', None, 'joint-pelvis', 'joint-spine-2'),
    ('spine', 'hips', 'joint-pelvis', 'joint-spine-2'),
    ('chest', 'spine', 'joint-spine-2', 'joint-neck'),
    ('neck', 'chest', 'joint-neck', 'joint-head'),
    ('head', 'neck', 'joint-head', 'joint-head-2'),
    ('upperArm.L', 'shoulder.L', 'joint-l-shoulder', 'joint-l-elbow'),
    ('forearm.L', 'upperArm.L', 'joint-l-elbow', 'joint-l-hand'),
    ('hand.L', 'forearm.L', 'joint-l-hand', 'joint-l-hand-3'),
    ('upperArm.R', 'shoulder.R', 'joint-r-shoulder', 'joint-r-elbow'),
    ('forearm.R', 'upperArm.R', 'joint-r-elbow', 'joint-r-hand'),
    ('hand.R', 'forearm.R', 'joint-r-hand', 'joint-r-hand-3'),
    ('thigh.L', 'hips', 'joint-l-upper-leg', 'joint-l-knee'),
    ('shin.L', 'thigh.L', 'joint-l-knee', 'joint-l-ankle'),
    ('foot.L', 'shin.L', 'joint-l-ankle', 'joint-l-foot-1'),
    ('thigh.R', 'hips', 'joint-r-upper-leg', 'joint-r-knee'),
    ('shin.R', 'thigh.R', 'joint-r-knee', 'joint-r-ankle'),
    ('foot.R', 'shin.R', 'joint-r-ankle', 'joint-r-foot-1'),
    ('shoulder.L', 'chest', 'joint-l-clavicle', 'joint-l-shoulder'),
    ('shoulder.R', 'chest', 'joint-r-clavicle', 'joint-r-shoulder'),
    ('toe.L', 'foot.L', 'joint-l-foot-1', 'joint-l-toe-2-4'),
    ('toe.R', 'foot.R', 'joint-r-foot-1', 'joint-r-toe-2-4'),
]
NAMES = [b[0] for b in BONES]
PARENT = {b[0]: b[1] for b in BONES}
INDEX = {n: i for i, n in enumerate(NAMES)}


def topo_order():
    """Bone indices with every parent before its children."""
    out, seen = [], set()

    def add(n):
        if n in seen:
            return
        if PARENT[n]:
            add(PARENT[n])
        seen.add(n)
        out.append(INDEX[n])

    for n in NAMES:
        add(n)
    return out


# MakeHuman game_engine rig bone -> villager bone (weights are summed).
def weight_target(mh_bone):
    side = '.L' if mh_bone.endswith('_l') else '.R' if mh_bone.endswith('_r') else ''
    base = mh_bone[:-2] if side else mh_bone
    if base in ('thumb_01', 'thumb_02', 'thumb_03') or base.split('_')[0] in ('index', 'middle', 'ring', 'pinky'):
        return 'hand' + side
    return {
        'pelvis': 'hips', 'spine_01': 'spine', 'spine_02': 'spine', 'spine_03': 'chest', 'neck_01': 'neck', 'head': 'head',
        'clavicle': 'shoulder' + side, 'upperarm': 'upperArm' + side, 'lowerarm': 'forearm' + side, 'hand': 'hand' + side,
        'thigh': 'thigh' + side, 'calf': 'shin' + side, 'foot': 'foot' + side, 'ball': 'toe' + side,
    }.get(base)


# Retarget sources: villager bone -> source bone, per animation library.
UAL1 = {
    'hips': 'DEF-hips', 'spine': 'DEF-spine.001', 'chest': 'DEF-spine.003', 'neck': 'DEF-neck', 'head': 'DEF-head',
    'shoulder.L': 'DEF-shoulder.L', 'upperArm.L': 'DEF-upper_arm.L', 'forearm.L': 'DEF-forearm.L', 'hand.L': 'DEF-hand.L',
    'shoulder.R': 'DEF-shoulder.R', 'upperArm.R': 'DEF-upper_arm.R', 'forearm.R': 'DEF-forearm.R', 'hand.R': 'DEF-hand.R',
    'thigh.L': 'DEF-thigh.L', 'shin.L': 'DEF-shin.L', 'foot.L': 'DEF-foot.L', 'toe.L': 'DEF-toe.L',
    'thigh.R': 'DEF-thigh.R', 'shin.R': 'DEF-shin.R', 'foot.R': 'DEF-foot.R', 'toe.R': 'DEF-toe.R',
}
# Bones whose rest DIRECTION is aligned before retargeting (limbs: the source
# stands in a T-pose, the villager in MakeHuman's A-pose); the trunk keeps its
# rest orientation (both stand upright, facing +z).
LIMBS = {n for n in NAMES if n.split('.')[0] in ('shoulder', 'upperArm', 'forearm', 'hand', 'thigh', 'shin', 'foot', 'toe')}
