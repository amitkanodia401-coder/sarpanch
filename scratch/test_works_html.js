async function test() {
  const res = await fetch('http://localhost:3000/works');
  const html = await res.text();
  console.log('Has img in work-card:', html.includes('work-card-thumb'));
  console.log('Has work-card-top-bar:', html.includes('work-card-top-bar'));
  console.log('Has work-card-meta-grid:', html.includes('work-card-meta-grid'));
  const idx = html.indexOf('class="work-card work-list-item"');
  console.log('First card snippet:');
  console.log(html.substring(idx, idx + 1000));
}
test().catch(console.error);
