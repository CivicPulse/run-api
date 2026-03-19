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
import unicodedata


def generate_slug(name: str) -> str:
    """Convert a campaign name into a URL-safe slug.

    Steps applied in order:
    1. Transliterate Unicode to ASCII (e.g. "é" → "e").
    2. Lowercase the entire string.
    3. Replace every run of non-alphanumeric characters with a single hyphen.
    4. Strip leading and trailing hyphens.
    5. Fall back to ``"campaign"`` if the result is empty.

    Args:
        name: The human-readable campaign name.

    Returns:
        A lowercase, hyphen-separated slug string.  Returns ``"campaign"``
        when the input consists entirely of characters that have no ASCII
        transliteration (e.g. punctuation-only or CJK names).

    Examples:
        >>> generate_slug("Smith for Senate 2026!")
        'smith-for-senate-2026'
        >>> generate_slug("  Multiple   Spaces  ")
        'multiple-spaces'
        >>> generate_slug("José García")
        'jose-garcia'
        >>> generate_slug("---")
        'campaign'
    """
    # Decompose Unicode and strip combining marks to get ASCII base letters
    ascii_name = (
        unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    )
    lowered = ascii_name.lower()
    # Replace any sequence of non-alphanumeric chars with a single hyphen
    hyphenated = re.sub(r"[^a-z0-9]+", "-", lowered)
    # Strip leading/trailing hyphens
    slug = hyphenated.strip("-")
    return slug or "campaign"


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
    if not base:
        base = "campaign"
    candidate = base
    counter = 2
    while candidate in existing_slugs:
        candidate = f"{base}-{counter}"
        counter += 1
    return candidate
