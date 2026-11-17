"""Actual managed process + configured MCP, without real materials or models."""
import asyncio
import json
from http.client import HTTPConnection
import os
import sys

from mcp import Client, StdioServerParameters
import pytest

from mvp.devtools import plugin_runtime as runtime

TOKEN = 'runtime-isolated-synthetic-20261114'


def prepare(tmp_path, monkeypatch):
    paths = runtime._paths(str(tmp_path / 'runtime'))
    assert runtime._init(paths[0], paths[1])['status'] == 'created'
    monkeypatch.setenv('KNOT_RUNTIME_TOKEN', TOKEN)
    monkeypatch.setenv('KNOT_TOKEN','inherited-foreign-secret')
    return paths


def test_managed_backend_real_mcp_and_independent_stop(tmp_path,monkeypatch):
    paths = prepare(tmp_path,monkeypatch)
    root,db,_,service_file,*_ = paths
    started = runtime._start(*paths,0)
    pid,port = started['service']['pid'],started['service']['port']
    try:
        assert runtime._status(root,db,service_file)['status'] == 'running'
        conn = HTTPConnection('127.0.0.1',port,timeout=3)
        conn.request('GET','/explorations',headers={'Authorization':'Bearer inherited-foreign-secret'})
        response=conn.getresponse(); response.read(); conn.close()
        assert response.status == 403
        params = StdioServerParameters(command=sys.executable,
            args=['-B','-m','mvp.codex_mcp','--origin',f'http://127.0.0.1:{port}'],
            cwd=runtime._REPO,env={'KNOT_TOKEN':TOKEN,'PYTHONDONTWRITEBYTECODE':'1'})
        async def check():
            async with Client(params) as client:
                tools=await client.list_tools()
                assert len(tools.tools) == 12
                result=await client.call_tool('knot_list_explorations',{})
                assert not result.is_error and result.structured_content == {'items':[]}
        asyncio.run(asyncio.wait_for(check(),10))
        for path in (root/'runtime').glob('*'):
            if path.is_file():
                assert TOKEN.encode() not in path.read_bytes()
    finally:
        runtime._stop(root,db,service_file)
    assert not runtime._pid_alive(pid)
    conn=HTTPConnection('127.0.0.1',port,timeout=.3)
    try:
        with pytest.raises(OSError): conn.request('GET','/health'); conn.getresponse()
    finally: conn.close()


def test_record_publication_failure_reaps_actual_server(tmp_path,monkeypatch):
    paths=prepare(tmp_path,monkeypatch)
    captured=[]
    def fail(path,record):
        captured.append(record)
        raise OSError('synthetic publication failure')
    monkeypatch.setattr(runtime,'_write_json',fail)
    with pytest.raises(OSError,match='synthetic publication failure'):
        runtime._start(*paths,0)
    assert captured and not runtime._pid_alive(captured[0]['pid'])
    assert not paths[3].exists()


def test_changed_process_identity_refuses_stop_without_killing(tmp_path,monkeypatch):
    paths=prepare(tmp_path,monkeypatch)
    root,db,_,record_file,*_=paths
    started=runtime._start(*paths,0)
    original=record_file.read_text()
    record=json.loads(original)
    record['process_identity']='windows:1' if os.name=='nt' else 'linux:'+'0'*8+'-'+'0'*4+'-'+'0'*4+'-'+'0'*4+'-'+'0'*12+':1'
    record_file.write_text(json.dumps(record))
    try:
        with pytest.raises(runtime.RuntimeFault,match='RUNTIME_OWNERSHIP_MISMATCH'):
            runtime._stop(root,db,record_file)
        assert runtime._pid_alive(started['service']['pid'])
    finally:
        record_file.write_text(original)
        runtime._stop(root,db,record_file)


def test_health_rejects_foreign_database(tmp_path,monkeypatch):
    paths=prepare(tmp_path,monkeypatch)
    root,db,_,record_file,*_=paths
    started=runtime._start(*paths,0)
    try:
        assert runtime._health(started['service']['port'],db.with_name('other.db')) is None
    finally:
        runtime._stop(root,db,record_file)
