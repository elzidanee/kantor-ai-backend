import { PrismaClient } from '../dist/generated/prisma/client.js';

const prisma = new PrismaClient();

async function main() {
  const counts = await prisma.task.groupBy({
    by: ['status'],
    _count: true,
  });
  console.log('Task status counts:', counts);

  const reviewOrBlocked = await prisma.task.findMany({
    where: {
      status: { in: ['BLOCKED', 'REVIEW'] },
    },
    select: {
      id: true,
      title: true,
      status: true,
      agent: { select: { name: true } },
      outputEnvelope: true,
    },
    take: 5,
  });
  console.log('Sample Review/Blocked tasks:', JSON.stringify(reviewOrBlocked, null, 2));
}

main().finally(() => prisma.$disconnect());
