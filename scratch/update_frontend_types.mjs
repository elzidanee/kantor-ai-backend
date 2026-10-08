import fs from 'fs';

const filePath = 'd:/KANTOR AI ZIDANE/kantor-ai-frontend/src/types.ts';
let content = fs.readFileSync(filePath, 'utf8');

const additionalTypes = `
// ==================== LOCAL FILES & AUTOMATION ====================
export interface FileItemInfo {
  name: string;
  path: string;
  relativePath?: string;
  isDirectory: boolean;
  size?: number;
  extension?: string;
  updatedAt?: string;
  itemCount?: number;
}

export interface ExploreResult {
  currentPath: string;
  parentPath: string | null;
  items: FileItemInfo[];
  totalDirs: number;
  totalFiles: number;
}

export interface ReadFileResult {
  path: string;
  name: string;
  extension: string;
  content: string;
  size: number;
  totalLines: number;
  truncated: boolean;
  isBinary: boolean;
}

export interface AutomationPreset {
  key: string;
  name: string;
  description: string;
  defaultRole: string;
  icon: string;
  promptTemplate: string;
}

export interface AutomationConfig {
  id: string;
  name: string;
  recipeKey: string;
  targetDirectory: string;
  filePatterns?: string[];
  agentId?: string;
  customPrompt?: string;
  isWatching: boolean;
  lastRunAt?: string;
  lastResultSummary?: string;
  createdAt: string;
}
`;

if (!content.includes('FileItemInfo')) {
  content += additionalTypes;
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully appended types to frontend types.ts!');
} else {
  console.log('Types already present.');
}
