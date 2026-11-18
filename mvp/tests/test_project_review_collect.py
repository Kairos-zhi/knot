"""Portable synthetic roots and source-tree immutability for manual collection."""
from copy import deepcopy
from hashlib import sha256
import json
import os
from pathlib import Path
import subprocess
import sys
import shlex

import pytest

from mvp import project_policy as policy
from mvp.devtools import project_review_collect as collect


TOKEN='synthetic-collection-token'
BINDING=dict(project_id='11111111-1111-4111-8111-111111111111', revision='2', manifest_hash='a'*64)


def scene(pid, revision):
    assert pid==BINDING['project_id'] and revision==BINDING['revision']
    return deepcopy(BINDING)


def snapshot(root):
    return {path.relative_to(root).as_posix():sha256(path.read_bytes()).hexdigest()
            for path in root.rglob('*') if path.is_file() and not path.is_symlink()}


def test_collects_portable_root_as_data_never_moves_or_modifies_engineering(tmp_path):
    root=tmp_path/'someone-else-machine'/'project'; root.mkdir(parents=True)
    (root/'README.md').write_text('当前目标：先做一次有来源的项目整理。',encoding='utf-8')
    (root/'STATE.md').write_text('只读证据，完成状态待核。',encoding='utf-8')
    (root/'.env').write_text('SECRET=do-not-collect',encoding='utf-8')
    (root/'run.py').write_text('raise RuntimeError("must never execute")',encoding='utf-8')
    (root/'outputs').mkdir();(root/'outputs'/'poster.png').write_bytes(b'synthetic-poster-bytes')
    before=snapshot(root)
    result=collect.prepare_collection(BINDING,TOKEN,scene,root)
    assert result['available'] and result['summary']['documents']==2 and result['summary']['media']==1
    record=json.loads(result['document']['text'])
    assert record['git'] is None
    assert {item['path'] for item in record['documents']}=={'README.md','STATE.md'}
    assert record['media'][0]['content_hash']==sha256(b'synthetic-poster-bytes').hexdigest()
    assert 'do-not-collect' not in result['document']['text'] and str(root) not in result['document']['text']
    assert '未归档正文' in result['message'] and record['project_id']==BINDING['project_id']
    assert before==snapshot(root)


def test_unconfigured_project_can_still_use_retained_materials():
    result=collect.prepare_collection(BINDING,TOKEN,scene,None)
    assert result['available'] is False and result['document'] is None
    assert '可继续整理已留存资料' in result['message']


def test_no_browser_paths_and_version_mismatch_reject_before_filesystem(tmp_path):
    with pytest.raises(policy.ProjectError):
        collect.prepare_collection(BINDING|dict(root=str(tmp_path)),TOKEN,scene,tmp_path)
    def mismatch(pid,revision):return BINDING|dict(manifest_hash='b'*64)
    with pytest.raises(policy.ProjectError):
        collect.prepare_collection(BINDING,TOKEN,mismatch,tmp_path)


def test_limits_are_explicit_and_multibyte_truncation_preserves_readable_text(tmp_path):
    (tmp_path/'README.md').write_text('项目资料。'*4000,encoding='utf-8')
    docs=tmp_path/'mvp'/'docs';docs.mkdir(parents=True)
    for number in range(20):(docs/f'{number}.md').write_text('More evidence',encoding='utf-8')
    result=collect.prepare_collection(BINDING,TOKEN,scene,tmp_path)
    record=json.loads(result['document']['text'])
    assert result['summary']['limited'] and len(record['documents'])<=8
    assert record['documents'][0]['truncated'] and record['documents'][0]['text'].startswith('项目资料')
    assert len(result['document']['text'].encode())<=60000
    assert record['limits']['recent_commits']==20


def test_symlink_docs_or_media_cannot_cross_the_explicit_root(tmp_path):
    root=tmp_path/'project';root.mkdir();outside=tmp_path/'outside';outside.mkdir()
    (outside/'private.md').write_text('Outside workspace',encoding='utf-8')
    try:(root/'mvp').symlink_to(outside,target_is_directory=True)
    except OSError:pytest.skip('Symlink unavailable on this synthetic host')
    result=collect.prepare_collection(BINDING,TOKEN,scene,root)
    assert 'Outside workspace' not in result['document']['text']
    with pytest.raises(policy.ProjectError):collect.prepare_collection(BINDING,TOKEN,scene,root/'mvp')


def test_git_observation_keeps_index_worktree_and_config_unchanged(tmp_path):
    if collect.shutil.which('git') is None:pytest.skip('Git unavailable')
    def git(*args):
        return subprocess.run(['git','-C',str(tmp_path),*args],check=True,capture_output=True)
    git('init');(tmp_path/'README.md').write_text('Initial project goal',encoding='utf-8')
    git('add','README.md');git('-c','user.name=Synthetic','-c','user.email=synthetic@example.test','commit','-m','Initial goal')
    (tmp_path/'README.md').write_text('Current changed goal',encoding='utf-8')
    before=snapshot(tmp_path)
    result=collect.prepare_collection(BINDING,TOKEN,scene,tmp_path)
    record=json.loads(result['document']['text'])
    assert result['summary']['git'] and 'Initial goal' in record['git']['commits']['text']
    assert '未运行Git工作区检查' in record['git']['status']['text']
    assert before==snapshot(tmp_path)


@pytest.mark.skipif(os.name!='nt', reason='Windows junction boundary')
def test_windows_junction_in_any_parent_cannot_supply_documents_or_media(tmp_path):
    import _winapi
    root=tmp_path/'project';root.mkdir();outside=tmp_path/'outside';outside.mkdir()
    (outside/'docs').mkdir();(outside/'docs'/'private.md').write_text('OUTSIDE_JUNCTION_TEXT',encoding='utf-8')
    (outside/'private.png').write_bytes(b'OUTSIDE_JUNCTION_MEDIA')
    _winapi.CreateJunction(str(outside), str(root/'mvp'))
    _winapi.CreateJunction(str(outside), str(root/'outputs'))
    result=collect.prepare_collection(BINDING,TOKEN,scene,root)
    assert result['summary']['documents']==0 and result['summary']['media']==0
    assert 'OUTSIDE_JUNCTION' not in result['document']['text']
    with pytest.raises(policy.ProjectError):collect.prepare_collection(BINDING,TOKEN,scene,root/'mvp')
    (outside/'nested').mkdir();(outside/'nested'/'README.md').write_text('ANCESTOR_JUNCTION_SECRET',encoding='utf-8')
    with pytest.raises(policy.ProjectError):collect.prepare_collection(BINDING,TOKEN,scene,root/'mvp'/'nested')


def initialize_git(root):
    if collect.shutil.which('git') is None:pytest.skip('Git unavailable')
    def git(*args):
        return subprocess.run(['git','-C',str(root),*args],check=True,capture_output=True)
    git('init');return git


def test_approved_subfolder_does_not_expose_parent_git_history(tmp_path):
    git=initialize_git(tmp_path)
    inner=tmp_path/'inner';inner.mkdir();(inner/'README.md').write_text('Only this subtree',encoding='utf-8')
    (tmp_path/'outside.txt').write_text('Outside',encoding='utf-8')
    git('add','.');git('-c','user.name=Synthetic','-c','user.email=test@example.test','commit','-m','OUTSIDE_PARENT_HISTORY')
    (tmp_path/'outside.txt').write_text('Outside changed',encoding='utf-8')
    result=collect.prepare_collection(BINDING,TOKEN,scene,inner)
    record=json.loads(result['document']['text'])
    assert record['git'] is None and 'OUTSIDE_PARENT_HISTORY' not in result['document']['text']
    assert 'outside.txt' not in result['document']['text']


def test_git_clean_filter_is_never_executed_during_collection(tmp_path):
    git=initialize_git(tmp_path)
    (tmp_path/'README.md').write_text('Original body',encoding='utf-8')
    (tmp_path/'.gitattributes').write_text('README.md filter=checkerproof\n',encoding='utf-8')
    git('add','.');git('-c','user.name=Synthetic','-c','user.email=test@example.test','commit','-m','Initial')
    marker=tmp_path/'FILTER_WAS_EXECUTED'
    script=tmp_path/'filter.py'
    script.write_text('import pathlib,sys\npathlib.Path(sys.argv[1]).write_text("called")\nsys.stdout.buffer.write(sys.stdin.buffer.read())\n',encoding='utf-8')
    command=' '.join(shlex.quote(Path(path).as_posix()) for path in (sys.executable,script,marker))
    git('config','filter.checkerproof.clean',command);git('config','filter.checkerproof.required','true')
    (tmp_path/'README.md').write_text('Changed body with a different length',encoding='utf-8')
    result=collect.prepare_collection(BINDING,TOKEN,scene,tmp_path)
    assert result['summary']['git'] and not marker.exists()
    assert 'Changed body' in result['document']['text']


def test_git_prefix_is_bounded_while_generated_not_after_writing_a_temporary_file(tmp_path,monkeypatch):
    git=initialize_git(tmp_path)
    (tmp_path/'README.md').write_text('Body',encoding='utf-8');git('add','README.md')
    message=tmp_path/'.git'/'message.txt';message.write_text('Large history\n\n'+'x'*262144,encoding='utf-8')
    git('-c','user.name=Synthetic','-c','user.email=test@example.test','commit','-F',str(message))
    import tempfile
    monkeypatch.setattr(tempfile,'TemporaryFile',lambda *a,**k:pytest.fail('Collector must not spool unbounded Git output'))
    record=json.loads(collect.prepare_collection(BINDING,TOKEN,scene,tmp_path)['document']['text'])
    assert record['git']['commits']['truncated'] and record['limited']
    assert len(record['git']['commits']['text'].encode('utf-8'))<=collect.MAX_TEXT
