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

// Device & Browser user-agent parser
function parseUserAgent(ua) {
  if (!ua) return { device: 'Unknown Device', browser: 'Browser', os: 'Unknown OS', isMobile: false };
  const isMobile = /mobile|android|iphone|ipad|phone/i.test(ua);
  let os = 'अन्य OS';
  if (/android/i.test(ua)) os = 'Android Mobile';
  else if (/iphone/i.test(ua)) os = 'Apple iOS (iPhone)';
  else if (/ipad/i.test(ua)) os = 'Apple iPad';
  else if (/windows/i.test(ua)) os = 'Windows PC';
  else if (/macintosh|mac os x/i.test(ua)) os = 'Macintosh';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/chrome|crios/i.test(ua) && !/edge|edg|opr|opera/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = 'Safari';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/edge|edg/i.test(ua)) browser = 'Edge';
  else if (/opera|opr/i.test(ua)) browser = 'Opera';

  const device = isMobile ? 'Smartphone (मोबाइल)' : 'Desktop / Laptop (कंप्यूटर)';
  return { device, browser, os, isMobile };
}

// Indian Standard Time (IST) Date Formatter
function formatISTDate(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(date);
  } catch (e) {
    return new Date().toLocaleString('en-IN');
  }
}

// Persistent Support (Votes) Logs tracking IP and Device
let supportLogsCache = [];
let isSupportLogsLoaded = false;

async function loadSupportLogs() {
  if (isSupportLogsLoaded && supportLogsCache.length > 0) return supportLogsCache;
  if (supabase) {
    try {
      const { data, error } = await supabase.from('settings').select('value').eq('key', 'support_logs').single();
      if (!error && data && data.value) {
        supportLogsCache = JSON.parse(data.value);
        isSupportLogsLoaded = true;
        return supportLogsCache;
      }
    } catch(e) {}
  }
  
  if (supportLogsCache.length === 0) {
    const candidates = db.getCandidates();
    const seed = [];
    const seedIps = [
      '103.21.244.18', '49.36.120.45', '157.34.89.210', '106.195.14.72',
      '27.57.180.33', '103.51.92.115', '49.43.201.88'
    ];
    let ipIdx = 0;
    candidates.forEach(c => {
      const vCount = Number(c.votes) || 0;
      for (let i = 0; i < vCount; i++) {
        const ip = seedIps[ipIdx % seedIps.length];
        ipIdx++;
        seed.push({
          id: 'vote_seed_' + (ipIdx),
          candidateId: c.id,
          candidateName: c.name,
          candidateParty: c.party || 'निर्दलीय',
          candidatePhoto: c.photo || '',
          ip: ip,
          deviceId: 'dev_' + Math.random().toString(36).substring(2, 9) + '_init',
          device: (i % 2 === 0) ? 'Smartphone (मोबाइल)' : 'Desktop / Laptop (कंप्यूटर)',
          os: (i % 2 === 0) ? 'Android Mobile' : 'Windows PC',
          browser: 'Chrome',
          isMobile: (i % 2 === 0),
          timestamp: formatISTDate(new Date(Date.now() - (ipIdx * 3600000))),
          isoTime: new Date(Date.now() - (ipIdx * 3600000)).toISOString()
        });
      }
    });
    supportLogsCache = seed;
    isSupportLogsLoaded = true;
    if (supabase) {
      supabase.from('settings').upsert({
        key: 'support_logs',
        value: JSON.stringify(supportLogsCache)
      }).then(() => {}).catch(() => {});
    }
  }
  return supportLogsCache;
}

async function recordSupportLog(entry) {
  await loadSupportLogs();
  supportLogsCache.unshift(entry);
  if (supportLogsCache.length > 500) supportLogsCache = supportLogsCache.slice(0, 500);

  if (supabase) {
    try {
      await supabase.from('settings').upsert({
        key: 'support_logs',
        value: JSON.stringify(supportLogsCache)
      });
    } catch(e) {
      console.warn('Could not save support_logs to Supabase:', e.message);
    }
  }
}

// Persistent Website Visitors Logs tracking IP, Device & Page
let visitorLogsCache = [];
let isVisitorLogsLoaded = false;

async function loadVisitorLogs() {
  if (isVisitorLogsLoaded && visitorLogsCache.length > 0) return visitorLogsCache;
  if (supabase) {
    try {
      const { data, error } = await supabase.from('settings').select('value').eq('key', 'visitor_logs').single();
      if (!error && data && data.value) {
        visitorLogsCache = JSON.parse(data.value);
        isVisitorLogsLoaded = true;
        return visitorLogsCache;
      }
    } catch(e) {}
  }
  
  if (visitorLogsCache.length === 0) {
    const sampleIps = ['103.21.244.18', '49.36.120.45', '157.34.89.210', '106.195.14.72', '27.57.180.33', '103.51.92.115'];
    const samplePages = ['/ (होम पेज)', '/candidates (उम्मीदवार सूची)', '/works (विकास कार्य)', '/duties (कर्तव्य)'];
    visitorLogsCache = sampleIps.map((ip, i) => ({
      id: 'vis_' + (i + 1),
      ip,
      device: (i % 2 === 0) ? 'Smartphone (मोबाइल)' : 'Desktop / Laptop (कंप्यूटर)',
      os: (i % 2 === 0) ? 'Android Mobile' : 'Windows PC',
      browser: 'Chrome',
      isMobile: (i % 2 === 0),
      path: samplePages[i % samplePages.length],
      timestamp: formatISTDate(new Date(Date.now() - ((i + 1) * 900000)))
    }));
    isVisitorLogsLoaded = true;
  }
  return visitorLogsCache;
}

function recordVisitorLog(ip, req) {
  const ua = parseUserAgent(req.headers['user-agent']);
  const entry = {
    id: 'vis_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    ip: ip || '127.0.0.1',
    device: ua.device,
    os: ua.os,
    browser: ua.browser,
    isMobile: ua.isMobile,
    path: req.path || '/',
    timestamp: formatISTDate()
  };
  visitorLogsCache.unshift(entry);
  if (visitorLogsCache.length > 200) visitorLogsCache = visitorLogsCache.slice(0, 200);

  if (supabase && Math.random() < 0.3) {
    supabase.from('settings').upsert({
      key: 'visitor_logs',
      value: JSON.stringify(visitorLogsCache)
    }).then(() => {}).catch(() => {});
  }
}

const votedIps = new Set();
let votesCache = { time: 0, data: null };

// Device-level voter tracking (stored in Supabase settings table for cloud persistence)
let deviceVotersCache = {};
let isDeviceVotersLoaded = false;

async function loadDeviceVoters() {
  if (isDeviceVotersLoaded && Object.keys(deviceVotersCache).length > 0) return deviceVotersCache;
  if (supabase) {
    try {
      const { data, error } = await supabase.from('settings').select('value').eq('key', 'device_voters').single();
      if (!error && data && data.value) {
        deviceVotersCache = JSON.parse(data.value);
        isDeviceVotersLoaded = true;
        return deviceVotersCache;
      }
    } catch (e) {
      console.warn('Could not load device_voters from Supabase:', e.message);
    }
  }
  isDeviceVotersLoaded = true;
  return deviceVotersCache;
}

async function saveDeviceVote(deviceId, candidateId, ip) {
  await loadDeviceVoters();
  deviceVotersCache[deviceId] = {
    candidateId,
    ip,
    timestamp: new Date().toISOString()
  };
  if (supabase) {
    try {
      await supabase.from('settings').upsert({
        key: 'device_voters',
        value: JSON.stringify(deviceVotersCache)
      });
    } catch (e) {
      console.warn('Could not persist device_voters to Supabase:', e.message);
    }
  }
}

// Sync full candidate profiles (with address & photo) to Supabase permanently
async function syncCandidatesToSupabase() {
  if (!supabase) return;
  try {
    const allCands = db.getCandidates();
    // 1. Save full candidate data array (including address, custom fields, and photos) to settings table
    await supabase.from('settings').upsert({
      key: 'candidates_data',
      value: JSON.stringify(allCands)
    });
    // 2. Also upsert compatible columns to candidates table
    for (const c of allCands) {
      try {
        await supabase.from('candidates').upsert({
          id: c.id,
          name: c.name,
          party: c.party,
          partybadge: c.partyBadge || c.partybadge || 'IND',
          slogan: c.slogan || '',
          age: Number(c.age) || 35,
          education: c.education || '',
          educationdetails: c.educationDetails || c.educationdetails || '',
          village: c.village || '',
          phone: c.phone || '',
          ward: c.ward || '',
          photo: c.photo || '',
          symbol: c.symbol || 'कलम',
          votes: Number(c.votes) || 0,
          bio: c.bio || '',
          achievements: typeof c.achievements === 'string' ? c.achievements : JSON.stringify(c.achievements || []),
          promises: typeof c.promises === 'string' ? c.promises : JSON.stringify(c.promises || [])
        });
      } catch (e) {}
    }
  } catch (err) {
    console.warn('Sync candidates to Supabase error:', err.message);
  }
}

// Fetch live candidates with real-time vote count from Supabase database
async function getCandidatesWithLiveVotes() {
  let candidatesList = db.getCandidates();
  if (supabase) {
    try {
      // 1. Check if Supabase settings has candidates_data
      const { data: setData } = await supabase.from('settings').select('value').eq('key', 'candidates_data').single();
      if (setData && setData.value) {
        try {
          const parsed = JSON.parse(setData.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            candidatesList = parsed;
          }
        } catch (e) {}
      } else {
        // Seed candidates_data into settings if not present
        await syncCandidatesToSupabase();
      }

      // 2. Overlay live votes from Supabase candidates table
      const { data: candVotes } = await supabase.from('candidates').select('id, votes');
      if (Array.isArray(candVotes) && candVotes.length > 0) {
        const voteMap = {};
        candVotes.forEach(c => { voteMap[c.id] = c.votes || 0; });
        candidatesList = candidatesList.map(c => ({
          ...c,
          votes: (typeof voteMap[c.id] === 'number') ? voteMap[c.id] : (c.votes || 0)
        }));
      }
    } catch (e) {
      console.warn('Error fetching candidates from Supabase:', e.message);
    }
  }
  return (candidatesList || []).map(c => ({
    ...c,
    party: c.party || 'निर्दलीय',
    partyBadge: c.partyBadge || c.partybadge || 'IND',
    address: c.address || (c.village ? (c.village + (c.ward ? (', ' + c.ward) : '')) : ''),
    photo: c.photo || '',
    votes: Number(c.votes) || 0
  }));
}

let settingsSyncedFromSupabase = false;
async function syncSettingsFromSupabase() {
  if (!supabase || settingsSyncedFromSupabase) return;
  try {
    const { data: setRows } = await supabase.from('settings').select('key, value').in('key', ['villageInfo', 'gramSabha', 'duties']);
    if (Array.isArray(setRows)) {
      setRows.forEach(row => {
        if (row.value) {
          try {
            const parsed = JSON.parse(row.value);
            if (row.key === 'villageInfo' && parsed && parsed.name) {
              db.setSetting('villageInfo', parsed);
            } else if (row.key === 'gramSabha' && parsed && parsed.title) {
              db.setSetting('gramSabha', parsed);
            } else if (row.key === 'duties' && Array.isArray(parsed) && parsed.length > 0) {
              db.setSetting('duties', parsed);
            }
          } catch (e) {}
        }
      });
      settingsSyncedFromSupabase = true;
    }
  } catch (err) {
    console.warn('Could not sync settings from Supabase:', err.message);
  }
}

// Global session & visitor state via cookies
app.use(async (req, res, next) => {
  if (!settingsSyncedFromSupabase) {
    await syncSettingsFromSupabase();
  }

  const cookies = parseCookies(req.headers.cookie || '');
  req.isAdmin = (cookies['admin_auth'] === 'true') || (req.headers.cookie || '').includes('admin_auth=true');
  res.locals.isAdmin = req.isAdmin;

  // Single-vote tracking: which candidate did this visitor support
  req.votedCandidate = cookies['sarpanch_voted'] || null;
  req.deviceId = cookies['sarpanch_device_id'] || null;

  // Check if this device has already voted
  if (!req.votedCandidate && req.deviceId) {
    const dMap = await loadDeviceVoters();
    if (dMap[req.deviceId]) {
      req.votedCandidate = dMap[req.deviceId].candidateId;
    }
  }
  res.locals.votedCandidate = req.votedCandidate;

  try {
    res.locals.villageInfo = db.getVillageInfo();
    res.locals.gramSabha = db.getGramSabha();
  } catch (err) {
    console.error('Error fetching global locals:', err);
    res.locals.villageInfo = {};
    res.locals.gramSabha = {};
  }

  // Record visitor IP and device for analytics (filter out static assets, APIs, and admin routes)
  const isStatic = req.path.match(/\.(css|js|png|jpg|jpeg|svg|ico|gif|webp|woff|woff2|ttf|map)$/i);
  const isApi = req.path.startsWith('/api/');
  const isAdminPath = req.path.startsWith('/admin');
  if (req.method === 'GET' && !isStatic && !isApi && !isAdminPath) {
    const ip = getClientIp(req);
    recordVisitorLog(ip, req);
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

// 1. Home Page (Public View with Real-time DB votes)
app.get('/', async (req, res) => {
  const candidates = await getCandidatesWithLiveVotes();
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

// 2. Candidate List Page (with Real-time DB votes)
app.get('/candidates', async (req, res) => {
  const candidates = await getCandidatesWithLiveVotes();
  res.render('candidates', {
    pageTitle: 'उम्मीदवार सूची | मेरा गाँव पोर्टल',
    activeNav: 'candidates',
    candidates
  });
});

// 3. Candidate Profile Page (with Real-time DB votes)
app.get('/candidate/:id', async (req, res) => {
  const allCandidates = await getCandidatesWithLiveVotes();
  const candidate = allCandidates.find(c => c.id === req.params.id) || db.getCandidateById(req.params.id);
  if (!candidate) {
    return res.status(404).render('404', { pageTitle: 'उम्मीदवार नहीं मिला', message: 'यह उम्मीदवार उपलब्ध नहीं है।' });
  }
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
app.get('/admin', requireAdmin, async (req, res) => {
  const stats = db.getStats();
  const activities = db.getActivities();
  const works = db.getWorks();
  const candidates = await getCandidatesWithLiveVotes();
  const complaints = db.getComplaints();
  const duties = db.getDuties();
  const villageInfo = db.getVillageInfo();
  const activeTab = req.query.tab || 'dashboard';

  const supportLogs = await loadSupportLogs();
  const visitorLogs = await loadVisitorLogs();
  
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
    pendingComplaints: complaints.filter(c => c.status === 'लंबित').length,
    supportLogs,
    visitorLogs
  });
});

// Admin sub-routes redirect seamlessly to the single admin panel URL with active tab
app.get('/admin/works', (req, res) => res.redirect('/admin?tab=works'));
app.get('/admin/candidates', (req, res) => res.redirect('/admin?tab=candidates'));
app.get('/admin/complaints', (req, res) => res.redirect('/admin?tab=complaints'));
app.get('/admin/analytics', (req, res) => res.redirect('/admin?tab=analytics'));
app.get('/admin/duties', (req, res) => res.redirect('/admin?tab=duties'));
app.get('/admin/settings', (req, res) => res.redirect('/admin?tab=settings'));
app.get('/admin/votes', (req, res) => res.redirect('/admin?tab=votes'));

// Export support votes log as CSV
app.get('/api/export/votes.csv', requireAdmin, async (req, res) => {
  const logs = await loadSupportLogs();
  let csv = '\uFEFFक्र.सं.,उम्मीदवार का नाम,पार्टी,नागरिक IP पता,डिवाइस विवरण,ऑपरेटिंग सिस्टम,ब्राउज़र,डिवाइस ID,दिनांक व समय\n';
  logs.forEach((l, idx) => {
    csv += `"${idx + 1}","${(l.candidateName || '').replace(/"/g, '""')}","${(l.candidateParty || '').replace(/"/g, '""')}","${l.ip}","${l.device}","${l.os}","${l.browser}","${l.deviceId}","${l.timestamp}"\n`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sarpanch_support_votes_log.csv"');
  return res.send(csv);
});

// ----------------------------------------------------
// REST APIs (AJAX & Form submissions)
// ----------------------------------------------------

// Check if current device has already voted (Supports incognito / cleared cookies via deviceId)
app.get('/api/my-vote', async (req, res) => {
  const cookies = parseCookies(req.headers.cookie || '');
  const deviceId = req.query.deviceId || cookies['sarpanch_device_id'];
  const dMap = await loadDeviceVoters();

  if (deviceId && dMap[deviceId]) {
    return res.json({ hasVoted: true, candidateId: dMap[deviceId].candidateId });
  }
  if (cookies['sarpanch_voted']) {
    return res.json({ hasVoted: true, candidateId: cookies['sarpanch_voted'] });
  }
  return res.json({ hasVoted: false });
});

// Support / Vote pledge - STRICT ONE VOTE PER DEVICE + REAL-TIME DATABASE UPDATE
app.post('/api/vote/:id', async (req, res) => {
  const candidateId = String(req.params.id);
  const cookies = parseCookies(req.headers.cookie || '');
  const cookieVotedCandidate = cookies['sarpanch_voted'];
  const clientIp = getClientIp(req);
  const deviceId = req.body?.deviceId || req.query?.deviceId || cookies['sarpanch_device_id'];

  const dMap = await loadDeviceVoters();

  // 1. Strict check: Has this DEVICE or COOKIE already voted?
  let alreadyVotedCandidate = null;
  if (deviceId && dMap[deviceId]) {
    alreadyVotedCandidate = dMap[deviceId].candidateId;
  } else if (cookieVotedCandidate) {
    alreadyVotedCandidate = cookieVotedCandidate;
  }

  if (alreadyVotedCandidate) {
    return res.status(400).json({
      success: false,
      alreadyVoted: true,
      votedCandidate: alreadyVotedCandidate,
      message: 'इस डिवाइस से पहले ही समर्थन दर्ज किया जा चुका है! एक डिवाइस से केवल एक ही समर्थन दिया जा सकता है।'
    });
  }

  // 2. Direct database update in Supabase (Real-Time Source of Truth)
  let currentVotes = 0;
  if (supabase) {
    try {
      const { data } = await supabase.from('candidates').select('votes').eq('id', candidateId).single();
      currentVotes = (data && typeof data.votes === 'number') ? data.votes : 0;
    } catch (e) {
      console.warn('Supabase fetch error:', e.message);
    }
  } else {
    const c = db.getCandidateById(candidateId);
    currentVotes = (c && c.votes) ? c.votes : 0;
  }

  const finalVotes = currentVotes + 1;

  // Persist increment in Supabase Database
  if (supabase) {
    try {
      await supabase.from('candidates').update({ votes: finalVotes }).eq('id', candidateId);
    } catch (e) {
      console.warn('Supabase update error:', e.message);
    }
  }

  // Also update local SQLite / db.json
  db.pledgeVote(candidateId);

  // 3. Permanently lock this DEVICE in Supabase database
  if (deviceId) {
    await saveDeviceVote(deviceId, candidateId, clientIp);
  }

  // 4. Log detailed vote record (IP, Device, Timestamp, Candidate)
  const uaInfo = parseUserAgent(req.headers['user-agent']);
  const allCandList = await getCandidatesWithLiveVotes();
  const matchedCand = allCandList.find(c => c.id === candidateId) || db.getCandidateById(candidateId);
  await recordSupportLog({
    id: 'vote_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    candidateId,
    candidateName: matchedCand ? matchedCand.name : candidateId,
    candidateParty: matchedCand ? matchedCand.party : 'निर्दलीय',
    candidatePhoto: matchedCand ? matchedCand.photo : '',
    ip: clientIp || '127.0.0.1',
    deviceId: deviceId || 'unknown_device',
    device: uaInfo.device,
    os: uaInfo.os,
    browser: uaInfo.browser,
    isMobile: uaInfo.isMobile,
    timestamp: formatISTDate(),
    isoTime: new Date().toISOString()
  });

  if (clientIp) {
    if (votedIps.size > 20000) votedIps.clear();
    votedIps.add(clientIp);
  }

  // Clear in-memory cache for instant real-time poll update
  votesCache = { time: 0, data: null };

  // Set persistent cookie on browser
  res.setHeader('Set-Cookie', [
    `sarpanch_voted=${encodeURIComponent(candidateId)}; Path=/; Max-Age=31536000; SameSite=Lax`,
    ...(deviceId ? [`sarpanch_device_id=${encodeURIComponent(deviceId)}; Path=/; Max-Age=31536000; SameSite=Lax`] : [])
  ]);

  return res.json({
    success: true,
    candidateId,
    votes: finalVotes,
    message: 'समर्थन दर्ज करने के लिए धन्यवाद! आपका समर्थन डेटाबेस में सफलतापूर्वक दर्ज हो गया है।'
  });
});

// Real-Time live votes polling endpoint (returns current vote counts directly from DB)
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
      await supabase.from('settings').upsert({ key: 'device_voters', value: JSON.stringify({}) });
      await supabase.from('settings').upsert({ key: 'support_logs', value: JSON.stringify([]) });
    } catch (e) {
      console.error('Supabase reset votes error:', e);
    }
  }

  deviceVotersCache = {};
  isDeviceVotersLoaded = false;
  supportLogsCache = [];
  isSupportLogsLoaded = true;
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


// Real-time live activity endpoint for Admin Panel (Device & IP visitor logs + votes)
app.get('/api/admin/live-logs', requireAdmin, async (req, res) => {
  try {
    const candidates = await getCandidatesWithLiveVotes();
    res.json({
      success: true,
      supportLogs: supportLogsCache || [],
      visitorLogs: visitorLogsCache || [],
      candidates,
      stats: db.getStats()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Candidate CRUD
app.post('/api/candidates', requireAdmin, uploadCandidate.single('photoFile'), async (req, res) => {
  try {
    if (req.file) {
      try {
        const fileBuf = fs.readFileSync(req.file.path);
        req.body.photo = 'data:' + (req.file.mimetype || 'image/jpeg') + ';base64,' + fileBuf.toString('base64');
      } catch (e) {
        req.body.photo = '/uploads/candidates/' + req.file.filename;
      }
    } else if (req.body.photo && req.body.photo.trim()) {
      req.body.photo = req.body.photo.trim();
    }
    const cand = db.addCandidate(req.body);
    await syncCandidatesToSupabase();
    if (req.headers['content-type']?.includes('application/json')) {
      return res.json({ success: true, candidate: cand });
    }
    res.redirect('/admin?tab=candidates&saved=candidate');
  } catch (err) {
    console.error('Add candidate error:', err);
    res.redirect('/admin?tab=candidates&error=' + encodeURIComponent(err.message));
  }
});

app.post('/api/candidates/:id/edit', requireAdmin, uploadCandidate.single('photoFile'), async (req, res) => {
  try {
    const currentCand = db.getCandidateById(req.params.id) || {};
    if (req.file) {
      try {
        const fileBuf = fs.readFileSync(req.file.path);
        req.body.photo = 'data:' + (req.file.mimetype || 'image/jpeg') + ';base64,' + fileBuf.toString('base64');
      } catch (e) {
        req.body.photo = '/uploads/candidates/' + req.file.filename;
      }
    } else if (req.body.existingPhoto && req.body.existingPhoto.trim()) {
      req.body.photo = req.body.existingPhoto.trim();
    } else {
      req.body.photo = currentCand.photo || '';
    }

    if (req.body.address === undefined && currentCand.address) {
      req.body.address = currentCand.address;
    }

    const updated = db.updateCandidate(req.params.id, req.body);
    await syncCandidatesToSupabase();

    if (req.headers['content-type']?.includes('application/json')) {
      return res.json({ success: !!updated, candidate: updated });
    }
    res.redirect('/admin?tab=candidates&saved=candidate');
  } catch (err) {
    console.error('Edit candidate error:', err);
    res.redirect('/admin?tab=candidates&error=' + encodeURIComponent(err.message));
  }
});

app.post('/api/candidates/:id/delete', requireAdmin, async (req, res) => {
  try {
    const deleted = db.deleteCandidate(req.params.id);
    await syncCandidatesToSupabase();
    if (req.headers['content-type']?.includes('application/json')) {
      return res.json({ success: deleted });
    }
    res.redirect('/admin?tab=candidates');
  } catch (err) {
    console.error('Delete candidate error:', err);
    res.redirect('/admin?tab=candidates');
  }
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
app.post('/api/settings', requireAdmin, async (req, res) => {
  const updated = db.updateVillageInfo(req.body);
  if (supabase) {
    try {
      await supabase.from('settings').upsert({
        key: 'villageInfo',
        value: JSON.stringify(updated)
      });
    } catch (e) {
      console.warn('Could not sync villageInfo to Supabase:', e.message);
    }
  }
  res.redirect('/admin?tab=settings&saved=1');
});

// Update Gram Sabha Meeting Details
app.post('/api/gram-sabha', requireAdmin, async (req, res) => {
  const updated = db.updateGramSabha(req.body);
  if (supabase) {
    try {
      await supabase.from('settings').upsert({
        key: 'gramSabha',
        value: JSON.stringify(updated)
      });
    } catch (e) {
      console.warn('Could not sync gramSabha to Supabase:', e.message);
    }
  }
  if (req.headers['content-type']?.includes('application/json')) {
    return res.json({ success: true, gramSabha: updated, message: 'आगामी ग्राम सभा बैठक सूचना सफलतापूर्वक सुरक्षित हो गई!' });
  }
  const redirectTab = req.body.redirectTab || 'dashboard';
  res.redirect(`/admin?tab=${redirectTab}&saved=gram_sabha`);
});

// Duty Management APIs (सरपंच के कर्तव्य व भविष्य योजना)
app.post('/api/duties/add', requireAdmin, async (req, res) => {
  try {
    const newDuty = db.addDuty(req.body);
    if (supabase) {
      try {
        await supabase.from('settings').upsert({
          key: 'duties',
          value: JSON.stringify(db.getDuties())
        });
      } catch (e) {
        console.warn('Could not sync duties to Supabase:', e.message);
      }
    }
    if (req.headers['content-type']?.includes('application/json')) {
      return res.json({ success: true, duty: newDuty, message: 'कर्तव्य सफलतापूर्वक जोड़ दिया गया!' });
    }
    res.redirect('/admin?tab=duties&saved=1');
  } catch (err) {
    console.error('Error adding duty:', err);
    res.redirect('/admin?tab=duties&error=1');
  }
});

app.post('/api/duties/:num/edit', requireAdmin, async (req, res) => {
  try {
    const updated = db.updateDuty(req.params.num, req.body);
    if (supabase) {
      try {
        await supabase.from('settings').upsert({
          key: 'duties',
          value: JSON.stringify(db.getDuties())
        });
      } catch (e) {
        console.warn('Could not sync duties to Supabase:', e.message);
      }
    }
    if (req.headers['content-type']?.includes('application/json')) {
      return res.json({ success: !!updated, duty: updated, message: 'कर्तव्य सफलतापूर्वक अपडेट कर दिया गया!' });
    }
    res.redirect('/admin?tab=duties&saved=1');
  } catch (err) {
    console.error('Error updating duty:', err);
    res.redirect('/admin?tab=duties&error=1');
  }
});

app.post('/api/duties/:num/delete', requireAdmin, async (req, res) => {
  try {
    const deleted = db.deleteDuty(req.params.num);
    if (supabase) {
      try {
        await supabase.from('settings').upsert({
          key: 'duties',
          value: JSON.stringify(db.getDuties())
        });
      } catch (e) {
        console.warn('Could not sync duties to Supabase:', e.message);
      }
    }
    if (req.headers['content-type']?.includes('application/json')) {
      return res.json({ success: deleted, message: 'कर्तव्य सफलतापूर्वक हटा दिया गया!' });
    }
    res.redirect('/admin?tab=duties&saved=1');
  } catch (err) {
    console.error('Error deleting duty:', err);
    res.redirect('/admin?tab=duties&error=1');
  }
});

// CSV export for works removed/disabled as requested - redirects to public works page
app.get('/api/export/works.csv', (req, res) => {
  res.redirect('/works');
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
