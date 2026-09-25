#!/usr/bin/env python3
"""e2e/golden_live.py — live golden verification against a running Sovereign Grid.

Recreates Project Falcon via the real API, asserts the exact golden outcome
(3 bookable 93/90/87 + named order, Ascend disqualified with route-condition
reason, 2 hard-excluded), then DELETES the request via the operator cleanup
route (DELETE /api/requests/:id) so production data is left untouched.

Usage: SG_E2E_BASE=https://... python3 e2e/golden_live.py
Requires falcon buyer + operator demo credentials to exist (seed data).
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get('SG_E2E_BASE', 'http://127.0.0.1:8787').rstrip('/')

FALCON = {
    'name': 'Project Falcon (golden_live)',
    'company': 'European AI company',
    'accelerator_preferred': 'h200',
    'accelerator_alternatives': ['mi300x', 'ascend-910c'],
    'count': 256,
    'node': '8x H200',
    'workload_type': 'training',
    'workload': {
        'description': 'European AI company training a frontier model. Primary EU deployment, UAE failover required.',
        'frameworks': ['PyTorch'],
        'utilization': 0.65,
    },
    'location': {
        'primary': ['Finland', 'Ireland'],
        'failover': ['United Arab Emirates'],
        'prohibited': [],
        'chinaPolicy': 'route-specific review required',
        'dataResidency': 'EU (GDPR)',
        'personnelAccess': 'EU personnel only',
    },
    'start_date': '2027-01-01',
    'term_months': 24,
    'firmness': 'firm',
    'resilience': {'maxOutage': '1h', 'failoverRequired': True, 'multiSite': False},
    'compliance': {'zeroDataRetention': True, 'euCompliant': True, 'certifications': []},
    'region': 'EU',
}


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={'Content-Type': 'application/json',
                 **({'Authorization': 'Bearer ' + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or '{}')


def main():
    failures = []

    def check(name, cond, detail=''):
        print(f"{'PASS' if cond else 'FAIL'} {name}" + (f' :: {detail}' if detail else ''))
        if not cond:
            failures.append(name)

    _, login = call('POST', '/api/auth/login',
                    body={'email': 'falcon@demo.local', 'password': 'sg-falcon-dev'})
    buyer_token = login.get('token')
    # Operator: a session token minted out-of-band (scripts/op_session.mjs —
    # the prod operator password is rotated, by design, so no password login).
    op_token = os.environ.get('SG_OP_TOKEN')
    if not buyer_token or not op_token:
        print('FAIL setup: buyer login or SG_OP_TOKEN missing')
        return 1

    st, created = call('POST', '/api/requests', buyer_token, FALCON)
    check('create request (201)', st == 201, f'status={st}')
    if st != 201:
        return 1
    rid = created['request']['id']

    try:
        st, m = call('GET', f'/api/requests/{rid}/matches', buyer_token)
        check('matches readable (200)', st == 200, f'status={st}')

        bookable = m.get('bookable', [])
        scores = sorted((b.get('matchScore') for b in bookable), reverse=True)
        check('exactly 3 bookable', len(bookable) == 3, f'got {len(bookable)}')
        check('scores 93/90/87', scores == [93, 90, 87], f'got {scores}')
        names = [b.get('name') for b in
                 sorted(bookable, key=lambda b: -b.get('matchScore', 0))]
        check('order Nordic/MI300X/GulfGrid', names == [
            'Nordic H200 — Helsinki primary',
            'Anonymous MI300X cluster (capacity evidenced)',
            'GulfGrid H200 — Abu Dhabi'], f'got {names}')

        disq = [d for d in m.get('disqualified', []) if 'Ascend' in (d.get('name') or '')]
        check('Ascend disqualified', len(disq) == 1)
        if disq:
            reason = disq[0].get('disqualifyReason', '')
            check('reason cites EU-compliance + ZDR',
                  'EU-compliant' in reason and 'zero-data-retention' in reason, reason[:80])
        check('2 excluded by hard filters',
              m.get('excludedByHardFilters') == 2,
              f"got {m.get('excludedByHardFilters')}")
    finally:
        st, out = call('DELETE', f'/api/requests/{rid}', op_token)
        check('cleanup DELETE (200)', st == 200, f'status={st}')
        if st == 200:
            print(f'  cleaned: request {rid} removed')

    print()
    print('VERDICT:', f'{6 - len(failures)}/6 golden checks PASS'
          if not failures else f'{len(failures)} GOLDEN CHECK(S) FAILED')
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
