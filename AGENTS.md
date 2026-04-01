# Agent Guidelines

## Python Environment & Package Management

- Always use `uv` for all Python environment and package management needs
- Never use `pip`, `pip3`, `poetry`, `conda`, or system Python directly
- Run Python scripts with `uv run python <script>` — never bare `python` or `python3`
- Install packages with `uv add <package>` (or `uv add --dev` for dev deps)
- Remove packages with `uv remove <package>`
