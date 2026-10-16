"""The villager skeleton: the bones the game's dress and pose layers expect
(src/render/figureBody.ts BONE_NAMES) plus a clavicle per shoulder and a toe
(ball) joint per foot — the foot is never one rigid block (work-order "glTF
villager body", final state 7).

Every bone's head is a MakeHuman joint (the centroid of a `joint-*` vertex
group of the base mesh), so the skeleton follows each morph exactly as
MakeHuman's own rigs do.

The trunk is three segments over a short pelvis (natural-villager-motion
concept step 2): `hips` (pelvis → lumbar), `spine` (MakeHuman spine_01),
`spine1` (spine_02) and `chest` (spine_03), each with its own pivot, so a lean
spread over them curves the back instead of folding it at one joint.
"""

# name, parent, MakeHuman joint group of the head, joint group (or None) of the tail
BONES = [
    ('hips', None, 'joint-pelvis', 'joint-spine-4'),
    ('spine', 'hips', 'joint-spine-4', 'joint-spine-3'),
    ('spine1', 'spine', 'joint-spine-3', 'joint-spine-2'),
    ('chest', 'spine1', 'joint-spine-2', 'joint-neck'),
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
        'pelvis': 'hips', 'spine_01': 'spine', 'spine_02': 'spine1', 'spine_03': 'chest', 'neck_01': 'neck', 'head': 'head',
        'clavicle': 'shoulder' + side, 'upperarm': 'upperArm' + side, 'lowerarm': 'forearm' + side, 'hand': 'hand' + side,
        'thigh': 'thigh' + side, 'calf': 'shin' + side, 'foot': 'foot' + side, 'ball': 'toe' + side,
    }.get(base)


# Retarget sources: villager bone -> source bone, per animation library.
UAL1 = {
    'hips': 'DEF-hips', 'spine': 'DEF-spine.001', 'spine1': 'DEF-spine.002', 'chest': 'DEF-spine.003', 'neck': 'DEF-neck', 'head': 'DEF-head',
    'shoulder.L': 'DEF-shoulder.L', 'upperArm.L': 'DEF-upper_arm.L', 'forearm.L': 'DEF-forearm.L', 'hand.L': 'DEF-hand.L',
    'shoulder.R': 'DEF-shoulder.R', 'upperArm.R': 'DEF-upper_arm.R', 'forearm.R': 'DEF-forearm.R', 'hand.R': 'DEF-hand.R',
    'thigh.L': 'DEF-thigh.L', 'shin.L': 'DEF-shin.L', 'foot.L': 'DEF-foot.L', 'toe.L': 'DEF-toe.L',
    'thigh.R': 'DEF-thigh.R', 'shin.R': 'DEF-shin.R', 'foot.R': 'DEF-foot.R', 'toe.R': 'DEF-toe.R',
}
# Quaternius Universal Animation Library 2 (UE-style mannequin names): the same
# one-to-one trunk (spine_01/02/03). Pinned for the clip library; no game clip
# reads it yet. OPEN: its bones lie along their local x (the UE convention), not
# y as clips.reference assumes for the limbs — check before the first UAL2 clip.
UAL2 = {
    'hips': 'pelvis', 'spine': 'spine_01', 'spine1': 'spine_02', 'chest': 'spine_03', 'neck': 'neck_01', 'head': 'Head',
    'shoulder.L': 'clavicle_l', 'upperArm.L': 'upperarm_l', 'forearm.L': 'lowerarm_l', 'hand.L': 'hand_l',
    'shoulder.R': 'clavicle_r', 'upperArm.R': 'upperarm_r', 'forearm.R': 'lowerarm_r', 'hand.R': 'hand_r',
    'thigh.L': 'thigh_l', 'shin.L': 'calf_l', 'foot.L': 'foot_l', 'toe.L': 'ball_l',
    'thigh.R': 'thigh_r', 'shin.R': 'calf_r', 'foot.R': 'foot_r', 'toe.R': 'ball_r',
}
# Bones whose rest DIRECTION is aligned before retargeting (limbs: the source
# stands in a T-pose, the villager in MakeHuman's A-pose); the trunk keeps its
# rest orientation (both stand upright, facing +z).
LIMBS = {n for n in NAMES if n.split('.')[0] in ('shoulder', 'upperArm', 'forearm', 'hand', 'thigh', 'shin', 'foot', 'toe')}
