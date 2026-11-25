"""Regression coverage for apparatus contact and drawing bounds."""
import unittest
from types import SimpleNamespace

from engine2 import Timeline, validate
from run_spec import overlay
from scenes import rings as rings_scene


def frame(joints, **meta):
    pose = SimpleNamespace(front=True, yaw=0, torso=0, arch=0)
    pose.joints = lambda _pelvis: joints
    timeline = Timeline()
    timeline.add(pose, (0, 0), **meta)
    return timeline


def joints(**updates):
    points = {name: (180, 80) for name in (
        'pelvis', 'mid', 'neck', 'head', 'shn', 'shf', 'eln', 'elf', 'han', 'haf',
        'hipn', 'hipf', 'knn', 'knf', 'ann', 'anf', 'ton', 'tof')}
    points.update(updates)
    return points


class GeometryValidatorTests(unittest.TestCase):
    def test_support_leg_below_beam_top_fails(self):
        beam = {'name': 'beam', 'x0': 16, 'x1': 344, 'top': 100,
                'accepts': lambda point: 16 <= point[0] <= 344 and abs(point[1]-100) <= 4}
        tl = frame(joints(han=(180, 100), ton=(180, 120)), contact=('han', (180, 100)))
        problems = validate(tl, surfaces=[beam], solids=[(16, 100, 344, 109)])
        self.assertTrue(any('ton below apparatus top' in problem for problem in problems))

    def test_explicit_under_bar_phase_allows_hanging_body(self):
        bar = {'name': 'bar', 'x0': 173, 'x1': 187, 'top': 100,
               'accepts': lambda point: abs(point[0]-180) <= 5 and abs(point[1]-100) <= 5}
        tl = frame(joints(han=(180, 100), ton=(180, 180)),
                   contact=('han', (180, 100)), underBar=True)
        problems = validate(tl, surfaces=[bar])
        self.assertFalse(any('below apparatus top' in problem for problem in problems))

    def test_contact_must_match_real_apparatus_surface(self):
        beam = {'name': 'beam', 'x0': 16, 'x1': 344, 'top': 100,
                'accepts': lambda point: 16 <= point[0] <= 344 and abs(point[1]-100) <= 4}
        tl = frame(joints(han=(180, 90)), contact=('han', (180, 90)))
        problems = validate(tl, surfaces=[beam])
        self.assertTrue(any('not on an apparatus surface' in problem for problem in problems))

    def test_both_hands_must_reach_ring_grip_points(self):
        ring = {'name': 'rings', 'x0': 155, 'x1': 205, 'top': 100,
                'accepts': lambda point: abs(point[0]-180) <= 25 and abs(point[1]-100) <= 5}
        tl = frame(joints(han=(180, 100), haf=(180, 120)), contact=('han', (180, 100)))
        problems = validate(tl, surfaces=[ring], rings=[(180, 100), (180, 100)])
        self.assertTrue(any('haf is not at a ring grip point' in problem for problem in problems))

    def test_rendered_ring_straps_terminate_at_the_hand_grips(self):
        points = joints(han=(180, 100), haf=(180, 100))
        pose = SimpleNamespace(front=False)
        pose.joints = lambda _pelvis: points
        markup = overlay(rings_scene(), pose, (0, 0), {})
        self.assertIn('x2="180.0" y2="91.0"', markup)

    def test_body_point_outside_canvas_fails(self):
        tl = frame(joints(ton=(361, 80)))
        problems = validate(tl, canvas=(360, 340))
        self.assertTrue(any('ton outside canvas' in problem for problem in problems))


if __name__ == '__main__':
    unittest.main()
