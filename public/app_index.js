// ══════════════════════════════════════════════════════
// State
// ══════════════════════════════════════════════════════
let categories     = [];
let allItems       = [];
let allAgencyItems = [];
let allAgencies    = [];
let currentCat     = 'all';
let cart           = JSON.parse(localStorage.getItem('me_cart')      || '[]');
let favorites      = JSON.parse(localStorage.getItem('me_favorites') || '[]');
let pmCurrentItemId   = null;
let pmCurrentItemType = 'regular';
let appliedPromo = null;

// ══════════════════════════════════════════════════════
// Utilities
// ══════════════════════════════════════════════════════
const $ = id => document.getElementById(id);
function saveCart()      { localStorage.setItem('me_cart',      JSON.stringify(cart));      }
function saveFavorites() { localStorage.setItem('me_favorites', JSON.stringify(favorites)); }
function isFav(id) { return favorites.includes(id); }

function toggleFav(id, event) {
  if (event) event.stopPropagation();
  if (isFav(id)) {
    favorites = favorites.filter(f => f !== id);
    showToast('تمت الإزالة من المفضلة');
  } else {
    favorites.push(id);
    showToast('أُضيف إلى المفضلة ❤️');
  }
  saveFavorites();
  document.querySelectorAll('.fav-btn[data-id="' + id + '"]').forEach(btn => {
    btn.classList.toggle('active', isFav(id));
    btn.innerHTML = favSVG(isFav(id));
  });
  const mfb = document.getElementById('pmFavBtn');
  if (mfb && mfb.dataset.id === id) {
    mfb.classList.toggle('active', isFav(id));
    mfb.innerHTML = favSVG(isFav(id)) + ' <span>' + (isFav(id)?'في المفضلة':'أضف للمفضلة') + '</span>';
  }
  if (currentCat === 'favorites') renderProducts('favorites');
}

function favSVG(active) {
  return active
    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="#e11d48" stroke="#e11d48" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'
    : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
}

function formatPrice(p) {
  return parseFloat(p||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}) + ' د.ع';
}

function showToast(msg, type = 'info') {
  const icons = { success: '✓', error: '✕', info: '●' };
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
  $('toastContainer').appendChild(div);
  setTimeout(() => { div.classList.add('removing'); setTimeout(() => div.remove(), 350); }, 3500);
}

// ══════════════════════════════════════════════════════
// Navbar
// ══════════════════════════════════════════════════════
window.addEventListener('scroll', () => {
  $('navbar').classList.toggle('scrolled', window.scrollY > 50);
  const sections = ['home','agencies','products','about'];
  let current = 'home';
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el && window.scrollY >= el.offsetTop - 120) current = id;
  });
  document.querySelectorAll('.nav-links a, .mobile-nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === `#${current}`);
  });
});

$('hamburger').addEventListener('click', function () {
  this.classList.toggle('open');
  $('mobileNav').classList.toggle('open');
});

document.querySelectorAll('.nav-links a, .mobile-nav a').forEach(a => {
  a.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (href?.startsWith('#')) {
      e.preventDefault();
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
      $('mobileNav').classList.remove('open');
      $('hamburger').classList.remove('open');
    }
  });
});

// ══════════════════════════════════════════════════════
// Data
// ══════════════════════════════════════════════════════
async function loadData() {
  try {
    const [cRes, iRes, aiRes, agRes] = await Promise.all([
      fetch('/api/categories'), fetch('/api/items'),
      fetch('/api/agency-items'), fetch('/api/agencies')
    ]);
    categories     = await cRes.json();
    allItems       = await iRes.json();
    allAgencyItems = await aiRes.json();
    const agenciesData = await agRes.json();
    allAgencies = agenciesData || [];
    renderAgenciesMarquee(agenciesData);
    renderCatTabs();
    renderProducts('all');
    initProductsSearch();
  } catch {
    $('productsGrid').innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon">⚠️</div>
        <h3>تعذر تحميل المنتجات</h3>
        <p>يرجى التحقق من الاتصال والمحاولة مرة أخرى</p>
        <button class="btn btn-outline" style="margin-top:16px" onclick="loadData()">إعادة المحاولة</button>
      </div>`;
  }
}

// ══════════════════════════════════════════════════════
// Agencies — Static horizontal scroll strip
// ══════════════════════════════════════════════════════
function renderAgenciesMarquee(agenciesData) {
  const section = document.getElementById('agencies');
  const track   = document.getElementById('agenciesTrack');
  if (!agenciesData || !agenciesData.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  track.innerHTML = agenciesData.map(a => `
    <div class="agency-bubble"
         onclick="filterByAgency('${a._id}','${(a.nameAr||'').replace(/'/g,"\\'")}')">
      <div class="agency-bubble-img">
        <img src="${a.image||'./def_image.webp'}" alt="${a.nameAr}"
             loading="lazy" onerror="this.src='./def_image.webp'">
      </div>
      <span class="agency-bubble-label">${a.nameAr||''}</span>
    </div>`).join('');

  // Mouse drag-to-scroll
  let isDown = false, startX = 0, scrollLeft = 0;
  track.addEventListener('mousedown',  e => { isDown = true; track.style.cursor='grabbing'; startX = e.pageX - track.offsetLeft; scrollLeft = track.scrollLeft; });
  track.addEventListener('mouseleave', () => { isDown = false; track.style.cursor='grab'; });
  track.addEventListener('mouseup',    () => { isDown = false; track.style.cursor='grab'; });
  track.addEventListener('mousemove',  e => { if (!isDown) return; e.preventDefault(); const x = e.pageX - track.offsetLeft; track.scrollLeft = scrollLeft - (x - startX); });
}

function filterByAgency(agencyId, agencyName) {
  document.querySelector('#products')?.scrollIntoView({ behavior: 'smooth' });
  document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
  const grid = $('productsGrid');
  const filtered = allAgencyItems.filter(i => {
    const aid = i.agency?._id || i.agency;
    return aid && aid.toString() === agencyId;
  });
  $('breadcrumbCurrent').textContent = agencyName;
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🏢</div><h3>لا توجد منتجات لهذه الوكالة</h3></div>`;
    return;
  }
  grid.innerHTML = filtered.map((item, i) => {
    const disc = (item.oldPrice && item.oldPrice > item.price) ? Math.round((1 - item.price / item.oldPrice) * 100) : 0;
    const favA = isFav(item._id);
    return `
    <div class="product-card fade-in-up" style="animation-delay:${Math.min(i,8)*0.05}s"
         onclick="openProductModal('${item._id}','agency')" data-id="${item._id}">
      <div class="product-card-img">
        <img src="${item.image || './def_image.webp'}" alt="${item.nameAr||item.name}" loading="lazy" onerror="this.src='./def_image.webp'">
        ${disc > 0 ? `<span class="sale-badge">خصم ${disc}%</span>` : ''}
        ${!item.inStock ? `<span class="sale-badge" style="background:#e74c3c">نفذ</span>` : ''}
        <button class="fav-btn ${favA?'active':''}" data-id="${item._id}"
          onclick="toggleFav('${item._id}',event)"
          title="${favA?'إزالة من المفضلة':'إضافة للمفضلة'}">${favSVG(favA)}</button>
      </div>
      <div class="product-card-body">
        <div class="product-card-category" style="color:var(--blue)">${item.agency?.nameAr || agencyName}</div>
        <div class="product-card-name">${item.nameAr||item.name}</div>
        ${item.description ? `<div class="product-card-desc">${item.description}</div>` : ''}
        <div class="product-card-footer">
          <div class="product-price">
            <span class="current">${formatPrice(item.price)}</span>
            ${(item.oldPrice && item.oldPrice > item.price) ? `<span class="old">${formatPrice(item.oldPrice)}</span>` : ''}
          </div>
          <button class="add-to-cart" title="أضف للسلة"
            onclick="event.stopPropagation();addToCart('${item._id}',1,'agency')"
            ${!item.inStock ? 'disabled style="opacity:.4;cursor:not-allowed"' : ''}>+</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
// Products Search
// ══════════════════════════════════════════════════════
let productsSearchTerm = '';

function initProductsSearch() {
  const searchInput = $('productsSearch');
  const clearBtn    = $('searchClearBtn');
  if (!searchInput) return;

  searchInput.addEventListener('input', function () {
    productsSearchTerm = this.value.trim().toLowerCase();
    clearBtn.style.display = productsSearchTerm ? 'block' : 'none';
    renderProducts(currentCat);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    productsSearchTerm = '';
    clearBtn.style.display = 'none';
    searchInput.focus();
    renderProducts(currentCat);
  });
}

// ══════════════════════════════════════════════════════
// Category Tabs
// ══════════════════════════════════════════════════════
function renderCatTabs() {
  const tabs = $('catTabs');
  tabs.innerHTML = `<button class="cat-tab active" data-cat="all"><span class="tab-icon">☕</span> الكل</button>
  <button class="cat-tab" data-cat="discounts"><span class="tab-icon">🏷️</span> الخصومات</button>
  <button class="cat-tab fav-tab" data-cat="favorites"><span class="tab-icon">❤️</span> المفضلة</button>`;
  categories.forEach(c => {
    const b = document.createElement('button');
    b.className   = 'cat-tab';
    b.dataset.cat = c._id;
    b.innerHTML   = `<span class="tab-icon">${c.icon||'☕'}</span> ${c.nameAr||c.name}`;
    tabs.appendChild(b);
  });
  // Add agency tabs if agencies exist
  if (allAgencies && allAgencies.length > 0) {
    const sep = document.createElement('span');
    sep.style.cssText = 'width:1px;background:var(--g100);margin:0 4px;flex-shrink:0;align-self:stretch;display:inline-block';
    tabs.appendChild(sep);
    allAgencies.forEach(a => {
      const b = document.createElement('button');
      b.className        = 'cat-tab';
      b.dataset.cat      = 'agency:' + a._id;
      b.dataset.agencyId = a._id;
      b.innerHTML        = `<span class="tab-icon">🏢</span> ${a.nameAr}`;
      tabs.appendChild(b);
    });
  }
  tabs.querySelectorAll('.cat-tab').forEach(b => {
    b.addEventListener('click', function () {
      tabs.querySelectorAll('.cat-tab').forEach(x => x.classList.remove('active'));
      this.classList.add('active');
      currentCat = this.dataset.cat;
      let name = 'جميع المنتجات';
      if      (currentCat === 'discounts')          name = 'الخصومات';
      else if (currentCat === 'favorites')          name = 'المفضلة ❤️';
      else if (currentCat.startsWith('agency:')) {
        const ag = allAgencies.find(a => 'agency:'+a._id === currentCat);
        name = ag?.nameAr || 'وكالة';
      } else if (currentCat !== 'all') {
        name = categories.find(c => c._id === currentCat)?.nameAr || '';
      }
      $('breadcrumbCurrent').textContent = name;
      renderProducts(currentCat);
    });
  });
}

// ══════════════════════════════════════════════════════
// Products Grid
// ══════════════════════════════════════════════════════
function renderProducts(catId) {
  const grid = $('productsGrid');
  let filtered;
  if (catId === 'all') {
    filtered = [...allItems, ...allAgencyItems];
  } else if (catId === 'discounts') {
    filtered = [...allItems, ...allAgencyItems].filter(i => i.oldPrice && i.oldPrice > i.price);
  } else if (catId === 'favorites') {
    const pool = [...allItems, ...allAgencyItems];
    filtered = favorites.map(id => pool.find(i => i._id === id)).filter(Boolean);
  } else if (catId.startsWith('agency:')) {
    const agId = catId.replace('agency:','');
    filtered = allAgencyItems.filter(i => {
      const aid = i.agency?._id || i.agency;
      return aid && aid.toString() === agId;
    });
  } else {
    filtered = allItems.filter(i => i.category?._id === catId || i.category === catId);
  }

  // Apply search filter
  if (productsSearchTerm) {
    filtered = filtered.filter(i =>
      (i.nameAr||'').toLowerCase().includes(productsSearchTerm) ||
      (i.name||'').toLowerCase().includes(productsSearchTerm) ||
      (i.descriptionAr||'').toLowerCase().includes(productsSearchTerm) ||
      (i.description||'').toLowerCase().includes(productsSearchTerm)
    );
  }

  if (!filtered.length) {
    const icon = productsSearchTerm ? '🔍' : catId==='discounts'?'🏷️':catId==='favorites'?'❤️':'☕';
    const msg  = productsSearchTerm ? 'لا توجد نتائج' : catId==='discounts'?'لا توجد عروض حالياً':catId==='favorites'?'لا توجد منتجات في المفضلة':'لا توجد منتجات';
    const sub  = productsSearchTerm ? `لم نجد منتجاً يطابق "${productsSearchTerm}"` : catId==='discounts'?'لا توجد منتجات مخفضة في الوقت الحالي':catId==='favorites'?'اضغط على ❤️ في أي منتج لإضافته هنا':'لا يوجد منتجات في هذا القسم حالياً';
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">${icon}</div><h3>${msg}</h3><p>${sub}</p></div>`;
    return;
  }

  grid.innerHTML = filtered.map((item, i) => {
    const disc    = item.oldPrice ? Math.round((1 - item.price / item.oldPrice) * 100) : 0;
    const catName = item.category?.nameAr || item.category?.name || '';
    const agName  = item.agency?.nameAr || '';
    const isAgency = !!item.agency;
    const fav = isFav(item._id);
    return `
    <div class="product-card fade-in-up" style="animation-delay:${Math.min(i,8)*0.05}s"
         onclick="openProductModal('${item._id}','${isAgency?'agency':'regular'}')" data-id="${item._id}">
      <div class="product-card-img">
        <img src="${item.image || './def_image.webp'}" alt="${item.nameAr||item.name}" loading="lazy"
             onerror="this.src='./def_image.webp'">
        ${disc > 0 ? `<span class="sale-badge">خصم ${disc}%</span>` : ''}
        ${!item.inStock ? `<span class="sale-badge" style="background:#e74c3c">نفذ</span>` : ''}
        <button class="fav-btn ${fav?'active':''}" data-id="${item._id}"
          onclick="toggleFav('${item._id}',event)"
          title="${fav?'إزالة من المفضلة':'إضافة للمفضلة'}">${favSVG(fav)}</button>
      </div>
      <div class="product-card-body">
        <div class="product-card-category">${isAgency ? agName : catName}</div>
        <div class="product-card-name">${item.nameAr||item.name}</div>
        ${item.descriptionAr||item.description
          ? `<div class="product-card-desc">${item.descriptionAr||item.description}</div>` : ''}
        <div class="product-card-footer">
          <div class="product-price">
            <span class="current">${formatPrice(item.price)}</span>
            ${(item.oldPrice && item.oldPrice > item.price) ? `<span class="old">${formatPrice(item.oldPrice)}</span>` : ''}
          </div>
          <button class="add-to-cart" title="أضف للسلة"
            onclick="event.stopPropagation();addToCart('${item._id}',1,'${isAgency?'agency':'regular'}')"
            ${!item.inStock ? 'disabled style="opacity:.4;cursor:not-allowed"' : ''}>+</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
// Product Detail Modal
// ✅ FIX 2: إضافة itemType parameter والبحث في المصفوفة الصح
// ══════════════════════════════════════════════════════
function openProductModal(itemId, itemType = 'regular') {
  // البحث في المصفوفة المناسبة أولاً، ثم الأخرى كـ fallback
  const pool = itemType === 'agency' ? allAgencyItems : allItems;
  const item = pool.find(i => i._id === itemId)
            || allItems.find(i => i._id === itemId)
            || allAgencyItems.find(i => i._id === itemId);
  if (!item) return;

  pmCurrentItemId   = itemId;
  pmCurrentItemType = itemType;
  pmQtyVal = 1;

  $('pmImg').src     = item.image || './def_image.webp';
  $('pmImg').onerror = () => { $('pmImg').src = './def_image.webp'; };
  $('pmImg').alt     = item.nameAr || item.name;

  // الفئة: اعرض اسم الوكالة إذا كان agency item
  const catLabel = itemType === 'agency'
    ? (item.agency?.nameAr || item.agency?.name || '')
    : (item.category?.nameAr || item.category?.name || '');
  $('pmCat').textContent  = catLabel;
  $('pmName').textContent = item.nameAr || item.name;
  $('pmDesc').textContent = item.descriptionAr || item.description || '';
  $('pmPrice').textContent = formatPrice(item.price);

  if (item.oldPrice && item.oldPrice > item.price) {
    $('pmOld').textContent    = formatPrice(item.oldPrice);
    $('pmOld').style.display  = '';
    const disc = Math.round((1 - item.price / item.oldPrice) * 100);
    $('pmDisc').textContent   = `خصم ${disc}%`;
    $('pmDisc').style.display = '';
  } else {
    $('pmOld').style.display  = 'none';
    $('pmDisc').style.display = 'none';
  }

  if (!item.inStock) {
    $('pmActions').innerHTML = `<div class="out-of-stock-badge">✕ المنتج غير متوفر حالياً</div>`;
  } else {
    const pmFav = isFav(itemId);
    $('pmActions').innerHTML = `
      <div class="qty-control">
        <button onclick="pmQtyChange(-1)">−</button>
        <div class="qty-val" id="pmQty">1</div>
        <button onclick="pmQtyChange(1)">+</button>
      </div>
      <button class="btn btn-primary" style="flex:1;justify-content:center"
        onclick="addToCart('${itemId}', parseInt(document.getElementById('pmQty').textContent), '${itemType}');closeProductModal()">
        + أضف للسلة
      </button>
      <button class="modal-fav-btn ${pmFav?'active':''}" id="pmFavBtn" data-id="${itemId}"
        onclick="toggleFav('${itemId}')">
        ${favSVG(pmFav)} <span>${pmFav?'في المفضلة':'أضف للمفضلة'}</span>
      </button>`;
  }

  $('productModalOverlay').classList.add('open');
}

function closeProductModal() {
  $('productModalOverlay').classList.remove('open');
}

function pmQtyChange(delta) {
  const el = document.getElementById('pmQty');
  if (!el) return;
  let v = parseInt(el.textContent) + delta;
  if (v < 1) v = 1;
  if (v > 99) v = 99;
  el.textContent = v;
}

$('pmClose').addEventListener('click', closeProductModal);
$('productModalOverlay').addEventListener('click', e => {
  if (e.target === $('productModalOverlay')) closeProductModal();
});

// ══════════════════════════════════════════════════════
// Cart
// ══════════════════════════════════════════════════════
function addToCart(itemId, qty = 1, itemType = 'regular') {
  const pool = itemType === 'agency' ? allAgencyItems : allItems;
  const item = pool.find(i => i._id === itemId)
            || allItems.find(i => i._id === itemId)
            || allAgencyItems.find(i => i._id === itemId);
  if (!item || !item.inStock) return;
  const existing = cart.find(c => c.id === itemId);
  if (existing) existing.qty += qty;
  else cart.push({ id: itemId, name: item.nameAr||item.name, price: item.price, image: item.image, qty, itemType });
  saveCart();
  updateCartUI();
  if (appliedPromo) { appliedPromo = null; updatePromoDisplay(); }
  showToast(`أُضيف "${item.nameAr||item.name}" إلى السلة`, 'success');
}

function removeFromCart(id) {
  cart = cart.filter(c => c.id !== id);
  if (appliedPromo) { appliedPromo = null; }
  saveCart(); updateCartUI();
}

function changeQty(id, delta) {
  const c = cart.find(c => c.id === id);
  if (!c) return;
  c.qty += delta;
  if (c.qty <= 0) return removeFromCart(id);
  if (appliedPromo) { appliedPromo = null; }
  saveCart(); updateCartUI();
}

function updateCartUI() {
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const count = cart.reduce((s, c) => s + c.qty, 0);

  const cEl = $('cartCount');
  cEl.textContent = count;
  cEl.classList.toggle('visible', count > 0);

  const footerEl = $('cartFooter');
  const itemsEl  = $('cartItems');

  if (!cart.length) {
    itemsEl.innerHTML = `
      <div class="cart-empty" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;color:var(--g300)">
        <div class="cart-empty-icon">🛒</div>
        <p>السلة فارغة</p>
        <small>أضف منتجات لتبدأ التسوق</small>
      </div>`;
    footerEl.style.display = 'none';
    return;
  }

  footerEl.style.display = 'block';
  $('cartTotal').textContent = formatPrice(total);

  itemsEl.innerHTML = cart.map(c => `
    <div class="cart-item">
      <img class="cart-item-img" src="${c.image}" alt="${c.name}" onerror="this.style.opacity='.3'">
      <div class="cart-item-info">
        <div class="cart-item-name">${c.name}</div>
        <div class="cart-item-price">${formatPrice(c.price)}</div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="changeQty('${c.id}',-1)">−</button>
          <span class="qty-display">${c.qty}</span>
          <button class="qty-btn" onclick="changeQty('${c.id}',1)">+</button>
        </div>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart('${c.id}')" title="حذف">🗑</button>
    </div>`).join('');
}

$('cartToggle').addEventListener('click', () => {
  $('cartSidebar').classList.add('open');
  $('cartOverlay').classList.add('open');
});
function closeCart() {
  $('cartSidebar').classList.remove('open');
  $('cartOverlay').classList.remove('open');
}
$('cartClose').addEventListener('click', closeCart);
$('cartOverlay').addEventListener('click', closeCart);

// ══════════════════════════════════════════════════════
// Checkout
// ══════════════════════════════════════════════════════
$('checkoutBtn').addEventListener('click', () => {
  if (!cart.length) return;
  closeCart();
  appliedPromo = null;
  updateOrderSummary();
  $('promoCodeInput').value = '';
  $('promoResult').innerHTML = '';
  $('orderModalOverlay').classList.add('open');
});

function updateOrderSummary() {
  const originalTotal = cart.reduce((s,c) => s + c.price * c.qty, 0);
  let discountAmt = 0;
  let itemsHtml = '';
  if (appliedPromo) {
    cart.forEach(c => {
      const applicable = appliedPromo.applicableItemIds.includes(c.id);
      let linePrice = c.price * c.qty;
      let discountedPrice = linePrice;
      if (applicable) {
        if (appliedPromo.discountType === 'percent') discountedPrice = linePrice * (1 - appliedPromo.discountValue / 100);
        else discountedPrice = Math.max(0, linePrice - appliedPromo.discountValue);
        discountAmt += linePrice - discountedPrice;
      }
      const showDiscount = applicable && discountAmt > 0;
      itemsHtml += `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px;color:var(--g500)">
        <span>${c.name} <span style="opacity:.6">×${c.qty}</span>${showDiscount?'<span style="color:#16A34A;font-size:11px;margin-right:4px">✓ خصم</span>':''}</span>
        <span>${showDiscount?`<span style="text-decoration:line-through;color:var(--g300);font-size:11px">${formatPrice(linePrice)}</span> <span style="color:#16A34A;font-weight:600">${formatPrice(discountedPrice)}</span>`:`<span style="color:var(--blue)">${formatPrice(linePrice)}</span>`}</span>
      </div>`;
    });
  } else {
    itemsHtml = cart.map(c => `
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px;color:var(--g500)">
        <span>${c.name} <span style="opacity:.6">×${c.qty}</span></span>
        <span style="color:var(--blue)">${formatPrice(c.price * c.qty)}</span>
      </div>`).join('');
  }
  $('orderSummaryItems').innerHTML = itemsHtml;
  const finalTotal = originalTotal - discountAmt;
  if (appliedPromo && discountAmt > 0) {
    $('orderSummaryTotal').innerHTML = `
      <div style="text-align:left">
        <div style="font-size:12px;color:var(--g300);text-decoration:line-through">${formatPrice(originalTotal)}</div>
        <div style="font-size:22px;font-weight:700;color:#16A34A">${formatPrice(finalTotal)}</div>
        <div style="font-size:11px;color:#16A34A;margin-top:2px">وفرت ${formatPrice(discountAmt)} 🎉</div>
      </div>`;
  } else {
    $('orderSummaryTotal').textContent = formatPrice(finalTotal);
  }
}

function updatePromoDisplay() {
  updateOrderSummary();
}

function removePromo() {
  appliedPromo = null;
  $('promoCodeInput').value = '';
  $('promoResult').innerHTML = '';
  updateOrderSummary();
}

$('cancelOrderBtn').addEventListener('click', () => $('orderModalOverlay').classList.remove('open'));
$('orderModalOverlay').addEventListener('click', e => {
  if (e.target === $('orderModalOverlay')) $('orderModalOverlay').classList.remove('open');
});

$('applyPromoBtn').addEventListener('click', async () => {
  const code = $('promoCodeInput').value.trim();
  if (!code) { $('promoResult').innerHTML = '<span style="color:#e74c3c">يرجى إدخال الكود</span>'; return; }
  const btn = $('applyPromoBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spin">◌</span>';
  try {
    const cartItemsPayload = cart.map(c => ({ itemId: c.id }));
    const res = await fetch('/api/validate-promo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, cartItems: cartItemsPayload })
    });
    const data = await res.json();
    if (!res.ok) {
      $('promoResult').innerHTML = `<div style="margin-top:6px;padding:10px 14px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px"><span style="color:#dc2626;font-size:13px">✕ ${data.error}</span></div>`;
      appliedPromo=null; updatePromoDisplay(); return;
    }
    appliedPromo = data;
    const discLabel = data.discountType==='percent' ? `${data.discountValue}%` : formatPrice(data.discountValue);
    const hasApplicable = data.applicableItemIds.length > 0;
    const scopeText = data.scope === 'all' ? 'جميع المنتجات' :
      data.scope === 'category' ? 'قسم محدد' :
      data.scope === 'agency'   ? 'وكالة محددة' : 'منتجات محددة';
    if (hasApplicable) {
      $('promoResult').innerHTML = `
        <div style="margin-top:6px;padding:12px 14px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #86efac;border-radius:10px;animation:promoFadeIn .3s ease">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:18px">🎉</span>
            <span style="font-weight:700;color:#15803d;font-size:14px">تم تطبيق البروموكود!</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div>
              <span style="font-family:monospace;font-size:15px;font-weight:700;color:#166534;letter-spacing:1px;background:#bbf7d0;padding:2px 8px;border-radius:5px">${data.code}</span>
              <span style="font-size:12px;color:#15803d;margin-right:8px">${scopeText}</span>
            </div>
            <div style="font-size:16px;font-weight:700;color:#15803d">−${discLabel}</div>
          </div>
          <button onclick="removePromo()" style="margin-top:8px;font-size:11px;color:#dc2626;background:none;border:none;cursor:pointer;padding:0;font-family:inherit">✕ إزالة الكود</button>
        </div>`;
    } else {
      $('promoResult').innerHTML = `
        <div style="margin-top:6px;padding:10px 14px;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px">
          <span style="color:#92400e;font-size:13px">⚠️ الكود صحيح لكن لا توجد منتجات مشمولة في سلتك</span>
        </div>`;
    }
    updatePromoDisplay();
  } catch { $('promoResult').innerHTML = '<div style="margin-top:6px;padding:10px 14px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px"><span style="color:#dc2626;font-size:13px">✕ خطأ في التحقق من الكود</span></div>'; }
  finally { btn.disabled = false; btn.innerHTML = 'تطبيق'; }
});

$('confirmOrderBtn').addEventListener('click', async () => {
  const name     = $('orderName').value.trim();
  const phone    = $('orderPhone').value.trim();
  const province  = $('orderProvince')?.value?.trim() || '';
  const address   = $('orderAddress')?.value?.trim()   || '';
  const location  = province && address ? province + ' - ' + address : province || address || $('orderLocation')?.value?.trim() || '';
  const notes    = $('orderNotes').value.trim();

  if (!name || !cleanPhone || !location) {
    showToast('يرجى إدخال الاسم والهاتف والمحافظة والعنوان', 'error');
    return;
  }
  if (!province) { showToast('يرجى اختيار المحافظة', 'error'); return; }
  if (!address)  { showToast('يرجى إدخال العنوان التفصيلي', 'error'); return; }
  // Accept: 07xxxxxxxxx (11 digits) OR +9647xxxxxxxxx OR 009647xxxxxxxxx
  const cleanPhone = phone.replace(/\s+/g, '');
  const iraqLocal    = /^07[3-9]\d{8}$/.test(cleanPhone);
  const iraqIntlPlus = /^\+9647[3-9]\d{8}$/.test(cleanPhone);
  const iraqIntl00   = /^009647[3-9]\d{8}$/.test(cleanPhone);
  if (!iraqLocal && !iraqIntlPlus && !iraqIntl00) {
    showToast('رقم الهاتف غير صحيح. أمثلة: 07730949424 أو +9647730949424', 'error');
    return;
  }

  const btn = $('confirmOrderBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin">◌</span> جاري الإرسال...';

  try {
    const originalTotal = cart.reduce((s,c) => s + c.price * c.qty, 0);
    let finalTotal  = originalTotal;
    let promoDiscount = 0;
    let orderItems = cart.map(c => ({
      itemId: c.id, name: c.name, price: c.price,
      quantity: c.qty, image: c.image,
      originalPrice: c.price, discounted: false
    }));

    if (appliedPromo && appliedPromo.applicableItemIds.length > 0) {
      orderItems = cart.map(c => {
        const applicable = appliedPromo.applicableItemIds.includes(c.id);
        let unitPrice = c.price;
        let discounted = false;
        if (applicable) {
          discounted = true;
          if (appliedPromo.discountType === 'percent') unitPrice = c.price * (1 - appliedPromo.discountValue / 100);
          else unitPrice = Math.max(0, c.price - appliedPromo.discountValue / c.qty);
        }
        return { itemId: c.id, name: c.name, price: unitPrice, originalPrice: c.price, discounted, quantity: c.qty, image: c.image };
      });
      finalTotal    = orderItems.reduce((s,i) => s + i.price * i.quantity, 0);
      promoDiscount = originalTotal - finalTotal;
    }

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: name, customerPhone: phone,
        customerLocation: location, notes, totalAmount: finalTotal,
        originalTotal: appliedPromo ? originalTotal : null,
        promoCode: appliedPromo?.code || '',
        promoDiscount,
        promoAdvertiser: appliedPromo?.advertiserName || '',
        items: orderItems
      })
    });
    let resData = {};
    try { resData = await res.json(); } catch {}
    if (!res.ok) throw new Error(resData.error || `خطأ في الخادم (${res.status})`);

    $('orderModalOverlay').classList.remove('open');
    cart = []; appliedPromo = null; saveCart(); updateCartUI();
    ['orderName','orderPhone','orderAddress','orderNotes','promoCodeInput'].forEach(id => { if($(id)) $(id).value = ''; });
    if($('orderProvince')) $('orderProvince').value = '';
    $('promoResult').innerHTML = '';
    showSuccessScreen();
  } catch (err) {
    showToast(err.message || 'حدث خطأ، يرجى المحاولة مرة أخرى', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✓ تأكيد الطلب';
  }
});

// ══════════════════════════════════════════════════════
// Success Screen
// ══════════════════════════════════════════════════════
function showSuccessScreen() {
  $('successScreen').classList.add('show');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function closeSuccess() {
  $('successScreen').classList.remove('show');
}

// ══════════════════════════════════════════════════════
// Init
// ══════════════════════════════════════════════════════
updateCartUI();
loadData();

const fadeEls = document.querySelectorAll('.fade-in');
if(fadeEls.length){
  const obs = new IntersectionObserver(entries=>{
    entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('show'); obs.unobserve(e.target); } });
  }, { threshold:0.3 });
  fadeEls.forEach(el=>obs.observe(el));
}