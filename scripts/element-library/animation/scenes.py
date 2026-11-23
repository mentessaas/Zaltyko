"""Apparatus scenes at real scale (85 px = 1 m). Anchors are named contact points."""
from engine2 import PX_PER_M as M
from volumen import APP_D, APP_L, NAVY, metal

W = 360
def _floor(y, w=W): return f'<line x1="14" y1="{y}" x2="{w-14}" y2="{y}" stroke="{APP_L}" stroke-width="2" stroke-linecap="round"/>'

class Scene:
    def __init__(self, kind, h, floor_y, anchors, bars=(), draw=None, w=W, solids=()):
        self.kind, self.h, self.floor_y, self.anchors, self.bars, self._draw, self.w = kind, h, floor_y, anchors, bars, draw, w
        self.solids = list(solids)   # (x0, y0, x1, y1) boxes the body may touch from outside but never enter
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
    # the real floor is below; the beam is a solid box (legs may hang beside it, nothing passes through it)
    return Scene('beam', 340, fy, {'beam': (0, top), 'floor': (0, fy)}, draw=d, solids=[(16, top, 344, top + 9)])

def beam_mount():
    """Beam mounts: 7.5 m wide, springboard in front of the left end of a 5 m beam."""
    fy, top, w = 330, 330 - round(1.25 * M), 640
    x0, x1 = 170, 170 + round(5.0 * M)
    def d(u):
        return (_floor(fy, w) + f'<polygon points="62,{fy} 120,{fy} 120,{fy-14}" fill="{metal(u)}"/>'
                f'<rect x="{x0+70}" y="{top+9}" width="6" height="{fy-top-9}" fill="{APP_L}"/><rect x="{x1-76}" y="{top+9}" width="6" height="{fy-top-9}" fill="{APP_L}"/>'
                f'<rect x="{x0}" y="{top}" width="{x1-x0}" height="9" rx="3" fill="{metal(u)}"/>')
    return Scene('beam_mount', 340, fy, {'beam': (0, top), 'floor': (0, fy), 'board': (100, fy - 10)}, draw=d, w=w,
                 solids=[(x0, top, x1, top + 9)])

def high_bar():
    fy = 340; bar = (180, fy - round(2.8 * M))
    def d(u):
        return (_floor(fy) + f'<rect x="{bar[0]-2}" y="{bar[1]}" width="4" height="{fy-bar[1]}" fill="{APP_L}"/>'
                f'<circle cx="{bar[0]}" cy="{bar[1]}" r="5" fill="{metal(u)}"/>')
    return Scene('high_bar', 350, fy, {'bar': bar}, bars=[bar], draw=d)

def uneven():
    """7.5 m wide: run and springboard in front of the low bar, bars 1.5 m apart, room outside the high bar."""
    fy, w = 340, 640
    lb = (300, fy - round(1.70 * M)); hb = (430, fy - round(2.50 * M)); board = (172, fy - 10)
    def d(u):
        o = _floor(fy, w) + f'<polygon points="{board[0]-28},{fy} {board[0]+30},{fy} {board[0]+30},{fy-14}" fill="{metal(u)}"/>'
        for b in (lb, hb):
            o += f'<rect x="{b[0]-2}" y="{b[1]}" width="4" height="{fy-b[1]}" fill="{APP_L}"/><circle cx="{b[0]}" cy="{b[1]}" r="4.5" fill="{metal(u)}"/>'
        return o
    return Scene('uneven_bars', 350, fy, {'lb': lb, 'hb': hb, 'board': board, 'floor': (0, fy)}, bars=[lb, hb], draw=d, w=w)

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
    """Wide scene (7.5 m): runway with room for the hurdle/round-off, board, table, landing mat."""
    fy = 330; top = fy - round(1.25 * M); w = 640
    def d(u):
        return (_floor(fy, w) + f'<polygon points="236,{fy} 300,{fy} 300,{fy-14}" fill="{metal(u)}"/>'
                f'<path d="M406 {fy} l5 -{fy-top-12} h10 l5 {fy-top-12} z" fill="{APP_L}"/><rect x="370" y="{top}" width="92" height="14" rx="7" fill="{metal(u)}"/>'
                f'<rect x="478" y="{fy-8}" width="150" height="8" rx="3" fill="{APP_L}"/>')
    return Scene('vault', 340, fy, {'board': (280, fy - 10), 'table': (0, top), 'floor': (0, fy), 'mat': (0, fy - 8)}, draw=d, w=w)

SCENES = {'floor': floor, 'beam': beam, 'beam_mount': beam_mount, 'high_bar': high_bar, 'uneven_bars': uneven, 'rings': rings,
          'parallel_bars': pbars, 'pommel_horse': pommel, 'vault': vault}
