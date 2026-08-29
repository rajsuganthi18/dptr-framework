import { test as base, expect, Page } from '@playwright/test';
import { DPTRResolver } from './dptr-engine';

/**
 * Extend Playwright test fixtures with `dptr`.
 * This fixture monkey-patches `page.locator` per-test so actions go through DPTRResolver on failure.
 */

type Fixtures = {
  dptr: DPTRResolver;
};

export const test = base.extend<Fixtures>({
  dptr: async ({ page }, use) => {
    const dptr = new DPTRResolver();

    // Monkey-patch page.locator to wrap action methods
    // Keep original implementation
    const origLocator = (page as any).locator.bind(page);

    (page as any).locator = function (selector: string, options?: any) {
      const realLocator = origLocator(selector, options);

      // Proxy to intercept action methods such as click, fill, press, type, hover
      const handler: ProxyHandler<any> = {
        get(target, prop, receiver) {
          const orig = target[prop];
          const wrappedActions = ['click', 'dblclick', 'fill', 'press', 'type', 'hover', 'check', 'uncheck'];
          if (typeof orig === 'function' && wrappedActions.includes(prop as string)) {
            return async (...args: any[]) => {
              try {
                return await orig.apply(target, args);
              } catch (err) {
                // On error, delegate to DPTR resolver
                try {
                  return await dptr.tryRepairAndRun(page, selector, prop as string, args);
                } catch (dptrErr) {
                  // preserve original locator failure semantics
                  throw dptrErr;
                }
              }
            };
          }
          return typeof orig === 'function' ? orig.bind(target) : orig;
        },
      };

      return new Proxy(realLocator, handler);
    };

    await use(dptr);
  },
});

export { expect };
