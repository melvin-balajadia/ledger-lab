-- Accountant confirmed: the contracted price for these two over-budget items
-- is reasonable given additional project needs. Per CLAUDE.md rule #9,
-- budget_items.revised_budget is never updated in place -- this logs the
-- revision so the variance stays explainable. amount_after matches the
-- current contract_amount (i.e. the contracted price is approved as the new
-- revised budget).
USE rcsni_cost;

INSERT INTO budget_revisions (project_id, budget_item_id, revision_no, effective_on, amount_before, amount_after, reason, approved_by)
VALUES
 (1, 14, 1, '2026-08-03', 21470805.00, 34661976.86, 'Contracted price reasonable due to additional needs of the project', 'accountant'),
 (1, 17, 1, '2026-08-03', 5497365.00, 6534100.00, 'Contracted price reasonable due to additional needs of the project', 'accountant');
