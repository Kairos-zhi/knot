"""Bounded project adapter to the same authenticated core operations."""
from http.client import HTTPConnection
import json
import re
from urllib.parse import urlencode

from mvp.exploration_policy import strict_json, validate_uuid
from mvp.project_policy import ProjectError, project_response, validate_import
from mvp.text_policy import has_credential_marker

LIMIT = 1048576


def _request(port, token, method, path, body=None):
    conn = HTTPConnection('127.0.0.1', port, timeout=5)
    try:
        headers = {'Authorization': 'Bearer '+token, 'Accept-Encoding': 'identity'}
        raw = None
        if body is not None:
            raw = json.dumps(body, ensure_ascii=False, allow_nan=False).encode('utf-8')
            if len(raw) > LIMIT or has_credential_marker(raw.decode('utf-8'), token):
                raise ProjectError('INVALID_ARGUMENTS')
            headers['Content-Type'] = 'application/json'
        conn.request(method, path, body=raw, headers=headers)
        response = conn.getresponse()
        data = response.read(LIMIT+1)
        if len(data) > LIMIT or response.getheader('Content-Encoding', 'identity') != 'identity':
            raise ProjectError('RESPONSE_LIMIT')
        value = strict_json(data)
        if response.status != 200:
            code = value.get('error', {}).get('code')
            reason = value.get('error', {}).get('detail', {}).get('reason')
            mapped = {'FORBIDDEN_VIEW':'ACCESS_DENIED', 'UNAUTHORIZED':'ACCESS_DENIED',
                      'NOT_FOUND':'NOT_FOUND', 'BAD_REQUEST':'INVALID_ARGUMENTS', 'SERVER_BUSY':'READ_UNAVAILABLE'}
            if reason in ('revision_conflict', 'idempotency_conflict'):
                raise ProjectError(reason.upper())
            if reason in ('content_mismatch', 'sensitive_content'):
                raise ProjectError(reason.upper())
            if reason == 'project_response_limit':
                raise ProjectError('RESPONSE_LIMIT')
            raise ProjectError(mapped.get(code, 'READ_UNAVAILABLE'))
        if (type(value) is not dict or set(value) != {'contract_version','ok','value'}
                or type(value['contract_version']) is not int or value['contract_version'] != 1
                or value['ok'] is not True):
            raise ProjectError('READ_UNAVAILABLE')
        return value['value']
    except ProjectError:
        raise
    except Exception:
        raise ProjectError('READ_UNAVAILABLE') from None
    finally:
        conn.close()


def project_get(port, token, kind, args):
    if kind == 'list' and not args:
        path, bindings = '/projects', {}
    elif kind == 'scene' and set(args) in ({'project_id'}, {'project_id','revision'}):
        validate_uuid(args['project_id'])
        if 'revision' in args and not re.fullmatch('[1-9][0-9]{0,18}', args['revision']):
            raise ProjectError('INVALID_ARGUMENTS')
        path = '/projects/'+args['project_id']
        if 'revision' in args: path += '?'+urlencode({'revision':args['revision']})
        bindings = dict(project_id=args['project_id'], revision=args.get('revision'))
    elif kind == 'material' and set(args) == {'project_id','revision','asset_id','expected_hash'}:
        validate_uuid(args['project_id']); validate_uuid(args['asset_id'])
        if (not re.fullmatch('[1-9][0-9]{0,18}', args['revision'])
                or not re.fullmatch('[0-9a-f]{64}', args['expected_hash'])):
            raise ProjectError('INVALID_ARGUMENTS')
        path, bindings = '/project-material?'+urlencode(args), args
    else:
        raise ProjectError('INVALID_ARGUMENTS')
    return project_response(kind, _request(port, token, 'GET', path), token, **bindings)


def project_import(port, token, body):
    body = validate_import(body, token)
    value = _request(port, token, 'POST', '/project-imports', body)
    try:
        return project_response('receipt', value, token, project_id=body['project_id'],
                                expected_revision=body['expected_revision'])
    except ProjectError:
        # A core success may already be committed. An unbound receipt cannot
        # be turned into a definite rejection that invites a new request key.
        raise ProjectError('READ_UNAVAILABLE') from None
