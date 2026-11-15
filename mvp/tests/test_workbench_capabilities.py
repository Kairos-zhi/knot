"""SSR configuration declarations via real HTTP; no production data or UI clicks."""
from html.parser import HTMLParser
import json
from pathlib import Path
import shutil
import subprocess

import pytest

from mvp.devtools import workbench
from mvp.devtools.context_workbench import ContextWorkbench
from mvp.devtools.workbench_write import WriteJournal
from test_workbench import request, running


TOKEN = 'synthetic-SSR-secret-<&"-20261115'
BACKEND_PORT = 65431
ASSET = '11111111-1111-4111-8111-111111111111'
HASH = 'b' * 64


class Body(HTMLParser):
    def __init__(self, page):
        super().__init__()
        self.bodies = []
        self.feed(page)
        assert len(self.bodies) == 1
        self.attrs = self.bodies[0]
        assert len(dict(self.attrs)) == len(self.attrs), 'Duplicate body attribute'

    def handle_starttag(self, tag, attrs):
        if tag == 'body':
            self.bodies.append(attrs)


def snapshot(root):
    return {str(path.relative_to(root)): path.read_bytes()
            for path in root.rglob('*') if path.is_file()}


def check_initial_requests(page, script, attrs, history):
    """Run served bytes and SSR attributes in a DOM model, without browser clicks."""
    node = shutil.which('node')
    assert node, 'Node required for served-script request-count evidence'
    harness = r'''
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const payload=JSON.parse(fs.readFileSync(0,'utf8'));
class E {
  constructor(tag='DIV') {this.tagName=tag.toUpperCase();this.children=[];this.value='';this.textContent='';this.dataset={};this.style={};this.disabled=false;this.hidden=false;this.attrs={};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  addEventListener(){}
  setAttribute(key,value){this.attrs[key]=value;}
  focus(){}
  scrollIntoView(){}
  set innerHTML(value){throw Error('Text must never become HTML');}
}
const els={};
for(const m of payload.page.split('<script')[0].matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g))els[m[2]]=new E(m[1]);
const calls=[];
const ctx=vm.createContext({document:{body:{dataset:payload.dataset},getElementById:id=>els[id],createElement:tag=>new E(tag),querySelectorAll:()=>Object.values(els).filter(e=>['BUTTON','INPUT','TEXTAREA','SELECT'].includes(e.tagName))},URLSearchParams,crypto:{randomUUID:()=> '33333333-3333-4333-8333-333333333333'},fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({title:'Synthetic review',items:[],has_unavailable:false})};}});
const execute=code=>vm.runInContext(code,ctx);
execute(payload.script);
assert.equal(calls.length,payload.history?1:0);
(async()=>{
await execute('historyLoad');
assert.deepEqual(calls.map(call=>call.url),payload.history?['/api/decisions?']:[]);
assert(calls.every(call=>(call.options?.method||'GET')==='GET'&&!call.options?.body));
})().catch(e=>{console.error(e);process.exitCode=1;});
'''
    result = subprocess.run(
        [node, '-e', harness],
        input=json.dumps(dict(page=page, script=script, history=history,
                             dataset={key[5:]: value for key, value in attrs.items()})),
        capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize('write', [False, True], ids=['no-save', 'save'])
@pytest.mark.parametrize('context', [False, True], ids=['no-export', 'export'])
@pytest.mark.parametrize('history', [False, True], ids=['no-history', 'history'])
def test_real_http_capabilities_are_closed_private_and_request_free(
        tmp_path, monkeypatch, write, context, history):
    calls = []

    def unexpected(*args, **kwargs):
        calls.append('business call')
        raise AssertionError('SSR must not inspect business state or contact upstream')

    monkeypatch.setattr(workbench, 'upstream', unexpected)
    monkeypatch.setattr(workbench, 'project', unexpected)
    save_root = tmp_path / 'private-save-sentinel'
    packet_root = tmp_path / 'private-export-sentinel'
    packet_root.mkdir()
    server = workbench.create_server(
        BACKEND_PORT, TOKEN, state_root=save_root if write else None,
        packet_root=packet_root if context else None,
        history_asset=ASSET if history else None, history_hash=HASH if history else None)
    assert isinstance(server.writer, WriteJournal) if write else server.writer is None
    assert isinstance(server.context, ContextWorkbench) if context else server.context is None
    for target in (server.writer, server.context):
        if target is not None:
            for method in ('state', 'prepare', 'confirm', 'recover', 'cancel', 'export'):
                if hasattr(target, method):
                    monkeypatch.setattr(target, method, unexpected)
    before = snapshot(tmp_path)
    with running(server) as port:
        status, raw, headers = request(port, '/')
        assert status == 200
        page = raw.decode('utf-8')
        attrs = dict(Body(page).attrs)
        expected = {'data-write': 'enabled' if write else 'disabled',
                    'data-context': 'enabled' if context else 'disabled'}
        if history:
            expected['data-history'] = 'enabled'
        assert attrs == expected
        assert '<script src="/workbench.js" defer></script>' in page
        assert '<script id="workbench-code">' not in page
        assert headers['Content-Type'] == 'text/html; charset=utf-8'
        assert headers['Cache-Control'] == 'no-store'
        assert headers['Referrer-Policy'] == 'no-referrer'
        assert headers['X-Content-Type-Options'] == 'nosniff'
        assert "connect-src 'self'" in headers['Content-Security-Policy']
        assert "frame-ancestors 'none'" in headers['Content-Security-Policy']
        assert int(headers['Content-Length']) == len(raw)
        status, code, script_headers = request(port, '/workbench.js')
        assert status == 200
        script = code.decode('utf-8')
        template = Path(workbench.__file__).with_name('workbench.html').read_text(encoding='utf-8')
        assert script == template.split('<script id="workbench-code">', 1)[1].split('</script>', 1)[0]
        assert script_headers['Content-Type'] == 'text/javascript; charset=utf-8'
        assert script_headers['Cache-Control'] == 'no-store'
        for private in (TOKEN, json.dumps(TOKEN)[1:-1], str(BACKEND_PORT),
                        ':' + str(port), str(save_root), str(packet_root),
                        save_root.as_posix(), packet_root.as_posix(), ASSET, HASH):
            assert private not in page and private not in script
            assert private not in json.dumps(headers)
        check_initial_requests(page, script, attrs, history)
        # Repeated page loads do not consume or mutate a save/export operation.
        assert request(port, '/')[1] == raw
    assert calls == []
    assert snapshot(tmp_path) == before


def test_declarations_follow_live_objects_without_truthiness_or_state_probe(monkeypatch):
    class Bridge:
        def __bool__(self):
            raise AssertionError('Use presence, never truthiness or a state probe')

        def __str__(self):
            raise AssertionError('Do not serialize a bridge')

    # Construct without roots: a port/token/config guess cannot enable either bridge.
    server = workbench.create_server(BACKEND_PORT, TOKEN)
    with running(server) as port:
        for writer, context, write_flag, context_flag in (
                (Bridge(), None, 'enabled', 'disabled'),
                (None, Bridge(), 'disabled', 'enabled'),
                (None, None, 'disabled', 'disabled')):
            monkeypatch.setattr(server, 'writer', writer)
            monkeypatch.setattr(server, 'context', context)
            status, raw, _ = request(port, '/')
            assert status == 200
            assert dict(Body(raw.decode()).attrs) == {
                'data-write': write_flag, 'data-context': context_flag}


@pytest.mark.parametrize('binding', [
    {'history_asset': ASSET}, {'history_hash': HASH},
    {'history_asset': 'invalid', 'history_hash': HASH},
    {'history_asset': ASSET, 'history_hash': 'invalid'},
])
def test_history_still_requires_explicit_valid_paired_binding(binding):
    with pytest.raises(ValueError):
        workbench.create_server(BACKEND_PORT, TOKEN, **binding)
