# Lane managers and subagents

Each lane (`recog`, `call`, `server`, `ml`) can run as **one manager agent plus subagents** instead of one agent
doing everything:

- The **manager** reads the whole plan, takes notes, and breaks its lane into **phases** in
  `plan/managers/<lane>.md`. It hands one phase at a time to a fresh subagent, then checks the result itself.
- A **subagent** finishes one phase (one or more ledger tasks). It writes a handoff to
  `plan/handoffs/<lane>/<P#>.md` (what it did, successes, challenges, next steps, verify output), checks off its
  phase, and replies to the manager with a short report.

`plan.md` stays the source of truth for task status. The manager plan tracks how the lane's work is split up and
who finished which part. `verify.py tick` refuses to check off a phase until its tasks are DONE or NEEDS-HUMAN in
the ledger **and** every handoff section is filled in.

```
manager:   manager-init → edit phases → for each phase: spawn subagent → review → update notes → next phase
subagent:  cards → check → done → handoff → tick → commit + push → 5-line report to manager
```

## Files

### `plan/managers/<lane>.md` (the manager writes it; subagents only change their phase through `tick`)
```
# Lane call — manager plan
## Manager notes
...free text: state, risks, cross-lane waits, decisions; updated after each handoff...
## Phases
- [ ] **P1** — Voice output into the call · tasks: 2.A1 · handoff: —
  - Goal: ...
  - Cards: plan/tasks/2.A1.md
  - Depends on: 1.A1
  - Brief for the subagent: ...
- [x] **P2** — Offline English + STT pieces · tasks: 2.C1, 2.A2 · handoff: [../handoffs/call/P2.md](../handoffs/call/P2.md)
## Handoff log
P2 · 2026-10-17 · gloss buffer + stt/metrics/chips/consent pass · handoffs/call/P2.md
```
Keep the phase line format exactly as shown (`verify.py` parses it). A phase may cover several tasks. Every open
AGENT task in the lane must belong to exactly one phase.

### `plan/handoffs/<lane>/<P#>.md` (the subagent writes it; `verify.py handoff` creates the template)
Sections, all required: **What I did** · **Successes** · **Challenges** · **Next steps** · **Verify output**.

## Commands (all take `--lane <lane>`)

| Command | Who | What |
|---|---|---|
| `python plan/verify.py manager-init --lane X` | manager, once | Drafts `plan/managers/X.md` with one phase per open task |
| `python plan/verify.py phases --lane X` | manager | Shows each phase: ticked?, task statuses, handoff complete? |
| `python plan/verify.py handoff --lane X P3` | subagent | Creates the handoff template |
| `python plan/verify.py tick --lane X P3` | subagent | Checks off P3, but only if its tasks pass and the handoff is complete |
| `next`, `wait`, `check`, `done` | both | Same as in `plan.md` §1 |

## Rules

1. **Subagents in one lane run one at a time** in the lane's checkout. Two subagents in one folder overwrite each
   other's files. Run two in parallel only if their phases touch disjoint files **and** each has its own
   worktree.
2. **The manager does not write feature code.** It plans, briefs, reviews, and keeps notes. If a subagent fails, the
   manager starts a new subagent with a better brief (include the failed handoff) instead of fixing the code itself.
3. **The manager verifies, it does not trust.** After every report it reruns `verify.py check` for the phase's
   tasks and reads the handoff before starting the next phase.
4. **A phase that cannot finish** (e.g. its task is BLOCKED) stays unchecked. Its handoff explains why, and the
   manager records the decision in Manager notes.
5. **If your tool cannot spawn subagents**, the manager runs each phase itself, in order and with the subagent
   prompt below as its checklist. It still writes a handoff and ticks each phase.

## Manager prompt (one per lane; replace `<lane>` with recog, call, server or ml)

```
You are the MANAGER of the <lane> lane for SignLine (repo Azrkiel/Banana-Brownies-GHH2026). Other managers run
the other lanes in parallel in their own checkouts. You plan, delegate, and verify; subagents write the code.

1. Read AGENTS.md, plan.md (§0, §1, §1.5, the whole ledger), plan/managers/README.md, plan/context.md, and every
   card in your lane (plan/tasks/<ID>.md for each row under "Lane <lane>"). Run
   `python plan/verify.py preflight --lane <lane>` and install whatever it names.
2. If plan/managers/<lane>.md does not exist: `python plan/verify.py manager-init --lane <lane>`. Then edit it:
   - Manager notes: the lane's current state, risks, which tasks wait on which other lanes, and decisions.
   - Phases: group tasks into phases a fresh subagent can finish in one session (usually 1-2 tasks; never mix
     tasks that touch the same file across phases). Order them by the ledger dependencies. For each phase, fill in
     Goal and a "Brief for the subagent" with anything beyond the card (repo quirks, earlier handoff notes).
   Commit and push ("manager plan: <lane>").
3. For each unchecked phase, in order:
   a. `python plan/verify.py next --lane <lane>`. If WAITING on another lane, run
      `python plan/verify.py wait --lane <lane>`.
   b. Spawn ONE subagent with the subagent prompt from plan/managers/README.md, filled in with lane, phase ID,
      tasks, and your brief. Wait for its report.
   c. Verify it yourself: `git pull --rebase`, `python plan/verify.py check <ID>` for each task in the phase,
      `python plan/verify.py phases --lane <lane>`, and read plan/handoffs/<lane>/<P#>.md.
   d. If it failed or the phase isn't ticked, start a new subagent with a sharper brief that includes the failed
      handoff. Don't fix the code yourself.
   e. Update Manager notes and the Handoff log (one line), adjust later phases' briefs with the handoff's next
      steps, then commit and push.
4. Stop when `python plan/verify.py next --lane <lane>` prints NO AGENT TASKS LEFT and
   `python plan/verify.py phases --lane <lane>` prints "all phases ticked", or when wait times out. Final message:
   the plan.md §1.4 report, plus one line per phase (P#, outcome, handoff link) and every human check collected
   from the handoffs.
```

## Subagent prompt (the manager fills in the `{...}` parts)

```
You are a subagent of the {lane} lane manager for SignLine. Your job is phase {P#} — {title}: tasks {IDs}.
Manager's brief: {brief}

1. Read AGENTS.md, plan.md §0-§1, your phase in plan/managers/{lane}.md, and each card plan/tasks/<ID>.md for
   your tasks in full (Intent, Current repo state, Files, Steps, Done when, Not done if).
2. git pull --rebase. For each task, in order: do the Steps exactly (Reference implementation verbatim unless the
   Steps say otherwise); `python plan/verify.py check <ID>` until PASS (never edit checks, never weaken tests);
   `python plan/verify.py done <ID>`.
3. `python plan/verify.py handoff --lane {lane} {P#}` and fill in every section of
   plan/handoffs/{lane}/{P#}.md: What I did, Successes, Challenges, Next steps (including human checks as
   copy-paste commands), Verify output (pasted).
4. `python plan/verify.py tick --lane {lane} {P#}`. If it refuses, fix what it lists and rerun.
5. git add -A; git commit -m "<card commit message(s)> + handoff {P#}"; git pull --rebase; git push.
6. Reply to the manager in at most 5 lines: tasks and new statuses, one line on what was built, the hardest
   challenge, the next step, the handoff path.
Stay inside the files your cards list. Touch no other phase's tasks. Don't edit plan/managers/{lane}.md except
through `tick`. If you cannot finish, still write the handoff (Challenges = why) and report. Do not tick.
```
