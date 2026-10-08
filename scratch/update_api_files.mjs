import fs from 'fs';

const filePath = 'd:/KANTOR AI ZIDANE/kantor-ai-frontend/src/services/api.ts';
let content = fs.readFileSync(filePath, 'utf8');

const target = `  getStats: () => fetchJson<any>('/office/stats'),
  getLogs: (limit = 20) => fetchJson<{ items: any[] }>(/office/logs?limit=\${limit}),
};`;

const replacement = `  getStats: () => fetchJson<any>('/office/stats'),
  getLogs: (limit = 20) => fetchJson<{ items: any[] }>(\`/office/logs?limit=\${limit}\`),

  // ==================== LOCAL FILES & AUTOMATION ====================
  getWorkspaces: () => fetchJson<{ name: string; path: string; description: string }[]>('/files/workspaces'),
  exploreDirectory: (path?: string) =>
    fetchJson<any>('/files/explore' + (path ? '?path=' + encodeURIComponent(path) : '')),
  readFile: (path: string, maxLines = 500) =>
    fetchJson<any>('/files/read?path=' + encodeURIComponent(path) + '&maxLines=' + maxLines),
  getDirectoryTree: (path: string, depth = 2) =>
    fetchJson<any>('/files/tree?path=' + encodeURIComponent(path) + '&depth=' + depth),

  getAutomationPresets: () => fetchJson<any[]>('/automations/presets'),
  getAutomations: () => fetchJson<any[]>('/automations'),
  getAutomationHistory: () => fetchJson<any[]>('/automations/history'),
  runQuickAutomation: (payload: {
    recipeKey: string;
    targetDirectory: string;
    filePaths?: string[];
    customPrompt?: string;
    agentId?: string;
    title?: string;
  }) => fetchJson<any>('/automations/quick-run', { method: 'POST', body: JSON.stringify(payload) }),
  toggleAutomationWatcher: (id: string, enable?: boolean) =>
    fetchJson<any>('/automations/' + id + '/toggle-watcher', {
      method: 'POST',
      body: JSON.stringify({ enable }),
    }),
};`;

// Also handle template literal in original content
if (content.includes('getStats: () => fetchJson<any>(\'/office/stats\'),')) {
  const parts = content.split('getStats: () => fetchJson<any>(\'/office/stats\'),');
  const tail = parts[1];
  const logsRegex = /getLogs:\s*\(limit\s*=\s*20\)\s*=>\s*fetchJson<[^>]+>\([^\)]+\),\s*\};/;
  content = parts[0] + 'getStats: () => fetchJson<any>(\'/office/stats\'),\n' + tail.replace(logsRegex, `getLogs: (limit = 20) => fetchJson<{ items: any[] }>(\`/office/logs?limit=\${limit}\`),

  // ==================== LOCAL FILES & AUTOMATION ====================
  getWorkspaces: () => fetchJson<{ name: string; path: string; description: string }[]>('/files/workspaces'),
  exploreDirectory: (path?: string) =>
    fetchJson<any>('/files/explore' + (path ? '?path=' + encodeURIComponent(path) : '')),
  readFile: (path: string, maxLines = 500) =>
    fetchJson<any>('/files/read?path=' + encodeURIComponent(path) + '&maxLines=' + maxLines),
  getDirectoryTree: (path: string, depth = 2) =>
    fetchJson<any>('/files/tree?path=' + encodeURIComponent(path) + '&depth=' + depth),

  getAutomationPresets: () => fetchJson<any[]>('/automations/presets'),
  getAutomations: () => fetchJson<any[]>('/automations'),
  getAutomationHistory: () => fetchJson<any[]>('/automations/history'),
  runQuickAutomation: (payload: {
    recipeKey: string;
    targetDirectory: string;
    filePaths?: string[];
    customPrompt?: string;
    agentId?: string;
    title?: string;
  }) => fetchJson<any>('/automations/quick-run', { method: 'POST', body: JSON.stringify(payload) }),
  toggleAutomationWatcher: (id: string, enable?: boolean) =>
    fetchJson<any>('/automations/' + id + '/toggle-watcher', {
      method: 'POST',
      body: JSON.stringify({ enable }),
    }),
};`);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated frontend api.ts successfully!');
} else {
  console.log('Target not found in api.ts');
}
