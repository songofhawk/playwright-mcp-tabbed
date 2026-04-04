#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolResult,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { tabManager } from './tabManager';
import { handleTool, toolDefinitions } from './tools';

async function main() {
  const server = new Server(
    {
      name: 'playwright-mcp-tabbed',
      version: '1.1.0',
    },
    {
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolDefinitions,
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args = {} } = request.params;
    return handleTool(name, args);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const cleanup = async () => {
    await tabManager.close();
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void cleanup();
  });

  process.on('SIGTERM', () => {
    void cleanup();
  });
}

main().catch(error => {
  process.stderr.write(`playwright-mcp-tabbed error: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
