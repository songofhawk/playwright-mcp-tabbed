# playwright-mcp-tabbed

[中文说明](./README.zh-CN.md)

![playwright-mcp-tabbed hero](./assets/readme-hero.png)

> A tab-aware Playwright MCP server for parallel agent workflows.

`playwright-mcp-tabbed` adds explicit `tab_index` support to Playwright MCP tools so multiple agents can operate on different tabs while sharing a single browser context and login session.

## The Problem

The official `@playwright/mcp` model is centered around a shared active page. That is perfectly fine for single-agent flows, but it becomes fragile in concurrent workflows:

- Agent A selects tab 1
- Agent B selects tab 2
- Agent A's next action may accidentally run on tab 2

This project removes that shared active-tab assumption. Instead, each tool call can target a tab directly.

## Typical Use Cases

`playwright-mcp-tabbed` is especially useful when browser automation is part of a larger agent workflow.

### 1. Batch bug fixing

One main agent logs in once, opens several tabs, and assigns one `tab_index` to each bug-fixing sub-agent. Every sub-agent can reproduce and verify its own issue in parallel without losing authentication state.

### 2. Multi-route regression checks

After a refactor, different agents can validate `/orders`, `/wallet`, `/settings`, and `/users` at the same time while staying inside the same logged-in admin session.

### 3. Side-by-side environment comparison

One tab points to the old app, another to the migrated app, and another to a staging environment. Agents can compare behavior or styling in parallel without repeatedly logging in.

### 4. Long workflows split across agents

Instead of forcing one agent to serialize a long browser journey, you can split related subflows into dedicated tabs and assign them to separate agents.

## How It Works

- One browser instance
- One shared browser context
- Many tabs
- Every browser tool call can specify `tab_index`

This gives you:

- shared cookies and login state
- stable routing to the intended tab
- better fit for multi-agent orchestration

## Key Features

- Adds `tab_index` (and stable `tab_id`) to nearly all browser tools
- Shares login state across tabs through one browser context **for the same origin**
- `browser_context_info` explains open tabs and reminds that `localhost` vs `127.0.0.1` use different cookies
- Optional `PLAYWRIGHT_MCP_BASE_URL` plus `browser_navigate.base_url` for relative paths like `/dashboard`
- `browser_snapshot` supports `root_selector` and `max_chars` to limit MCP payload size
- `browser_click` supports `force`, `trial`, and `timeout` (Playwright semantics)
- `browser_network_requests` supports `limit` and `url_contains`
- Keeps tool names close to the official Playwright MCP naming
- Works well in Cursor and similar MCP clients
- Designed for deterministic parallel agent behavior

## Supported Tools

- `browser_tabs`
  Supports `action: "list" | "new" | "close"`; `new` accepts optional `label`; list includes `tab_id` per tab
- `browser_context_info`
  JSON summary of tabs, origins, and per-origin storage note
- `browser_navigate`
- `browser_snapshot`
- `browser_take_screenshot`
- `browser_run_code`
- `browser_click`
- `browser_type`
- `browser_fill_form`
- `browser_file_upload`
- `browser_hover`
- `browser_select_option`
- `browser_press_key`
- `browser_wait_for`
- `browser_evaluate`
- `browser_navigate_back`
- `browser_network_requests`
- `browser_console_messages`
- `browser_resize`
- `browser_drag`
- `browser_handle_dialog`
- `browser_close`
- `browser_install`

Tools that target a page accept **either** `tab_index` **or** `tab_id` (mutually exclusive). Prefer `tab_id` when sub-agents might race on tab creation order.

```json
{ "tab_index": 1 }
```

```json
{ "tab_id": "550e8400-e29b-41d4-a716-446655440000" }
```

Exceptions (no tab argument): `browser_tabs`, `browser_close`, `browser_install`, `browser_context_info`.

### Environment

- `PLAYWRIGHT_MCP_BASE_URL` — optional default origin for relative URLs in `browser_navigate` (e.g. `http://127.0.0.1:3000`).

## Differences From Official `@playwright/mcp`

- `browser_tabs.select` is intentionally not implemented
- tab switching is replaced by explicit `tab_index` routing
- the design target is concurrent agent execution, not a shared active-tab interaction model

## Quick Start

### Install

```bash
npm install
npm run build
```

### Run locally

```bash
npm run dev
```

### Add to Cursor

Add this to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "playwright-tabbed": {
      "command": "node",
      "args": [
        "/absolute/path/to/playwright-mcp-tabbed/dist/index.js"
      ]
    }
  }
}
```

You can keep the official `playwright` server alongside it and only use `playwright-tabbed` for concurrent browser tasks.

## Recommended Multi-Agent Workflow

1. The main agent logs in once (use **one host** consistently, e.g. always `http://127.0.0.1:3000`).
2. The main agent creates N tabs with `browser_tabs` (`action: "new"`, optional `label`).
3. Each sub-agent receives a dedicated `tab_id` (and optionally `tab_index`).
4. Every browser tool call from that sub-agent includes that `tab_id`.

Example:

```json
{
  "url": "http://127.0.0.1:3000/orders",
  "tab_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

Call `browser_context_info` if login seems missing — often the tab is on a different origin than the login tab.

## When To Use It

Use `playwright-mcp-tabbed` when:

- you have multiple sub-agents running browser tasks at the same time
- you need shared login state across those tasks
- you want deterministic browser routing without a shared current-tab pointer

Stay with the official `@playwright/mcp` when:

- you only have one agent
- your workflow is strictly sequential
- you do not need shared tabs across concurrent tasks

## Current Limitation

This project intentionally favors explicit tab routing over active-tab semantics. If your tooling depends on `browser_tabs.select`, this server is not a drop-in replacement for that specific behavior.

## Media

- README cover image: `./assets/readme-hero.png`
- Source used to render the image: `./assets/readme-hero.html`

## License

MIT
