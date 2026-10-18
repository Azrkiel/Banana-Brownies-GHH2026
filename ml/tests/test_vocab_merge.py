import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from datasets.vocab_merge import MAP_PATH, build_vocabulary, normalize_gloss


@pytest.mark.parametrize('raw,expected', [('thankyou', 'THANKYOU'), ('callonphone', 'CALL_ON_PHONE'),
                                         ('minemy', 'MY'), ('hesheit', 'IX_3P'), ('TV', 'TV')])
def test_normalize(raw, expected):
    assert normalize_gloss(raw, 'gislr') == expected


def test_complete_mapping():
    mapping = json.loads(MAP_PATH.read_text())['sources']
    assert len(mapping['gislr']) == 250
    assert {'me', 'you', 'name', 'what', '_idle'} <= mapping['own'].keys()
    assert normalize_gloss('_idle', 'own') == '_idle'
    assert normalize_gloss('Book1', 'asl_citizen') != normalize_gloss('Book2', 'asl_citizen')


def test_tiers_and_order():
    labels = {'asl_citizen': ['hello', 'BOOK1', 'BOOK2']}
    commercial = build_vocabulary(['asl_citizen', 'gislr', 'own'], source_labels=labels)
    assert commercial == build_vocabulary(['own', 'gislr', 'asl_citizen'], source_labels=labels)
    research = build_vocabulary(['asl_citizen', 'gislr', 'own'], 'research', source_labels=labels)
    assert len(research['labels']) == len(commercial['labels']) + 3
    assert 'ASL_CITIZEN:HELLO' in research['labels']
    assert commercial['labels'] == sorted(commercial['labels'])
    assert list(commercial['label_to_index'].values()) == list(range(len(commercial['labels'])))


@pytest.mark.parametrize('kwargs', [{'sources': ['typo']}, {'sources': ['gislr'], 'license_tier': 'typo'},
                                  {'sources': ['gislr'], 'max_classes': 2}])
def test_fail_closed(kwargs):
    with pytest.raises(ValueError):
        build_vocabulary(**kwargs)
