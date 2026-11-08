# @segnavia/layout

## 0.50.0

### Minor Changes

- 8f84d79: Add universal book and printed-page planning, including capped convergence, and route frame composition through the shared plans.
- 2df0afb: Add saved book pagination through format's `Plan`, `Measurements` and
  `fingerprintValue`, and layout's `BookPlan`, `savePlan` and `replayPlan`.
  `bookPlan` computes the saved plan. `bookPdf` now accepts the `plan` and
  `breaks` options, and `describeDocument` accepts a saved `plan` and describes
  its pages.

  The paginate input types (`PaginateBookInput` and its parts) are now defined by
  format's `Measurements` schema and re-exported by layout as types.

### Patch Changes

- Updated dependencies [6ac32e4]
- Updated dependencies [2df0afb]
  - @segnavia/format@0.50.0
