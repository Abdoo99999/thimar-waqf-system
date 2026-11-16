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
    if (k === name) { try { return decodeURIComponent(v.join('=')); } catch { return null; } }
  }
  return null;
};
const setSession = (req, res, payload) => {
  const token = sign({ ...payload, jti: payload.jti || newId(), exp: Date.now() + SESSION_HOURS * 3600 * 1000 });
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${secure ? '; Secure' : ''}`);
};
const clearSession = (res) => res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);

// ─── الحد من محاولات الدخول الخاطئة ────────────────────────────────────────
// العدّاد في القاعدة (يصمد مع تعدد نسخ الخادم). قفل لكل حساب بصرف النظر عن الجهاز،
// وقفل أوسع لكل عنوان يجرّب حسابات كثيرة
const LOCK_MINUTES = 15;
const LIMITS = { acct: 8, ip: 40, pw: 8 };
const lockedFor = async (keys) => {
  const { rows } = await pool.query('SELECT 1 FROM app_login_fails WHERE key = ANY($1) AND until > now() LIMIT 1', [keys]);
  return rows.length > 0;
};
const recordFail = async (key) => {
  const max = LIMITS[key.split(':')[0]] || 8;
  await pool.query(
    `INSERT INTO app_login_fails (key, count, until, updated_at) VALUES ($1, 1, NULL, now())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN app_login_fails.updated_at < now() - interval '${LOCK_MINUTES} minutes' THEN 1 ELSE app_login_fails.count + 1 END,
       updated_at = now()`, [key]);
  await pool.query(`UPDATE app_login_fails SET until = now() + interval '${LOCK_MINUTES} minutes', count = 0 WHERE key = $1 AND count >= $2`, [key, max]);
};
const clearFails = (key) => pool.query('DELETE FROM app_login_fails WHERE key = $1', [key]);
const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
const LOCK_MSG = `محاولات كثيرة. حاول بعد ${LOCK_MINUTES} دقيقة.`;

// ─── التطبيق ───────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
// حجم الطلب: صغير لكل الطلبات، وأكبر فقط لرفع الملفات والملاحظات (قد تحوي صورة) والاستعادة
const jsonSmall = express.json({ limit: '2mb' });
const jsonFiles = express.json({ limit: '15mb' });
const jsonLarge = express.json({ limit: '1gb' });
app.use((req, res, next) => {
  const p = req.path;
  // الطلبات الكبيرة لا تُقرأ إلا من مستخدم مسجّل (والاستعادة من المدير فقط)
  if (p === '/api/admin/import' || p === '/api/files' || p.startsWith('/api/records/waqf_feedback/')) {
    const s = SESSION_SECRET ? unsign(readCookie(req, COOKIE)) : null;
    if (!s || (p === '/api/admin/import' && s.role !== 'admin')) return res.status(401).json({ error: 'غير مسجل الدخول' });
  }
  const parser = p === '/api/admin/import' ? jsonLarge
    : (p === '/api/files' || p.startsWith('/api/records/waqf_feedback/')) ? jsonFiles : jsonSmall;
  parser(req, res, next);
});

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
// مستخدمو الوزارة: المعتمِد (يعتمد ويُرجع) والمطّلع (عرض فقط)
const STAFF_ROLES = ['approver', 'viewer'];
const isStaff = (s) => !!s && STAFF_ROLES.includes(s.role);
const seesAll = (s) => !!s && (s.role === 'admin' || isStaff(s));
const STAFF_ROLE_LABEL = { approver: 'معتمِد', viewer: 'مطّلع' };

const wrap = (fn) => (req, res) => fn(req, res).catch(e => {
  console.error(`${req.method} ${req.path}:`, e.message);
  res.status(500).json({ error: 'خطأ في الخادم' });
});

const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString('hex'));

// ─── سجل العمليات (للإضافة فقط) ───────────────────────────────────────────
const actorOf = (s) => !s ? { role: 'guest', id: '', name: '' }
  : { role: s.role, id: s.role === 'user' ? s.institution_id : s.username, name: s.name || '' };
const audit = async (req, action, opts = {}) => {
  try {
    const a = actorOf(opts.session || req.session);
    await pool.query(
      `INSERT INTO app_audit (actor_role, actor_id, actor_name, action, institution_id, collection, record_id, detail, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [a.role, a.id, a.name, action, opts.institution_id ?? null, opts.collection ?? null, opts.record_id ?? null,
       JSON.stringify(opts.detail || {}), clientIp(req)]);
  } catch (e) { console.error('audit:', e.message); }
};

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ─── الدخول والخروج ────────────────────────────────────────────────────────
app.post('/api/auth/login', wrap(async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const password = String(req.body?.password || '').trim();
  const keys = [`acct:${code}`, `ip:${clientIp(req)}`];
  if (await lockedFor(keys)) return res.status(429).json({ error: LOCK_MSG });

  const { rows } = await pool.query('SELECT * FROM app_accounts WHERE upper(login_code) = $1', [code]);
  const acc = rows[0];
  // تجزئة وهمية عند غياب الحساب حتى لا يكشف زمن الرد الرموز الصحيحة
  const ok = verifyPassword(password, acc ? acc.password_hash : DUMMY_HASH) && !!acc;
  if (!ok) {
    await recordFail(keys[0]); await recordFail(keys[1]);
    await audit(req, 'login_failed', { detail: { code } });
    return res.status(401).json({ error: 'رمز الدخول أو كلمة المرور غير صحيحة' });
  }
  const inst = await pool.query("SELECT data FROM app_records WHERE collection = 'waqf_institutions' AND id = $1", [acc.institution_id]);
  if (!inst.rows[0]) return res.status(401).json({ error: 'المؤسسة غير موجودة' });
  await clearFails(keys[0]);
  const sess = { role: 'user', institution_id: acc.institution_id, name: inst.rows[0].data.name, v: acc.session_version };
  setSession(req, res, sess);
  await audit(req, 'login', { session: sess, institution_id: acc.institution_id });
  res.json({ role: 'user', institution_id: acc.institution_id, name: inst.rows[0].data.name, must_change_password: acc.must_change });
}));

app.post('/api/auth/admin-login', wrap(async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '').trim();
  const keys = [`acct:admin:${username}`, `ip:${clientIp(req)}`];
  if (await lockedFor(keys)) return res.status(429).json({ error: LOCK_MSG });
  const { rows } = await pool.query('SELECT * FROM app_admins WHERE username = $1', [username]);
  if (rows[0] && verifyPassword(password, rows[0].password_hash)) {
    await clearFails(keys[0]);
    const sess = { role: 'admin', username, name: 'مدير النظام', v: rows[0].session_version };
    setSession(req, res, sess);
    await audit(req, 'login', { session: sess });
    return res.json({ role: 'admin', name: 'مدير النظام' });
  }
  const st = (await pool.query('SELECT * FROM app_staff WHERE username = $1 AND active = true', [username])).rows[0];
  if (!verifyPassword(password, st ? st.password_hash : DUMMY_HASH) || !st) {
    await recordFail(keys[0]); await recordFail(keys[1]);
    await audit(req, 'login_failed', { detail: { username } });
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }
  await clearFails(keys[0]);
  const sess = { role: st.role, username, name: st.display_name, title: st.title || '', v: st.session_version };
  setSession(req, res, sess);
  await audit(req, 'login', { session: sess });
  res.json({ role: st.role, name: st.display_name, title: st.title || '', must_change_password: st.must_change });
}));

// الخروج يُبطل الجلسة نفسها في الخادم (لا يكفي مسح الكوكي من المتصفح)
app.post('/api/auth/logout', wrap(async (req, res) => {
  const s = SESSION_SECRET ? unsign(readCookie(req, COOKIE)) : null;
  if (s?.jti) {
    await pool.query('INSERT INTO app_revoked (jti, exp) VALUES ($1, to_timestamp($2 / 1000.0)) ON CONFLICT DO NOTHING', [s.jti, s.exp]);
    await pool.query('DELETE FROM app_revoked WHERE exp < now()');
    await audit(req, 'logout', { session: s, institution_id: s.institution_id || null });
  }
  clearSession(res);
  res.json({ ok: true });
}));

// التحقق من أن الجلسة ما زالت صالحة (تُلغى عند تغيير كلمة المرور)
const sessionStillValid = async (s) => {
  if (s.jti) {
    const r = await pool.query('SELECT 1 FROM app_revoked WHERE jti = $1', [s.jti]);
    if (r.rows.length) return false;
  }
  if (s.role === 'admin') {
    const { rows } = await pool.query('SELECT session_version FROM app_admins WHERE username = $1', [s.username]);
    return rows[0] && rows[0].session_version === s.v;
  }
  if (isStaff(s)) {
    const { rows } = await pool.query('SELECT session_version, role, active FROM app_staff WHERE username = $1', [s.username]);
    return rows[0] && rows[0].active && rows[0].role === s.role && rows[0].session_version === s.v;
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
  if (isStaff(s)) {
    const { rows } = await pool.query('SELECT must_change FROM app_staff WHERE username = $1', [s.username]);
    must = !!rows[0]?.must_change;
  }
  res.json({ authenticated: true, role: s.role, name: s.name, title: s.title || '', institution_id: s.institution_id || null, must_change_password: must });
}));

app.post('/api/auth/change-password', requireAuth, wrap(async (req, res) => {
  const current = String(req.body?.current || '').trim();
  const next = String(req.body?.next || '').trim();
  if (next.length < 8) return res.status(400).json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف' });
  const s = req.session;
  const table = s.role === 'admin' ? 'app_admins' : isStaff(s) ? 'app_staff' : 'app_accounts';
  const where = s.role === 'user' ? 'institution_id' : 'username';
  const whereVal = s.role === 'user' ? s.institution_id : s.username;
  const pwKey = `pw:${s.role}:${whereVal}`;
  if (await lockedFor([pwKey])) return res.status(429).json({ error: LOCK_MSG });
  const { rows } = await pool.query(`SELECT password_hash, session_version FROM ${table} WHERE ${where} = $1`, [whereVal]);
  if (!rows[0] || !verifyPassword(current, rows[0].password_hash)) {
    await recordFail(pwKey);
    return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  }
  await clearFails(pwKey);
  if (current === next) return res.status(400).json({ error: 'اختر كلمة مرور مختلفة عن الحالية' });
  const v = rows[0].session_version + 1;
  await pool.query(`UPDATE ${table} SET password_hash = $1, session_version = $2${s.role !== 'admin' ? ', must_change = false' : ''} WHERE ${where} = $3`, [hashPassword(next), v, whereVal]);
  setSession(req, res, { ...s, v, jti: undefined, exp: undefined });
  await audit(req, 'change_password', { institution_id: s.institution_id || null });
  res.json({ ok: true });
}));

// ─── قراءة البيانات (كل مستخدم يستلم ما يخصه فقط) ─────────────────────────
app.get('/api/data', requireAuth, wrap(async (req, res) => {
  const s = req.session;
  const out = {};
  for (const c of Object.keys(COLLECTIONS)) out[c] = [];
  const { rows } = seesAll(s)
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
const resolveOwner = async (collection, item, db = pool) => {
  const def = COLLECTIONS[collection];
  if (def.global) return null;
  if (def.owner === 'self') return item.id;
  if (def.owner === 'field') return item.institution_id || null;
  if (def.owner === 'evaluation') {
    const { rows } = await db.query("SELECT institution_id FROM app_records WHERE collection = 'waqf_evaluations' AND id = $1", [item.evaluation_id]);
    return rows[0]?.institution_id || null;
  }
  return null;
};

// دورة التقييم الحالية: يحددها المدير من الإعدادات (لا تتبع ساعة أي جهاز)
const getCycleYear = async (db = pool) => {
  const { rows } = await db.query("SELECT data->>'current_cycle' AS y FROM app_records WHERE collection = 'waqf_settings' LIMIT 1");
  const y = Number(rows[0]?.y);
  return Number.isInteger(y) && y > 2000 && y < 2100 ? y : new Date().getFullYear();
};

// بيانات المؤسسة تُقفل في الخادم ما دام تقييم الدورة الحالية مرفوعاً أو معتمداً
const institutionLocked = async (instId, db = pool) => {
  if (!instId) return false;
  const year = await getCycleYear(db);
  const { rows } = await db.query(
    `SELECT 1 FROM app_records WHERE collection = 'waqf_evaluations' AND institution_id = $1
     AND data->>'cycle_year' = $2 AND data->>'workflow_status' IN ('submitted', 'approved') LIMIT 1`, [instId, String(year)]);
  return rows.length > 0;
};

// حقول تكتبها الوزارة أو الخادم فقط في سجل التقييم
const MINISTRY_EVAL_FIELDS = ['report_ref', 'ministry_notes', 'approver_name', 'approver_title', 'report_benchmark', 'report_snapshot',
  'approved_at', 'returned_at', 'admin_feedback', 'submission_date', 'declaration_accepted_at'];
const copyFields = (item, from, fields) => {
  for (const f of fields) {
    if (from && from[f] !== undefined) item[f] = from[f]; else delete item[f];
  }
};
// بعد الرفع تبقى خطة التحسين مفتوحة لتحديث التنفيذ فقط
const EXEC_FIELDS = ['status', 'notes', 'evidence_doc'];
const changedOutside = (item, prev, allowed) => {
  const keys = new Set([...Object.keys(item), ...Object.keys(prev || {})]);
  return [...keys].filter(k => !allowed.includes(k) && JSON.stringify(item[k]) !== JSON.stringify(prev?.[k]));
};

// ─── التحقق من المحتوى ────────────────────────────────────────────────────
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const optNum = (v) => v === undefined || v === null || isNum(v);
const isYear = (v) => Number.isInteger(v) && v >= 2000 && v <= 2100;
const validateRecord = async (collection, item, s, db = pool) => {
  switch (collection) {
    case 'waqf_responses':
      if (typeof item.indicator_id !== 'string' || !item.indicator_id) return 'المؤشر غير محدد';
      if (!Number.isInteger(item.score) || item.score < 0 || item.score > 5) return 'الدرجة يجب أن تكون من 1 إلى 5';
      break;
    case 'waqf_evaluations':
      if (!isYear(item.cycle_year)) return 'سنة الدورة غير صحيحة';
      break;
    case 'waqf_financials': {
      if (!isYear(item.fiscal_year)) return 'السنة المالية غير صحيحة';
      for (const f of ['total_assets', 'total_liabilities', 'net_waqf_assets', 'total_revenues', 'total_expenses', 'admin_general_expenses', 'surplus_deficit']) {
        if (!isNum(item[f])) return 'القيم المالية يجب أن تكون أرقاماً';
      }
      for (const f of ['total_assets', 'total_liabilities', 'total_revenues', 'total_expenses', 'admin_general_expenses']) {
        if (item[f] < 0) return 'القيم المالية لا تكون سالبة';
      }
      for (const f of ['operating_cash_flow', 'investing_cash_flow', 'financing_cash_flow', 'cash_end_period', 'beneficiary_distributions']) {
        if (!optNum(item[f])) return 'القيم المالية يجب أن تكون أرقاماً';
      }
      if (isNum(item.beneficiary_distributions) && item.beneficiary_distributions < 0) return 'القيم المالية لا تكون سالبة';
      if (s.role === 'user' && item.status === 'Approved') return 'حالة القوائم غير صالحة';
      const dup = await db.query(
        `SELECT 1 FROM app_records WHERE collection = 'waqf_financials' AND institution_id = $1 AND id <> $2 AND data->>'fiscal_year' = $3 LIMIT 1`,
        [item.institution_id, item.id, String(item.fiscal_year)]);
      if (dup.rows.length) return `توجد قوائم مالية مسجلة لسنة ${item.fiscal_year}`;
      break;
    }
    case 'waqf_compliance': {
      if (!isYear(item.cycle_year)) return 'سنة الدورة غير صحيحة';
      const dup = await db.query(
        `SELECT 1 FROM app_records WHERE collection = 'waqf_compliance' AND institution_id = $1 AND id <> $2 AND data->>'cycle_year' = $3 LIMIT 1`,
        [item.institution_id, item.id, String(item.cycle_year)]);
      if (dup.rows.length) return 'يوجد سجل امتثال لهذه الدورة';
      break;
    }
    case 'waqf_risks':
      for (const f of ['probability', 'impact']) if (!Number.isInteger(item[f]) || item[f] < 1 || item[f] > 5) return 'الاحتمال والأثر من 1 إلى 5';
      break;
    case 'waqf_settings':
      if (item.current_cycle !== undefined && !isYear(item.current_cycle)) return 'دورة التقييم غير صحيحة';
      break;
    case 'waqf_feedback':
      if (item.image !== undefined && item.image !== null && item.image !== '' && !/^data:image\/(png|jpe?g|gif|webp);base64,/.test(String(item.image))) return 'الصورة غير صالحة';
      break;
  }
  return null;
};

// شروط رفع التقييم تُفحص في الخادم أيضاً (لا تكفي الواجهة)
const checkSubmitReady = async (instId, ev, db = pool) => {
  const y = ev.cycle_year;
  const get = async (sql, params) => (await db.query(sql, params)).rows;
  const inst = (await get("SELECT data FROM app_records WHERE collection = 'waqf_institutions' AND id = $1", [instId]))[0]?.data;
  if (!inst?.profile_completed) return 'أكمل بيانات المؤسسة أولاً';
  const fin = await get(`SELECT 1 FROM app_records WHERE collection = 'waqf_financials' AND institution_id = $1 AND data->>'fiscal_year' IN ($2, $3) LIMIT 1`, [instId, String(y), String(y - 1)]);
  if (!fin.length) return 'أدخل القوائم المالية أولاً';
  if (ev.status !== 'final') return 'أكمل الأداء المؤسسي أولاً';
  const inds = await get("SELECT data FROM app_records WHERE collection = 'waqf_indicators'", []);
  const active = inds.map(r => r.data).filter(i => i.active !== false);
  const resp = new Map((await get("SELECT data FROM app_records WHERE collection = 'waqf_responses' AND data->>'evaluation_id' = $1", [ev.id])).map(r => [r.data.indicator_id, r.data]));
  if (active.length) {
    const missing = active.filter(i => !(resp.get(i.id)?.score >= 1));
    if (missing.length) return `بقي ${missing.length} مؤشر بلا درجة في الأداء المؤسسي`;
    const noEv = active.filter(i => resp.get(i.id).score >= 4 && !resp.get(i.id).evidence_doc);
    if (noEv.length) return `${noEv.length} مؤشر بدرجة 4 أو 5 بلا دليل مرفق`;
  }
  const comp = (await get(`SELECT data FROM app_records WHERE collection = 'waqf_compliance' AND institution_id = $1 AND data->>'cycle_year' = $2`, [instId, String(y)]))[0]?.data;
  if (!comp || comp.completed === false) return 'أكمل الامتثال أولاً';
  const risks = await get("SELECT 1 FROM app_records WHERE collection = 'waqf_risks' AND institution_id = $1 LIMIT 1", [instId]);
  if (!risks.length) return 'سجّل المخاطر أولاً';
  const imp = (await get("SELECT data FROM app_records WHERE collection = 'waqf_improvements' AND data->>'evaluation_id' = $1", [ev.id])).map(r => r.data);
  if (!imp.length && !ev.no_improvements) return 'أضف بنود خطة التحسين، أو أقرّ بعدم وجود بنود';
  const incomplete = imp.filter(i => !String(i.recommended_action || '').trim() || /^مرتبط بمؤشر رقم/.test(i.recommended_action) || !String(i.owner || '').trim() || !i.due_date);
  if (incomplete.length) return `أكمل الإجراء والمسؤول والموعد في ${incomplete.length} من بنود خطة التحسين`;
  if (!String(ev.declarant_name || '').trim()) return 'اكتب اسم المُقِرّ بصحة البيانات';
  return null;
};

const checkUserWrite = async (s, collection, id, item, existing) => {
  const def = COLLECTIONS[collection];
  if (def.global) return 'لا تملك صلاحية تعديل هذه البيانات';
  const owner = await resolveOwner(collection, item);
  if (owner !== s.institution_id) return 'لا يمكنك تعديل بيانات مؤسسة أخرى';
  if (existing && existing.institution_id !== s.institution_id) return 'لا يمكنك تعديل بيانات مؤسسة أخرى';
  if (collection === 'waqf_institutions' && !existing) return 'لا يمكن للمؤسسة إنشاء مؤسسة جديدة';
  if (collection === 'waqf_institutions' && existing) {
    // اسم المؤسسة ونوعها يحددهما المدير
    item.name = existing.data.name; item.type = existing.data.type;
  }
  if (collection === 'waqf_feedback') {
    // الرد والحالة من صلاحية المدير فقط؛ المؤسسة تستطيع فقط تعليم الرد كمقروء
    if (existing) {
      const strip = (o) => { const c = { ...o }; delete c.reply_seen; return JSON.stringify(c); };
      if (strip(item) !== strip(existing.data)) return 'لا يمكن تعديل الملاحظة بعد إرسالها';
    } else if (item.admin_reply || item.replied_at || (item.status && item.status !== 'new') || item.is_read) {
      return 'بيانات غير صالحة';
    } else {
      const { rows } = await pool.query("SELECT data->>'name' AS n FROM app_records WHERE collection = 'waqf_institutions' AND id = $1", [s.institution_id]);
      item.institution_name = rows[0]?.n || s.name || '';
    }
    return null;
  }
  if (def.owner === 'evaluation' && existing && existing.data?.evaluation_id !== item.evaluation_id) return 'لا يمكن نقل السجل إلى تقييم آخر';

  if (collection === 'waqf_evaluations') {
    const prev = existing?.data;
    const ps = prev?.workflow_status || 'draft';
    if (ps === 'submitted' || ps === 'approved') return 'التقييم مرفوع للاعتماد ولا يمكن تعديله';
    if (!prev) {
      const cy = await getCycleYear();
      if (item.cycle_year !== cy) return `دورة التقييم الحالية ${cy}`;
      const dup = await pool.query(
        `SELECT 1 FROM app_records WHERE collection = 'waqf_evaluations' AND institution_id = $1 AND data->>'cycle_year' = $2 LIMIT 1`,
        [s.institution_id, String(item.cycle_year)]);
      if (dup.rows.length) return { status: 409, error: 'يوجد تقييم لهذه الدورة. حدّث الصفحة.' };
    } else if (item.cycle_year !== prev.cycle_year) return 'لا يمكن تغيير سنة الدورة';
    const ns = item.workflow_status || 'draft';
    if (!['draft', 'submitted', 'returned'].includes(ns) || (ns === 'returned' && ps !== 'returned') || (ns === 'draft' && ps === 'returned')) {
      return 'لا يمكن للمؤسسة تغيير حالة التقييم بهذا الشكل';
    }
    copyFields(item, prev, MINISTRY_EVAL_FIELDS);
    if (ns === 'submitted') {
      const err = await checkSubmitReady(s.institution_id, item);
      if (err) return err;
      const now = new Date().toISOString();
      item.submission_date = now; item.declaration_accepted_at = now;
      item.declarant_name = String(item.declarant_name).trim().slice(0, 120);
      item.declarant_title = String(item.declarant_title || '').trim().slice(0, 160);
    }
    return null;
  }

  // باقي بيانات المؤسسة: مقفلة ما دام تقييم الدورة مرفوعاً أو معتمداً
  if (await institutionLocked(s.institution_id)) {
    if (collection === 'waqf_improvements' && existing && changedOutside(item, existing.data, EXEC_FIELDS).length === 0) return null;
    return collection === 'waqf_improvements'
      ? 'بنود الخطة ثابتة بعد الرفع؛ يمكن تحديث حالة التنفيذ والأدلة فقط'
      : 'التقييم مرفوع للوزارة، ولا يمكن تعديل البيانات حتى تُعيده الوزارة';
  }
  if (def.owner === 'evaluation') {
    const { rows } = await pool.query("SELECT data->>'workflow_status' AS ws FROM app_records WHERE collection = 'waqf_evaluations' AND id = $1", [item.evaluation_id]);
    if (['submitted', 'approved'].includes(rows[0]?.ws)) return 'التقييم مرفوع للاعتماد ولا يمكن تعديله';
  }
  return null;
};

// المعتمِد: يعتمد التقييم المرفوع أو يُرجعه مع ملاحظاته فقط، ولا يعدّل غير ذلك
const APPROVAL_FIELDS = ['workflow_status', 'approved_at', 'returned_at', 'report_ref', 'report_benchmark', 'report_snapshot', 'ministry_notes', 'approver_name', 'approver_title', 'admin_feedback'];
const checkStaffWrite = (s, collection, item, existing) => {
  if (s.role !== 'approver') return 'صلاحيتك للاطلاع فقط';
  if (collection !== 'waqf_evaluations' || !existing) return 'صلاحية المعتمِد تقتصر على اعتماد التقييمات';
  if (existing.data?.workflow_status !== 'submitted') return { status: 409, error: 'الطلب لم يعد بانتظار الاعتماد. حدّث الصفحة.' };
  if (!['approved', 'returned'].includes(item.workflow_status)) return 'إجراء غير مسموح';
  if (changedOutside(item, existing.data, APPROVAL_FIELDS).length) return 'لا يمكن للمعتمِد تعديل بيانات التقييم';
  return null;
};

// انتقال حالة التقييم بيد الوزارة (المدير أو المعتمِد): الاعتماد والإرجاع من «مرفوع» فقط
const checkMinistryEval = (item, existing) => {
  const prev = existing?.data;
  const ps = prev?.workflow_status || 'draft';
  const ns = item.workflow_status || 'draft';
  if (prev && ps !== ns) {
    if (!(ps === 'submitted' && (ns === 'approved' || ns === 'returned'))) {
      return { status: 409, error: 'تغيرت حالة التقييم أو لم تعد تسمح بهذا الإجراء. حدّث الصفحة.' };
    }
    if (ns === 'returned' && !String(item.admin_feedback || '').trim()) return 'اكتب سبب الإعادة';
    if (ns === 'approved' && (!item.report_snapshot || typeof item.report_snapshot !== 'object')) return 'تعذر حفظ نسخة التقرير. حدّث الصفحة وأعد المحاولة.';
  } else if (prev && ps === 'approved') {
    return { status: 409, error: 'التقييم معتمد ولا يمكن تعديله' };
  }
  if (!prev && ns !== 'draft') return 'التقييم الجديد يبدأ مسودة';
  // الحقول التي يكتبها الخادم: التواريخ ورقم المرجع ونسخة التقرير خارج لحظة الاعتماد
  const keepAlways = ['report_ref', 'approved_at', 'returned_at', 'submission_date', 'declaration_accepted_at'];
  copyFields(item, prev, ps !== ns ? keepAlways : [...keepAlways, 'report_snapshot', 'report_benchmark']);
  return null;
};

const REF_PREFIX = 'و.ش.د/ت.م';
// رقم المرجع التالي للسنة: يُولّد داخل معاملة مقفلة فلا يتكرر
const nextReportRef = async (db, year) => {
  await db.query('SELECT pg_advisory_xact_lock(7340021)');
  const prefix = `${REF_PREFIX}/${year}/`;
  const { rows } = await db.query(
    "SELECT data->>'report_ref' AS r FROM app_records WHERE collection = 'waqf_evaluations' AND data->>'report_ref' LIKE $1", [prefix + '%']);
  const max = rows.reduce((m, r) => Math.max(m, parseInt(String(r.r).slice(prefix.length), 10) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
};

const getExisting = async (collection, id, db = pool) => {
  const { rows } = await db.query('SELECT institution_id, data FROM app_records WHERE collection = $1 AND id = $2', [collection, id]);
  return rows[0] || null;
};

const deny = (res, err) => typeof err === 'object'
  ? res.status(err.status || 403).json({ error: err.error })
  : res.status(403).json({ error: err });

// حفظ سجل واحد
app.put('/api/records/:collection/:id', requireAuth, wrap(async (req, res) => {
  const { collection, id } = req.params;
  if (!COLLECTIONS[collection]) return res.status(404).json({ error: 'مجموعة غير معروفة' });
  const item = req.body;
  if (!item || typeof item !== 'object' || Array.isArray(item)) return res.status(400).json({ error: 'بيانات غير صالحة' });
  if (collection !== 'waqf_settings' && item.id !== id) return res.status(400).json({ error: 'رقم السجل غير مطابق' });
  const s = req.session;
  const existing = await getExisting(collection, id);

  if (isStaff(s)) {
    const err = checkStaffWrite(s, collection, item, existing);
    if (err) return deny(res, err);
    // اسم المعتمِد ومسماه من حسابه وليس مما يرسله المتصفح
    if (item.workflow_status === 'approved') { item.approver_name = s.name; item.approver_title = s.title || ''; }
  } else if (s.role !== 'admin') {
    const err = await checkUserWrite(s, collection, id, item, existing);
    if (err) return deny(res, err);
  }
  if (collection === 'waqf_evaluations' && seesAll(s)) {
    if (!existing && s.role === 'admin') {
      const dup = await pool.query(
        `SELECT 1 FROM app_records WHERE collection = 'waqf_evaluations' AND institution_id = $1 AND data->>'cycle_year' = $2 LIMIT 1`,
        [item.institution_id, String(item.cycle_year)]);
      if (dup.rows.length) return res.status(409).json({ error: 'يوجد تقييم لهذه الدورة. حدّث الصفحة.' });
    }
    const err = checkMinistryEval(item, existing);
    if (err) return deny(res, err);
  }
  const verr = await validateRecord(collection, item, s);
  if (verr) return res.status(400).json({ error: verr });

  const owner = await resolveOwner(collection, item);
  const prevStatus = existing?.data?.workflow_status;
  const transition = collection === 'waqf_evaluations' && (item.workflow_status || 'draft') !== (prevStatus || 'draft');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (transition && item.workflow_status === 'approved') {
      item.approved_at = new Date().toISOString();
      item.report_ref = existing?.data?.report_ref || await nextReportRef(client, item.cycle_year);
      delete item.returned_at;
      if (item.report_snapshot) item.report_snapshot.frozen_at = item.approved_at;
    }
    if (transition && item.workflow_status === 'returned') {
      item.returned_at = new Date().toISOString();
      delete item.report_snapshot; delete item.report_benchmark;
    }
    // ضبط تزامن بسيط: يرفض الحفظ إذا تغيّرت حالة التقييم منذ قراءته
    if (transition && existing) {
      const { rows } = await client.query("SELECT data->>'workflow_status' AS ws FROM app_records WHERE collection = 'waqf_evaluations' AND id = $1 FOR UPDATE", [id]);
      if ((rows[0]?.ws || 'draft') !== (prevStatus || 'draft')) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'تغيرت حالة التقييم. حدّث الصفحة.' }); }
    }
    await client.query(
      `INSERT INTO app_records (collection, id, institution_id, data) VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, institution_id = EXCLUDED.institution_id, updated_at = now()`,
      [collection, id, owner, JSON.stringify(item)]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }

  // مؤسسة جديدة أضافها المدير: إنشاء حساب دخول بكلمة مرور عشوائية
  let account = null;
  if (collection === 'waqf_institutions' && !existing && s.role === 'admin') {
    account = await createAccount(id);
  }
  const action = transition ? ({ submitted: 'submit', approved: 'approve', returned: 'return' }[item.workflow_status] || 'update') : existing ? 'update' : 'create';
  if (collection !== 'waqf_responses') {
    await audit(req, action, { institution_id: owner, collection, record_id: id,
      detail: transition ? { from: prevStatus || 'draft', to: item.workflow_status, report_ref: item.report_ref } : {} });
  }
  res.json({ ok: true, account, item });
}));

// حذف سجل واحد
app.delete('/api/records/:collection/:id', requireAuth, wrap(async (req, res) => {
  const { collection, id } = req.params;
  if (!COLLECTIONS[collection]) return res.status(404).json({ error: 'مجموعة غير معروفة' });
  const s = req.session;
  const existing = await getExisting(collection, id);
  if (isStaff(s)) return res.status(403).json({ error: 'غير مسموح' });
  if (!existing) return res.json({ ok: true });
  if (s.role !== 'admin') {
    if (collection === 'waqf_institutions' || COLLECTIONS[collection].global) return res.status(403).json({ error: 'غير مسموح' });
    if (existing.institution_id !== s.institution_id) return res.status(403).json({ error: 'لا يمكنك حذف بيانات مؤسسة أخرى' });
    if (collection === 'waqf_evaluations') return res.status(403).json({ error: 'غير مسموح' });
    if (collection !== 'waqf_feedback' && await institutionLocked(s.institution_id)) {
      return res.status(403).json({ error: 'التقييم مرفوع للوزارة، ولا يمكن الحذف حتى تُعيده الوزارة' });
    }
    if (COLLECTIONS[collection].owner === 'evaluation') {
      const { rows } = await pool.query("SELECT data->>'workflow_status' AS ws FROM app_records WHERE collection = 'waqf_evaluations' AND id = $1", [existing.data?.evaluation_id]);
      if (['submitted', 'approved'].includes(rows[0]?.ws)) return res.status(403).json({ error: 'التقييم مرفوع للاعتماد ولا يمكن الحذف' });
    }
  } else {
    if (collection === 'waqf_evaluations' && existing.data?.workflow_status === 'approved') {
      return res.status(403).json({ error: 'لا يمكن حذف تقييم معتمد' });
    }
    // المؤشرات: لا يُحذف مؤشر عليه إجابات (تنفصل عنه نتائج المؤسسات)
    if (collection === 'waqf_indicators') {
      const { rows } = await pool.query("SELECT 1 FROM app_records WHERE collection = 'waqf_responses' AND data->>'indicator_id' = $1 LIMIT 1", [id]);
      if (rows.length) return res.status(409).json({ error: 'لا يمكن حذف مؤشر عليه إجابات من المؤسسات.' });
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM app_records WHERE collection = $1 AND id = $2', [collection, id]);
    if (collection === 'waqf_institutions') {
      await client.query('DELETE FROM app_records WHERE institution_id = $1', [id]);
      await client.query('DELETE FROM app_accounts WHERE institution_id = $1', [id]);
      await client.query('DELETE FROM app_files WHERE institution_id = $1', [id]);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  if (collection !== 'waqf_responses') {
    await audit(req, 'delete', { institution_id: existing.institution_id, collection, record_id: id,
      detail: collection === 'waqf_institutions' ? { name: existing.data?.name } : {} });
  }
  res.json({ ok: true });
}));

// ─── مستخدمو الوزارة (يديرهم المدير) ───────────────────────────────────────
const cleanStaff = (b, partial = false) => {
  const out = {};
  if (!partial || b.display_name !== undefined) { out.display_name = String(b.display_name || '').trim().slice(0, 120); if (!out.display_name) return { error: 'الاسم مطلوب' }; }
  if (!partial || b.title !== undefined) out.title = String(b.title || '').trim().slice(0, 160);
  if (!partial || b.role !== undefined) { out.role = String(b.role || ''); if (!STAFF_ROLES.includes(out.role)) return { error: 'نوع الصلاحية غير صحيح' }; }
  if (b.active !== undefined) out.active = !!b.active;
  return { out };
};
app.get('/api/admin/staff', requireAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT username, display_name, title, role, active, must_change, created_at FROM app_staff ORDER BY created_at');
  res.json(rows);
}));
app.post('/api/admin/staff', requireAdmin, wrap(async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return res.status(400).json({ error: 'اسم المستخدم من 3 إلى 40 حرفاً إنجليزياً أو أرقاماً (بدون مسافات)' });
  if (/^wq\d+$/.test(username)) return res.status(400).json({ error: 'اسم المستخدم لا يبدأ بـ WQ (مخصص للمؤسسات)' });
  const exists = await pool.query('SELECT 1 FROM app_admins WHERE username = $1 UNION SELECT 1 FROM app_staff WHERE username = $1', [username]);
  if (exists.rows.length) return res.status(400).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
  const { out, error } = cleanStaff(req.body || {});
  if (error) return res.status(400).json({ error });
  const password = String(req.body?.password || '').trim();
  if (password.length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
  await pool.query('INSERT INTO app_staff (username, password_hash, role, display_name, title, active, must_change) VALUES ($1, $2, $3, $4, $5, true, $6)',
    [username, hashPassword(password), out.role, out.display_name, out.title, !!req.body?.must_change]);
  await audit(req, 'staff_create', { record_id: username, detail: { role: out.role } });
  res.json({ ok: true });
}));
app.put('/api/admin/staff/:username', requireAdmin, wrap(async (req, res) => {
  const { out, error } = cleanStaff(req.body || {}, true);
  if (error) return res.status(400).json({ error });
  const sets = [], vals = [];
  Object.entries(out).forEach(([k, v]) => { vals.push(v); sets.push(`${k} = $${vals.length}`); });
  const password = req.body?.password !== undefined ? String(req.body.password).trim() : null;
  if (password !== null) {
    if (password.length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
    vals.push(hashPassword(password)); sets.push(`password_hash = $${vals.length}`);
    sets.push('must_change = false');
  }
  if (!sets.length) return res.json({ ok: true });
  sets.push('session_version = session_version + 1');
  vals.push(req.params.username);
  const { rowCount } = await pool.query(`UPDATE app_staff SET ${sets.join(', ')} WHERE username = $${vals.length}`, vals);
  if (!rowCount) return res.status(404).json({ error: 'المستخدم غير موجود' });
  await audit(req, 'staff_update', { record_id: req.params.username, detail: { fields: Object.keys(out), password: password !== null } });
  res.json({ ok: true });
}));
app.delete('/api/admin/staff/:username', requireAdmin, wrap(async (req, res) => {
  await pool.query('DELETE FROM app_staff WHERE username = $1', [req.params.username]);
  await audit(req, 'staff_delete', { record_id: req.params.username });
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
  await audit(req, 'password_reset', { institution_id: req.params.institutionId });
  res.json({ institution_id: req.params.institutionId, login_code: rows[0].login_code, password });
}));

// تعيين كلمة مرور يحددها المدير (للتجربة أو بطلب المؤسسة) دون إلزام بتغييرها
app.post('/api/admin/accounts/:institutionId/set-password', requireAdmin, wrap(async (req, res) => {
  const password = String(req.body?.password || '').trim();
  if (password.length < 4 || password.length > 64) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون من 4 إلى 64 حرفاً' });
  const { rowCount } = await pool.query(
    'UPDATE app_accounts SET password_hash = $1, must_change = false, session_version = session_version + 1, updated_at = now() WHERE institution_id = $2',
    [hashPassword(password), req.params.institutionId]);
  if (!rowCount) return res.status(404).json({ error: 'الحساب غير موجود' });
  await audit(req, 'password_set', { institution_id: req.params.institutionId });
  res.json({ ok: true });
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
  await audit(req, 'password_reset_all', { detail: { count: out.length } });
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
  // ملاحظات المؤسسة على النظام تُحذف فقط إذا طلب المدير ذلك
  const keep = req.query.feedback === '1' ? ['waqf_institutions'] : ['waqf_institutions', 'waqf_feedback'];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM app_records WHERE institution_id = $1 AND NOT (collection = ANY($2))', [id, keep]);
    await client.query('DELETE FROM app_files WHERE institution_id = $1', [id]);
    await client.query("UPDATE app_records SET data = $1::jsonb, updated_at = now() WHERE collection = 'waqf_institutions' AND id = $2", [JSON.stringify(clean), id]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  await audit(req, 'institution_reset', { institution_id: id, detail: { name: d.name, feedback: req.query.feedback === '1' } });
  res.json({ ok: true });
}));

// نسخة احتياطية كاملة
app.get('/api/admin/export', requireAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT collection, id, institution_id, data, created_at, updated_at FROM app_records ORDER BY collection, created_at');
  // الحسابات بكلمات مرورها المشفّرة ومستخدمو الوزارة، حتى تعود الرموز وبيانات الدخول كما هي عند الاستعادة
  const accounts = await pool.query('SELECT institution_id, login_code, password_hash, must_change FROM app_accounts ORDER BY login_code');
  const staff = await pool.query('SELECT username, password_hash, role, display_name, title, active, must_change, created_at FROM app_staff ORDER BY created_at');
  const withFiles = req.query.files === '1';
  let files;
  if (withFiles) {
    const f = await pool.query('SELECT id, institution_id, name, mime, size, data, created_at FROM app_files ORDER BY created_at');
    files = f.rows.map(r => ({ ...r, data: r.data.toString('base64') }));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="waqf-backup-${withFiles ? 'full-' : ''}${stamp}.json"`);
  await audit(req, 'backup_export', { detail: { files: withFiles } });
  res.json({ version: 2, exported_at: new Date().toISOString(), records: rows, accounts: accounts.rows, staff: staff.rows, ...(withFiles ? { files } : {}) });
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
    // الحسابات: تعود بنفس الرموز وكلمات المرور (النسخ القديمة بلا كلمات مرور تُبقي الحسابات الحالية)
    const accs = Array.isArray(b.accounts) ? b.accounts.filter(a => a && a.institution_id && a.login_code && a.password_hash) : [];
    if (accs.length) {
      await client.query('DELETE FROM app_accounts');
      for (const a of accs) {
        await client.query('INSERT INTO app_accounts (institution_id, login_code, password_hash, must_change) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [a.institution_id, a.login_code, a.password_hash, !!a.must_change]);
      }
    } else if (Array.isArray(b.accounts)) {
      // نسخة قديمة فيها الرموز فقط: نعيد للمؤسسات رموزها السابقة ونُبقي كلمات المرور الحالية إن وُجدت
      for (const a of b.accounts) {
        if (!a?.institution_id || !a?.login_code) continue;
        await client.query('DELETE FROM app_accounts WHERE upper(login_code) = upper($1) AND institution_id <> $2', [a.login_code, a.institution_id]);
        await client.query(
          `INSERT INTO app_accounts (institution_id, login_code, password_hash, must_change) VALUES ($1, $2, $3, true)
           ON CONFLICT (institution_id) DO UPDATE SET login_code = EXCLUDED.login_code`,
          [a.institution_id, a.login_code, hashPassword(randomPassword(24))]);
      }
    }
    if (Array.isArray(b.staff) && b.staff.length) {
      await client.query('DELETE FROM app_staff');
      for (const u of b.staff) {
        if (!u?.username || !u?.password_hash || !STAFF_ROLES.includes(u.role)) continue;
        await client.query('INSERT INTO app_staff (username, password_hash, role, display_name, title, active, must_change) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',
          [u.username, u.password_hash, u.role, u.display_name || u.username, u.title || '', u.active !== false, !!u.must_change]);
      }
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
  await audit(req, 'backup_import', { detail: { records: b.records.length, accounts: Array.isArray(b.accounts) ? b.accounts.length : 0 } });
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
const canAccessFile = (s, f) => seesAll(s) || f.institution_id === s.institution_id;

// يُقبل الملف إذا طابق محتواه نوعه (لا يكفي الامتداد)
const SIGNATURES = {
  pdf: [[0x25, 0x50, 0x44, 0x46]],
  png: [[0x89, 0x50, 0x4e, 0x47]], jpg: [[0xff, 0xd8, 0xff]], jpeg: [[0xff, 0xd8, 0xff]],
  gif: [[0x47, 0x49, 0x46, 0x38]], webp: [[0x52, 0x49, 0x46, 0x46]],
  docx: [[0x50, 0x4b]], xlsx: [[0x50, 0x4b]], pptx: [[0x50, 0x4b]],
  doc: [[0xd0, 0xcf, 0x11, 0xe0]], xls: [[0xd0, 0xcf, 0x11, 0xe0]], ppt: [[0xd0, 0xcf, 0x11, 0xe0]],
};
const matchesType = (ext, buf) => {
  const sigs = SIGNATURES[ext];
  if (!sigs) return !buf.subarray(0, 512).toString('latin1').toLowerCase().includes('<script'); // txt/csv
  return sigs.some(sig => sig.every((b, i) => buf[i] === b));
};
const MAX_INSTITUTION_BYTES = 500 * 1024 * 1024;

app.post('/api/files', requireAuth, wrap(async (req, res) => {
  const s = req.session;
  const name = String(req.body?.name || '').slice(0, 255);
  if (isStaff(s)) return res.status(403).json({ error: 'غير مسموح' });
  const institutionId = s.role === 'admin' ? String(req.body?.institution_id || '') : s.institution_id;
  if (!institutionId) return res.status(400).json({ error: 'المؤسسة غير محددة' });
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const mime = MIME_BY_EXT[ext];
  if (!mime) return res.status(400).json({ error: 'نوع الملف غير مسموح. المسموح: PDF و Word و Excel و PowerPoint والصور' });
  const buf = Buffer.from(String(req.body?.data || ''), 'base64');
  if (!buf.length) return res.status(400).json({ error: 'الملف فارغ' });
  if (buf.length > MAX_FILE_BYTES) return res.status(400).json({ error: 'حجم الملف أكبر من 10 ميغابايت' });
  if (!matchesType(ext, buf)) return res.status(400).json({ error: 'محتوى الملف لا يطابق نوعه' });
  const used = await pool.query('SELECT COALESCE(SUM(size), 0)::bigint AS n FROM app_files WHERE institution_id = $1', [institutionId]);
  if (Number(used.rows[0].n) + buf.length > MAX_INSTITUTION_BYTES) return res.status(400).json({ error: 'تجاوزت المؤسسة المساحة المسموحة للمرفقات' });
  const id = newId();
  await pool.query('INSERT INTO app_files (id, institution_id, name, mime, size, data) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, institutionId, name, mime, buf.length, buf]);
  await audit(req, 'file_upload', { institution_id: institutionId, record_id: id, detail: { name, size: buf.length } });
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

// الحذف: المدير، أو المؤسسة المالكة قبل رفع تقييمها. مستخدمو الوزارة لا يحذفون
app.delete('/api/files/:id', requireAuth, wrap(async (req, res) => {
  const s = req.session;
  const { rows } = await pool.query('SELECT institution_id, name FROM app_files WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.json({ ok: true });
  if (isStaff(s)) return res.status(403).json({ error: 'صلاحيتك للاطلاع فقط' });
  if (s.role !== 'admin') {
    if (rows[0].institution_id !== s.institution_id) return res.status(403).json({ error: 'غير مسموح' });
    if (await institutionLocked(s.institution_id)) {
      // بعد الرفع: يُسمح فقط باستبدال أدلة تنفيذ خطة التحسين
      const used = await pool.query(
        "SELECT 1 FROM app_records WHERE collection = 'waqf_improvements' AND institution_id = $1 AND data->'evidence_doc'->>'file_id' = $2 LIMIT 1",
        [s.institution_id, req.params.id]);
      if (!used.rows.length) return res.status(403).json({ error: 'التقييم مرفوع للوزارة، ولا يمكن حذف المرفقات' });
    }
  }
  await pool.query('DELETE FROM app_files WHERE id = $1', [req.params.id]);
  await audit(req, 'file_delete', { institution_id: rows[0].institution_id, record_id: req.params.id, detail: { name: rows[0].name } });
  res.json({ ok: true });
}));

app.get('/api/admin/files', requireAdmin, wrap(async (req, res) => {
  const inst = req.query.institution_id ? String(req.query.institution_id) : null;
  const { rows } = await pool.query(
    `SELECT id, institution_id, name, mime, size, created_at FROM app_files
     ${inst ? 'WHERE institution_id = $1' : ''} ORDER BY created_at DESC`, inst ? [inst] : []);
  res.json(rows);
}));

// سجل العمليات (للمدير)
app.get('/api/admin/audit', requireAdmin, wrap(async (req, res) => {
  const conds = [], vals = [];
  if (req.query.institution_id) { vals.push(String(req.query.institution_id)); conds.push(`institution_id = $${vals.length}`); }
  if (req.query.action) { vals.push(String(req.query.action)); conds.push(`action = $${vals.length}`); }
  if (req.query.before) { vals.push(Number(req.query.before)); conds.push(`id < $${vals.length}`); }
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const { rows } = await pool.query(
    `SELECT id, at, actor_role, actor_id, actor_name, action, institution_id, collection, record_id, detail
     FROM app_audit ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''} ORDER BY id DESC LIMIT ${limit}`, vals);
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
    CREATE TABLE IF NOT EXISTS app_staff (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      display_name TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT true,
      must_change BOOLEAN NOT NULL DEFAULT false,
      session_version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
    CREATE TABLE IF NOT EXISTS app_login_fails (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      until TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS app_revoked (jti TEXT PRIMARY KEY, exp TIMESTAMPTZ NOT NULL);
    CREATE TABLE IF NOT EXISTS app_audit (
      id BIGSERIAL PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT now(),
      actor_role TEXT NOT NULL,
      actor_id TEXT NOT NULL DEFAULT '',
      actor_name TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      institution_id TEXT,
      collection TEXT,
      record_id TEXT,
      detail JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip TEXT
    );
    CREATE INDEX IF NOT EXISTS app_audit_inst_idx ON app_audit (institution_id, id DESC);
  `);
  // سجل العمليات للإضافة فقط: يُمنع تعديله أو حذفه من داخل القاعدة
  await pool.query(`
    CREATE OR REPLACE FUNCTION app_audit_readonly() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'app_audit is append-only'; END; $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS app_audit_no_change ON app_audit;
    CREATE TRIGGER app_audit_no_change BEFORE UPDATE OR DELETE ON app_audit FOR EACH ROW EXECUTE FUNCTION app_audit_readonly();
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

  // دورة التقييم الحالية: تُثبَّت مرة واحدة في الإعدادات (أحدث دورة فيها تقييمات، أو السنة الحالية)،
  // ثم يغيّرها المدير من الإعدادات عند فتح دورة جديدة
  await ensureCycleSetting();

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

async function ensureCycleSetting() {
  const { rows } = await pool.query("SELECT id, data FROM app_records WHERE collection = 'waqf_settings' LIMIT 1");
  if (rows[0] && Number.isInteger(Number(rows[0].data?.current_cycle)) && rows[0].data.current_cycle) return;
  const ev = await pool.query("SELECT MAX((data->>'cycle_year')::int) AS y FROM app_records WHERE collection = 'waqf_evaluations' AND data->>'cycle_year' ~ '^[0-9]{4}$'");
  const year = ev.rows[0]?.y || new Date().getFullYear();
  if (rows[0]) {
    await pool.query("UPDATE app_records SET data = data || jsonb_build_object('current_cycle', $1::int) WHERE collection = 'waqf_settings' AND id = $2", [year, rows[0].id]);
  } else {
    await pool.query("INSERT INTO app_records (collection, id, institution_id, data) VALUES ('waqf_settings', 'main', NULL, $1::jsonb)", [JSON.stringify({ id: 'main', current_cycle: year })]);
  }
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
