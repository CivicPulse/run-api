"""Unit tests for app.utils.slug — generate_slug and generate_unique_slug."""

from __future__ import annotations

from app.utils.slug import generate_slug, generate_unique_slug

# ---------------------------------------------------------------------------
# generate_slug
# ---------------------------------------------------------------------------


class TestGenerateSlug:
    """Tests for generate_slug()."""

    def test_basic_lowercasing(self):
        assert generate_slug("Hello World") == "hello-world"

    def test_replaces_spaces_with_hyphens(self):
        assert generate_slug("Smith for Senate") == "smith-for-senate"

    def test_replaces_special_characters(self):
        assert generate_slug("Smith for Senate 2026!") == "smith-for-senate-2026"

    def test_collapses_multiple_non_alphanum_runs(self):
        assert generate_slug("Multiple   Spaces") == "multiple-spaces"
        assert generate_slug("Hello--World") == "hello-world"

    def test_strips_leading_hyphens(self):
        assert generate_slug("  leading spaces") == "leading-spaces"

    def test_strips_trailing_hyphens(self):
        assert generate_slug("trailing spaces  ") == "trailing-spaces"

    def test_strips_both_edges(self):
        assert generate_slug("  --Hello World--  ") == "hello-world"

    def test_all_non_alphanum_returns_fallback(self):
        assert generate_slug("---") == "campaign"
        assert generate_slug("!!!") == "campaign"

    def test_preserves_digits(self):
        assert generate_slug("District 5 Campaign") == "district-5-campaign"

    def test_already_a_valid_slug(self):
        assert generate_slug("my-campaign") == "my-campaign"

    def test_single_word(self):
        assert generate_slug("Campaign") == "campaign"

    def test_mixed_case(self):
        assert generate_slug("CamelCaseSlug") == "camelcaseslug"

    def test_unicode_transliterated_to_ascii(self):
        # Accented chars are transliterated to ASCII base letters.
        assert generate_slug("café au lait") == "cafe-au-lait"
        assert generate_slug("José García") == "jose-garcia"

    def test_empty_string(self):
        assert generate_slug("") == "campaign"


# ---------------------------------------------------------------------------
# generate_unique_slug
# ---------------------------------------------------------------------------


class TestGenerateUniqueSlug:
    """Tests for generate_unique_slug()."""

    def test_returns_base_when_no_collisions(self):
        assert generate_unique_slug("Smith for Senate", set()) == "smith-for-senate"

    def test_appends_2_on_first_collision(self):
        existing = {"smith-for-senate"}
        result = generate_unique_slug("Smith for Senate", existing)
        assert result == "smith-for-senate-2"

    def test_increments_past_consecutive_collisions(self):
        existing = {"smith-for-senate", "smith-for-senate-2"}
        result = generate_unique_slug("Smith for Senate", existing)
        assert result == "smith-for-senate-3"

    def test_finds_gap_in_sequence(self):
        # -2 and -4 exist but -3 is free
        existing = {"smith-for-senate", "smith-for-senate-2", "smith-for-senate-4"}
        result = generate_unique_slug("Smith for Senate", existing)
        assert result == "smith-for-senate-3"

    def test_many_collisions(self):
        base = "my-campaign"
        existing = {base} | {f"{base}-{i}" for i in range(2, 101)}
        result = generate_unique_slug("My Campaign", existing)
        assert result == "my-campaign-101"
        assert result not in existing

    def test_non_alphanum_name_uses_fallback(self):
        # Non-alphanumeric names fall back to "campaign"
        result = generate_unique_slug("---", set())
        assert result == "campaign"

    def test_non_alphanum_name_with_collision(self):
        # "campaign" fallback collides — gets suffixed
        result = generate_unique_slug("---", {"campaign"})
        assert result == "campaign-2"

    def test_does_not_mutate_existing_slugs(self):
        existing = {"campaign"}
        generate_unique_slug("campaign", existing)
        assert existing == {"campaign"}
