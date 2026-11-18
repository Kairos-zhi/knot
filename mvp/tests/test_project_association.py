"""Explicit same-project association retains evidence, source identity and history."""
from copy import deepcopy

import pytest

from mvp.devtools.project_association import association_aliases, associated_listing
from mvp.project_policy import ProjectError

A='11111111-1111-4111-8111-111111111111'
B='22222222-2222-4222-8222-222222222222'
S='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
U='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'


def setup():
    ref=dict(asset_id=S,content_hash='a'*64)
    user=dict(asset_id=U,content_hash='b'*64,text='These two projects are the same project.')
    target=dict(project_id=A,revision='3',manifest_hash='c'*64,
                materials=[ref,dict(asset_id=U,content_hash='b'*64)],observations=[user],has_unavailable=False)
    origin=dict(project_id=B,revision='1',manifest_hash='d'*64,materials=[ref],has_unavailable=False)
    record=dict(version='knot.project-association/0.1',canonical_project_id=A,
        source_projects=[dict(project_id=B,revision='1',manifest_hash='d'*64)],
        basis=dict(asset_id=U,content_hash='b'*64,quote='two projects are the same project'))
    def read(pid,rev):
        if pid==A and rev is None:return target
        assert (pid,rev)==(B,'1')
        return origin
    return record,target,origin,read


def test_association_uses_exact_original_version_and_human_basis_without_mutating():
    record,target,origin,read=setup();before=deepcopy((record,target,origin))
    assert association_aliases(record,read)=={B:A}
    assert (record,target,origin)==before
    listing=dict(items=[dict(project_id=A),dict(project_id=B)])
    assert associated_listing(listing,{B:A})==dict(items=[dict(project_id=A)])
    assert associated_listing(dict(items=[dict(project_id=B)]),{B:A})==dict(items=[dict(project_id=B)])


@pytest.mark.parametrize('failure',['missing_material','missing_basis','wrong_quote','wrong_hash','unavailable','self_link'])
def test_invalid_association_never_hides_a_project(failure):
    record,target,origin,read=setup()
    if failure=='missing_material':target['materials']=target['materials'][1:]
    if failure=='missing_basis':target['observations']=[]
    if failure=='wrong_quote':record['basis']['quote']='invented user approval'
    if failure=='wrong_hash':record['source_projects'][0]['manifest_hash']='e'*64
    if failure=='unavailable':origin['has_unavailable']=True
    if failure=='self_link':record['source_projects'][0]['project_id']=A
    with pytest.raises(ProjectError):association_aliases(record,read)
