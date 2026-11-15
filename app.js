"use strict";
/* ================= Data ================= */
const DB = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};
const S = {
  products: DB.get("products", []).map((p) => ({ cost: 0, category: "", minStock: 0, wholesale: 0, minWs: 0, ...p })),
  sales: DB.get("sales", []),
  stockLog: DB.get("stockLog", []),
  expenses: DB.get("expenses", []),
  customers: DB.get("customers", []),
  categories: DB.get("categories", []),
  methods: DB.get("methods", ["Tunai", "QRIS", "Transfer"]),
  settings: { shop: "Toko Grosir & Eceran", addr: "", footer: "Terima kasih", paper: "58", pin: "", ...DB.get("settings", {}) }
};
const save = () => Object.keys(S).forEach((k) => DB.set(k, S[k]));
let cart = []; // {id, qty, disc}
let unlocked = false;

/* ================= Util ================= */
const $ = (s) => document.querySelector(s);
const rp = (n) => (n < 0 ? "-" : "") + "Rp " + Math.round(Math.abs(n)).toLocaleString("id-ID");
const num = (v) => parseFloat(v) || 0;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtDT = (t) => new Date(t).toLocaleString("id-ID");
const fmtD = (t) => new Date(t).toLocaleDateString("id-ID");
const dayStr = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const startOf = (s) => new Date(s + "T00:00:00").getTime();
const endOf = (s) => new Date(s + "T23:59:59.999").getTime();
const prod = (id) => S.products.find((p) => p.id === id);
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
}
function fillSelect(sel, items, first) {
  const cur = sel.value;
  sel.innerHTML = (first !== undefined ? `<option value="">${esc(first)}</option>` : "") +
    items.map((o) => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join("");
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvOf = (head, rows) => [head, ...rows].map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
function logStock(p, delta, reason) {
  S.stockLog.unshift({ id: uid(), time: Date.now(), pid: p.id, name: p.name, delta, after: p.stock, reason });
  if (S.stockLog.length > 2000) S.stockLog.length = 2000;
}
const saleStatus = (s) => (s.void ? "batal" : s.paid >= s.total ? "lunas" : "utang");
const saleDebt = (s) => (s.void ? 0 : Math.max(0, s.total - s.paid));
const saleCost = (s) => s.items.reduce((a, i) => a + (i.cost || 0) * i.qty, 0);

/* ================= Tab ================= */
const tabRender = { beranda: renderDash, produk: renderProducts, stok: renderStok, pelanggan: renderCustomers, pengeluaran: renderExpenses, laporan: renderReport, setelan: renderSettings };
function goTab(tab) {
  if (tab === "laporan" && S.settings.pin && !unlocked) {
    if (prompt("Masukkan PIN laporan") !== S.settings.pin) return toast("PIN salah");
    unlocked = true;
  }
  showTab(tab);
}
document.querySelectorAll("#nav button").forEach((b) => b.onclick = () => goTab(b.dataset.tab));
document.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) goTab(g.dataset.go); });
function showTab(tab) {
  document.querySelectorAll("#nav button").forEach((x) => x.classList.toggle("active", x.dataset.tab === tab));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + tab));
  refreshLookups();
  if (tabRender[tab]) tabRender[tab]();
  window.scrollTo({ top: 0 });
  if (tab === "kasir" && matchMedia("(pointer:fine)").matches) $("#scanInput").focus();
}

/* ================= Beranda (dashboard) ================= */
function renderDash() {
  const today = dayStr(), from = startOf(today), to = endOf(today);
  const ok = S.sales.filter((s) => !s.void && s.time >= from && s.time <= to);
  const rev = ok.reduce((a, s) => a + s.total, 0), cost = ok.reduce((a, s) => a + saleCost(s), 0);
  const debtAll = S.sales.reduce((a, s) => a + saleDebt(s), 0);
  $("#dDate").textContent = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("#dShop").textContent = S.settings.shop;
  $("#dSales").textContent = rp(rev); $("#dTrx").textContent = ok.length; $("#dProfit").textContent = rp(rev - cost); $("#dDebt").textContent = rp(debtAll);

  const empty = S.products.filter((p) => p.stock <= 0), low = S.products.filter((p) => p.stock > 0 && p.minStock && p.stock <= p.minStock);
  const debtors = S.customers.filter((c) => custDebt(c.id) > 0);
  const expToday = S.expenses.filter((x) => x.time >= from && x.time <= to).reduce((a, x) => a + x.amount, 0);
  const menu = [
    { tab: "kasir", icon: "🛒", t: "Kasir", sub: "Transaksi baru", c: "#16a34a" },
    { tab: "produk", icon: "📦", t: "Produk", sub: S.products.length + " produk", c: "#2563eb" },
    { tab: "stok", icon: "🏷️", t: "Stok", sub: empty.length + low.length ? (empty.length + low.length) + " perlu perhatian" : "Aman", c: "#f59e0b", alert: empty.length + low.length },
    { tab: "pelanggan", icon: "👥", t: "Pelanggan", sub: debtors.length ? debtors.length + " punya utang" : S.customers.length + " pelanggan", c: "#8b5cf6", alert: debtors.length },
    { tab: "pengeluaran", icon: "💸", t: "Pengeluaran", sub: "Hari ini " + rp(expToday), c: "#ef4444" },
    { tab: "laporan", icon: "📊", t: "Laporan", sub: "Penjualan & laba", c: "#0891b2" },
    { tab: "setelan", icon: "⚙️", t: "Pengaturan", sub: "Toko, struk, backup", c: "#64748b" }
  ];
  $("#dMenu").innerHTML = menu.map((m) => `<button class="mcard" data-go="${m.tab}" style="--c:${m.c}">
    <span class="ico">${m.icon}</span><b>${m.t}</b><small>${esc(m.sub)}</small>${m.alert ? `<i class="dot">${m.alert}</i>` : ""}</button>`).join("");

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = dayStr(d.getTime());
    const v = S.sales.filter((s) => !s.void && s.time >= startOf(ds) && s.time <= endOf(ds)).reduce((a, s) => a + s.total, 0);
    days.push({ l: d.toLocaleDateString("id-ID", { weekday: "short" }), v });
  }
  const max = Math.max(...days.map((d) => d.v), 1);
  $("#dChart").innerHTML = `<div class="bars">${days.map((d, i) => `<div class="bar${i === 6 ? " now" : ""}"><small>${d.v ? (d.v >= 1e6 ? (d.v / 1e6).toFixed(1) + "jt" : Math.round(d.v / 1e3) + "rb") : ""}</small><div style="height:${Math.max(3, d.v / max * 100)}px"></div><span>${d.l}</span></div>`).join("")}</div>`;

  const al = [];
  empty.slice(0, 5).forEach((p) => al.push(`<div class="alert" data-go="stok"><span class="badge red">Kosong</span> ${esc(p.name)}</div>`));
  low.slice(0, 5).forEach((p) => al.push(`<div class="alert" data-go="stok"><span class="badge">Menipis</span> ${esc(p.name)} — sisa ${p.stock}</div>`));
  debtors.slice(0, 5).forEach((c) => al.push(`<div class="alert" data-go="pelanggan"><span class="badge red">Utang</span> ${esc(c.name)} — ${rp(custDebt(c.id))}</div>`));
  $("#dAlerts").innerHTML = al.length ? al.join("") : '<span class="muted">✅ Semua aman. Tidak ada stok kosong atau utang.</span>';
}
function refreshLookups() {
  fillSelect($("#pCat"), S.categories.map((c) => ({ v: c, t: c })), "(tanpa kategori)");
  fillSelect($("#prodCatFilter"), S.categories.map((c) => ({ v: c, t: c })), "Semua kategori");
  fillSelect($("#custSel"), S.customers.map((c) => ({ v: c.id, t: c.name })), "Umum (tanpa nama)");
  fillSelect($("#methodSel"), S.methods.map((m) => ({ v: m, t: m })));
  $("#shopTitle").textContent = "🛒 " + S.settings.shop;
}

/* ================= Harga ================= */
function unitPrice(p, qty) { return p.wholesale && p.minWs && qty >= p.minWs ? p.wholesale : p.retail; }
const lineSub = (c, p) => Math.max(0, unitPrice(p, c.qty) * c.qty - (c.disc || 0));
const cartSub = () => cart.reduce((s, c) => { const p = prod(c.id); return s + (p ? lineSub(c, p) : 0); }, 0);
const cartTotal = () => Math.max(0, cartSub() - num($("#discNota").value));

/* ================= Kasir ================= */
function addToCart(p) {
  const line = cart.find((c) => c.id === p.id);
  if ((line ? line.qty : 0) + 1 > p.stock) return toast("Stok tidak cukup: " + p.name);
  if (line) line.qty++; else cart.push({ id: p.id, qty: 1, disc: 0 });
  renderCart();
}
function renderCart() {
  const body = $("#cartBody"); body.innerHTML = "";
  cart.forEach((c, i) => {
    const p = prod(c.id); if (!p) return;
    const price = unitPrice(p, c.qty);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(p.name)} ${price !== p.retail ? '<span class="badge">grosir</span>' : ""}</td>
      <td><input type="number" min="1" max="${p.stock}" value="${c.qty}" data-q="${i}"></td>
      <td>${rp(price)}</td>
      <td><input type="number" min="0" value="${c.disc || 0}" data-d="${i}"></td>
      <td>${rp(lineSub(c, p))}</td>
      <td><button class="btn sm danger" data-x="${i}">✕</button></td>`;
    body.appendChild(tr);
  });
  $("#cartEmpty").hidden = cart.length > 0;
  body.querySelectorAll("[data-q]").forEach((inp) => inp.onchange = () => {
    const c = cart[inp.dataset.q], p = prod(c.id);
    let q = Math.max(1, parseInt(inp.value) || 1);
    if (q > p.stock) { q = p.stock; toast("Stok maksimal " + p.stock); }
    c.qty = q; renderCart();
  });
  body.querySelectorAll("[data-d]").forEach((inp) => inp.onchange = () => { cart[inp.dataset.d].disc = Math.max(0, num(inp.value)); renderCart(); });
  body.querySelectorAll("[data-x]").forEach((b) => b.onclick = () => { cart.splice(b.dataset.x, 1); renderCart(); });
  updateTotals();
}
function updateTotals() {
  const total = cartTotal(), paid = num($("#paid").value), debt = $("#chkDebt").checked;
  $("#total").textContent = rp(total);
  if (debt) { $("#changeLbl").textContent = "Sisa utang"; $("#change").textContent = rp(Math.max(0, total - paid)); }
  else { $("#changeLbl").textContent = "Kembali"; $("#change").textContent = rp(Math.max(0, paid - total)); }
}
["#paid", "#discNota", "#chkDebt"].forEach((s) => $(s).addEventListener("input", updateTotals));
$("#chkDebt").addEventListener("change", updateTotals);

const searchProducts = (q) => { q = q.toLowerCase(); return S.products.filter((p) => p.name.toLowerCase().includes(q) || p.barcode.includes(q)); };
$("#scanInput").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const q = e.target.value.trim(); if (!q) return;
  const exact = S.products.find((p) => p.barcode === q);
  if (exact) addToCart(exact);
  else { const m = searchProducts(q); if (m.length === 1) addToCart(m[0]); else if (!m.length) toast("Produk tidak ditemukan: " + q); }
  e.target.value = ""; $("#suggest").innerHTML = "";
});
$("#scanInput").addEventListener("input", (e) => {
  const q = e.target.value.trim(), box = $("#suggest"); box.innerHTML = "";
  if (q.length < 2) return;
  searchProducts(q).slice(0, 6).forEach((p) => {
    const d = document.createElement("div");
    d.textContent = `${p.name} — ${rp(p.retail)} (stok ${p.stock})`;
    d.onclick = () => { addToCart(p); e.target.value = ""; box.innerHTML = ""; e.target.focus(); };
    box.appendChild(d);
  });
});
$("#btnNewCust").onclick = () => {
  const name = (prompt("Nama pelanggan baru") || "").trim(); if (!name) return;
  const c = { id: uid(), name, phone: (prompt("No. HP (boleh kosong)") || "").trim() };
  S.customers.push(c); save(); refreshLookups(); $("#custSel").value = c.id;
};
$("#btnClear").onclick = () => { cart = []; renderCart(); };

$("#btnPay").onclick = () => {
  if (!cart.length) return toast("Keranjang kosong");
  const total = cartTotal(), cash = num($("#paid").value), debt = $("#chkDebt").checked, cid = $("#custSel").value;
  if (!debt && cash < total) return toast("Uang diterima kurang");
  if (debt && !cid) return toast("Pilih atau buat pelanggan untuk transaksi belum bayar");
  const items = cart.map((c) => {
    const p = prod(c.id), price = unitPrice(p, c.qty);
    p.stock -= c.qty; logStock(p, -c.qty, "Penjualan");
    return { id: p.id, name: p.name, qty: c.qty, price, cost: p.cost || 0, disc: c.disc || 0, sub: lineSub(c, p) };
  });
  const cust = S.customers.find((c) => c.id === cid);
  const paid = Math.min(cash, total);
  const sale = {
    id: uid(), time: Date.now(), items, discNota: num($("#discNota").value), total, paid,
    cash, change: debt ? 0 : cash - total, method: $("#methodSel").value || "Tunai",
    custId: cid || "", custName: cust ? cust.name : "", note: $("#note").value.trim()
  };
  S.sales.unshift(sale); save();
  printReceipt(sale);
  cart = []; ["#paid", "#discNota", "#note"].forEach((s) => ($(s).value = "")); $("#chkDebt").checked = false;
  renderCart(); $("#scanInput").focus();
  toast(saleDebt(sale) ? "Tersimpan sebagai belum bayar: " + rp(saleDebt(sale)) : "Transaksi berhasil");
};

/* ================= Struk ================= */
function printReceipt(s) {
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return toast("Pop-up diblokir; izinkan untuk cetak struk");
  const width = S.settings.paper === "80" ? "72mm" : "48mm";
  const rows = s.items.map((i) => `<tr><td colspan="2">${esc(i.name)}</td></tr><tr><td>${i.qty} x ${rp(i.price)}</td><td class="r">${rp(i.price * i.qty)}</td></tr>` +
    (i.disc ? `<tr><td>Diskon</td><td class="r">-${rp(i.disc)}</td></tr>` : "")).join("");
  const sub = s.items.reduce((a, i) => a + i.sub, 0);
  w.document.write(`<html><head><title>Struk</title><style>body{font:12px monospace;width:${width};margin:6px auto}table{width:100%}.r{text-align:right}hr{border:0;border-top:1px dashed #000}</style></head><body>
    <h3 style="text-align:center;margin:0">${esc(S.settings.shop)}</h3>
    <p style="text-align:center;margin:2px 0">${esc(S.settings.addr)}</p>
    <p style="margin:2px 0">${fmtDT(s.time)}${s.custName ? "<br>Pelanggan: " + esc(s.custName) : ""}<br>Bayar: ${esc(s.method)}</p><hr>
    <table>${rows}</table><hr>
    <table>
    ${s.discNota ? `<tr><td>Subtotal</td><td class="r">${rp(sub)}</td></tr><tr><td>Diskon nota</td><td class="r">-${rp(s.discNota)}</td></tr>` : ""}
    <tr><td><b>Total</b></td><td class="r"><b>${rp(s.total)}</b></td></tr>
    <tr><td>Dibayar</td><td class="r">${rp(s.paid)}</td></tr>
    ${saleDebt(s) ? `<tr><td>Sisa utang</td><td class="r">${rp(saleDebt(s))}</td></tr>` : `<tr><td>Kembali</td><td class="r">${rp(s.change || 0)}</td></tr>`}
    </table>${s.note ? "<hr>Catatan: " + esc(s.note) : ""}<hr>
    <p style="text-align:center">${esc(S.settings.footer)}</p>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

/* ================= Scanner kamera ================= */
let scanner = null, scanCb = null;
function openScanner(cb) {
  if (typeof Html5Qrcode === "undefined") return toast("Library scanner gagal dimuat (perlu internet)");
  scanCb = cb; $("#scanModal").hidden = false;
  scanner = new Html5Qrcode("reader");
  scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 260, height: 160 } }, (text) => {
    const f = scanCb; closeScanner(); f(text);
  }).catch(() => { toast("Kamera tidak bisa dibuka. Izinkan akses kamera (perlu HTTPS)."); closeScanner(); });
}
function closeScanner() {
  $("#scanModal").hidden = true;
  if (scanner) { const sc = scanner; scanner = null; sc.stop().catch(() => {}).finally(() => { try { sc.clear(); } catch {} }); }
}
$("#btnCloseScan").onclick = closeScanner;
$("#btnCamKasir").onclick = () => openScanner((code) => {
  const p = S.products.find((x) => x.barcode === code);
  if (p) { addToCart(p); toast("Ditambahkan: " + p.name); } else toast("Barcode tidak terdaftar: " + code);
});
$("#btnCamProd").onclick = () => openScanner((code) => { $("#pBarcode").value = code; });

/* ================= Barcode CODE 128 ================= */
const C128 = "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112".split(" ");
function code128svg(text, h = 44) {
  const codes = [104];
  for (const ch of text) { const v = ch.charCodeAt(0) - 32; codes.push(v >= 0 && v < 95 ? v : 0); }
  let sum = 104; for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103, 106);
  let x = 10, bars = "";
  codes.forEach((c) => {
    [...C128[c]].forEach((w, i) => { const wd = +w; if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${wd}" height="${h}"/>`; x += wd; });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 10} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px">${bars}</svg>`;
}
function printLabels(list) {
  if (!list.length) return toast("Pilih produk dulu (centang di daftar produk)");
  const w = window.open("", "_blank", "width=700,height=700");
  if (!w) return toast("Pop-up diblokir; izinkan untuk cetak");
  const cells = list.map((p) => `<div class="l"><b>${esc(p.name)}</b>${code128svg(p.barcode)}<div>${esc(p.barcode)}</div><div>${rp(p.retail)}</div></div>`).join("");
  w.document.write(`<html><head><title>Label barcode</title><style>body{font:11px Arial;margin:6px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.l{border:1px dashed #999;padding:5px;text-align:center;break-inside:avoid}</style></head><body><div class="g">${cells}</div><script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

/* ================= Produk ================= */
const pForm = $("#prodForm");
function resetProdForm() { pForm.reset(); $("#pId").value = ""; $("#prodFormTitle").textContent = "Tambah produk"; }
$("#btnResetForm").onclick = resetProdForm;
$("#btnGenBarcode").onclick = () => {
  let code; do { code = "99" + String(Date.now()).slice(-8) + String(Math.floor(Math.random() * 100)).padStart(2, "0"); } while (S.products.some((p) => p.barcode === code));
  $("#pBarcode").value = code;
};
pForm.onsubmit = (e) => {
  e.preventDefault();
  const barcode = $("#pBarcode").value.trim(), id = $("#pId").value;
  if (S.products.some((p) => p.barcode === barcode && p.id !== id)) return toast("Barcode ini sudah dipakai. Coba kode lain.");
  const old = id ? prod(id) : null;
  const d = {
    id: id || uid(), barcode, name: $("#pName").value.trim(), category: $("#pCat").value,
    cost: num($("#pCost").value), retail: num($("#pRetail").value), wholesale: num($("#pWholesale").value),
    minWs: parseInt($("#pMinWs").value) || 0, stock: parseInt($("#pStock").value) || 0, minStock: parseInt($("#pMinStock").value) || 0
  };
  if (d.wholesale && !d.minWs) return toast("Isi min. qty grosir");
  if (d.retail < d.cost && !confirm("Harga jual di bawah harga beli, kamu akan rugi. Tetap simpan?")) return;
  if (d.wholesale && d.wholesale < d.cost && !confirm("Harga grosir di bawah harga beli. Tetap simpan?")) return;
  if (old) { Object.assign(old, d); if (old.stock !== d.stock) { /* stok diubah lewat form */ } }
  else { S.products.push(d); if (d.stock) logStock(d, d.stock, "Stok awal"); }
  save(); resetProdForm(); renderProducts(); toast("Berhasil simpan produk");
};
$("#prodSearch").oninput = renderProducts;
$("#prodCatFilter").onchange = renderProducts;
const selected = new Set();
function renderProducts() {
  const q = $("#prodSearch").value.trim().toLowerCase(), cat = $("#prodCatFilter").value;
  const body = $("#prodBody"); body.innerHTML = "";
  S.products.filter((p) => (!q || p.name.toLowerCase().includes(q) || p.barcode.includes(q)) && (!cat || p.category === cat))
    .sort((a, b) => a.name.localeCompare(b.name)).forEach((p) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><input type="checkbox" data-s="${p.id}" ${selected.has(p.id) ? "checked" : ""}></td>
        <td>${esc(p.name)}<br><small class="muted">${esc(p.barcode)}${p.category ? " · " + esc(p.category) : ""}</small></td>
        <td>${rp(p.cost)}</td><td>${rp(p.retail)}</td>
        <td>${p.wholesale ? rp(p.wholesale) + `<br><small class="muted">min ${p.minWs}</small>` : "-"}</td>
        <td>${p.stock}</td>
        <td><button class="btn sm" data-e="${p.id}">Ubah</button></td>`;
      body.appendChild(tr);
    });
  body.querySelectorAll("[data-s]").forEach((c) => c.onchange = () => (c.checked ? selected.add(c.dataset.s) : selected.delete(c.dataset.s)));
  body.querySelectorAll("[data-e]").forEach((b) => b.onclick = () => {
    const p = prod(b.dataset.e);
    $("#pId").value = p.id; $("#pBarcode").value = p.barcode; $("#pName").value = p.name; $("#pCat").value = p.category;
    $("#pCost").value = p.cost; $("#pRetail").value = p.retail; $("#pWholesale").value = p.wholesale || "";
    $("#pMinWs").value = p.minWs || ""; $("#pStock").value = p.stock; $("#pMinStock").value = p.minStock || 0;
    $("#prodFormTitle").textContent = "Ubah produk"; window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
$("#btnSelAll").onclick = () => {
  const boxes = [...document.querySelectorAll("#prodBody [data-s]")], all = boxes.every((b) => b.checked);
  boxes.forEach((b) => { b.checked = !all; all ? selected.delete(b.dataset.s) : selected.add(b.dataset.s); });
};
$("#btnLabel").onclick = () => printLabels(S.products.filter((p) => selected.has(p.id)));
$("#btnDelSel").onclick = () => {
  if (!selected.size) return toast("Centang produk yang mau dihapus");
  if (!confirm(`Hapus ${selected.size} produk terpilih? Tidak bisa dibatalkan.`)) return;
  S.products = S.products.filter((p) => !selected.has(p.id)); selected.clear(); save(); renderProducts();
};

/* ================= Stok ================= */
$("#stokSearch").oninput = renderStok;
function renderStok() {
  let aC = 0, aS = 0, empty = 0, low = 0;
  S.products.forEach((p) => { aC += p.stock * p.cost; aS += p.stock * p.retail; if (p.stock <= 0) empty++; else if (p.minStock && p.stock <= p.minStock) low++; });
  $("#aCost").textContent = rp(aC); $("#aSell").textContent = rp(aS); $("#aEmpty").textContent = empty; $("#aLow").textContent = low;
  const q = $("#stokSearch").value.trim().toLowerCase(), body = $("#stokBody"); body.innerHTML = "";
  S.products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.barcode.includes(q)).sort((a, b) => a.stock - b.stock).forEach((p) => {
    const flag = p.stock <= 0 ? '<span class="badge red">Kosong</span>' : p.minStock && p.stock <= p.minStock ? '<span class="badge">Batas stok tercapai</span>' : "";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(p.name)} ${flag}</td><td>${p.stock}</td><td>${p.minStock || "-"}</td>
      <td><button class="btn sm primary" data-a="${p.id}" data-t="add">+ Tambah</button>
      <button class="btn sm warn" data-a="${p.id}" data-t="waste">Buang</button>
      <button class="btn sm" data-a="${p.id}" data-t="opname">Opname</button></td>`;
    body.appendChild(tr);
  });
  body.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => adjustStock(prod(b.dataset.a), b.dataset.t));
  const lb = $("#logBody"); lb.innerHTML = "";
  S.stockLog.slice(0, 150).forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${fmtDT(l.time)}</td><td>${esc(l.name)}</td><td>${l.delta > 0 ? "+" : ""}${l.delta}</td><td>${l.after}</td><td>${esc(l.reason)}</td>`;
    lb.appendChild(tr);
  });
}
function adjustStock(p, type) {
  if (type === "opname") {
    const v = prompt(`Stok fisik "${p.name}" (sistem: ${p.stock})`); if (v === null) return;
    const n = parseInt(v); if (isNaN(n) || n < 0) return toast("Angka tidak valid");
    const d = n - p.stock; p.stock = n; logStock(p, d, "Stok opname");
  } else {
    const v = prompt(type === "add" ? `Tambah stok "${p.name}" berapa?` : `Buang stok "${p.name}" berapa?`); if (v === null) return;
    const n = parseInt(v); if (isNaN(n) || n <= 0) return toast("Angka tidak valid");
    if (type === "waste" && n > p.stock) return toast("Melebihi stok");
    const reason = prompt("Alasan (opsional)", type === "add" ? "Stok masuk" : "Barang kadaluarsa / rusak") || (type === "add" ? "Stok masuk" : "Buang stok");
    p.stock += type === "add" ? n : -n; logStock(p, type === "add" ? n : -n, reason);
  }
  save(); renderStok();
}
$("#btnLogClear").onclick = () => { if (confirm("Hapus seluruh log stok?")) { S.stockLog = []; save(); renderStok(); } };
$("#btnLogCsv").onclick = () => download("log-stok.csv", csvOf(["Waktu", "Produk", "Ubah", "Stok akhir", "Alasan"], S.stockLog.map((l) => [fmtDT(l.time), l.name, l.delta, l.after, l.reason])), "text/csv");

/* ================= Pelanggan ================= */
const custDebt = (id) => S.sales.reduce((a, s) => a + (s.custId === id ? saleDebt(s) : 0), 0);
$("#custSearch").oninput = renderCustomers;
$("#btnCustReset").onclick = () => { $("#custForm").reset(); $("#cId").value = ""; };
$("#custForm").onsubmit = (e) => {
  e.preventDefault();
  const id = $("#cId").value, c = id ? S.customers.find((x) => x.id === id) : { id: uid() };
  c.name = $("#cName").value.trim(); c.phone = $("#cPhone").value.trim();
  if (!id) S.customers.push(c);
  save(); $("#custForm").reset(); $("#cId").value = ""; renderCustomers(); toast("Pelanggan disimpan");
};
function renderCustomers() {
  const q = $("#custSearch").value.trim().toLowerCase(), body = $("#custBody"); body.innerHTML = "";
  const list = S.customers.filter((c) => !q || c.name.toLowerCase().includes(q));
  if (!list.length) body.innerHTML = '<tr><td colspan="4" class="muted">Data pelanggan tidak ditemukan</td></tr>';
  list.forEach((c) => {
    const d = custDebt(c.id), tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${d ? '<span class="badge red">' + rp(d) + "</span>" : "-"}</td>
      <td><button class="btn sm" data-e="${c.id}">Ubah</button> <button class="btn sm danger" data-d="${c.id}">Hapus</button></td>`;
    body.appendChild(tr);
  });
  body.querySelectorAll("[data-e]").forEach((b) => b.onclick = () => {
    const c = S.customers.find((x) => x.id === b.dataset.e);
    $("#cId").value = c.id; $("#cName").value = c.name; $("#cPhone").value = c.phone || ""; window.scrollTo({ top: 0, behavior: "smooth" });
  });
  body.querySelectorAll("[data-d]").forEach((b) => b.onclick = () => {
    if (custDebt(b.dataset.d)) return toast("Pelanggan masih punya utang, lunasi dulu");
    if (confirm("Hapus pelanggan ini?")) { S.customers = S.customers.filter((x) => x.id !== b.dataset.d); save(); renderCustomers(); }
  });
}

/* ================= Pengeluaran ================= */
$("#eDate").value = dayStr();
$("#btnExpReset").onclick = () => { $("#expForm").reset(); $("#eId").value = ""; $("#eDate").value = dayStr(); };
$("#expForm").onsubmit = (e) => {
  e.preventDefault();
  const id = $("#eId").value, x = id ? S.expenses.find((v) => v.id === id) : { id: uid() };
  x.note = $("#eNote").value.trim(); x.amount = num($("#eAmount").value); x.time = startOf($("#eDate").value) + 12 * 3600e3;
  if (!id) S.expenses.push(x);
  save(); $("#btnExpReset").click(); renderExpenses(); toast("Pengeluaran disimpan");
};
function renderExpenses() {
  const body = $("#expBody"); body.innerHTML = "";
  S.expenses.sort((a, b) => b.time - a.time);
  $("#eTotal").textContent = rp(S.expenses.reduce((a, x) => a + x.amount, 0));
  S.expenses.forEach((x) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${fmtD(x.time)}</td><td>${esc(x.note)}</td><td>${rp(x.amount)}</td>
      <td><button class="btn sm" data-e="${x.id}">Ubah</button> <button class="btn sm danger" data-d="${x.id}">Hapus</button></td>`;
    body.appendChild(tr);
  });
  body.querySelectorAll("[data-e]").forEach((b) => b.onclick = () => {
    const x = S.expenses.find((v) => v.id === b.dataset.e);
    $("#eId").value = x.id; $("#eNote").value = x.note; $("#eAmount").value = x.amount; $("#eDate").value = dayStr(x.time);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  body.querySelectorAll("[data-d]").forEach((b) => b.onclick = () => {
    if (confirm("Hapus pengeluaran ini?")) { S.expenses = S.expenses.filter((v) => v.id !== b.dataset.d); save(); renderExpenses(); }
  });
}

/* ================= Laporan ================= */
$("#rFrom").value = $("#rTo").value = dayStr();
["#rFrom", "#rTo", "#rKind", "#rStatus"].forEach((s) => $(s).addEventListener("change", renderReport));
let lastReport = { head: [], rows: [] };
function buildReport() {
  const from = startOf($("#rFrom").value || dayStr()), to = endOf($("#rTo").value || dayStr()), kind = $("#rKind").value;
  const all = S.sales.filter((s) => s.time >= from && s.time <= to), ok = all.filter((s) => !s.void);
  const agg = (keyFn) => {
    const m = new Map();
    ok.forEach((s) => s.items.forEach((i) => {
      const k = keyFn(i), r = m.get(k) || { qty: 0, omzet: 0, modal: 0 };
      r.qty += i.qty; r.omzet += i.sub; r.modal += (i.cost || 0) * i.qty; m.set(k, r);
    }));
    return [...m.entries()].sort((a, b) => b[1].omzet - a[1].omzet).map(([k, r]) => [k, r.qty, rp(r.omzet), rp(r.modal), rp(r.omzet - r.modal)]);
  };
  if (kind === "ringkasan") {
    const rev = ok.reduce((a, s) => a + s.total, 0), cost = ok.reduce((a, s) => a + saleCost(s), 0);
    const disc = ok.reduce((a, s) => a + (s.discNota || 0) + s.items.reduce((x, i) => x + (i.disc || 0), 0), 0);
    const exp = S.expenses.filter((x) => x.time >= from && x.time <= to).reduce((a, x) => a + x.amount, 0);
    const debt = ok.reduce((a, s) => a + saleDebt(s), 0);
    return { head: ["Keterangan", "Nilai"], rows: [
      ["Jumlah transaksi", ok.length], ["Total penjualan", rp(rev)], ["Total diskon diberikan", rp(disc)], ["Total modal (harga beli)", rp(cost)],
      ["Laba kotor", rp(rev - cost)], ["Total pengeluaran", rp(exp)], ["Laba bersih", rp(rev - cost - exp)], ["Piutang (belum bayar)", rp(debt)]
    ] };
  }
  if (kind === "transaksi") {
    const st = $("#rStatus").value;
    const rows = all.filter((s) => !st || saleStatus(s) === st).map((s) => {
      const r = [fmtDT(s.time), s.items.map((i) => i.name + " x" + i.qty).join(", "), s.custName || "-", s.method || "-", rp(s.total), saleStatus(s)];
      r.id = s.id; return r;
    });
    return { head: ["Waktu", "Barang", "Pelanggan", "Metode", "Total", "Status"], rows, actions: true };
  }
  if (kind === "barang") return { head: ["Barang", "Terjual", "Omzet", "Modal", "Laba"], rows: agg((i) => i.name) };
  if (kind === "kategori") return { head: ["Kategori", "Terjual", "Omzet", "Modal", "Laba"], rows: agg((i) => (prod(i.id) && prod(i.id).category) || "(tanpa kategori)") };
  if (kind === "metode") {
    const m = new Map(); ok.forEach((s) => m.set(s.method || "-", (m.get(s.method || "-") || 0) + s.paid));
    return { head: ["Metode bayar", "Uang masuk"], rows: [...m.entries()].map(([k, v]) => [k, rp(v)]) };
  }
  return { head: ["Produk", "Kategori", "Stok", "Harga beli", "Nilai modal", "Nilai jual"], rows: S.products.map((p) => [p.name, p.category || "-", p.stock, rp(p.cost), rp(p.stock * p.cost), rp(p.stock * p.retail)]) };
}
function renderReport() {
  const r = lastReport = buildReport(), t = $("#rTable");
  const statusBadge = { lunas: "green", utang: "red", batal: "gray" };
  t.querySelector("thead").innerHTML = "<tr>" + r.head.map((h) => `<th>${esc(h)}</th>`).join("") + (r.actions ? "<th></th>" : "") + "</tr>";
  const tb = t.querySelector("tbody");
  tb.innerHTML = r.rows.length ? "" : `<tr><td colspan="${r.head.length + 1}" class="muted">Belum ada laporan pada periode ini</td></tr>`;
  r.rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = row.map((c, i) => `<td>${r.actions && i === 5 ? `<span class="badge ${statusBadge[c]}">${c}</span>` : esc(c)}</td>`).join("");
    if (r.actions) {
      const s = S.sales.find((x) => x.id === row.id), td = document.createElement("td");
      td.innerHTML = `<button class="btn sm" data-r="${s.id}">Struk</button>` + (s.void ? "" :
        ` <button class="btn sm" data-ed="${s.id}">Edit</button> <button class="btn sm warn" data-v="${s.id}">Batalkan</button>`) +
        (saleDebt(s) ? ` <button class="btn sm primary" data-l="${s.id}">Bayar (${rp(saleDebt(s))})</button>` : "") +
        ` <button class="btn sm danger" data-del="${s.id}">Hapus</button>`;
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  });
  tb.querySelectorAll("[data-r]").forEach((b) => b.onclick = () => printReceipt(S.sales.find((s) => s.id === b.dataset.r)));
  tb.querySelectorAll("[data-v]").forEach((b) => b.onclick = () => voidSale(b.dataset.v, false));
  tb.querySelectorAll("[data-ed]").forEach((b) => b.onclick = () => voidSale(b.dataset.ed, true));
  tb.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
    if (!confirm("Hapus transaksi ini dari riwayat? Stok tidak dikembalikan (gunakan Batalkan untuk itu).")) return;
    S.sales = S.sales.filter((s) => s.id !== b.dataset.del); save(); renderReport();
  });
  tb.querySelectorAll("[data-l]").forEach((b) => b.onclick = () => {
    const s = S.sales.find((x) => x.id === b.dataset.l), d = saleDebt(s);
    const v = prompt(`Bayar utang (sisa ${rp(d)}). Jumlah:`, d); if (v === null) return;
    const n = num(v); if (n <= 0) return toast("Jumlah tidak valid");
    s.paid += Math.min(n, d); save(); renderReport(); toast("Pembayaran tercatat");
  });
}
function voidSale(id, reload) {
  const s = S.sales.find((x) => x.id === id);
  if (!confirm(reload ? "Edit transaksi: transaksi dibatalkan, stok dikembalikan, dan barangnya dimuat ke keranjang untuk dibuat ulang. Lanjut?"
    : "Batalkan transaksi ini? Stok dikembalikan.")) return;
  s.items.forEach((i) => { const p = prod(i.id); if (p) { p.stock += i.qty; logStock(p, i.qty, reload ? "Edit transaksi" : "Batal transaksi"); } });
  s.void = true; save();
  if (reload) {
    cart = s.items.filter((i) => prod(i.id)).map((i) => ({ id: i.id, qty: i.qty, disc: i.disc || 0 }));
    $("#discNota").value = s.discNota || ""; $("#note").value = s.note || "";
    showTab("kasir"); renderCart(); toast("Ubah barang lalu bayar lagi");
  } else { renderReport(); toast("Transaksi dibatalkan"); }
}
$("#btnCsv").onclick = () => download("laporan-" + $("#rKind").value + ".csv", csvOf(lastReport.head, lastReport.rows), "text/csv");

/* ================= Pengaturan ================= */
function renderSettings() {
  const s = S.settings;
  $("#sShop").value = s.shop; $("#sAddr").value = s.addr; $("#sFooter").value = s.footer; $("#sPaper").value = s.paper; $("#sPin").value = s.pin;
  const chips = (arr, kind) => arr.length ? arr.map((x, i) => `<span class="chip">${esc(x)}<button data-k="${kind}" data-i="${i}" title="Hapus">✕</button></span>`).join("") : '<span class="muted">Belum ada</span>';
  $("#catList").innerHTML = chips(S.categories, "cat");
  $("#methodList").innerHTML = chips(S.methods, "method");
  document.querySelectorAll("#catList button,#methodList button").forEach((b) => b.onclick = () => {
    const arr = b.dataset.k === "cat" ? S.categories : S.methods, name = arr[b.dataset.i];
    if (!confirm(`Hapus "${name}"?`)) return;
    arr.splice(b.dataset.i, 1);
    if (b.dataset.k === "cat") S.products.forEach((p) => { if (p.category === name) p.category = ""; });
    save(); refreshLookups(); renderSettings();
  });
}
$("#btnSaveSet").onclick = () => {
  Object.assign(S.settings, { shop: $("#sShop").value.trim() || "Toko", addr: $("#sAddr").value.trim(), footer: $("#sFooter").value.trim(), paper: $("#sPaper").value, pin: $("#sPin").value });
  unlocked = false; save(); refreshLookups(); toast("Pengaturan disimpan");
};
$("#btnAddCat").onclick = () => { const v = $("#newCat").value.trim(); if (!v || S.categories.includes(v)) return; S.categories.push(v); $("#newCat").value = ""; save(); refreshLookups(); renderSettings(); };
$("#btnAddMethod").onclick = () => { const v = $("#newMethod").value.trim(); if (!v || S.methods.includes(v)) return; S.methods.push(v); $("#newMethod").value = ""; save(); refreshLookups(); renderSettings(); };
$("#btnDelSales").onclick = () => { if (confirm("Hapus SEMUA transaksi? Tidak bisa dibatalkan.") && confirm("Yakin? Sebaiknya backup dulu.")) { S.sales = []; save(); toast("Semua transaksi dihapus"); } };
$("#btnDelExp").onclick = () => { if (confirm("Hapus SEMUA pengeluaran?")) { S.expenses = []; save(); toast("Pengeluaran dihapus"); } };
$("#btnBackup").onclick = () => download("backup-kasir-" + dayStr() + ".json", JSON.stringify(S), "application/json");
$("#fileRestore").onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then((t) => {
    const d = JSON.parse(t.replace(/^﻿/, ""));
    if (!Array.isArray(d.products) || !Array.isArray(d.sales)) throw 0;
    if (!confirm("Data saat ini akan diganti. Lanjut?")) return;
    ["products", "sales", "stockLog", "expenses", "customers", "categories", "methods"].forEach((k) => { if (Array.isArray(d[k])) S[k] = d[k]; });
    if (d.settings) Object.assign(S.settings, d.settings);
    S.products = S.products.map((p) => ({ cost: 0, category: "", minStock: 0, wholesale: 0, minWs: 0, ...p }));
    save(); refreshLookups(); renderSettings(); toast("Data dipulihkan");
  }).catch(() => toast("File backup tidak valid"));
  e.target.value = "";
};

/* ================= Mulai ================= */
refreshLookups(); renderCart(); showTab("beranda");
