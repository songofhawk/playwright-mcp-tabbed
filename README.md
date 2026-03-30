# playwright-mcp-tabbed

一个自定义的 Playwright MCP server，核心目标是给每个浏览器工具增加 `tab_index` 参数，方便多个 sub-agent 并行操作不同标签页，同时共享同一个浏览器 context 的登录状态。

## 已实现

- `browser_tabs`
  - `action: "list" | "new" | "close"`
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

除 `browser_tabs` 和 `browser_close` 外，其余工具都支持可选参数：

```json
{
  "tab_index": 1
}
```

## 典型使用流程

1. 主 agent 调用 `browser_tabs` with `action: "new"` 多次创建标签页
2. 记录每个标签页的 `index`
3. 将不同的 `tab_index` 分配给不同 sub-agent
4. sub-agent 在所有浏览器工具调用中都显式传入自己的 `tab_index`

## Cursor 配置

已在 `~/.cursor/mcp.json` 中新增：

```json
"playwright-tabbed": {
  "command": "node",
  "args": [
    "/Users/helix/gitrepo/playwright-mcp-tabbed/dist/index.js"
  ]
}
```

原来的官方 `playwright` server 保留不动。
