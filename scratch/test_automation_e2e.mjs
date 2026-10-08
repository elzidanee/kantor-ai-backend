async function testAutomation() {
  console.log('--- TEST RUN QUICK AUTOMATION ---');
  const res = await fetch('http://localhost:3000/automations/quick-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipeKey: 'CODE_AUDIT',
      targetDirectory: 'd:/KANTOR AI ZIDANE/kantor-ai-backend/src/local-files',
      filePaths: ['d:/KANTOR AI ZIDANE/kantor-ai-backend/src/local-files/local-files.service.ts'],
      customPrompt: 'Lakukan audit keamanan dan clean code pada service pembaca file lokal terlampir. Berikan checklist kriteria dan saran rekomendasi perbaikan.',
    }),
  });
  const data = await res.json();
  console.log('QUICK RUN RESPONSE:', data);

  if (data.taskId) {
    console.log('Waiting for task processing (polling up to 40s)...');
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const t = await fetch('http://localhost:3000/office/tasks/' + data.taskId).then((r) => r.json());
      console.log(`[${(i + 1) * 2}s] Task Status: ${t.status}, Agent: ${t.agent?.name}`);
      if (t.status === 'DONE' || t.status === 'FAILED') {
        console.log('RESULT SUMMARY:', t.outputEnvelope?.summary || (t.result ? t.result.slice(0, 300) : ''));
        console.log('DELIVERABLES COUNT:', t.outputEnvelope?.deliverables?.length);
        break;
      }
    }
  }
}
testAutomation();
