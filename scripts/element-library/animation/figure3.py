"""Anatomical silhouettes from smooth Bezier outlines. Angles: 0 up, 90 right."""
import math
from figure import Pose, v, add, L

L.update(torso=46, neck=5, head=9, ua=24, fa=22, th=34, sh=32, toe=9)

def _n(a, b):
    dx, dy = b[0]-a[0], b[1]-a[1]; d = math.hypot(dx, dy) or 1
    return (-dy/d, dx/d), (dx/d, dy/d)

def _smooth(pts, closed=True):
    """Catmull-Rom through pts -> cubic Bezier path."""
    n = len(pts); d = f'M{pts[0][0]:.2f},{pts[0][1]:.2f}'
    rng = range(n) if closed else range(n-1)
    for i in rng:
        p0, p1, p2, p3 = pts[(i-1) % n], pts[i], pts[(i+1) % n], pts[(i+2) % n]
        c1 = (p1[0]+(p2[0]-p0[0])/6, p1[1]+(p2[1]-p0[1])/6)
        c2 = (p2[0]-(p3[0]-p1[0])/6, p2[1]-(p3[1]-p1[1])/6)
        d += f' C{c1[0]:.2f},{c1[1]:.2f} {c2[0]:.2f},{c2[1]:.2f} {p2[0]:.2f},{p2[1]:.2f}'
    return d + ' Z'

def _prof(t, prof):
    """Piecewise-smooth width from [(t, w), ...]."""
    for (t0, w0), (t1, w1) in zip(prof, prof[1:]):
        if t0 <= t <= t1:
            u = (t - t0) / (t1 - t0 or 1); u = u*u*(3-2*u)
            return w0 + (w1 - w0) * u
    return prof[-1][1]

def muscle(a, b, left, right, steps=10):
    """Outline of a segment a->b with width profiles for each side (half-widths)."""
    n, u = _n(a, b)
    L_ = math.hypot(b[0]-a[0], b[1]-a[1])
    pts_l, pts_r = [], []
    for i in range(steps + 1):
        t = i / steps
        c = (a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t)
        wl, wr = _prof(t, left), _prof(t, right)
        pts_l.append((c[0] + n[0]*wl, c[1] + n[1]*wl)); pts_r.append((c[0] - n[0]*wr, c[1] - n[1]*wr))
    # true semicircular caps (avoid spline overshoot = bumps at joints)
    def cap(center, w, sign):
        pts = []
        for k in range(1, 6):
            th = math.pi * k / 6
            c_, s_ = math.cos(th), math.sin(th)
            # from +n side, through +/-u, to -n side
            pts.append((center[0] + w * (n[0]*c_ + sign*u[0]*s_), center[1] + w * (n[1]*c_ + sign*u[1]*s_)))
        return pts
    wb = (_prof(1, left) + _prof(1, right)) / 2; wa = (_prof(0, left) + _prof(0, right)) / 2
    capb = cap(b, wb, 1); capa = [ (2*a[0]-x, 2*a[1]-y) for x, y in cap(a, wa, 1)]
    pts = pts_l + capb + pts_r[::-1] + capa
    return _smooth(pts)

THIGH = ([(0, 7.4), (.3, 7.7), (1, 5.4)], [(0, 7.2), (.45, 7.2), (1, 5.2)])
SHIN = ([(0, 5.2), (.55, 4.6), (1, 3.0)], [(0, 5.2), (.28, 5.7), (1, 2.9)])
FOOT = ([(0, 3.0), (1, 1.2)], [(0, 3.0), (1, 1.3)])
UARM = ([(0, 4.7), (.45, 4.8), (1, 3.9)], [(0, 4.6), (.4, 4.5), (1, 3.9)])
FARM = ([(0, 3.9), (.25, 4.0), (1, 2.7)], [(0, 3.9), (.3, 3.8), (1, 2.7)])
HAND = ([(0, 2.7), (.5, 2.9), (1, 1.7)], [(0, 2.7), (.5, 2.8), (1, 1.7)])
TORSO_SIDE = ([(0, 8.5), (.35, 7.2), (.72, 10.4), (1, 7.2)], [(0, 9.0), (.35, 7.0), (.72, 9.2), (1, 7.0)])
TORSO_FRONT = ([(0, 9.0), (.4, 8.0), (.78, 13.5), (1, 11.5)], [(0, 9.0), (.4, 8.0), (.78, 13.5), (1, 11.5)])

def body_paths(pose, pelvis):
    """List of (layer, d) where layer is 'far' or 'near'. Same fill => seamless union."""
    j = pose.joints(pelvis); t = pose.torso
    out = []
    def limb_set(tag, layer):
        layer = 'nearlimb' if layer == 'near' else layer
        hand_end = add(j['ha'+tag], v(_ang(j['el'+tag], j['ha'+tag]), 6))
        out.extend([(layer, muscle(j['sh'+tag], j['el'+tag], *UARM)), (layer, muscle(j['el'+tag], j['ha'+tag], *FARM)),
                    (layer, muscle(j['ha'+tag], hand_end, *HAND)),
                    (layer, muscle(j['hip'+tag], j['kn'+tag], *THIGH)), (layer, muscle(j['kn'+tag], j['an'+tag], *SHIN)),
                    (layer, muscle(j['an'+tag], j['to'+tag], *FOOT))])
    def close(p, q): return abs(p[0]-q[0]) < 6 and abs(p[1]-q[1]) < 6
    if not (close(pose.arm_n, pose.arm_f) and close(pose.leg_n, pose.leg_f)) or pose.front:
        limb_set('f', 'far')
    # use the projected joints (they include any vertical-axis turn) for trunk, neck and head
    top, pel = j['neck'], j['pelvis']
    if pose.front:
        out.append(('near', muscle(pel, top, *TORSO_FRONT)))
        out.append(('near', muscle(j['shf'], j['shn'], [(0, 6.2), (.5, 5.0), (1, 6.2)], [(0, 6.6), (.5, 5.6), (1, 6.6)])))
    else:
        out.append(('near', muscle(pel, top, *TORSO_SIDE)))
    hc = j['head']
    hd = (hc[0] - top[0], hc[1] - top[1]); hl = math.hypot(*hd) or 1
    neck_end = (top[0] + hd[0] / hl * (L['neck'] + 3), top[1] + hd[1] / hl * (L['neck'] + 3))
    out.append(('near', muscle(top, neck_end, [(0, 3.4), (1, 3.0)], [(0, 3.4), (1, 3.0)])))
    head_ang = math.degrees(math.atan2(hd[0], -hd[1]))
    out.append(('head', (hc, head_ang)))
    limb_set('n', 'near')
    return out

def _ang(a, b):
    return math.degrees(math.atan2(b[0]-a[0], -(b[1]-a[1])))

def head_el(hc, ang, fill, extra=''):
    return f'<ellipse cx="{hc[0]:.1f}" cy="{hc[1]:.1f}" rx="8.2" ry="9.6" transform="rotate({ang:.1f} {hc[0]:.1f} {hc[1]:.1f})" fill="{fill}" {extra}/>'

def silhouette(pose, pelvis, fill, far_fill=None, op=1.0, extra='', near_fill=None):
    parts = []
    for layer, d in body_paths(pose, pelvis):
        if layer == 'head':
            parts.append(head_el(d[0], d[1], fill, extra)); continue
        f = far_fill if (layer == 'far' and far_fill) else (near_fill if (layer == 'nearlimb' and near_fill) else fill)
        parts.append(f'<path d="{d}" fill="{f}" {extra}/>')
    return f'<g opacity="{op}">' + ''.join(parts) + '</g>'

def outline(pose, pelvis, stroke, bg, w=2.2, op=1.0):
    """Line-art: stroke every piece, then cover with bg fill => only outer contour + far/near overlap."""
    bp = body_paths(pose, pelvis)
    def el(layer, d, mode):
        if layer == 'head':
            return head_el(d[0], d[1], bg, f'stroke="{stroke}" stroke-width="{w*2}"' if mode == 's' else '')
        return f'<path d="{d}" fill="{bg}" ' + (f'stroke="{stroke}" stroke-width="{w*2}" stroke-linejoin="round"/>' if mode == 's' else '/>')
    far = [(l, d) for l, d in bp if l == 'far']; near = [(l, d) for l, d in bp if l != 'far']
    g = ''.join(el(l, d, 's') for l, d in far) + ''.join(el(l, d, 'f') for l, d in far)
    g += ''.join(el(l, d, 's') for l, d in near) + ''.join(el(l, d, 'f') for l, d in near)
    return f'<g opacity="{op}">{g}</g>'

def lerp_pose(a, b, t):
    lp = lambda x, y: x + (y - x) * t
    pair = lambda p, q: (lp(p[0], q[0]), lp(p[1], q[1]))
    return Pose(torso=lp(a.torso, b.torso), arm_n=pair(a.arm_n, b.arm_n), arm_f=pair(a.arm_f, b.arm_f),
                leg_n=pair(a.leg_n, b.leg_n), leg_f=pair(a.leg_f, b.leg_f), head=lp(a.head, b.head), front=a.front)

def sequence(keys, n):
    """keys: [(pose, pelvis)], returns n evenly spaced interpolated (pose, pelvis)."""
    out = []
    segs = len(keys) - 1
    for i in range(n):
        s = i * segs / (n - 1); k = min(int(s), segs - 1); t = s - k
        (pa, xa), (pb, xb) = keys[k], keys[k+1]
        out.append((lerp_pose(pa, pb, t), (xa[0] + (xb[0]-xa[0])*t, xa[1] + (xb[1]-xa[1])*t)))
    return out
