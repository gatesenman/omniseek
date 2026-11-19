const test = require('node:test'); const assert = require('node:assert'); const fs = require('fs'); const os = require('os'); const path = require('path');
const { SearchEngine } = require('../src/engine/engine'); const { SourceStore } = require('../src/engine/sources');
test('SourceStore loads plugin packs + js plugins + user sources', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'os-')); fs.mkdirSync(path.join(d, 'plugins'));
  for (const f of fs.readdirSync('plugins-example')) fs.copyFileSync(path.join('plugins-example', f), path.join(d, 'plugins', f));
  const e = new SearchEngine(); const st = new SourceStore(d, e);
  assert.ok(st.get('steam-site').fallback); assert.ok(st.get('plugin-wikidata').plugin); assert.strictEqual(st.categories.games, '游戏');
  st.upsert({ id: 'my-x', name: 'X', site: 'x.com' }); st.setEnabled('bing', false);
  const st2 = new SourceStore(d, e); assert.ok(st2.get('my-x').custom); assert.strictEqual(st2.get('bing').enabled, false);
  assert.ok(st2.list().length > 600);
});
