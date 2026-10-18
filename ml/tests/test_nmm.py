import math
import pytest
from ml.nmm import NMMDetector, face_ratios, headshake_score


def face(raise_ratio=.04, contraction=.1, scale=1, pitch=0):
    return [dict(x=x*scale,y=y*math.cos(pitch)*scale,z=y*math.sin(pitch)*scale) for x,y in
        [(0,.04),(-.1,0),(.1,0),(-.06,.12),(.06,.12),(0,.2),(-contraction,-raise_ratio),(contraction,-raise_ratio)]]


def calibrated(scale=1,pitch=0):
    d=NMMDetector()
    for i in range(150):
        d.push(dict(t=i*33,rest=True,face=face(scale=scale,pitch=pitch)))
    return d


@pytest.mark.parametrize('scale',[.7,1,1.4])
@pytest.mark.parametrize('pitch',[0,.4,-.4])
def test_nmm_scale_pitch_and_expression(scale,pitch):
    d=calibrated()
    for i in range(15):
        assert d.push(dict(t=5000+i*33,rest=False,face=face(scale=scale,pitch=pitch))) == []
    assert face_ratios(face(scale=scale,pitch=pitch))['raise_ratio'] == pytest.approx(.2,abs=1e-12)
    for raise_ratio,contraction,tag in [(.1,.1,'Q-YN'),(.02,.05,'Q-WH')]:
        d=calibrated(scale,pitch)
        for i in range(10):
            tags=d.push(dict(t=5000+i*33,rest=False,face=face(raise_ratio,contraction,scale,pitch)))
        assert tag in tags


def test_headshake_visibility_and_blendshape():
    d=NMMDetector()
    for i in range(24):
        tags=d.push(dict(t=i*33,rest=False,headYaw=math.sin(i*math.pi/5)*.1))
    assert tags == ['NEG']
    assert headshake_score([math.sin(i)*.01 for i in range(24)]) == 0
    assert headshake_score([i*.01 for i in range(24)]) == 0
    assert d.push(dict(t=800,rest=False)) == []
    assert face_ratios([{**p,'visibility':.1} for p in face()]) is None
    d=NMMDetector()
    for i in range(150):
        d.push(dict(t=i*33,rest=True,brow={'raise':.1,'furrow':.1}))
    for i in range(10):
        tags=d.push(dict(t=5000+i*33,rest=False,brow={'raise':.5,'furrow':.1}))
    assert tags == ['Q-YN']
    assert d.push(dict(t=5400,rest=True)) == []
