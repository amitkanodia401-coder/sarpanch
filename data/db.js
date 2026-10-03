const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const dbFilePath = path.resolve(process.env.DB_FILE || path.join(__dirname, 'sarpanch.sqlite'));
const jsonSeedPath = path.join(__dirname, 'db.json');

let sqlDb = null;

// Save SQLite database binary buffer to disk
function saveSqlToFile() {
  try {
    if (!sqlDb) return false;
    const binaryArray = sqlDb.export();
    const buffer = Buffer.from(binaryArray);
    const dir = path.dirname(dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(dbFilePath, buffer);
    return true;
  } catch (err) {
    console.error('Error saving SQLite database file:', err);
    return false;
  }
}

// Helper to map SQL results (columns + values) to Array of Objects
function rowsToObjects(columns, values) {
  if (!columns || !values) return [];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

// Safe JSON parser helper
function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  if (Array.isArray(str)) return str;
  try {
    return JSON.parse(str);
  } catch {
    return typeof str === 'string' ? str.split('\n').map(s => s.trim()).filter(Boolean) : fallback;
  }
}

// Initialize SQLite database
async function initDb() {
  if (sqlDb) return sqlDb;

  const SQL = await initSqlJs();

  if (fs.existsSync(dbFilePath)) {
    try {
      const fileBuffer = fs.readFileSync(dbFilePath);
      sqlDb = new SQL.Database(fileBuffer);
    } catch (err) {
      console.warn('Could not read existing SQLite file, creating new one:', err.message);
      sqlDb = new SQL.Database();
    }
  } else {
    sqlDb = new SQL.Database();
  }

  // Create SQL Tables
  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      party TEXT,
      partyBadge TEXT,
      slogan TEXT,
      age INTEGER,
      education TEXT,
      educationDetails TEXT,
      village TEXT,
      phone TEXT,
      ward TEXT,
      photo TEXT,
      symbol TEXT,
      votes INTEGER DEFAULT 0,
      bio TEXT,
      achievements TEXT,
      promises TEXT
    );

    CREATE TABLE IF NOT EXISTS works (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      scheme TEXT,
      budget INTEGER,
      spent INTEGER,
      panchayatShare INTEGER,
      balance INTEGER,
      status TEXT,
      category TEXT,
      length TEXT,
      workType TEXT,
      contractor TEXT,
      startDate TEXT,
      endDate TEXT,
      progress INTEGER,
      image TEXT,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY,
      name TEXT,
      phone TEXT,
      ward TEXT,
      subject TEXT,
      message TEXT,
      status TEXT,
      date TEXT,
      reply TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migrate works table columns if not present
  const extraWorkCols = [
    'workCode TEXT',
    'sanctionNo TEXT',
    'location TEXT',
    'sarpanchSign TEXT',
    'secretarySign TEXT',
    'vouchers TEXT',
    'documents TEXT'
  ];
  extraWorkCols.forEach(col => {
    try {
      sqlDb.run(`ALTER TABLE works ADD COLUMN ${col};`);
    } catch (e) {
      // Column may already exist
    }
  });

  // Check if tables need initial seeding from db.json
  const candCountRes = sqlDb.exec('SELECT COUNT(*) FROM candidates');
  const candCount = (candCountRes[0] && candCountRes[0].values[0][0]) || 0;

  if (candCount === 0 && fs.existsSync(jsonSeedPath)) {
    try {
      const seedData = JSON.parse(fs.readFileSync(jsonSeedPath, 'utf8'));

      // Seed Candidates
      if (Array.isArray(seedData.candidates)) {
        const stmt = sqlDb.prepare(`
          INSERT INTO candidates (id, name, party, partyBadge, slogan, age, education, educationDetails, village, phone, ward, photo, symbol, votes, bio, achievements, promises)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        seedData.candidates.forEach(c => {
          stmt.run([
            c.id, c.name, c.party, c.partyBadge, c.slogan,
            Number(c.age) || 35, c.education, c.educationDetails,
            c.village, c.phone, c.ward, c.photo, c.symbol,
            Number(c.votes) || 0, c.bio,
            JSON.stringify(c.achievements || []),
            JSON.stringify(c.promises || [])
          ]);
        });
        stmt.free();
      }

      // Seed Works
      if (Array.isArray(seedData.works)) {
        const stmt = sqlDb.prepare(`
          INSERT INTO works (id, title, scheme, budget, spent, panchayatShare, balance, status, category, length, workType, contractor, startDate, endDate, progress, image, description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        seedData.works.forEach(w => {
          stmt.run([
            Number(w.id), w.title, w.scheme, Number(w.budget) || 0, Number(w.spent) || 0,
            Number(w.panchayatShare) || 0, Number(w.balance) || 0, w.status, w.category,
            w.length, w.workType, w.contractor, w.startDate, w.endDate,
            Number(w.progress) || 0, w.image, w.description
          ]);
        });
        stmt.free();
      }

      // Seed Complaints
      if (Array.isArray(seedData.complaints)) {
        const stmt = sqlDb.prepare(`
          INSERT INTO complaints (id, name, phone, ward, subject, message, status, date, reply)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        seedData.complaints.forEach(comp => {
          stmt.run([
            Number(comp.id), comp.name, comp.phone, comp.ward, comp.subject,
            comp.message, comp.status, comp.date, comp.reply || ''
          ]);
        });
        stmt.free();
      }

      // Seed Settings (villageInfo, stats, duties, activities)
      const setStmt = sqlDb.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      if (seedData.villageInfo) setStmt.run(['villageInfo', JSON.stringify(seedData.villageInfo)]);
      if (seedData.stats) setStmt.run(['stats', JSON.stringify(seedData.stats)]);
      if (seedData.duties) setStmt.run(['duties', JSON.stringify(seedData.duties)]);
      if (seedData.activities) setStmt.run(['activities', JSON.stringify(seedData.activities)]);
      setStmt.free();

      saveSqlToFile();
    } catch (seedErr) {
      console.error('Error seeding data into SQLite database:', seedErr);
    }
  } else {
    saveSqlToFile();
  }

  return sqlDb;
}

// Ensure database is initialized before any query
function ensureDb() {
  if (!sqlDb) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
}

// ----------------------------------------------------
// CANDIDATES (SQL Queries)
// ----------------------------------------------------
function formatCandidateRow(row) {
  if (!row) return null;
  return {
    ...row,
    achievements: safeJsonParse(row.achievements, []),
    promises: safeJsonParse(row.promises, [])
  };
}

function getCandidates() {
  ensureDb();
  const res = sqlDb.exec('SELECT * FROM candidates ORDER BY votes DESC');
  if (!res.length) return [];
  const rows = rowsToObjects(res[0].columns, res[0].values);
  return rows.map(formatCandidateRow);
}

function getCandidateById(id) {
  ensureDb();
  const stmt = sqlDb.prepare('SELECT * FROM candidates WHERE id = ?');
  stmt.bind([String(id)]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return formatCandidateRow(row);
  }
  stmt.free();
  return null;
}

function addCandidate(candidate) {
  ensureDb();
  const newId = candidate.id || 'cand-' + Date.now();
  const villageInfo = getVillageInfo();
  const villageName = villageInfo?.name || 'मेरा गाँव';

  const achievements = Array.isArray(candidate.achievements)
    ? candidate.achievements
    : (candidate.achievements ? candidate.achievements.split('\n').map(s => s.trim()).filter(Boolean) : []);

  const promises = Array.isArray(candidate.promises)
    ? candidate.promises
    : (candidate.promises ? candidate.promises.split('\n').map(s => s.trim()).filter(Boolean) : []);

  const newCand = {
    id: newId,
    name: candidate.name,
    party: candidate.party || 'निर्दलीय',
    partyBadge: candidate.partyBadge || 'IND',
    slogan: candidate.slogan || '',
    age: Number(candidate.age) || 35,
    education: candidate.education || '',
    educationDetails: candidate.educationDetails || candidate.education || '',
    village: candidate.village || villageName,
    phone: candidate.phone || '',
    ward: candidate.ward || 'वार्ड 1',
    photo: candidate.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=360&h=360&fit=crop&crop=face',
    symbol: candidate.symbol || 'कलम',
    votes: Number(candidate.votes) || 0,
    bio: candidate.bio || '',
    achievements: JSON.stringify(achievements),
    promises: JSON.stringify(promises)
  };

  const stmt = sqlDb.prepare(`
    INSERT INTO candidates (id, name, party, partyBadge, slogan, age, education, educationDetails, village, phone, ward, photo, symbol, votes, bio, achievements, promises)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    newCand.id, newCand.name, newCand.party, newCand.partyBadge, newCand.slogan,
    newCand.age, newCand.education, newCand.educationDetails, newCand.village,
    newCand.phone, newCand.ward, newCand.photo, newCand.symbol, newCand.votes,
    newCand.bio, newCand.achievements, newCand.promises
  ]);
  stmt.free();

  saveSqlToFile();
  return getCandidateById(newId);
}

function updateCandidate(id, updateData) {
  ensureDb();
  const current = getCandidateById(id);
  if (!current) return null;

  const photo = (updateData.photo && updateData.photo.trim()) ? updateData.photo.trim() : current.photo;
  const age = updateData.age !== undefined && updateData.age !== '' ? Number(updateData.age) : current.age;
  const votes = updateData.votes !== undefined && updateData.votes !== '' ? Number(updateData.votes) : current.votes;

  let achievements = current.achievements;
  if (typeof updateData.achievements === 'string') {
    achievements = updateData.achievements.split('\n').map(s => s.trim()).filter(Boolean);
  } else if (Array.isArray(updateData.achievements)) {
    achievements = updateData.achievements;
  }

  let promises = current.promises;
  if (typeof updateData.promises === 'string') {
    promises = updateData.promises.split('\n').map(s => s.trim()).filter(Boolean);
  } else if (Array.isArray(updateData.promises)) {
    promises = updateData.promises;
  }

  const updated = {
    name: updateData.name || current.name,
    party: updateData.party || current.party,
    partyBadge: updateData.partyBadge !== undefined ? updateData.partyBadge : current.partyBadge,
    slogan: updateData.slogan !== undefined ? updateData.slogan : current.slogan,
    age,
    education: updateData.education !== undefined ? updateData.education : current.education,
    educationDetails: updateData.educationDetails !== undefined ? updateData.educationDetails : current.educationDetails,
    village: updateData.village !== undefined ? updateData.village : current.village,
    phone: updateData.phone !== undefined ? updateData.phone : current.phone,
    ward: updateData.ward !== undefined ? updateData.ward : current.ward,
    photo,
    symbol: updateData.symbol !== undefined ? updateData.symbol : current.symbol,
    votes,
    bio: updateData.bio !== undefined ? updateData.bio : current.bio,
    achievements: JSON.stringify(achievements),
    promises: JSON.stringify(promises)
  };

  const stmt = sqlDb.prepare(`
    UPDATE candidates SET
      name=?, party=?, partyBadge=?, slogan=?, age=?, education=?, educationDetails=?,
      village=?, phone=?, ward=?, photo=?, symbol=?, votes=?, bio=?, achievements=?, promises=?
    WHERE id=?
  `);

  stmt.run([
    updated.name, updated.party, updated.partyBadge, updated.slogan, updated.age,
    updated.education, updated.educationDetails, updated.village, updated.phone,
    updated.ward, updated.photo, updated.symbol, updated.votes, updated.bio,
    updated.achievements, updated.promises, String(id)
  ]);
  stmt.free();

  saveSqlToFile();
  return getCandidateById(id);
}

function deleteCandidate(id) {
  ensureDb();
  const stmt = sqlDb.prepare('DELETE FROM candidates WHERE id = ?');
  stmt.run([String(id)]);
  stmt.free();
  saveSqlToFile();
  return true;
}

function resetAllVotes() {
  ensureDb();
  sqlDb.run('UPDATE candidates SET votes = 0');
  saveSqlToFile();

  try {
    if (fs.existsSync(jsonSeedPath)) {
      const jData = JSON.parse(fs.readFileSync(jsonSeedPath, 'utf8'));
      if (Array.isArray(jData.candidates)) {
        jData.candidates.forEach(c => { c.votes = 0; });
        fs.writeFileSync(jsonSeedPath, JSON.stringify(jData, null, 2), 'utf8');
      }
    }
  } catch (e) {
    console.error('Error syncing reset votes to db.json:', e);
  }
  return true;
}

function pledgeVote(id) {
  ensureDb();
  const cand = getCandidateById(id);
  if (!cand) return null;
  const newVotes = (cand.votes || 0) + 1;
  const stmt = sqlDb.prepare('UPDATE candidates SET votes = votes + 1 WHERE id = ?');
  stmt.run([String(id)]);
  stmt.free();
  saveSqlToFile();

  try {
    if (fs.existsSync(jsonSeedPath)) {
      const jData = JSON.parse(fs.readFileSync(jsonSeedPath, 'utf8'));
      if (Array.isArray(jData.candidates)) {
        const c = jData.candidates.find(item => String(item.id) === String(id));
        if (c) c.votes = newVotes;
        fs.writeFileSync(jsonSeedPath, JSON.stringify(jData, null, 2), 'utf8');
      }
    }
  } catch (e) {
    console.error('Error syncing vote to db.json:', e);
  }

  return newVotes;
}

// ----------------------------------------------------
// WORKS (SQL Queries)
// ----------------------------------------------------
function formatWorkRow(row) {
  if (!row) return null;
  return {
    ...row,
    vouchers: safeJsonParse(row.vouchers, []),
    documents: safeJsonParse(row.documents, [])
  };
}

function getWorks() {
  ensureDb();
  // Order: Verified Kakoda works (with workCode) first, then by id ASC
  const res = sqlDb.exec(`
    SELECT * FROM works 
    ORDER BY 
      CASE WHEN workCode IS NOT NULL AND workCode != '' THEN 0 ELSE 1 END,
      id ASC
  `);
  if (!res.length) return [];
  const rows = rowsToObjects(res[0].columns, res[0].values);
  return rows.map(formatWorkRow);
}

function getWorkById(id) {
  ensureDb();
  const stmt = sqlDb.prepare('SELECT * FROM works WHERE id = ?');
  stmt.bind([Number(id)]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return formatWorkRow(row);
  }
  stmt.free();
  return null;
}

function addWork(work) {
  ensureDb();
  const maxRes = sqlDb.exec('SELECT MAX(id) FROM works');
  const maxId = (maxRes[0] && maxRes[0].values[0][0]) || 0;
  const nextId = Number(maxId) + 1;

  const budget = Number(work.budget) || 0;
  const spent = Number(work.spent) || 0;
  const panchayatShare = Number(work.panchayatShare) || Math.round(budget * 0.1);
  const balance = budget - spent;

  const newWork = {
    id: nextId,
    title: work.title,
    scheme: work.scheme || 'ग्राम पंचायत विकास योजना',
    budget,
    spent,
    panchayatShare,
    balance: balance >= 0 ? balance : 0,
    status: work.status || 'चालू',
    category: work.category || 'विकास कार्य',
    length: work.length || '1.0 किमी',
    workType: work.workType || 'निर्माण कार्य',
    contractor: work.contractor || 'ग्राम पंचायत',
    startDate: work.startDate || '01 जनवरी 2024',
    endDate: work.endDate || '31 दिसम्बर 2024',
    progress: Number(work.progress) || (work.status === 'पूर्ण' ? 100 : (work.status === 'चालू' ? 50 : 0)),
    image: work.image || 'https://images.unsplash.com/photo-1545459720-aac8509eb02c?w=800&h=450&fit=crop',
    description: work.description || '',
    workCode: work.workCode || '',
    sanctionNo: work.sanctionNo || '',
    location: work.location || '',
    sarpanchSign: work.sarpanchSign || 'संदीप कुमार',
    secretarySign: work.secretarySign || 'रवि',
    vouchers: typeof work.vouchers === 'string' ? work.vouchers : JSON.stringify(work.vouchers || []),
    documents: typeof work.documents === 'string' ? work.documents : JSON.stringify(work.documents || [])
  };

  const stmt = sqlDb.prepare(`
    INSERT INTO works (id, title, scheme, budget, spent, panchayatShare, balance, status, category, length, workType, contractor, startDate, endDate, progress, image, description, workCode, sanctionNo, location, sarpanchSign, secretarySign, vouchers, documents)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    newWork.id, newWork.title, newWork.scheme, newWork.budget, newWork.spent,
    newWork.panchayatShare, newWork.balance, newWork.status, newWork.category,
    newWork.length, newWork.workType, newWork.contractor, newWork.startDate,
    newWork.endDate, newWork.progress, newWork.image, newWork.description,
    newWork.workCode, newWork.sanctionNo, newWork.location, newWork.sarpanchSign,
    newWork.secretarySign, newWork.vouchers, newWork.documents
  ]);
  stmt.free();

  saveSqlToFile();
  return formatWorkRow(newWork);
}

function updateWork(id, updateData) {
  ensureDb();
  const current = getWorkById(id);
  if (!current) return null;

  const budget = updateData.budget !== undefined ? Number(updateData.budget) : current.budget;
  const spent = updateData.spent !== undefined ? Number(updateData.spent) : current.spent;
  const balance = budget - spent;
  const image = (updateData.image && updateData.image.trim()) ? updateData.image.trim() : current.image;
  const progress = updateData.progress !== undefined ? Number(updateData.progress) : current.progress;

  const vouchers = updateData.vouchers !== undefined
    ? (typeof updateData.vouchers === 'string' ? updateData.vouchers : JSON.stringify(updateData.vouchers))
    : (typeof current.vouchers === 'string' ? current.vouchers : JSON.stringify(current.vouchers || []));

  const documents = updateData.documents !== undefined
    ? (typeof updateData.documents === 'string' ? updateData.documents : JSON.stringify(updateData.documents))
    : (typeof current.documents === 'string' ? current.documents : JSON.stringify(current.documents || []));

  const stmt = sqlDb.prepare(`
    UPDATE works SET
      title=?, scheme=?, budget=?, spent=?, panchayatShare=?, balance=?, status=?,
      category=?, length=?, workType=?, contractor=?, startDate=?, endDate=?,
      progress=?, image=?, description=?, workCode=?, sanctionNo=?, location=?,
      sarpanchSign=?, secretarySign=?, vouchers=?, documents=?
    WHERE id=?
  `);

  stmt.run([
    updateData.title || current.title,
    updateData.scheme || current.scheme,
    budget,
    spent,
    updateData.panchayatShare !== undefined ? Number(updateData.panchayatShare) : current.panchayatShare,
    balance >= 0 ? balance : 0,
    updateData.status || current.status,
    updateData.category || current.category,
    updateData.length !== undefined ? updateData.length : current.length,
    updateData.workType || current.workType,
    updateData.contractor !== undefined ? updateData.contractor : current.contractor,
    updateData.startDate || current.startDate,
    updateData.endDate || current.endDate,
    progress,
    image,
    updateData.description !== undefined ? updateData.description : current.description,
    updateData.workCode !== undefined ? updateData.workCode : (current.workCode || ''),
    updateData.sanctionNo !== undefined ? updateData.sanctionNo : (current.sanctionNo || ''),
    updateData.location !== undefined ? updateData.location : (current.location || ''),
    updateData.sarpanchSign !== undefined ? updateData.sarpanchSign : (current.sarpanchSign || 'संदीप कुमार'),
    updateData.secretarySign !== undefined ? updateData.secretarySign : (current.secretarySign || 'रवि'),
    vouchers,
    documents,
    Number(id)
  ]);
  stmt.free();

  saveSqlToFile();
  return getWorkById(id);
}

function deleteWork(id) {
  ensureDb();
  const stmt = sqlDb.prepare('DELETE FROM works WHERE id = ?');
  stmt.run([Number(id)]);
  stmt.free();
  saveSqlToFile();
  return true;
}

// ----------------------------------------------------
// COMPLAINTS (SQL Queries)
// ----------------------------------------------------
function getComplaints() {
  ensureDb();
  const res = sqlDb.exec('SELECT * FROM complaints ORDER BY id DESC');
  if (!res.length) return [];
  return rowsToObjects(res[0].columns, res[0].values);
}

function addComplaint(complaint) {
  ensureDb();
  const maxRes = sqlDb.exec('SELECT MAX(id) FROM complaints');
  const maxId = (maxRes[0] && maxRes[0].values[0][0]) || 100;
  const nextId = Number(maxId) + 1;

  const dateStr = new Date().toLocaleDateString('hi-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const stmt = sqlDb.prepare(`
    INSERT INTO complaints (id, name, phone, ward, subject, message, status, date, reply)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    nextId,
    complaint.name,
    complaint.phone || '',
    complaint.ward || 'वार्ड 1',
    complaint.subject,
    complaint.message,
    'लंबित',
    dateStr,
    ''
  ]);
  stmt.free();

  saveSqlToFile();
  return {
    id: nextId,
    name: complaint.name,
    phone: complaint.phone || '',
    ward: complaint.ward || 'वार्ड 1',
    subject: complaint.subject,
    message: complaint.message,
    status: 'लंबित',
    date: dateStr,
    reply: ''
  };
}

function updateComplaintStatus(id, status, reply) {
  ensureDb();
  const stmt = sqlDb.prepare('UPDATE complaints SET status = ?, reply = ? WHERE id = ?');
  stmt.run([status || 'लंबित', reply || '', Number(id)]);
  stmt.free();
  saveSqlToFile();

  const getStmt = sqlDb.prepare('SELECT * FROM complaints WHERE id = ?');
  getStmt.bind([Number(id)]);
  if (getStmt.step()) {
    const row = getStmt.getAsObject();
    getStmt.free();
    return row;
  }
  getStmt.free();
  return null;
}

// ----------------------------------------------------
// SETTINGS / VILLAGE INFO / STATS / DUTIES (SQL Queries)
// ----------------------------------------------------
function getSetting(key, fallback = {}) {
  ensureDb();
  const stmt = sqlDb.prepare('SELECT value FROM settings WHERE key = ?');
  stmt.bind([key]);
  if (stmt.step()) {
    const val = stmt.getAsObject().value;
    stmt.free();
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  stmt.free();
  return fallback;
}

function setSetting(key, val) {
  ensureDb();
  const stmt = sqlDb.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  stmt.run([key, JSON.stringify(val)]);
  stmt.free();
  saveSqlToFile();
  return val;
}

function getVillageInfo() {
  return getSetting('villageInfo', {
    name: 'मेरा गाँव',
    gramPanchayat: 'काकोड़ा',
    district: 'टोंक',
    state: 'राजस्थान',
    pincode: '304001',
    phone: '+91 98765 43210',
    email: 'info@kakoda.panchayat.gov.in'
  });
}

function updateVillageInfo(info) {
  const current = getVillageInfo();
  const updated = { ...current, ...info };
  return setSetting('villageInfo', updated);
}

function getStats() {
  return getSetting('stats', {
    totalVoters: 2450,
    totalWards: 11,
    activeCandidates: 3,
    totalWorks: 4,
    completedWorks: 1,
    ongoingWorks: 2,
    totalComplaints: 2,
    resolvedComplaints: 1,
    totalVisitors: 8420
  });
}

function getDuties() {
  return getSetting('duties', []);
}

function getActivities() {
  return getSetting('activities', []);
}

function getGramSabha() {
  return getSetting('gramSabha', {
    title: 'आगामी ग्राम सभा खुली बैठक',
    date: '15 अगस्त 2024',
    time: 'प्रातः 10:00 बजे',
    location: 'ग्राम पंचायत भवन चौपाल (काकोड़ा)',
    agenda: 'जल निकासी नाली, अमृत सरोवर और नई स्ट्रीट लाइट योजना एवं 15वें वित्त आयोग कार्यों का अनुमोदन।',
    description: 'सभी ग्रामवासियों को सूचित किया जाता है कि आगामी विकास कार्यों के अनुमोदन हेतु ग्राम सभा की खुली बैठक आयोजित की जा रही है।',
    notice: 'गाँव के सभी 18 वर्ष से ऊपर के सम्मानित मतदाताओं की उपस्थिति सादर प्रार्थनीय है।',
    status: 'सक्रिय सूचना',
    active: true
  });
}

function updateGramSabha(data) {
  const current = getGramSabha();
  const updated = {
    ...current,
    title: data.title !== undefined ? data.title : current.title,
    date: data.date !== undefined ? data.date : current.date,
    time: data.time !== undefined ? data.time : current.time,
    location: data.location !== undefined ? data.location : current.location,
    agenda: data.agenda !== undefined ? data.agenda : current.agenda,
    description: data.description !== undefined ? data.description : current.description,
    notice: data.notice !== undefined ? data.notice : current.notice,
    status: data.status !== undefined ? data.status : current.status,
    active: data.active !== undefined ? (data.active === 'true' || data.active === true || data.active === 'on' || data.active === 1 || data.active === '1') : current.active
  };
  setSetting('gramSabha', updated);

  try {
    if (fs.existsSync(jsonSeedPath)) {
      const jData = JSON.parse(fs.readFileSync(jsonSeedPath, 'utf8'));
      jData.gramSabha = updated;
      fs.writeFileSync(jsonSeedPath, JSON.stringify(jData, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('Error writing gramSabha to json:', e);
  }

  return updated;
}

// JSON Compatibility Helpers
function readDb() {
  return {
    villageInfo: getVillageInfo(),
    gramSabha: getGramSabha(),
    stats: getStats(),
    candidates: getCandidates(),
    works: getWorks(),
    complaints: getComplaints(),
    duties: getDuties(),
    activities: getActivities()
  };
}

function writeDb(data) {
  if (!data) return false;
  if (data.villageInfo) setSetting('villageInfo', data.villageInfo);
  if (data.gramSabha) setSetting('gramSabha', data.gramSabha);
  if (data.stats) setSetting('stats', data.stats);
  if (data.duties) setSetting('duties', data.duties);
  if (data.activities) setSetting('activities', data.activities);
  return true;
}

module.exports = {
  initDb,
  saveSqlToFile,
  readDb,
  writeDb,
  getCandidates,
  getCandidateById,
  addCandidate,
  updateCandidate,
  deleteCandidate,
  pledgeVote,
  resetAllVotes,
  getWorks,
  getWorkById,
  addWork,
  updateWork,
  deleteWork,
  getComplaints,
  addComplaint,
  updateComplaintStatus,
  getVillageInfo,
  updateVillageInfo,
  getGramSabha,
  updateGramSabha,
  getStats,
  getDuties,
  getActivities,
  getSetting,
  setSetting
};
