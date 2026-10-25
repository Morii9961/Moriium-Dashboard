# UsageSnapshot 1.1 exchange contract

This is a compatible extension of 1.0. The 1.0 schema, fixtures and SHA manifest remain frozen. Importers dispatch on `schema_version`; the Project Status Protocol is independent. All examples here are synthetic.

Use both JSON Schema and `parseUsage` / `checkUsage` from `@moriium-dashboard/protocol/usage`. Schema alone does not enforce count subsets, dimension uniqueness, real calendar dates, coverage, or quality semantics. Types live in `src/usage-types.ts`; API response types in `src/usage-api-types.ts`. ADR 0007 records the decisions.

## Quality

Optional `quality` exists at snapshot, day and allocated-row scopes. Absence or `state: not_reported` means unknown; `reported` with an empty `reasons` array means no issue was reported after checking that scope. `not_reported` must have an empty array. A reason has only `code` and `occurrences`, a canonical nonnegative decimal string or null (affected count unknown). An explicit `"0"` differs from null. Unknown fields and free text are rejected.

The finite codes and fixed units are exported as `USAGE_QUALITY_CODES` / `USAGE_QUALITY_UNITS`:

| Unit | Codes |
| --- | --- |
| checkpoints | counter_reset, retained_not_observed, checkpoint_unallocated |
| sessions | session_copy_conflict |
| files | source_missing, source_unreadable, source_deleted, incomplete_tail |
| observations | request_start_unavailable |
| records | parse_rejected, unsupported_source, model_unresolved, effort_inferred, counts_unreported, pricing_conditions_unknown |

One code may occur once per scope. Producers deduplicate affected objects before counting. Scopes may overlap; consumers must not sum their reasons. Reasons are not Tokens and never repair counts or authorize conflict resolution. Unresolved counts remain null. Accepted retained history may keep known counts with `retained_not_observed`. Quality changes require a new revision and participate in the snapshot hash. Changing quality cannot bypass row uniqueness.

## Time and unallocated observations

Allocated `rows` retain the 1.0 request-start rule. A known completion or usage observation timestamp does not prove request start, even on the same day. Do not relabel it as `request_start` or `shanghai_day`. Allocated rows cannot carry a nonzero/unknown `request_start_unavailable` or `checkpoint_unallocated` reason.

Optional `unallocated` is a complete dataset-level set for this revision, not an incremental stream. Absence means not reported; an explicit empty array means reported empty. An unallocated row has the same normalized model, effort, pricing conditions and mutually exclusive counts, but no `date`. It has:

- `observed_date`: Shanghai observation/completion date, or null for an unknown checkpoint; it is not a usage attribution date. It may be outside the declared usage range, but cannot be later than the Shanghai date of `generated_at`.
- `time_basis`: `usage_observation`, `response_completion`, or `checkpoint_unknown`. Only the last requires a null observation date; the other two require a real date.
- Required reported `quality`, including `request_start_unavailable` or `checkpoint_unallocated` with a positive or unknown occurrence count.

Unallocated counts are already deduplicated normalized measurements. Never concatenate revisions or add them to allocated rows. They are excluded from all Shanghai daily/weekly Tokens, ratios, pricing and known subtotals. The midnight observation/completion fixtures deliberately place an unallocated observation on the following day; no request date can be inferred from it. Total allocated plus unallocated rows is at most 2,000; the shared 1 MiB limit still applies.

Dashboard displays one dataset-wide observation set: the snapshot referenced by the most recent active explicit daily selection (highest selection ID), even when that selection is outside the viewed week. Undo/reselection changes that set; older sets are retained, never summed. A frozen bill stores the exact chosen observation hash, and repricing retains it. This metadata is explicitly outside the viewed week's totals. A consumer may use another explicit revision-selection workflow, but cannot merge sets silently.

## Offline conformance

From an installed checkout of the fixed Git commit, with Node 24.15+ and pnpm 10.33:

```sh
pnpm usage:check packages/protocol/usage/v1.1/fixtures/valid-midnight-observation.json
pnpm usage:check packages/protocol/usage/v1.1/fixtures/invalid-misdated-observation.json
pnpm exec vitest run packages/protocol/test/usage.test.ts packages/protocol/test/usage-v1-1.test.ts
```

The first exits 0; the second exits 1 with a fixed error code and no private input echo. The tests validate both old and new contracts and verify independently frozen schema/fixture bytes against each `SHA256.json`. Dashboard's own tests are not evidence of Runtime conformance: Runtime must independently test the pinned Git objects and record its result.
