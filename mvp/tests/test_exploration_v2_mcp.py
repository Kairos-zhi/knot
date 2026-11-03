import asyncio
import json
import sys
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from pathlib import Path
import pytest
from mcp import Client, StdioServerParameters
from mvp.backend.init_db import init_database
from mvp.backend.migrate_schema_v1_8 import migrate_schema as migrate8
from mvp.backend.migrate_schema_v1_9 import migrate_schema as migrate9
from mvp.tests.test_http_contract import Live
from mvp.tests.test_exploration_core import asset, db_rows, uid
from mvp.contract.selfcheck import request
from mvp.codex_mcp import exploration_call
from mvp.tests.test_codex_mcp import upstream

ROOT=Path(__file__).resolve().parents[2]
TOKEN='synthetic-c3b-token'


def test_sdk_relation_fork_and_large_load(tmp_path,monkeypatch):
    monkeypatch.setenv('KNOT_TOKENS',json.dumps({TOKEN:'A','other-synthetic':'B'})); monkeypatch.delenv('KNOT_TOKEN',raising=False)
    db=tmp_path/'isolated.db'; init_database(db); migrate8(db); migrate9(db)
    a,b=asset(db,b'a'),asset(db,b'b'); live=Live(db)
    def params(token=TOKEN):
        return StdioServerParameters(command=sys.executable,args=['-B','-m','mvp.codex_mcp','--origin',live.base],cwd=ROOT,env={'KNOT_TOKEN':token})
    async def scenario():
        ident=uid(); rels=[dict(relation_id=uid(),from_asset_id=a['asset_id'],to_asset_id=b['asset_id'],label='关系',reason='中'*170) for _ in range(64)]
        args=dict(exploration_id=ident,expected_revision=0,request_key=uid(),snapshot_version=2,references=[a,b],stop_note='continue',relations=rels)
        async with Client(params()) as client:
            listing=await client.list_tools(); assert len(listing.tools)==9
            first=(await client.call_tool('knot_save_exploration_v2',args)).structured_content
            assert first['revision']==1
            saved=(await client.call_tool('knot_save_exploration_v2',args|{'expected_revision':1,'request_key':uid(),'relations':[]})).structured_content
            assert saved['revision']==2
            fork=dict(source_exploration_id=ident,source_revision=1,source_event_id=first['event_id'],exploration_id=uid(),request_key=uid())
            receipt=(await client.call_tool('knot_fork_exploration',fork)).structured_content
            assert receipt['revision']==1
            http_value=request(live.base,'/explorations/'+fork['exploration_id']+'/v2',token=TOKEN)[1]
            assert len(json.dumps(http_value,ensure_ascii=True).encode()) > 64*1024
            loaded=(await client.call_tool('knot_load_exploration_v2',{'exploration_id':fork['exploration_id']})).structured_content
            assert len(loaded['relations'])==64 and loaded['origin']['source_revision']==1
            branch_update=args|{'exploration_id':fork['exploration_id'],'expected_revision':1,'request_key':uid(),'relations':[], 'stop_note':'branch'}
            assert (await client.call_tool('knot_save_exploration_v2',branch_update)).structured_content['revision']==2
            assert (await client.call_tool('knot_load_exploration_v2',{'exploration_id':ident})).structured_content['stop_note']=='continue'
            assert (await client.call_tool('knot_load_exploration',{'exploration_id':ident})).structured_content=={'error':'SNAPSHOT_VERSION_REQUIRED'}
            assert (await client.call_tool('knot_fork_exploration',fork)).structured_content==receipt
        async with Client(params('other-synthetic')) as client:
            assert (await client.call_tool('knot_load_exploration_v2',{'exploration_id':ident})).structured_content=={'error':'NOT_FOUND'}
        db_rows(db,'DELETE FROM asset_readers WHERE asset_id=?',(b['asset_id'],))
        async with Client(params()) as client:
            hidden=(await client.call_tool('knot_load_exploration_v2',{'exploration_id':fork['exploration_id'],'revision':1})).structured_content
            assert hidden['relations'][0]['reason_code']=='dependency_unavailable' and hidden['stop_note'] is None
            assert (await client.call_tool('knot_fork_exploration',fork)).structured_content==receipt
    try: asyncio.run(asyncio.wait_for(scenario(),timeout=35))
    finally: live.stop()


def test_write_size_rejected_before_http(monkeypatch):
    import mvp.codex_mcp as module
    sent=[]
    async def fake(*args,**kwargs): sent.append(args); return 200,{}
    monkeypatch.setattr(module,'request_envelope',fake)
    # Many escaped tabs are valid per field but inflate the serialized request.
    refs=[dict(asset_id=uid(),expected_content_hash='a'*64,disposition='selected',reason='\t'*512) for _ in range(32)]
    rels=[dict(relation_id=uid(),from_asset_id=refs[0]['asset_id'],to_asset_id=refs[1]['asset_id'],label='x'+'\t'*127,reason='\t'*512) for _ in range(64)]
    args=dict(exploration_id=uid(),expected_revision=0,request_key=uid(),snapshot_version=2,references=refs,stop_note='\t'*2048,relations=rels)
    assert len(json.dumps(args,ensure_ascii=False,separators=(',',':')).encode()) > 128*1024
    assert asyncio.run(exploration_call('http://127.0.0.1:1','knot_save_exploration_v2',args,TOKEN))=={'error':'INVALID_ARGUMENTS'}
    assert not sent


def test_v2_limit_and_error_mapping(upstream):
    origin, requests, responses = upstream
    ident=uid(); args={'exploration_id':ident}
    responses.extend([(200,b'x'*(256*1024+1),{},0),
                      (500,json.dumps({'contract_version':1,'ok':False,'error':{'code':'INTERNAL','message':'INTERNAL','detail':{'reason':'exploration_snapshot_invalid'}}}).encode(),{},0)])
    assert asyncio.run(exploration_call(origin,'knot_load_exploration_v2',args,TOKEN))=={'error':'UPSTREAM_ERROR'}
    assert asyncio.run(exploration_call(origin,'knot_load_exploration_v2',args,TOKEN))=={'error':'SNAPSHOT_INVALID'}


def test_all_write_500_unknown(monkeypatch):
    import mvp.codex_mcp as module
    async def fake(*args,**kwargs):
        return 500,{'contract_version':1,'ok':False,'error':{'code':'INTERNAL','message':'INTERNAL','detail':{'reason':'exploration_snapshot_invalid'}}}
    monkeypatch.setattr(module,'request_envelope',fake)
    args=dict(exploration_id=uid(),expected_revision=0,request_key=uid(),snapshot_version=2,references=[],stop_note=None,relations=[])
    assert asyncio.run(exploration_call('http://127.0.0.1:1','knot_save_exploration_v2',args,TOKEN))=={'error':'WRITE_OUTCOME_UNKNOWN'}


def test_sdk_lost_fork_receipt_and_restart(tmp_path,monkeypatch):
    monkeypatch.setenv('KNOT_TOKENS',json.dumps({TOKEN:'A'})); monkeypatch.delenv('KNOT_TOKEN',raising=False)
    db=tmp_path/'lost.db'; init_database(db); migrate8(db); migrate9(db); live=Live(db)
    args=dict(exploration_id=uid(),expected_revision=0,request_key=uid(),snapshot_version=2,references=[],stop_note=None,relations=[])
    first=request(live.base,'/exploration-v2-saves',args,token=TOKEN)[1]['value']
    fork=dict(source_exploration_id=args['exploration_id'],source_revision=1,source_event_id=first['event_id'],exploration_id=uid(),request_key=uid())
    writes=[]
    class Drop(BaseHTTPRequestHandler):
        def do_POST(self):
            payload=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            writes.append(request(live.base,self.path,payload,token=self.headers['Authorization'][7:]))
            self.close_connection=True; self.connection.shutdown(socket.SHUT_RDWR)
        def log_message(self,*args): pass
    def params(origin): return StdioServerParameters(command=sys.executable,args=['-B','-m','mvp.codex_mcp','--origin',origin],cwd=ROOT,env={'KNOT_TOKEN':TOKEN})
    async def call(origin):
        async with Client(params(origin)) as client:
            return (await client.call_tool('knot_fork_exploration',fork)).structured_content
    try:
        with ThreadingHTTPServer(('127.0.0.1',0),Drop) as proxy:
            thread=Thread(target=proxy.serve_forever,daemon=True); thread.start()
            try: assert asyncio.run(call('http://127.0.0.1:'+str(proxy.server_port)))=={'error':'WRITE_OUTCOME_UNKNOWN'}
            finally: proxy.shutdown(); thread.join()
        assert len(writes)==1 and writes[0][0]==200
        live.stop(); live.start()
        assert asyncio.run(call(live.base))==writes[0][1]['value']
        assert db_rows(db,'SELECT count(*) FROM exploration_origins')==[(1,)]
    finally:
        if live.process.poll() is None: live.stop()


def test_unique_serialized_bytes_are_sent():
    from mvp.exploration_policy import normalize_save_v2
    args=dict(exploration_id=uid(),expected_revision=0,request_key=uid(),snapshot_version=2,references=[],stop_note='中文\t',relations=[])
    expected=json.dumps(normalize_save_v2(args,TOKEN),ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
    received=[]
    class Capture(BaseHTTPRequestHandler):
        def do_POST(self):
            received.append((self.headers.get('Content-Type'),self.rfile.read(int(self.headers['Content-Length']))))
            data=json.dumps({'contract_version':1,'ok':True,'value':{'exploration_id':args['exploration_id'],'revision':1,'event_id':uid()}}).encode()
            self.send_response(200); self.end_headers(); self.wfile.write(data)
        def log_message(self,*args): pass
    with ThreadingHTTPServer(('127.0.0.1',0),Capture) as server:
        thread=Thread(target=server.serve_forever,daemon=True); thread.start()
        try:
            result=asyncio.run(exploration_call('http://127.0.0.1:'+str(server.server_port),'knot_save_exploration_v2',args,TOKEN))
            assert result['revision']==1 and received==[('application/json',expected)]
        finally: server.shutdown(); thread.join()


def test_legacy_fixed_errors(monkeypatch):
    import mvp.codex_mcp as module
    async def fake(*args,**kwargs):
        return 409,{'contract_version':1,'ok':False,'error':{'code':'BAD_REQUEST','message':'BAD_REQUEST','detail':{'reason':'snapshot_version_required'}}}
    monkeypatch.setattr(module,'request_envelope',fake)
    assert asyncio.run(exploration_call('http://127.0.0.1:1','knot_load_exploration',{'exploration_id':uid()},TOKEN))=={'error':'SNAPSHOT_VERSION_REQUIRED'}


def test_v2_readonly_refuses_write_and_replay(tmp_path,monkeypatch):
    from mvp.backend.http_server import Server
    monkeypatch.setenv('KNOT_TOKENS',json.dumps({TOKEN:'A'})); monkeypatch.delenv('KNOT_TOKEN',raising=False)
    db=tmp_path/'readonly.db'; init_database(db); migrate8(db); migrate9(db)
    server=Server(db,port=0); thread=Thread(target=server.serve_forever,daemon=True); thread.start()
    origin='http://127.0.0.1:'+str(server.server_port)
    args=dict(exploration_id=uid(),expected_revision=0,request_key=uid(),snapshot_version=2,references=[],stop_note=None,relations=[])
    try:
        with server.changed: server.journal['pending']={'body':{},'actor':'A','since':0}
        assert asyncio.run(exploration_call(origin,'knot_save_exploration_v2',args,TOKEN))=={'error':'SERVER_READ_ONLY'}
        assert not db_rows(db,'SELECT * FROM exploration_revisions')
        with server.changed: server.journal.pop('pending')
        saved=asyncio.run(exploration_call(origin,'knot_save_exploration_v2',args,TOKEN)); assert saved['revision']==1
        with server.changed: server.jobs.failed=True
        assert asyncio.run(exploration_call(origin,'knot_save_exploration_v2',args,TOKEN))=={'error':'SERVER_READ_ONLY'}
        with server.changed: server.jobs.failed=False
        assert asyncio.run(exploration_call(origin,'knot_save_exploration_v2',args,TOKEN))==saved
    finally: server.shutdown(); server.server_close(); thread.join()
