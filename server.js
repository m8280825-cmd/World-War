const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (IS_PRODUCTION ? (() => { throw new Error('JWT_SECRET must be set in production'); })() : 'local-dev-secret-change-me');
const PORT = Number(process.env.PORT) || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const DEV_OTP_MODE = process.env.DEV_OTP_MODE === 'true';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }
});

if (IS_PRODUCTION && !ADMIN_PASSWORD) {
  console.warn('WARNING: ADMIN_PASSWORD is not set. A first-run admin account will not be created.');
}
const DB_PATH = path.join(__dirname, 'data/db.json');

// ========== Simple JSON Database ==========
function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (e) {}
  return null;
}

function saveDB() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

let db = loadDB();
if (db && !db.ai_settings) {
  db.ai_settings = { enabled: true, auto_roles: true, auto_scenarios: true, auto_statements: true, interval_minutes: 2 };
  saveDB();
}
if (db && !db.shop_offers) {
  db.shop_offers = {};
  saveDB();
}
if (db && !db.alliance_requests) {
  db.alliance_requests = [];
  saveDB();
}
if (db && !db.diplomacy) { db.diplomacy = []; saveDB(); }
if (db && !db.events) { db.events = []; saveDB(); }
if (db && !db.achievements_log) { db.achievements_log = []; saveDB(); }
if (db && !db.blackmarket) { db.blackmarket = []; saveDB(); }
if (!db) {
  db = {
    users: [],
    countries: [],
    player_countries: [],
    statements: [],
    roles: [],
    scenarios: [],
    chat_messages: [],
    equipment: [],
    player_equipment: [],
    alliances: [],
    alliance_members: [],
    alliance_requests: [],
    wars: [],
    otps: [],
    seasons: [],
    notifications: [],
    private_messages: []
  };

  // سیزن اول
  db.seasons.push({
    id: uuidv4(),
    name: 'سیزن ۱',
    status: 'active',
    started_at: new Date().toISOString(),
    ended_at: null,
    winner: null
  });

  db.ai_settings = {
    enabled: true,
    auto_roles: true,
    auto_scenarios: true,
    auto_statements: true,
    interval_minutes: 2
  };

  // Seed countries with advantages/disadvantages and map colors
  const countryList = [
    { name: 'ایران', flag: '🇮🇷', is_vip: 0, base_budget: 600, description: 'قدرت منطقه‌ای', region: 'خاورمیانه', color: '#16a34a',
      advantages: ['نفت و گاز فراوان', 'موقعیت استراتژیک', 'نیروی موشکی قوی'], disadvantages: ['تحریم‌های بین‌المللی', 'تنش منطقه‌ای'] },
    { name: 'آمریکا', flag: '🇺🇸', is_vip: 1, base_budget: 1500, description: 'ابرقدرت', region: 'آمریکای شمالی', color: '#2563eb',
      advantages: ['بودجه نظامی عظیم', 'فناوری پیشرفته', 'اتحادهای جهانی'], disadvantages: ['درگیری در جبهه‌های متعدد', 'هزینه نگهداری بالا'] },
    { name: 'روسیه', flag: '🇷🇺', is_vip: 1, base_budget: 1200, description: 'قدرت نظامی', region: 'اروپا/آسیا', color: '#dc2626',
      advantages: ['سلاح‌های هسته‌ای', 'منابع انرژی', 'تجربه جنگی'], disadvantages: ['اقتصاد وابسته به نفت', 'تحریم‌ها'] },
    { name: 'چین', flag: '🇨🇳', is_vip: 1, base_budget: 1300, description: 'قدرت اقتصادی', region: 'آسیای شرقی', color: '#eab308',
      advantages: ['اقتصاد قوی', 'تولید انبوه', 'جمعیت زیاد'], disadvantages: ['وابستگی به صادرات', 'تنش با همسایگان'] },
    { name: 'آلمان', flag: '🇩🇪', is_vip: 0, base_budget: 800, description: 'صنعتی', region: 'اروپا', color: '#64748b',
      advantages: ['صنعت پیشرفته', 'اقتصاد پایدار'], disadvantages: ['وابستگی به انرژی وارداتی', 'محدودیت نظامی تاریخی'] },
    { name: 'ترکیه', flag: '🇹🇷', is_vip: 0, base_budget: 550, description: 'منطقه‌ای', region: 'خاورمیانه/اروپا', color: '#ea580c',
      advantages: ['موقعیت ژئوپلیتیک', 'ارتش بزرگ'], disadvantages: ['اقتصاد ناپایدار', 'درگیری‌های داخلی'] },
    { name: 'عربستان', flag: '🇸🇦', is_vip: 0, base_budget: 900, description: 'نفت', region: 'خاورمیانه', color: '#15803d',
      advantages: ['درآمد نفتی بالا', 'ذخایر ارزی'], disadvantages: ['وابستگی شدید به نفت', 'تنش منطقه‌ای'] },
    { name: 'هند', flag: '🇮🇳', is_vip: 0, base_budget: 700, description: 'در حال رشد', region: 'آسیای جنوبی', color: '#f97316',
      advantages: ['جمعیت جوان', 'رشد اقتصادی'], disadvantages: ['فقر و نابرابری', 'تنش با همسایگان'] },
    { name: 'ژاپن', flag: '🇯🇵', is_vip: 0, base_budget: 850, description: 'تکنولوژی', region: 'آسیای شرقی', color: '#ec4899',
      advantages: ['فناوری بالا', 'اقتصاد پیشرفته'], disadvantages: ['منابع طبیعی کم', 'پیری جمعیت'] },
    { name: 'کره شمالی', flag: '🇰🇵', is_vip: 1, base_budget: 400, description: 'هسته‌ای', region: 'آسیای شرقی', color: '#7f1d1d',
      advantages: ['برنامه هسته‌ای', 'ارتش بزرگ'], disadvantages: ['اقتصاد ضعیف', 'انزوای بین‌المللی'] },
    { name: 'فرانسه', flag: '🇫🇷', is_vip: 0, base_budget: 750, description: 'اروپایی', region: 'اروپا', color: '#3b82f6',
      advantages: ['سلاح هسته‌ای', 'نفوذ فرهنگی'], disadvantages: ['هزینه‌های اجتماعی بالا'] },
    { name: 'انگلیس', flag: '🇬🇧', is_vip: 0, base_budget: 780, description: 'تاریخی', region: 'اروپا', color: '#8b5cf6',
      advantages: ['نیروی دریایی قوی', 'اتحادهای تاریخی'], disadvantages: ['اقتصاد پس از برگزیت'] },
    { name: 'عراق', flag: '🇮🇶', is_vip: 0, base_budget: 450, description: 'نفتی', region: 'خاورمیانه', color: '#a3e635',
      advantages: ['ذخایر نفت'], disadvantages: ['ناامنی داخلی', 'نفوذ قدرت‌های خارجی'] },
    { name: 'اسرائیل', flag: '🇮🇱', is_vip: 1, base_budget: 950, description: 'فناوری نظامی', region: 'خاورمیانه', color: '#0ea5e9',
      advantages: ['فناوری نظامی پیشرفته', 'حمایت آمریکا'], disadvantages: ['تنش مداوم منطقه‌ای', 'جمعیت کم'] }
  ];
  countryList.forEach(c => {
    db.countries.push({ id: uuidv4(), ...c });
  });

  // Seed equipment — nations: کشورهای مجاز (خالی = همه)
  // consumable: یک‌بار مصرف در نبرد (پدافند/موشک)
  const eqList = [
    { name: 'جت اف-۱۶', type: 'jet', price: 160, power: 42, nations: ['آمریکا','ترکیه','عربستان','اسرائیل','ژاپن','کره شمالی'] },
    { name: 'جت اف-۱۵ ایگل', type: 'jet', price: 210, power: 55, nations: ['آمریکا','عربستان','ژاپن','اسرائیل'] },
    { name: 'جت اف-۲۲ رپتور', type: 'jet', price: 450, power: 95, nations: ['آمریکا'] },
    { name: 'جت اف-۳۵', type: 'jet', price: 380, power: 85, nations: ['آمریکا','انگلیس','اسرائیل','ژاپن'] },
    { name: 'جت سوخو-۳۵', type: 'jet', price: 240, power: 60, nations: ['روسیه','چین','ایران'] },
    { name: 'جت سوخو-۵۷', type: 'jet', price: 420, power: 90, nations: ['روسیه'] },
    { name: 'جت میگ-۲۹', type: 'jet', price: 140, power: 38, nations: ['روسیه','ایران','هند','کره شمالی'] },
    { name: 'جت میگ-۳۱', type: 'jet', price: 190, power: 50, nations: ['روسیه'] },
    { name: 'جت جی-۲۰', type: 'jet', price: 320, power: 75, nations: ['چین'] },
    { name: 'جت رافال', type: 'jet', price: 280, power: 68, nations: ['فرانسه','هند'] },
    { name: 'جت یوروفایتر', type: 'jet', price: 300, power: 72, nations: ['آلمان','انگلیس'] },
    { name: 'جت اف-۴ فانتوم', type: 'jet', price: 90, power: 28, nations: ['ایران','آمریکا','ترکیه','ژاپن'] },
    { name: 'بمب‌افکن بی-۲', type: 'jet', price: 600, power: 110, nations: ['آمریکا'] },
    { name: 'بمب‌افکن تی‌یو-۱۶۰', type: 'jet', price: 550, power: 100, nations: ['روسیه'] },
    { name: 'تانک تی-۹۰', type: 'land', price: 80, power: 25, nations: ['روسیه','هند','عراق'] },
    { name: 'تانک آبرامز', type: 'land', price: 120, power: 35, nations: ['آمریکا','عربستان','عراق'] },
    { name: 'تانک ذوالفقار', type: 'land', price: 70, power: 22, nations: ['ایران'] },
    { name: 'تانک مرکاوا', type: 'land', price: 130, power: 38, nations: ['اسرائیل'] },
    { name: 'ناو هواپیمابر', type: 'sea', price: 800, power: 150, nations: ['آمریکا','چین','انگلیس','فرانسه','هند'] },
    { name: 'ناو جنگی', type: 'sea', price: 300, power: 60, nations: [] },
    { name: 'پدافند اس-۴۰۰', type: 'defense', price: 250, power: 50, nations: ['روسیه','چین','ترکیه'], consumable: true },
    { name: 'پدافند پاتریوت', type: 'defense', price: 280, power: 55, nations: ['آمریکا','عربستان','اسرائیل','ژاپن','آلمان'], consumable: true },
    { name: 'پدافند باور-۳۷۳', type: 'defense', price: 200, power: 42, nations: ['ایران'], consumable: true },
    { name: 'موشک بالستیک', type: 'missile', price: 180, power: 45, nations: [], consumable: true },
    { name: 'موشک قدر', type: 'missile', price: 160, power: 40, nations: ['ایران'], consumable: true },
    { name: 'پهپاد شاهد-۱۳۶', type: 'drone', price: 35, power: 12, nations: ['ایران','روسیه'] },
    { name: 'پهپاد بایراکتار', type: 'drone', price: 60, power: 20, nations: ['ترکیه','عراق','عربستان'] },
    { name: 'پهپاد ریپر', type: 'drone', price: 90, power: 28, nations: ['آمریکا','انگلیس'] },
    { name: 'سرباز ویژه', type: 'infantry', price: 20, power: 8, nations: [] },
    { name: 'موشک هسته‌ای', type: 'nuclear', price: 2500, power: 500, nations: ['آمریکا','روسیه','چین','فرانسه','انگلیس','هند','اسرائیل','کره شمالی'], consumable: true, one_shot: true }
  ];
  eqList.forEach(e => {
    db.equipment.push({ id: uuidv4(), consumable: !!e.consumable, one_shot: !!e.one_shot, nations: e.nations || [], name: e.name, type: e.type, price: e.price, power: e.power });
  });

  // Create admin
  if (ADMIN_PASSWORD) {
    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    db.users.push({
      id: uuidv4(),
      username: ADMIN_USERNAME,
      password: hash,
      is_admin: 1,
      created_at: new Date().toISOString()
    });
    console.log(`Database created. Admin username: ${ADMIN_USERNAME}`);
  } else {
    console.log('Database created without an admin account. Set ADMIN_PASSWORD before first production start.');
  }

  saveDB();
}

// Helpers
function findUser(username) {
  return db.users.find(u => u.username === username);
}
function findPCByUser(userId) {
  return db.player_countries.find(pc => pc.user_id === userId);
}
function findCountry(id) {
  return db.countries.find(c => c.id === id);
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.users.find(u => u.id === payload.id);
    if (!user) return res.status(401).json({ error: 'کاربر یافت نشد' });
    // توکن باید همان نشست فعال باشد
    if (user.active_token && user.active_token !== token) {
      return res.status(401).json({ error: 'نشست شما معتبر نیست. دوباره وارد شوید.' });
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ========== Auth (با شماره موبایل + کد تأیید + یک نشست فعال) ==========
function genOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function cleanOldOTPs() {
  const now = Date.now();
  db.otps = (db.otps || []).filter(o => o.expires > now);
}

app.post('/api/send-otp', (req, res) => {
  const { phone, purpose } = req.body; // purpose: register | login
  if (!phone || !/^09\d{9}$/.test(phone)) {
    return res.status(400).json({ error: 'شماره موبایل معتبر نیست. باید دقیقاً ۱۱ رقم باشد' });
  }
  cleanOldOTPs();
  if (purpose === 'register') {
    if (db.users.find(u => u.phone === phone)) {
      return res.status(400).json({ error: 'این شماره قبلاً ثبت شده' });
    }
  } else if (purpose === 'login') {
    if (!db.users.find(u => u.phone === phone)) {
      return res.status(400).json({ error: 'این شماره ثبت‌نام نشده' });
    }
  }
  const code = genOTP();
  db.otps = (db.otps || []).filter(o => o.phone !== phone);
  db.otps.push({ phone, code, purpose: purpose || 'login', expires: Date.now() + 5 * 60 * 1000 });
  saveDB();
  // In production, connect this endpoint to an SMS provider. Never expose OTPs in API responses.
  console.log(`[OTP] ${phone} => ${code}`);
  const response = { success: true, message: 'کد تأیید ارسال شد' };
  if (DEV_OTP_MODE) response.dev_code = code;
  res.json(response);
});

app.post('/api/register', (req, res) => {
  const { username, password, phone, otp } = req.body;
  if (!username || !password || username.length < 3) {
    return res.status(400).json({ error: 'نام کاربری حداقل ۳ حرف و رمز الزامی است' });
  }
  if (!phone || !/^09\d{9}$/.test(phone)) {
    return res.status(400).json({ error: 'شماره موبایل معتبر نیست. باید دقیقاً ۱۱ رقم باشد' });
  }
  if (!otp) return res.status(400).json({ error: 'کد تأیید الزامی است' });
  if (findUser(username)) {
    return res.status(400).json({ error: 'این نام کاربری قبلاً ثبت شده' });
  }
  if (db.users.find(u => u.phone === phone)) {
    return res.status(400).json({ error: 'این شماره قبلاً ثبت شده' });
  }
  cleanOldOTPs();
  const otpRow = (db.otps || []).find(o => o.phone === phone && o.code === String(otp) && o.purpose === 'register');
  if (!otpRow) return res.status(400).json({ error: 'کد تأیید اشتباه یا منقضی شده' });
  db.otps = db.otps.filter(o => o.phone !== phone);

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  const token = jwt.sign({ id, username, is_admin: 0 }, JWT_SECRET, { expiresIn: '7d' });
  db.users.push({
    id, username, password: hash, phone, is_admin: 0,
    active_token: token,
    created_at: new Date().toISOString()
  });
  saveDB();
  res.json({ token, user: { id, username, is_admin: 0, phone } });
});

app.post('/api/login', (req, res) => {
  const { username, password, phone, otp } = req.body;
  // ورود با نام‌کاربری+رمز یا با موبایل+کد
  let user = null;
  if (phone && otp) {
    if (!/^09\d{9}$/.test(phone)) return res.status(400).json({ error: 'شماره موبایل معتبر نیست. باید دقیقاً ۱۱ رقم باشد' });
    cleanOldOTPs();
    const otpRow = (db.otps || []).find(o => o.phone === phone && o.code === String(otp));
    if (!otpRow) return res.status(400).json({ error: 'کد تأیید اشتباه یا منقضی شده' });
    db.otps = db.otps.filter(o => o.phone !== phone);
    user = db.users.find(u => u.phone === phone);
    if (!user) return res.status(401).json({ error: 'کاربری با این شماره یافت نشد' });
  } else {
    if (!username || !password) return res.status(400).json({ error: 'نام کاربری و رمز الزامی است' });
    user = findUser(username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'نام کاربری یا رمز اشتباه است' });
    }
    // اگر کاربر شماره دارد، برای امنیت بیشتر می‌توان OTP اجباری کرد — فعلاً اختیاری
  }
  // اگر قبلاً کسی با این اکانت وارد شده، ورود جدید ممنوع
  if (user.active_token) {
    try {
      jwt.verify(user.active_token, JWT_SECRET);
      return res.status(403).json({ error: 'قبلاً کسی با این نام وارد شده است. ابتدا از حساب خارج شوید.' });
    } catch (e) {
      // توکن قبلی منقضی شده → اجازه ورود
    }
  }
  const token = jwt.sign({ id: user.id, username: user.username, is_admin: user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
  user.active_token = token;
  saveDB();
  res.json({ token, user: { id: user.id, username: user.username, is_admin: user.is_admin, phone: user.phone || null } });
});

// ========== Countries ==========
app.post('/api/logout', auth, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (user) {
    user.active_token = null;
    saveDB();
  }
  res.json({ success: true });
});

app.get('/api/countries', auth, (req, res) => {
  const result = db.countries.map(c => {
    const pc = db.player_countries.find(p => p.country_id === c.id);
    const owner = pc ? db.users.find(u => u.id === pc.user_id)?.username : null;
    return {
      ...c,
      taken: !!pc,
      owner,
      owner_color: pc ? (c.color || '#64748b') : '#1e293b',
      military_power: pc ? pc.military_power : 0
    };
  });
  res.json(result);
});

app.post('/api/choose-country', auth, (req, res) => {
  const { country_id } = req.body;
  if (findPCByUser(req.user.id)) {
    return res.status(400).json({ error: 'شما قبلاً کشور انتخاب کرده‌اید' });
  }
  const country = findCountry(country_id);
  if (!country) return res.status(404).json({ error: 'کشور یافت نشد' });
  if (db.player_countries.find(p => p.country_id === country_id)) {
    return res.status(400).json({ error: 'این کشور قبلاً گرفته شده' });
  }
  const id = uuidv4();
  db.player_countries.push({
    id, user_id: req.user.id, country_id,
    budget: country.base_budget, income: 50, military_power: 100,
    skill_points: 1,
    skills: {
      luck: 0, arsenal: 0,
      unlock_jet: 0, unlock_land: 0, unlock_sea: 0,
      unlock_defense: 0, unlock_missile: 0, unlock_drone: 0, unlock_infantry: 1,
      unlock_production: 0, unlock_design: 0, unlock_nuclear: 0
    },
    created_at: new Date().toISOString()
  });
  saveDB();
  res.json({ success: true, player_country_id: id });
});

app.get('/api/my-country', auth, (req, res) => {
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.json({ has_country: false });
  const country = findCountry(pc.country_id);
  const equipment = db.player_equipment
    .filter(pe => pe.player_country_id === pc.id)
    .map(pe => {
      const eq = db.equipment.find(e => e.id === pe.equipment_id);
      return eq ? { name: eq.name, type: eq.type, power: eq.power, quantity: pe.quantity } : null;
    }).filter(Boolean);
  const statements = db.statements.filter(s => s.player_country_id === pc.id).slice(-10).reverse();
  const roles = db.roles.filter(r => r.player_country_id === pc.id).slice(-10).reverse();
  const homeCountry = country;
  res.json({
    has_country: true,
    country: {
      ...pc,
      name: homeCountry.name,
      flag: homeCountry.flag,
      is_vip: homeCountry.is_vip,
      description: homeCountry.description,
      advantages: homeCountry.advantages || [],
      disadvantages: homeCountry.disadvantages || [],
      conquered: pc.conquered || []
    },
    equipment, statements, roles
  });
});

// ========== Actions ==========
app.post('/api/statement', auth, (req, res) => {
  const { content } = req.body;
  if (!content || content.length < 10) return res.status(400).json({ error: 'بیانیه حداقل ۱۰ حرف باشد' });
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'اول کشور انتخاب کنید' });
  const reviewer = req.body.reviewer === 'admin' ? 'admin' : 'ai';
  db.statements.push({ id: uuidv4(), player_country_id: pc.id, content, reviewer, created_at: new Date().toISOString() });
  saveDB();
  res.json({ success: true });
});

app.post('/api/role', auth, (req, res) => {
  const { type, title, content, budget_cost } = req.body;
  if (!type || !title || !content) return res.status(400).json({ error: 'اطلاعات ناقص است' });
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'اول کشور انتخاب کنید' });
  const cost = budget_cost || 0;
  if (pc.budget < cost) return res.status(400).json({ error: 'بودجه کافی ندارید' });
  pc.budget -= cost;
  const reviewer = req.body.reviewer === 'admin' ? 'admin' : 'ai';
  db.roles.push({
    id: uuidv4(), player_country_id: pc.id, type, title, content,
    budget_cost: cost, status: 'pending', reward: 0, reviewer,
    created_at: new Date().toISOString()
  });
  saveDB();
  res.json({ success: true });
});

app.post('/api/scenario', auth, (req, res) => {
  const { title, content, defender_country_id } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'عنوان و متن الزامی است' });
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'اول کشور انتخاب کنید' });
  const reviewer = req.body.reviewer === 'admin' ? 'admin' : 'ai';
  db.scenarios.push({
    id: uuidv4(), attacker_id: pc.id, defender_id: defender_country_id || null,
    title, content, status: 'pending', result: null, reviewer,
    attacker_forces: [], defender_forces: [],
    attacker_power: 0, defender_power: 0,
    progress: 50,
    created_at: new Date().toISOString()
  });
  saveDB();
  res.json({ success: true });
});

// ========== Players & Shop ==========
app.get('/api/players', auth, (req, res) => {
  const players = db.player_countries.map(pc => {
    const c = findCountry(pc.country_id);
    const u = db.users.find(u => u.id === pc.user_id);
    return {
      id: pc.id, budget: pc.budget, income: pc.income, military_power: pc.military_power,
      name: c?.name, flag: c?.flag, username: u?.username
    };
  }).sort((a, b) => b.military_power - a.military_power || b.budget - a.budget);
  res.json(players);
});



// ========== درخت مهارت ==========
const SKILL_DEFS = {
  luck: {
    name: 'شانس فروشگاه',
    desc: 'شانس حضور تجهیزات بهتر در فروشگاه شخصی',
    max: 5,
    costs: [50, 100, 180, 280, 400],
    // زمان هر لول به ثانیه
    durations: [60, 120, 180, 300, 420]
  },
  arsenal: {
    name: 'ظرفیت زرادخانه',
    desc: 'تعداد کل واحدهایی که می‌توانی نگه داری',
    max: 5,
    costs: [40, 80, 140, 220, 320],
    durations: [45, 90, 150, 240, 360]
  },
  unlock_jet: {
    name: 'مجوز خرید جت',
    desc: 'باز کردن خرید هواپیما و جت در فروشگاه',
    max: 1,
    costs: [120],
    durations: [180],
    unlock_type: 'jet'
  },
  unlock_land: {
    name: 'مجوز خرید تانک',
    desc: 'باز کردن خرید تانک و نیروی زمینی',
    max: 1,
    costs: [80],
    durations: [120],
    unlock_type: 'land'
  },
  unlock_sea: {
    name: 'مجوز خرید دریایی',
    desc: 'باز کردن خرید ناو و تجهیزات دریایی',
    max: 1,
    costs: [100],
    durations: [150],
    unlock_type: 'sea'
  },
  unlock_defense: {
    name: 'مجوز خرید پدافند',
    desc: 'باز کردن خرید سامانه‌های پدافندی',
    max: 1,
    costs: [90],
    durations: [120],
    unlock_type: 'defense'
  },
  unlock_missile: {
    name: 'مجوز خرید موشک',
    desc: 'باز کردن خرید موشک‌های بالستیک',
    max: 1,
    costs: [110],
    durations: [150],
    unlock_type: 'missile'
  },
  unlock_drone: {
    name: 'مجوز خرید پهپاد',
    desc: 'باز کردن خرید پهپاد',
    max: 1,
    costs: [60],
    durations: [90],
    unlock_type: 'drone'
  },
  unlock_infantry: {
    name: 'نیروی پیاده',
    desc: 'خرید سرباز (از ابتدا باز است)',
    max: 1,
    costs: [0],
    durations: [0],
    unlock_type: 'infantry'
  },
  unlock_production: {
    name: 'باز کردن کارخانه',
    desc: 'باز کردن سربرگ تولید برای ساخت تجهیزات استاندارد',
    max: 1,
    costs: [150],
    durations: [180]
  },
  unlock_design: {
    name: 'طراحی سفارشی نیرو',
    desc: 'ساخت نیروی اختصاصی با نام و قدرت دلخواه',
    max: 1,
    costs: [250],
    durations: [300]
  },
  unlock_nuclear: {
    name: 'برنامه هسته‌ای',
    desc: 'مجوز خرید/ساخت موشک هسته‌ای',
    max: 1,
    costs: [500],
    durations: [600]
  }
};

const MAX_CONCURRENT_UPGRADES = 2;

function ensureSkills(pc) {
  if (!pc.skills) {
    pc.skills = {
      luck: 0, arsenal: 0,
      unlock_jet: 0, unlock_land: 0, unlock_sea: 0,
      unlock_defense: 0, unlock_missile: 0, unlock_drone: 0, unlock_infantry: 1,
      unlock_production: 0, unlock_design: 0, unlock_nuclear: 0
    };
  }
  if (pc.skill_points == null) pc.skill_points = 0;
  if (pc.skills.unlock_infantry == null) pc.skills.unlock_infantry = 1;
  if (!pc.skill_upgrades) pc.skill_upgrades = [];
  return pc.skills;
}

/** ارتقاهای تمام‌شده را اعمال می‌کند */
function processSkillUpgrades(pc) {
  ensureSkills(pc);
  const now = Date.now();
  let changed = false;
  const remaining = [];
  (pc.skill_upgrades || []).forEach(u => {
    if (u.finishes_at <= now) {
      pc.skills[u.skill_key] = (pc.skills[u.skill_key] || 0) + 1;
      changed = true;
      try {
        notify(pc.user_id, '✅ ارتقای مهارت «' + (SKILL_DEFS[u.skill_key]?.name || u.skill_key) + '» تمام شد (لول ' + pc.skills[u.skill_key] + ')');
      } catch (e) {}
    } else {
      remaining.push(u);
    }
  });
  pc.skill_upgrades = remaining;
  return changed;
}

function activeUpgradeCount(pc) {
  ensureSkills(pc);
  const now = Date.now();
  return (pc.skill_upgrades || []).filter(u => u.finishes_at > now).length;
}

function canBuyType(pc, type) {
  const s = ensureSkills(pc);
  const map = {
    jet: 'unlock_jet', land: 'unlock_land', sea: 'unlock_sea',
    defense: 'unlock_defense', missile: 'unlock_missile',
    drone: 'unlock_drone', infantry: 'unlock_infantry',
    nuclear: 'unlock_nuclear'
  };
  const key = map[type];
  if (!key) return true;
  return (s[key] || 0) >= 1;
}

function arsenalCapacity(pc) {
  const s = ensureSkills(pc);
  const lv = s.arsenal || 0;
  return 20 + lv * 15;
}

function arsenalUsed(pc) {
  return db.player_equipment
    .filter(pe => pe.player_country_id === pc.id)
    .reduce((sum, pe) => sum + (pe.quantity || 0), 0);
}

function luckBonus(pc) {
  const s = ensureSkills(pc);
  return (s.luck || 0) * 8;
}

app.get('/api/skills', auth, (req, res) => {
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'اول کشور انتخاب کنید' });
  if (processSkillUpgrades(pc)) saveDB();
  ensureSkills(pc);
  const now = Date.now();
  const inProgress = (pc.skill_upgrades || []).filter(u => u.finishes_at > now).map(u => ({
    skill_key: u.skill_key,
    name: SKILL_DEFS[u.skill_key]?.name || u.skill_key,
    target_level: u.target_level,
    finishes_at: u.finishes_at,
    remaining_seconds: Math.max(0, Math.ceil((u.finishes_at - now) / 1000)),
    total_seconds: u.total_seconds
  }));
  const skills = Object.keys(SKILL_DEFS).map(key => {
    const def = SKILL_DEFS[key];
    const level = pc.skills[key] || 0;
    const maxed = level >= def.max;
    const nextCost = maxed ? null : def.costs[level];
    const nextDuration = maxed ? null : (def.durations[level] || 60);
    const upgrading = inProgress.find(u => u.skill_key === key) || null;
    return {
      key,
      name: def.name,
      desc: def.desc,
      level,
      max: def.max,
      maxed,
      next_cost: nextCost,
      next_duration_seconds: nextDuration,
      upgrading,
      unlock_type: def.unlock_type || null,
      effect_text: key === 'luck' ? ('+' + luckBonus(pc) + '٪ شانس') :
                   key === 'arsenal' ? ('ظرفیت ' + arsenalCapacity(pc) + ' واحد') :
                   level >= 1 ? 'باز شده' : 'قفل'
    };
  });
  res.json({
    skills,
    in_progress: inProgress,
    active_upgrades: inProgress.length,
    max_concurrent: MAX_CONCURRENT_UPGRADES,
    budget: pc.budget,
    arsenal_used: arsenalUsed(pc),
    arsenal_capacity: arsenalCapacity(pc)
  });
});

app.post('/api/skills/upgrade', auth, (req, res) => {
  const { skill_key } = req.body;
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'اول کشور انتخاب کنید' });
  processSkillUpgrades(pc);
  const def = SKILL_DEFS[skill_key];
  if (!def) return res.status(400).json({ error: 'مهارت نامعتبر' });
  ensureSkills(pc);
  if (skill_key === 'unlock_infantry') {
    return res.status(400).json({ error: 'این مهارت از ابتدا باز است' });
  }
  const level = pc.skills[skill_key] || 0;
  if (level >= def.max) return res.status(400).json({ error: 'این مهارت کامل شده' });
  // آیا همین مهارت در حال ارتقا است؟
  const now = Date.now();
  if ((pc.skill_upgrades || []).some(u => u.skill_key === skill_key && u.finishes_at > now)) {
    return res.status(400).json({ error: 'این مهارت الان در حال ارتقا است' });
  }
  if (activeUpgradeCount(pc) >= MAX_CONCURRENT_UPGRADES) {
    return res.status(400).json({ error: 'حداکثر ۲ ارتقا همزمان. صبر کنید یکی تمام شود.' });
  }
  const cost = def.costs[level] || 0;
  const duration = def.durations[level] || 60;
  if (cost > 0 && pc.budget < cost) {
    return res.status(400).json({ error: 'بودجه کافی نیست. نیاز: ' + cost + '$' });
  }
  if (cost > 0) pc.budget -= cost;
  const finishes_at = now + duration * 1000;
  pc.skill_upgrades.push({
    id: uuidv4(),
    skill_key,
    target_level: level + 1,
    started_at: now,
    finishes_at,
    total_seconds: duration,
    cost
  });
  saveDB();
  res.json({
    success: true,
    message: 'ارتقای «' + def.name + '» شروع شد',
    finishes_at,
    remaining_seconds: duration,
    budget: pc.budget,
    active_upgrades: activeUpgradeCount(pc)
  });
});

// ========== فروشگاه شانسی (جدا برای هر بازیکن) ==========

function itemChance(eq) {
  // قدرت بالاتر = شانس کمتر
  const p = eq.power || 10;
  if (p >= 100) return 8;
  if (p >= 80) return 15;
  if (p >= 55) return 28;
  if (p >= 35) return 45;
  if (p >= 20) return 60;
  return 75;
}

function rollStock(chance) {
  // آیا اصلاً در فروشگاه بیاید؟
  if (Math.random() * 100 > chance) return 0;
  // تعداد شانسی
  const r = Math.random();
  if (r < 0.5) return 1;
  if (r < 0.75) return 2 + Math.floor(Math.random() * 2); // 2-3
  if (r < 0.9) return 4 + Math.floor(Math.random() * 3); // 4-6
  return 7 + Math.floor(Math.random() * 4); // 7-10
}

function generateShopForUser(userId) {
  if (!db.shop_offers) db.shop_offers = {};
  const pc = findPCByUser(userId);
  const bonus = pc ? luckBonus(pc) : 0;
  const offers = [];
  const myCountryName = pc ? (findCountry(pc.country_id)?.name) : null;
  db.equipment.forEach(eq => {
    // یونیت‌های سفارشی بازیکن هرگز در فروشگاه عمومی نیستند
    if (eq.custom) return;
    // تجهیزات کشور-محور
    if (eq.nations && eq.nations.length && myCountryName && !eq.nations.includes(myCountryName)) {
      return;
    }
    if (eq.type === 'nuclear' && pc && !(pc.skills && pc.skills.unlock_nuclear >= 1)) {
      return;
    }
    let chance = Math.min(95, itemChance(eq) + bonus);
    if (pc && !canBuyType(pc, eq.type) && eq.type !== 'nuclear') {
      chance = Math.min(chance, 5);
    }
    const stock = rollStock(chance);
    if (stock > 0) {
      offers.push({
        equipment_id: eq.id,
        name: eq.name,
        type: eq.type,
        power: eq.power,
        price: eq.price,
        stock,
        chance,
        max_stock: stock,
        locked: pc ? !canBuyType(pc, eq.type) : false
      });
    }
  });
  if (offers.length < 4) {
    const cheap = db.equipment.filter(e => e.power < 40 && (!pc || canBuyType(pc, e.type))).slice(0, 6);
    cheap.forEach(eq => {
      if (!offers.find(o => o.equipment_id === eq.id)) {
        offers.push({
          equipment_id: eq.id,
          name: eq.name,
          type: eq.type,
          power: eq.power,
          price: eq.price,
          stock: 1 + Math.floor(Math.random() * 3),
          chance: Math.min(95, itemChance(eq) + bonus),
          max_stock: 3,
          locked: false
        });
      }
    });
  }
  const refreshed_at = Date.now();
  const expires_at = refreshed_at + 4 * 60 * 1000;
  db.shop_offers[userId] = { offers, refreshed_at, expires_at };
  saveDB();
  return db.shop_offers[userId];
}

function getShopForUser(userId) {
  if (!db.shop_offers) db.shop_offers = {};
  const shop = db.shop_offers[userId];
  if (!shop || Date.now() >= shop.expires_at) {
    return generateShopForUser(userId);
  }
  return shop;
}

app.get('/api/equipment', auth, (req, res) => {
  const shop = getShopForUser(req.user.id);
  const remaining = Math.max(0, Math.ceil((shop.expires_at - Date.now()) / 1000));
  res.json({
    items: shop.offers.filter(o => o.stock > 0).sort((a, b) => a.price - b.price),
    refreshed_at: shop.refreshed_at,
    expires_at: shop.expires_at,
    remaining_seconds: remaining,
    refresh_minutes: 4
  });
});

app.post('/api/shop/refresh', auth, (req, res) => {
  const shop = generateShopForUser(req.user.id);
  res.json({
    items: shop.offers.filter(o => o.stock > 0),
    remaining_seconds: Math.ceil((shop.expires_at - Date.now()) / 1000)
  });
});

app.post('/api/buy-equipment', auth, (req, res) => {
  const { equipment_id, quantity = 1 } = req.body;
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'اول کشور انتخاب کنید' });
  ensureSkills(pc);
  const shop = getShopForUser(req.user.id);
  const offer = shop.offers.find(o => o.equipment_id === equipment_id);
  if (!offer || offer.stock < qty) {
    return res.status(400).json({ error: 'این تعداد در فروشگاه موجود نیست' });
  }
  const eq = db.equipment.find(e => e.id === equipment_id);
  if (!eq) return res.status(404).json({ error: 'تجهیزات یافت نشد' });
  if (!canBuyType(pc, eq.type)) {
    return res.status(403).json({ error: 'مجوز خرید این نوع نیرو را ندارید. درخت مهارت را ارتقا دهید.' });
  }
  const used = arsenalUsed(pc);
  const cap = arsenalCapacity(pc);
  if (used + qty > cap) {
    return res.status(400).json({ error: 'ظرفیت زرادخانه پر است (' + used + '/' + cap + '). مهارت ظرفیت را ارتقا دهید.' });
  }
  const total = eq.price * qty;
  if (pc.budget < total) return res.status(400).json({ error: 'بودجه کافی نیست' });
  pc.budget -= total;
  pc.military_power += eq.power * qty;
  offer.stock -= qty;
  const existing = db.player_equipment.find(pe => pe.player_country_id === pc.id && pe.equipment_id === equipment_id);
  if (existing) existing.quantity += qty;
  else db.player_equipment.push({ id: uuidv4(), player_country_id: pc.id, equipment_id, quantity: qty });
  try { checkAchievements(pc); } catch(e) {}
  saveDB();
  res.json({ success: true, remaining_stock: offer.stock });
});


// ========== Admin ==========
app.get('/api/admin/roles', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'دسترسی ندارید' });
  const roles = db.roles.filter(r => r.status === 'pending').map(r => {
    const pc = db.player_countries.find(p => p.id === r.player_country_id);
    const c = pc ? findCountry(pc.country_id) : null;
    const u = pc ? db.users.find(u => u.id === pc.user_id) : null;
    return { ...r, country_name: c?.name, username: u?.username };
  });
  res.json(roles);
});

app.post('/api/admin/resolve-role', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'دسترسی ندارید' });
  const { role_id, status, reward } = req.body;
  const role = db.roles.find(r => r.id === role_id);
  if (!role) return res.status(404).json({ error: 'رول یافت نشد' });
  role.status = status;
  role.reward = reward || 0;
  if (status === 'approved' && reward > 0) {
    const pc = db.player_countries.find(p => p.id === role.player_country_id);
    if (pc) {
      pc.budget += reward;
      pc.income += Math.floor(reward / 10);
      notify(pc.user_id, 'رول شما تأیید شد. پاداش: ' + reward + '$');
    }
  } else if (status === 'rejected') {
    const pc = db.player_countries.find(p => p.id === role.player_country_id);
    if (pc) notify(pc.user_id, 'رول شما رد شد.');
  }
  saveDB();
  res.json({ success: true });
});

app.get('/api/admin/scenarios', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'دسترسی ندارید' });
  const scenarios = db.scenarios.filter(s => s.status === 'pending').map(s => {
    const att = db.player_countries.find(p => p.id === s.attacker_id);
    const def = s.defender_id ? db.player_countries.find(p => p.id === s.defender_id) : null;
    return {
      ...s,
      attacker_name: att ? findCountry(att.country_id)?.name : '؟',
      defender_name: def ? findCountry(def.country_id)?.name : null
    };
  });
  res.json(scenarios);
});

app.post('/api/admin/resolve-scenario', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'دسترسی ندارید' });
  const { scenario_id, result, power_change } = req.body;
  const sc = db.scenarios.find(s => s.id === scenario_id);
  if (!sc) return res.status(404).json({ error: 'سناریو یافت نشد' });
  sc.status = 'resolved';
  sc.result = result;
  const att = db.player_countries.find(p => p.id === sc.attacker_id);
  if (power_change && att) {
    att.military_power += power_change;
  }
  // ثبت جنگ + فتح کشور (مزایا و معایب کشور فتح‌شده)
  if (sc.defender_id) {
    const def = db.player_countries.find(p => p.id === sc.defender_id);
    if (att && def) {
      if (!db.wars) db.wars = [];
      const isVictory = result && (result.includes('پیروزی') || result.includes('فتح'));
      db.wars.push({
        id: uuidv4(),
        country1_id: att.country_id,
        country2_id: def.country_id,
        title: sc.title,
        result: result,
        status: isVictory ? 'active' : 'ended',
        started_at: sc.created_at,
        ended_at: new Date().toISOString()
      });
      if (isVictory) {
        const defCountry = db.countries.find(c => c.id === def.country_id);
        if (!att.conquered) att.conquered = [];
        // اضافه کردن کشور فتح‌شده با مزایا و معایبش
        att.conquered.push({
          country_id: def.country_id,
          name: defCountry?.name,
          flag: defCountry?.flag,
          advantages: defCountry?.advantages || [],
          disadvantages: defCountry?.disadvantages || [],
          conquered_at: new Date().toISOString()
        });
        // پاداش فتح: بودجه و قدرت از کشور فتح‌شده
        att.budget += Math.floor((def.budget || 0) * 0.3);
        att.military_power += Math.floor((def.military_power || 0) * 0.2);
        att.income += 15;
        // جریمه مدافع
        def.budget = Math.floor(def.budget * 0.5);
        def.military_power = Math.max(20, Math.floor(def.military_power * 0.6));
        def.income = Math.max(10, def.income - 10);
      }
    }
  }
  saveDB();
  res.json({ success: true });
});

app.post('/api/daily-income', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'فقط ادمین' });
  db.player_countries.forEach(pc => {
    pc.budget += pc.income;
    pc.skill_points = (pc.skill_points || 0) + 1;
  });
  saveDB();
  res.json({ success: true, message: 'درآمد روزانه واریز شد (+۱ امتیاز مهارت برای همه)' });
});

// ========== Chat ==========
app.get('/api/chat', auth, (req, res) => {
  res.json(db.chat_messages.slice(-50));
});

// ========== Alliances ==========
const ALLIANCE_CREATE_COST = 200;

app.get('/api/alliances', auth, (req, res) => {
  if (!db.alliance_requests) db.alliance_requests = [];
  const myPc = findPCByUser(req.user.id);
  const list = db.alliances.map(a => {
    const leaderPC = db.player_countries.find(p => p.id === a.leader_id);
    const leaderC = leaderPC ? findCountry(leaderPC.country_id) : null;
    const leaderU = leaderPC ? db.users.find(u => u.id === leaderPC.user_id) : null;
    const member_count = db.alliance_members.filter(m => m.alliance_id === a.id).length;
    const pending_req = myPc ? db.alliance_requests.find(r => r.alliance_id === a.id && r.player_country_id === myPc.id && r.status === 'pending') : null;
    return {
      ...a,
      leader_country: leaderC?.name,
      leader_name: leaderU?.username,
      member_count,
      my_request_pending: !!pending_req
    };
  }).sort((a, b) => b.member_count - a.member_count);
  res.json({ alliances: list, create_cost: ALLIANCE_CREATE_COST });
});

app.post('/api/alliances', auth, (req, res) => {
  const { name, description } = req.body;
  if (!name || name.length < 2) return res.status(400).json({ error: 'نام اتحاد حداقل ۲ حرف باشد' });
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'اول کشور انتخاب کنید' });
  if (db.alliance_members.find(m => m.player_country_id === pc.id)) {
    return res.status(400).json({ error: 'شما قبلاً عضو یک اتحاد هستید' });
  }
  if (db.alliances.find(a => a.name === name)) {
    return res.status(400).json({ error: 'این نام اتحاد قبلاً استفاده شده' });
  }
  if (pc.budget < ALLIANCE_CREATE_COST) {
    return res.status(400).json({ error: 'بودجه کافی نیست. هزینه ساخت اتحاد: ' + ALLIANCE_CREATE_COST + '$' });
  }
  pc.budget -= ALLIANCE_CREATE_COST;
  const id = uuidv4();
  db.alliances.push({ id, name, leader_id: pc.id, description: description || '', created_at: new Date().toISOString() });
  db.alliance_members.push({ id: uuidv4(), alliance_id: id, player_country_id: pc.id, joined_at: new Date().toISOString() });
  saveDB();
  res.json({ success: true, id, cost: ALLIANCE_CREATE_COST });
});

// درخواست عضویت (نه عضویت مستقیم)
app.post('/api/alliances/join', auth, (req, res) => {
  const { alliance_id } = req.body;
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'اول کشور انتخاب کنید' });
  if (db.alliance_members.find(m => m.player_country_id === pc.id)) {
    return res.status(400).json({ error: 'شما قبلاً عضو یک اتحاد هستید' });
  }
  const alliance = db.alliances.find(a => a.id === alliance_id);
  if (!alliance) return res.status(404).json({ error: 'اتحاد یافت نشد' });
  if (!db.alliance_requests) db.alliance_requests = [];
  const existing = db.alliance_requests.find(r => r.alliance_id === alliance_id && r.player_country_id === pc.id && r.status === 'pending');
  if (existing) return res.status(400).json({ error: 'درخواست شما قبلاً ارسال شده و منتظر تأیید رهبر است' });
  const reqId = uuidv4();
  db.alliance_requests.push({
    id: reqId,
    alliance_id,
    player_country_id: pc.id,
    status: 'pending',
    created_at: new Date().toISOString()
  });
  // نوتیف به رهبر
  const leaderPC = db.player_countries.find(p => p.id === alliance.leader_id);
  const myC = findCountry(pc.country_id);
  if (leaderPC) {
    notify(leaderPC.user_id, '🤝 درخواست عضویت اتحاد از ' + (myC?.flag || '') + ' ' + (myC?.name || '') + ' — بخش اتحاد را ببینید');
  }
  saveDB();
  res.json({ success: true, message: 'درخواست ارسال شد. منتظر تأیید رهبر اتحاد باشید.' });
});

app.get('/api/alliances/requests', auth, (req, res) => {
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.json([]);
  if (!db.alliance_requests) db.alliance_requests = [];
  // درخواست‌هایی که من رهبر اتحادشان هستم
  const myAlliances = db.alliances.filter(a => a.leader_id === pc.id).map(a => a.id);
  const list = db.alliance_requests.filter(r => r.status === 'pending' && myAlliances.includes(r.alliance_id)).map(r => {
    const mpc = db.player_countries.find(p => p.id === r.player_country_id);
    const mc = mpc ? findCountry(mpc.country_id) : null;
    const mu = mpc ? db.users.find(u => u.id === mpc.user_id) : null;
    const al = db.alliances.find(a => a.id === r.alliance_id);
    return {
      id: r.id,
      alliance_id: r.alliance_id,
      alliance_name: al?.name,
      country_name: mc?.name,
      flag: mc?.flag,
      username: mu?.username,
      military_power: mpc?.military_power,
      created_at: r.created_at
    };
  });
  res.json(list);
});

app.post('/api/alliances/respond', auth, (req, res) => {
  const { request_id, accept } = req.body;
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'کشور ندارید' });
  if (!db.alliance_requests) db.alliance_requests = [];
  const request = db.alliance_requests.find(r => r.id === request_id && r.status === 'pending');
  if (!request) return res.status(404).json({ error: 'درخواست یافت نشد' });
  const alliance = db.alliances.find(a => a.id === request.alliance_id);
  if (!alliance || alliance.leader_id !== pc.id) {
    return res.status(403).json({ error: 'فقط رهبر اتحاد می‌تواند پاسخ دهد' });
  }
  const applicant = db.player_countries.find(p => p.id === request.player_country_id);
  if (accept) {
    if (db.alliance_members.find(m => m.player_country_id === request.player_country_id)) {
      request.status = 'rejected';
      saveDB();
      return res.status(400).json({ error: 'این بازیکن الان عضو اتحاد دیگری است' });
    }
    request.status = 'accepted';
    db.alliance_members.push({
      id: uuidv4(),
      alliance_id: alliance.id,
      player_country_id: request.player_country_id,
      joined_at: new Date().toISOString()
    });
    if (applicant) notify(applicant.user_id, '✅ درخواست عضویت شما در اتحاد «' + alliance.name + '» پذیرفته شد');
  } else {
    request.status = 'rejected';
    if (applicant) notify(applicant.user_id, '❌ درخواست عضویت شما در اتحاد «' + alliance.name + '» رد شد');
  }
  saveDB();
  res.json({ success: true });
});

app.post('/api/alliances/leave', auth, (req, res) => {
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'کشور ندارید' });
  const membership = db.alliance_members.find(m => m.player_country_id === pc.id);
  if (!membership) return res.status(400).json({ error: 'عضو هیچ اتحادی نیستید' });
  const alliance = db.alliances.find(a => a.id === membership.alliance_id);
  db.alliance_members = db.alliance_members.filter(m => m.player_country_id !== pc.id);
  if (alliance && alliance.leader_id === pc.id) {
    db.alliance_members = db.alliance_members.filter(m => m.alliance_id !== alliance.id);
    db.alliances = db.alliances.filter(a => a.id !== alliance.id);
    if (db.alliance_requests) {
      db.alliance_requests = db.alliance_requests.filter(r => r.alliance_id !== alliance.id);
    }
  }
  saveDB();
  res.json({ success: true });
});

app.get('/api/my-alliance', auth, (req, res) => {
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.json({ has_alliance: false });
  const membership = db.alliance_members.find(m => m.player_country_id === pc.id);
  if (!membership) return res.json({ has_alliance: false, create_cost: ALLIANCE_CREATE_COST });
  const alliance = db.alliances.find(a => a.id === membership.alliance_id);
  if (!alliance) return res.json({ has_alliance: false });
  const leaderPC = db.player_countries.find(p => p.id === alliance.leader_id);
  const leaderC = leaderPC ? findCountry(leaderPC.country_id) : null;
  const members = db.alliance_members.filter(m => m.alliance_id === alliance.id).map(m => {
    const mpc = db.player_countries.find(p => p.id === m.player_country_id);
    const mc = mpc ? findCountry(mpc.country_id) : null;
    const mu = mpc ? db.users.find(u => u.id === mpc.user_id) : null;
    return { name: mc?.name, flag: mc?.flag, username: mu?.username, military_power: mpc?.military_power };
  });
  res.json({
    has_alliance: true,
    alliance: { ...alliance, leader_country: leaderC?.name },
    members,
    is_leader: alliance.leader_id === pc.id,
    create_cost: ALLIANCE_CREATE_COST
  });
});


// ========== دیپلماسی ==========
app.get('/api/diplomacy', auth, (req, res) => {
  if (!db.diplomacy) db.diplomacy = [];
  const list = db.diplomacy.filter(d => d.status === 'active').map(d => {
    const c1 = findCountry(d.country1_id);
    const c2 = findCountry(d.country2_id);
    return {
      ...d,
      country1_name: c1?.name, country1_flag: c1?.flag,
      country2_name: c2?.name, country2_flag: c2?.flag
    };
  });
  res.json(list);
});

app.post('/api/diplomacy', auth, (req, res) => {
  const { type, target_country_id } = req.body; // war | ceasefire | nap
  if (!['war', 'ceasefire', 'nap'].includes(type)) {
    return res.status(400).json({ error: 'نوع نامعتبر' });
  }
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'کشور ندارید' });
  const targetPc = db.player_countries.find(p => p.country_id === target_country_id) 
    || db.player_countries.find(p => p.id === target_country_id);
  // target can be country id
  let tCountryId = target_country_id;
  let tUserId = null;
  const byCountry = db.player_countries.find(p => p.country_id === target_country_id);
  if (byCountry) {
    tCountryId = byCountry.country_id;
    tUserId = byCountry.user_id;
  } else {
    const byPc = db.player_countries.find(p => p.id === target_country_id);
    if (byPc) {
      tCountryId = byPc.country_id;
      tUserId = byPc.user_id;
    }
  }
  if (tCountryId === pc.country_id) return res.status(400).json({ error: 'روی خودتان اعمال نمی‌شود' });
  if (!db.diplomacy) db.diplomacy = [];
  // هزینه
  const costs = { war: 30, ceasefire: 50, nap: 80 };
  const cost = costs[type] || 50;
  if (pc.budget < cost) return res.status(400).json({ error: 'بودجه کافی نیست (' + cost + '$)' });
  pc.budget -= cost;
  // لغو روابط قبلی بین این دو
  db.diplomacy.forEach(d => {
    if (d.status === 'active' &&
      ((d.country1_id === pc.country_id && d.country2_id === tCountryId) ||
       (d.country2_id === pc.country_id && d.country1_id === tCountryId))) {
      d.status = 'ended';
    }
  });
  const labels = { war: 'اعلام جنگ', ceasefire: 'آتش‌بس', nap: 'پیمان عدم تجاوز' };
  db.diplomacy.push({
    id: uuidv4(),
    type,
    country1_id: pc.country_id,
    country2_id: tCountryId,
    status: 'active',
    created_at: new Date().toISOString()
  });
  if (tUserId) notify(tUserId, '📜 ' + labels[type] + ' از سوی کشور دیگر ثبت شد');
  saveDB();
  res.json({ success: true, cost });
});

// ========== جاسوسی ==========
app.post('/api/spy', auth, (req, res) => {
  const { target_player_country_id } = req.body;
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'کشور ندارید' });
  const target = db.player_countries.find(p => p.id === target_player_country_id);
  if (!target) return res.status(404).json({ error: 'هدف یافت نشد' });
  if (target.id === pc.id) return res.status(400).json({ error: 'روی خودتان جاسوسی نمی‌شود' });
  const cost = 40;
  if (pc.budget < cost) return res.status(400).json({ error: 'هزینه جاسوسی ۴۰$ است' });
  pc.budget -= cost;
  // شانس موفقیت بر اساس مهارت جاسوسی از رول‌ها یا شانس پایه
  const spySkill = (pc.skills && pc.skills.unlock_drone) ? 0.55 : 0.4; // ساده
  const success = Math.random() < spySkill + 0.2;
  const detected = Math.random() < 0.35;
  if (detected) {
    notify(target.user_id, '🕵️ جاسوس دشمن در خاک شما لو رفت!');
    pc.budget = Math.max(0, pc.budget - 25);
  }
  if (!success) {
    saveDB();
    return res.json({
      success: false,
      detected,
      message: detected ? 'عملیات شکست خورد و لو رفتید (−۲۵$)' : 'عملیات شکست خورد'
    });
  }
  const tCountry = findCountry(target.country_id);
  const eq = db.player_equipment.filter(pe => pe.player_country_id === target.id).map(pe => {
    const e = db.equipment.find(x => x.id === pe.equipment_id);
    return e ? { name: e.name, quantity: pe.quantity, type: e.type } : null;
  }).filter(Boolean);
  saveDB();
  res.json({
    success: true,
    detected,
    intel: {
      country: tCountry?.name,
      flag: tCountry?.flag,
      budget: target.budget,
      income: target.income,
      military_power: target.military_power,
      equipment: eq
    }
  });
});

// ========== رویداد تصادفی ==========
const EVENT_POOL = [
  { id: 'oil', title: 'کشف میدان نفت', text: 'درآمد کشورها +۱۵', apply: (pcs) => pcs.forEach(p => { p.income += 15; }) },
  { id: 'quake', title: 'زلزله منطقه‌ای', text: 'بودجه همه −۴۰', apply: (pcs) => pcs.forEach(p => { p.budget = Math.max(0, p.budget - 40); }) },
  { id: 'sanction', title: 'تحریم بین‌المللی', text: 'درآمد همه −۱۰', apply: (pcs) => pcs.forEach(p => { p.income = Math.max(5, p.income - 10); }) },
  { id: 'aid', title: 'کمک خارجی', text: 'بودجه همه +۸۰', apply: (pcs) => pcs.forEach(p => { p.budget += 80; }) },
  { id: 'tech', title: 'جهش فناوری', text: 'قدرت نظامی همه +۲۰', apply: (pcs) => pcs.forEach(p => { p.military_power += 20; }) },
  { id: 'coup', title: 'ناآرامی داخلی', text: 'قدرت نظامی −۱۵', apply: (pcs) => pcs.forEach(p => { p.military_power = Math.max(10, p.military_power - 15); }) }
];

function runRandomEvent() {
  if (!db.events) db.events = [];
  // هر ۶ ساعت یک‌بار حداکثر (برای تست: اگر آخرین رویداد > ۲ دقیقه بود هم اجازه بده برای admin)
  const ev = EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)];
  ev.apply(db.player_countries);
  const record = {
    id: uuidv4(),
    title: ev.title,
    text: ev.text,
    created_at: new Date().toISOString()
  };
  db.events.push(record);
  if (db.events.length > 30) db.events = db.events.slice(-20);
  db.player_countries.forEach(pc => {
    notify(pc.user_id, '🌍 رویداد جهانی: ' + ev.title + ' — ' + ev.text);
  });
  saveDB();
  return record;
}

app.get('/api/events', auth, (req, res) => {
  res.json((db.events || []).slice().reverse().slice(0, 15));
});

app.post('/api/admin/random-event', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'فقط ادمین' });
  const record = runRandomEvent();
  res.json({ success: true, event: record });
});

// ========== رتبه اتحاد ==========
app.get('/api/alliance-rank', auth, (req, res) => {
  const ranks = db.alliances.map(a => {
    const members = db.alliance_members.filter(m => m.alliance_id === a.id);
    let totalPower = 0, totalBudget = 0;
    members.forEach(m => {
      const pc = db.player_countries.find(p => p.id === m.player_country_id);
      if (pc) {
        totalPower += pc.military_power || 0;
        totalBudget += pc.budget || 0;
      }
    });
    const leaderPC = db.player_countries.find(p => p.id === a.leader_id);
    const leaderC = leaderPC ? findCountry(leaderPC.country_id) : null;
    return {
      id: a.id,
      name: a.name,
      member_count: members.length,
      total_power: totalPower,
      total_budget: totalBudget,
      leader_country: leaderC?.name
    };
  }).sort((a, b) => b.total_power - a.total_power);
  res.json(ranks);
});

// ========== دستاوردها ==========
const ACHIEVEMENT_DEFS = [
  { id: 'first_jet', title: 'اولین جت‌سوار', check: (pc) => db.player_equipment.some(pe => {
      if (pe.player_country_id !== pc.id) return false;
      const e = db.equipment.find(x => x.id === pe.equipment_id);
      return e && e.type === 'jet';
    })},
  { id: 'rich', title: 'پادشاه نفت', check: (pc) => pc.budget >= 2000 },
  { id: 'strong', title: 'قدرت برتر', check: (pc) => pc.military_power >= 500 },
  { id: 'conqueror', title: 'فاتح', check: (pc) => (pc.conquered || []).length >= 1 },
  { id: 'diplomat', title: 'دیپلمات', check: (pc) => (db.diplomacy || []).some(d => d.status === 'active' && (d.country1_id === pc.country_id || d.country2_id === pc.country_id) && d.type === 'nap') },
  { id: 'allied', title: 'متحد', check: (pc) => db.alliance_members.some(m => m.player_country_id === pc.id) }
];

function checkAchievements(pc) {
  if (!db.achievements_log) db.achievements_log = [];
  if (!pc.achievements) pc.achievements = [];
  let unlocked = [];
  ACHIEVEMENT_DEFS.forEach(def => {
    if (pc.achievements.includes(def.id)) return;
    try {
      if (def.check(pc)) {
        pc.achievements.push(def.id);
        unlocked.push(def);
        notify(pc.user_id, '🏅 دستاورد جدید: ' + def.title);
        db.achievements_log.push({
          id: uuidv4(),
          user_id: pc.user_id,
          achievement_id: def.id,
          title: def.title,
          created_at: new Date().toISOString()
        });
      }
    } catch (e) {}
  });
  return unlocked;
}

app.get('/api/achievements', auth, (req, res) => {
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.json({ unlocked: [], all: ACHIEVEMENT_DEFS.map(a => ({ id: a.id, title: a.title })) });
  checkAchievements(pc);
  saveDB();
  res.json({
    unlocked: pc.achievements || [],
    all: ACHIEVEMENT_DEFS.map(a => ({
      id: a.id,
      title: a.title,
      done: (pc.achievements || []).includes(a.id)
    }))
  });
});

// ========== Map & Wars ==========
app.get('/api/map', auth, (req, res) => {
  const countries = db.countries.map(c => {
    const pc = db.player_countries.find(p => p.country_id === c.id);
    const owner = pc ? db.users.find(u => u.id === pc.user_id)?.username : null;
    return {
      id: c.id,
      name: c.name,
      flag: c.flag,
      region: c.region || 'نامشخص',
      color: c.color || '#64748b',
      taken: !!pc,
      owner,
      military_power: pc ? pc.military_power : 0,
      advantages: c.advantages || [],
      disadvantages: c.disadvantages || [],
      description: c.description,
      is_vip: c.is_vip,
      base_budget: c.base_budget
    };
  });

  const activeWars = (db.wars || []).filter(w => w.status === 'active').map(w => {
    const c1 = db.countries.find(c => c.id === w.country1_id);
    const c2 = db.countries.find(c => c.id === w.country2_id);
    return {
      id: w.id,
      country1: c1 ? { name: c1.name, flag: c1.flag, color: c1.color } : null,
      country2: c2 ? { name: c2.name, flag: c2.flag, color: c2.color } : null,
      title: w.title,
      started_at: w.started_at
    };
  });

  // Also include pending/resolved recent scenarios as potential wars
  const recentScenarios = db.scenarios.filter(s => s.status === 'pending' || s.status === 'resolved').slice(-15).map(s => {
    const att = db.player_countries.find(p => p.id === s.attacker_id);
    const def = s.defender_id ? db.player_countries.find(p => p.id === s.defender_id) : null;
    const attC = att ? db.countries.find(c => c.id === att.country_id) : null;
    const defC = def ? db.countries.find(c => c.id === def.country_id) : null;
    return {
      id: s.id,
      title: s.title,
      status: s.status,
      result: s.result,
      attacker: attC ? { name: attC.name, flag: attC.flag } : null,
      defender: defC ? { name: defC.name, flag: defC.flag } : null,
      created_at: s.created_at
    };
  });

  res.json({ countries, activeWars, recentScenarios });
});

app.get('/api/wars', auth, (req, res) => {
  const wars = (db.wars || []).map(w => {
    const c1 = db.countries.find(c => c.id === w.country1_id);
    const c2 = db.countries.find(c => c.id === w.country2_id);
    return {
      ...w,
      country1_name: c1?.name,
      country1_flag: c1?.flag,
      country2_name: c2?.name,
      country2_flag: c2?.flag
    };
  }).reverse();
  res.json(wars);
});

// When resolving scenario as victory, auto-create war record if defender exists


// ========== Seasons ==========
app.get('/api/season', auth, (req, res) => {
  if (!db.seasons) db.seasons = [];
  const active = db.seasons.find(s => s.status === 'active') || db.seasons[db.seasons.length - 1] || null;
  res.json({ season: active, all: db.seasons });
});

app.post('/api/admin/end-season', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'دسترسی ندارید' });
  if (!db.seasons) db.seasons = [];
  const active = db.seasons.find(s => s.status === 'active');
  if (!active) return res.status(400).json({ error: 'سیزن فعالی نیست' });
  // قهرمان = بیشترین قدرت نظامی
  const players = [...db.player_countries].sort((a, b) => b.military_power - a.military_power);
  let winner = null;
  if (players[0]) {
    const c = db.countries.find(x => x.id === players[0].country_id);
    const u = db.users.find(x => x.id === players[0].user_id);
    winner = { country: c?.name, flag: c?.flag, username: u?.username, power: players[0].military_power };
  }
  active.status = 'ended';
  active.ended_at = new Date().toISOString();
  active.winner = winner;
  // سیزن جدید
  db.seasons.push({
    id: uuidv4(),
    name: 'سیزن ' + (db.seasons.length + 1),
    status: 'active',
    started_at: new Date().toISOString(),
    ended_at: null,
    winner: null
  });
  // نوتیف برای همه
  if (!db.notifications) db.notifications = [];
  db.player_countries.forEach(pc => {
    db.notifications.push({
      id: uuidv4(),
      user_id: pc.user_id,
      text: 'سیزن به پایان رسید. قهرمان: ' + (winner ? winner.flag + ' ' + winner.country : 'نامشخص'),
      read: false,
      created_at: new Date().toISOString()
    });
  });
  saveDB();
  res.json({ success: true, winner, new_season: db.seasons[db.seasons.length - 1] });
});

// ========== Notifications ==========
app.get('/api/notifications', auth, (req, res) => {
  if (!db.notifications) db.notifications = [];
  const list = db.notifications.filter(n => n.user_id === req.user.id).slice(-30).reverse();
  res.json(list);
});

app.post('/api/notifications/read', auth, (req, res) => {
  if (!db.notifications) db.notifications = [];
  db.notifications.forEach(n => {
    if (n.user_id === req.user.id) n.read = true;
  });
  saveDB();
  res.json({ success: true });
});

function notify(userId, text) {
  if (!db.notifications) db.notifications = [];
  db.notifications.push({
    id: uuidv4(),
    user_id: userId,
    text,
    read: false,
    created_at: new Date().toISOString()
  });
}

// ========== Private Messages ==========
app.get('/api/pm', auth, (req, res) => {
  if (!db.private_messages) db.private_messages = [];
  const myPc = findPCByUser(req.user.id);
  if (!myPc) return res.json([]);
  const list = db.private_messages.filter(m =>
    m.from_pc_id === myPc.id || m.to_pc_id === myPc.id
  ).slice(-50);
  res.json(list);
});

app.post('/api/pm', auth, (req, res) => {
  const { to_player_country_id, message } = req.body;
  if (!message || message.length < 1) return res.status(400).json({ error: 'پیام خالی است' });
  const myPc = findPCByUser(req.user.id);
  if (!myPc) return res.status(400).json({ error: 'کشور ندارید' });
  const target = db.player_countries.find(p => p.id === to_player_country_id);
  if (!target) return res.status(404).json({ error: 'گیرنده یافت نشد' });
  if (!db.private_messages) db.private_messages = [];
  const fromC = findCountry(myPc.country_id);
  const toC = findCountry(target.country_id);
  const msg = {
    id: uuidv4(),
    from_pc_id: myPc.id,
    to_pc_id: target.id,
    from_name: fromC?.name,
    to_name: toC?.name,
    from_user: req.user.username,
    message,
    created_at: new Date().toISOString()
  };
  db.private_messages.push(msg);
  notify(target.user_id, `پیام خصوصی از ${fromC?.flag || ''} ${fromC?.name || req.user.username}`);
  saveDB();
  res.json({ success: true, msg });
});





// ========== بازار سیاه ==========
app.get('/api/blackmarket', auth, (req, res) => {
  if (!db.blackmarket) db.blackmarket = [];
  const list = db.blackmarket.filter(l => l.status === 'open').map(l => {
    const sellerPc = db.player_countries.find(p => p.id === l.seller_pc_id);
    const sellerC = sellerPc ? findCountry(sellerPc.country_id) : null;
    const sellerU = sellerPc ? db.users.find(u => u.id === sellerPc.user_id) : null;
    return {
      ...l,
      seller_country: sellerC?.name,
      seller_flag: sellerC?.flag,
      seller_username: sellerU?.username
    };
  }).reverse();
  res.json(list);
});

app.post('/api/blackmarket/list', auth, (req, res) => {
  const { equipment_id, quantity, price } = req.body;
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'کشور ندارید' });
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const pr = Math.max(1, Math.floor(Number(price) || 0));
  if (pr < 1) return res.status(400).json({ error: 'قیمت نامعتبر' });
  const pe = db.player_equipment.find(p => p.player_country_id === pc.id && p.equipment_id === equipment_id);
  if (!pe || pe.quantity < qty) return res.status(400).json({ error: 'موجودی کافی نیست' });
  const eq = db.equipment.find(e => e.id === equipment_id);
  if (!eq) return res.status(404).json({ error: 'تجهیزات یافت نشد' });
  // کسر از زرادخانه تا فروش یا لغو
  pe.quantity -= qty;
  pc.military_power = Math.max(10, pc.military_power - eq.power * qty);
  if (!db.blackmarket) db.blackmarket = [];
  db.blackmarket.push({
    id: uuidv4(),
    seller_pc_id: pc.id,
    seller_user_id: req.user.id,
    equipment_id,
    name: eq.name,
    type: eq.type,
    power: eq.power,
    custom: !!eq.custom,
    quantity: qty,
    price: pr,
    status: 'open',
    created_at: new Date().toISOString()
  });
  saveDB();
  res.json({ success: true });
});

app.post('/api/blackmarket/buy', auth, (req, res) => {
  const { listing_id } = req.body;
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'کشور ندارید' });
  if (!db.blackmarket) db.blackmarket = [];
  const listing = db.blackmarket.find(l => l.id === listing_id && l.status === 'open');
  if (!listing) return res.status(404).json({ error: 'آگهی یافت نشد' });
  if (listing.seller_pc_id === pc.id) return res.status(400).json({ error: 'آگهی خودتان را نمی‌خرید' });
  if (pc.budget < listing.price) return res.status(400).json({ error: 'بودجه کافی نیست' });
  // ظرفیت زرادخانه
  ensureSkills(pc);
  if (arsenalUsed(pc) + listing.quantity > arsenalCapacity(pc)) {
    return res.status(400).json({ error: 'ظرفیت زرادخانه پر است' });
  }
  pc.budget -= listing.price;
  const seller = db.player_countries.find(p => p.id === listing.seller_pc_id);
  if (seller) {
    seller.budget += listing.price;
    notify(seller.user_id, '💰 فروش در بازار سیاه: ' + listing.name + ' ×' + listing.quantity + ' به قیمت ' + listing.price + '$');
  }
  const existing = db.player_equipment.find(p => p.player_country_id === pc.id && p.equipment_id === listing.equipment_id);
  if (existing) existing.quantity += listing.quantity;
  else db.player_equipment.push({ id: uuidv4(), player_country_id: pc.id, equipment_id: listing.equipment_id, quantity: listing.quantity });
  pc.military_power += listing.power * listing.quantity;
  listing.status = 'sold';
  listing.buyer_pc_id = pc.id;
  notify(req.user.id, 'خرید از بازار سیاه: ' + listing.name);
  saveDB();
  res.json({ success: true });
});

app.post('/api/blackmarket/cancel', auth, (req, res) => {
  const { listing_id } = req.body;
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'کشور ندارید' });
  const listing = (db.blackmarket || []).find(l => l.id === listing_id && l.status === 'open');
  if (!listing || listing.seller_pc_id !== pc.id) {
    return res.status(404).json({ error: 'آگهی یافت نشد' });
  }
  // برگرداندن به زرادخانه
  const existing = db.player_equipment.find(p => p.player_country_id === pc.id && p.equipment_id === listing.equipment_id);
  if (existing) existing.quantity += listing.quantity;
  else db.player_equipment.push({ id: uuidv4(), player_country_id: pc.id, equipment_id: listing.equipment_id, quantity: listing.quantity });
  const eq = db.equipment.find(e => e.id === listing.equipment_id);
  if (eq) pc.military_power += eq.power * listing.quantity;
  listing.status = 'cancelled';
  saveDB();
  res.json({ success: true });
});


// ========== تولید و طراحی سفارشی ==========
function productionCost(power, type) {
  const base = Math.max(20, Math.floor(power * 3.5));
  const mult = type === 'nuclear' ? 5 : type === 'jet' ? 1.4 : type === 'defense' || type === 'missile' ? 1.2 : 1;
  return Math.floor(base * mult);
}
function productionTime(power) {
  // ثانیه — قدرت بالا می‌تواند چند روز طول بکشد
  // مثال: قدرت ۳۰ ≈ ۱ ساعت، قدرت ۱۰۰ ≈ ~۱.۵ روز، قدرت ۲۰۰ ≈ چند روز
  return Math.max(60, Math.floor(power * power * 1.2) + power * 15);
}

function processProduction(pc) {
  if (!pc.production_queue) pc.production_queue = [];
  if (!pc.blueprints) pc.blueprints = [];
  const now = Date.now();
  let changed = false;
  const left = [];
  pc.production_queue.forEach(job => {
    if (job.finishes_at <= now) {
      // اضافه به زرادخانه
      if (job.custom) {
        // تجهیزات سفارشی موقت در لیست equipment
        let eq = db.equipment.find(e => e.id === job.equipment_id);
        if (!eq) {
          eq = {
            id: job.equipment_id,
            name: job.name,
            type: job.type,
            price: job.cost,
            power: job.power,
            nations: [],
            consumable: ['defense','missile','nuclear'].includes(job.type),
            custom: true
          };
          db.equipment.push(eq);
        }
      }
      const existing = db.player_equipment.find(pe => pe.player_country_id === pc.id && pe.equipment_id === job.equipment_id);
      if (existing) existing.quantity += (job.quantity || 1);
      else db.player_equipment.push({ id: uuidv4(), player_country_id: pc.id, equipment_id: job.equipment_id, quantity: job.quantity || 1 });
      const eq2 = db.equipment.find(e => e.id === job.equipment_id);
      if (eq2) pc.military_power += eq2.power * (job.quantity || 1);
      notify(pc.user_id, '🏭 تولید تمام شد: ' + (job.name || eq2?.name || 'واحد'));
      changed = true;
    } else left.push(job);
  });
  pc.production_queue = left;
  return changed;
}

app.get('/api/production', auth, (req, res) => {
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'کشور ندارید' });
  ensureSkills(pc);
  processProduction(pc);
  saveDB();
  const country = findCountry(pc.country_id);
  const catalog = db.equipment.filter(eq => {
    if (eq.custom) return false;
    if (eq.nations && eq.nations.length && country && !eq.nations.includes(country.name)) return false;
    return true;
  }).map(eq => ({
    id: eq.id,
    name: eq.name,
    type: eq.type,
    power: eq.power,
    cost: productionCost(eq.power, eq.type),
    duration_seconds: productionTime(eq.power),
    consumable: !!eq.consumable
  }));
  const now = Date.now();
  const queue = (pc.production_queue || []).map(j => ({
    ...j,
    remaining_seconds: Math.max(0, Math.ceil((j.finishes_at - now) / 1000))
  }));
  res.json({
    unlocked: (pc.skills.unlock_production || 0) >= 1,
    design_unlocked: (pc.skills.unlock_design || 0) >= 1,
    nuclear_unlocked: (pc.skills.unlock_nuclear || 0) >= 1,
    catalog,
    blueprints: pc.blueprints || [],
    queue,
    budget: pc.budget
  });
});

app.post('/api/production/build', auth, (req, res) => {
  const { equipment_id, quantity = 1 } = req.body;
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'کشور ندارید' });
  ensureSkills(pc);
  if ((pc.skills.unlock_production || 0) < 1) {
    return res.status(403).json({ error: 'سربرگ تولید قفل است. مهارت «باز کردن کارخانه» را ارتقا دهید.' });
  }
  processProduction(pc);
  const eq = db.equipment.find(e => e.id === equipment_id);
  if (!eq) return res.status(404).json({ error: 'تجهیزات یافت نشد' });
  const country = findCountry(pc.country_id);
  if (eq.nations && eq.nations.length && country && !eq.nations.includes(country.name)) {
    return res.status(403).json({ error: 'این تجهیز متعلق به کشور شما نیست' });
  }
  if (eq.type === 'nuclear' && (pc.skills.unlock_nuclear || 0) < 1) {
    return res.status(403).json({ error: 'نیاز به برنامه هسته‌ای' });
  }
  const qty = Math.max(1, Math.min(5, Math.floor(Number(quantity) || 1)));
  const cost = productionCost(eq.power, eq.type) * qty;
  const duration = productionTime(eq.power) * qty;
  if (pc.budget < cost) return res.status(400).json({ error: 'بودجه کافی نیست: ' + cost + '$' });
  if ((pc.production_queue || []).length >= 3) {
    return res.status(400).json({ error: 'حداکثر ۳ صف تولید همزمان' });
  }
  pc.budget -= cost;
  if (!pc.production_queue) pc.production_queue = [];
  pc.production_queue.push({
    id: uuidv4(),
    equipment_id: eq.id,
    name: eq.name,
    type: eq.type,
    power: eq.power,
    quantity: qty,
    cost,
    started_at: Date.now(),
    finishes_at: Date.now() + duration * 1000,
    total_seconds: duration
  });
  saveDB();
  res.json({ success: true, cost, duration_seconds: duration });
});

app.post('/api/production/design', auth, (req, res) => {
  const { name, type, power, save_blueprint } = req.body;
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'کشور ندارید' });
  ensureSkills(pc);
  if ((pc.skills.unlock_design || 0) < 1) {
    return res.status(403).json({ error: 'طراحی سفارشی قفل است. مهارت مربوط را باز کنید.' });
  }
  if (!name || name.length < 2) return res.status(400).json({ error: 'نام الزامی است' });
  const allowed = ['jet','land','sea','defense','missile','drone','infantry'];
  if (!allowed.includes(type)) return res.status(400).json({ error: 'نوع نامعتبر' });
  const pwr = Math.max(5, Math.min(200, Math.floor(Number(power) || 10)));
  const cost = productionCost(pwr, type);
  const duration = productionTime(pwr);
  // فقط برآورد
  if (req.body.estimate_only) {
    return res.json({ cost, duration_seconds: duration, power: pwr });
  }
  if (pc.budget < cost) return res.status(400).json({ error: 'بودجه کافی نیست: ' + cost + '$' });
  if ((pc.production_queue || []).length >= 3) {
    return res.status(400).json({ error: 'صف تولید پر است' });
  }
  pc.budget -= cost;
  const eqId = uuidv4();
  if (!pc.production_queue) pc.production_queue = [];
  pc.production_queue.push({
    id: uuidv4(),
    equipment_id: eqId,
    name,
    type,
    power: pwr,
    quantity: 1,
    cost,
    custom: true,
    started_at: Date.now(),
    finishes_at: Date.now() + duration * 1000,
    total_seconds: duration
  });
  if (save_blueprint) {
    if (!pc.blueprints) pc.blueprints = [];
    pc.blueprints.push({ id: uuidv4(), name, type, power: pwr, cost, duration_seconds: duration });
    if (pc.blueprints.length > 20) pc.blueprints = pc.blueprints.slice(-20);
  }
  saveDB();
  res.json({ success: true, cost, duration_seconds: duration });
});

app.post('/api/production/from-blueprint', auth, (req, res) => {
  const { blueprint_id } = req.body;
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'کشور ندارید' });
  ensureSkills(pc);
  if ((pc.skills.unlock_design || 0) < 1) return res.status(403).json({ error: 'طراحی قفل است' });
  const bp = (pc.blueprints || []).find(b => b.id === blueprint_id);
  if (!bp) return res.status(404).json({ error: 'طرح یافت نشد' });
  req.body = { name: bp.name, type: bp.type, power: bp.power, save_blueprint: false };
  // reuse design logic inline
  const cost = productionCost(bp.power, bp.type);
  const duration = productionTime(bp.power);
  if (pc.budget < cost) return res.status(400).json({ error: 'بودجه کافی نیست' });
  if ((pc.production_queue || []).length >= 3) return res.status(400).json({ error: 'صف پر است' });
  pc.budget -= cost;
  const eqId = uuidv4();
  pc.production_queue.push({
    id: uuidv4(), equipment_id: eqId, name: bp.name, type: bp.type, power: bp.power,
    quantity: 1, cost, custom: true, started_at: Date.now(),
    finishes_at: Date.now() + duration * 1000, total_seconds: duration
  });
  saveDB();
  res.json({ success: true, cost, duration_seconds: duration });
});

// ========== نبرد پیشرفته ==========

function calcForcePower(forces) {
  let total = 0;
  (forces || []).forEach(f => {
    const eq = db.equipment.find(e => e.id === f.equipment_id);
    if (eq) total += (eq.power || 0) * (f.quantity || 0);
  });
  return total;
}

function updateBattleProgress(sc) {
  const ap = sc.attacker_power || 0;
  const dp = sc.defender_power || 0;
  if (ap + dp === 0) {
    sc.progress = 50;
  } else {
    // 0 = مدافع کامل، 100 = مهاجم کامل
    sc.progress = Math.round((ap / (ap + dp)) * 100);
  }
}

app.get('/api/my-arsenal', auth, (req, res) => {
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.json({ equipment: [] });
  const equipment = db.player_equipment
    .filter(pe => pe.player_country_id === pc.id)
    .map(pe => {
      const eq = db.equipment.find(e => e.id === pe.equipment_id);
      return eq ? {
        equipment_id: pe.equipment_id,
        name: eq.name,
        type: eq.type,
        power: eq.power,
        quantity: pe.quantity,
        total_power: eq.power * pe.quantity
      } : null;
    }).filter(Boolean);
  res.json({ equipment, military_power: pc.military_power, budget: pc.budget });
});

app.get('/api/my-battles', auth, (req, res) => {
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.json([]);
  const list = db.scenarios.filter(s =>
    s.status === 'battle' && (s.attacker_id === pc.id || s.defender_id === pc.id)
  ).map(s => {
    const att = db.player_countries.find(p => p.id === s.attacker_id);
    const def = s.defender_id ? db.player_countries.find(p => p.id === s.defender_id) : null;
    const attC = att ? findCountry(att.country_id) : null;
    const defC = def ? findCountry(def.country_id) : null;
    const mySide = s.attacker_id === pc.id ? 'attacker' : 'defender';
    return {
      id: s.id,
      title: s.title,
      content: s.content,
      progress: s.progress ?? 50,
      attacker_power: s.attacker_power || 0,
      defender_power: s.defender_power || 0,
      attacker_forces: s.attacker_forces || [],
      defender_forces: s.defender_forces || [],
      my_side: mySide,
      attacker_name: attC?.name,
      attacker_flag: attC?.flag,
      defender_name: defC?.name,
      defender_flag: defC?.flag,
      created_at: s.created_at,
      battle_started_at: s.battle_started_at,
      time_left_seconds: s.battle_started_at ? Math.max(0, Math.ceil((30*60*1000 - (Date.now() - s.battle_started_at))/1000)) : 30*60
    };
  });
  res.json(list);
});

app.post('/api/battle/deploy', auth, (req, res) => {
  const { scenario_id, forces } = req.body; // forces: [{equipment_id, quantity}]
  const pc = findPCByUser(req.user.id);
  if (!pc) return res.status(400).json({ error: 'کشور ندارید' });
  const sc = db.scenarios.find(s => s.id === scenario_id);
  if (!sc || sc.status !== 'battle') return res.status(400).json({ error: 'نبرد فعالی یافت نشد' });
  const isAtt = sc.attacker_id === pc.id;
  const isDef = sc.defender_id === pc.id;
  if (!isAtt && !isDef) return res.status(403).json({ error: 'شما در این نبرد نیستید' });

  // اعتبارسنجی موجودی
  const clean = [];
  for (const f of (forces || [])) {
    const qty = Math.max(0, Math.floor(Number(f.quantity) || 0));
    if (qty <= 0) continue;
    const pe = db.player_equipment.find(p => p.player_country_id === pc.id && p.equipment_id === f.equipment_id);
    if (!pe || pe.quantity < qty) {
      return res.status(400).json({ error: 'تعداد نیرو بیش از موجودی است' });
    }
    clean.push({ equipment_id: f.equipment_id, quantity: qty });
  }
  if (!clean.length) return res.status(400).json({ error: 'حداقل یک نیرو انتخاب کنید' });

  // کسر از زرادخانه
  clean.forEach(f => {
    const pe = db.player_equipment.find(p => p.player_country_id === pc.id && p.equipment_id === f.equipment_id);
    pe.quantity -= f.quantity;
    const eq = db.equipment.find(e => e.id === f.equipment_id);
    if (eq) pc.military_power = Math.max(10, pc.military_power - eq.power * f.quantity);
  });

  const power = calcForcePower(clean);
  if (isAtt) {
    sc.attacker_forces = [...(sc.attacker_forces || []), ...clean];
    // merge same equipment
    const merged = {};
    sc.attacker_forces.forEach(f => {
      merged[f.equipment_id] = (merged[f.equipment_id] || 0) + f.quantity;
    });
    sc.attacker_forces = Object.entries(merged).map(([equipment_id, quantity]) => ({ equipment_id, quantity }));
    sc.attacker_power = calcForcePower(sc.attacker_forces);
  } else {
    sc.defender_forces = [...(sc.defender_forces || []), ...clean];
    const merged = {};
    sc.defender_forces.forEach(f => {
      merged[f.equipment_id] = (merged[f.equipment_id] || 0) + f.quantity;
    });
    sc.defender_forces = Object.entries(merged).map(([equipment_id, quantity]) => ({ equipment_id, quantity }));
    sc.defender_power = calcForcePower(sc.defender_forces);
  }
  updateBattleProgress(sc);
  let finished = false;
  let result = null;
  if (sc.progress >= 100) {
    applyScenarioResult(sc, 'پیروزی مهاجم', 30);
    finished = true;
    result = 'پیروزی مهاجم';
  } else if (sc.progress <= 0) {
    applyScenarioResult(sc, 'شکست مهاجم', -25);
    finished = true;
    result = 'شکست مهاجم';
  }
  saveDB();
  res.json({
    success: true,
    progress: sc.progress,
    attacker_power: sc.attacker_power,
    defender_power: sc.defender_power,
    finished,
    result
  });
});

app.post('/api/admin/start-battle', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'دسترسی ندارید' });
  const { scenario_id } = req.body;
  const sc = db.scenarios.find(s => s.id === scenario_id);
  if (!sc || sc.status !== 'pending') return res.status(400).json({ error: 'سناریوی در انتظار یافت نشد' });
  sc.status = 'battle';
  sc.attacker_forces = [];
  sc.defender_forces = [];
  sc.attacker_power = 0;
  sc.defender_power = 0;
  sc.progress = 50;
  sc.battle_started_at = Date.now();
  const att = db.player_countries.find(p => p.id === sc.attacker_id);
  const def = sc.defender_id ? db.player_countries.find(p => p.id === sc.defender_id) : null;
  if (att) notify(att.user_id, '⚔️ نبرد «' + sc.title + '» شروع شد! نیروها را اعزام کنید.');
  if (def) notify(def.user_id, '🛡️ تحت حمله «' + sc.title + '» هستید! نیروها را برای دفاع اعزام کنید.');
  saveDB();
  res.json({ success: true });
});

app.post('/api/admin/finish-battle', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'دسترسی ندارید' });
  const { scenario_id } = req.body;
  const sc = db.scenarios.find(s => s.id === scenario_id);
  if (!sc || sc.status !== 'battle') return res.status(400).json({ error: 'نبرد فعالی نیست' });
  updateBattleProgress(sc);
  let result, power_change;
  if (sc.progress >= 60) {
    result = 'پیروزی مهاجم';
    power_change = 20 + Math.floor((sc.attacker_power - sc.defender_power) / 10);
  } else if (sc.progress <= 40) {
    result = 'شکست مهاجم';
    power_change = -20;
  } else {
    result = 'تساوی';
    power_change = 0;
  }
  applyScenarioResult(sc, result, power_change);
  saveDB();
  res.json({ success: true, result, progress: sc.progress });
});


// ========== AI داور خودکار ==========
function aiDecideRole(role, pc) {
  const content = (role.content || '') + ' ' + (role.title || '');
  const len = content.trim().length;
  const cost = role.budget_cost || 0;
  // رد: خیلی کوتاه یا هزینه غیرمنطقی
  if (len < 20) return { status: 'rejected', reward: 0, reason: 'متن رول خیلی کوتاه است' };
  if (cost > (pc?.budget || 0) + 500) return { status: 'rejected', reward: 0, reason: 'هزینه غیرمنطقی' };
  // جاسوسی/خرابکاری کمی سخت‌گیرتر
  if (role.type === 'spy' || role.type === 'sabotage') {
    const ok = len >= 40 && cost >= 20;
    if (!ok) return { status: 'rejected', reward: 0, reason: 'رول جاسوسی/خرابکاری نیاز به جزئیات بیشتر دارد' };
    return { status: 'approved', reward: Math.max(30, Math.floor(cost * 1.5)), reason: 'عملیات ویژه تأیید شد' };
  }
  // تأیید پیش‌فرض با پاداش متناسب
  const reward = Math.max(20, Math.floor(cost * 1.8) + 10);
  return { status: 'approved', reward, reason: 'رول توسط داور هوش مصنوعی تأیید شد' };
}

function aiDecideScenario(sc) {
  const att = db.player_countries.find(p => p.id === sc.attacker_id);
  const def = sc.defender_id ? db.player_countries.find(p => p.id === sc.defender_id) : null;
  const attPower = att?.military_power || 50;
  const defPower = def?.military_power || 80;
  const ratio = attPower / Math.max(defPower, 1);
  const contentLen = (sc.content || '').length;
  if (contentLen < 25) {
    return { result: 'رد سناریو (متن ناکافی)', power_change: 0, reason: 'توضیح حمله کافی نیست' };
  }
  // احتمال بر اساس قدرت
  let roll = Math.random();
  if (ratio >= 1.4) {
    // مهاجم قوی‌تر
    if (roll < 0.7) return { result: 'پیروزی مهاجم', power_change: 25 + Math.floor(Math.random() * 20), reason: 'برتری نظامی مهاجم' };
    if (roll < 0.9) return { result: 'تساوی', power_change: 0, reason: 'مقاومت مدافع' };
    return { result: 'شکست مهاجم', power_change: -15, reason: 'ضدحمله موفق' };
  } else if (ratio <= 0.7) {
    if (roll < 0.25) return { result: 'پیروزی مهاجم', power_change: 15, reason: 'حمله غافلگیرانه' };
    if (roll < 0.45) return { result: 'تساوی', power_change: 0, reason: 'بن‌بست' };
    return { result: 'شکست مهاجم', power_change: -25, reason: 'برتری مدافع' };
  } else {
    if (roll < 0.4) return { result: 'پیروزی مهاجم', power_change: 20, reason: 'نبرد نزدیک — پیروزی مهاجم' };
    if (roll < 0.65) return { result: 'تساوی', power_change: 5, reason: 'نبرد فرسایشی' };
    return { result: 'شکست مهاجم', power_change: -15, reason: 'شکست در نبرد نزدیک' };
  }
}

function applyBattleCasualties(forces, pc, lossRate) {
  // forces already removed from arsenal on deploy; remaining losses on military only
  // consumable types already fully spent on deploy
  if (!pc || !forces) return;
  const lostPower = Math.floor(calcForcePower(forces) * lossRate);
  pc.military_power = Math.max(10, pc.military_power - Math.floor(lostPower * 0.3));
}

function applyScenarioResult(sc, result, power_change) {
  sc.status = 'resolved';
  sc.result = result;
  const att = db.player_countries.find(p => p.id === sc.attacker_id);
  const def = sc.defender_id ? db.player_countries.find(p => p.id === sc.defender_id) : null;
  // تلفات: بازنده بیشتر، برنده کمتر — پدافند/موشک یک‌بارمصرف بودن در deploy اعمال شده
  if (result && result.includes('پیروزی')) {
    applyBattleCasualties(sc.attacker_forces, att, 0.25);
    applyBattleCasualties(sc.defender_forces, def, 0.55);
  } else if (result && result.includes('شکست')) {
    applyBattleCasualties(sc.attacker_forces, att, 0.55);
    applyBattleCasualties(sc.defender_forces, def, 0.25);
  } else {
    applyBattleCasualties(sc.attacker_forces, att, 0.35);
    applyBattleCasualties(sc.defender_forces, def, 0.35);
  }
  if (power_change && att) att.military_power = Math.max(10, att.military_power + power_change);
  if (sc.defender_id) {
    const def = db.player_countries.find(p => p.id === sc.defender_id);
    if (att && def) {
      if (!db.wars) db.wars = [];
      const isVictory = result && (result.includes('پیروزی') || result.includes('فتح'));
      db.wars.push({
        id: uuidv4(),
        country1_id: att.country_id,
        country2_id: def.country_id,
        title: sc.title,
        result,
        status: isVictory ? 'active' : 'ended',
        started_at: sc.created_at,
        ended_at: new Date().toISOString()
      });
      if (isVictory) {
        const defCountry = db.countries.find(c => c.id === def.country_id);
        if (!att.conquered) att.conquered = [];
        att.conquered.push({
          country_id: def.country_id,
          name: defCountry?.name,
          flag: defCountry?.flag,
          advantages: defCountry?.advantages || [],
          disadvantages: defCountry?.disadvantages || [],
          conquered_at: new Date().toISOString()
        });
        att.budget += Math.floor((def.budget || 0) * 0.3);
        att.military_power += Math.floor((def.military_power || 0) * 0.2);
        att.income += 15;
        def.budget = Math.floor(def.budget * 0.5);
        def.military_power = Math.max(20, Math.floor(def.military_power * 0.6));
        def.income = Math.max(10, def.income - 10);
        notify(def.user_id, 'کشور شما در نبرد شکست خورد: ' + sc.title);
      }
      notify(att.user_id, 'نتیجه سناریو «' + sc.title + '»: ' + result);
    }
  } else if (att) {
    notify(att.user_id, 'نتیجه سناریو «' + sc.title + '»: ' + result);
  }
}

function runAIModerator() {
  let changed = false;
  // تکمیل ارتقاهای مهارت + دستاورد
  db.player_countries.forEach(pc => {
    try { if (processSkillUpgrades(pc)) changed = true; } catch(e) {}
    try { if (processProduction(pc)) changed = true; } catch(e) {}
    try { if (checkAchievements(pc).length) changed = true; } catch(e) {}
    // نگهداری: هر چرخه شانس کم کردن بودجه بر اساس تعداد نیرو
    try {
      const units = arsenalUsed(pc);
      if (units > 0 && Math.random() < 0.08) {
        const upkeep = Math.min(pc.budget, Math.floor(units * 0.5));
        if (upkeep > 0) { pc.budget -= upkeep; changed = true; }
      }
    } catch(e) {}
  });
  // رویداد تصادفی جهانی (حدود هر ۳۰ دقیقه یک‌بار شانس)
  try {
    if (!db.last_global_event) db.last_global_event = 0;
    if (Date.now() - db.last_global_event > 30 * 60 * 1000 && Math.random() < 0.15) {
      runRandomEvent();
      db.last_global_event = Date.now();
      changed = true;
    }
  } catch(e) {}
  if (!db.ai_settings || !db.ai_settings.enabled) {
    if (changed) saveDB();
    return;
  }

  // رول‌ها
  if (db.ai_settings.auto_roles) {
    const pending = db.roles.filter(r => r.status === 'pending' && r.reviewer !== 'admin');
    pending.forEach(role => {
      const pc = db.player_countries.find(p => p.id === role.player_country_id);
      const decision = aiDecideRole(role, pc);
      role.status = decision.status;
      role.reward = decision.reward || 0;
      role.ai_reason = decision.reason;
      if (decision.status === 'approved' && decision.reward > 0 && pc) {
        pc.budget += decision.reward;
        pc.income += Math.floor(decision.reward / 10);
        notify(pc.user_id, '🤖 داور AI رول شما را تأیید کرد (+' + decision.reward + '$) — ' + decision.reason);
      } else if (pc) {
        notify(pc.user_id, '🤖 داور AI رول شما را رد کرد — ' + decision.reason);
      }
      changed = true;
    });
  }

  // سناریوها → شروع نبرد (اگر مدافع دارد) یا نتیجه فوری
  if (db.ai_settings.auto_scenarios) {
    const pending = db.scenarios.filter(s => s.status === 'pending' && s.reviewer !== 'admin');
    pending.forEach(sc => {
      if (sc.defender_id) {
        sc.status = 'battle';
        sc.attacker_forces = [];
        sc.defender_forces = [];
        sc.attacker_power = 0;
        sc.defender_power = 0;
        sc.progress = 50;
        sc.battle_started_at = Date.now();
        sc.ai_reason = 'نبرد توسط AI پذیرفته شد — اعزام نیرو';
        const att = db.player_countries.find(p => p.id === sc.attacker_id);
        const def = db.player_countries.find(p => p.id === sc.defender_id);
        if (att) notify(att.user_id, '⚔️ نبرد «' + sc.title + '» شروع شد! نیرو اعزام کنید.');
        if (def) notify(def.user_id, '🛡️ تحت حمله «' + sc.title + '» — نیرو برای دفاع بفرستید.');
      } else {
        const decision = aiDecideScenario(sc);
        applyScenarioResult(sc, decision.result, decision.power_change);
        sc.ai_reason = decision.reason;
      }
      changed = true;
    });
  }

  // نبرد فعال: ۱۰۰٪ = برد، مهلت ۳۰ دقیقه
  const battles = db.scenarios.filter(s => s.status === 'battle');
  battles.forEach(sc => {
    if (!sc.battle_started_at) {
      sc.battle_started_at = Date.now();
      changed = true;
    }
    updateBattleProgress(sc);
    // رسیدن به ۱۰۰ یا ۰
    if (sc.attacker_power > 0 || sc.defender_power > 0) {
      if (sc.progress >= 100) {
        applyScenarioResult(sc, 'پیروزی مهاجم', 30);
        sc.ai_reason = 'نوار پیشرفت به ۱۰۰٪ رسید';
        changed = true;
        return;
      }
      if (sc.progress <= 0) {
        applyScenarioResult(sc, 'شکست مهاجم', -25);
        sc.ai_reason = 'نوار پیشرفت به نفع مدافع کامل شد';
        changed = true;
        return;
      }
    }
    // مهلت ۳۰ دقیقه
    if (Date.now() - sc.battle_started_at > 30 * 60 * 1000) {
      updateBattleProgress(sc);
      let result, power_change;
      if (sc.progress > 55) { result = 'پیروزی مهاجم'; power_change = 20; }
      else if (sc.progress < 45) { result = 'شکست مهاجم'; power_change = -20; }
      else { result = 'تساوی'; power_change = 0; }
      applyScenarioResult(sc, result + ' (پایان زمان ۳۰ دقیقه)', power_change);
      sc.ai_reason = 'مهلت ۳۰ دقیقه‌ای نبرد تمام شد';
      changed = true;
    }
  });

  // بیانیه‌ها — فقط علامت‌گذاری بررسی‌شده
  if (db.ai_settings.auto_statements) {
    db.statements.forEach(s => {
      if (!s.ai_checked) {
        s.ai_checked = true;
        s.ai_status = (s.content || '').length >= 10 ? 'approved' : 'flagged';
        changed = true;
      }
    });
  }

  if (changed) {
    saveDB();
    console.log('[AI Moderator] processed pending items at', new Date().toISOString());
  }
}

app.get('/api/admin/ai-settings', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'دسترسی ندارید' });
  res.json(db.ai_settings || { enabled: false });
});

app.post('/api/admin/ai-settings', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'دسترسی ندارید' });
  db.ai_settings = {
    enabled: !!req.body.enabled,
    auto_roles: req.body.auto_roles !== false,
    auto_scenarios: req.body.auto_scenarios !== false,
    auto_statements: req.body.auto_statements !== false,
    interval_minutes: Math.max(1, Math.min(60, Number(req.body.interval_minutes) || 2))
  };
  saveDB();
  res.json({ success: true, settings: db.ai_settings });
});

app.post('/api/admin/ai-run', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'دسترسی ندارید' });
  runAIModerator();
  res.json({ success: true, message: 'داور AI یک‌بار اجرا شد' });
});

// ========== Socket.io ==========


io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('join', (data) => {
    socket.username = data.username;
    socket.join('global');
  });
  socket.on('chat', (data) => {
    const msg = {
      id: uuidv4(),
      user_id: data.user_id || '',
      username: data.username,
      country_name: data.country_name || '',
      message: data.message,
      created_at: new Date().toISOString()
    };
    db.chat_messages.push(msg);
    if (db.chat_messages.length > 200) db.chat_messages = db.chat_messages.slice(-100);
    saveDB();
    io.to('global').emit('chat', msg);
  });
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'war-text-game' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/public/index.html'));
});

server.listen(PORT, () => {
  console.log(`🚀 War Text Game Server listening on port ${PORT}`);
  console.log(`Production mode: ${IS_PRODUCTION ? 'ON' : 'OFF'} | DEV_OTP_MODE: ${DEV_OTP_MODE ? 'ON' : 'OFF'}`);
  console.log(`🤖 AI Moderator: ${db.ai_settings?.enabled ? 'ON' : 'OFF'}`);
  // هر ۲ دقیقه (یا تنظیم‌شده) داور AI کارهای در انتظار را بررسی می‌کند
  setInterval(() => {
    try { runAIModerator(); } catch (e) { console.error('AI error', e); }
  }, (db.ai_settings?.interval_minutes || 2) * 60 * 1000);
  // یک‌بار چند ثانیه بعد از استارت
  setTimeout(() => { try { runAIModerator(); } catch(e){} }, 5000);
});
