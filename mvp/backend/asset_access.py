"""Token identity and asset read grants; unconfigured local use stays unrestricted."""

import json
import os
from mvp.decision_policy import ARCHIVE_MIME


def token_config():
    raw = os.environ.get('KNOT_TOKENS')
    tokens = json.loads(raw) if raw is not None else {}
    if not isinstance(tokens, dict) or any(not isinstance(k, str) or not k or
            not isinstance(v, str) or not v or any(c in v for c in '\r\n') for k, v in tokens.items()):
        raise ValueError('invalid token configuration')
    single = os.environ.get('KNOT_TOKEN')
    if single:
        tokens.setdefault(single, 'local-user')
    return tokens, raw is not None or bool(single)


def identity_mode():
    return 'configured' if token_config()[1] else 'single-user'


def readable(conn, asset_id, actor):
    # A recap embeds derived text and quotations. Raw-content routes (including
    # bundles) must never bypass its dependencies through the parent's grant.
    # The dedicated decision reader validates parent and sources on one snapshot.
    derived = conn.execute('SELECT media_type FROM assets WHERE asset_id=?', (asset_id,)).fetchone()
    if derived is not None and derived[0] == ARCHIVE_MIME:
        return False
    if identity_mode() == 'single-user':
        return True
    if actor is None:
        return False
    # Old databases require explicit migration. Never infer grants or migrate
    # from a read path; absence of the grant table gives no configured access.
    if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='asset_readers'").fetchone() is None:
        return False
    return conn.execute('SELECT 1 FROM asset_readers WHERE asset_id=? AND actor=?',
                        (asset_id, actor)).fetchone() is not None
