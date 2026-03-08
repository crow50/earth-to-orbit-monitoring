# Screenshots (PR evidence)

We commit UI screenshots into the repo so PRs can include reliable *before/after* evidence.

## Convention

Store screenshots under:

- `docs/screenshots/pr-<PR#>/before-<slug>.png`
- `docs/screenshots/pr-<PR#>/after-<slug>.png`

Example:

- `docs/screenshots/pr-123/before-filters-empty-state.png`
- `docs/screenshots/pr-123/after-filters-empty-state.png`

## Capture

This uses the OpenClaw-managed browser (headless on the VPS).

```bash
make shot \
  URL=https://earthtoorbit.space/ \
  OUT=docs/screenshots/pr-123/before-home.png

# After your change:
make shot \
  URL=https://earthtoorbit.space/ \
  OUT=docs/screenshots/pr-123/after-home.png
```

Then commit the new files and link them in the PR body.
