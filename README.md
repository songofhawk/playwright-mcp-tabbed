# playwright-mcp-tabbed

A custom Playwright MCP server that adds `tab_index` support to browser tools so multiple agents can operate on separate tabs while sharing the same browser context and login state.

## Why This Exists

The official `@playwright/mcp` tools are centered around a shared current page. That works well for single-agent flows, but it becomes a bottleneck in multi-agent workflows where different agents need to operate on different tabs in parallel.

This project keeps one shared browser context and lets callers explicitly target a tab with `tab_index`.

## Features

- Adds `tab_index` to nearly all browser tools
- Keeps tabs in the same browser context so cookies and login state are shared
- Supports parallel agent workflows without relying on a shared current tab
- Keeps the tool names close to the official Playwright MCP naming

## Supported Tools

- `browser_tabs`
  Supports `action: "list" | "new" | "close"`
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

All tools except `browser_tabs`, `browser_close`, and `browser_install` support an optional `tab_index` argument:

```json
{
  "tab_index": 1
}
```

## Differences From Official Playwright MCP

- `browser_tabs.select` is intentionally not implemented
- Tab selection is replaced by explicit `tab_index` routing on each tool call
- The goal is deterministic multi-agent usage instead of a shared active-tab model

## Installation

```bash
npm install
npm run build
```

## Local Development

```bash
npm run dev
```

## Cursor MCP Configuration

Add this to your `~/.cursor/mcp.json`:

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

You can keep the official `playwright` MCP server alongside it and only use `playwright-tabbed` for concurrent agent workflows.

## Typical Multi-Agent Flow

1. The main agent logs in once.
2. The main agent creates N tabs with `browser_tabs` and records each tab index.
3. Each sub-agent receives its own `tab_index`.
4. Every browser tool call from that sub-agent includes the assigned `tab_index`.

Example:

```json
{
  "url": "http://localhost:3000",
  "tab_index": 2
}
```

## Publishing Notes

- License: MIT
- Repository: `songofhawk/playwright-mcp-tabbed`
- Recommended use case: Cursor or other MCP clients running parallel browser tasks
