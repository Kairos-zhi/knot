from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import sqlite3
import subprocess
import sys
import json

import pytest
from mvp.backend import exploration_repo, migrate_schema_v1_8, migrate_schema_v1_9
from mvp.backend.exploration_repo import ExplorationRepo
from mvp.backend.migrate_schema_v1_6 import SchemaDriftError
from mvp.tests.test_exploration_core import predecessor, db, db_rows, asset, uid, failure


def setup_source(db, v2=True):
    migrate_schema_v1_8.migrate_schema(db)
    repo, source = ExplorationRepo(db), uid()
    a, b = asset(db, b'a'), asset(db, b'b')
    if v2:
        rel = dict(relation_id=uid(), from_asset_id=a['asset_id'], to_asset_id=b['asset_id'], label='related', reason='why')
        first = repo.save_v2('A', source, expected_revision=0, request_key=uid(), snapshot_version=2,
                             references=[a,b], stop_note='note', relations=[rel])
    else:
        first = repo.save('A', source, expected_revision=0, request_key=uid(), references=[a,b], stop_note='note')
    return repo, source, first, a, b


@pytest.mark.parametrize('v2', [False, True])
def test_history_fork_and_nested_origin(db, v2):
    repo, source, first, a, b = setup_source(db, v2)
    before = db_rows(db, 'SELECT * FROM exploration_revisions')
    branch, key = uid(), uid()
    args = ('A', source, 1, first['event_id'], branch, key)
    failure('EXPLORATION_MIGRATION_REQUIRED', repo.fork, *args)
    migrate_schema_v1_9.migrate_schema(db)
    repo.save_v2('A', source, expected_revision=1, request_key=uid(), snapshot_version=2,
                 references=[a,b], stop_note='source advanced', relations=[])
    result = repo.fork(*args)
    source_raw = db_rows(db, 'SELECT snapshot_json FROM exploration_revisions WHERE exploration_id=? AND revision=1', (source,))[0][0]
    target_raw = db_rows(db, 'SELECT snapshot_json FROM exploration_revisions WHERE exploration_id=?', (branch,))[0][0]
    origin = repo.load_v2('A', branch)['origin']
    assert origin['source_event_id'] == first['event_id']
    assert origin['source_snapshot_sha256'] == sha256(source_raw.encode('utf-8')).hexdigest()
    if v2: assert source_raw == target_raw
    else:
        assert repo.load_v2('A', branch)['snapshot_version'] == 2
        assert repo.load_v2('A', branch)['relations'] == []
    assert db_rows(db, 'SELECT * FROM exploration_revisions WHERE exploration_id=? AND revision=1', (source,)) == before
    failure('SNAPSHOT_VERSION_REQUIRED', repo.load, 'A', branch)
    failure('SNAPSHOT_VERSION_REQUIRED', repo.save, 'A', branch, expected_revision=1, request_key=uid(), references=[])
    branch_next = repo.save_v2('A', branch, expected_revision=1, request_key=uid(), snapshot_version=2,
                               references=[a,b], stop_note='branch', relations=[])
    source_next = repo.save_v2('A', source, expected_revision=2, request_key=uid(), snapshot_version=2,
                               references=[a,b], stop_note='source', relations=[])
    assert branch_next['revision'] == 2 and source_next['revision'] == 3
    assert repo.load_v2('A', branch, revision=1)['origin'] == origin
    nested = uid()
    repo.fork('A', branch, 1, result['event_id'], nested, uid())
    assert repo.load_v2('A', nested)['origin']['source_exploration_id'] == branch
    db_rows(db, 'DELETE FROM asset_readers')
    assert repo.fork(*args) == result
    assert repo.load_v2('A', branch)['stop_note'] is None


def test_rejections_and_keys(db):
    repo, source, first, a, b = setup_source(db)
    migrate_schema_v1_9.migrate_schema(db)
    branch, key = uid(), uid()
    failure('NOT_FOUND', repo.fork, 'B', source, 1, first['event_id'], branch, key)
    failure('NOT_FOUND', repo.fork, 'A', source, 1, uid(), branch, key)
    failure('INVALID_ARGUMENTS', repo.fork, 'A', source, 1, first['event_id'], source, key)
    other = uid(); repo.save('B', other, expected_revision=0, request_key=uid(), references=[])
    failure('NOT_FOUND', repo.fork, 'A', source, 1, first['event_id'], other, key)
    own = uid(); oldkey = uid(); repo.save('A', own, expected_revision=0, request_key=oldkey, references=[])
    failure('REVISION_CONFLICT', repo.fork, 'A', source, 1, first['event_id'], own, key)
    failure('IDEMPOTENCY_CONFLICT', repo.fork, 'A', source, 1, first['event_id'], branch, oldkey)
    db_rows(db, 'DELETE FROM asset_readers WHERE asset_id=?', (b['asset_id'],))
    failure('ASSET_UNAVAILABLE', repo.fork, 'A', source, 1, first['event_id'], branch, key)
    db_rows(db, 'INSERT INTO asset_readers VALUES (?,?)', (b['asset_id'], 'A'))
    db_rows(db, 'UPDATE assets SET content_hash=? WHERE asset_id=?', ('0'*64, b['asset_id']))
    failure('ASSET_UNAVAILABLE', repo.fork, 'A', source, 1, first['event_id'], branch, key)
    db_rows(db, 'UPDATE assets SET content_hash=? WHERE asset_id=?', (b['expected_content_hash'], b['asset_id']))
    db_rows(db, 'DELETE FROM assets WHERE asset_id=?', (b['asset_id'],))
    failure('ASSET_UNAVAILABLE', repo.fork, 'A', source, 1, first['event_id'], branch, key)
    assert not db_rows(db, 'SELECT * FROM exploration_origins')
    assert not db_rows(db, 'SELECT * FROM exploration_revisions WHERE exploration_id=?', (branch,))


def test_origin_immutable_and_atomic(db, monkeypatch):
    repo, source, first, a, b = setup_source(db)
    migrate_schema_v1_9.migrate_schema(db)
    branch, key = uid(), uid()
    def abort(*args): raise RuntimeError('after origin')
    with monkeypatch.context() as patch:
        patch.setattr(exploration_repo, '_receipt', abort)
        with pytest.raises(RuntimeError): repo.fork('A',source,1,first['event_id'],branch,key)
    assert not db_rows(db, 'SELECT * FROM exploration_origins')
    assert not db_rows(db, 'SELECT * FROM exploration_revisions WHERE exploration_id=?', (branch,))
    repo.fork('A',source,1,first['event_id'],branch,key)
    for sql in ('DELETE FROM exploration_origins', "UPDATE exploration_origins SET actor='X'", 'INSERT OR REPLACE INTO exploration_origins SELECT * FROM exploration_origins'):
        with pytest.raises(sqlite3.IntegrityError): db_rows(db, sql)
    db_rows(db, 'DROP TRIGGER exploration_origins_update')
    db_rows(db, "UPDATE exploration_origins SET source_snapshot_sha256='wrong'")
    db_rows(db, migrate_schema_v1_9._DDL['exploration_origins_update'])
    with pytest.raises(SchemaDriftError): repo.list_current('A')


def test_corrupted_target_creation_snapshot_rejected(db):
    repo, source, first, a, b = setup_source(db)
    migrate_schema_v1_9.migrate_schema(db)
    branch = uid(); repo.fork('A',source,1,first['event_id'],branch,uid())
    from mvp.backend import migrate_schema_v1_7
    db_rows(db, 'DROP TRIGGER exploration_revisions_update')
    db_rows(db, 'UPDATE exploration_revisions SET snapshot_json=? WHERE exploration_id=?',
            ('{"references":[],"stop_note":null}', branch))
    db_rows(db, migrate_schema_v1_7._DDL['exploration_revisions_update'])
    with pytest.raises(SchemaDriftError, match='snapshot mismatch'):
        repo.load_v2('A', branch)


def test_parallel_fork_target_and_key(db):
    repo, source, first, a, b = setup_source(db)
    migrate_schema_v1_9.migrate_schema(db)
    branch, key = uid(), uid()
    def work(_): return ExplorationRepo(db).fork('A',source,1,first['event_id'],branch,key)
    with ThreadPoolExecutor(max_workers=2) as pool: results = list(pool.map(work, range(2)))
    assert results[0] == results[1]
    assert len(db_rows(db, 'SELECT * FROM exploration_origins')) == 1


@pytest.mark.parametrize('stage', ['target', 'origin', 'committed'])
def test_process_exit_and_recovery(db, stage):
    repo, source, first, a, b = setup_source(db)
    migrate_schema_v1_9.migrate_schema(db)
    branch, key = uid(), uid()
    code = '''import os,sys,sqlite3
from mvp.backend import exploration_repo as mod
repo=mod.ExplorationRepo(sys.argv[1]); stage=sys.argv[6]
if stage == "target":
 original=mod.sqlite3.connect
 class Conn(sqlite3.Connection):
  def execute(self,sql,*args):
   result=super().execute(sql,*args)
   if "INSERT INTO exploration_revisions" in sql: os._exit(17)
   return result
 def connect(*args,**kwargs): return original(*args,**(kwargs | {"factory":Conn}))
 mod.sqlite3.connect=connect
if stage == "origin": mod._receipt=lambda *args: os._exit(17)
repo.fork("A",sys.argv[2],1,sys.argv[3],sys.argv[4],sys.argv[5])
os._exit(17)
'''
    child = subprocess.run([sys.executable, '-c', code, str(db), source, first['event_id'], branch, key, stage], timeout=20)
    assert child.returncode == 17
    rows = db_rows(db, 'SELECT * FROM exploration_revisions WHERE exploration_id=?', (branch,))
    origins = db_rows(db, 'SELECT * FROM exploration_origins WHERE exploration_id=?', (branch,))
    if stage == 'committed': assert len(rows) == len(origins) == 1
    else: assert not rows and not origins
    receipt = repo.fork('A',source,1,first['event_id'],branch,key)
    assert receipt['revision'] == 1
    assert len(db_rows(db, 'SELECT * FROM exploration_origins WHERE exploration_id=?', (branch,))) == 1


@pytest.mark.parametrize('same_key', [True, False])
def test_two_processes_compete(db, same_key):
    repo, source, first, a, b = setup_source(db)
    migrate_schema_v1_9.migrate_schema(db)
    branch, key = uid(), uid()
    code = '''import sys,json
from mvp.backend.exploration_repo import ExplorationRepo,ExplorationError
try: print(json.dumps(ExplorationRepo(sys.argv[1]).fork("A",sys.argv[2],1,sys.argv[3],sys.argv[4],sys.argv[5])))
except ExplorationError as e: print(json.dumps(e.code))
'''
    keys = [key, key if same_key else uid()]
    processes = [subprocess.Popen([sys.executable,'-c',code,str(db),source,first['event_id'],branch,k], stdout=subprocess.PIPE, text=True) for k in keys]
    values = [json.loads(p.communicate(timeout=20)[0]) for p in processes]
    assert all(p.returncode == 0 for p in processes)
    if same_key: assert values[0] == values[1] and isinstance(values[0], dict)
    else: assert sum(isinstance(v, dict) for v in values) == 1 and 'REVISION_CONFLICT' in values
    assert len(db_rows(db, 'SELECT * FROM exploration_origins')) == 1
