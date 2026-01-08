# Definition of Great

## Correctness Requirements
- Calculator math must match the output of Ramin's Pizza Calculator across all use cases, including preferments, 24- or 48-hour timelines, double ferments, and similar workflows.
- Preferment water accounting must be correct: total hydration is the final dough hydration, not the preferment hydration.
- Base 6 rule must behave correctly and must not double-count pizzas.
- Ramin parity must be enforced via golden test cases.

## UI Invariants
- Pizza-making tab is read-only, except for temperature measurement points which must remain editable.
- Temperature edits trigger live recalculation of optimal pizza-making water temperatures and final dough temperatures.

## Stability Requirements
- No blank tabs.
- No silent errors; errors must be visible to the user.

## V1 Scope Boundaries
- Implement only the calculator behaviors required to match Ramin's Pizza Calculator outputs (including preferment variants, 24/48-hour timelines, and double ferments).
- Enforce the pizza-making tab read-only behavior with temperature-only exceptions and live recalculation.
- Ensure Base 6 rule correctness and preferment water accounting.
- Prioritize kitchen-readable UX where key gram numbers are the largest elements.
