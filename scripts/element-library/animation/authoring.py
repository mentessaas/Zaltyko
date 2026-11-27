"""Helpers for writing specs: inverse kinematics so feet/hands land exactly where they should."""
import math
import figure3  # noqa: F401  (sets the real body lengths in figure.L)
from figure import Pose, v, L
from engine2 import pin

def _ang(dx, dy): return math.degrees(math.atan2(dx, -dy))

def ik2(root, target, l1, l2, bend_side, prefer=None):
    """Two-link IK in screen space. bend_side=+1 puts the middle joint to the left of root->target.
    Returns (angle1, angle2) absolute (0 = up, 90 = right)."""
    dx, dy = target[0] - root[0], target[1] - root[1]; d = math.hypot(dx, dy)
    d = min(d, l1 + l2 - 1e-6); d = max(d, abs(l1 - l2) + 1e-6)
    base = _ang(dx, dy)
    cos_a = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d); a = math.degrees(math.acos(max(-1, min(1, cos_a))))
    a1 = base - bend_side * a
    j = (root[0] + math.sin(math.radians(a1)) * l1, root[1] - math.cos(math.radians(a1)) * l1)
    a2 = _ang(target[0] - j[0], target[1] - j[1])
    return a1, a2

def leg_to(pose_d, pelvis, side, toe_target, facing):
    """Set leg `side` ('n'/'f') of pose dict so its toe tip touches toe_target; knee bends backward."""
    l1, l2 = L['th'], L['sh'] + L['toe']
    # knee must sit on the FRONT side of the hip->toe line (so the shin goes back): for facing +1
    # (front = +x) with the leg pointing down, front is to the left of the direction -> bend_side -1
    a1, a2 = ik2(pelvis, toe_target, l1, l2, bend_side=facing)
    pose_d['leg_' + side] = [round(a1 % 360, 2), round(a2 % 360, 2)]
    return pose_d

def pelvis_of(pose_d, joint, point):
    p = Pose(torso=pose_d['torso'], arm_n=tuple(pose_d['arm_n']), arm_f=tuple(pose_d['arm_f']), leg_n=tuple(pose_d['leg_n']),
             leg_f=tuple(pose_d['leg_f']), head=pose_d.get('head', 0))
    return pin(p, joint, point)
