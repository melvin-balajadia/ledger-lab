-- ============================================================================
-- DO NOT RUN until accounting confirms. See the question below.
-- ============================================================================
--
-- Migration 005 logged two accountant-confirmed budget revisions but did NOT
-- update budget_items.revised_budget, reading CLAUDE.md rule #9 ("log, never
-- overwrite") as "never touch that column at all".
--
-- The app itself does the opposite: POST /budget-items/:id/revisions inserts
-- the log row AND updates revised_budget in the same transaction (see
-- server/routes/budgetItems.js). That is the correct reading of rule #9 --
-- never overwrite *without an audit trail* -- and original_budget preserves
-- the pre-revision figure either way, so nothing is lost.
--
-- Consequence of the inconsistency: v_budget_vs_actual reads revised_budget,
-- so the Overview dashboard reports these two items as over budget (+61% and
-- +19%) in red danger alerts, even though the approved revisions cover the
-- commitments exactly:
--
--   item                  revised_budget    approved (budget_revisions)   commitment
--   Fire Protection (14)   21,470,805.00           34,661,976.86        34,661,976.86
--   Bollards (17)           5,497,365.00            6,534,100.00         6,534,100.00
--
-- QUESTION FOR ACCOUNTING: are 34,661,976.86 (Fire Protection) and
-- 6,534,100.00 (Bollards) the live approved budgets for these items?
--   - If YES  -> run this migration. Both items stop showing as over budget,
--               which is the accurate picture.
--   - If NO   -> do not run it. Instead the app's revision endpoint should be
--               changed to match migration 005, so the two stop disagreeing.
--
-- ANSWERED 2026-09-07: accounting confirms "approved revised budgets should be
-- used", so this is cleared to run.
--
-- Sets revised_budget from the latest logged revision rather than hardcoding
-- the figures, so this stays correct if another revision is recorded before
-- it is run.
--
-- REVISED 2026-09-07 -- "latest revision" is not good enough. On 2026-08-31 a
-- revision was saved against Bollards for 5,497,365.00 -> 5,497,365.00, with no
-- reason and no approver: an accidental save that changed nothing. It is
-- revision_no 2, so the original MAX(revision_no) logic below would have
-- applied that no-op and left Bollards exactly as it was, silently fixing only
-- Fire Protection while reporting success.
--
-- So: consider only revisions that actually moved the amount. The no-op row
-- stays in the log (budget_revisions is append-only, rule #9) but no longer
-- shadows the real revision underneath it. server/routes/budgetItems.js now
-- rejects a zero-delta revision outright, so this cannot recur.
-- ============================================================================
USE rcsni_cost;

UPDATE budget_items bi
JOIN (
  SELECT br.budget_item_id, br.amount_after
  FROM budget_revisions br
  JOIN (
    SELECT budget_item_id, MAX(revision_no) AS max_rev
    FROM budget_revisions
    WHERE project_id = 1
      AND amount_after <> amount_before   -- ignore no-op revisions
    GROUP BY budget_item_id
  ) latest
    ON latest.budget_item_id = br.budget_item_id
   AND latest.max_rev = br.revision_no
) applied ON applied.budget_item_id = bi.id
SET bi.revised_budget = applied.amount_after,
    bi.updated_by = 'migration-016'
WHERE bi.project_id = 1
  AND bi.revised_budget <> applied.amount_after;

-- Verification: expect Fire Protection 34,661,976.86 and Bollards
-- 6,534,100.00, both with is_over_budget = 0.
-- SELECT item_no, description, budget, contract_amount, is_over_budget
--   FROM v_budget_vs_actual WHERE project_id = 1 AND item_no IN ('14.0','17.0');
