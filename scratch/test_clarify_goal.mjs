async function testClarifyGoal() {
  const goalId = 'cmuy4w2qr00004wnsxk0lhvy5';
  console.log('Sending clarification for goal:', goalId);

  const answer = "Harga resmi Rp 28.000 per botol (bundling isi 3 Rp 75.000), pengiriman instant/same-day Jabodetabek via Paxel/Grab, peluncuran tanggal 1 November 2026, link bio: kopisenja.id/launch";

  const res = await fetch(`http://localhost:3000/office/goals/${goalId}/clarify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer })
  });

  const data = await res.json();
  console.log('Goal clarify response:', {
    goalId: data.goal?.id,
    status: data.goal?.status,
    unblockedCount: data.unblockedCount,
    blockedCount: data.blockedCount
  });
}

testClarifyGoal().catch(console.error);
