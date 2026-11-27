# Working rules

## Git: work on `dev`, leave changes uncommitted

- Edit directly in the main checkout on the `dev` branch. Don't create worktrees or feature branches.
- Don't `git commit` or `git push` unless the user asks. Report changes as uncommitted working-tree edits.

## Descriptive names

- Use descriptive names (`boxHeight`, not `h`), in new code and when refactoring.
- Only loop indices (`i`, `j`), plain coordinates (`x`, `y`) and sort-comparator `a`/`b` stay short. No one- or two-letter abbreviations either (`bw`, `el`, `t0`, `cfg`, `ctx`).
- `eslint.config.mjs` enforces this with `id-length` (min 3, including properties). Short keys are allowed only in saved/logged/server formats, marked with `// eslint-disable-line id-length -- <reason>`.
