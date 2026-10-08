import fs from 'fs';

const filePath = 'd:/KANTOR AI ZIDANE/kantor-ai-frontend/src/services/api.ts';
let content = fs.readFileSync(filePath, 'utf8');

const target = `  reviseTask: (id: string, feedback: string) =>
    fetchJson<any>(\`/office/tasks/\${id}/revise\`, { method: 'POST', body: JSON.stringify({ feedback }) }),`;

const replacement = `  reviseTask: (id: string, feedback: string) =>
    fetchJson<any>(\`/office/tasks/\${id}/revise\`, { method: 'POST', body: JSON.stringify({ feedback }) }),
  clarifyTask: (id: string, answer: string) =>
    fetchJson<any>(\`/office/tasks/\${id}/clarify\`, { method: 'POST', body: JSON.stringify({ answer }) }),
  unblockAllTasks: () =>
    fetchJson<any>('/office/unblock-all', { method: 'POST' }),`;

content = content.replace(target, replacement);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated api.ts with clarifyTask and unblockAllTasks!');
