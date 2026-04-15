require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const multer     = require('multer');
const ImageKit   = require('imagekit');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 10, message: { error: 'Too many attempts.' } });
const apiLimiter  = rateLimit({ windowMs: 60*1000, max: 200 });
app.use('/api/', apiLimiter);

// ─── ImageKit ─────────────────────────────────────────────────────────────────
const imagekit = new ImageKit({
  publicKey:   process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey:  process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// ─── Multer ───────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    ['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype)
      ? cb(null, true) : cb(new Error('Images only'));
  }
});

// ─── Schemas ──────────────────────────────────────────────────────────────────
const categorySchema = new mongoose.Schema({
  nameAr:      { type: String, required: true, trim: true },
  name:        { type: String, default: '' },          // اختياري الآن
  slug:        { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  icon:        { type: String, default: '☕' },
  order:       { type: Number, default: 1 }            // يبدأ من 1
}, { timestamps: true });

const itemSchema = new mongoose.Schema({
  nameAr:        { type: String, required: true, trim: true },
  name:          { type: String, default: '' },        // اختياري الآن
  description:   { type: String, default: '' },
  descriptionAr: { type: String, default: '' },
  price:         { type: Number, required: true, min: 0 },
  oldPrice:      { type: Number, default: null },
  image:         { type: String, required: true },
  imageFileId:   { type: String, default: '' },
  category:      { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  order:         { type: Number, default: 1 },          // يبدأ من 1
  inStock:       { type: Boolean, default: true }
}, { timestamps: true });

// TTL index: يحذف الطلبات تلقائياً بعد 10 أشهر (300 يوم)
const ORDER_TTL = 300 * 24 * 60 * 60; // ثواني

const orderSchema = new mongoose.Schema({
  customerName:     { type: String, required: true, trim: true },
  customerPhone:    { type: String, required: true, trim: true },
  customerLocation: { type: String, required: true, trim: true },
  items: [{
    itemId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    name:          String,
    nameAr:        String,
    price:         Number,
    originalPrice: Number,
    discounted:    Boolean,
    quantity:      { type: Number, min: 1 },
    image:         String,
    _id:           false
  }],
  totalAmount:     { type: Number, required: true, min: 0 },
  originalTotal:   { type: Number, default: null },
  promoCode:       { type: String, default: '' },
  promoDiscount:   { type: Number, default: 0 },
  promoAdvertiser: { type: String, default: '' },
  status:          { type: String, enum: ['pending','contacted','completed','cancelled'], default: 'pending' },
  notes:           { type: String, default: '' },
  expiresAt:       { type: Date, default: () => new Date(Date.now() + ORDER_TTL * 1000) }
}, { timestamps: true });

// TTL index على expiresAt — MongoDB يحذف تلقائياً
orderSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const adminSchema = new mongoose.Schema({
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }
}, { timestamps: true });

const agencySchema = new mongoose.Schema({
  nameAr:      { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  image:       { type: String, default: '' },
  imageFileId: { type: String, default: '' },
  order:       { type: Number, default: 1 }
}, { timestamps: true });

const agencyItemSchema = new mongoose.Schema({
  nameAr:        { type: String, required: true, trim: true },
  description:   { type: String, default: '' },
  price:         { type: Number, required: true, min: 0 },
  oldPrice:      { type: Number, default: null },
  image:         { type: String, required: true },
  imageFileId:   { type: String, default: '' },
  agency:        { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
  order:         { type: Number, default: 1 },
  inStock:       { type: Boolean, default: true }
}, { timestamps: true });

const promoCodeSchema = new mongoose.Schema({
  code:          { type: String, required: true, unique: true, trim: true, uppercase: true },
  advertiserName:{ type: String, required: true, trim: true },
  discountType:  { type: String, enum: ['percent','fixed'], default: 'percent' },
  discountValue: { type: Number, required: true, min: 0 },
  scope:         { type: String, enum: ['all','category','items','agency'], default: 'all' },
  categories:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  agencies:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Agency' }],
  items:         [{ type: mongoose.Schema.Types.ObjectId, ref: 'Item' }],
  usageCount:    { type: Number, default: 0 },
  orderCount:    { type: Number, default: 0 },
  maxUsage:      { type: Number, default: null },
  isActive:      { type: Boolean, default: true }
}, { timestamps: true });

const Category   = mongoose.model('Category',   categorySchema);
const Item       = mongoose.model('Item',       itemSchema);
const Order      = mongoose.model('Order',      orderSchema);
const Admin      = mongoose.model('Admin',      adminSchema);
const Agency     = mongoose.model('Agency',     agencySchema);
const AgencyItem = mongoose.model('AgencyItem', agencyItemSchema);
const PromoCode  = mongoose.model('PromoCode',  promoCodeSchema);

// ─── Auth Middleware ───────────────────────────────────────────────────────────
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.adminId = jwt.verify(token, process.env.JWT_SECRET).id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ─── SSE ──────────────────────────────────────────────────────────────────────
let sseClients = [];

app.get('/api/admin/notifications/stream', auth, (req, res) => {
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  const id = `${Date.now()}-${Math.random()}`;
  sseClients.push({ id, res });
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
  req.on('close', () => { clearInterval(hb); sseClients = sseClients.filter(c => c.id !== id); });
});

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(c => { try { c.res.write(msg); } catch {} });
}

// ─── Admin Auth ────────────────────────────────────────────────────────────────

// تسجيل الدخول
app.post('/api/admin/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'يرجى إدخال البريد وكلمة المرور' });
    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (!admin || !(await bcrypt.compare(password, admin.password)))
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, email: admin.email });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// إنشاء أول أدمن (مرة واحدة)
app.post('/api/admin/setup', async (req, res) => {
  try {
    if (await Admin.countDocuments() > 0)
      return res.status(400).json({ error: 'يوجد أدمن بالفعل' });
    const { email, password } = req.body;
    if (!email || !password || password.length < 6)
      return res.status(400).json({ error: 'يرجى إدخال إيميل وكلمة مرور (6 أحرف على الأقل)' });
    await new Admin({ email, password: await bcrypt.hash(password, 12) }).save();
    res.json({ message: 'تم إنشاء الأدمن بنجاح' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// إضافة أدمن جديد من لوحة الإدارة
app.post('/api/admin/add', auth, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || password.length < 6)
      return res.status(400).json({ error: 'يرجى إدخال إيميل وكلمة مرور (6 أحرف على الأقل)' });
    const exists = await Admin.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ error: 'هذا الإيميل مسجل بالفعل' });
    await new Admin({ email: email.toLowerCase(), password: await bcrypt.hash(password, 12) }).save();
    res.json({ message: 'تم إضافة الأدمن بنجاح' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// تغيير كلمة المرور
app.put('/api/admin/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6)
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    const admin = await Admin.findById(req.adminId);
    if (!admin) return res.status(404).json({ error: 'الأدمن غير موجود' });
    if (!(await bcrypt.compare(currentPassword, admin.password)))
      return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    admin.password = await bcrypt.hash(newPassword, 12);
    await admin.save();
    res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// قائمة الأدمنز
app.get('/api/admin/list', auth, async (req, res) => {
  try {
    const admins = await Admin.find({}, 'email createdAt').sort({ createdAt: 1 });
    res.json(admins);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// حذف أدمن
app.delete('/api/admin/:id', auth, async (req, res) => {
  try {
    if (req.params.id === req.adminId.toString())
      return res.status(400).json({ error: 'لا يمكنك حذف حسابك الحالي' });
    await Admin.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف الأدمن' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Categories ────────────────────────────────────────────────────────────────
app.get('/api/categories', async (req, res) => {
  try { res.json(await Category.find().sort({ order: 1, createdAt: 1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

async function uniqueSlug(base, excludeId = null) {
  const b = (base || 'cat').toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'') || 'cat';
  let slug = b, i = 1;
  while (await Category.findOne({ slug, ...(excludeId && { _id: { $ne: excludeId } }) }))
    slug = `${b}-${i++}`;
  return slug;
}

app.post('/api/admin/categories', auth, async (req, res) => {
  try {
    const { nameAr, name, description, icon, order } = req.body;
    if (!nameAr) return res.status(400).json({ error: 'الاسم العربي مطلوب' });
    const slug = await uniqueSlug(name || nameAr);
    const cat  = await new Category({
      nameAr, name: name||nameAr, description: description||''
      , icon: icon||'☕', slug, order: parseInt(order)||1
    }).save();
    res.status(201).json(cat);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/categories/reorder', auth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    await Promise.all(ids.map((id, idx) => Category.findByIdAndUpdate(id, { order: idx + 1 })));
    res.json({ message: 'تم الحفظ' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/categories/:id', auth, async (req, res) => {
  try {
    const { nameAr, name, description, icon, order } = req.body;
    const update = {
      nameAr, name: name||nameAr||''
      , description: description||''
      , icon: icon||'☕', order: parseInt(order)||1
    };
    if (name || nameAr) update.slug = await uniqueSlug(name||nameAr, req.params.id);
    const cat = await Category.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!cat) return res.status(404).json({ error: 'القسم غير موجود' });
    res.json(cat);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/categories/:id', auth, async (req, res) => {
  try {
    const n = await Item.countDocuments({ category: req.params.id });
    if (n > 0) return res.status(400).json({ error: `لا يمكن الحذف: يوجد ${n} منتج في هذا القسم` });
    const cat = await Category.findByIdAndDelete(req.params.id);
    if (!cat) return res.status(404).json({ error: 'القسم غير موجود' });
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Items ─────────────────────────────────────────────────────────────────────
app.get('/api/items', async (req, res) => {
  try {
    const filter = {};
    if (req.query.category && typeof req.query.category !== 'string') {
  return res.status(400).json({ error: 'Invalid category parameter',
    message:"Category must be a string ID" });
    
} else if (req.query.category) filter.category = req.query.category;
    res.json(await Item.find(filter).populate('category').sort({ order: 1, createdAt: 1 }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/items/:id', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id).populate('category');
    if (!item) return res.status(404).json({ error: 'المنتج غير موجود' });
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// رفع الصورة - يتحول إلى WebP في server.js لكن التحويل يصير في المتصفح (admin.html)
app.post('/api/admin/upload', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'لم يتم اختيار صورة' });
    const r = await imagekit.upload({
      file: req.file.buffer.toString('base64'),
      fileName: `${Date.now()}.webp`,
      folder: '/more-espresso',
      useUniqueFileName: true
    });
    res.json({ url: r.url, fileId: r.fileId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/items', auth, async (req, res) => {
  try {
    const { nameAr, name, description, descriptionAr, price, oldPrice,
            image, imageFileId, category, order, inStock } = req.body;
    if (!nameAr || !price || !image || !category)
      return res.status(400).json({ error: 'الاسم العربي والسعر والصورة والقسم مطلوبة' });
    const item = await new Item({
      nameAr, name: name||nameAr,
      description: description||''
      , descriptionAr: descriptionAr||''
      , price: parseFloat(price), oldPrice: oldPrice ? parseFloat(oldPrice) : null,
      image, imageFileId: imageFileId||''
      , category
      , order: parseInt(order)||1,
      inStock: inStock !== false && inStock !== 'false'
    }).save();
    res.status(201).json(await item.populate('category'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/items/reorder', auth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    await Promise.all(ids.map((id, idx) => Item.findByIdAndUpdate(id, { order: idx + 1 })));
    res.json({ message: 'تم الحفظ' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/items/:id', auth, async (req, res) => {
  try {
    const { nameAr, name, description, descriptionAr, price, oldPrice,
            image, imageFileId, category, order, inStock } = req.body;

    // جلب المنتج القديم أولاً
    const oldItem = await Item.findById(req.params.id);
    if (!oldItem) return res.status(404).json({ error: 'المنتج غير موجود' });

    // إذا تغيرت الصورة، احذف القديمة من ImageKit
    if (image && image !== oldItem.image && oldItem.imageFileId) {
      imagekit.deleteFile(oldItem.imageFileId).catch(e =>
        console.warn('ImageKit delete warn:', e.message)
      );
    }

    const update = {
      nameAr, name: name||nameAr||'',
      description: description||'', descriptionAr: descriptionAr||'',
      price: parseFloat(price), oldPrice: oldPrice ? parseFloat(oldPrice) : null,
      category, order: parseInt(order)||1,
      inStock: inStock !== false && inStock !== 'false'
    };
    if (image) { update.image = image; update.imageFileId = imageFileId||''; }

    const item = await Item.findByIdAndUpdate(req.params.id, update, { new: true }).populate('category');
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/items/:id', auth, async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'المنتج غير موجود' });
    if (item.imageFileId) imagekit.deleteFile(item.imageFileId).catch(() => {});
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Orders ────────────────────────────────────────────────────────────────────
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, customerPhone, customerLocation, items, totalAmount, notes,
            promoCode, promoDiscount, promoAdvertiser, originalTotal } = req.body;
    if (!customerName?.trim() || !customerPhone?.trim() || !customerLocation?.trim())
      return res.status(400).json({ error: 'الاسم والهاتف والموقع مطلوبة' });
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ error: 'السلة فارغة' });
    const order = await new Order({
      customerName: customerName.trim(), customerPhone: customerPhone.trim(),
      customerLocation: customerLocation.trim(), items, totalAmount, notes: notes||'',
      promoCode: promoCode||'', promoDiscount: promoDiscount||0,
      promoAdvertiser: promoAdvertiser||'', originalTotal: originalTotal||null
    }).save();
    // Increment promo orderCount after confirmed order
    if (promoCode) {
      await PromoCode.findOneAndUpdate(
        { code: promoCode.trim().toUpperCase() },
        { $inc: { orderCount: 1 } }
      );
    }
    broadcast('newOrder', {
      orderId: order._id, customerName: order.customerName,
      customerPhone: order.customerPhone, customerLocation: order.customerLocation,
      totalAmount: order.totalAmount, itemCount: items.length, createdAt: order.createdAt
    });
    res.status(201).json({ message: 'تم إرسال الطلب', orderId: order._id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/orders', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 25, from, to } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to + 'T23:59:59');
    }
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(parseInt(limit)),
      Order.countDocuments(filter)
    ]);
    res.json({ orders, total, page: parseInt(page), pages: Math.ceil(total/limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/orders/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending','contacted','completed','cancelled'].includes(status))
      return res.status(400).json({ error: 'حالة غير صالحة' });
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    res.json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// حذف طلب يدوياً
app.delete('/api/admin/orders/:id', auth, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    res.json({ message: 'تم حذف الطلب' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// إحصائيات
app.get('/api/admin/stats', auth, async (req, res) => {
  try {
    const [cats, itemsCount, totalOrders, pendingOrders, completedOrders, rev] = await Promise.all([
      Category.countDocuments(),
      Item.countDocuments(),
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: 'completed' }),
      Order.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, t: { $sum: '$totalAmount' } } }])
    ]);
    res.json({ cats, items: itemsCount, totalOrders, pendingOrders, completedOrders, revenue: rev[0]?.t || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Agencies ─────────────────────────────────────────────────────────────────
app.get('/api/agencies', async (req, res) => {
  try { res.json(await Agency.find().sort({ order: 1, createdAt: 1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/admin/agencies', auth, async (req, res) => {
  try { res.json(await Agency.find().sort({ order: 1, createdAt: 1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/admin/agencies', auth, async (req, res) => {
  try {
    const { nameAr, description, image, imageFileId, order } = req.body;
    if (!nameAr) return res.status(400).json({ error: 'اسم الوكالة مطلوب' });
    const agency = await new Agency({ nameAr, description: description||'', image: image||'', imageFileId: imageFileId||'', order: parseInt(order)||1 }).save();
    res.status(201).json(agency);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/admin/agencies/reorder', auth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    await Promise.all(ids.map((id, idx) => Agency.findByIdAndUpdate(id, { order: idx + 1 })));
    res.json({ message: 'تم الحفظ' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/agencies/:id', auth, async (req, res) => {
  try {
    const { nameAr, description, image, imageFileId, order } = req.body;
    const old = await Agency.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'الوكالة غير موجودة' });
    if (image && image !== old.image && old.imageFileId) imagekit.deleteFile(old.imageFileId).catch(() => {});
    const update = { nameAr, description: description||'', order: parseInt(order)||1 };
    if (image) { update.image = image; update.imageFileId = imageFileId||''; }
    res.json(await Agency.findByIdAndUpdate(req.params.id, update, { new: true }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/admin/agencies/:id', auth, async (req, res) => {
  try {
    const agency = await Agency.findByIdAndDelete(req.params.id);
    if (!agency) return res.status(404).json({ error: 'الوكالة غير موجودة' });
    if (agency.imageFileId) imagekit.deleteFile(agency.imageFileId).catch(() => {});
    const agencyItems = await AgencyItem.find({ agency: req.params.id });
    for (const it of agencyItems) { if (it.imageFileId) imagekit.deleteFile(it.imageFileId).catch(() => {}); }
    await AgencyItem.deleteMany({ agency: req.params.id });
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Agency Items ──────────────────────────────────────────────────────────────
app.get('/api/agency-items', async (req, res) => {
  try {
    const filter = {};
    if (req.query.agency) filter.agency = req.query.agency;
    res.json(await AgencyItem.find(filter).populate('agency').sort({ order: 1, createdAt: 1 }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/admin/agency-items', auth, async (req, res) => {
  try {
    const { nameAr, description, price, oldPrice, image, imageFileId, agency, order, inStock } = req.body;
    if (!nameAr || !price || !image || !agency) return res.status(400).json({ error: 'الاسم والسعر والصورة والوكالة مطلوبة' });
    const item = await new AgencyItem({ nameAr, description: description||'', price: parseFloat(price), oldPrice: oldPrice ? parseFloat(oldPrice) : null, image, imageFileId: imageFileId||'', agency, order: parseInt(order)||1, inStock: inStock !== false && inStock !== 'false' }).save();
    res.status(201).json(await item.populate('agency'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/admin/agency-items/reorder', auth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    await Promise.all(ids.map((id, idx) => AgencyItem.findByIdAndUpdate(id, { order: idx + 1 })));
    res.json({ message: 'تم الحفظ' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/agency-items/:id', auth, async (req, res) => {
  try {
    const { nameAr, description, price, oldPrice, image, imageFileId, agency, order, inStock } = req.body;
    const old = await AgencyItem.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'المنتج غير موجود' });
    if (image && image !== old.image && old.imageFileId) imagekit.deleteFile(old.imageFileId).catch(() => {});
    const update = { nameAr, description: description||'', price: parseFloat(price), oldPrice: oldPrice ? parseFloat(oldPrice) : null, agency, order: parseInt(order)||1, inStock: inStock !== false && inStock !== 'false' };
    if (image) { update.image = image; update.imageFileId = imageFileId||''; }
    res.json(await AgencyItem.findByIdAndUpdate(req.params.id, update, { new: true }).populate('agency'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/admin/agency-items/:id', auth, async (req, res) => {
  try {
    const item = await AgencyItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'المنتج غير موجود' });
    if (item.imageFileId) imagekit.deleteFile(item.imageFileId).catch(() => {});
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Promo Codes ───────────────────────────────────────────────────────────────
app.get('/api/admin/promo-codes', auth, async (req, res) => {
  try { res.json(await PromoCode.find().populate('categories','nameAr').populate('items','nameAr').sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/admin/promo-codes', auth, async (req, res) => {
  try {
    const { code, advertiserName, discountType, discountValue, scope, categories, agencies, items, maxUsage } = req.body;
    if (!code || !advertiserName || !discountValue) return res.status(400).json({ error: 'الكود والمعلن وقيمة الخصم مطلوبة' });
    const promo = await new PromoCode({
      code: code.trim().toUpperCase(), advertiserName,
      discountType: discountType||'percent', discountValue: parseFloat(discountValue),
      scope: scope||'all',
      categories: scope==='category' ? (categories||[]) : [],
      agencies: scope==='agency' ? (agencies||[]) : [],
      items: scope==='items' ? (items||[]) : [],
      maxUsage: maxUsage ? parseInt(maxUsage) : null
    }).save();
    res.status(201).json(promo);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'هذا الكود موجود مسبقاً' });
    res.status(500).json({ error: err.message });
  }
});
app.put('/api/admin/promo-codes/:id', auth, async (req, res) => {
  try {
    const { advertiserName, discountType, discountValue, scope, categories, agencies, items, isActive, maxUsage } = req.body;
    const update = {
      advertiserName, discountType, discountValue: parseFloat(discountValue), scope, isActive,
      categories: scope==='category' ? (categories||[]) : [],
      agencies: scope==='agency' ? (agencies||[]) : [],
      items: scope==='items' ? (items||[]) : [],
      maxUsage: maxUsage ? parseInt(maxUsage) : null
    };
    const promo = await PromoCode.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!promo) return res.status(404).json({ error: 'الكود غير موجود' });
    res.json(promo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/admin/promo-codes/:id', auth, async (req, res) => {
  try {
    const p = await PromoCode.findByIdAndDelete(req.params.id);
    if (!p) return res.status(404).json({ error: 'الكود غير موجود' });
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/validate-promo', async (req, res) => {
  try {
    const { code, cartItems } = req.body;
    if (!code) return res.status(400).json({ error: 'يرجى إدخال البروموكود' });
    const promo = await PromoCode.findOne({ code: code.trim().toUpperCase(), isActive: true })
      .populate('categories','_id').populate('agencies','_id').populate('items','_id');
    if (!promo) return res.status(404).json({ error: 'البروموكود غير صحيح أو غير مفعل' });
    // Check max usage
    if (promo.maxUsage !== null && promo.orderCount >= promo.maxUsage)
      return res.status(400).json({ error: 'انتهت صلاحية هذا البروموكود (تجاوز الحد الأقصى)' });
    let applicableItemIds = [];
    if (promo.scope === 'all') {
      applicableItemIds = cartItems.map(i => i.itemId);
    } else if (promo.scope === 'category') {
      const catIds = promo.categories.map(c => c._id.toString());
      const matchedItems = await Item.find({ _id: { $in: cartItems.map(i => i.itemId) }, category: { $in: catIds } });
      applicableItemIds = matchedItems.map(i => i._id.toString());
    } else if (promo.scope === 'agency') {
      const agencyIds = promo.agencies.map(a => a._id.toString());
      const matchedItems = await AgencyItem.find({ _id: { $in: cartItems.map(i => i.itemId) }, agency: { $in: agencyIds } });
      applicableItemIds = matchedItems.map(i => i._id.toString());
    } else if (promo.scope === 'items') {
      const promoItemIds = promo.items.map(i => i._id.toString());
      applicableItemIds = cartItems.filter(i => promoItemIds.includes(i.itemId)).map(i => i.itemId);
    }
    res.json({ valid: true, discountType: promo.discountType, discountValue: promo.discountValue, scope: promo.scope, applicableItemIds, advertiserName: promo.advertiserName, code: promo.code });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/promo-codes/:id/orders', auth, async (req, res) => {
  try {
    const promo = await PromoCode.findById(req.params.id);
    if (!promo) return res.status(404).json({ error: 'الكود غير موجود' });
    const orders = await Order.find({ promoCode: promo.code }).sort({ createdAt: -1 });
    res.json({ promo, orders });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ─── Serve ─────────────────────────────────────────────────────────────────────
app.get('/',           (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ─── Connect ───────────────────────────────────────────────────────────────────

async function keepAlive() {
  try {
    await mongoose.connection.db.admin().ping();
    console.log("Ping sent ✅");
  } catch (err) {
    console.error("Ping error:", err);
  }
}

    // كل 10 دقائق
    
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    setInterval(keepAlive, 10 * 60 * 1000);

    // أول تشغيل
    keepAlive();
    app.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));
  })
  .catch(err => { console.error('❌', err.message); process.exit(1); });