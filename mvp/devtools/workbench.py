"""Explicit-action local exploration workbench; optional durable save bridge."""
import argparse
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import parse_qs, urlencode, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from mvp.exploration_policy import strict_json, validate_uuid, validate_revision, ExplorationError
from mvp.plugin_projection import (project_exploration_list, project_exploration_checkpoint_v2,
                                   project_asset_search, project_asset_slice, project_asset_source)
from mvp.search_policy import query_terms
from mvp.text_policy import has_credential_marker
from mvp.decision_policy import DecisionError, project_decision_history
from mvp.project_policy import ProjectError
from mvp.devtools.project_transport import project_get, project_import


class Invalid(ValueError):
    pass


class UpstreamFailure(Exception):
    def __init__(self, code):
        self.code = code


def origin_port(origin):
    match = re.fullmatch(r'http://127\.0\.0\.1:([0-9]{1,5})', origin)
    if not match or not 1 <= int(match[1]) <= 65535:
        raise Invalid('ORIGIN_INVALID')
    return int(match[1])


def upstream(port, path, params, token, max_bytes=262144):
    conn = HTTPConnection('127.0.0.1', port, timeout=2)
    try:
        conn.request('GET', path + ('?' + urlencode(params) if params else ''),
                     headers={'Authorization': 'Bearer ' + token, 'Accept-Encoding': 'identity'})
        response = conn.getresponse()
        raw = response.read(max_bytes + 1)
        if len(raw) > max_bytes:
            if max_bytes == 1048576:
                raise DecisionError('RESPONSE_LIMIT')
            raise Invalid('UPSTREAM_ERROR')
        if response.getheader('Content-Encoding', 'identity') != 'identity':
            raise Invalid('UPSTREAM_ERROR')
        if response.status != 200:
            if max_bytes == 1048576 and response.status == 503:
                response_limit = False
                try:
                    failure = strict_json(raw)
                    response_limit = (failure.get('error', {}).get('code') == 'SERVER_BUSY'
                                      and failure['error'].get('detail', {}).get('reason') == 'decision_response_limit')
                except (ValueError, TypeError, AttributeError, KeyError):
                    pass
                if response_limit:
                    raise DecisionError('RESPONSE_LIMIT')
            # Upstream error text never enters browser output.
            raise UpstreamFailure({403: 'ACCESS_DENIED', 404: 'NOT_FOUND',
                                   400: 'INVALID_ARGUMENTS', 409: 'VERSION_CONFLICT',
                                   503: 'READ_LIMIT_REACHED'}.get(response.status, 'UPSTREAM_ERROR'))
        return strict_json(raw)
    finally:
        conn.close()


def project(port, action, args, token):
    if action == 'decisions' and set(args) == {'asset_id', 'expected_hash'}:
        validate_uuid(args['asset_id'])
        if not re.fullmatch('[0-9a-f]{64}', args['expected_hash']): raise Invalid()
        envelope = upstream(port, '/decision-history', args, token, max_bytes=1048576)
        return project_decision_history(envelope, args['asset_id'], args['expected_hash'], token)
    if action == 'explorations' and not args:
        env = upstream(port, '/explorations', {'limit': 20}, token)
        return project_exploration_list(env, 20)
    if action == 'checkpoint' and set(args) in ({'exploration_id'}, {'exploration_id', 'revision'}):
        ident = args['exploration_id']; validate_uuid(ident)
        revision = None
        if 'revision' in args:
            if not re.fullmatch('[1-9][0-9]{0,18}', args['revision']): raise Invalid()
            revision = int(args['revision']); validate_revision(revision, 1)
        env = upstream(port, f'/explorations/{ident}/v2', {} if revision is None else {'revision': revision}, token)
        return project_exploration_checkpoint_v2(env, ident, revision, token)
    if action == 'search' and set(args) == {'query'}:
        query = args['query']
        if not query_terms(query) or has_credential_marker(query, token): raise Invalid()
        env = upstream(port, '/asset-search', {'q': query, 'limit': 10}, token)
        return project_asset_search(env, 10)
    if action in ('slice', 'source'):
        expected = {'asset_id', 'expected_hash'} | ({'offset', 'limit'} if action == 'slice' else set())
        if set(args) != expected: raise Invalid()
        validate_uuid(args['asset_id'])
        if not re.fullmatch('[0-9a-f]{64}', args['expected_hash']): raise Invalid()
        params = args.copy()
        if action == 'slice':
            if any(not re.fullmatch('0|[1-9][0-9]{0,6}', args[k]) for k in ('offset', 'limit')): raise Invalid()
            offset, limit = int(args['offset']), int(args['limit'])
            if not 0 <= offset <= 1000000 or not 4 <= limit <= 8192: raise Invalid()
            params.update(offset=offset, limit=limit)
        env = upstream(port, '/asset-text-slices' if action == 'slice' else '/asset-sources', params, token)
        if action == 'slice':
            return project_asset_slice(env, args['asset_id'], args['expected_hash'], offset, limit, token)
        return project_asset_source(env, args['asset_id'], args['expected_hash'], token)
    raise Invalid()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def discard_small_body(self):
        lengths=self.headers.get_all('Content-Length',[])
        if (not self.headers.get_all('Transfer-Encoding') and len(lengths)==1
                and re.fullmatch('[1-9][0-9]{0,5}',lengths[0]) and int(lengths[0])<=131072):
            self.connection.settimeout(2)
            try:self.rfile.read(int(lengths[0]))
            except OSError:pass

    def reply(self, status, value, html=False):
        raw = value if html else json.dumps(value, ensure_ascii=True).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8' if html else 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        expected_host = f'127.0.0.1:{self.server.server_port}'
        origin = self.headers.get('Origin')
        referer = self.headers.get('Referer')
        if (self.headers.get('Host') != expected_host or
                (origin and origin != 'http://' + expected_host) or
                (referer and urlsplit(referer).netloc != expected_host) or
                self.headers.get('Sec-Fetch-Site') not in (None, 'same-origin', 'none')):
            return self.reply(403, {'error': 'ORIGIN_DENIED'})
        path = urlsplit(self.path)
        if path.path in ('/', '/workbench.js') and not path.query:
            page = Path(__file__).with_name('workbench.html').read_text(encoding='utf-8')
            if path.path == '/workbench.js':
                self.send_response(200)
                raw = page.split('<script id="workbench-code">', 1)[1].split('</script>', 1)[0].encode()
                self.send_header('Content-Type', 'text/javascript; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Length', str(len(raw)))
                self.end_headers(); self.wfile.write(raw); return
            page = re.sub(r'<script id="workbench-code">.*?</script>', '<script src="/workbench.js" defer></script>', page, flags=re.S)
            # Declare configured bridges only; never inspect state or probe upstream.
            capabilities = (' data-write="' + ('enabled' if self.server.writer is not None else 'disabled')
                            + '" data-context="' + ('enabled' if self.server.context is not None else 'disabled') + '"')
            if self.server.history_asset is not None:
                capabilities += ' data-history="enabled"'
            if self.server.projects_enabled:
                capabilities += ' data-projects="enabled"'
            page = page.replace('<body>', '<body' + capabilities + '>', 1)
            return self.reply(200, page.encode(), html=True)
        if not path.path.startswith('/api/'):
            return self.reply(404, {'error': 'NOT_FOUND'})
        try:
            if len(self.path) > 4096 or re.search(r'%(?![0-9a-fA-F]{2})', path.query): raise Invalid()
            query = parse_qs(path.query, keep_blank_values=True, errors='strict')
            if any(len(v) != 1 for v in query.values()): raise Invalid()
            if path.path == '/api/write-state' and not query:
                if self.server.writer is None:
                    return self.reply(200, {'phase': 'disabled'})
                return self.reply(200, self.server.writer.state())
            project_actions = {'/api/projects':'list', '/api/project':'scene', '/api/project-material':'material'}
            if path.path in project_actions:
                if not self.server.projects_enabled: raise Invalid()
                value = project_get(self.server.backend_port, self.server.token,
                                    project_actions[path.path], {k:v[0] for k,v in query.items()})
            elif path.path == '/api/decisions':
                if query or self.server.history_asset is None: raise Invalid()
                value = project(self.server.backend_port, 'decisions',
                                dict(asset_id=self.server.history_asset, expected_hash=self.server.history_hash), self.server.token)
            else:
                value = project(self.server.backend_port, path.path[5:], {k:v[0] for k,v in query.items()}, self.server.token)
            # JavaScript cannot exactly represent the contract's 64-bit
            # revision integers. Preserve these identifiers as decimal text
            # only in this browser-specific projection.
            if 'items' in value and path.path == '/api/explorations':
                value = {'items': [item | {'revision': str(item['revision'])} for item in value['items']]}
            if path.path == '/api/checkpoint' and 'error' not in value:
                value = value | {'revision': str(value['revision'])}
                if value.get('origin'):
                    value['origin'] = value['origin'] | {'source_revision': str(value['origin']['source_revision'])}
            raw = json.dumps(value, ensure_ascii=True)
            if path.path in project_actions and len(raw.encode('utf-8')) > 1048576:
                raise ProjectError('RESPONSE_LIMIT')
            if path.path == '/api/decisions' and len(raw.encode('utf-8')) > 1048576:
                raise DecisionError('RESPONSE_LIMIT')
            if self.server.token in raw or json.dumps(self.server.token)[1:-1] in raw:
                value = {'error': 'SENSITIVE_CONTENT'}
            self.reply(200, value)
        except UpstreamFailure as exc:
            self.reply(200, {'error': exc.code})
        except ProjectError as exc:
            self.project_error(exc)
        except DecisionError as exc:
            if exc.code == 'RESPONSE_LIMIT':
                self.reply(503, {'error': 'SERVER_BUSY', 'reason': 'decision_response_limit'})
            else:
                self.reply(503, {'error': 'UPSTREAM_ERROR'})
        except (Invalid, ExplorationError, ValueError, TypeError, KeyError):
            self.reply(400, {'error': 'INVALID_ARGUMENTS'})
        except Exception:
            self.reply(503, {'error': 'UPSTREAM_ERROR'})

    def do_POST(self):
        context_actions={'/api/context-prepare':'prepare','/api/context-export':'export'}
        context_request=self.path in context_actions
        project_request=self.path == '/api/project-import'
        target=self.server.context if context_request else self.server.writer
        if (project_request and not self.server.projects_enabled) or (not project_request and target is None):
            return self.reject()
        host = f'127.0.0.1:{self.server.server_port}'
        if (self.headers.get('Host') != host or self.headers.get('Origin') != 'http://' + host
                or self.headers.get('X-Knot-Action') != 'explicit'
                or self.headers.get('Sec-Fetch-Site') not in (None,'same-origin')
                or self.headers.get_all('Transfer-Encoding')
                or self.headers.get('Content-Type') != 'application/json'):
            # Drain only a small, well-framed rejected request before closing;
            # otherwise Windows may reset the connection before the fixed
            # rejection response reaches the browser.
            self.discard_small_body()
            self.close_connection = True
            return self.reply(403, {'error':'ORIGIN_DENIED'})
        from mvp.devtools.workbench_write import WriteError
        from mvp.context_sync_policy import PacketError
        try:
            actions = {'/api/prepare':'prepare','/api/confirm':'confirm',
                       '/api/recover':'recover','/api/cancel':'cancel'}
            if context_request: actions=context_actions
            if not project_request and self.path not in actions: raise Invalid()
            lengths = self.headers.get_all('Content-Length',[])
            if len(lengths) != 1 or not re.fullmatch('[1-9][0-9]{0,6}' if project_request else '[1-9][0-9]{0,5}',lengths[0]): raise Invalid()
            size = int(lengths[0])
            if size > (1048576 if project_request else 131072): raise Invalid()
            self.connection.settimeout(3)
            raw = self.rfile.read(size)
            if len(raw) != size: raise Invalid()
            body = strict_json(raw)
            result = (project_import(self.server.backend_port,self.server.token,body)
                      if project_request else getattr(target,actions[self.path])(body))
            self.reply(200,result)
        except ProjectError as exc:
            self.project_error(exc)
        except (WriteError,PacketError) as exc:
            self.reply(409, {'error':exc.code if isinstance(exc,WriteError) else str(exc)})
        except (Invalid,ValueError,TypeError,KeyError,UnicodeError,RecursionError):
            self.reply(400, {'error':'INVALID_ARGUMENTS'})
        except Exception:
            self.reply(503, {'error':'WRITE_STATE_UNAVAILABLE'})

    def reject(self):
        self.discard_small_body()
        self.close_connection = True
        self.reply(405, {'error': 'READ_ONLY'})

    def project_error(self, exc):
        status = {'ACCESS_DENIED':403, 'NOT_FOUND':404, 'INVALID_ARGUMENTS':400,
                  'CONTENT_MISMATCH':400, 'SENSITIVE_CONTENT':400,
                  'REVISION_CONFLICT':409, 'IDEMPOTENCY_CONFLICT':409}.get(exc.code,503)
        self.reply(status, {'error':exc.code})

    do_PUT = do_DELETE = do_PATCH = do_OPTIONS = do_HEAD = reject


def create_server(backend_port, token, port=0, state_root=None,packet_root=None, *, history_asset=None, history_hash=None, projects_enabled=False):
    if type(projects_enabled) is not bool: raise ValueError('PROJECTS_FLAG_INVALID')
    if (history_asset is None) != (history_hash is None): raise ValueError('HISTORY_BINDING_REQUIRED')
    if history_asset is not None:
        validate_uuid(history_asset)
        if type(history_hash) is not str or not re.fullmatch('[0-9a-f]{64}', history_hash): raise ValueError('HISTORY_BINDING_INVALID')
    if not token or len(token) < 16 or any(c.isspace() for c in token):
        raise Invalid('TOKEN_REQUIRED')
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.backend_port, server.token = backend_port, token
    server.history_asset, server.history_hash = history_asset, history_hash
    server.projects_enabled = projects_enabled
    server.writer = None
    server.context = None
    if packet_root is not None:
        try:
            from mvp.devtools.context_workbench import ContextWorkbench
            server.context=ContextWorkbench(packet_root,token,lambda ident,revision:
                project(backend_port,'checkpoint',dict(exploration_id=ident,revision=revision),token))
        except Exception:
            server.server_close()
            raise
    if state_root is not None:
        try:
            from mvp.devtools.workbench_write import WriteJournal
            server.writer = WriteJournal(state_root, f'http://127.0.0.1:{backend_port}',token)
        except Exception:
            server.server_close()
            raise
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--port', type=int, default=0)
    parser.add_argument('--state-root', type=Path, help='explicit private save journal directory; absent means read-only')
    parser.add_argument('--packet-root',type=Path,help='existing local private export directory outside repository')
    parser.add_argument('--history-asset', help='explicit saved decision archive to show on entry')
    parser.add_argument('--history-hash', help='expected hash of that decision archive')
    parser.add_argument('--projects', action='store_true', help='enable project overview and explicit material import')
    args = parser.parse_args()
    try:
        server = create_server(origin_port(args.origin), os.environ.get('KNOT_WORKBENCH_TOKEN'), args.port,args.state_root,args.packet_root,
                               history_asset=args.history_asset, history_hash=args.history_hash, projects_enabled=args.projects)
    except (ValueError, OSError):
        raise SystemExit('WORKBENCH_CONFIG_INVALID') from None
    print(json.dumps({'url': f'http://127.0.0.1:{server.server_port}', 'mode': 'explicit_save' if server.writer else ('local_export' if server.context else 'read_only'),
                      'context_export':server.context is not None}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
