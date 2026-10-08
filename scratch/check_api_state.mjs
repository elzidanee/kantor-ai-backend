async function check() {
  try {
    const goalsRes = await fetch('http://localhost:3000/goals');
    const goals = await goalsRes.json();
    console.log('GOALS:', JSON.stringify(goals.map(g => ({ id: g.id, title: g.title, status: g.status, openQuestions: g.openQuestions })), null, 2));

    const stateRes = await fetch('http://localhost:3000/office/state');
    const state = await stateRes.json();
    console.log('AGENTS PRESENCE WITH BUBBLES:', JSON.stringify(
      (state.agents || []).map(a => ({ id: a.id, name: a.name, status: a.status, bubbleText: a.presence?.bubbleText, bubbleType: a.presence?.bubbleType })),
      null, 2
    ));
    console.log('TASKS COUNT:', state.tasks?.length);
    console.log('BLOCKED/REVIEW TASKS:', JSON.stringify(
      (state.tasks || []).filter(t => t.status === 'BLOCKED' || t.status === 'REVIEW' || t.status === 'FAILED')
        .map(t => ({ id: t.id, title: t.title, status: t.status, result: t.result?.slice(0, 100) })),
      null, 2
    ));
  } catch (err) {
    console.error('Error fetching API:', err.message);
  }
}

check();
