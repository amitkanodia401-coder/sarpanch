const fs = require('fs');
const path = require('path');
const db = require('../data/db');

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

async function exportSql() {
  await db.initDb();
  let sql = '-- ==========================================================\n';
  sql += '-- Supabase (PostgreSQL) Schema & Data for Sarpanch Portal\n';
  sql += '-- ==========================================================\n\n';

  sql += 'DROP TABLE IF EXISTS candidates, works, complaints, settings CASCADE;\n\n';

  sql += 'CREATE TABLE candidates (\n';
  sql += '  id TEXT PRIMARY KEY,\n';
  sql += '  name TEXT NOT NULL,\n';
  sql += '  party TEXT,\n';
  sql += '  partybadge TEXT,\n';
  sql += '  slogan TEXT,\n';
  sql += '  age INTEGER,\n';
  sql += '  education TEXT,\n';
  sql += '  educationdetails TEXT,\n';
  sql += '  village TEXT,\n';
  sql += '  phone TEXT,\n';
  sql += '  ward TEXT,\n';
  sql += '  photo TEXT,\n';
  sql += '  symbol TEXT,\n';
  sql += '  votes INTEGER DEFAULT 0,\n';
  sql += '  bio TEXT,\n';
  sql += '  achievements TEXT,\n';
  sql += '  promises TEXT\n';
  sql += ');\n\n';

  sql += 'CREATE TABLE works (\n';
  sql += '  id INTEGER PRIMARY KEY,\n';
  sql += '  title TEXT NOT NULL,\n';
  sql += '  scheme TEXT,\n';
  sql += '  budget BIGINT DEFAULT 0,\n';
  sql += '  spent BIGINT DEFAULT 0,\n';
  sql += '  panchayatshare BIGINT DEFAULT 0,\n';
  sql += '  balance BIGINT DEFAULT 0,\n';
  sql += '  status TEXT,\n';
  sql += '  category TEXT,\n';
  sql += '  length TEXT,\n';
  sql += '  worktype TEXT,\n';
  sql += '  contractor TEXT,\n';
  sql += '  startdate TEXT,\n';
  sql += '  enddate TEXT,\n';
  sql += '  progress INTEGER DEFAULT 0,\n';
  sql += '  image TEXT,\n';
  sql += '  description TEXT\n';
  sql += ');\n\n';

  sql += 'CREATE TABLE complaints (\n';
  sql += '  id SERIAL PRIMARY KEY,\n';
  sql += '  name TEXT,\n';
  sql += '  phone TEXT,\n';
  sql += '  ward TEXT,\n';
  sql += '  subject TEXT,\n';
  sql += '  message TEXT,\n';
  sql += "  status TEXT DEFAULT 'लंबित',\n";
  sql += '  date TEXT,\n';
  sql += '  reply TEXT\n';
  sql += ');\n\n';

  sql += 'CREATE TABLE settings (\n';
  sql += '  key TEXT PRIMARY KEY,\n';
  sql += '  value TEXT\n';
  sql += ');\n\n';

  sql += '-- Disable RLS so public website and admin panel can query and insert\n';
  sql += 'ALTER TABLE candidates DISABLE ROW LEVEL SECURITY;\n';
  sql += 'ALTER TABLE works DISABLE ROW LEVEL SECURITY;\n';
  sql += 'ALTER TABLE complaints DISABLE ROW LEVEL SECURITY;\n';
  sql += 'ALTER TABLE settings DISABLE ROW LEVEL SECURITY;\n\n';

  const candidates = db.getCandidates();
  sql += '-- Candidates Data\n';
  for (const c of candidates) {
    const ach = JSON.stringify(c.achievements || []);
    const prom = JSON.stringify(c.promises || []);
    sql += `INSERT INTO candidates (id, name, party, partybadge, slogan, age, education, educationdetails, village, phone, ward, photo, symbol, votes, bio, achievements, promises) VALUES (${escapeSql(c.id)}, ${escapeSql(c.name)}, ${escapeSql(c.party)}, ${escapeSql(c.partyBadge)}, ${escapeSql(c.slogan)}, ${c.age || 0}, ${escapeSql(c.education)}, ${escapeSql(c.educationDetails)}, ${escapeSql(c.village)}, ${escapeSql(c.phone)}, ${escapeSql(c.ward)}, ${escapeSql(c.photo)}, ${escapeSql(c.symbol)}, ${c.votes || 0}, ${escapeSql(c.bio)}, ${escapeSql(ach)}, ${escapeSql(prom)}) ON CONFLICT (id) DO NOTHING;\n`;
  }
  sql += '\n';

  const works = db.getWorks();
  sql += '-- Works Data\n';
  for (const w of works) {
    sql += `INSERT INTO works (id, title, scheme, budget, spent, panchayatshare, balance, status, category, length, worktype, contractor, startdate, enddate, progress, image, description) VALUES (${w.id}, ${escapeSql(w.title)}, ${escapeSql(w.scheme)}, ${w.budget || 0}, ${w.spent || 0}, ${w.panchayatShare || 0}, ${w.balance || 0}, ${escapeSql(w.status)}, ${escapeSql(w.category)}, ${escapeSql(w.length)}, ${escapeSql(w.workType)}, ${escapeSql(w.contractor)}, ${escapeSql(w.startDate)}, ${escapeSql(w.endDate)}, ${w.progress || 0}, ${escapeSql(w.image)}, ${escapeSql(w.description)}) ON CONFLICT (id) DO NOTHING;\n`;
  }
  sql += '\n';

  const vi = db.getVillageInfo();
  if (vi) sql += `INSERT INTO settings (key, value) VALUES ('villageInfo', ${escapeSql(JSON.stringify(vi))}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;\n`;

  const gs = db.getGramSabha();
  if (gs) sql += `INSERT INTO settings (key, value) VALUES ('gramSabha', ${escapeSql(JSON.stringify(gs))}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;\n`;

  const duties = db.getDuties();
  if (duties) sql += `INSERT INTO settings (key, value) VALUES ('duties', ${escapeSql(JSON.stringify(duties))}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;\n`;

  const outPath = path.join(__dirname, '../supabase_schema.sql');
  fs.writeFileSync(outPath, sql, 'utf8');
  console.log('Successfully generated pure lowercase schema:', outPath, 'Bytes:', sql.length);
}

exportSql();
