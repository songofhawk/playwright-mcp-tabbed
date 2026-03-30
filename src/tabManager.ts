import { Browser, BrowserContext, Page, chromium } from 'playwright';

export class TabManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private tabs: Map<number, Page> = new Map();
  private nextIndex: number = 0;

  async ensureBrowser(): Promise<BrowserContext> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: false });
      this.context = await this.browser.newContext();
    }
    return this.context!;
  }

  async getPage(tabIndex?: number): Promise<Page> {
    // No tabs yet — create the first one
    if (this.tabs.size === 0) {
      return this.newTab();
    }

    // No index specified — return tab 0 (or the only tab)
    if (tabIndex === undefined) {
      const first = [...this.tabs.keys()].sort((a, b) => a - b)[0];
      return this.tabs.get(first)!;
    }

    const page = this.tabs.get(tabIndex);
    if (!page) {
      throw new Error(`Tab index ${tabIndex} does not exist. Available tabs: [${[...this.tabs.keys()].join(', ')}]`);
    }
    return page;
  }

  async resolveTabIndex(tabIndex?: number): Promise<number> {
    if (this.tabs.size === 0) {
      const { index } = await this.newTabAndGetIndex();
      return index;
    }

    if (tabIndex === undefined) {
      return [...this.tabs.keys()].sort((a, b) => a - b)[0];
    }

    if (!this.tabs.has(tabIndex)) {
      throw new Error(`Tab index ${tabIndex} does not exist. Available tabs: [${[...this.tabs.keys()].join(', ')}]`);
    }

    return tabIndex;
  }

  async newTab(): Promise<Page> {
    const context = await this.ensureBrowser();
    const page = await context.newPage();
    const index = this.nextIndex++;
    this.tabs.set(index, page);

    page.on('close', () => {
      this.tabs.delete(index);
    });

    return page;
  }

  async newTabAndGetIndex(): Promise<{ index: number; page: Page }> {
    const context = await this.ensureBrowser();
    const page = await context.newPage();
    const index = this.nextIndex++;
    this.tabs.set(index, page);

    page.on('close', () => {
      this.tabs.delete(index);
    });

    return { index, page };
  }

  async closeTab(tabIndex: number): Promise<void> {
    const page = this.tabs.get(tabIndex);
    if (!page) {
      throw new Error(`Tab index ${tabIndex} does not exist`);
    }
    await page.close();
    this.tabs.delete(tabIndex);
  }

  listTabs(): Array<{ index: number; url: string; title: string }> {
    return [...this.tabs.entries()].map(([index, page]) => ({
      index,
      url: page.url(),
      title: '', // title needs async call; omit for sync listing
    }));
  }

  async listTabsAsync(): Promise<Array<{ index: number; url: string; title: string }>> {
    const results = [];
    for (const [index, page] of this.tabs.entries()) {
      results.push({
        index,
        url: page.url(),
        title: await page.title(),
      });
    }
    return results;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.tabs.clear();
    }
  }
}

export const tabManager = new TabManager();
