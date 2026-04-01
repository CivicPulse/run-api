# hatchkit – AI Agent Guidelines

This project uses **hatchkit** for AI-driven development.

## Python Environment & Package Management

- Always use `uv` for all Python environment and package management needs
- Never use `pip`, `pip3`, `poetry`, `conda`, or system Python directly
- Run Python scripts with `uv run python <script>` — never bare `python` or `python3`
- Install packages with `uv add <package>` (or `uv add --dev` for dev deps)
- Remove packages with `uv remove <package>`
- Do not modify `requirements.txt` or `pyproject.toml` directly for dependencies — use `uv` commands

## Development Principles

- Write clear, self-documenting code
- Prefer small, focused functions and modules
- Always add or update tests when changing behaviour
- Keep dependencies minimal

## Workflow

1. Discuss the requirement and agree on an approach
2. Implement the smallest change that satisfies the requirement
3. Verify with tests and linting before marking work complete
