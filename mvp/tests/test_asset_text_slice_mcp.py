import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from mvp.codex_mcp import read_asset_slice
from mvp.plugin_projection import project_asset_slice
from mcp import Client, StdioServerParameters
from mcp.types import CallToolResult
from mcp_types import methods as sdk_methods
from test_codex_mcp import ASSET, HASH, PRIVATE, upstream
from test_asset_text_slice_http import service


ARGS={'asset_id':ASSET,'expected_hash':HASH,'offset':0,'limit':4}
VALUE={'asset_id':ASSET,'content_hash':HASH,'media_type':'text/plain','total_bytes':8,
       'offset':0,'next_offset':4,'text':'abcd','has_more':True}
ENV={'contract_version':1,'ok':True,'value':VALUE}


def test_projection_invariants():
    assert project_asset_slice(ENV,ASSET,HASH,0,4,PRIVATE)==VALUE
    for changes in ({'next_offset':3,'text':'ab'}, {'next_offset':0,'text':''},
                    {'has_more':False}, {'offset':True}, {'media_type':[]},
                    {'content_hash':'b'*64}, {'total_bytes':3}, {'text':'\ud800'},
                    {'text':'a\x00cd'}, {'extra':1}):
        bad=ENV | {'value':VALUE | changes}
        assert project_asset_slice(bad,ASSET,HASH,0,4,PRIVATE)=={'error':'UPSTREAM_ERROR'}
    eof=VALUE | {'total_bytes':4,'offset':4,'next_offset':4,'text':'','has_more':False}
    assert project_asset_slice(ENV | {'value':eof},ASSET,HASH,4,4,PRIVATE)==eof
    secret=VALUE | {'text':PRIVATE, 'total_bytes':len(PRIVATE), 'next_offset':len(PRIVATE), 'has_more':False}
    assert project_asset_slice(ENV | {'value':secret},ASSET,HASH,0,20,PRIVATE)=={'error':'SENSITIVE_CONTENT'}


def test_transport_one_get_and_strict(upstream):
    origin,requests,responses=upstream
    responses.extend([(200,json.dumps(ENV).encode(),{},0),
                      (200,b'{"contract_version":1,"contract_version":1,"ok":true,"value":{}}',{},0),
                      (200,b'x'*65537,{},0)])
    async def run():
        assert await read_asset_slice(origin,ARGS,PRIVATE)==VALUE
        assert await read_asset_slice(origin,ARGS,PRIVATE)=={'error':'UPSTREAM_ERROR'}
        assert await read_asset_slice(origin,ARGS,PRIVATE)=={'error':'UPSTREAM_ERROR'}
        assert await read_asset_slice(origin,ARGS | {'offset':True},PRIVATE)=={'error':'INVALID_ARGUMENTS'}
        assert await read_asset_slice(origin,ARGS,None)=={'error':'ACCESS_DENIED'}
    asyncio.run(run())
    assert len(requests)==3 and all(p.startswith('/asset-text-slices?') and h=='Bearer '+PRIVATE for p,h in requests)


@pytest.mark.parametrize('status,code,detail,expected', [
    (400,'BAD_REQUEST',{},'INVALID_ARGUMENTS'), (403,'FORBIDDEN_VIEW',{},'ACCESS_DENIED'),
    (400,'BAD_REQUEST',{'reason':'unsupported_content'},'UNSUPPORTED_CONTENT'),
    (400,'BAD_REQUEST',{'reason':'content_too_large'},'CONTENT_TOO_LARGE'),
    (400,'BAD_REQUEST',{'reason':'content_mismatch'},'CONTENT_MISMATCH'),
    (400,'BAD_REQUEST',{'reason':'sensitive_content'},'SENSITIVE_CONTENT'),
    (503,'SERVER_BUSY',{'reason':'text_slice_limit'},'READ_LIMIT_REACHED'),
    (400,'BAD_REQUEST',{'reason':'other'},'UPSTREAM_ERROR'),
    (403,'FORBIDDEN_VIEW',{'reason':'x'},'UPSTREAM_ERROR'),
    (500,'INTERNAL',{},'UPSTREAM_ERROR')])
def test_errors(upstream,status,code,detail,expected):
    origin,requests,responses=upstream
    responses.append((status,json.dumps({'contract_version':1,'ok':False,'error':{'code':code,'message':code,'detail':detail}}).encode(),{},0))
    assert asyncio.run(read_asset_slice(origin,ARGS,PRIVATE))=={'error':expected}


@pytest.mark.parametrize('version',['2024-11-05','2025-03-26','2025-06-18','2025-11-25'])
def test_stdio_wire_result_matches_sdk_serialization(upstream,version):
    origin,requests,responses=upstream
    responses.append((200,json.dumps(ENV).encode(),{},0))
    env=os.environ.copy(); env['KNOT_TOKEN']=PRIVATE
    proc=subprocess.Popen([sys.executable,'-B','-m','mvp.codex_mcp','--origin',origin],
                          cwd=Path(__file__).resolve().parents[2],env=env,
                          stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        messages=[{'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':version,'capabilities':{},'clientInfo':{'name':'test','version':'1'}}},
                  {'jsonrpc':'2.0','method':'notifications/initialized'},
                  {'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'knot_read_asset_slice','arguments':ARGS}}]
        for message in messages:
            proc.stdin.write(json.dumps(message).encode()+b'\n'); proc.stdin.flush()
        first=proc.stdout.readline(); second=proc.stdout.readline()
        assert json.loads(first)['id']==1 and json.loads(first)['result']['protocolVersion']==version
        outer=json.loads(second); assert outer['id']==2
        parsed=CallToolResult.model_validate(outer['result'])
        shaped=sdk_methods.serialize_server_result('tools/call',version,parsed.model_dump(by_alias=True,mode='json',exclude_none=True))
        encoded=json.dumps(shaped,ensure_ascii=False,separators=(',',':')).encode()
        assert b'"result":'+encoded in second
        assert json.loads(parsed.content[0].text)==VALUE
        assert PRIVATE.encode() not in encoded and len(encoded)<=65536
    finally:
        proc.stdin.close(); proc.wait(timeout=10)
    assert proc.returncode==0


def test_actual_backend_reauthorization_and_whole_content(service):
    import hashlib
    import sqlite3
    from contextlib import closing
    server,db,aid,digest,data=service
    origin=f'http://127.0.0.1:{server.server_port}'
    args={'asset_id':aid,'expected_hash':digest,'offset':0,'limit':4}
    async def call(): return await read_asset_slice(origin,args,'synthetic-token-123')
    assert asyncio.run(call())['text']=='汉'
    with closing(sqlite3.connect(db)) as c, c: c.execute('DELETE FROM asset_readers WHERE asset_id=?',(aid,))
    assert asyncio.run(call())=={'error':'ACCESS_DENIED'}
    content=b'safe '+b'x'*9000+b' PASSWORD=secret'; newhash=hashlib.sha256(content).hexdigest()
    with closing(sqlite3.connect(db)) as c, c:
        c.execute('INSERT INTO asset_readers VALUES (?,?)',(aid,'A'))
        c.execute('UPDATE assets SET content_blob=?,content_hash=? WHERE asset_id=?',(content,newhash,aid))
    args['expected_hash']=newhash
    assert asyncio.run(call())=={'error':'SENSITIVE_CONTENT'}
    with closing(sqlite3.connect(db)) as c, c: c.execute('UPDATE assets SET content_blob=? WHERE asset_id=?',(b'tampered',aid))
    assert asyncio.run(call())=={'error':'CONTENT_MISMATCH'}


def test_output_guard_catches_token_in_metadata(upstream):
    origin,requests,responses=upstream
    responses.append((200,json.dumps(ENV).encode(),{},0))
    params=StdioServerParameters(command=sys.executable,args=['-B','-m','mvp.codex_mcp','--origin',origin],
                                 cwd=Path(__file__).resolve().parents[2],env={'KNOT_TOKEN':'text/plain'})
    async def run():
        async with Client(params) as client:
            result=await client.call_tool('knot_read_asset_slice',ARGS)
            assert result.structured_content=={'error':'SENSITIVE_CONTENT'} and result.is_error
    asyncio.run(run())


def test_modern_auto_server_stamp_token_guard(upstream):
    origin,requests,responses=upstream
    responses.append((200,json.dumps(ENV).encode(),{},0))
    params=StdioServerParameters(command=sys.executable,args=['-B','-m','mvp.codex_mcp','--origin',origin],
                                 cwd=Path(__file__).resolve().parents[2],env={'KNOT_TOKEN':'Knot'})
    async def run():
        async with Client(params,mode='auto') as client:
            assert client.protocol_version=='2026-07-28'
            result=await client.call_tool('knot_read_asset_slice',ARGS)
            assert result.structured_content=={'error':'SENSITIVE_CONTENT'} and result.is_error
    asyncio.run(run())
