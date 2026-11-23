"""Physics-aware animation engine for gymnastics pictograms.

Body model: absolute segment angles (0 = up, 90 = right) as in figure.Pose, plus `facing`
(+1 = chest toward +x when upright, -1 = toward -x). Shapes are stored RELATIVE to the torso so
that in flight the whole body can rotate rigidly around the centre of mass (COM).

Phases:
  contact: keyframed poses, one joint pinned to a fixed point (hands on bar, feet on floor...).
  flight : COM follows a parabola under gravity; body rotation obeys conservation of angular
           momentum (omega = L / I(shape)), so tucking speeds the rotation up.
"""
import math
from figure import Pose, v, add, L

PX_PER_M = 85.0                     # figure ~1.65 m tall ~ 140 px
G = 9.81 * PX_PER_M                 # px/s^2, +y is down
FPS = 30
SEG = ['arm_n', 'arm_f', 'leg_n', 'leg_f']
# segment masses (fraction of body), Dempster-like
MASS = dict(torso=0.497 + 0.081, ua=0.028, fa=0.022, th=0.100, sh=0.061)

def ease(u): return u * u * (3 - 2 * u)

# ---------- representation ----------
class Shape:
    """Pose relative to the torso: rel angles for upper/lower of each limb, plus head tilt."""
    def __init__(self, arm_n, arm_f, leg_n, leg_f, head=0.0, facing=1):
        self.arm_n, self.arm_f, self.leg_n, self.leg_f = arm_n, arm_f, leg_n, leg_f
        self.head, self.facing = head, facing
    @staticmethod
    def of(p, facing=1):
        r = lambda pair: (pair[0] - p.torso, pair[1] - p.torso)
        return Shape(r(p.arm_n), r(p.arm_f), r(p.leg_n), r(p.leg_f), p.head, facing)
    def pose(self, torso):
        a = lambda pair: (pair[0] + torso, pair[1] + torso)
        p = Pose(torso=torso, arm_n=a(self.arm_n), arm_f=a(self.arm_f), leg_n=a(self.leg_n), leg_f=a(self.leg_f), head=self.head)
        p.facing = self.facing
        return p

def lerp_shape(a, b, u):
    l = lambda x, y: x + (y - x) * u   # follow the direction written in the spec (validator catches impossible paths)
    pr = lambda p, q: (l(p[0], q[0]), l(p[1], q[1]))
    return Shape(pr(a.arm_n, b.arm_n), pr(a.arm_f, b.arm_f), pr(a.leg_n, b.leg_n), pr(a.leg_f, b.leg_f), l(a.head, b.head),
                 a.facing if u < 0.5 else b.facing)

# ---------- mechanics ----------
def com(p, pelvis=(0, 0)):
    j = p.joints(pelvis)
    mid = lambda a, b: ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    parts = [(mid(j['pelvis'], j['neck']), MASS['torso'])]
    for t in 'nf':
        parts += [(mid(j['sh' + t], j['el' + t]), MASS['ua']), (mid(j['el' + t], j['ha' + t]), MASS['fa']),
                  (mid(j['hip' + t], j['kn' + t]), MASS['th']), (mid(j['kn' + t], j['an' + t]), MASS['sh'])]
    m = sum(w for _, w in parts)
    return (sum(x * w for (x, _), w in parts) / m, sum(y * w for (_, y), w in parts) / m)

def inertia(shape):
    """Moment of inertia around the COM for a shape (relative units), from joint positions."""
    p = shape.pose(0); c = com(p); j = p.joints((0, 0))
    pts = [(j['pelvis'], .2), (j['neck'], .2), (j['head'], .08)]
    for t in 'nf':
        pts += [(j['el' + t], .02), (j['ha' + t], .015), (j['kn' + t], .07), (j['an' + t], .04)]
    return sum(w * ((x - c[0]) ** 2 + (y - c[1]) ** 2) for (x, y), w in pts)

def pelvis_for_com(p, target):
    c = com(p)
    return (target[0] - c[0], target[1] - c[1])

def pin(p, joint, point):
    j = p.joints((0, 0))
    return (point[0] - j[joint][0], point[1] - j[joint][1])

# ---------- timeline ----------
class Timeline:
    def __init__(self):
        self.frames = []        # (pose, pelvis, meta)
    def add(self, pose, pelvis, **meta): self.frames.append((pose, pelvis, meta))
    @property
    def last(self): return self.frames[-1]

def contact(tl, keys, joint, point, surface=None):
    """keys: [(duration_from_prev, torso_angle, Shape)]; first key duration ignored if timeline not empty."""
    t_tot = 0
    for i in range(1, len(keys)):
        dur, (t0, s0), (t1, s1) = keys[i][0], keys[i - 1][1:], keys[i][1:]
        n = max(1, round(dur * FPS))
        for f in range(1 if (tl.frames or i > 1) else 0, n + 1):
            u = ease(f / n)
            sh = lerp_shape(s0, s1, u); p = sh.pose(t0 + (t1 - t0) * u)
            tl.add(p, pin(p, joint, point), contact=(joint, point), surface=surface)

def flight(tl, duration, shapes, rotation, land_joint, land_point, land_torso, surface=None, apex_y=None):
    """Ballistic flight from the last frame to a landing where `land_joint` touches `land_point`.
    shapes: [(u in 0..1, Shape)] along the flight. rotation: total body rotation in degrees
    (sign = direction). The landing frame's torso angle = start torso + rotation (checked)."""
    p0, pel0, _ = tl.last
    c0 = add(pel0, com(p0))
    end_shape = shapes[-1][1]
    end_pose = end_shape.pose(land_torso)
    pel1 = pin(end_pose, land_joint, land_point); c1 = add(pel1, com(end_pose))
    if apex_y is not None:                    # flight defined by how high the COM rises
        h0, h1 = c0[1] - apex_y, c1[1] - apex_y
        assert h0 >= 0 and h1 >= 0, 'apex must be above both ends'
        T = math.sqrt(2 * h0 / G) + math.sqrt(2 * h1 / G)
    else:
        T = duration
    n = max(2, round(T * FPS))
    vx = (c1[0] - c0[0]) / T; vy = (c1[1] - c0[1] - 0.5 * G * T * T) / T
    # angular momentum so that integral of omega dt = rotation
    def shape_at(u):
        k = max(i for i in range(len(shapes)) if shapes[i][0] <= u) if u > 0 else 0
        if k >= len(shapes) - 1: return shapes[-1][1]
        (ua, sa), (ub, sb) = shapes[k], shapes[k + 1]
        return lerp_shape(sa, sb, ease((u - ua) / (ub - ua)))
    inv = [1 / inertia(shape_at(f / n)) for f in range(n + 1)]
    integral = sum((inv[f] + inv[f + 1]) / 2 for f in range(n)) / n
    Lm = rotation / integral
    ang = p0.torso
    for f in range(1, n + 1):
        u = f / n; t = u * T
        ang += Lm * (inv[f - 1] + inv[f]) / 2 / n
        sh = shape_at(u); p = sh.pose(ang)
        c = (c0[0] + vx * t, c0[1] + vy * t + 0.5 * G * t * t)
        tl.add(p, pelvis_for_com(p, c), flight=True, surface=surface)
    # snap exactly to the landing contact
    p, _, meta = tl.frames[-1]
    tl.frames[-1] = (p, pin(p, land_joint, land_point), dict(meta, contact=(land_joint, land_point)))
    return dict(takeoff_v=(round(vx / PX_PER_M, 2), round(-vy / PX_PER_M, 2)), flight_time=round(T, 2),
                com_rise_m=round((c0[1] - min(c0[1] + vy * t + 0.5 * G * t * t for t in [T * k / 50 for k in range(51)])) / PX_PER_M, 2))

# ---------- validation ----------
def _wrap(a): return (a + 180) % 360 - 180

LIMITS = {  # degrees, measured with facing so that + is the natural direction
    'knee': (-5, 165), 'elbow': (-8, 160), 'hip': (-100, 185), 'shoulder': (-75, 200)}

def joint_angles(p):
    f = getattr(p, 'facing', 1); out = {}
    for t in 'nf':
        arm, leg = getattr(p, 'arm_' + t), getattr(p, 'leg_' + t)
        sh = (p.torso + 180 - arm[0]) * f % 360
        out['shoulder_' + t] = sh - 360 if sh >= 270 else sh
        out['elbow_' + t] = _wrap(arm[0] - arm[1]) * f
        hp = (p.torso + 180 - leg[0]) * f % 360
        out['hip_' + t] = hp - 360 if hp >= 240 else hp
        out['knee_' + t] = _wrap(leg[1] - leg[0]) * f
    return out

def validate(tl, floor_y=None, bars=(), max_step=28, front=False):
    problems = []
    prev = None
    for i, (p, pel, meta) in enumerate(tl.frames):
        if not front:
            for name, val in joint_angles(p).items():
                lo, hi = LIMITS[name.split('_')[0]]
                if not lo <= val <= hi:
                    problems.append(f'frame {i}: {name} {val:.0f}° outside {lo}..{hi}')
        j = p.joints(pel)
        if floor_y is not None:
            low = max(y for k, (x, y) in j.items() if k != 'head')
            if low > floor_y + 2: problems.append(f'frame {i}: below the floor by {low - floor_y:.1f}px')
        for b in bars:
            gripping = meta.get('contact') and meta['contact'][0] == 'han' and math.dist(meta['contact'][1], b) < 1
            if gripping: continue
            for k, (x, y) in j.items():
                if math.dist((x, y), b) < 7: problems.append(f'frame {i}: {k} hits the bar'); break
        if meta.get('contact'):
            jn, pt = meta['contact']
            if math.dist(j[jn], pt) > 1.0: problems.append(f'frame {i}: contact {jn} slipped')
        if prev is not None:
            # per-segment speed limits (deg per frame at 30 fps), from biomechanics:
            # trunk ~840 deg/s, leg kicks ~1050 deg/s, arm swings ~1200 deg/s
            limit = {'torso': max_step, 'leg_n': 35, 'leg_f': 35, 'arm_n': 40, 'arm_f': 40}
            for attr in ['torso'] + SEG:
                a, b = getattr(prev, attr), getattr(p, attr)
                a = a if isinstance(a, tuple) else (a,); b = b if isinstance(b, tuple) else (b,)
                for x, y in zip(a, b):
                    if abs(y - x) > limit[attr]: problems.append(f'frame {i}: {attr} jumps {abs(y - x):.0f}°'); break
        prev = p
    return problems
