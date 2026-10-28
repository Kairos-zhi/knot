#!/usr/bin/env python3
"""Knot round 17: bounded cross-layer incrementality checks.

Model: fixed finite positive Horn rules, stable source-event IDs, eligible-source
snapshots, deterministic per-recipient release policy. This is NOT real A2A,
cryptography, mutable rule sets, live revocation, or physical side-channel proof.
"""
from __future__ import annotations
from dataclasses import dataclass
from itertools import combinations
from random import Random

@dataclass(frozen=True)
class Rule:
    head: str
    body: tuple[str, ...]


def subsets(seq):
    xs = tuple(seq)
    for n in range(len(xs) + 1):
        for tup in combinations(xs, n):
            yield frozenset(tup)


def minimal(family):
    family = set(family)
    return frozenset(s for s in family if not any(t < s for t in family))


def antichain_prod(families):
    acc = {frozenset()}
    for fam in families:
        acc = {x | y for x in acc for y in fam}
    return acc


def boolean_closure(base, rules):
    present = set(base)
    while True:
        add = {r.head for r in rules if set(r.body).issubset(present)}
        nxt = present | add
        if nxt == present:
            return frozenset(present)
        present = nxt


def brute_reference(atoms, event_atom, eligible, rules):
    """Independent full recomputation via ALL subsets of eligible event IDs."""
    families = {a: set() for a in atoms}
    for chosen in subsets(sorted(eligible)):
        present = {event_atom[e] for e in chosen}
        for a in boolean_closure(present, rules):
            families[a].add(chosen)
    return {a: minimal(fams) for a, fams in families.items()}


def topo_scc(atoms, rules):
    """Tarjan SCC + deterministic topological order on premise->head DAG."""
    adj = {a: set() for a in atoms}
    for r in rules:
        for a in r.body:
            adj[a].add(r.head)
    indices, low, stack, active, comps = {}, {}, [], set(), []

    def visit(v):
        indices[v] = low[v] = len(indices)
        stack.append(v)
        active.add(v)
        for w in sorted(adj[v]):
            if w not in indices:
                visit(w)
                low[v] = min(low[v], low[w])
            elif w in active:
                low[v] = min(low[v], indices[w])
        if indices[v] == low[v]:
            comp = set()
            while True:
                w = stack.pop()
                active.remove(w)
                comp.add(w)
                if w == v:
                    break
            comps.append(tuple(sorted(comp)))

    for a in sorted(atoms):
        if a not in indices:
            visit(a)
    who = {a: i for i, group in enumerate(comps) for a in group}
    dag = {i: set() for i in range(len(comps))}
    indeg = {i: 0 for i in range(len(comps))}
    for a, ns in adj.items():
        for b in ns:
            i, j = who[a], who[b]
            if i != j and j not in dag[i]:
                dag[i].add(j)
                indeg[j] += 1
    todo = sorted(i for i in indeg if indeg[i] == 0)
    order = []
    while todo:
        i = todo.pop(0)
        order.append(comps[i])
        for j in sorted(dag[i]):
            indeg[j] -= 1
            if indeg[j] == 0:
                todo.append(j)
                todo.sort()
    assert len(order) == len(comps)
    return order


def sig(group, support, event_atom, eligible, rules):
    group = set(group)
    local_roots = frozenset(e for e in eligible if event_atom[e] in group)
    external_reads = {b for r in rules if r.head in group for b in r.body if b not in group}
    external = tuple((a, support[a]) for a in sorted(external_reads))
    return local_roots, external


def recompute_group(group, current, event_atom, eligible, rules):
    members = set(group)
    local = {a: frozenset(frozenset({e}) for e in eligible if event_atom[e] == a)
             for a in group}
    related = [r for r in rules if r.head in members]
    while True:
        pool = {a: set(local[a]) for a in group}
        for r in related:
            inputs = [local[b] if b in members else current[b] for b in r.body]
            pool[r.head].update(antichain_prod(inputs))
        nxt = {a: minimal(pool[a]) for a in group}
        if nxt == local:
            return nxt
        local = nxt


def evaluate_scc_full(atoms, event_atom, eligible, rules):
    out = {a: frozenset() for a in atoms}
    for group in topo_scc(atoms, rules):
        out.update(recompute_group(group, out, event_atom, eligible, rules))
    return out


def incremental_scc(atoms, event_atom, old_eligible, new_eligible, rules, old):
    out = dict(old)
    recomputed = 0
    for group in topo_scc(atoms, rules):
        before = sig(group, old, event_atom, old_eligible, rules)
        after = sig(group, out, event_atom, new_eligible, rules)
        if before != after:
            out.update(recompute_group(group, out, event_atom, new_eligible, rules))
            recomputed += 1
    return out, recomputed


def released(support, permission):
    """Simple fixed-schema declassification; distinct boolean/root permissions."""
    view = {}
    for atom, allow in sorted(permission.items()):
        allow_bool, allow_roots = allow
        if allow_bool:
            view[(atom, 'supported')] = bool(support[atom])
        if allow_roots:
            view[(atom, 'minimal_roots')] = support[atom]
    return view


def notification_delta(old_release, new_release):
    """INTERNAL comparison only. Never serialize this old/new pair to an agent."""
    keys = set(old_release) | set(new_release)
    return {k: (old_release.get(k), new_release.get(k))
            for k in keys if old_release.get(k) != new_release.get(k)}


def authorized_outbox(old_release, new_release, allow_generic_refresh=True):
    """Public protocol projection: only newly authorized values can be emitted.

    A generic refresh notice, if separately allowed by policy, can tell a
    recipient to re-query. It never exposes revoked keys or their old values.
    This does NOT force a remote recipient to delete previously seen content.
    """
    changed = {k: v for k, v in new_release.items()
               if k not in old_release or old_release[k] != v}
    removed = any(k not in new_release for k in old_release)
    return {'upsert': changed,
            'refresh': bool(allow_generic_refresh and removed)}
