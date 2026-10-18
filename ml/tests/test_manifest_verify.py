import hashlib
import json
import sys
import tarfile
import urllib.error
import zipfile
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from datasets import download
from datasets.common import Source, dataset_info, filter_manifest, metadata, signer_split, validate_splits
from datasets.verify import build_manifest, verify_source


def make_archive(tmp_path, dataset='gislr', n=30):
    directory = tmp_path / dataset
    directory.mkdir(parents=True)
    rows = []
    for i in range(n):
        name = f'{i}.npy'
        np.save(directory / name, np.ones((2, 543, 3), dtype=np.float32))
        rows.append({'path': name, 'label': 'hello', 'signer_id': i})
    pd.DataFrame(rows).to_csv(directory / 'clips.csv', index=False)
    archive = tmp_path / (dataset + '.zip')
    with zipfile.ZipFile(archive, 'w') as z:
        for p in sorted(directory.iterdir()):
            z.write(p, p.name)
    return directory, archive


def test_archive_digest_and_signer_disjoint_manifest(tmp_path):
    directory, archive = make_archive(tmp_path)
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    rows = verify_source(archive, 'gislr', checksum)
    assert len(rows) == 30
    assert all(len(r['sha256']) == 64 and r['archive_sha256'] == checksum for r in rows)
    sets = {s: {r['signer_id'] for r in rows if r['split'] == s} for s in ['train', 'val', 'test']}
    assert all(sets.values())
    assert sets['train'].isdisjoint(sets['val'])
    assert sets['train'].isdisjoint(sets['test'])
    assert sets['val'].isdisjoint(sets['test'])
    raw = tmp_path / 'raw'
    raw.mkdir()
    directory.rename(raw / 'gislr')
    frame = build_manifest(raw, tmp_path / 'manifest.parquet')
    assert len(pd.read_parquet(tmp_path / 'manifest.parquet')) == 30
    assert frame.license_tier.unique().tolist() == ['commercial']
    with pytest.raises(ValueError, match='SHA256'):
        verify_source(archive, 'gislr', '0' * 64)


def test_corrupt_and_unsafe_archives(tmp_path):
    directory, _ = make_archive(tmp_path)
    (directory / '0.npy').write_bytes(b'not numpy')
    with pytest.raises(ValueError):
        verify_source(directory, 'gislr')
    bad = tmp_path / 'unsafe.zip'
    with zipfile.ZipFile(bad, 'w') as z:
        z.writestr('../outside.npy', b'bad')
    with pytest.raises(ValueError, match='Unsafe'):
        Source(bad)
    bad.write_bytes(b'broken archive')
    with pytest.raises(zipfile.BadZipFile):
        verify_source(bad, 'gislr')


@pytest.mark.parametrize('dataset', ['asl_citizen', 'how2sign', 'wlasl', 'ms_asl', 'openasl', 'chicagofswild'])
def test_research_excluded_even_if_spoofed(dataset):
    row = {'dataset_id': dataset, 'signer_id': dataset + ':1', 'split': 'train', **dataset_info(dataset)}
    assert filter_manifest(pd.DataFrame([row])).empty
    assert len(filter_manifest(pd.DataFrame([row]), 'research')) == 1
    row['license_tier'] = 'commercial'
    with pytest.raises(ValueError, match='license'):
        filter_manifest(pd.DataFrame([row]))


def test_official_split_leakage_and_missing_signers(tmp_path):
    directory, _ = make_archive(tmp_path, 'asl_citizen', 1)
    pd.DataFrame([{'path': '0.npy', 'label': 'hello', 'signer_id': 7, 'split': 'train'},
                  {'path': '0.npy', 'label': 'bye', 'signer_id': 7, 'split': 'test'}]).to_csv(directory / 'clips.csv', index=False)
    with Source(directory) as src, pytest.raises(ValueError, match='leakage'):
        metadata(src, 'asl_citizen')
    pd.DataFrame([{'path': '0.npy', 'label': 'hello'}]).to_csv(directory / 'clips.csv', index=False)
    with Source(directory) as src, pytest.raises(ValueError, match='signer identity'):
        metadata(src, 'asl_citizen')
    assert signer_split('gislr:7') == signer_split('gislr:7')
    with pytest.raises(ValueError):
        validate_splits([{'signer_id': 'x', 'split': 'validation'}])


def test_citizen_official_columns(tmp_path):
    (tmp_path / 'clip.mp4').write_bytes(b'only metadata tested here')
    pd.DataFrame([{'Participant ID': 's1', 'Video file': 'clip.mp4', 'Gloss': 'BOOK1'}]).to_csv(tmp_path / 'test.csv', index=False)
    with Source(tmp_path) as src:
        row = metadata(src, 'asl_citizen')[0]
    assert row['split'] == 'test'
    assert row['signer_id'] == 'asl_citizen:s1'
    assert row['canonical_gloss'] == 'BOOK1'


def test_downloader_preflight_and_offline_are_network_free(tmp_path, monkeypatch):
    monkeypatch.setattr(download, 'has_kaggle_credentials', lambda: False)
    monkeypatch.setattr(download.subprocess, 'run', lambda *a, **kw: pytest.fail('must not start network CLI'))
    assert download.download('gislr', tmp_path) == 2
    assert download.download('gislr', tmp_path, offline=True) == 2
    assert download.download('asl-citizen', tmp_path) == 2
    monkeypatch.setattr(download, 'has_kaggle_credentials', lambda: True)
    monkeypatch.setattr(download.shutil, 'disk_usage', lambda _: SimpleNamespace(free=0))
    assert download.download('gislr', tmp_path) == 2
    (tmp_path / 'gislr').mkdir()
    (tmp_path / 'gislr/asl-signs.zip').touch()
    assert download.download('gislr', tmp_path) == 0


def test_dead_link_logging_continues_and_guide_preserves_phase1(tmp_path, monkeypatch):
    def fail(*a, **kw):
        raise urllib.error.HTTPError('https://example.invalid', 404, 'missing', {}, None)
    monkeypatch.setattr(download.urllib.request, 'urlopen', fail)
    for i in range(2):
        assert not download.fetch_url('https://example.invalid', tmp_path / f'{i}.zip', tmp_path / 'dead.jsonl')
    assert len((tmp_path / 'dead.jsonl').read_text().splitlines()) == 2
    assert not list(tmp_path.glob('*.part'))
    guide = tmp_path / 'guide.md'
    guide.write_text('# Existing Phase 1\nKeep me\n')
    download.write_human_guide(guide)
    first = guide.read_bytes()
    download.write_human_guide(guide)
    assert guide.read_bytes() == first
    assert 'Keep me' in guide.read_text()
    assert 'Expected SHA256' in guide.read_text()


def test_credentials_are_checked_without_exposing_tokens(tmp_path, monkeypatch):
    monkeypatch.delenv('KAGGLE_USERNAME', raising=False)
    monkeypatch.delenv('KAGGLE_KEY', raising=False)
    monkeypatch.setenv('KAGGLE_CONFIG_DIR', str(tmp_path))
    assert not download.has_kaggle_credentials()
    (tmp_path / 'kaggle.json').write_text(json.dumps({'username': 'fixture', 'key': 'fixture'}))
    assert download.has_kaggle_credentials()


def test_tgz_and_own_session_provenance(tmp_path):
    directory, _ = make_archive(tmp_path, 'asl_citizen', 1)
    archive = tmp_path / 'dataset.tgz'
    with tarfile.open(archive, 'w:gz') as tar:
        for p in directory.iterdir():
            tar.add(p, arcname='nested/' + p.name)
    assert len(verify_source(archive, 'asl_citizen')) == 1


def test_extracted_mirror_with_external_metadata_and_archive(tmp_path):
    directory, archive = make_archive(tmp_path / 'raw')
    archive.replace(directory / archive.name)
    frame = build_manifest(tmp_path / 'raw', tmp_path / 'manifest.parquet')
    assert len(frame) == 30
    assert (tmp_path / 'manifest.archive_checksums.json').exists()
    # Explicit reviewed metadata takes precedence over an incompatible publisher CSV.
    (directory / 'train.csv').write_text('unknown,columns\na,b\n')
    assert len(verify_source(directory, 'gislr')) == 30


def test_downloader_cli_success_failure_and_http_stream(tmp_path, monkeypatch):
    import io
    monkeypatch.setattr(download, 'has_kaggle_credentials', lambda: True)
    monkeypatch.setattr(download.shutil, 'disk_usage', lambda _: SimpleNamespace(free=10**15))
    calls = []
    monkeypatch.setattr(download.subprocess, 'run', lambda cmd, **kw: calls.append(cmd))
    assert download.download('gislr', tmp_path) == 0
    assert calls[0][0:3] == ['kaggle', 'competitions', 'download']
    assert download.download('how2sign-holistic', tmp_path, 'research') == 0
    assert (tmp_path / 'how2sign/.download-complete').exists()
    def failed(*a, **kw):
        raise OSError('CLI missing')
    monkeypatch.setattr(download.subprocess, 'run', failed)
    assert download.download('aslfr', tmp_path) == 2
    monkeypatch.setattr(download.urllib.request, 'urlopen', lambda *a, **kw: io.BytesIO(b'synthetic archive'))
    assert download.download('asl-citizen', tmp_path, 'research') == 0
    assert (tmp_path / 'asl_citizen/ASL_Citizen.zip').read_bytes() == b'synthetic archive'
