import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tabManager } from './tabManager';

const NO_TAB_TOOLS = new Set([
  'browser_tabs',
  'browser_close',
  'browser_install',
  'browser_context_info',
]);

function parseOrigin(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function resolveNavigateUrl(url: string, baseUrl?: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('about:') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  const envBase = process.env.PLAYWRIGHT_MCP_BASE_URL?.trim();
  const base = (baseUrl ?? envBase ?? '').replace(/\/$/, '');
  if (trimmed.startsWith('/') && base) {
    return `${base}${trimmed}`;
  }
  if (trimmed.startsWith('/') && !base) {
    throw new Error(
      'Relative URL requires a base: pass base_url on browser_navigate or set env PLAYWRIGHT_MCP_BASE_URL (e.g. http://127.0.0.1:3000).'
    );
  }
  return trimmed;
}

async function resolveToolTab(args: Record<string, unknown>): Promise<number> {
  const tabIdRaw = args.tab_id;
  const hasTabId =
    tabIdRaw !== undefined && tabIdRaw !== null && String(tabIdRaw).trim() !== '';
  if (hasTabId) {
    if (args.tab_index !== undefined) {
      throw new Error('Pass either tab_index or tab_id, not both.');
    }
    return tabManager.resolveTabId(String(tabIdRaw));
  }
  return tabManager.resolveTabIndex(args.tab_index as number | undefined);
}

// ─── Type helpers ────────────────────────────────────────────────────────────

type TextContent = { type: 'text'; text: string };
type ImageContent = { type: 'image'; data: string; mimeType: string };
type ToolContent = TextContent | ImageContent;

type ToolResult = CallToolResult & {
  content: ToolContent[];
};

const execFileAsync = promisify(execFile);

function ok(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

function err(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function stringifyResult(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined) {
    return 'undefined';
  }
  return JSON.stringify(value, null, 2);
}

// ─── Tab reference schema (shared across tools) ───────────────────────────────

const tabRefProps = {
  tab_index: {
    type: 'number',
    description:
      'Tab index from browser_tabs list. If omitted, uses the lowest-index tab. Mutually exclusive with tab_id.',
  },
  tab_id: {
    type: 'string',
    description:
      'Stable tab id from browser_tabs list; preferred when multiple agents run in parallel. Mutually exclusive with tab_index.',
  },
};

// ─── Tool definitions ────────────────────────────────────────────────────────

export const toolDefinitions: Tool[] = [
  {
    name: 'browser_tabs',
    description: 'List, create, or close browser tabs.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'new', 'close'],
          description:
            'list: all tabs with index, tab_id, label, url, title. new: blank tab (returns index + tab_id). close: close by index.',
        },
        index: { type: 'number', description: 'Tab index to close (required for close action).' },
        label: {
          type: 'string',
          description: 'Optional label for the new tab (action new only); shown in list for parallel agent bookkeeping.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'browser_context_info',
    description:
      'Describe the shared browser context: all tabs, origins, and a note that cookies/storage are per-origin (localhost vs 127.0.0.1 are different).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_navigate',
    description:
      'Navigate to a URL in the specified tab. Relative paths like /foo require base_url or PLAYWRIGHT_MCP_BASE_URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute URL, or path starting with / if base_url / env base is set.' },
        base_url: {
          type: 'string',
          description:
            'Optional origin for relative URLs (e.g. http://127.0.0.1:3000). Overrides PLAYWRIGHT_MCP_BASE_URL for this call.',
        },
        wait_until: {
          type: 'string',
          enum: ['domcontentloaded', 'load', 'networkidle'],
          description: 'When navigation is considered done (default: domcontentloaded).',
        },
        timeout: { type: 'number', description: 'Navigation timeout in ms (default: 30000).' },
        ...tabRefProps,
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_snapshot',
    description:
      'Accessibility snapshot (structured DOM text). Use root_selector to narrow scope; max_chars avoids huge MCP payloads.',
    inputSchema: {
      type: 'object',
      properties: {
        root_selector: {
          type: 'string',
          description: 'CSS selector for the subtree to snapshot (default: body).',
        },
        max_chars: {
          type: 'number',
          description: 'If set, truncate snapshot to this many characters and append a notice.',
        },
        ...tabRefProps,
      },
    },
  },
  {
    name: 'browser_take_screenshot',
    description: 'Take a screenshot of the specified tab. Returns a base64 PNG image.',
    inputSchema: {
      type: 'object',
      properties: {
        full_page: { type: 'boolean', description: 'Capture full page (default: false).' },
        ...tabRefProps,
      },
    },
  },
  {
    name: 'browser_run_code',
    description: 'Run a Playwright JavaScript function against the specified tab.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'A JavaScript function body or arrow function. It will receive page as the first argument.',
        },
        ...tabRefProps,
      },
      required: ['code'],
    },
  },
  {
    name: 'browser_click',
    description:
      'Click an element. Use force:true to bypass actionability checks when overlays block; trial:true to verify hit target without clicking.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or text selector (e.g. "text=Submit").' },
        timeout: { type: 'number', description: 'Max wait for element in ms (Playwright default applies if omitted).' },
        force: { type: 'boolean', description: 'If true, skip actionability checks (e.g. covered by overlay).' },
        trial: { type: 'boolean', description: 'If true, perform a trial click without actually clicking.' },
        ...tabRefProps,
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into a focused or selected input element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the input element.' },
        text: { type: 'string', description: 'Text to type.' },
        clear_first: { type: 'boolean', description: 'Clear existing text before typing (default: false).' },
        ...tabRefProps,
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'browser_fill_form',
    description: 'Fill multiple form fields at once.',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          description: 'List of {selector, value} pairs.',
          items: {
            type: 'object',
            properties: {
              selector: { type: 'string' },
              value: { type: 'string' },
            },
            required: ['selector', 'value'],
          },
        },
        ...tabRefProps,
      },
      required: ['fields'],
    },
  },
  {
    name: 'browser_file_upload',
    description: 'Upload one or multiple files in the specified tab.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          description: 'Absolute paths to files. If omitted, cancels the file chooser or clears the input.',
          items: {
            type: 'string',
          },
        },
        ...tabRefProps,
      },
    },
  },
  {
    name: 'browser_hover',
    description: 'Hover over an element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to hover.' },
        ...tabRefProps,
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_select_option',
    description: 'Select an option in a <select> element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the <select> element.' },
        value: { type: 'string', description: 'Option value or label to select.' },
        ...tabRefProps,
      },
      required: ['selector', 'value'],
    },
  },
  {
    name: 'browser_press_key',
    description: 'Press a keyboard key.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key to press, e.g. "Enter", "Escape", "Tab", "ArrowDown".' },
        ...tabRefProps,
      },
      required: ['key'],
    },
  },
  {
    name: 'browser_wait_for',
    description: 'Wait for a selector to appear or disappear, or wait for navigation.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to wait for.' },
        state: {
          type: 'string',
          enum: ['visible', 'hidden', 'attached', 'detached'],
          description: 'State to wait for (default: visible).',
        },
        timeout: { type: 'number', description: 'Max wait time in ms (default: 10000).' },
        ...tabRefProps,
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_evaluate',
    description: 'Execute JavaScript in the page context and return the result.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute. Can return a value.' },
        ...tabRefProps,
      },
      required: ['code'],
    },
  },
  {
    name: 'browser_navigate_back',
    description: 'Navigate back in history.',
    inputSchema: {
      type: 'object',
      properties: { ...tabRefProps },
    },
  },
  {
    name: 'browser_network_requests',
    description: 'List recent network requests captured for this tab (since tracking started).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max number of entries from the end of the log (default: 50).' },
        url_contains: { type: 'string', description: 'If set, only return requests whose URL includes this substring.' },
        ...tabRefProps,
      },
    },
  },
  {
    name: 'browser_console_messages',
    description: 'Get console messages (log, warn, error) from the page.',
    inputSchema: {
      type: 'object',
      properties: { ...tabRefProps },
    },
  },
  {
    name: 'browser_resize',
    description: 'Resize the browser viewport.',
    inputSchema: {
      type: 'object',
      properties: {
        width: { type: 'number', description: 'Viewport width in pixels.' },
        height: { type: 'number', description: 'Viewport height in pixels.' },
        ...tabRefProps,
      },
      required: ['width', 'height'],
    },
  },
  {
    name: 'browser_drag',
    description: 'Drag from one element to another.',
    inputSchema: {
      type: 'object',
      properties: {
        source_selector: { type: 'string', description: 'CSS selector of element to drag from.' },
        target_selector: { type: 'string', description: 'CSS selector of element to drag to.' },
        ...tabRefProps,
      },
      required: ['source_selector', 'target_selector'],
    },
  },
  {
    name: 'browser_handle_dialog',
    description: 'Set up handling for the next browser dialog (alert/confirm/prompt).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['accept', 'dismiss'],
          description: 'Whether to accept or dismiss the dialog.',
        },
        prompt_text: { type: 'string', description: 'Text to enter if the dialog is a prompt.' },
        ...tabRefProps,
      },
      required: ['action'],
    },
  },
  {
    name: 'browser_close',
    description: 'Close the browser entirely and clean up all resources.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_install',
    description: 'Install Chromium used by this MCP server.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ─── Tool handler ─────────────────────────────────────────────────────────────

// Per-tab network request and console message collectors
const networkRequests = new Map<number, Array<{ method: string; url: string; status: number | null }>>();
const consoleMessages = new Map<number, Array<{ type: string; text: string }>>();

async function ensureTabTracking(tabIndex: number) {
  const page = await tabManager.getPage(tabIndex);

  if (!networkRequests.has(tabIndex)) {
    networkRequests.set(tabIndex, []);
    page.on('request', req => {
      networkRequests.get(tabIndex)?.push({ method: req.method(), url: req.url(), status: null });
    });
    page.on('response', res => {
      const requests = networkRequests.get(tabIndex);
      if (!requests) return;
      const entry = [...requests].reverse().find(r => r.url === res.url() && r.status === null);
      if (entry) entry.status = res.status();
    });
  }

  if (!consoleMessages.has(tabIndex)) {
    consoleMessages.set(tabIndex, []);
    page.on('console', msg => {
      consoleMessages.get(tabIndex)?.push({ type: msg.type(), text: msg.text() });
    });
  }
}

export async function handleTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    let resolvedTabIndex: number | undefined;
    if (!NO_TAB_TOOLS.has(name)) {
      resolvedTabIndex = await resolveToolTab(args);
    }

    switch (name) {

      // ── browser_tabs ──────────────────────────────────────────────────────
      case 'browser_tabs': {
        const action = args.action as string;
        if (action === 'list') {
          const tabs = await tabManager.listTabsAsync();
          return ok(JSON.stringify(tabs, null, 2));
        }
        if (action === 'new') {
          const label = args.label as string | undefined;
          const { index, tab_id } = await tabManager.newTabAndGetIndex(label);
          await ensureTabTracking(index);
          return ok(`Created new tab with index ${index}, tab_id ${tab_id}`);
        }
        if (action === 'close') {
          const index = args.index as number;
          await tabManager.closeTab(index);
          networkRequests.delete(index);
          consoleMessages.delete(index);
          return ok(`Closed tab ${index}`);
        }
        return err(`Unknown browser_tabs action: ${action}`);
      }

      // ── browser_context_info ───────────────────────────────────────────────
      case 'browser_context_info': {
        const tabs = await tabManager.listTabsAsync();
        const origins = [...new Set(tabs.map(t => parseOrigin(t.url)).filter((o): o is string => Boolean(o)))];
        const payload = {
          shared_browser_context: true,
          note:
            'All tabs share one BrowserContext. Cookies and localStorage are per-origin (scheme + host + port). http://localhost:3000 and http://127.0.0.1:3000 (or 127.0.2.2) are different origins — use one host consistently or log in on each.',
          env_PLAYWRIGHT_MCP_BASE_URL: process.env.PLAYWRIGHT_MCP_BASE_URL ?? null,
          distinct_origins: origins,
          tabs: tabs.map(t => ({
            index: t.index,
            tab_id: t.tab_id,
            label: t.label,
            url: t.url,
            title: t.title,
            origin: parseOrigin(t.url),
          })),
        };
        return ok(JSON.stringify(payload, null, 2));
      }

      // ── browser_navigate ──────────────────────────────────────────────────
      case 'browser_navigate': {
        const page = await tabManager.getPage(resolvedTabIndex);
        await ensureTabTracking(resolvedTabIndex!);
        const baseUrl = args.base_url as string | undefined;
        const resolvedUrl = resolveNavigateUrl(args.url as string, baseUrl);
        const waitUntil =
          (args.wait_until as 'domcontentloaded' | 'load' | 'networkidle' | undefined) ?? 'domcontentloaded';
        const timeout = (args.timeout as number | undefined) ?? 30000;
        await page.goto(resolvedUrl, { waitUntil, timeout });
        return ok(`Navigated to ${resolvedUrl} (tab ${resolvedTabIndex})`);
      }

      // ── browser_snapshot ─────────────────────────────────────────────────
      case 'browser_snapshot': {
        const page = await tabManager.getPage(resolvedTabIndex);
        const root = (args.root_selector as string | undefined)?.trim() || 'body';
        const locator = page.locator(root);
        const count = await locator.count();
        if (count === 0) {
          throw new Error(`browser_snapshot: no element matches root_selector "${root}"`);
        }
        const snapshot = await locator.first().ariaSnapshot();
        let text = snapshot;
        const maxChars = args.max_chars as number | undefined;
        if (maxChars !== undefined && maxChars > 0 && text.length > maxChars) {
          text =
            text.slice(0, maxChars) +
            `\n\n... [snapshot truncated: ${snapshot.length} chars total, max_chars=${maxChars}]`;
        }
        return ok(text);
      }

      // ── browser_take_screenshot ───────────────────────────────────────────
      case 'browser_take_screenshot': {
        const page = await tabManager.getPage(resolvedTabIndex);
        const fullPage = args.full_page as boolean | undefined;
        const buffer = await page.screenshot({ fullPage: fullPage ?? false });
        const base64 = buffer.toString('base64');
        return {
          content: [{ type: 'image', data: base64, mimeType: 'image/png' }],
        };
      }

      // ── browser_run_code ─────────────────────────────────────────────────
      case 'browser_run_code': {
        const page = await tabManager.getPage(resolvedTabIndex);
        const code = args.code as string;
        const runnable = code.includes('=>') || code.trim().startsWith('function')
          ? code
          : `async (page) => { ${code} }`;
        const fn = new Function(`return (${runnable});`)() as (page: unknown) => Promise<unknown> | unknown;
        const result = await fn(page);
        return ok(stringifyResult(result));
      }

      // ── browser_click ────────────────────────────────────────────────────
      case 'browser_click': {
        const page = await tabManager.getPage(resolvedTabIndex);
        const selector = args.selector as string;
        const clickOpts: { timeout?: number; force?: boolean; trial?: boolean } = {};
        if (args.timeout !== undefined) clickOpts.timeout = args.timeout as number;
        if (args.force !== undefined) clickOpts.force = args.force as boolean;
        if (args.trial !== undefined) clickOpts.trial = args.trial as boolean;
        await page.click(selector, clickOpts);
        return ok(`Clicked "${selector}" (tab ${resolvedTabIndex})`);
      }

      // ── browser_type ─────────────────────────────────────────────────────
      case 'browser_type': {
        const page = await tabManager.getPage(resolvedTabIndex);
        const selector = args.selector as string;
        const text = args.text as string;
        const clearFirst = args.clear_first as boolean | undefined;
        if (clearFirst) {
          await page.fill(selector, '');
        }
        await page.type(selector, text);
        return ok(`Typed into "${selector}" (tab ${resolvedTabIndex})`);
      }

      // ── browser_fill_form ────────────────────────────────────────────────
      case 'browser_fill_form': {
        const page = await tabManager.getPage(resolvedTabIndex);
        const fields = args.fields as Array<{ selector: string; value: string }>;
        for (const { selector, value } of fields) {
          await page.fill(selector, value);
        }
        return ok(`Filled ${fields.length} form field(s) (tab ${resolvedTabIndex})`);
      }

      // ── browser_file_upload ──────────────────────────────────────────────
      case 'browser_file_upload': {
        const page = await tabManager.getPage(resolvedTabIndex);
        const paths = args.paths as string[] | undefined;

        const fileInputs = page.locator('input[type="file"]');
        if (await fileInputs.count()) {
          await fileInputs.last().setInputFiles(paths ?? []);
          return ok(
            paths?.length
              ? `Uploaded ${paths.length} file(s) via file input (tab ${resolvedTabIndex})`
              : `Cleared file input selection (tab ${resolvedTabIndex})`
          );
        }

        try {
          const chooser = await page.waitForEvent('filechooser', { timeout: 3000 });
          await chooser.setFiles(paths ?? []);
          return ok(
            paths?.length
              ? `Uploaded ${paths.length} file(s) via file chooser (tab ${resolvedTabIndex})`
              : `Cancelled file chooser (tab ${resolvedTabIndex})`
          );
        } catch {
          throw new Error('No file input or pending file chooser found. Trigger the upload control first.');
        }
      }

      // ── browser_hover ────────────────────────────────────────────────────
      case 'browser_hover': {
        const page = await tabManager.getPage(resolvedTabIndex);
        await page.hover(args.selector as string);
        return ok(`Hovered "${args.selector}" (tab ${resolvedTabIndex})`);
      }

      // ── browser_select_option ────────────────────────────────────────────
      case 'browser_select_option': {
        const page = await tabManager.getPage(resolvedTabIndex);
        const selector = args.selector as string;
        const value = args.value as string;
        await page.selectOption(selector, { label: value }).catch(() =>
          page.selectOption(selector, { value })
        );
        return ok(`Selected "${value}" in "${selector}" (tab ${resolvedTabIndex})`);
      }

      // ── browser_press_key ────────────────────────────────────────────────
      case 'browser_press_key': {
        const page = await tabManager.getPage(resolvedTabIndex);
        await page.keyboard.press(args.key as string);
        return ok(`Pressed key "${args.key}" (tab ${resolvedTabIndex})`);
      }

      // ── browser_wait_for ─────────────────────────────────────────────────
      case 'browser_wait_for': {
        const page = await tabManager.getPage(resolvedTabIndex);
        const state = (args.state as 'visible' | 'hidden' | 'attached' | 'detached') ?? 'visible';
        const timeout = (args.timeout as number) ?? 10000;
        await page.waitForSelector(args.selector as string, { state, timeout });
        return ok(`Selector "${args.selector}" is now ${state} (tab ${resolvedTabIndex})`);
      }

      // ── browser_evaluate ─────────────────────────────────────────────────
      case 'browser_evaluate': {
        const page = await tabManager.getPage(resolvedTabIndex);
        const result = await page.evaluate(args.code as string);
        return ok(JSON.stringify(result, null, 2));
      }

      // ── browser_navigate_back ────────────────────────────────────────────
      case 'browser_navigate_back': {
        const page = await tabManager.getPage(resolvedTabIndex);
        await page.goBack();
        return ok(`Navigated back (tab ${resolvedTabIndex})`);
      }

      // ── browser_network_requests ─────────────────────────────────────────
      case 'browser_network_requests': {
        let requests = networkRequests.get(resolvedTabIndex!) ?? [];
        const urlContains = args.url_contains as string | undefined;
        if (urlContains) {
          requests = requests.filter(r => r.url.includes(urlContains));
        }
        const limit = (args.limit as number | undefined) ?? 50;
        return ok(JSON.stringify(requests.slice(-limit), null, 2));
      }

      // ── browser_console_messages ─────────────────────────────────────────
      case 'browser_console_messages': {
        const messages = consoleMessages.get(resolvedTabIndex!) ?? [];
        return ok(JSON.stringify(messages.slice(-50), null, 2));
      }

      // ── browser_resize ───────────────────────────────────────────────────
      case 'browser_resize': {
        const page = await tabManager.getPage(resolvedTabIndex);
        await page.setViewportSize({
          width: args.width as number,
          height: args.height as number,
        });
        return ok(`Resized viewport to ${args.width}x${args.height} (tab ${resolvedTabIndex})`);
      }

      // ── browser_drag ─────────────────────────────────────────────────────
      case 'browser_drag': {
        const page = await tabManager.getPage(resolvedTabIndex);
        await page.dragAndDrop(args.source_selector as string, args.target_selector as string);
        return ok(`Dragged from "${args.source_selector}" to "${args.target_selector}" (tab ${resolvedTabIndex})`);
      }

      // ── browser_handle_dialog ────────────────────────────────────────────
      case 'browser_handle_dialog': {
        const page = await tabManager.getPage(resolvedTabIndex);
        const action = args.action as 'accept' | 'dismiss';
        const promptText = args.prompt_text as string | undefined;
        page.once('dialog', async dialog => {
          if (action === 'accept') {
            await dialog.accept(promptText);
          } else {
            await dialog.dismiss();
          }
        });
        return ok(`Dialog handler set to "${action}" (tab ${resolvedTabIndex})`);
      }

      // ── browser_close ────────────────────────────────────────────────────
      case 'browser_close': {
        await tabManager.close();
        networkRequests.clear();
        consoleMessages.clear();
        return ok('Browser closed.');
      }

      // ── browser_install ──────────────────────────────────────────────────
      case 'browser_install': {
        const cliPath = require.resolve('playwright/cli');
        const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, 'install', 'chromium'], {
          cwd: process.cwd(),
          env: process.env,
        });
        return ok(`Installed Chromium.\n${[stdout, stderr].filter(Boolean).join('\n').trim()}`);
      }

      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`Tool "${name}" failed: ${message}`);
  }
}
