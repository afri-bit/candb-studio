## Summary

<!-- What changed and why. One short paragraph. -->

## Related

- Issue: Fixes #
- Spec (if any): `specs/`
- ADR (if any): `docs/adr/`

## Type

- [ ] Bug fix
- [ ] Feature
- [ ] ADR / process
- [ ] Documentation only
- [ ] Chore (deps, CI, refactor with no behavior change)

## Test plan

<!-- What you ran or clicked. For webview UI, say what you verified (or that no browser host was available). -->

- [ ] `npm run compile`
- [ ] `npm run lint`
- [ ] `npm run test:unit` (or `npm test` when integration is in scope)

## Checklist

- [ ] Scope matches the linked issue (no drive-by features)
- [ ] Behavior changes include tests (`test/unit/` and/or `test/integration/`)
- [ ] Webview protocol kept in sync (types + handler + Svelte) if the editor or Signal Lab changed
- [ ] Docs updated when user-facing behavior or architecture changed
