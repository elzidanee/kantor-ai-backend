async function checkApi() {
  const statsRes = await fetch('http://localhost:3000/office/stats');
  const stats = await statsRes.json();
  console.log('Stats:', stats);

  const goalsRes = await fetch('http://localhost:3000/office/goals');
  const goals = await goalsRes.json();
  console.log('Total goals fetched:', goals.length);
  const goalStatus = {};
  goals.forEach(g => {
    goalStatus[g.status] = (goalStatus[g.status] || 0) + 1;
  });
  console.log('Goal status breakdown:', goalStatus);
  const needsClarif = goals.filter(g => g.status === 'NEEDS_CLARIFICATION');
  console.log('Goals needing clarification:', needsClarif.length);
  if (needsClarif.length > 0) {
    console.log('Sample clarification goals:', needsClarif.slice(0, 3).map(g => ({
      id: g.id,
      text: g.text,
      openQuestions: g.openQuestions
    })));
  }
  
  const statusMap = {};
  tasks.forEach(t => {
    statusMap[t.status] = (statusMap[t.status] || 0) + 1;
  });
  console.log('Status breakdown:', statusMap);

  const blockedOrReview = tasks.filter(t => t.status === 'BLOCKED' || t.status === 'REVIEW');
  console.log('Blocked/Review tasks count:', blockedOrReview.length);
  if (blockedOrReview.length > 0) {
    console.log('Sample Blocked/Review:', blockedOrReview.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      agent: t.agent?.name,
      questions: t.outputEnvelope?.open_questions,
      needsReview: t.needsReview
    })));
  }
}

checkApi().catch(console.error);
