import { defineConfig } from 'wxt';

const wxtLoggerFix = {
  name: 'febrocket-wxt-console-context',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!code.includes('Wrapper around `console` with a "[wxt]" prefix')) return null;
    const patched = code.replace(
      /method\(`\[wxt\] \$\{args\.shift\(\)\}`,(\s*)\.\.\.args\);/u,
      'method.call(console, `[wxt] ${args[0]}`,$1...args.slice(1));',
    );
    if (patched === code) {
      throw new Error(`Could not apply the WXT logger compatibility fix in ${id}.`);
    }
    return patched;
  },
};

const apiOrigin = new URL(
  process.env.WXT_API_BASE_URL || 'http://localhost:8080',
).origin;

export default defineConfig({
  vite: () => ({
    plugins: [wxtLoggerFix],
  }),
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'FebRocket',
    description: 'Your intelligent document assistant and automated form filler.',
    permissions: ['sidePanel', 'activeTab', 'scripting', 'storage'],
    host_permissions: [
      `${apiOrigin}/*`,
      'https://*.googleusercontent.com/*',
      'http://*/*',
      'https://*/*',
    ],
  },
});
