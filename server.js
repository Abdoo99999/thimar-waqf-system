// خادم نظام تقييم المؤسسات الوقفية
// - الدخول يتم في الخادم (جلسة موقّعة في كوكي HttpOnly)، وكلمات المرور مشفّرة (scrypt)
// - كل سجل يُحفظ منفرداً، فلا تمسح مؤسسة بيانات مؤسسة أخرى عند الحفظ المتزامن
// - المؤسسة لا تستلم ولا تعدّل إلا بياناتها، والمدير وحده يرى الكل
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ─── المجموعات المسموحة وطريقة ربطها بالمؤسسة ──────────────────────────────
// owner: 'self' = السجل هو المؤسسة نفسها، 'field' = عبر institution_id، 'evaluation' = عبر evaluation_id
// global: يقرأها الجميع ويكتبها المدير فقط
const COLLECTIONS = {
  waqf_institutions: { owner: 'self' },
  waqf_financials: { owner: 'field' },
  waqf_evaluations: { owner: 'field' },
  waqf_compliance: { owner: 'field' },
  waqf_risks: { owner: 'field' },
  waqf_feedback: { owner: 'field' },
  waqf_responses: { owner: 'evaluation' },
  waqf_improvements: { owner: 'evaluation' },
  waqf_indicators: { global: true },
  waqf_settings: { global: true },
};

// ─── أدوات كلمات المرور والجلسات ───────────────────────────────────────────
const hashPassword = (pw) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};
const verifyPassword = (pw, stored) => {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(pw), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === test.length && crypto.timingSafeEqual(expected, test);
};
// كلمة مرور عشوائية سهلة القراءة (بدون أحرف متشابهة مثل O/0 و l/1)
const randomPassword = (len = 10) => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
};
const newId = () => crypto.randomBytes(12).toString('hex');

let SESSION_SECRET = process.env.SESSION_SECRET || null;
const SESSION_HOURS = 12;
const COOKIE = 'waqf_session';

const sign = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
};
const unsign = (token) => {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
};
const readCookie = (req, name) => {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
};
const setSession = (req, res, payload) => {
  const token = sign({ ...payload, exp: Date.now() + SESSION_HOURS * 3600 * 1000 });
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${secure ? '; Secure' : ''}`);
};
const clearSession = (res) => res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);

// ─── الحد من محاولات الدخول الخاطئة ────────────────────────────────────────
const attempts = new Map(); // ip|code -> {count, until}
const MAX_ATTEMPTS = 8, LOCK_MINUTES = 15;
const isLocked = (key) => { const a = attempts.get(key); return a && a.until && a.until > Date.now(); };
const recordFail = (key) => {
  const a = attempts.get(key) || { count: 0, until: 0 };
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) { a.until = Date.now() + LOCK_MINUTES * 60 * 1000; a.count = 0; }
  attempts.set(key, a);
};
const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';

// ─── التطبيق ───────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', true);
const jsonSmall = express.json({ limit: '25mb' });
const jsonLarge = express.json({ limit: '1gb' });
app.use((req, res, next) => (req.path === '/api/admin/import' ? jsonLarge : jsonSmall)(req, res, next));

// السماح فقط بالطلبات من نفس الموقع لعمليات الكتابة (حماية من CSRF)
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin) {
      // نقبل الطلب إذا جاء من نفس الموقع (مباشرة أو عبر وكيل المعاينة في Replit)
      const hosts = [req.headers.host, ...String(req.headers['x-forwarded-host'] || '').split(',')].map(h => (h || '').trim()).filter(Boolean);
      let originHost = '';
      try { originHost = new URL(origin).host; } catch { return res.status(403).json({ error: 'origin' }); }
      if (!hosts.includes(originHost)) return res.status(403).json({ error: 'origin' });
    }
  }
  next();
});

let dbReady = false;
app.use('/api', (req, res, next) => {
  if (!dbReady && req.path !== '/health') return res.status(503).json({ error: 'النظام قيد التشغيل، حاول بعد لحظات' });
  req.session = SESSION_SECRET ? unsign(readCookie(req, COOKIE)) : null;
  next();
});

const requireAuth = (req, res, next) => req.session ? next() : res.status(401).json({ error: 'غير مسجل الدخول' });
const requireAdmin = (req, res, next) => req.session?.role === 'admin' ? next() : res.status(403).json({ error: 'صلاحية المدير مطلوبة' });

const wrap = (fn) => (req, res) => fn(req, res).catch(e => {
  console.error(`${req.method} ${req.path}:`, e.message);
  res.status(500).json({ error: 'خطأ في الخادم' });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ─── الدخول والخروج ────────────────────────────────────────────────────────
app.post('/api/auth/login', wrap(async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const password = String(req.body?.password || '').trim();
  const key = `${clientIp(req)}|${code}`;
  if (isLocked(key)) return res.status(429).json({ error: `محاولات كثيرة. حاول بعد ${LOCK_MINUTES} دقيقة.` });

  const { rows } = await pool.query('SELECT * FROM app_accounts WHERE upper(login_code) = $1', [code]);
  const acc = rows[0];
  if (!acc || !verifyPassword(password, acc.password_hash)) {
    recordFail(key);
    return res.status(401).json({ error: 'رمز الدخول أو كلمة المرور غير صحيحة' });
  }
  const inst = await pool.query("SELECT data FROM app_records WHERE collection = 'waqf_institutions' AND id = $1", [acc.institution_id]);
  if (!inst.rows[0]) return res.status(401).json({ error: 'المؤسسة غير موجودة' });
  attempts.delete(key);
  setSession(req, res, { role: 'user', institution_id: acc.institution_id, name: inst.rows[0].data.name, v: acc.session_version });
  res.json({ role: 'user', institution_id: acc.institution_id, name: inst.rows[0].data.name, must_change_password: acc.must_change });
}));

app.post('/api/auth/admin-login', wrap(async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const key = `${clientIp(req)}|admin:${username}`;
  if (isLocked(key)) return res.status(429).json({ error: `محاولات كثيرة. حاول بعد ${LOCK_MINUTES} دقيقة.` });
  const { rows } = await pool.query('SELECT * FROM app_admins WHERE username = $1', [username]);
  if (!rows[0] || !verifyPassword(password, rows[0].password_hash)) {
    recordFail(key);
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }
  attempts.delete(key);
  setSession(req, res, { role: 'admin', username, name: 'مدير النظام', v: rows[0].session_version });
  res.json({ role: 'admin', name: 'مدير النظام' });
}));

app.post('/api/auth/logout', (req, res) => { clearSession(res); res.json({ ok: true }); });

// التحقق من أن الجلسة ما زالت صالحة (تُلغى عند تغيير كلمة المرور)
const sessionStillValid = async (s) => {
  if (s.role === 'admin') {
    const { rows } = await pool.query('SELECT session_version FROM app_admins WHERE username = $1', [s.username]);
    return rows[0] && rows[0].session_version === s.v;
  }
  const { rows } = await pool.query('SELECT session_version FROM app_accounts WHERE institution_id = $1', [s.institution_id]);
  return rows[0] && rows[0].session_version === s.v;
};
app.use('/api', async (req, res, next) => {
  try {
    if (req.session && !(await sessionStillValid(req.session))) { req.session = null; clearSession(res); }
    next();
  } catch (e) { console.error('session check:', e.message); res.status(500).json({ error: 'خطأ في الخادم' }); }
});

app.get('/api/auth/me', wrap(async (req, res) => {
  if (!req.session) return res.json({ authenticated: false });
  const s = req.session;
  let must = false;
  if (s.role === 'user') {
    const { rows } = await pool.query('SELECT must_change FROM app_accounts WHERE institution_id = $1', [s.institution_id]);
    must = !!rows[0]?.must_change;
  }
  res.json({ authenticated: true, role: s.role, name: s.name, institution_id: s.institution_id || null, must_change_password: must });
}));

app.post('/api/auth/change-password', requireAuth, wrap(async (req, res) => {
  const current = String(req.body?.current || '');
  const next = String(req.body?.next || '');
  if (next.length < 8) return res.status(400).json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف' });
  const s = req.session;
  const table = s.role === 'admin' ? 'app_admins' : 'app_accounts';
  const where = s.role === 'admin' ? 'username' : 'institution_id';
  const whereVal = s.role === 'admin' ? s.username : s.institution_id;
  const { rows } = await pool.query(`SELECT password_hash, session_version FROM ${table} WHERE ${where} = $1`, [whereVal]);
  if (!rows[0] || !verifyPassword(current, rows[0].password_hash)) return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  if (current === next) return res.status(400).json({ error: 'اختر كلمة مرور مختلفة عن الحالية' });
  const v = rows[0].session_version + 1;
  await pool.query(`UPDATE ${table} SET password_hash = $1, session_version = $2${s.role === 'user' ? ', must_change = false' : ''} WHERE ${where} = $3`, [hashPassword(next), v, whereVal]);
  setSession(req, res, { ...s, v, exp: undefined });
  res.json({ ok: true });
}));

// ─── قراءة البيانات (كل مستخدم يستلم ما يخصه فقط) ─────────────────────────
app.get('/api/data', requireAuth, wrap(async (req, res) => {
  const s = req.session;
  const out = {};
  for (const c of Object.keys(COLLECTIONS)) out[c] = [];
  const { rows } = s.role === 'admin'
    ? await pool.query('SELECT collection, data FROM app_records ORDER BY created_at')
    : await pool.query(
        `SELECT collection, data FROM app_records
         WHERE institution_id = $1 OR collection IN ('waqf_indicators','waqf_settings')
         ORDER BY created_at`, [s.institution_id]);
  for (const r of rows) if (out[r.collection]) out[r.collection].push(r.data);
  out.waqf_settings = out.waqf_settings[0] || null;
  res.json(out);
}));

// ─── التحقق من صلاحية الكتابة على سجل ─────────────────────────────────────
const resolveOwner = async (collection, item) => {
  const def = COLLECTIONS[collection];
  if (def.global) return null;
  if (def.owner === 'self') return item.id;
  if (def.owner === 'field') return item.institution_id || null;
  if (def.owner === 'evaluation') {
    const { rows } = await pool.query("SELECT institution_id FROM app_records WHERE collection = 'waqf_evaluations' AND id = $1", [item.evaluation_id]);
    return rows[0]?.institution_id || null;
  }
  return null;
};

const checkUserWrite = async (s, collection, id, item, existing) => {
  const def = COLLECTIONS[collection];
  if (def.global) return 'لا تملك صلاحية تعديل هذه البيانات';
  const owner = await resolveOwner(collection, item);
  if (owner !== s.institution_id) return 'لا يمكنك تعديل بيانات مؤسسة أخرى';
  if (existing && existing.institution_id !== s.institution_id) return 'لا يمكنك تعديل بيانات مؤسسة أخرى';
  if (collection === 'waqf_institutions' && !existing) return 'لا يمكن للمؤسسة إنشاء مؤسسة جديدة';
  if (collection === 'waqf_feedback') {
    // الرد والحالة من صلاحية المدير فقط؛ المؤسسة تستطيع فقط تعليم الرد كمقروء
    const ADMIN_FIELDS = ['admin_reply', 'replied_at', 'status', 'is_read'];
    if (existing) {
      const strip = (o) => { const c = { ...o }; delete c.reply_seen; return JSON.stringify(c); };
      if (strip(item) !== strip(existing.data)) return 'لا يمكن تعديل الملاحظة بعد إرسالها';
    } else if (item.admin_reply || item.replied_at || (item.status && item.status !== 'new') || item.is_read) {
      return 'بيانات غير صالحة';
    }
  }
  if (collection === 'waqf_evaluations') {
    const prev = existing?.data?.workflow_status;
    if (prev === 'submitted' || prev === 'approved') return 'التقييم مرفوع للاعتماد ولا يمكن تعديله';
    // المؤسسة ترفع فقط (أو تُبقي الحالة كما هي بعد إرجاع التقييم لها)، ولا تعتمد ولا تُرجع
    if (item.workflow_status && !['draft', 'submitted'].includes(item.workflow_status) && item.workflow_status !== prev) {
      return 'لا يمكن للمؤسسة اعتماد التقييم';
    }
    if (item.admin_feedback !== undefined && item.admin_feedback !== existing?.data?.admin_feedback) {
      return 'لا يمكن للمؤسسة تعديل ملاحظات المراجعة';
    }
  }
  if (def.owner === 'evaluation') {
    const { rows } = await pool.query("SELECT data->>'workflow_status' AS ws FROM app_records WHERE collection = 'waqf_evaluations' AND id = $1", [item.evaluation_id]);
    if (['submitted', 'approved'].includes(rows[0]?.ws)) return 'التقييم مرفوع للاعتماد ولا يمكن تعديله';
  }
  return null;
};

const getExisting = async (collection, id) => {
  const { rows } = await pool.query('SELECT institution_id, data FROM app_records WHERE collection = $1 AND id = $2', [collection, id]);
  return rows[0] || null;
};

// حفظ سجل واحد
app.put('/api/records/:collection/:id', requireAuth, wrap(async (req, res) => {
  const { collection, id } = req.params;
  if (!COLLECTIONS[collection]) return res.status(404).json({ error: 'مجموعة غير معروفة' });
  const item = req.body;
  if (!item || typeof item !== 'object' || Array.isArray(item)) return res.status(400).json({ error: 'بيانات غير صالحة' });
  if (collection !== 'waqf_settings' && item.id !== id) return res.status(400).json({ error: 'رقم السجل غير مطابق' });
  const s = req.session;
  const existing = await getExisting(collection, id);

  if (s.role !== 'admin') {
    const err = await checkUserWrite(s, collection, id, item, existing);
    if (err) return res.status(403).json({ error: err });
  }
  const owner = await resolveOwner(collection, item);
  await pool.query(
    `INSERT INTO app_records (collection, id, institution_id, data) VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, institution_id = EXCLUDED.institution_id, updated_at = now()`,
    [collection, id, owner, JSON.stringify(item)]);

  // مؤسسة جديدة أضافها المدير: إنشاء حساب دخول بكلمة مرور عشوائية
  let account = null;
  if (collection === 'waqf_institutions' && !existing && s.role === 'admin') {
    account = await createAccount(id);
  }
  res.json({ ok: true, account });
}));

// حذف سجل واحد
app.delete('/api/records/:collection/:id', requireAuth, wrap(async (req, res) => {
  const { collection, id } = req.params;
  if (!COLLECTIONS[collection]) return res.status(404).json({ error: 'مجموعة غير معروفة' });
  const s = req.session;
  const existing = await getExisting(collection, id);
  if (!existing) return res.json({ ok: true });
  if (s.role !== 'admin') {
    if (collection === 'waqf_institutions' || COLLECTIONS[collection].global) return res.status(403).json({ error: 'غير مسموح' });
    if (existing.institution_id !== s.institution_id) return res.status(403).json({ error: 'لا يمكنك حذف بيانات مؤسسة أخرى' });
    if (collection === 'waqf_evaluations') return res.status(403).json({ error: 'غير مسموح' });
  }
  await pool.query('DELETE FROM app_records WHERE collection = $1 AND id = $2', [collection, id]);
  if (collection === 'waqf_institutions') {
    await pool.query('DELETE FROM app_records WHERE institution_id = $1', [id]);
    await pool.query('DELETE FROM app_accounts WHERE institution_id = $1', [id]);
    await pool.query('DELETE FROM app_files WHERE institution_id = $1', [id]);
  }
  res.json({ ok: true });
}));

// ─── أدوات المدير ──────────────────────────────────────────────────────────
const createAccount = async (institutionId) => {
  const { rows } = await pool.query("SELECT login_code FROM app_accounts");
  const max = rows.reduce((m, r) => Math.max(m, parseInt(String(r.login_code).replace(/\D/g, '')) || 0), 0);
  const code = `WQ${String(max + 1).padStart(3, '0')}`;
  const password = randomPassword();
  await pool.query(
    'INSERT INTO app_accounts (institution_id, login_code, password_hash, must_change) VALUES ($1, $2, $3, true) ON CONFLICT (institution_id) DO NOTHING',
    [institutionId, code, hashPassword(password)]);
  return { institution_id: institutionId, login_code: code, password };
};

// قائمة الحسابات بدون كلمات المرور
app.get('/api/admin/accounts', requireAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT institution_id, login_code, must_change, updated_at FROM app_accounts ORDER BY login_code');
  res.json(rows);
}));

// إصدار كلمة مرور جديدة لمؤسسة واحدة (تظهر مرة واحدة فقط)
app.post('/api/admin/accounts/:institutionId/reset-password', requireAdmin, wrap(async (req, res) => {
  const password = randomPassword();
  const { rowCount } = await pool.query(
    'UPDATE app_accounts SET password_hash = $1, must_change = true, session_version = session_version + 1, updated_at = now() WHERE institution_id = $2',
    [hashPassword(password), req.params.institutionId]);
  if (!rowCount) return res.status(404).json({ error: 'الحساب غير موجود' });
  const { rows } = await pool.query('SELECT login_code FROM app_accounts WHERE institution_id = $1', [req.params.institutionId]);
  res.json({ institution_id: req.params.institutionId, login_code: rows[0].login_code, password });
}));

// إصدار كلمات مرور جديدة لكل المؤسسات (تظهر مرة واحدة فقط)
app.post('/api/admin/accounts/reset-all', requireAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT institution_id, login_code FROM app_accounts ORDER BY login_code');
  const out = [];
  for (const r of rows) {
    const password = randomPassword();
    await pool.query(
      'UPDATE app_accounts SET password_hash = $1, must_change = true, session_version = session_version + 1, updated_at = now() WHERE institution_id = $2',
      [hashPassword(password), r.institution_id]);
    out.push({ institution_id: r.institution_id, login_code: r.login_code, password });
  }
  res.json(out);
}));

// إعادة مؤسسة لوضعها الأولي (يمسح بياناتها ويُبقي حسابها)
app.post('/api/admin/institutions/:id/reset', requireAdmin, wrap(async (req, res) => {
  const id = req.params.id;
  const inst = await getExisting('waqf_institutions', id);
  if (!inst) return res.status(404).json({ error: 'المؤسسة غير موجودة' });
  const d = inst.data;
  const clean = {
    id, name: d.name, type: d.type, governorate: d.governorate || '', wilayat: d.wilayat || '',
    profile_completed: false, contact_phone: '', email: '', establishment_date: '', license_number: '',
    manager_name: '', documents: [], capital_omr: 0, employees_omani: 0, employees_non_omani: 0,
    employees_seconded: 0, created_at: d.created_at || new Date().toISOString(),
  };
  await pool.query("DELETE FROM app_records WHERE institution_id = $1 AND collection NOT IN ('waqf_institutions','waqf_feedback')", [id]);
  await pool.query('DELETE FROM app_files WHERE institution_id = $1', [id]);
  await pool.query("UPDATE app_records SET data = $1::jsonb, updated_at = now() WHERE collection = 'waqf_institutions' AND id = $2", [JSON.stringify(clean), id]);
  res.json({ ok: true });
}));

// نسخة احتياطية كاملة
app.get('/api/admin/export', requireAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT collection, id, institution_id, data, created_at, updated_at FROM app_records ORDER BY collection, created_at');
  const accounts = await pool.query('SELECT institution_id, login_code FROM app_accounts ORDER BY login_code');
  const withFiles = req.query.files === '1';
  let files;
  if (withFiles) {
    const f = await pool.query('SELECT id, institution_id, name, mime, size, data, created_at FROM app_files ORDER BY created_at');
    files = f.rows.map(r => ({ ...r, data: r.data.toString('base64') }));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="waqf-backup-${withFiles ? 'full-' : ''}${stamp}.json"`);
  res.json({ version: 2, exported_at: new Date().toISOString(), records: rows, accounts: accounts.rows, ...(withFiles ? { files } : {}) });
}));

// استعادة نسخة احتياطية (تستبدل كل السجلات، ولا تمس كلمات المرور)
app.post('/api/admin/import', requireAdmin, wrap(async (req, res) => {
  const b = req.body;
  if (!b || b.version !== 2 || !Array.isArray(b.records)) return res.status(400).json({ error: 'ملف النسخة الاحتياطية غير صالح' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM app_records');
    for (const r of b.records) {
      if (!COLLECTIONS[r.collection]) continue;
      await client.query('INSERT INTO app_records (collection, id, institution_id, data) VALUES ($1, $2, $3, $4::jsonb)',
        [r.collection, r.id, r.institution_id, JSON.stringify(r.data)]);
    }
    // نسخة كاملة فيها ملفات: تُستبدل الملفات أيضاً. نسخة بدون ملفات: تبقى الملفات الحالية كما هي
    if (Array.isArray(b.files)) {
      await client.query('DELETE FROM app_files');
      for (const f of b.files) {
        if (!f || !f.id || !f.institution_id || typeof f.data !== 'string') continue;
        const buf = Buffer.from(f.data, 'base64');
        await client.query('INSERT INTO app_files (id, institution_id, name, mime, size, data, created_at) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, now()))',
          [f.id, f.institution_id, String(f.name || 'file').slice(0, 255), String(f.mime || 'application/octet-stream'), buf.length, buf, f.created_at || null]);
      }
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  const created = [];
  const { rows } = await pool.query("SELECT id FROM app_records WHERE collection = 'waqf_institutions' AND id NOT IN (SELECT institution_id FROM app_accounts)");
  for (const r of rows) created.push(await createAccount(r.id));
  res.json({ ok: true, new_accounts: created, files_restored: Array.isArray(b.files) ? b.files.length : null });
}));

// ─── الملفات المرفقة ───
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MIME_BY_EXT = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8',
};
const canAccessFile = (s, f) => s.role === 'admin' || f.institution_id === s.institution_id;

app.post('/api/files', requireAuth, wrap(async (req, res) => {
  const s = req.session;
  const name = String(req.body?.name || '').slice(0, 255);
  const institutionId = s.role === 'admin' ? String(req.body?.institution_id || '') : s.institution_id;
  if (!institutionId) return res.status(400).json({ error: 'المؤسسة غير محددة' });
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const mime = MIME_BY_EXT[ext];
  if (!mime) return res.status(400).json({ error: 'نوع الملف غير مسموح. المسموح: PDF و Word و Excel و PowerPoint والصور' });
  const buf = Buffer.from(String(req.body?.data || ''), 'base64');
  if (!buf.length) return res.status(400).json({ error: 'الملف فارغ' });
  if (buf.length > MAX_FILE_BYTES) return res.status(400).json({ error: 'حجم الملف أكبر من 10 ميغابايت' });
  const id = newId();
  await pool.query('INSERT INTO app_files (id, institution_id, name, mime, size, data) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, institutionId, name, mime, buf.length, buf]);
  res.json({ id, name, size: buf.length });
}));

app.get('/api/files/:id', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM app_files WHERE id = $1', [req.params.id]);
  const f = rows[0];
  if (!f) return res.status(404).json({ error: 'الملف غير موجود' });
  if (!canAccessFile(req.session, f)) return res.status(403).json({ error: 'غير مسموح' });
  const inline = /^(application\/pdf|image\/)/.test(f.mime) && req.query.download !== '1';
  res.setHeader('Content-Type', f.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.send(f.data);
}));

app.delete('/api/files/:id', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT institution_id FROM app_files WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.json({ ok: true });
  if (!canAccessFile(req.session, rows[0])) return res.status(403).json({ error: 'غير مسموح' });
  await pool.query('DELETE FROM app_files WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

app.get('/api/admin/files', requireAdmin, wrap(async (req, res) => {
  const inst = req.query.institution_id ? String(req.query.institution_id) : null;
  const { rows } = await pool.query(
    `SELECT id, institution_id, name, mime, size, created_at FROM app_files
     ${inst ? 'WHERE institution_id = $1' : ''} ORDER BY created_at DESC`, inst ? [inst] : []);
  res.json(rows);
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'غير موجود' }));

// ─── الواجهة ───────────────────────────────────────────────────────────────
const distPath = path.join(__dirname, 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

// ─── تهيئة قاعدة البيانات ──────────────────────────────────────────────────
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      institution_id TEXT,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS app_records_inst_idx ON app_records (institution_id);
    CREATE TABLE IF NOT EXISTS app_accounts (
      institution_id TEXT PRIMARY KEY,
      login_code TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      must_change BOOLEAN NOT NULL DEFAULT true,
      session_version INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS app_admins (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      session_version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_files (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS app_files_inst_idx ON app_files (institution_id);
  `);

  // مفتاح توقيع الجلسات: من Secrets إن وُجد، وإلا يُنشأ مرة ويُحفظ في القاعدة
  if (!SESSION_SECRET) {
    const { rows } = await pool.query("SELECT value FROM app_meta WHERE key = 'session_secret'");
    if (rows[0]) SESSION_SECRET = rows[0].value;
    else {
      SESSION_SECRET = crypto.randomBytes(32).toString('hex');
      await pool.query("INSERT INTO app_meta (key, value) VALUES ('session_secret', $1)", [SESSION_SECRET]);
    }
  }

  // حساب المدير
  // - إن وُضع Secret اسمه ADMIN_PASSWORD تُستخدم قيمته
  // - وإلا تبقى كلمة المرور الحالية للنسخة السابقة (admin / admin) حتى لا يتغير الدخول
  //   ويمكن تغييرها لاحقاً من زر "تغيير كلمة المرور"
  const adminUser = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const { rows: admins } = await pool.query('SELECT username, password_hash FROM app_admins WHERE username = $1', [adminUser]);
  if (!admins[0]) {
    const initial = process.env.ADMIN_PASSWORD || 'admin';
    await pool.query('INSERT INTO app_admins (username, password_hash) VALUES ($1, $2)', [adminUser, hashPassword(initial)]);
    console.log(`حساب المدير: ${adminUser} (${process.env.ADMIN_PASSWORD ? 'كلمة المرور من ADMIN_PASSWORD' : 'نفس كلمة المرور السابقة'})`);
  } else if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD_FORCE === 'true'
             && !verifyPassword(process.env.ADMIN_PASSWORD, admins[0].password_hash)) {
    await pool.query('UPDATE app_admins SET password_hash = $1, session_version = session_version + 1 WHERE username = $2', [hashPassword(process.env.ADMIN_PASSWORD), adminUser]);
    console.log('تم تعيين كلمة مرور المدير من ADMIN_PASSWORD');
  }

  // البيانات الأولية: مرة واحدة فقط
  const { rows: seeded } = await pool.query("SELECT value FROM app_meta WHERE key = 'seeded_v2'");
  if (seeded[0]) return;

  const legacy = await pool.query("SELECT to_regclass('public.waqf_store') AS t");
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (legacy.rows[0].t) {
      await migrateLegacy(client);
    } else {
      await seedFresh(client);
    }
    await client.query("INSERT INTO app_meta (key, value) VALUES ('seeded_v2', $1)", [new Date().toISOString()]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

// نقل كل البيانات من الجدول القديم waqf_store كما هي، مع نفس رموز الدخول وكلمات المرور
// الجدول القديم لا يُحذف ولا يُعدَّل، ويبقى نسخة احتياطية
async function migrateLegacy(client) {
  const { rows } = await client.query('SELECT key, data FROM waqf_store');
  const store = Object.fromEntries(rows.map(r => [r.key, r.data]));
  const list = (k) => Array.isArray(store[k]) ? store[k] : [];

  const evalOwner = new Map(list('waqf_evaluations').map(e => [e.id, e.institution_id]));
  const counts = {};
  const insert = async (collection, item, owner) => {
    if (!item || typeof item !== 'object') return;
    if (!item.id) item = { ...item, id: newId() };
    await client.query(
      'INSERT INTO app_records (collection, id, institution_id, data) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (collection, id) DO NOTHING',
      [collection, String(item.id), owner, JSON.stringify(item)]);
    counts[collection] = (counts[collection] || 0) + 1;
  };

  for (const [collection, def] of Object.entries(COLLECTIONS)) {
    if (collection === 'waqf_settings') {
      if (store.waqf_settings && typeof store.waqf_settings === 'object' && !Array.isArray(store.waqf_settings)) {
        await insert('waqf_settings', { ...store.waqf_settings, id: 'main' }, null);
      }
      continue;
    }
    for (const item of list(collection)) {
      let owner = null;
      if (def.owner === 'self') owner = item.id;
      else if (def.owner === 'field') owner = item.institution_id || null;
      else if (def.owner === 'evaluation') owner = evalOwner.get(item.evaluation_id) || null;
      await insert(collection, item, owner);
    }
  }

  // الحسابات: نفس رمز الدخول ونفس كلمة المرور الحالية (تُحفظ مشفّرة)، بدون إلزام بالتغيير
  const accounts = new Map(list('waqf_accounts').map(a => [a.institution_id, a]));
  const used = new Set();
  let n = 0, kept = 0;
  for (const inst of list('waqf_institutions')) {
    if (!inst?.id) continue;
    const a = accounts.get(inst.id);
    let code = a?.login_code;
    // مؤسسة بلا حساب: النسخة السابقة كانت تنشئ لها رمزاً بكلمة المرور 1234
    const password = a?.password != null ? String(a.password).trim() : '1234';
    if (!code || used.has(code.toUpperCase())) {
      do { n += 1; code = `WQ${String(n).padStart(3, '0')}`; } while (used.has(code));
    } else kept++;
    used.add(code.toUpperCase());
    await client.query(
      'INSERT INTO app_accounts (institution_id, login_code, password_hash, must_change) VALUES ($1, $2, $3, false) ON CONFLICT DO NOTHING',
      [inst.id, code, hashPassword(password)]);
  }
  console.log('✅ تم نقل البيانات من الجدول القديم:', JSON.stringify(counts), `| حسابات: ${used.size} (منها ${kept} بنفس الرمز)`);
}

// تثبيت جديد بدون بيانات سابقة: قائمة المؤسسات فقط
async function seedFresh(client) {
  const seedFile = path.join(__dirname, 'server', 'seed-institutions.json');
  const institutions = JSON.parse(readFileSync(seedFile, 'utf8'));
  let n = 0;
  for (const s of institutions) {
    n += 1;
    const id = newId();
    const clean = {
      id, name: s.name, type: s.type || 'وقفية عامة', governorate: s.governorate || '', wilayat: s.wilayat || '',
      profile_completed: false, contact_phone: '', email: '', establishment_date: '', license_number: '',
      manager_name: '', documents: [], capital_omr: 0, employees_omani: 0, employees_non_omani: 0,
      employees_seconded: 0, created_at: new Date().toISOString(),
    };
    await client.query("INSERT INTO app_records (collection, id, institution_id, data) VALUES ('waqf_institutions', $1, $1, $2::jsonb)", [id, JSON.stringify(clean)]);
    // كلمة مرور عشوائية — يصدرها المدير من صفحة الحسابات
    await client.query('INSERT INTO app_accounts (institution_id, login_code, password_hash, must_change) VALUES ($1, $2, $3, true)',
      [id, `WQ${String(n).padStart(3, '0')}`, hashPassword(randomPassword(24))]);
  }
  console.log(`✅ تم تجهيز ${institutions.length} مؤسسة. أصدر كلمات المرور من: ملاحظات النظام ← الحسابات`);
}

async function main() {
  // تشغيل الخادم أولاً حتى تنجح فحوصات النشر، ثم تجهيز القاعدة
  const PORT = Number(process.env.PORT) || 3001;
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 API server running on port ${PORT}`));
  for (let attempt = 1; ; attempt++) {
    try { await initDb(); dbReady = true; console.log('✅ Database ready'); return; }
    catch (e) {
      console.error(`❌ Database init failed (attempt ${attempt}):`, e.message);
      await new Promise(r => setTimeout(r, Math.min(30000, 2000 * attempt)));
    }
  }
}

main();
