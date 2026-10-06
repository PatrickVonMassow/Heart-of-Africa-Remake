"""Forward kinematics and linear-blend skinning on the villager skeleton, in
numpy — the same arithmetic three.js does in the game (rest rotations are the
identity; a bone's rest offset is its head minus its parent's head)."""
import numpy as np

import skeleton as SK
from gltfio import qmul, qnorm, qrot, qmat

ORDER = SK.topo_order()
PARENT_IDX = [SK.INDEX[SK.PARENT[n]] if SK.PARENT[n] else -1 for n in SK.NAMES]


def heads(joints):
    """Rest heads (n × 3) from a joints array (n × 6: head, tail)."""
    return joints[:, :3]


def fk(joints, local_q, root_pos=None):
    """World rotations and head positions for local rotations (n × 4).
    `root_pos` replaces the hips' rest position (the clip's translation)."""
    h = heads(joints)
    n = len(SK.NAMES)
    wr = [None] * n
    wp = [None] * n
    for i in ORDER:
        p = PARENT_IDX[i]
        if p < 0:
            wr[i] = qnorm(local_q[i])
            wp[i] = h[i].copy() if root_pos is None else np.asarray(root_pos, float)
        else:
            wr[i] = qnorm(qmul(wr[p], local_q[i]))
            wp[i] = wp[p] + qrot(wr[p], h[i] - h[p])
    return np.array(wr), np.array(wp)


def skin(verts, jidx, jw, joints, wr, wp):
    """Skinned positions: Σ w · (R_b (v − rest_b) + p_b)."""
    h = heads(joints)
    out = np.zeros_like(verts)
    for k in range(4):
        b = jidx[:, k]
        w = jw[:, k]
        R = np.array([qmat(q) for q in wr])  # n × 3 × 3
        rel = verts - h[b]
        moved = np.einsum('vij,vj->vi', R[b], rel) + wp[b]
        out += w[:, None] * moved
    return out


def point_on(bone, local, wr, wp):
    """A point given in a bone's rest-aligned frame (offset from its head)."""
    i = SK.INDEX[bone]
    return wp[i] + qrot(wr[i], local)
