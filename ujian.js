/* =========================================================
   CAT SKD ONLINE — Halaman ujian peserta
   Kunci jawaban & penilaian ada di server (Supabase RPC).
   ========================================================= */
(() => {
  const cfg = window.CAT_CONFIG;
  const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, { auth: { persistSession: false } });
  const LETTER = ["A", "B", "C", "D", "E"];
  const DEF_LBL = { TWK: { code: "TWK", name: "Tes Wawasan Kebangsaan" }, TIU: { code: "TIU", name: "Tes Intelegensia Umum" }, TKP: { code: "TKP", name: "Tes Karakteristik Pribadi" } };
  let LBL = DEF_LBL; // label subtes sesuai paket soal
  const setLbl = (l) => { if (l && l.TWK) LBL = l; };
  const C = (k) => LBL[k].code, N = (k) => LBL[k].name;
  const SECS = (m) => (m === "FULL" ? ["TWK", "TIU", "TKP"] : [m]);
  const KEY = "cat_online_kode";

  const $ = (id) => document.getElementById(id);
  let kode = null, info = null, X = null, offset = 0, tick = null, fontSize = 17;
  let dirty = false, saving = false, saveTimer = null, finishing = false;

  /* ---------- util ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const show = (id) => {
    ["scrKode", "scrInfo", "scrExam", "scrResult"].forEach((s) => $(s).classList.toggle("hidden", s !== id));
    window.scrollTo(0, 0);
  };
  const loading = (on) => $("loading").classList.toggle("hidden", !on);
  const fmt = (ms) => {
    const t = Math.max(0, Math.floor(ms / 1000));
    return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((v) => String(v).padStart(2, "0")).join(":");
  };
  const errMsg = (e) => (e && (e.message || e.error_description)) || "Terjadi kesalahan. Periksa koneksi internet Anda.";
  const fmtTgl = (d) => (d ? new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-");

  function modal(title, body, buttons) {
    $("mTitle").textContent = title;
    $("mBody").innerHTML = body;
    const box = $("mBtns");
    box.innerHTML = "";
    buttons.forEach((b) => {
      const el = document.createElement("button");
      el.className = "btn " + (b.cls || "");
      el.textContent = b.text;
      el.onclick = () => { $("modal").classList.add("hidden"); b.fn && b.fn(); };
      box.appendChild(el);
    });
    $("modal").classList.remove("hidden");
  }

  async function rpc(fn, args) {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw error;
    return data;
  }

  function setBrand(d) {
    if (d.org) { $("brandTitle").textContent = d.org; $("brandSub").textContent = d.session || "Computer Assisted Test"; }
    if (d.logo) { $("orgLogo").src = d.logo; $("orgLogo").classList.remove("hidden"); $("defLogo").classList.add("hidden"); }
  }
  function setTopRight(nama, no) {
    $("topRight").innerHTML = nama ? `<b>${esc(nama)}</b><br>${no ? "No. " + esc(no) : ""}` : "";
  }

  /* ---------- 1. KODE ---------- */
  async function cekKode(k) {
    kode = k.trim().toUpperCase();
    if (!kode) return ($("kodeErr").textContent = "Kode akses wajib diisi.");
    $("kodeErr").textContent = "";
    loading(true);
    try {
      info = await rpc("peserta_cek", { p_code: kode });
      setLbl(info.labels);
      localStorage.setItem(KEY, kode);
      setBrand(info);
      if (info.status === "baru") renderInfo();
      else await mulai(); // melanjutkan / melihat hasil
    } catch (e) {
      localStorage.removeItem(KEY);
      $("kodeErr").textContent = errMsg(e);
      show("scrKode");
    } finally { loading(false); }
  }
  $("btnCek").onclick = () => cekKode($("inKode").value);
  $("inKode").addEventListener("keydown", (e) => e.key === "Enter" && $("btnCek").click());

  /* ---------- 2. KONFIRMASI ---------- */
  function renderInfo() {
    $("infoTable").innerHTML = `
      <tr><td>Penyelenggara</td><td><b>${esc(info.org)}</b></td></tr>
      <tr><td>Sesi Ujian</td><td>${esc(info.session)}</td></tr>
      <tr><td>Kode Akses</td><td><b>${esc(kode)}</b></td></tr>
      <tr><td>Alokasi Waktu</td><td>${info.duration} menit</td></tr>
      ${info.opens_at || info.closes_at ? `<tr><td>Jadwal</td><td>${fmtTgl(info.opens_at)} s.d. ${fmtTgl(info.closes_at)}</td></tr>` : ""}`;
    $("inNama").value = info.name || "";
    $("inNo").value = info.number || "";
    let rows = `<tr><th>Subtes</th><th>Jumlah Soal</th><th>Nilai Maks.</th><th>Passing Grade</th></tr>`;
    let tN = 0;
    SECS(info.mode).forEach((k) => {
      const n = (info.counts && info.counts[k]) || 0;
      tN += n;
      rows += `<tr><td>${C(k)} — ${N(k)}</td><td>${n}</td><td>${n * 5}</td><td>${info.pg[k]}</td></tr>`;
    });
    if (info.mode === "FULL") rows += `<tr><td><b>Total</b></td><td><b>${tN}</b></td><td><b>${tN * 5}</b></td><td>—</td></tr>`;
    $("komposisi").innerHTML = rows;
    $("startErr").textContent = "";
    show("scrInfo");
  }
  $("btnBack").onclick = () => { localStorage.removeItem(KEY); kode = null; show("scrKode"); };
  $("btnStart").onclick = async () => {
    const nama = $("inNama").value.trim();
    if (nama.length < 3) return ($("startErr").textContent = "Nama lengkap wajib diisi (minimal 3 huruf).");
    modal("Mulai Ujian?", `<p>Waktu <b>${info.duration} menit</b> akan langsung berjalan dan tidak dapat dihentikan.</p>`, [
      { text: "Batal" },
      { text: "Ya, Mulai", cls: "primary", fn: () => mulai(nama, $("inNo").value.trim()) }
    ]);
  };

  async function mulai(nama, no) {
    loading(true);
    try {
      const d = await rpc("peserta_mulai", { p_code: kode, p_name: nama || null, p_number: no || null });
      if (d.status === "selesai") return renderResult(d.result);
      startExam(d);
    } catch (e) {
      $("startErr").textContent = errMsg(e);
      if (!$("scrInfo").classList.contains("hidden")) return;
      $("kodeErr").textContent = errMsg(e);
      show("scrKode");
    } finally { loading(false); }
  }

  /* ---------- 3. UJIAN ---------- */
  function startExam(d) {
    setLbl(d.labels);
    X = {
      items: d.items, answers: d.answers, flags: d.flags, tab: d.tab_switches || 0,
      deadline: Date.parse(d.deadline), cur: 0, mode: d.mode
    };
    offset = Date.parse(d.server_now) - Date.now();
    const pos = Number(sessionStorage.getItem("cat_cur_" + kode));
    if (pos >= 0 && pos < X.items.length) X.cur = pos;
    setTopRight(d.name, d.number);
    buildNav();
    renderSoal();
    show("scrExam");
    setSave("ok");
    clearInterval(tick);
    tick = setInterval(updateTimer, 500);
    updateTimer();
  }
  const sisa = () => X.deadline - (Date.now() + offset);

  function updateTimer() {
    const s = sisa();
    $("timer").textContent = fmt(s);
    $("timer").classList.toggle("low", s < 5 * 60 * 1000);
    if (s <= 0 && !finishing) { clearInterval(tick); selesai(true); }
  }

  function buildNav() {
    const g = $("navGrid");
    g.innerHTML = "";
    let wrap = null, last = null;
    X.items.forEach((x, i) => {
      if (x.sec !== last) {
        last = x.sec;
        g.insertAdjacentHTML("beforeend", `<div class="sec-label">${C(x.sec)} — ${N(x.sec)}</div>`);
        wrap = document.createElement("div");
        wrap.className = "nav";
        g.appendChild(wrap);
      }
      const b = document.createElement("button");
      b.textContent = i + 1;
      b.id = "nv" + i;
      b.onclick = () => { go(i); document.querySelector(".exam-side").classList.remove("open"); };
      wrap.appendChild(b);
    });
  }

  function refreshNav() {
    let done = 0, ragu = 0;
    X.items.forEach((_, i) => {
      const j = X.answers[i] !== null;
      if (j) done++;
      if (X.flags[i]) ragu++;
      $("nv" + i).className = (X.flags[i] ? "ragu" : j ? "done" : "") + (i === X.cur ? " cur" : "");
    });
    $("statBox").innerHTML = `<span>Dijawab: <b>${done}</b></span><span>Ragu: <b>${ragu}</b></span><span>Belum: <b>${X.items.length - done}</b></span>`;
    $("btnNavToggle").textContent = `☰ Nomor Soal · dijawab ${done}/${X.items.length}` + (ragu ? ` · ragu ${ragu}` : "");
  }

  function renderSoal() {
    const i = X.cur, x = X.items[i];
    $("qSec").textContent = C(x.sec);
    $("qNo").textContent = i + 1;
    $("qText").textContent = x.q;
    const box = $("qOpts");
    box.innerHTML = "";
    x.o.forEach((t, k) => {
      const b = document.createElement("button");
      b.className = "opt" + (X.answers[i] === k ? " sel" : "");
      b.innerHTML = `<span class="lt">${LETTER[k]}</span><span>${esc(t)}</span>`;
      b.onclick = () => pilih(k);
      box.appendChild(b);
    });
    $("btnPrev").disabled = i === 0;
    $("btnNext").textContent = i === X.items.length - 1 ? "Selesai ›" : "Berikutnya ›";
    $("btnRagu").classList.toggle("on", !!X.flags[i]);
    $("btnRagu").textContent = X.flags[i] ? "✓ Ragu-ragu" : "Ragu-ragu";
    refreshNav();
    const cur = $("nv" + i);
    if (cur && cur.offsetParent) cur.scrollIntoView({ block: "nearest" });
    if (window.innerWidth <= 900) window.scrollTo({ top: 0 });
    sessionStorage.setItem("cat_cur_" + kode, i);
  }

  function pilih(k) {
    X.answers[X.cur] = X.answers[X.cur] === k ? null : k;
    queueSave();
    renderSoal();
  }
  function go(i) {
    if (i < 0 || i >= X.items.length) return;
    X.cur = i;
    renderSoal();
  }

  $("btnPrev").onclick = () => go(X.cur - 1);
  $("btnNext").onclick = () => (X.cur === X.items.length - 1 ? confirmFinish() : go(X.cur + 1));
  $("btnRagu").onclick = () => { X.flags[X.cur] = !X.flags[X.cur]; queueSave(); renderSoal(); };
  $("btnFinish").onclick = () => confirmFinish();
  $("btnNavToggle").onclick = () => document.querySelector(".exam-side").classList.toggle("open");
  document.querySelectorAll("[data-font]").forEach((b) => (b.onclick = () => {
    fontSize = Math.min(24, Math.max(14, fontSize + Number(b.dataset.font)));
    document.documentElement.style.setProperty("--qsize", fontSize + "px");
  }));

  const inExam = () => !$("scrExam").classList.contains("hidden");
  document.addEventListener("keydown", (e) => {
    if (!inExam() || !$("modal").classList.contains("hidden")) return;
    const idx = LETTER.indexOf(e.key.toUpperCase());
    if (idx >= 0 && !e.ctrlKey && !e.metaKey) { pilih(idx); e.preventDefault(); }
    else if (e.key === "ArrowRight") go(X.cur + 1);
    else if (e.key === "ArrowLeft") go(X.cur - 1);
  });

  /* ---------- anti-curang ringan ---------- */
  ["contextmenu", "copy", "cut"].forEach((ev) => document.addEventListener(ev, (e) => inExam() && e.preventDefault()));
  document.addEventListener("visibilitychange", () => {
    if (!inExam() || finishing) return;
    if (document.hidden) {
      X.tab++;
      queueSave(0);
    } else {
      modal("Peringatan", `<p>Anda terdeteksi meninggalkan halaman ujian (<b>${X.tab} kali</b>). Aktivitas ini tercatat dan dilaporkan kepada panitia.</p>`, [{ text: "Kembali ke Soal", cls: "primary" }]);
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (inExam() && dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ---------- simpan otomatis ---------- */
  function setSave(st) {
    const el = $("saveState");
    el.className = "save-state " + st;
    el.textContent = { ok: "✓ Tersimpan", saving: "Menyimpan…", err: "⚠ Gagal menyimpan — mencoba lagi" }[st];
  }
  function queueSave(delay = 700) {
    dirty = true;
    setSave("saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(simpan, delay);
  }
  async function simpan() {
    if (saving || !dirty || finishing) return;
    saving = true;
    dirty = false;
    try {
      const r = await rpc("peserta_simpan", { p_code: kode, p_answers: X.answers, p_flags: X.flags, p_tab: X.tab });
      if (r && r.ok === false && r.status === "selesai") { clearInterval(tick); return lihatHasil(); }
      if (dirty) { clearTimeout(saveTimer); saveTimer = setTimeout(simpan, 300); }
      else setSave("ok");
    } catch (e) {
      dirty = true;
      setSave("err");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(simpan, 4000);
    } finally {
      saving = false;
    }
  }

  function confirmFinish() {
    const kosong = X.answers.filter((j) => j === null).length;
    const ragu = X.flags.filter(Boolean).length;
    let body = `<p>Yakin ingin mengakhiri ujian? Jawaban tidak dapat diubah lagi.</p>`;
    if (kosong) body += `<p class="small">• <b style="color:var(--red)">${kosong}</b> soal belum dijawab</p>`;
    if (ragu) body += `<p class="small">• <b style="color:#8a5d00">${ragu}</b> soal ditandai ragu-ragu</p>`;
    modal("Akhiri Ujian?", body, [
      { text: "Kembali ke Soal" },
      { text: "Ya, Akhiri Ujian", cls: "danger", fn: () => selesai(false) }
    ]);
  }

  async function selesai(timeout, attempt = 0) {
    finishing = true;
    clearInterval(tick);
    clearTimeout(saveTimer);
    loading(true);
    try {
      const d = await rpc("peserta_selesai", { p_code: kode, p_answers: X.answers, p_flags: X.flags, p_tab: X.tab });
      dirty = false;
      loading(false);
      renderResult(d.result);
      if (timeout) modal("Waktu Habis", "<p>Waktu ujian telah habis. Jawaban Anda sudah tersimpan dan dinilai otomatis.</p>", [{ text: "OK", cls: "primary" }]);
    } catch (e) {
      loading(false);
      if (attempt < 5) return setTimeout(() => selesai(timeout, attempt + 1), 3000);
      finishing = false;
      modal("Gagal Mengirim", `<p>${esc(errMsg(e))}</p><p class="small">Jawaban Anda masih tersimpan. Periksa koneksi internet lalu coba lagi.</p>`,
        [{ text: "Coba Lagi", cls: "primary", fn: () => selesai(timeout) }]);
    }
  }
  async function lihatHasil() {
    try {
      const d = await rpc("peserta_mulai", { p_code: kode });
      if (d.status === "selesai") renderResult(d.result);
    } catch (e) { /* abaikan */ }
  }

  /* ---------- 4. HASIL ---------- */
  function renderResult(r) {
    setLbl(r.labels);
    finishing = true;
    clearInterval(tick);
    sessionStorage.removeItem("cat_cur_" + kode);
    setTopRight(r.name, r.number);
    if (!r.show) {
      $("resBody").innerHTML = `
        <p>Terima kasih, <b>${esc(r.name)}</b>. Jawaban Anda untuk sesi <b>${esc(r.session)}</b> telah diterima.</p>
        <div class="status pass">✓ Ujian berhasil dikirim</div>
        <p class="muted">Hasil ujian akan diumumkan oleh panitia penyelenggara.</p>`;
      return show("scrResult");
    }
    const secs = SECS(r.mode);
    let rows = `<tr><th>Subtes</th><th>Nilai</th><th>Passing Grade</th><th>Keterangan</th></tr>`;
    let tMax = 0;
    secs.forEach((k) => {
      const v = r[k] ?? 0, mx = (r.max && r.max[k]) || 0, ok = v >= r.pg[k];
      tMax += mx;
      rows += `<tr><td><b>${C(k)}</b><br><span class="small muted">${N(k)}</span></td>
        <td><b>${v}</b> / ${mx}<div class="bar"><i style="width:${mx ? (v / mx) * 100 : 0}%"></i></div></td>
        <td>${r.pg[k]}</td><td class="${ok ? "ok" : "no"}">${ok ? "Memenuhi" : "Tidak Memenuhi"}</td></tr>`;
    });
    if (secs.length > 1) rows += `<tr class="total"><td>TOTAL</td><td>${r.total} / ${tMax}</td><td colspan="2"></td></tr>`;
    const durasi = r.started_at && r.finished_at ? Math.round((Date.parse(r.finished_at) - Date.parse(r.started_at)) / 60000) : "-";
    $("resBody").innerHTML = `
      <table class="kv">
        <tr><td>Nama</td><td><b>${esc(r.name)}</b></td></tr>
        <tr><td>Nomor Peserta</td><td>${esc(r.number || "-")}</td></tr>
        <tr><td>Sesi Ujian</td><td>${esc(r.session)}</td></tr>
        <tr><td>Lama Pengerjaan</td><td>${durasi} menit</td></tr>
      </table>
      <div class="status ${r.passed ? "pass" : "fail"}">${r.passed ? "✓ MEMENUHI" : "✗ TIDAK MEMENUHI"} nilai ambang batas (passing grade)</div>
      <table class="grid-table score-table">${rows}</table>`;
    show("scrResult");
  }
  $("btnPrint").onclick = () => window.print();
  $("btnOut").onclick = () => {
    localStorage.removeItem(KEY);
    location.href = location.pathname;
  };

  /* ---------- awal ---------- */
  if (cfg.SUPABASE_URL.includes("ISI-PROJECT")) {
    $("kodeErr").textContent = "Aplikasi belum dikonfigurasi: isi SUPABASE_URL dan SUPABASE_KEY di config.js.";
  }
  const qKode = new URLSearchParams(location.search).get("kode");
  const saved = qKode || localStorage.getItem(KEY);
  if (saved) { $("inKode").value = saved; cekKode(saved); }
})();
