---
name: playwright-tabbed-orchestration
description: >-
  Parent Agent uses playwright-tabbed to allocate browser tabs and partition tasks,
  then spawns child agents in parallel — each operating on its assigned tab_id — for
  browser acceptance testing or automation, with a final aggregated summary.
  Suitable for multi-page validation, parallel module checks, and parent-controlled
  multi-tab task distribution.
  Trigger keywords: parallel child agent, allocate tab, tab_id, playwright-tabbed,
  multi-tab acceptance, parent Playwright orchestration.
---

# Playwright Multi-Tab + Parent/Child Agent Orchestration

## Use Cases
- A batch of pages or scenarios must be validated within the **same browser context** (e.g. shared login state) and you want **true parallelism** to reduce total time.
- The parent agent is responsible for: **resolving BASE_URL, creating tabs, partitioning tasks, aggregating results**; child agents are responsible for: **calling MCP only within their assigned `tab_id`**, without stealing focus from other tabs.

## Prerequisites
- MCP server: **playwright-tabbed** — if not installed, prompt the user to run `npm install playwright-mcp-tabbed`.
- If the task depends on an authenticated session: complete **BASE_URL Resolution** below first; **then** verify login state; do not create new tabs in bulk or spawn child agents until the user explicitly confirms (gate can be loosened or tightened per business rules; halt and wait for the user if not logged in).

### Installation Path and Script Location
When resolving `BASE_URL`, run the following from the **skill root directory**:

```bash
node scripts/resolve-base-url.js
```

If called from a different working directory, use an absolute path or `cd` to the skill root first. When relying on `.env.local` / `.env` / `playwright.env.local` at the repository root, **the terminal or agent's cwd should be inside the target project repo** (the script walks up from cwd to locate `.git`).

### BASE_URL Resolution
The parent agent **must not** ask the user to guess the address or wait for a passphrase before `BASE_URL` (configured as `PLAYWRIGHT_BASE_URL`) has been determined.

**Recommended: run the script first to obtain `PLAYWRIGHT_BASE_URL`, then align with the current tab's `origin` via `browser_context_info` as needed.**
```bash
node scripts/resolve-base-url.js
```
Optional flags: `--source` prints the resolution source, `--strip-trailing-slash` removes a trailing `/`, `--export` outputs `export PLAYWRIGHT_BASE_URL=...`.

If the script exits with a non-zero code: prompt the user to configure a source following the full resolution order described at the top of `scripts/resolve-base-url.js` (or run `node scripts/resolve-base-url.js --help`).

**Aligning with MCP (script cannot substitute this step):** Call `browser_context_info`; if `env_PLAYWRIGHT_MCP_BASE_URL` is present or differs from the `origin` of an already-open business page, use **the business tab's origin** as the authoritative value.

### Login State Verification
1. After navigating to the BASE_URL page in the previous step, if the page automatically redirects to a login page, inform the user that authentication is required and wait for them to handle it before continuing.
2. If the page opens normally, determine whether login state needs to be confirmed based on the task requirements.


## Parent Agent Standard Workflow

### 1. BASE_URL (finalize after the resolution section above)
1. **BASE_URL** has already been determined by the "BASE_URL Resolution" section; call `browser_context_info` once more here to ensure subsequent navigation does not mix origins.
2. **Lock in a single BASE_URL**: `scheme + host + port`, which must match the origin of the tab where the authenticated business page resides; **do not** mix other hosts/ports afterwards (`localhost` and `127.0.0.1` are treated as different origins).

### 2. Confirm Parallelism `N`
Based on the user's requirements — e.g. if they explicitly say "use 5 tabs" or "launch 5 child agents" — set N=5. If no explicit value is given, default to N=3.

### 3. Tab Allocation
**Steps:**
1. Use `action: "new"` to create `N` tabs in sequence according to the parallelism level; pass a **label** for each (matching the task partition name for easy cross-referencing), and **record the `tab_id` returned for each tab** (use `list` to verify if needed).
2. `browser_tabs` `action: "list"`: inspect each tab's **index**, **tab_id**, **label** (if any), and **url** to avoid duplicate creation or wrong targeting.
3. Task partitions and child agents follow a strict **one partition ↔ one tab_id** mapping; when filling the child agent template use only **`<TAB_ID>`** — do not pass the label as an MCP parameter. The summary may list both `label + tab_id` for human review.

### 4. Task Partitioning
- Divide the URL/scenario list evenly into `N` groups (or split along module boundaries), with each group mapped to **one** tab_id.
- Each group should be **independently executable**: navigate → snapshot → interact → check console (or user-defined steps), with no cross-tab dependencies.
- Save each group's content as the `<PAGE_OR_SCENARIO_LIST>` for the corresponding sub-task.

### 5. Spawn Child Agents (true parallelism)
- Use a mechanism that can spawn child agents in parallel, launching all `N` sub-tasks **in the same round**.
- Each sub-task must include the fully filled-in child agent prompt template below (with `TAB_ID`, `BASE_URL`, `<PAGE_OR_SCENARIO_LIST>`, and `<SUB_TASK_DESCRIPTION>` substituted).
- Child agents must be able to use the **playwright-tabbed** browser tools via the MCP calling convention of the current host environment.

### 6. Summary
- After collecting all `N` child reports, output: a summary per group, a **Available / Partially Available / Unavailable** status per page or scenario, **common issues** (mixed origins, overlay blocking, pagination, console errors, selector mismatches on sidebars, etc.), and **recommended fix/optimization priorities**.

## Child Agent Prompt Template (filled in by parent agent before dispatch)
The following placeholders are replaced by the parent agent: `<TAB_ID>`, `<BASE_URL>` (no trailing slash), `<PAGE_OR_SCENARIO_LIST>` (one path or short scenario description per line), `<SUB_TASK_DESCRIPTION>`.

```text
## Role
You are an acceptance/automation child agent. You must complete your task by operating through MCP playwright-tabbed:
`<SUB_TASK_DESCRIPTION>`

## Requirements
- For all calls that require specifying a tab, pass only tab_id: "<TAB_ID>" — do not pass tab_index at the same time.
- Under BASE_URL <BASE_URL>, execute the following pages or scenarios one by one (full URL = BASE_URL + path, path starts with /):
<PAGE_OR_SCENARIO_LIST>

- Suggested flow per page/scenario:
1. browser_navigate: use the full URL.
2. browser_snapshot: for large list pages use max_chars (e.g. 20000) or root_selector (e.g. main, #table-frame — adjust to the page).
3. Complete real interactions as required by the task (filters, clicks, dropdowns, query/reset, pagination, modal open/close, etc.).
4. browser_console_messages: check for errors (ignore logs the team has agreed are harmless build-tool / dev noise).

- If login appears to be missing: call browser_context_info first, verify the current tab's origin equals <BASE_URL>; re-navigate with the correct BASE_URL; do not attempt to guess login on an unknown host.

Output format: one section per item, each containing — path or scenario name, validation points, result (Available / Partially Available / Unavailable), issues (write "none" if there are none).
```
