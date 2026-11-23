"""Apparatus scenes at real scale (85 px = 1 m). Anchors are named contact points."""
from engine2 import PX_PER_M as M
from volumen import APP_D, APP_L, NAVY, metal

W = 360
def _floor(y): return f'<line x1="14" y1="{y}" x2="{W-14}" y2="{y}" stroke="{APP_L}" stroke-width="2" stroke-linecap="round"/>'

class Scene:
    def __init__(self, kind, h, floor_y, anchors, bars=(), draw=None):
        self.kind, self.h, self.floor_y, self.anchors, self.bars, self._draw = kind, h, floor_y, anchors, bars, draw
    def at(self, name):
        if '@' in name:
            base, x = name.split('@'); return (float(x), self.anchors[base][1])
        return self.anchors[name]
    def draw(self, uid): return self._draw(uid)

def floor():
    fy = 268
    return Scene('floor', 300, fy, {'floor': (0, fy)}, draw=lambda u: _floor(fy))

def beam():
    fy, top = 330, 330 - round(1.25 * M)
    def d(u):
        return (_floor(fy) + f'<rect x="96" y="{top+9}" width="6" height="{fy-top-9}" fill="{APP_L}"/><rect x="258" y="{top+9}" width="6" height="{fy-top-9}" fill="{APP_L}"/>'
                f'<rect x="16" y="{top}" width="328" height="9" rx="3" fill="{metal(u)}"/>')
    return Scene('beam', 340, top, {'beam': (0, top)}, draw=d)

def high_bar():
    fy = 340; bar = (180, fy - round(2.8 * M))
    def d(u):
        return (_floor(fy) + f'<rect x="{bar[0]-2}" y="{bar[1]}" width="4" height="{fy-bar[1]}" fill="{APP_L}"/>'
                f'<circle cx="{bar[0]}" cy="{bar[1]}" r="5" fill="{metal(u)}"/>')
    return Scene('high_bar', 350, fy, {'bar': bar}, bars=[bar], draw=d)

def uneven():
    fy = 340; lb = (118, fy - round(1.70 * M)); hb = (248, fy - round(2.50 * M))
    def d(u):
        o = _floor(fy)
        for b in (lb, hb):
            o += f'<rect x="{b[0]-2}" y="{b[1]}" width="4" height="{fy-b[1]}" fill="{APP_L}"/><circle cx="{b[0]}" cy="{b[1]}" r="4.5" fill="{metal(u)}"/>'
        return o
    return Scene('uneven_bars', 350, fy, {'lb': lb, 'hb': hb}, bars=[lb, hb], draw=d)

def rings():
    fy = 352; ring = (180, fy - round(2.75 * M))
    def d(u, hands=None):
        return _floor(fy)
    return Scene('rings', 362, fy, {'rings': ring}, draw=d)

def pbars():
    fy = 330; ry = fy - round(2.0 * M)
    def d(u):
        return (_floor(fy) + f'<line x1="40" y1="{ry-7}" x2="330" y2="{ry-7}" stroke="{APP_L}" stroke-width="5" stroke-linecap="round"/>'
                f'<rect x="70" y="{ry}" width="5" height="{fy-ry}" fill="{APP_L}"/><rect x="286" y="{ry}" width="5" height="{fy-ry}" fill="{APP_L}"/>'
                f'<rect x="30" y="{ry-3.5}" width="300" height="7" rx="3.5" fill="{metal(u)}"/>')
    return Scene('parallel_bars', 340, fy, {'rail': (0, ry)}, draw=d)

def pommel():
    fy = 300; top = fy - round(1.05 * M); grip = fy - round(1.17 * M)
    pl, pr = (161, grip), (199, grip)
    def d(u):
        o = _floor(fy) + f'<rect x="132" y="{top+26}" width="8" height="{fy-top-26}" fill="{APP_L}"/><rect x="220" y="{top+26}" width="8" height="{fy-top-26}" fill="{APP_L}"/>'
        o += f'<rect x="108" y="{top}" width="144" height="28" rx="14" fill="{metal(u)}"/>'
        for x in (pl[0], pr[0]):
            o += f'<path d="M{x-11} {top+1} v-9 a3 3 0 0 1 3 -3 h16 a3 3 0 0 1 3 3 v9" fill="none" stroke="{APP_D}" stroke-width="5"/>'
        return o
    return Scene('pommel_horse', 310, fy, {'pommel_l': pl, 'pommel_r': pr, 'horse': (0, top)}, draw=d)

def vault():
    fy = 330; top = fy - round(1.25 * M)
    def d(u):
        return (_floor(fy) + f'<polygon points="60,{fy} 118,{fy} 118,{fy-14}" fill="{metal(u)}"/>'
                f'<path d="M226 {fy} l5 -{fy-top-12} h10 l5 {fy-top-12} z" fill="{APP_L}"/><rect x="190" y="{top}" width="92" height="14" rx="7" fill="{metal(u)}"/>'
                f'<rect x="292" y="{fy-8}" width="64" height="8" rx="3" fill="{APP_L}"/>')
    return Scene('vault', 340, fy, {'board': (100, fy - 10), 'table': (0, top), 'floor': (0, fy), 'mat': (0, fy - 8)}, draw=d)

SCENES = {'floor': floor, 'beam': beam, 'high_bar': high_bar, 'uneven_bars': uneven, 'rings': rings,
          'parallel_bars': pbars, 'pommel_horse': pommel, 'vault': vault}
