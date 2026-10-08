import fs from 'fs';

const filePath = 'd:/KANTOR AI ZIDANE/kantor-ai-frontend/src/App.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add AutomationSection import
if (!content.includes('AutomationSection')) {
  content = content.replace(
    "import { TaskOutputModal } from './components/TaskOutputModal';",
    "import { TaskOutputModal } from './components/TaskOutputModal';\nimport { AutomationSection } from './components/AutomationSection';"
  );
}

// 2. Add Bot to lucide-react imports
if (!content.includes('Bot,')) {
  content = content.replace(
    "import { LayoutGrid, Target, Kanban, BarChart3, FileCode, Sparkles } from 'lucide-react';",
    "import { LayoutGrid, Target, Kanban, BarChart3, FileCode, Sparkles, Bot } from 'lucide-react';"
  );
}

// 3. Update activeTab type
content = content.replace(
  "const [activeTab, setActiveTab] = useState<'MAP' | 'GOALS' | 'KANBAN' | 'STATS'>('MAP');",
  "const [activeTab, setActiveTab] = useState<'MAP' | 'GOALS' | 'KANBAN' | 'STATS' | 'AUTOMATION'>('MAP');"
);

// 4. Add Tab Button
const kanbanTabTarget = `          <button
            onClick={() => setActiveTab('KANBAN')}
            className={\`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all \${
              activeTab === 'KANBAN'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900/90 text-slate-400 hover:text-white hover:bg-slate-800'
            }\`}
          >
            <Kanban className="w-3.5 h-3.5" />
            <span>Kanban Board Tugas</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-300 font-bold border border-slate-700">
              {tasks.length}
            </span>
            {reviewCount > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-amber-500 text-slate-950 font-black animate-pulse">
                {reviewCount} Review
              </span>
            )}
          </button>`;

const newAutomationButton = `\n\n          <button
            onClick={() => setActiveTab('AUTOMATION')}
            className={\`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all \${
              activeTab === 'AUTOMATION'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900/90 text-slate-400 hover:text-white hover:bg-slate-800'
            }\`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Otomasi & File</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
              Auto
            </span>
          </button>`;

if (content.includes(kanbanTabTarget) && !content.includes("setActiveTab('AUTOMATION')")) {
  content = content.replace(kanbanTabTarget, kanbanTabTarget + newAutomationButton);
}

// 5. Add Main Section Tab
const statsTabTarget = `{activeTab === 'STATS' && <ActivityStream logs={logs} stats={stats} />}`;
const newAutomationRender = `{activeTab === 'AUTOMATION' && (
          <AutomationSection
            agents={agents}
            tasks={tasks}
            onRefresh={loadData}
            onInspectTask={(task) => setInspectingTask(task)}
          />
        )}
        ` + statsTabTarget;

if (content.includes(statsTabTarget) && !content.includes("<AutomationSection")) {
  content = content.replace(statsTabTarget, newAutomationRender);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('App.tsx successfully updated with Automation tab!');
