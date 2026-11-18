"""Read-only, bounded project evidence collection from explicitly configured roots."""
from hashlib import sha256
from itertools import islice
import codecs
import os
from pathlib import Path
import shutil
import subprocess
import threading
from time import time_ns

from mvp import decision_policy as decision
from mvp import project_policy as policy

MAX_TEXT = 8192
MAX_DOCUMENTS = 8
MAX_MEDIA = 16
MAX_MEDIA_BYTES = 8 * 1024 * 1024
MAX_DOCUMENT_BYTES = 60000
MEDIA = frozenset({'.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.pdf', '.mp4', '.mov', '.wav', '.mp3'})
BASE_DOCUMENTS = ('README.md', 'AGENTS.md', 'STATE.md', 'QUEUE.md')


def collection_root(value):
    """Check the registered spelling before resolve can hide a reparse point."""
    path = Path(value)
    if not path.is_absolute():
        raise policy.ProjectError('ACCESS_DENIED')
    for component in (path, *path.parents):
        if component.is_symlink() or getattr(component, 'is_junction', lambda: False)():
            raise policy.ProjectError('ACCESS_DENIED')
    resolved = path.resolve(strict=True)
    if not resolved.is_dir():
        raise policy.ProjectError('READ_UNAVAILABLE')
    return resolved


def _inside(path, root):
    """Do not follow links/junctions or leave the explicit workspace."""
    try:
        relative = path.relative_to(root)
        current = root
        for part in relative.parts:
            current = current / part
            if current.is_symlink() or getattr(current, 'is_junction', lambda: False)():
                return False
        return path.resolve().is_relative_to(root)
    except (OSError, ValueError):
        return False


def _ordinary(path, root):
    return _inside(path, root) and path.is_file()


def _files(folder, root, depth, limit):
    """Finite directory inventory, including a signal when enumeration is cut."""
    files, limited, pending, inspected = [], False, [(folder, 0)], 0
    while pending and inspected < limit:
        parent, level = pending.pop(0)
        if not _inside(parent, root) or not parent.is_dir():
            continue
        try:
            with os.scandir(parent) as stream:
                entries = list(islice(stream, limit - inspected + 1))
            if len(entries) > limit - inspected:
                limited = True
                entries = entries[:limit - inspected]
            inspected += len(entries)
            for entry in sorted(entries, key=lambda entry: entry.name):
                if entry.name.startswith('.') or entry.name in ('node_modules', 'venv', '__pycache__', 'private'):
                    continue
                path = Path(entry.path)
                if entry.is_symlink() or getattr(path, 'is_junction', lambda: False)():
                    continue
                if entry.is_file(follow_symlinks=False) and _ordinary(path, root):
                    files.append(path)
                elif entry.is_dir(follow_symlinks=False) and level < depth:
                    pending.append((path, level + 1))
        except OSError:
            limited = True
    return files, limited or bool(pending)


def _git_output(arguments, environment):
    """Read at most one bounded prefix, terminating our own process on limit."""
    with subprocess.Popen(arguments, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL, env=environment, shell=False) as process:
        result = []
        reader = threading.Thread(target=lambda: result.append(process.stdout.read(MAX_TEXT + 1)), daemon=True)
        reader.start(); reader.join(8)
        if reader.is_alive():
            process.kill(); process.wait(); reader.join(2)
            return None
        raw = result[0] if result else b''
        limited = len(raw) > MAX_TEXT
        if limited and process.poll() is None:
            process.kill()
        try:
            code = process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill(); process.wait()
            return None
        if code and not limited:
            return None
        return dict(text=raw[:MAX_TEXT].decode('utf-8', errors='replace'), truncated=limited)


def _git(root):
    binary = shutil.which('git')
    if binary is None:
        return None
    environment = {key:value for key,value in os.environ.items() if not key.upper().startswith('GIT_')}
    environment.update(GIT_OPTIONAL_LOCKS='0', GIT_CONFIG_NOSYSTEM='1', GIT_TERMINAL_PROMPT='0',
                       GIT_CONFIG_GLOBAL=os.devnull, GIT_PAGER='cat', GIT_NO_LAZY_FETCH='1')
    prefix = [binary, '--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
              '-c', 'log.showSignature=false', '-c', 'protocol.allow=never', '--no-pager', '-C', str(root)]
    try:
        metadata = root / '.git'
        if metadata.is_symlink() or getattr(metadata, 'is_junction', lambda: False)():
            return None
        top = _git_output(prefix + ['rev-parse', '--show-toplevel'], environment)
        if top is None or top['truncated'] or Path(top['text'].strip()).resolve() != root:
            return None  # Never expose an ancestor repository for an approved subfolder.
        commits = _git_output(prefix + ['log', '-20', '--no-show-signature', '--no-notes',
            '--format=%H%n%aI%n%s%n%b', '--'], environment)
        if commits is None:
            return None
        # status/diff may run repository-defined clean/process filters. Do not run them.
        return dict(commits=commits, status=dict(
            text='未运行Git工作区检查；避免触发工程过滤器。当前文档以只读正文为准。', truncated=False))
    except (OSError, ValueError):
        return None


def prepare_collection(body, token, read_scene, root):
    """Prepare a normal source document; caller saves via existing project-import."""
    try:
        decision.closed(body, {'project_id', 'revision', 'manifest_hash'})
        decision.uuid(body['project_id']); policy.revision(body['revision'])
        decision.content_hash(body['manifest_hash']); decision.sensitive(body, token)
        scene = read_scene(body['project_id'], body['revision'])
        if any(scene[key] != body[key] for key in ('project_id', 'revision', 'manifest_hash')):
            raise policy.ProjectError('CONTENT_MISMATCH')
        result = dict(body, available=False, document=None,
                      summary=dict(documents=0, media=0, git=False, limited=False),
                      message='本机未配置此项目的只读工程范围；可继续整理已留存资料。')
        if root is None:
            return result
        root = collection_root(root)
        paths = [root / name for name in BASE_DOCUMENTS if _ordinary(root / name, root)]
        discovered, limited = _files(root / 'mvp' / 'docs', root, 1, 160)
        others, other_limited = _files(root / 'docs', root, 1, 160)
        candidates = [path for path in discovered + others if path.suffix.lower() in ('.md', '.txt')]
        candidates.sort(key=lambda path: (-path.stat().st_mtime_ns, path.as_posix()))
        paths += candidates
        limited |= other_limited or len(paths) > MAX_DOCUMENTS
        documents, omitted = [], []
        for path in paths[:MAX_DOCUMENTS]:
            relative = path.relative_to(root).as_posix()
            try:
                raw = path.open('rb')
                with raw:
                    content = raw.read(MAX_TEXT + 1)
                content = codecs.getincrementaldecoder('utf-8')().decode(content[:MAX_TEXT], final=False)
                decision.sensitive(content, token)
                documents.append(dict(path=relative, text=content,
                    excerpt_sha256=sha256(content.encode('utf-8')).hexdigest(),
                    truncated=path.stat().st_size > MAX_TEXT))
            except decision.DecisionError:
                omitted.append('一份文档含凭据标记，未收集正文。')
            except (OSError, UnicodeError):
                omitted.append('一份文档无法完整读取为UTF-8，未收集正文。')
        media_paths = []
        for folder in ('outputs', 'artifacts', 'assets', 'public', 'designs'):
            values, truncated = _files(root / folder, root, 2, 160)
            media_paths += [path for path in values if path.suffix.lower() in MEDIA]
            limited |= truncated
        media_paths = sorted(set(media_paths), key=lambda path: path.as_posix())
        limited |= len(media_paths) > MAX_MEDIA
        media = []
        for path in media_paths[:MAX_MEDIA]:
            size = path.stat().st_size
            entry = dict(path=path.relative_to(root).as_posix(), bytes=size, extension=path.suffix.lower(),
                         content_hash=None, status='仅文件观察；生成来源、是否采用及正文归档待核')
            if size <= MAX_MEDIA_BYTES:
                with path.open('rb') as stream:
                    raw = stream.read(MAX_MEDIA_BYTES + 1)
                if len(raw) == size:
                    entry['content_hash'] = sha256(raw).hexdigest()
                else:
                    limited = True
            else:
                limited = True
            media.append(entry)
        git = _git(root)
        limited |= bool(omitted) or any(item['truncated'] for item in documents)
        limited |= bool(git and any(value['truncated'] for value in git.values()))
        record = dict(version='knot.local-development-evidence/0.1', project_id=body['project_id'],
            observed_at_ms=time_ns() // 1000000,
            scope='显式配置工程的有限只读观察；不等于全部历史、部署证明或用户决定。',
            limits=dict(documents=MAX_DOCUMENTS, text_bytes_per_document=MAX_TEXT, media=MAX_MEDIA,
                        media_hash_bytes=MAX_MEDIA_BYTES, recent_commits=20),
            documents=documents, git=git, media=media, omitted=omitted, limited=limited)
        # Preserve the byte bound explicitly, with visible omissions rather than hidden cuts.
        while len(decision.canonical(record)) > MAX_DOCUMENT_BYTES and record['documents']:
            record['documents'].pop(); record['limited'] = True
        if len(decision.canonical(record)) > MAX_DOCUMENT_BYTES:
            raise policy.ProjectError('RESPONSE_LIMIT')
        document = dict(title='本机开发记录.json', text=decision.canonical(record).decode('utf-8'))
        decision.sensitive(document, token)
        result.update(available=True, document=document,
            summary=dict(documents=len(record['documents']), media=len(media), git=git is not None, limited=record['limited']),
            message='已准备只读观察，尚未入库；媒体仅登记文件元数据，未归档正文。')
        return result
    except decision.DecisionError as exc:
        raise policy.ProjectError(exc.code) from None
    except (OSError, ValueError):
        raise policy.ProjectError('READ_UNAVAILABLE') from None
