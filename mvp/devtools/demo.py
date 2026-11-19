"""Run the real Knot workbench with public synthetic projects in a disposable store."""

import argparse
from contextlib import contextmanager
import csv
from datetime import datetime
from hashlib import sha256
from http.client import HTTPConnection
import json
import os
from pathlib import Path
import secrets
from tempfile import TemporaryDirectory
from threading import Thread
from time import sleep
from urllib.parse import urlencode
from uuid import uuid4

from mvp.backend.http_server import Server
from mvp.backend.init_db import init_database
from mvp.backend.project_repo import ProjectRepo
from mvp.decision_policy import SOURCE_VERSION
from mvp.devtools.project_review import BINDING, VERSION
from mvp.devtools.workbench import Handler, create_server


FIXTURES = Path(__file__).resolve().parents[1] / 'demo'
ACTOR = 'knot-demo'
LOG_TITLE = '报名工具开发记录.md'
CSV_QUOTE = '用四条合成报名试算导出。上午场确认 3 人、候补 1 人，下午场确认 2 人、候补 0 人。'
PUBLIC_ASSETS = {
    '/demo/capabilities/': ('capabilities/index.html', 'text/html; charset=utf-8'),
    '/demo/signup-input.csv': ('signup-input.csv', 'text/csv; charset=utf-8'),
    '/demo/signup-summary.csv': ('signup-summary.csv', 'text/csv; charset=utf-8'),
}


class DemoHandler(Handler):
    def do_GET(self):
        if self.path not in PUBLIC_ASSETS:
            return super().do_GET()
        if self.headers.get('Host') != f'127.0.0.1:{self.server.server_port}':
            self.send_error(403)
            return
        name, content_type = PUBLIC_ASSETS[self.path]
        body = (FIXTURES / name).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@contextmanager
def running(server):
    with server:
        thread = Thread(target=server.serve_forever, kwargs={'poll_interval': 0.1})
        thread.start()
        try:
            yield server.server_port
        finally:
            server.shutdown()
            thread.join()


def request(port, path, body=None, *, raw=False):
    connection = HTTPConnection('127.0.0.1', port, timeout=10)
    try:
        if body is None:
            connection.request('GET', path)
        else:
            connection.request('POST', path, json.dumps(body, ensure_ascii=False).encode('utf-8'), {
                'Content-Type': 'application/json', 'X-Knot-Action': 'explicit',
                'Origin': f'http://127.0.0.1:{port}',
            })
        response = connection.getresponse()
        data = response.read()
        if response.status != 200:
            raise RuntimeError(f'{path.split("?")[0]}: HTTP {response.status} {data.decode("utf-8")}')
        return data.decode('utf-8') if raw else json.loads(data)
    finally:
        connection.close()


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def verify_csv():
    totals = {}
    with (FIXTURES / 'signup-input.csv').open(encoding='utf-8', newline='') as stream:
        for row in csv.DictReader(stream):
            counts = totals.setdefault(row['session'], {'confirmed': 0, 'waitlist': 0})
            counts[row['status']] += int(row['people'])
    expected = [dict(session=session, confirmed_people=str(counts['confirmed']),
                     waitlist_people=str(counts['waitlist'])) for session, counts in totals.items()]
    with (FIXTURES / 'signup-summary.csv').open(encoding='utf-8', newline='') as stream:
        check(list(csv.DictReader(stream)) == expected, 'Signup CSV totals do not match the input')


def observation(slug, on, text):
    stamp = datetime.fromisoformat(f'{on}T10:00:00+08:00')
    return dict(version=SOURCE_VERSION, kind='user_message', title=f'合成原话 · {on}',
                text=text, text_sha256=sha256(text.encode('utf-8')).hexdigest(),
                message_time_ms=int(stamp.timestamp()) * 1000, document_on=None, archived_on=None,
                locator=dict(channel='codex', thread_id=f'demo-{slug}', message_id=on, section=None))


def import_body(project, revision, documents):
    return dict(project_id=project['project_id'], title=project['title'], expected_revision=revision,
                request_id=str(uuid4()), documents=documents, archive_ref=None)


def scene(port, project):
    return request(port, '/api/project?' + urlencode({'project_id': project['project_id']}))


def material(port, project, ref):
    return request(port, '/api/project-material?' + urlencode(dict(
        project_id=project['project_id'], revision=project['revision'],
        asset_id=ref['asset_id'], expected_hash=ref['content_hash'])))


def binding(project):
    return {key: project[key] for key in BINDING}


def reference(source):
    return {key: source[key] for key in ('asset_id', 'content_hash')}


def verify_project_claims(port, project, *, review):
    selected = {key: project[key] for key in ('project_id', 'revision')}
    listing = '/api/project-claims?' + urlencode(selected)
    check(request(port, listing)['items'] == [], 'New project already has candidates')
    extraction = request(port, '/api/project-claims-extract', selected)
    check(extraction['inserted'] == 2, 'The two dated sources did not yield their candidates')
    retry = request(port, '/api/project-claims-extract', selected)
    check(retry['inserted'] == 0 and retry['unchanged'] == 2, 'Candidate extraction duplicated rows')
    items = request(port, listing + '&status=pending')['items']
    check({item['claim_type'] for item in items} == {'decision', 'question'},
          'Both unverified candidates must be visible')
    for item in items:
        source = material(port, project, item)['source']
        start = item['quote_start']
        check(source['text'][start:start + len(item['quote'])] == item['quote'] and
              item['message_time_ms'] == source['message_time_ms'] and item['event_id'] and
              item['event_time'] == item['saved_at'],
              'Candidate source quote or time differs from the original')
    check(len({item['message_time_ms'] for item in items}) == 2, 'Candidates must span two days')
    if review:
        pending = {item['claim_type']: item for item in items}
        for kind, decision, expected in (('decision', 'accept', 'accepted'),
                                         ('question', 'reject', 'rejected')):
            claim_id = pending[kind]['claim_id']
            request(port, '/api/project-claims-review', dict(selected, claim_id=claim_id, decision=decision))
            filtered = request(port, listing + '&status=' + expected)['items']
            check([item['claim_id'] for item in filtered] == [claim_id], 'Candidate review filter is inconsistent')
        check(request(port, listing + '&status=pending')['items'] == [], 'Reviewed candidates remain pending')
    else:
        # The live demo starts with two unverified candidates for hands-on review.
        check(all(item['status'] == 'pending' for item in items), 'Demo must start unverified')


def review_draft(port, project, fixture):
    prompt = request(port, '/api/project-review-prompt', binding(project))
    citations = []
    for _, quote in fixture['messages']:
        source = next(ref for ref in project['observations'] if ref['text'] == quote)
        check(json.dumps(quote, ensure_ascii=False) in prompt['prompt'],
              'Review prompt is missing a retained source')
        check(material(port, project, source)['text'] == quote, 'Original text differs from the fixture')
        citations.append(dict(**reference(source), quote=quote))
    start, finish = citations
    start_day, finish_day = (message[0] for message in fixture['messages'])
    origin = dict(summary=fixture['origin'], evidence=[start])
    completed = dict(summary=fixture['completed'], evidence=[finish])
    return dict(version=VERSION, **binding(project),
                origin=origin,
                current=completed, completed=completed,
                blocked=dict(summary='尚无记录说明存在阻塞，无出处待核。', evidence=[]),
                next=dict(summary=fixture['next'], evidence=[finish]),
                milestones=[dict(id='scope', title='确定首版范围', on=start_day, **origin),
                            dict(id='progress', title='记录首版进展', on=finish_day, **completed)],
                gaps=[fixture['gaps']])


def evidence_example(port, project, output):
    source = next(ref for ref in project['materials'] if ref['title'] == LOG_TITLE)
    demand = dict(title='社区活动报名工具 · 分场次统计', deliverable='场次报名汇总 CSV',
                  criteria='按场次分别累计确认人数和候补人数，缺项填 0。',
                  reference='DEMO-SIGNUP', sample=True)
    base = dict(**binding(project), demand=demand)
    ref = reference(source)
    prompt = request(port, '/api/project-evidence-prompt', dict(base, sources=[ref]))
    check(CSV_QUOTE in prompt['prompt'], 'Evidence prompt is missing the CSV cross-check')
    item = dict(**ref, criterion=demand['criteria'], contribution='用四条合成报名复算两场汇总。',
                status='pending', quote=CSV_QUOTE, link='')
    draft = dict(items=[item], gaps='候补递补与现场验收待核。')
    body = dict(base, **draft, approved=[dict(index=0, quote=True, link=False)])
    preview = request(port, '/api/project-evidence-prepare', body)
    share = request(port, '/api/project-evidence-share', dict(body, digest=preview['digest']))
    check(share['card'] == preview['card'] and CSV_QUOTE in share['markdown'],
          'Evidence share differs from the verified preview')
    (output / 'evidence-draft.json').write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding='utf-8')
    (output / 'evidence-card.md').write_text(share['markdown'], encoding='utf-8')


def seed_and_verify(repo, token, port, output, *, review_claims=False):
    fixtures = json.loads((FIXTURES / 'projects.json').read_text(encoding='utf-8'))
    stamps = {}
    for fixture in fixtures:
        case = dict(fixture, project_id=str(uuid4()))
        sources = [observation(case['slug'], on, words) for on, words in case['messages']]
        documents = []
        if case['slug'] == 'signup':
            documents.append(dict(title=LOG_TITLE,
                text=(FIXTURES / 'signup-development.md').read_text(encoding='utf-8')))
        repo.import_project(ACTOR, token, dict(import_body(case, '0', documents), sources=sources))
        initial = scene(port, case)
        draft = review_draft(port, initial, case)
        prepared = request(port, '/api/project-review-prepare', draft)
        receipt = request(port, '/api/project-import', import_body(case, initial['revision'], [prepared['document']]))
        latest = scene(port, case)
        check(binding(latest) == binding(receipt), 'The saved review revision is missing')
        saved = next(ref for ref in latest['materials'] if ref['title'] == prepared['document']['title'])
        saved_body = json.loads(material(port, latest, saved)['text'])
        reopened = request(port, '/api/project-review-prepare', saved_body)
        check(saved_body == draft and reopened['human_view'] == prepared['human_view'],
              'Saved review failed to reopen with the original evidence')
        current = review_draft(port, latest, case)
        (output / f"review-{case['slug']}.json").write_text(
            json.dumps(current, ensure_ascii=False, indent=2), encoding='utf-8')
        if case['slug'] == 'signup':
            verify_project_claims(port, latest, review=review_claims)
            evidence_example(port, latest, output)
            selected = next(ref for ref in latest['materials'] if ref['title'] == LOG_TITLE)
            pack = dict(**binding(latest), sources=[reference(selected)], include_review=True, include_gaps=True)
            preview = request(port, '/api/project-continuation', pack)
            exported = request(port, '/api/project-continuation-export', dict(pack, digest=preview['digest']))
            check(exported == preview and preview['review_state'] == 'verified' and
                  all(text in preview['markdown'] for text in ('下次接着做什么', '卡在哪里', CSV_QUOTE)),
                  'Continuation export differs from the checked project context')
            (output / 'continuation-signup.md').write_text(exported['markdown'], encoding='utf-8')
        stamps[case['title']] = sorted(source['message_time_ms'] for source in sources)
    catalog = request(port, '/api/projects')['items']
    check({project['title']: project['chronology']['observation_times'] for project in catalog} == stamps,
          'The cross-project calendar is missing source dates')
    check('data-projects="enabled"' in request(port, '/', raw=True) and request(port, '/workbench.js', raw=True),
          'The workbench shell is unavailable')
    for path, (name, _) in PUBLIC_ASSETS.items():
        check(request(port, path, raw=True) == (FIXTURES / name).read_bytes().decode('utf-8'),
              'A public demo asset failed to load')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4974, help='workbench loopback port (0 picks a free port)')
    parser.add_argument('--check', action='store_true', help='verify via HTTP on free ports and exit')
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('--port must be between 0 and 65535')
    token = secrets.token_urlsafe(32)
    # The backend looks up both variables. Replace their child-process values
    # before starting either server or exercising project authorization.
    os.environ['KNOT_TOKEN'] = ''
    os.environ['KNOT_TOKENS'] = json.dumps({token: ACTOR})
    try:
        verify_csv()
        with TemporaryDirectory(prefix='knot-demo-') as directory:
            root = Path(directory)
            db = root / 'demo.sqlite3'
            check(init_database(db)['status'] == 'created', 'Cannot initialize the demo SQLite database')
            core = Server(db, 0)
            core.jobs.exports = root / 'exports'
            with running(core) as backend_port:
                output = root / 'samples'
                output.mkdir()
                workbench = create_server(backend_port, token, 0 if args.check else args.port,
                                          projects_enabled=True)
                workbench.RequestHandlerClass = DemoHandler
                with running(workbench) as port:
                    seed_and_verify(ProjectRepo(db), token, port, output, review_claims=args.check)
                    print('OK: projects, dated candidates, sources, prompts, saved reviews, continuation pack, evidence card, CSV and capability assets', flush=True)
                    if not args.check:
                        print(f'Workbench: http://127.0.0.1:{port}/\n'
                              f'Capability demo: http://127.0.0.1:{port}/demo/capabilities/\n'
                              f'Sample drafts: {output}\nCtrl+C to stop.', flush=True)
                        while True:
                            # A timed wait keeps Ctrl+C responsive on Windows.
                            sleep(0.5)
    except KeyboardInterrupt:
        return 130
    except (OSError, RuntimeError) as exc:
        parser.exit(1, f'Demo failed: {exc}\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
