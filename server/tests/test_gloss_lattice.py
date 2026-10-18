import asyncio
import json
import statistics
import time
from pathlib import Path
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from app import gloss, main
from app.asl_grammar_fallback import fallback_gloss_to_english

CASES=json.loads((Path(__file__).parent/'fixtures/gloss_grammar.json').read_text(encoding='utf-8-sig'))
client=TestClient(main.app)


@pytest.mark.parametrize('case',CASES)
def test_shared_offline_grammar(case):
    assert fallback_gloss_to_english(case['glosses'],case['tags']) == case['english']


@pytest.mark.parametrize('key',['glosses','signs','lattice'])
def test_all_request_forms_and_response_compatibility(monkeypatch,key):
    monkeypatch.delenv('GEMINI_API_KEY',raising=False)
    tokens=['YOU','NEED','HELP']
    value=tokens if key=='glosses' else [dict(gloss=g,p=.9) for g in tokens] if key=='signs' else [dict(candidates=[dict(gloss=g,score=.9)]) for g in tokens]
    response=client.post('/api/gloss',json={key:value,'nmm_tags':['Q-YN']})
    assert response.status_code == 200
    assert response.json()['english'] == 'Do you need help?'
    assert set(response.json()) == {'english','confidence','sentence_type','uncertain'}
    assert response.json()['sentence_type'] == 'yes_no_question'


def test_lattice_top_score_tags_and_uncertainty(monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY',raising=False)
    response=client.post('/api/gloss',json={'lattice':[
        {'candidates':[{'gloss':'YOU','score':.9}]},
        {'candidates':[{'gloss':'DRINK','score':.2},{'gloss':'KNOW','score':.55}],'nmm_tags':['NEG']} ]})
    assert response.json()['english'] == "You don't know."
    assert response.json()['confidence'] == .55
    assert response.json()['uncertain'] == ['YOU','KNOW']
    response=client.post('/api/gloss',json={'glosses':['WATER','STORE','BYE']})
    assert response.json()['confidence'] < .6


def fake_client(monkeypatch, generate):
    monkeypatch.setenv('GEMINI_API_KEY','test-placeholder')
    monkeypatch.setattr(gloss,'client',lambda:SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate))))


def test_mocked_llm_receives_lattice_and_chooses_alternative(monkeypatch):
    async def generate(**kwargs):
        assert 'DEER (0.46) | THIRSTY (0.44)' in kwargs['contents']
        assert 'WATER (0.91)' in kwargs['contents']
        assert 'Markers: Q-YN' in kwargs['contents']
        assert 'Recent hearing caption' in kwargs['contents']
        return SimpleNamespace(text=json.dumps(dict(english='I am thirsty and want some water.',sentence_type='statement',confidence=.9,uncertain=['thirsty'])))
    fake_client(monkeypatch,generate)
    response=client.post('/api/gloss',json={'lattice':[
        {'candidates':[{'gloss':'ME','score':.95}]},
        {'candidates':[{'gloss':'DEER','score':.46},{'gloss':'THIRSTY','score':.44}]},
        {'candidates':[{'gloss':'WATER','score':.91}],'nmm_tags':['Q-YN']}], 'context_prev_english':'Recent hearing caption'})
    assert response.status_code == 200
    assert response.json()['english'] == 'I am thirsty and want some water.'
    assert response.json()['confidence'] < .6


@pytest.mark.parametrize('mode',['quota','invalid','empty','nonfinite'])
def test_upstream_failure_uses_rules(monkeypatch,mode):
    async def generate(**kwargs):
        if mode=='quota':
            raise RuntimeError('quota exceeded')
        return SimpleNamespace(text='not json' if mode=='invalid' else json.dumps(dict(english='' if mode=='empty' else 'Hello',sentence_type='statement',confidence=float('nan') if mode=='nonfinite' else .9,uncertain=[])))
    fake_client(monkeypatch,generate)
    response=client.post('/api/gloss',json={'glosses':['ME','STUDENT']})
    assert response.status_code == 200 and response.json()['english'] == 'I am a student.'


def test_deadline_cancels_upstream_and_falls_back(monkeypatch):
    cancelled=[]
    async def generate(**kwargs):
        try:
            await asyncio.sleep(10)
        finally:
            cancelled.append(True)
    fake_client(monkeypatch,generate)
    monkeypatch.setattr(gloss,'GLOSS_TIMEOUT_SECONDS',.01)
    response=client.post('/api/gloss',json={'glosses':['ME','KNOW'],'nmm_tags':['NEG']})
    assert response.json()['english'] == "I don't know."
    assert cancelled == [True]


@pytest.mark.parametrize('payload',[{}, {'glosses':[' ']},{'glosses':['A']*31},{'lattice':[]},
    {'lattice':[{'candidates':[]}]}, {'lattice':[{'candidates':[{'gloss':'A','score':1.1}]}]},
    {'lattice':[{'candidates':[{'gloss':'A','score':.1}]*4}]},{'glosses':['A'],'nmm_tags':['FAKE']},
    {'signs':[{'gloss':'','p':.9}]},{'glosses':['X'],'context_prev_english':'x'*1201}])
def test_bounded_inputs(payload):
    assert client.post('/api/gloss',json=payload).status_code == 422


def test_rule_latency_under_five_ms(monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY',raising=False)
    req=gloss.GlossRequest(glosses=['ME','WANT','WATER'],nmm_tags=['Q-YN'])
    timings=[]
    for _ in range(100):
        start=time.perf_counter(); result=asyncio.run(gloss.translate(req)); timings.append(time.perf_counter()-start)
        assert result.english == 'Do I want water?'
    assert statistics.median(timings) < .005
