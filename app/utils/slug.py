"""URL-safe slug generation utilities.

Uses only the Python standard library ``re`` module.

Examples::

    >>> generate_slug("Smith for Senate 2026!")
    'smith-for-senate-2026'

    >>> generate_slug("  --Hello World--  ")
    'hello-world'

    >>> existing = {"smith-for-senate"}
    >>> generate_unique_slug("Smith for Senate", existing)
    'smith-for-senate-2'
"""

from __future__ import annotations

import re


def generate_slug(name: str) -> str:
    """Convert a campaign name into a URL-safe slug.

    Steps applied in order:
    1. Lowercase the entire string.
    2. Replace every run of non-alphanumeric characters with a single hyphen.
    3. Strip leading and trailing hyphens.

    Args:
        name: The human-readable campaign name.

    Returns:
        A lowercase, hyphen-separated slug string.  If ``name`` consists
        entirely of non-alphanumeric characters the result will be an empty
        string ``""`` (callers should handle that edge case if needed).

    Examples:
        >>> generate_slug("Smith for Senate 2026!")
        'smith-for-senate-2026'
        >>> generate_slug("  Multiple   Spaces  ")
        'multiple-spaces'
        >>> generate_slug("---")
        ''
    """
    lowered = name.lower()
    # Replace any sequence of non-alphanumeric chars with a single hyphen
    hyphenated = re.sub(r"[^a-z0-9]+", "-", lowered)
    # Strip leading/trailing hyphens
    return hyphenated.strip("-")


def generate_unique_slug(name: str, existing_slugs: set[str]) -> str:
    """Generate a slug from ``name`` that does not collide with ``existing_slugs``.

    If the base slug is not present in ``existing_slugs`` it is returned as-is.
    Otherwise, numeric suffixes ``-2``, ``-3``, … are appended until a free
    slot is found.

    Args:
        name: The human-readable name to slugify.
        existing_slugs: The set of slug strings already in use.

    Returns:
        A unique slug string guaranteed not to appear in ``existing_slugs``.

    Examples:
        >>> generate_unique_slug("Smith for Senate", set())
        'smith-for-senate'
        >>> generate_unique_slug("Smith for Senate", {"smith-for-senate"})
        'smith-for-senate-2'
        >>> generate_unique_slug(
        ...     "Smith for Senate",
        ...     {"smith-for-senate", "smith-for-senate-2"},
        ... )
        'smith-for-senate-3'
    """
    base = generate_slug(name)
    candidate = base
    counter = 2
    while candidate in existing_slugs:
        candidate = f"{base}-{counter}"
        counter += 1
    return candidate
