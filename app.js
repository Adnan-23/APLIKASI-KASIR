"use strict";
// ===== Penyimpanan (localStorage) =====
const DB = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};
let products = DB.get("products", []);
let sales = DB.get("sales", []);
let cart = []; // {id, qty}

const $ = (s) => document.querySelector(s);
const rp = (n) => "Rp " + Math.round(n).toLocaleString("id-ID");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const save = () => { DB.set("products", products); DB.set("sales", sales); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2200);
}

// ===== Tab =====
document.querySelectorAll("nav button").forEach((b) => b.onclick = () => {
  document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("active", x === b));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + b.dataset.tab));
  if (b.dataset.tab === "produk") renderProducts();
  if (b.dataset.tab === "riwayat") renderHistory();
  if (b.dataset.tab === "kasir") $("#scanInput").focus();
});

// ===== Harga: otomatis grosir bila qty >= minimum =====
function unitPrice(p, qty) {
  if (p.wholesale && p.minWs && qty >= p.minWs) return p.wholesale;
  return p.retail;
}

// ===== Keranjang =====
function addToCart(p) {
  const line = cart.find((c) => c.id === p.id);
  const have = line ? line.qty : 0;
  if (have + 1 > p.stock) { toast("Stok tidak cukup: " + p.name); return; }
  if (line) line.qty++; else cart.push({ id: p.id, qty: 1 });
  renderCart();
}
function findByBarcode(code) { return products.find((p) => p.barcode === code); }

function renderCart() {
  const body = $("#cartBody");
  body.innerHTML = "";
  let total = 0;
  cart.forEach((c, i) => {
    const p = products.find((x) => x.id === c.id);
    if (!p) return;
    const price = unitPrice(p, c.qty), sub = price * c.qty;
    total += sub;
    const isWs = price !== p.retail;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(p.name)} ${isWs ? '<span class="badge">grosir</span>' : ""}</td>
      <td><input type="number" min="1" max="${p.stock}" value="${c.qty}" data-i="${i}"></td>
      <td>${rp(price)}</td><td>${rp(sub)}</td>
      <td><button class="btn sm danger" data-del="${i}">✕</button></td>`;
    body.appendChild(tr);
  });
  $("#cartEmpty").hidden = cart.length > 0;
  $("#total").textContent = rp(total);
  updateChange(total);
  body.querySelectorAll("input").forEach((inp) => inp.onchange = () => {
    const c = cart[inp.dataset.i], p = products.find((x) => x.id === c.id);
    let q = Math.max(1, parseInt(inp.value) || 1);
    if (q > p.stock) { q = p.stock; toast("Stok maksimal " + p.stock); }
    c.qty = q; renderCart();
  });
  body.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => { cart.splice(b.dataset.del, 1); renderCart(); });
}
function cartTotal() {
  return cart.reduce((s, c) => { const p = products.find((x) => x.id === c.id); return s + (p ? unitPrice(p, c.qty) * c.qty : 0); }, 0);
}
function updateChange(total = cartTotal()) {
  const paid = parseFloat($("#paid").value) || 0;
  $("#change").textContent = rp(Math.max(0, paid - total));
}
$("#paid").oninput = () => updateChange();

// ===== Scan / cari =====
const scanInput = $("#scanInput");
scanInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const q = scanInput.value.trim(); if (!q) return;
  const exact = findByBarcode(q);
  if (exact) { addToCart(exact); }
  else {
    const m = searchProducts(q);
    if (m.length === 1) addToCart(m[0]); else if (!m.length) toast("Produk tidak ditemukan: " + q);
  }
  scanInput.value = ""; $("#suggest").innerHTML = "";
});
scanInput.addEventListener("input", () => {
  const q = scanInput.value.trim(), box = $("#suggest");
  box.innerHTML = "";
  if (q.length < 2) return;
  searchProducts(q).slice(0, 6).forEach((p) => {
    const d = document.createElement("div");
    d.textContent = `${p.name} — ${rp(p.retail)} (stok ${p.stock})`;
    d.onclick = () => { addToCart(p); scanInput.value = ""; box.innerHTML = ""; scanInput.focus(); };
    box.appendChild(d);
  });
});
function searchProducts(q) {
  q = q.toLowerCase();
  return products.filter((p) => p.name.toLowerCase().includes(q) || p.barcode.includes(q));
}

// ===== Kamera scanner =====
let scanner = null, scanCb = null;
function openScanner(cb) {
  if (typeof Html5Qrcode === "undefined") { toast("Library scanner gagal dimuat (perlu internet)"); return; }
  scanCb = cb; $("#scanModal").hidden = false;
  scanner = new Html5Qrcode("reader");
  scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 260, height: 160 } }, (text) => {
    const f = scanCb; closeScanner(); f(text);
  }).catch(() => { toast("Kamera tidak bisa dibuka. Izinkan akses kamera (perlu HTTPS)."); closeScanner(); });
}
function closeScanner() {
  $("#scanModal").hidden = true;
  if (scanner) { scanner.stop().catch(() => {}).finally(() => { try { scanner.clear(); } catch {} scanner = null; }); }
}
$("#btnCloseScan").onclick = closeScanner;
$("#btnCamKasir").onclick = () => openScanner((code) => {
  const p = findByBarcode(code);
  if (p) { addToCart(p); toast("Ditambahkan: " + p.name); } else toast("Barcode tidak terdaftar: " + code);
});
$("#btnCamProd").onclick = () => openScanner((code) => { $("#pBarcode").value = code; });

// ===== Bayar =====
$("#btnPay").onclick = () => {
  if (!cart.length) return toast("Keranjang kosong");
  const total = cartTotal(), paid = parseFloat($("#paid").value) || 0;
  if (paid < total) return toast("Uang diterima kurang");
  const items = cart.map((c) => {
    const p = products.find((x) => x.id === c.id), price = unitPrice(p, c.qty);
    p.stock -= c.qty;
    return { id: p.id, name: p.name, qty: c.qty, price, sub: price * c.qty };
  });
  const sale = { id: uid(), time: Date.now(), items, total, paid, change: paid - total };
  sales.unshift(sale); save();
  printReceipt(sale);
  cart = []; $("#paid").value = ""; renderCart(); scanInput.focus();
  toast("Transaksi berhasil");
};
$("#btnClear").onclick = () => { cart = []; renderCart(); };

function printReceipt(s) {
  const w = window.open("", "_blank", "width=380,height=600");
  if (!w) return toast("Pop-up diblokir; izinkan untuk cetak struk");
  const rows = s.items.map((i) => `<tr><td colspan="2">${esc(i.name)}</td></tr><tr><td>${i.qty} x ${rp(i.price)}</td><td style="text-align:right">${rp(i.sub)}</td></tr>`).join("");
  w.document.write(`<html><head><title>Struk</title><style>body{font:13px monospace;width:280px;margin:8px auto}table{width:100%}hr{border:0;border-top:1px dashed #000}</style></head><body>
    <h3 style="text-align:center;margin:0">TOKO GROSIR &amp; ECERAN</h3>
    <p style="text-align:center;margin:2px 0">${new Date(s.time).toLocaleString("id-ID")}</p><hr>
    <table>${rows}</table><hr>
    <table><tr><td>Total</td><td style="text-align:right">${rp(s.total)}</td></tr>
    <tr><td>Bayar</td><td style="text-align:right">${rp(s.paid)}</td></tr>
    <tr><td>Kembali</td><td style="text-align:right">${rp(s.change)}</td></tr></table><hr>
    <p style="text-align:center">Terima kasih</p>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ===== Produk =====
const form = $("#prodForm");
form.onsubmit = (e) => {
  e.preventDefault();
  const barcode = $("#pBarcode").value.trim(), id = $("#pId").value;
  if (products.some((p) => p.barcode === barcode && p.id !== id)) return toast("Barcode sudah dipakai produk lain");
  const data = {
    id: id || uid(), barcode, name: $("#pName").value.trim(),
    retail: parseFloat($("#pRetail").value) || 0,
    wholesale: parseFloat($("#pWholesale").value) || 0,
    minWs: parseInt($("#pMinWs").value) || 0,
    stock: parseInt($("#pStock").value) || 0
  };
  if (data.wholesale && !data.minWs) return toast("Isi min. qty grosir");
  const i = products.findIndex((p) => p.id === data.id);
  if (i >= 0) products[i] = data; else products.push(data);
  save(); form.reset(); $("#pId").value = ""; renderProducts(); toast("Produk disimpan");
};
$("#btnResetForm").onclick = () => { form.reset(); $("#pId").value = ""; };
$("#prodSearch").oninput = renderProducts;

function renderProducts() {
  const q = $("#prodSearch").value.trim().toLowerCase();
  const body = $("#prodBody"); body.innerHTML = "";
  products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.barcode.includes(q))
    .sort((a, b) => a.name.localeCompare(b.name)).forEach((p) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${esc(p.name)}<br><small class="muted">${esc(p.barcode)}</small></td>
        <td>${rp(p.retail)}</td>
        <td>${p.wholesale ? rp(p.wholesale) + `<br><small class="muted">min ${p.minWs}</small>` : "-"}</td>
        <td>${p.stock}</td>
        <td><button class="btn sm" data-e="${p.id}">Ubah</button> <button class="btn sm danger" data-d="${p.id}">Hapus</button></td>`;
      body.appendChild(tr);
    });
  body.querySelectorAll("[data-e]").forEach((b) => b.onclick = () => {
    const p = products.find((x) => x.id === b.dataset.e);
    $("#pId").value = p.id; $("#pBarcode").value = p.barcode; $("#pName").value = p.name;
    $("#pRetail").value = p.retail; $("#pWholesale").value = p.wholesale || "";
    $("#pMinWs").value = p.minWs || ""; $("#pStock").value = p.stock;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  body.querySelectorAll("[data-d]").forEach((b) => b.onclick = () => {
    if (!confirm("Hapus produk ini?")) return;
    products = products.filter((x) => x.id !== b.dataset.d); save(); renderProducts();
  });
}

// ===== Riwayat =====
function renderHistory() {
  const today = new Date().toDateString();
  const t = sales.filter((s) => new Date(s.time).toDateString() === today);
  $("#rToday").textContent = rp(t.reduce((a, s) => a + s.total, 0));
  $("#rCount").textContent = t.length;
  const body = $("#histBody"); body.innerHTML = "";
  sales.slice(0, 200).forEach((s) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${new Date(s.time).toLocaleString("id-ID")}</td>
      <td>${s.items.map((i) => esc(i.name) + " x" + i.qty).join(", ")}</td>
      <td>${rp(s.total)}</td><td><button class="btn sm" data-p="${s.id}">Struk</button></td>`;
    body.appendChild(tr);
  });
  body.querySelectorAll("[data-p]").forEach((b) => b.onclick = () => printReceipt(sales.find((s) => s.id === b.dataset.p)));
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("#btnCsv").onclick = () => {
  const lines = ["waktu,produk,qty,harga,subtotal"];
  sales.forEach((s) => s.items.forEach((i) =>
    lines.push([new Date(s.time).toISOString(), '"' + i.name.replace(/"/g, '""') + '"', i.qty, i.price, i.sub].join(","))));
  download("penjualan.csv", lines.join("\n"), "text/csv");
};
$("#btnBackup").onclick = () => download("backup-kasir.json", JSON.stringify({ products, sales }), "application/json");
$("#fileRestore").onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then((t) => {
    const d = JSON.parse(t);
    if (!Array.isArray(d.products) || !Array.isArray(d.sales)) throw 0;
    if (!confirm("Data saat ini akan diganti. Lanjut?")) return;
    products = d.products; sales = d.sales; save(); renderProducts(); toast("Data dipulihkan");
  }).catch(() => toast("File backup tidak valid"));
  e.target.value = "";
};

renderCart();
