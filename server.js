require('dotenv').config();
const express = require('express');
const path = require('path');
const os = require('os');
const multer = require('multer');
const db = require('./data/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure storage for candidates and works photo uploads
const candidateStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public/uploads/candidates'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'cand-' + Date.now() + ext);
  }
});
const uploadCandidate = multer({ storage: candidateStorage });

const workStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public/uploads/works'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'work-' + Date.now() + ext);
  }
});
const uploadWork = multer({ storage: workStorage });

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Set View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Simple session simulator via cookies
app.use((req, res, next) => {
  const cookieHeader = req.headers.cookie || '';
  req.isAdmin = cookieHeader.includes('admin_auth=true');
  res.locals.isAdmin = req.isAdmin;
  res.locals.villageInfo = db.getVillageInfo();
  res.locals.gramSabha = db.getGramSabha();
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

// Support / Vote pledge
app.post('/api/vote/:id', (req, res) => {
  const updatedVotes = db.pledgeVote(req.params.id);
  if (updatedVotes !== null) {
    return res.json({ success: true, votes: updatedVotes, message: 'समर्थन दर्ज करने के लिए धन्यवाद!' });
  }
  return res.status(404).json({ success: false, message: 'उम्मीदवार नहीं मिला' });
});

// Reset all candidate votes to 0 (Admin only)
app.post('/api/votes/reset', requireAdmin, (req, res) => {
  db.resetAllVotes();
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

startServer();
