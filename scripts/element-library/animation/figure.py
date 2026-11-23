"""Minimal 2D gymnast pictogram renderer (Zaltyko, own drawings).
Angles in degrees: 0 = up, 90 = right, 180 = down, 270 = left."""
import math

INK, FAR, ACCENT, APP, GHOST = '#1e293b', '#94a3b8', '#ea580c', '#64748b', '#cbd5e1'
L = dict(torso=44, neck=5, head=8.5, ua=23, fa=21, th=31, sh=29, toe=6)

def v(a, l=1.0):
    r = math.radians(a)
    return (math.sin(r) * l, -math.cos(r) * l)

def add(p, q): return (p[0] + q[0], p[1] + q[1])

class Pose:
    """torso: pelvis->neck. arms: (upper, fore) near/far. legs: (thigh, shin) near/far."""
    def __init__(self, torso, arm_n, arm_f=None, leg_n=(None, None), leg_f=None, head=0, front=False):
        self.torso = torso
        self.arm_n, self.arm_f = arm_n, arm_f or arm_n
        self.leg_n, self.leg_f = leg_n, leg_f or leg_n
        self.head, self.front = head, front

    def joints(self, pelvis=(0, 0)):
        t = self.torso
        neck = add(pelvis, v(t, L['torso']))
        j = {'pelvis': pelvis, 'neck': neck}
        j['head'] = add(neck, v(t + self.head, L['neck'] + L['head']))
        side = (lambda a, d: v(a + 90, d)) if self.front else (lambda a, d: (0, 0))
        for tag, sh_off, arm in (('n', side(t, 10), self.arm_n), ('f', side(t, -10), self.arm_f)):
            s = add(neck, sh_off)
            e = add(s, v(arm[0], L['ua'])); h = add(e, v(arm[1], L['fa']))
            j['sh' + tag], j['el' + tag], j['ha' + tag] = s, e, h
        for tag, hip_off, leg in (('n', side(t, 6), self.leg_n), ('f', side(t, -6), self.leg_f)):
            hp = add(pelvis, hip_off)
            k = add(hp, v(leg[0], L['th'])); an = add(k, v(leg[1], L['sh'])); to = add(an, v(leg[1], L['toe']))
            j['hip' + tag], j['kn' + tag], j['an' + tag], j['to' + tag] = hp, k, an, to
        return j

def place(pose, joint, target):
    """Pelvis position so that `joint` lands on `target`."""
    j = pose.joints((0, 0))
    return (target[0] - j[joint][0], target[1] - j[joint][1])

def seg(a, b, w, c, op=1.0):
    return (f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" '
            f'stroke="{c}" stroke-width="{w}" stroke-linecap="round" opacity="{op}"/>')

def draw(pose, pelvis, op=1.0, ghost=False):
    j = pose.joints(pelvis)
    ink = GHOST if ghost else INK
    far = GHOST if ghost else FAR
    out = []
    # far side first
    out += [seg(j['shf'], j['elf'], 6.5, far, op), seg(j['elf'], j['haf'], 6, far, op)]
    out += [seg(j['hipf'], j['knf'], 7.5, far, op), seg(j['knf'], j['anf'], 7, far, op), seg(j['anf'], j['tof'], 5, far, op)]
    if pose.front:
        out.append(seg(j['shf'], j['shn'], 9, ink, op)); out.append(seg(j['hipf'], j['hipn'], 9, ink, op))
    out.append(seg(j['pelvis'], j['neck'], 11, ink, op))
    out.append(f'<circle cx="{j["head"][0]:.1f}" cy="{j["head"][1]:.1f}" r="{L["head"]}" fill="{ink}" opacity="{op}"/>')
    out += [seg(j['hipn'], j['knn'], 7.5, ink, op), seg(j['knn'], j['ann'], 7, ink, op), seg(j['ann'], j['ton'], 5, ink, op)]
    out += [seg(j['shn'], j['eln'], 6.5, ink, op), seg(j['eln'], j['han'], 6, ink, op)]
    return '\n'.join(out)

def arrow_path(d, dashed=False, color=ACCENT, w=2.5):
    dash = ' stroke-dasharray="5 5"' if dashed else ''
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}"{dash} marker-end="url(#ah)"/>'

def label(x, y, text, size=12, color=APP, anchor='middle', weight=600):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" text-anchor="{anchor}" font-weight="{weight}" font-family="system-ui, sans-serif">{text}</text>'

def svg(body, w=360, h=250):
    defs = (f'<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{ACCENT}"/></marker></defs>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img">{defs}\n{body}\n</svg>'
