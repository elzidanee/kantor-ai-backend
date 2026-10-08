import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const db = new PrismaClient();

async function main() {
  const goals = await db.goal.findMany({ select: { id: true, title: true, status: true, openQuestions: true } });
  console.log('GOALS COUNT:', goals.length);
  console.log('GOALS:', JSON.stringify(goals, null, 2));

  const tasks = await db.task.findMany({
    where: { status: { in: ['BLOCKED', 'NEEDS_INFO', 'REVIEW', 'FAILED'] } },
    select: { id: true, title: true, status: true, result: true }
  });
  console.log('BLOCKED/REVIEW/FAILED TASKS COUNT:', tasks.length);
  console.log('TASKS:', JSON.stringify(tasks.map(t => ({ id: t.id, title: t.title, status: t.status, hasResult: !!t.result })), null, 2));

  const agents = await db.agentPresence.findMany({
    where: { bubbleType: 'WAITING' },
    select: { agentId: true, bubbleText: true, bubbleType: true }
  });
  console.log('WAITING PRESENCES COUNT:', agents.length);
  console.log('WAITING PRESENCES:', JSON.stringify(agents, null, 2));

  await db.$disconnect();
}

main().catch(console.error);
