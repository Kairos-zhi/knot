from hashlib import sha256
import sqlite3
from uuid import uuid4

import pytest

from mvp.backend import init_db
from mvp.backend.exploration_repo import ExplorationRepo
from mvp.backend.migrate_schema_v1_5 import migrate_schema as migrate5
from mvp.backend.migrate_schema_v1_6 import migrate_schema as migrate6
from mvp.backend.migrate_schema_v1_7 import migrate_schema as migrate7
from mvp.backend.migrate_schema_v1_8 import migrate_schema as migrate8
from mvp.tests.schema_helpers import create_v14


def uid(): return str(uuid4())


@pytest.mark.parametrize('version', [4,5,6,7,8])
def test_existing_legacy_is_not_migrated(tmp_path,version):
    path=tmp_path/'old.db'; create_v14(path)
    for number, fn in ((5,migrate5),(6,migrate6),(7,migrate7),(8,migrate8)):
        if number<=version: fn(path)
    before=path.read_bytes(); result=init_db.init_database(str(path))
    assert result['status']=='refused' and result['reason']=='target_exists'
    assert path.read_bytes()==before and sha256(path.read_bytes()).digest()==sha256(before).digest()
    with sqlite3.connect(path) as conn:
        assert conn.execute('SELECT version FROM schema_version ORDER BY version').fetchall()==[(f'1.{i}',) for i in range(version+1)]


def test_fresh_supports_v2_and_fork_without_migration(tmp_path):
    path=tmp_path/'fresh.db'; result=init_db.init_database(str(path))
    assert result['status']=='created' and result['schema_version']=='1.9'
    repo=ExplorationRepo(path); source,target=uid(),uid()
    saved=repo.save_v2('A',source,expected_revision=0,request_key=uid(),snapshot_version=2,references=[],stop_note='stop',relations=[])
    fork=repo.fork('A',source,1,saved['event_id'],target,uid())
    assert fork['revision']==1 and repo.load_v2('A',target)['origin']['source_event_id']==saved['event_id']


def test_sidecar_prevents_publication(tmp_path,monkeypatch):
    actual=init_db.os.path.lexists
    def present(path):
        if '.tmp-' in str(path) and str(path).endswith('-wal'): return True
        return actual(path)
    monkeypatch.setattr(init_db.os.path,'lexists',present)
    path=tmp_path/'new.db'; result=init_db.init_database(str(path))
    assert result['status']=='failed' and 'sidecars' in result['error']
    assert not path.exists() and list(tmp_path.iterdir())==[]


def test_replaced_target_after_publication_is_preserved(tmp_path,monkeypatch):
    path=tmp_path/'new.db'; original=init_db._readback
    def replace(target):
        if target == path:
            target.unlink(); target.write_bytes(b'other creator')
            raise OSError('injected after replacement')
        original(target)
    monkeypatch.setattr(init_db,'_readback',replace)
    result=init_db.init_database(str(path))
    assert result['status']=='failed' and path.read_bytes()==b'other creator'


def test_uncheckpointed_wal_reader_prevents_staging_seal(tmp_path):
    path=tmp_path/'staging.db'
    writer=sqlite3.connect(path); reader=sqlite3.connect(path)
    try:
        assert writer.execute('PRAGMA journal_mode=WAL').fetchone()[0]=='wal'
        writer.execute('CREATE TABLE probe (value INTEGER)'); writer.commit()
        reader.execute('BEGIN'); reader.execute('SELECT count(*) FROM probe').fetchone()
        writer.execute('INSERT INTO probe VALUES (1)'); writer.commit()
        with pytest.raises(ValueError,match='checkpoint incomplete'):
            init_db._checkpoint_staging(path)
    finally:
        reader.close(); writer.close()
    init_db._checkpoint_staging(path)


@pytest.mark.parametrize('suffix', ['-wal','-shm','-journal'])
def test_existing_target_sidecar_refused_and_preserved(tmp_path,suffix):
    path=tmp_path/'new.db'; side=tmp_path/('new.db'+suffix); side.write_bytes(b'foreign sidecar')
    result=init_db.init_database(str(path))
    assert result['status']=='refused' and result['reason']=='target_sidecar_exists'
    assert not path.exists() and side.read_bytes()==b'foreign sidecar'
    path.write_bytes(b'foreign target')
    result=init_db.init_database(str(path))
    assert result['status']=='refused' and result['reason']=='target_exists'
    assert path.read_bytes()==b'foreign target' and side.read_bytes()==b'foreign sidecar'


def test_sidecar_appears_at_publication_is_preserved(tmp_path,monkeypatch):
    path=tmp_path/'new.db'; side=tmp_path/'new.db-journal'; link=init_db.os.link
    def race(source,target):
        link(source,target); side.write_bytes(b'foreign journal')
    monkeypatch.setattr(init_db.os,'link',race)
    result=init_db.init_database(str(path))
    assert result['status']=='failed' and not path.exists()
    assert side.read_bytes()==b'foreign journal' and list(tmp_path.iterdir())==[side]


def test_sidecar_appears_before_publication_is_preserved(tmp_path,monkeypatch):
    path=tmp_path/'new.db'; side=tmp_path/'new.db-shm'; readback=init_db._readback
    def race(target):
        readback(target)
        if target!=path: side.write_bytes(b'foreign sidecar')
    monkeypatch.setattr(init_db,'_readback',race)
    result=init_db.init_database(str(path))
    assert result['status']=='refused' and result['reason']=='target_sidecar_exists'
    assert not path.exists() and side.read_bytes()==b'foreign sidecar'
