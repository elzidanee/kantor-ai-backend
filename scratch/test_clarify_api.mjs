async function testClarify() {
  const tasksRes = await fetch('http://localhost:3000/office/tasks');
  const tasks = await tasksRes.json();
  const targetTask = tasks.find(t => t.status === 'REVIEW' || t.status === 'BLOCKED') || tasks[0];
  console.log('Selected task for testing clarify:', {
    id: targetTask.id,
    title: targetTask.title,
    currentStatus: targetTask.status
  });

  const clarifyPayload = {
    answer: "Gunakan Cloudflare Origin CA dengan auto-renew dan staging URL: https://staging.kantor-ai.internal"
  };

  const clarifyRes = await fetch(`http://localhost:3000/office/tasks/${targetTask.id}/clarify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clarifyPayload)
  });

  const result = await clarifyRes.json();
  console.log('Clarify response:', {
    id: result.id,
    title: result.title,
    status: result.status,
    revisionNotes: result.revisionNotes
  });
}

testClarify().catch(console.error);
