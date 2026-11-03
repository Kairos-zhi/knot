from mvp.backend.http_server import ROUTES, SCHEMA
from jsonschema import Draft202012Validator


def test_new_routes_have_closed_defined_contracts():
    routes={r['path']:r for r in ROUTES}
    for path in ('/exploration-v2-saves','/explorations/{exploration_id}/v2','/exploration-forks'):
        route=routes[path]
        assert route['response'] in SCHEMA['$defs']
        if route['method']=='POST': assert SCHEMA['$defs'][route['request']]['additionalProperties'] is False
        assert 500 in route['status'] and 'INTERNAL' in route['errors']
    Draft202012Validator.check_schema(SCHEMA)
