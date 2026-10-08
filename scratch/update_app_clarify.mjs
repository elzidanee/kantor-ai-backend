import fs from 'fs';

const filePath = 'd:/KANTOR AI ZIDANE/kantor-ai-frontend/src/App.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const target = `          onRevise={async (id, feedback) => {
            await api.reviseTask(id, feedback);
            loadData();
          }}`;

const replacement = `          onRevise={async (id, feedback) => {
            await api.reviseTask(id, feedback);
            loadData();
          }}
          onClarify={async (id, answer) => {
            await api.clarifyTask(id, answer);
            loadData();
          }}`;

content = content.replace(target, replacement);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated App.tsx with onClarify prop!');
