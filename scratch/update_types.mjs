import fs from 'fs';

const filePath = 'd:/KANTOR AI ZIDANE/kantor-ai-frontend/src/types.ts';
let content = fs.readFileSync(filePath, 'utf8');

const target = `  result?: string | null;
  revisionCount: number;`;

const replacement = `  result?: string | null;
  outputEnvelope?: any;
  error?: string | null;
  revisionCount: number;`;

content = content.replace(target, replacement);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully added outputEnvelope and error to Task interface in types.ts!');
