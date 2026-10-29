"""Guard global assertion numbers and the hand-maintained card index."""

from collections import defaultdict
from pathlib import Path
import re


DIRECTORY = Path(__file__).resolve().parents[1] / 'docs' / 'claim-map'
NUMBER = re.compile(r'^\|\s*((?:S|C|I|R)-?\d+)\s*\|', re.MULTILINE)


def test_global_assertion_numbers_are_unique():
    locations = defaultdict(list)
    for path in sorted(DIRECTORY.glob('*.md')):
        for line, text in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            match = NUMBER.match(text)
            if match:
                locations[match[1]].append(f'{path.name}:{line}')
    assert locations, 'no assertion rows found'
    duplicates = {number: paths for number, paths in locations.items() if len(paths) > 1}
    assert not duplicates, f'duplicate assertion numbers: {duplicates}'


def test_card_index_covers_exactly_existing_files():
    text = (DIRECTORY / 'README.md').read_text(encoding='utf-8')
    # The second column of the index is one local Markdown file link.
    links = re.findall(r'^\|[^|]+\|\s*\[[^\]]+\]\(([^)]+\.md)\)\s*\|', text, re.MULTILINE)
    assert links, 'card index is empty'
    assert len(links) == len(set(links)), f'duplicate index entries: {links}'
    for link in links:
        assert Path(link).name == link, f'index must name a card in this directory: {link}'
        assert (DIRECTORY / link).is_file(), f'indexed file missing: {link}'
    actual = {path.name for path in DIRECTORY.glob('*.md') if path.name != 'README.md'}
    assert set(links) == actual, f'index drift: unindexed={actual-set(links)}, missing={set(links)-actual}'
