require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const db = require('./data/db');

const app = express();
const PORT = process.env.PORT || 3000;
const isVercel = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const projectRoot = process.cwd();

// Resolve view and static paths reliably across local and serverless deployments
const viewsPath = fs.existsSync(path.join(projectRoot, 'views'))
  ? path.join(projectRoot, 'views')
  : path.join(__dirname, 'views');
const publicPath = fs.existsSync(path.join(projectRoot, 'public'))
  ? path.join(projectRoot, 'public')
  : path.join(__dirname, 'public');

// Configure storage for candidates and works photo uploads
// On Vercel / Lambda, write uploads to /tmp to prevent read-only filesystem errors
const uploadBaseDir = isVercel
  ? path.join(os.tmpdir(), 'uploads')
  : path.join(publicPath, 'uploads');

const candidateUploadDir = path.join(uploadBaseDir, 'candidates');
const workUploadDir = path.join(uploadBaseDir, 'works');

try {
  if (!fs.existsSync(candidateUploadDir)) fs.mkdirSync(candidateUploadDir, { recursive: true });
  if (!fs.existsSync(workUploadDir)) fs.mkdirSync(workUploadDir, { recursive: true });
} catch (e) {
  console.warn('Could not create upload directories:', e.message);
}

const candidateStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, candidateUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'cand-' + Date.now() + ext);
  }
});
const uploadCandidate = multer({ storage: candidateStorage });

const workStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, workUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'work-' + Date.now() + ext);
  }
});
const uploadWork = multer({ storage: workStorage });

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(publicPath));
if (isVercel) {
  app.use('/uploads', express.static(uploadBaseDir));
}

// Set View Engine
app.set('view engine', 'ejs');
app.set('views', viewsPath);

// Database initialization middleware - ensures SQL database is ready before any request is processed
let dbInitPromise = null;
app.use(async (req, res, next) => {
  try {
    if (!dbInitPromise) {
      dbInitPromise = db.initDb();
    }
    await dbInitPromise;
    next();
  } catch (err) {
    console.error('Database initialization failed:', err);
    res.status(500).send(`
      <div style="font-family: sans-serif; padding: 2rem; max-width: 600px; margin: 2rem auto; border: 1px solid #fee2e2; border-radius: 8px; background: #fff5f5;">
        <h2 style="color: #991b1b; margin-top: 0;">500 - डेटाबेस लोड नहीं हो सका (Database Error)</h2>
        <p style="color: #4b5563;">डेटाबेस प्रारंभ करने में समस्या आई है।</p>
        <pre style="background: #f1f5f9; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 13px; color: #1e293b;">${err.message || err}</pre>
      </div>
    `);
  }
});

// Supabase client initialization for real-time cloud data sync
let supabase = null;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tleghzrcryjkitxlzzpj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_F2dar3UriRrmontzl-mjsQ_VGUXHUng';
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (err) {
    console.warn('Supabase initialization warning:', err.message);
  }
}

// Cookie parser utility
function parseCookies(header) {
  const list = {};
  if (!header) return list;
  header.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      list[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return list;
}

// Client IP extractor
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}

const votedIps = new Set();
let votesCache = { time: 0, data: null };

// Global session & visitor state via cookies
app.use((req, res, next) => {
  const cookies = parseCookies(req.headers.cookie || '');
  req.isAdmin = (cookies['admin_auth'] === 'true') || (req.headers.cookie || '').includes('admin_auth=true');
  res.locals.isAdmin = req.isAdmin;

  // Single-vote tracking: which candidate did this visitor support
  req.votedCandidate = cookies['sarpanch_voted'] || null;
  res.locals.votedCandidate = req.votedCandidate;

  try {
    res.locals.villageInfo = db.getVillageInfo();
    res.locals.gramSabha = db.getGramSabha();
  } catch (err) {
    console.error('Error fetching global locals:', err);
    res.locals.villageInfo = {};
    res.locals.gramSabha = {};
  }
  next();
});

// Admin middleware - requires valid admin login
function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    if (req.xhr || req.headers.accept?.includes('json') || req.path.startsWith('/api/')) {
      return res.status(401).json({ success: false, message: 'एडमिन लॉगिन आवश्यक है।' });
    }
    return res.redirect('/admin/login');
  }
  next();
}


// ----------------------------------------------------
// PUBLIC ROUTES
// ----------------------------------------------------

// 1. Home Page (Public View)
app.get('/', (req, res) => {
  const candidates = db.getCandidates();
  const works = db.getWorks();
  const villageInfo = db.getVillageInfo();
  const duties = db.getDuties();
  res.render('index', {
    pageTitle: 'मेरा गाँव - ग्राम पंचायत पोर्टल',
    activeNav: 'home',
    candidates,
    works: works.slice(0, 4), // featured works
    villageInfo,
    gramSabha: db.getGramSabha(),
    duties
  });
});

// 2. Candidate List Page
app.get('/candidates', (req, res) => {
  const candidates = db.getCandidates();
  res.render('candidates', {
    pageTitle: 'उम्मीदवार सूची | मेरा गाँव पोर्टल',
    activeNav: 'candidates',
    candidates
  });
});

// 3. Candidate Profile Page
app.get('/candidate/:id', (req, res) => {
  const candidate = db.getCandidateById(req.params.id);
  if (!candidate) {
    return res.status(404).render('404', { pageTitle: 'उम्मीदवार नहीं मिला', message: 'यह उम्मीदवार उपलब्ध नहीं है।' });
  }
  const allCandidates = db.getCandidates();
  res.render('candidate-detail', {
    pageTitle: `${candidate.name} - उम्मीदवार प्रोफाइल`,
    activeNav: 'candidates',
    candidate,
    otherCandidates: allCandidates.filter(c => c.id !== candidate.id).slice(0, 3)
  });
});

// 4. Development Works List
app.get('/works', (req, res) => {
  const works = db.getWorks();
  res.render('works', {
    pageTitle: 'ग्राम विकास कार्य गैलरी | मेरा गाँव',
    activeNav: 'works',
    works
  });
});

// 5. Work Detail Page
app.get('/work/:id', (req, res) => {
  const work = db.getWorkById(req.params.id);
  if (!work) {
    return res.status(404).render('404', { pageTitle: 'विकास कार्य नहीं मिला', message: 'यह विकास कार्य उपलब्ध नहीं है।' });
  }
  const allWorks = db.getWorks();
  res.render('work-detail', {
    pageTitle: `${work.title} - कार्य विवरण`,
    activeNav: 'works',
    work,
    relatedWorks: allWorks.filter(w => String(w.id) !== String(work.id)).slice(0, 3)
  });
});

// 6. What Should Sarpanch Do? (Duties & Future Plan)
app.get('/duties', (req, res) => {
  const duties = db.getDuties();
  res.render('duties', {
    pageTitle: 'सरपंच को क्या-क्या करना चाहिए? | भविष्य योजना',
    activeNav: 'duties',
    duties
  });
});

// 7. Citizen Grievance / Complaints Page
app.get('/complaint', (req, res) => {
  res.render('complaint', {
    pageTitle: 'नागरिक शिकायत एवं सुझाव | मेरा गाँव',
    activeNav: 'complaint'
  });
});

// ----------------------------------------------------
// ADMIN ROUTES
// ----------------------------------------------------

// Admin Login
app.get('/admin/login', (req, res) => {
  if (req.isAdmin) {
    return res.redirect('/admin');
  }
  res.render('admin/login', {
    pageTitle: 'एडमिन लॉगिन | मेरा गाँव पोर्टल',
    error: null
  });
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  if ((username === adminUser || username === 'admin') && (password === adminPass || password === 'admin123')) {
    res.setHeader('Set-Cookie', 'admin_auth=true; Path=/; HttpOnly');
    return res.redirect('/admin');
  }
  res.render('admin/login', {
    pageTitle: 'एडमिन लॉगिन | मेरा गाँव पोर्टल',
    error: 'अमान्य यूज़रनेम या पासवर्ड! (Demo: admin / admin123)'
  });
});

app.get('/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'admin_auth=false; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.redirect('/admin/login');
});

// Unified All-in-One Admin Panel URL
app.get('/admin', requireAdmin, (req, res) => {
  const stats = db.getStats();
  const activities = db.getActivities();
  const works = db.getWorks();
  const candidates = db.getCandidates();
  const complaints = db.getComplaints();
  const duties = db.getDuties();
  const villageInfo = db.getVillageInfo();
  const activeTab = req.query.tab || 'dashboard';
  
  res.render('admin/dashboard', {
    pageTitle: 'एडमिन पोर्टल - संपूर्ण प्रबंधन',
    activeTab,
    stats,
    activities,
    works,
    candidates,
    complaints,
    duties,
    villageInfo,
    gramSabha: db.getGramSabha(),
    totalWorksCount: works.length,
    candidatesCount: candidates.length,
    complaintsCount: complaints.length,
    pendingComplaints: complaints.filter(c => c.status === 'लंबित').length
  });
});

// Admin sub-routes redirect seamlessly to the single admin panel URL with active tab
app.get('/admin/works', (req, res) => res.redirect('/admin?tab=works'));
app.get('/admin/candidates', (req, res) => res.redirect('/admin?tab=candidates'));
app.get('/admin/complaints', (req, res) => res.redirect('/admin?tab=complaints'));
app.get('/admin/analytics', (req, res) => res.redirect('/admin?tab=analytics'));
app.get('/admin/duties', (req, res) => res.redirect('/admin?tab=duties'));
app.get('/admin/settings', (req, res) => res.redirect('/admin?tab=settings'));

// ----------------------------------------------------
// REST APIs (AJAX & Form submissions)
// ----------------------------------------------------

// Support / Vote pledge - STRICT ONE VOTE PER VISITOR + REAL-TIME SYNC
app.post('/api/vote/:id', async (req, res) => {
  const candidateId = String(req.params.id);
  const cookies = parseCookies(req.headers.cookie || '');
  const alreadyVotedCandidate = cookies['sarpanch_voted'];
  const clientIp = getClientIp(req);

  // 1. Strict check: If already voted, deny with 400
  if (alreadyVotedCandidate) {
    return res.status(400).json({
      success: false,
      alreadyVoted: true,
      votedCandidate: alreadyVotedCandidate,
      message: 'आप पहले ही अपना समर्थन दर्ज कर चुके हैं! एक नागरिक केवल एक बार समर्थन दे सकता है।'
    });
  }

  // 2. Increment in local SQLite / db.json
  const updatedVotes = db.pledgeVote(candidateId);
  if (updatedVotes === null) {
    return res.status(404).json({ success: false, message: 'उम्मीदवार नहीं मिला' });
  }

  // 3. Sync to Supabase in real-time if configured
  if (supabase) {
    try {
      const { data } = await supabase.from('candidates').select('votes').eq('id', candidateId).single();
      const currentSupabaseVotes = (data && typeof data.votes === 'number') ? data.votes : (updatedVotes - 1);
      await supabase.from('candidates').update({ votes: currentSupabaseVotes + 1 }).eq('id', candidateId);
    } catch (e) {
      console.warn('Supabase vote sync error:', e.message);
    }
  }

  if (clientIp) {
    if (votedIps.size > 20000) votedIps.clear();
    votedIps.add(clientIp);
  }

  // Clear cache for instant real-time poll update
  votesCache = { time: 0, data: null };

  // 4. Set persistent 1-year cookie so browser permanently locks future voting
  res.setHeader('Set-Cookie', [
    `sarpanch_voted=${encodeURIComponent(candidateId)}; Path=/; Max-Age=31536000; SameSite=Lax`
  ]);

  return res.json({
    success: true,
    candidateId,
    votes: updatedVotes,
    message: 'समर्थन दर्ज करने के लिए धन्यवाद! आपका समर्थन सफलतापूर्वक दर्ज हो गया है।'
  });
});

// Real-Time live votes polling endpoint (returns current vote counts for all candidates)
app.get('/api/votes', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const now = Date.now();

  // Short cache (1.5s) to ensure ultra-low latency while avoiding excessive DB load
  if (supabase && (now - votesCache.time < 1500) && votesCache.data) {
    return res.json({ success: true, votes: votesCache.data });
  }

  if (supabase) {
    try {
      const { data, error } = await supabase.from('candidates').select('id, votes');
      if (!error && Array.isArray(data) && data.length > 0) {
        const map = {};
        data.forEach(c => { map[c.id] = c.votes || 0; });
        votesCache = { time: now, data: map };
        return res.json({ success: true, votes: map });
      }
    } catch (e) {
      // Fallback to local DB
    }
  }

  const candidates = db.getCandidates();
  const map = {};
  candidates.forEach(c => { map[c.id] = c.votes || 0; });
  votesCache = { time: now, data: map };
  return res.json({ success: true, votes: map });
});

// Reset all candidate votes to 0 (Admin only)
app.post('/api/votes/reset', requireAdmin, async (req, res) => {
  db.resetAllVotes();

  if (supabase) {
    try {
      await supabase.from('candidates').update({ votes: 0 }).neq('id', '___none___');
    } catch (e) {
      console.error('Supabase reset votes error:', e);
    }
  }

  votesCache = { time: 0, data: null };
  votedIps.clear();

  if (req.headers['content-type']?.includes('application/json') || req.headers['accept']?.includes('application/json') || req.xhr || req.query.format === 'json') {
    return res.json({ success: true, message: 'सभी उम्मीदवारों का समर्थन 0 कर दिया गया है।' });
  }
  const redirectTab = req.body.redirectTab || 'dashboard';
  res.redirect(`/admin?tab=${redirectTab}&saved=votes_reset`);
});

// Citizen Complaint Submission
app.post('/api/complaint', (req, res) => {
  const { name, phone, ward, subject, message } = req.body;
  if (!name || !subject || !message) {
    return res.status(400).json({ success: false, message: 'कृपया सभी आवश्यक फ़ील्ड भरें।' });
  }
  const complaint = db.addComplaint({ name, phone, ward, subject, message });
  return res.json({ success: true, complaint, message: 'आपकी शिकायत सफलतापूर्वक दर्ज कर ली गई है। संदर्भ संख्या: #' + complaint.id });
});

// Work CRUD
app.post('/api/works', requireAdmin, uploadWork.single('imageFile'), (req, res) => {
  if (req.file) {
    req.body.image = '/uploads/works/' + req.file.filename;
  } else if (req.body.imageUrl && req.body.imageUrl.trim()) {
    req.body.image = req.body.imageUrl.trim();
  } else if (req.body.image && req.body.image.trim()) {
    req.body.image = req.body.image.trim();
  }
  const work = db.addWork(req.body);
  if (req.headers['content-type']?.includes('application/json')) {
    return res.json({ success: true, work });
  }
  res.redirect('/admin?tab=works');
});

app.post('/api/works/:id/edit', requireAdmin, uploadWork.single('imageFile'), (req, res) => {
  if (req.file) {
    req.body.image = '/uploads/works/' + req.file.filename;
  } else if (req.body.imageUrl && req.body.imageUrl.trim()) {
    req.body.image = req.body.imageUrl.trim();
  } else if (req.body.image && req.body.image.trim()) {
    req.body.image = req.body.image.trim();
  }
  const updated = db.updateWork(req.params.id, req.body);
  if (req.headers['content-type']?.includes('application/json')) {
    return res.json({ success: !!updated, work: updated });
  }
  res.redirect('/admin?tab=works');
});

app.post('/api/works/:id/delete', requireAdmin, (req, res) => {
  const deleted = db.deleteWork(req.params.id);
  if (req.headers['content-type']?.includes('application/json')) {
    return res.json({ success: deleted });
  }
  res.redirect('/admin?tab=works');
});

// Candidate CRUD
app.post('/api/candidates', requireAdmin, uploadCandidate.single('photoFile'), (req, res) => {
  if (req.file) {
    req.body.photo = '/uploads/candidates/' + req.file.filename;
  } else if (req.body.photoUrl && req.body.photoUrl.trim()) {
    req.body.photo = req.body.photoUrl.trim();
  } else if (req.body.photo && req.body.photo.trim()) {
    req.body.photo = req.body.photo.trim();
  }
  const cand = db.addCandidate(req.body);
  if (req.headers['content-type']?.includes('application/json')) {
    return res.json({ success: true, candidate: cand });
  }
  res.redirect('/admin?tab=candidates');
});

app.post('/api/candidates/:id/edit', requireAdmin, uploadCandidate.single('photoFile'), (req, res) => {
  if (req.file) {
    req.body.photo = '/uploads/candidates/' + req.file.filename;
  } else if (req.body.photoUrl && req.body.photoUrl.trim()) {
    req.body.photo = req.body.photoUrl.trim();
  } else if (req.body.photo && req.body.photo.trim()) {
    req.body.photo = req.body.photo.trim();
  }
  const updated = db.updateCandidate(req.params.id, req.body);
  if (req.headers['content-type']?.includes('application/json')) {
    return res.json({ success: !!updated, candidate: updated });
  }
  res.redirect('/admin?tab=candidates');
});

app.post('/api/candidates/:id/delete', requireAdmin, (req, res) => {
  const deleted = db.deleteCandidate(req.params.id);
  if (req.headers['content-type']?.includes('application/json')) {
    return res.json({ success: deleted });
  }
  res.redirect('/admin?tab=candidates');
});

// Complaint Status Update
app.post('/api/complaints/:id/status', requireAdmin, (req, res) => {
  const { status, reply } = req.body;
  const updated = db.updateComplaintStatus(req.params.id, status, reply);
  if (req.headers['content-type']?.includes('application/json')) {
    return res.json({ success: !!updated, complaint: updated });
  }
  res.redirect('/admin/complaints');
});

// Update Village Settings
app.post('/api/settings', requireAdmin, (req, res) => {
  db.updateVillageInfo(req.body);
  res.redirect('/admin?tab=settings&saved=1');
});

// Update Gram Sabha Meeting Details
app.post('/api/gram-sabha', requireAdmin, (req, res) => {
  const updated = db.updateGramSabha(req.body);
  if (req.headers['content-type']?.includes('application/json')) {
    return res.json({ success: true, gramSabha: updated, message: 'आगामी ग्राम सभा बैठक सूचना सफलतापूर्वक सुरक्षित हो गई!' });
  }
  const redirectTab = req.body.redirectTab || 'dashboard';
  res.redirect(`/admin?tab=${redirectTab}&saved=gram_sabha`);
});

// Export CSV for Works
app.get('/api/export/works.csv', requireAdmin, (req, res) => {
  const works = db.getWorks();
  let csv = 'ID,कार्य का नाम,योजना,स्वीकृत राशि (₹),खर्च राशि (₹),स्थिति,प्रगति (%),ठेकेदार\n';
  works.forEach(w => {
    csv += `"${w.id}","${w.title.replace(/"/g, '""')}","${w.scheme.replace(/"/g, '""')}","${w.budget}","${w.spent}","${w.status}","${w.progress}%","${w.contractor}"\n`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="vikas-karya-report.csv"');
  res.send('\uFEFF' + csv); // Include BOM for Excel in Hindi
});

// 404 Handler
app.use((req, res) => {
  res.status(404).render('404', {
    pageTitle: 'पृष्ठ नहीं मिला | 404',
    message: 'माफ़ कीजिए! जो पृष्ठ आप खोज रहे हैं वह मौजूद नहीं है।'
  });
});

// Global Error Handler - catches any uncaught error to prevent Vercel 500 crashes
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).send(`
    <div style="font-family: system-ui, sans-serif; padding: 2.5rem; max-width: 650px; margin: 3rem auto; border: 1px solid #fecaca; border-radius: 12px; background: #fff5f5; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
      <h2 style="color: #991b1b; margin-top: 0; font-size: 1.5rem;">500 - आंतरिक सर्वर त्रुटि (Server Error)</h2>
      <p style="color: #4b5563; font-size: 1rem; line-height: 1.5;">पोर्टल लोड करने में कोई तकनीकी समस्या आई है।</p>
      <pre style="background: #1e293b; color: #f8fafc; padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 12px; line-height: 1.4;">${err.stack || err.message || err}</pre>
      <div style="margin-top: 1.5rem;">
        <a href="/" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 500;">मुख्य पृष्ठ पर वापस जाएँ (Back to Home)</a>
      </div>
    </div>
  `);
});

// Helper to detect local network IPv4 address
function getNetworkIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Start server with SQL database initialization
async function startServer() {
  try {
    await db.initDb();
    const HOST = process.env.HOST || '0.0.0.0';
    const networkIp = getNetworkIp();

    app.listen(PORT, HOST, () => {
      console.log(`=======================================================`);
      console.log(`🌾 मेरा गाँव - ग्राम पंचायत पोर्टल (Sarpanch Portal)`);
      console.log(`💾 Database Engine    : SQL (SQLite: ${process.env.DB_FILE || './data/sarpanch.sqlite'})`);
      console.log(`🔌 Server Port        : ${PORT}`);
      console.log(`🌍 Local Website URL  : http://localhost:${PORT}/`);
      console.log(`📡 Network Website URL: http://${networkIp}:${PORT}/`);
      console.log(`🔒 Admin Local URL    : http://localhost:${PORT}/admin`);
      console.log(`🔑 Admin Network URL  : http://${networkIp}:${PORT}/admin`);
      console.log(`👤 Admin Credentials  : ${process.env.ADMIN_USERNAME || 'admin'} / ${process.env.ADMIN_PASSWORD || 'admin123'}`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Fatal error starting server with SQL database:', err);
    process.exit(1);
  }
}

// Only start listening if NOT in a serverless environment (e.g. Vercel)
if (!process.env.VERCEL && require.main === module) {
  startServer();
}

module.exports = app;
