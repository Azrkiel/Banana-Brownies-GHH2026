"""Deterministic vocabularies; lexical resources never expand the ship tier."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAP_PATH = Path(__file__).with_name('label_map.json')
COMMERCIAL = {'gislr', 'popsign', 'own', 'aslfr'}
RESEARCH = {'asl_citizen', 'how2sign', 'chicagofswild', 'wlasl', 'ms_asl', 'openasl', 'asl_lex'}
ALIASES = {'asl-citizen': 'asl_citizen', 'kaggle-gislr': 'gislr', 'kaggle-aslfr': 'aslfr',
           'aslfr-npy': 'aslfr', 'how2sign-holistic': 'how2sign', 'wlasl-hf': 'wlasl', 'ms-asl': 'ms_asl'}


def source_id(source):
    source = ALIASES.get(source, source)
    if source not in COMMERCIAL | RESEARCH:
        raise ValueError(f'Unknown dataset: {source}')
    return source


def allowed(source, license_tier='commercial'):
    if license_tier not in ('commercial', 'research'):
        raise ValueError('license tier must be commercial or research')
    return source_id(source) in COMMERCIAL or license_tier == 'research'


def normalize_gloss(raw_label: str, source: str) -> str:
    source = source_id(source)
    raw = str(raw_label).strip()
    if not raw:
        raise ValueError('Empty gloss')
    mapping = json.loads(MAP_PATH.read_text(encoding='utf8'))['sources']
    entry = mapping.get(source, {}).get(raw.lower())
    if entry:
        return entry['gloss']
    # Retain sense/variant numbers: BOOK1 and BOOK2 must never collapse.
    gloss = re.sub(r'[^\w]+', '_', raw, flags=re.UNICODE).strip('_').upper()
    if not gloss:
        raise ValueError('Empty normalized gloss')
    return '_idle' if raw.lower() == '_idle' else gloss


def build_vocabulary(sources: list[str], license_tier='commercial', max_classes: int = 2750,
                     source_labels=None) -> dict:
    if max_classes < 1:
        raise ValueError('max_classes must be positive')
    mapping = json.loads(MAP_PATH.read_text(encoding='utf8'))['sources']
    labels, origins = set(), {}
    for source in sorted({source_id(s) for s in sources}):
        if not allowed(source, license_tier):
            continue
        raw_labels = (source_labels or {}).get(source, mapping.get(source, {}))
        if not raw_labels:
            raise ValueError(f'Provide source_labels from downloaded metadata for {source}')
        for raw in sorted(raw_labels):
            gloss = normalize_gloss(raw, source)
            # Only reviewed aliases merge across sources; unreviewed research homonyms stay distinct.
            if source in RESEARCH:
                gloss = f'{source.upper()}:{gloss}'
            labels.add(gloss)
            origins.setdefault(gloss, []).append({'source': source, 'raw_label': raw})
    if len(labels) > max_classes:
        raise ValueError(f'{len(labels)} classes exceeds {max_classes}; select an explicit subset')
    labels = sorted(labels)
    return {'labels': labels, 'label_to_index': {s: i for i, s in enumerate(labels)},
            'license_tier': license_tier, 'origins': {s: origins[s] for s in labels}}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--sources', default='gislr,own')
    p.add_argument('--license-tier', choices=['commercial', 'research'], default='commercial')
    p.add_argument('--source-labels', type=Path, help='JSON source -> raw label list from downloaded metadata')
    p.add_argument('--max-classes', type=int, default=2750)
    p.add_argument('--out', type=Path)
    a = p.parse_args()
    labels = json.loads(a.source_labels.read_text()) if a.source_labels else None
    result = json.dumps(build_vocabulary(a.sources.split(','), a.license_tier, a.max_classes, labels), indent=2)
    if a.out:
        a.out.parent.mkdir(parents=True, exist_ok=True)
        a.out.write_text(result + '\n', encoding='utf8')
    else:
        print(result)


if __name__ == '__main__':
    main()
