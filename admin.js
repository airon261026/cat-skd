/* =========================================================
   CAT SKD ONLINE — Dashboard Admin & Pimpinan
   ========================================================= */
(() => {
  const cfg = window.CAT_CONFIG;
  const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
  const LETTER = ["A", "B", "C", "D", "E"];
  const NAMA = { TWK: "Tes Wawasan Kebangsaan", TIU: "Tes Intelegensia Umum", TKP: "Tes Karakteristik Pribadi" };
  const MODE = {
    FULL: { label: "SKD Lengkap (TWK+TIU+TKP)", menit: 100 },
    TWK: { label: "TWK saja", menit: 27 },
    TIU: { label: "TIU saja", menit: 32 },
    TKP: { label: "TKP saja", menit: 41 }
  };
  const SECS = (m) => (m === "FULL" ? ["TWK", "TIU", "TKP"] : [m]);

  const $ = (id) => document.getElementById(id);
  const st = { user: null, me: null, orgs: [], org: null, sessions: [], parts: [], view: "ringkasan", sesiId: null, charts: {}, sort: { k: "total", d: -1 }, soal: [] };

  /* ---------- util ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const loading = (on) => $("loading").classList.toggle("hidden", !on);
  const errMsg = (e) => (e && (e.message || e.error_description)) || String(e);
  const tgl = (d) => (d ? new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-");
  const isOwner = () => st.me && st.me.role === "owner";
  const sesiById = (id) => st.sessions.find((s) => s.id === id);
  const durasi = (p) => (p.started_at && p.finished_at ? Math.round((Date.parse(p.finished_at) - Date.parse(p.started_at)) / 60000) : null);
  const pesertaLink = (code) => new URL("index.html?kode=" + code, location.href).href;
  const toLocalInput = (d) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.add("hidden"), 2600);
  }
  function statusPill(p) {
    if (p.status === "selesai") return p.passed ? `<span class="pill ok">Memenuhi PG</span>` : `<span class="pill no">Tidak Memenuhi</span>`;
    if (p.status === "mengerjakan") return `<span class="pill run">Mengerjakan</span>`;
    return `<span class="pill new">Belum mulai</span>`;
  }

  /** Modal generik. buttons: [{text, cls, fn}] — fn boleh async; return false agar modal tetap terbuka */
  function modal(title, body, buttons) {
    $("mTitle").textContent = title;
    $("mBody").innerHTML = body;
    $("mErr").textContent = "";
    const box = $("mBtns");
    box.innerHTML = "";
    buttons.forEach((b) => {
      const el = document.createElement("button");
      el.className = "btn " + (b.cls || "");
      el.textContent = b.text;
      el.onclick = async () => {
        if (!b.fn) return closeModal();
        try {
          el.disabled = true;
          const r = await b.fn();
          if (r !== false) closeModal();
        } catch (e) {
          $("mErr").textContent = errMsg(e);
        } finally { el.disabled = false; }
      };
      box.appendChild(el);
    });
    $("modal").classList.remove("hidden");
  }
  const closeModal = () => $("modal").classList.add("hidden");
  const confirmBox = (title, msg, fn, cls = "danger", ok = "Ya") =>
    modal(title, `<p>${msg}</p>`, [{ text: "Batal" }, { text: ok, cls, fn }]);

  async function fetchAll(build) {
    let all = [], from = 0;
    const size = 1000;
    for (;;) {
      const { data, error } = await build().range(from, from + size - 1);
      if (error) throw error;
      all = all.concat(data);
      if (data.length < size) break;
      from += size;
    }
    return all;
  }

  /* ---------- LOGIN ---------- */
  let daftar = false;
  $("btnSwitch").onclick = (e) => {
    e.preventDefault();
    daftar = !daftar;
    $("pass2Box").classList.toggle("hidden", !daftar);
    $("btnLogin").textContent = daftar ? "Daftar" : "Masuk";
    $("swText").textContent = daftar ? "Sudah punya akun?" : "Belum punya akun?";
    $("btnSwitch").textContent = daftar ? "Masuk" : "Daftar";
    document.querySelector("#scrLogin h2").textContent = daftar ? "Daftar Akun Admin" : "Login Admin";
    $("inPass").autocomplete = daftar ? "new-password" : "current-password";
    $("forgotBox").classList.toggle("hidden", daftar);
    $("loginErr").textContent = "";
  };

  /* ---------- lupa kata sandi ---------- */
  $("btnForgot").onclick = async (e) => {
    e.preventDefault();
    const email = $("inEmail").value.trim();
    if (!email) return ($("loginErr").textContent = "Isi email Anda dulu, lalu klik Lupa kata sandi.");
    loading(true);
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    loading(false);
    $("loginErr").textContent = error
      ? (/rate|seconds/i.test(error.message) ? "Terlalu sering meminta. Tunggu beberapa menit lalu coba lagi." : error.message)
      : `Link untuk membuat kata sandi baru sudah dikirim ke ${email}. Cek kotak masuk / folder spam.`;
  };
  function showReset() {
    $("scrLogin").querySelector(".login-card").classList.add("hidden");
    $("resetCard").classList.remove("hidden");
    $("scrLogin").classList.remove("hidden");
    $("app").classList.add("hidden");
  }
  sb.auth.onAuthStateChange((ev) => { if (ev === "PASSWORD_RECOVERY") showReset(); });
  $("btnSaveNewPass").onclick = async () => {
    const p1 = $("inNewPass").value, p2 = $("inNewPass2").value;
    if (p1.length < 8) return ($("resetErr").textContent = "Kata sandi minimal 8 karakter.");
    if (p1 !== p2) return ($("resetErr").textContent = "Ulangi kata sandi tidak sama.");
    loading(true);
    const { error } = await sb.auth.updateUser({ password: p1 });
    loading(false);
    if (error) return ($("resetErr").textContent = error.message);
    history.replaceState(null, "", location.pathname);
    $("resetCard").classList.add("hidden");
    $("scrLogin").querySelector(".login-card").classList.remove("hidden");
    toast("Kata sandi baru tersimpan.");
    boot();
  };
  $("btnLogin").onclick = async () => {
    $("loginErr").textContent = "";
    const email = $("inEmail").value.trim(), password = $("inPass").value;
    if (daftar) {
      if (password.length < 8) return ($("loginErr").textContent = "Kata sandi minimal 8 karakter.");
      if (password !== $("inPass2").value) return ($("loginErr").textContent = "Ulangi kata sandi tidak sama.");
      loading(true);
      const { data, error } = await sb.auth.signUp({ email, password });
      loading(false);
      if (error) return ($("loginErr").textContent = /registered/i.test(error.message) ? "Email sudah terdaftar. Silakan masuk." : error.message);
      if (!data.session) return ($("loginErr").textContent = "Akun dibuat. Cek email Anda untuk konfirmasi, lalu masuk.");
      return boot();
    }
    loading(true);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    loading(false);
    if (error) return ($("loginErr").textContent = error.message === "Invalid login credentials" ? "Email atau kata sandi salah." : error.message);
    boot();
  };
  $("inPass2").addEventListener("keydown", (e) => e.key === "Enter" && $("btnLogin").click());
  $("inPass").addEventListener("keydown", (e) => e.key === "Enter" && $("btnLogin").click());
  $("btnLogout").onclick = async () => { await sb.auth.signOut(); location.reload(); };

  async function boot() {
    loading(true);
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { loading(false); return; }
      st.user = user;
      const { data: me } = await sb.from("admins").select("*").eq("user_id", user.id).maybeSingle();
      if (!me) {
        await sb.auth.signOut();
        $("loginErr").textContent = "Akun ini belum terdaftar sebagai admin. Hubungi pemilik aplikasi.";
        return;
      }
      st.me = me;
      $("topRight").innerHTML = `<b>${esc(me.name || user.email)}</b><br>${isOwner() ? "Pemilik Aplikasi" : "Admin"}`;
      document.querySelectorAll(".owner-only").forEach((el) => el.classList.toggle("hidden", !isOwner()));
      await loadOrgs();
      $("scrLogin").classList.add("hidden");
      $("app").classList.remove("hidden");
      if (!st.org && isOwner()) { setView("klien"); toast("Buat klien pertama Anda terlebih dahulu."); }
      else await reload();
    } catch (e) {
      $("loginErr").textContent = errMsg(e);
    } finally { loading(false); }
  }

  async function loadOrgs() {
    const { data, error } = await sb.from("organizations").select("*").order("name");
    if (error) throw error;
    st.orgs = data;
    if (isOwner()) {
      $("orgPickBox").classList.remove("hidden");
      const saved = localStorage.getItem("cat_admin_org");
      st.org = (data.find((o) => o.id === (st.org || saved)) || data[0] || {}).id || null;
      $("orgPick").innerHTML = data.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join("");
      if (st.org) $("orgPick").value = st.org;
    } else {
      st.org = st.me.org_id;
    }
    const org = st.orgs.find((o) => o.id === st.org);
    $("orgName").textContent = org ? org.name : "Admin & Pimpinan";
  }
  $("orgPick").onchange = async () => {
    st.org = $("orgPick").value;
    localStorage.setItem("cat_admin_org", st.org);
    $("orgName").textContent = st.orgs.find((o) => o.id === st.org).name;
    if (st.view === "sesidetail") st.view = "sesi";
    await reload();
  };

  /* ---------- DATA ---------- */
  async function reload() {
    if (!st.org) return render();
    loading(true);
    try {
      const { data: s, error } = await sb.from("exam_sessions").select("*").eq("org_id", st.org).order("created_at", { ascending: false });
      if (error) throw error;
      st.sessions = s;
      st.parts = await fetchAll(() =>
        sb.from("participants")
          .select("id,session_id,code,name,number,status,started_at,deadline,finished_at,score_twk,score_tiu,score_tkp,total,passed,tab_switches,created_at")
          .eq("org_id", st.org).order("created_at"));
      fillSesiSelects();
      render();
    } catch (e) {
      toast("Gagal memuat data: " + errMsg(e));
    } finally { loading(false); }
  }
  document.querySelectorAll("[data-refresh]").forEach((b) => (b.onclick = reload));

  function fillSesiSelects() {
    const opts = `<option value="">Semua sesi</option>` + st.sessions.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
    ["rsSesi", "fSesi"].forEach((id) => {
      const v = $(id).value;
      $(id).innerHTML = opts;
      if (st.sessions.some((s) => s.id === v)) $(id).value = v;
    });
  }

  /* ---------- NAVIGASI ---------- */
  document.querySelectorAll(".side a[data-view]").forEach((a) => (a.onclick = () => setView(a.dataset.view)));
  function setView(v) {
    st.view = v;
    render();
  }
  function render() {
    const nav = st.view === "sesidetail" ? "sesi" : st.view;
    document.querySelectorAll(".side a[data-view]").forEach((a) => a.classList.toggle("active", a.dataset.view === nav));
    document.querySelectorAll(".view").forEach((el) => el.classList.toggle("hidden", el.id !== "v-" + st.view));
    if (!st.org && st.view !== "klien") {
      toast("Belum ada klien. Buat klien di menu Klien & Admin.");
      return;
    }
    ({ ringkasan: renderRingkasan, sesi: renderSesi, sesidetail: renderSesiDetail, hasil: renderHasil, soal: renderSoal, klien: renderKlien })[st.view]();
  }

  /* =========================================================
     RINGKASAN
     ========================================================= */
  $("rsSesi").onchange = () => renderRingkasan();
  function renderRingkasan() {
    const sid = $("rsSesi").value;
    const parts = st.parts.filter((p) => !sid || p.session_id === sid);
    const done = parts.filter((p) => p.status === "selesai");
    const lulus = done.filter((p) => p.passed).length;
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const run = parts.filter((p) => p.status === "mengerjakan").length;

    $("statCards").innerHTML = `
      <div class="stat-card"><div class="lbl">Total Peserta</div><div class="val">${parts.length}</div><div class="sub">${st.sessions.length} sesi ujian</div></div>
      <div class="stat-card"><div class="lbl">Selesai Ujian</div><div class="val">${done.length}</div><div class="sub">${run} sedang mengerjakan</div></div>
      <div class="stat-card g"><div class="lbl">Memenuhi PG</div><div class="val">${lulus}</div><div class="sub">${done.length ? Math.round((lulus / done.length) * 100) : 0}% dari yang selesai</div></div>
      <div class="stat-card r"><div class="lbl">Tidak Memenuhi</div><div class="val">${done.length - lulus}</div><div class="sub">&nbsp;</div></div>
      <div class="stat-card"><div class="lbl">Rata-rata Total</div><div class="val">${Math.round(avg(done.map((p) => p.total || 0)))}</div><div class="sub">Tertinggi ${done.length ? Math.max(...done.map((p) => p.total || 0)) : 0}</div></div>`;

    // passing grade acuan: sesi terpilih atau sesi terbaru
    const ref = sesiById(sid) || st.sessions[0] || { pg_twk: 65, pg_tiu: 80, pg_tkp: 166 };
    const secs = ["TWK", "TIU", "TKP"];
    const avgSec = secs.map((k) => {
      const v = done.map((p) => p["score_" + k.toLowerCase()]).filter((x) => x !== null && x !== undefined);
      return Math.round(avg(v) * 10) / 10;
    });
    drawChart("chAvg", {
      type: "bar",
      data: {
        labels: secs,
        datasets: [
          { label: "Rata-rata peserta", data: avgSec, backgroundColor: "#1565c0", borderRadius: 6 },
          { label: "Passing grade", data: [ref.pg_twk, ref.pg_tiu, ref.pg_tkp], backgroundColor: "#f9a825", borderRadius: 6 }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true } } }
    });
    drawChart("chPass", {
      type: "doughnut",
      data: { labels: ["Memenuhi", "Tidak memenuhi", "Belum selesai"], datasets: [{ data: [lulus, done.length - lulus, parts.length - done.length], backgroundColor: ["#2e7d32", "#c62828", "#cfd6de"] }] },
      options: { responsive: true, plugins: { legend: { position: "bottom" } } }
    });
    const maxT = Math.max(550, ...done.map((p) => p.total || 0));
    const step = 50, bins = [];
    for (let b = 0; b < maxT; b += step) bins.push({ l: `${b}–${b + step - 1}`, n: 0, lo: b });
    done.forEach((p) => { const i = Math.min(bins.length - 1, Math.floor((p.total || 0) / step)); bins[i].n++; });
    drawChart("chDist", {
      type: "bar",
      data: { labels: bins.map((b) => b.l), datasets: [{ label: "Jumlah peserta", data: bins.map((b) => b.n), backgroundColor: "#0b3a6e", borderRadius: 4 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    const top = done.slice().sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, 10);
    $("topTable").innerHTML = `<tr><th>#</th><th>Nama</th><th>No. Peserta</th><th>Sesi</th><th class="num">TWK</th><th class="num">TIU</th><th class="num">TKP</th><th class="num">Total</th><th>Status</th></tr>` +
      (top.length ? top.map((p, i) => `<tr class="click" data-id="${p.id}"><td>${i + 1}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.number || "-")}</td><td>${esc((sesiById(p.session_id) || {}).name)}</td>
        <td class="num">${p.score_twk ?? "-"}</td><td class="num">${p.score_tiu ?? "-"}</td><td class="num">${p.score_tkp ?? "-"}</td><td class="num"><b>${p.total}</b></td><td>${statusPill(p)}</td></tr>`).join("")
        : `<tr><td colspan="9" class="empty">Belum ada peserta yang menyelesaikan ujian.</td></tr>`);
    bindDetailRows("topTable");
  }
  function drawChart(id, conf) {
    if (st.charts[id]) st.charts[id].destroy();
    st.charts[id] = new Chart($(id), conf);
  }

  /* =========================================================
     SESI UJIAN
     ========================================================= */
  function renderSesi() {
    $("sesiTable").innerHTML = `<tr><th>Nama Sesi</th><th>Jenis</th><th class="num">Durasi</th><th>Jadwal</th><th class="num">Peserta</th><th class="num">Selesai</th><th>Hasil ke peserta</th></tr>` +
      (st.sessions.length ? st.sessions.map((s) => {
        const ps = st.parts.filter((p) => p.session_id === s.id);
        return `<tr class="click" data-sid="${s.id}"><td><b>${esc(s.name)}</b><br><span class="small muted">Dibuat ${tgl(s.created_at)}</span></td>
          <td>${MODE[s.mode].label}</td><td class="num">${s.duration_min} mnt</td>
          <td class="small">${s.opens_at || s.closes_at ? `${tgl(s.opens_at)}<br>s.d. ${tgl(s.closes_at)}` : "Kapan saja"}</td>
          <td class="num">${ps.length}</td><td class="num">${ps.filter((p) => p.status === "selesai").length}</td>
          <td>${s.show_result ? "Ditampilkan" : "Disembunyikan"}</td></tr>`;
      }).join("") : `<tr><td colspan="7" class="empty">Belum ada sesi. Klik <b>+ Sesi Baru</b> untuk memulai.</td></tr>`);
    $("sesiTable").querySelectorAll("tr[data-sid]").forEach((tr) => (tr.onclick = () => { st.sesiId = tr.dataset.sid; setView("sesidetail"); }));
  }

  $("btnNewSesi").onclick = () => formSesi();
  function formSesi(s) {
    const v = s || { name: "", mode: "FULL", duration_min: 100, pg_twk: 65, pg_tiu: 80, pg_tkp: 166, show_result: true, shuffle: true };
    modal(s ? "Ubah Sesi Ujian" : "Sesi Ujian Baru", `
      <div class="form-grid">
        <div class="full"><label>Nama Sesi</label><input id="fsName" type="text" value="${esc(v.name)}" placeholder="Contoh: Rekrutmen Staf Batch 1 — 2026"></div>
        <div><label>Jenis Ujian</label><select id="fsMode">${Object.entries(MODE).map(([k, m]) => `<option value="${k}" ${k === v.mode ? "selected" : ""}>${m.label}</option>`).join("")}</select></div>
        <div><label>Durasi (menit)</label><input id="fsDur" type="number" min="5" max="300" value="${v.duration_min}"></div>
        <div><label>Dibuka (opsional)</label><input id="fsOpen" type="datetime-local" value="${toLocalInput(v.opens_at)}"></div>
        <div><label>Ditutup (opsional)</label><input id="fsClose" type="datetime-local" value="${toLocalInput(v.closes_at)}"></div>
        <div><label>Passing Grade TWK</label><input id="fsPg1" type="number" value="${v.pg_twk}"></div>
        <div><label>Passing Grade TIU</label><input id="fsPg2" type="number" value="${v.pg_tiu}"></div>
        <div><label>Passing Grade TKP</label><input id="fsPg3" type="number" value="${v.pg_tkp}"></div>
        <div></div>
        <label class="check full"><input id="fsShow" type="checkbox" ${v.show_result ? "checked" : ""}> Tampilkan nilai kepada peserta setelah ujian selesai</label>
        <label class="check full"><input id="fsShuf" type="checkbox" ${v.shuffle ? "checked" : ""}> Acak urutan soal & pilihan jawaban untuk tiap peserta</label>
      </div>`, [
      { text: "Batal" },
      { text: "Simpan", cls: "primary", fn: async () => {
        const row = {
          org_id: st.org,
          name: $("fsName").value.trim(),
          mode: $("fsMode").value,
          duration_min: Number($("fsDur").value),
          opens_at: $("fsOpen").value ? new Date($("fsOpen").value).toISOString() : null,
          closes_at: $("fsClose").value ? new Date($("fsClose").value).toISOString() : null,
          pg_twk: Number($("fsPg1").value), pg_tiu: Number($("fsPg2").value), pg_tkp: Number($("fsPg3").value),
          show_result: $("fsShow").checked, shuffle: $("fsShuf").checked
        };
        if (!row.name) throw new Error("Nama sesi wajib diisi.");
        const q = s ? sb.from("exam_sessions").update(row).eq("id", s.id) : sb.from("exam_sessions").insert(row).select().single();
        const { data, error } = await q;
        if (error) throw error;
        if (!s && data) st.sesiId = data.id;
        await reload();
        if (!s) setView("sesidetail");
        toast("Sesi disimpan.");
      } }
    ]);
    setTimeout(() => {
      const m = $("fsMode");
      if (m) m.onchange = () => ($("fsDur").value = MODE[m.value].menit);
    });
  }

  /* ---------- detail sesi ---------- */
  $("backSesi").onclick = () => setView("sesi");
  function renderSesiDetail() {
    const s = sesiById(st.sesiId);
    if (!s) return setView("sesi");
    const ps = st.parts.filter((p) => p.session_id === s.id);
    $("sdTitle").textContent = s.name;
    $("sdInfo").innerHTML = `
      <tr><td>Jenis Ujian</td><td>${MODE[s.mode].label} — ${s.duration_min} menit</td></tr>
      <tr><td>Jadwal</td><td>${s.opens_at || s.closes_at ? `${tgl(s.opens_at)} s.d. ${tgl(s.closes_at)}` : "Kapan saja"}</td></tr>
      <tr><td>Passing Grade</td><td>${SECS(s.mode).map((k) => `${k} ${s["pg_" + k.toLowerCase()]}`).join(" · ")}</td></tr>
      <tr><td>Link Ujian</td><td><span class="code small">${esc(new URL("index.html", location.href).href)}</span> <button class="link-btn" id="cpLink">Salin</button></td></tr>
      <tr><td>Peserta</td><td>${ps.length} terdaftar · ${ps.filter((p) => p.status === "selesai").length} selesai · ${ps.filter((p) => p.status === "mengerjakan").length} mengerjakan</td></tr>`;
    $("cpLink").onclick = () => { navigator.clipboard.writeText(new URL("index.html", location.href).href); toast("Link disalin."); };

    $("sdTable").innerHTML = `<tr><th>#</th><th>Kode Akses</th><th>Nama</th><th>No. Peserta</th><th>Status</th><th class="num">Total</th><th class="num">Pindah tab</th><th>Aksi</th></tr>` +
      (ps.length ? ps.map((p, i) => `<tr>
        <td>${i + 1}</td><td class="code">${p.code}</td><td>${esc(p.name || "—")}</td><td>${esc(p.number || "—")}</td>
        <td>${statusPill(p)}</td><td class="num">${p.total ?? "-"}</td>
        <td class="num ${p.tab_switches > 2 ? "warn-tab" : ""}">${p.tab_switches}</td>
        <td><button class="link-btn" data-copy="${p.code}">Salin link</button>
            ${p.status === "selesai" ? `<button class="link-btn" data-detail="${p.id}">Detail</button>` : ""}
            ${p.status !== "baru" ? `<button class="link-btn" data-reset="${p.id}">Ulangi</button>` : ""}
            <button class="link-btn red" data-del="${p.id}">Hapus</button></td></tr>`).join("")
        : `<tr><td colspan="8" class="empty">Belum ada peserta. Klik <b>+ Tambah Peserta</b>.</td></tr>`);

    const t = $("sdTable");
    t.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => { navigator.clipboard.writeText(pesertaLink(b.dataset.copy)); toast("Link peserta disalin."); }));
    t.querySelectorAll("[data-detail]").forEach((b) => (b.onclick = () => detailPeserta(b.dataset.detail)));
    t.querySelectorAll("[data-reset]").forEach((b) => (b.onclick = () => confirmBox("Ulangi Ujian?", "Jawaban dan nilai peserta ini akan dihapus dan peserta dapat mengerjakan ulang dengan kode yang sama.", async () => {
      const { error } = await sb.rpc("reset_peserta", { p_id: b.dataset.reset });
      if (error) throw error;
      await reload(); toast("Peserta direset.");
    }, "danger", "Ya, Ulangi")));
    t.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => confirmBox("Hapus Peserta?", "Data peserta dan hasil ujiannya akan dihapus permanen.", async () => {
      const { error } = await sb.from("participants").delete().eq("id", b.dataset.del);
      if (error) throw error;
      await reload(); toast("Peserta dihapus.");
    }, "danger", "Ya, Hapus")));
  }
  $("sdEdit").onclick = () => formSesi(sesiById(st.sesiId));
  $("sdDelete").onclick = () => confirmBox("Hapus Sesi?", "Sesi beserta <b>seluruh peserta dan hasil ujiannya</b> akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.", async () => {
    const { error } = await sb.from("exam_sessions").delete().eq("id", st.sesiId);
    if (error) throw error;
    await reload(); setView("sesi"); toast("Sesi dihapus.");
  }, "danger", "Ya, Hapus Permanen");
  $("sdExpire").onclick = async () => {
    loading(true);
    const { data, error } = await sb.rpc("finalisasi_kedaluwarsa", { p_session: st.sesiId });
    loading(false);
    if (error) return toast(errMsg(error));
    toast(`${data} peserta dinilai otomatis.`);
    reload();
  };
  $("sdExport").onclick = () => {
    const s = sesiById(st.sesiId);
    const rows = st.parts.filter((p) => p.session_id === s.id).map((p, i) => ({
      No: i + 1, "Kode Akses": p.code, Nama: p.name || "", "No. Peserta": p.number || "", "Link Ujian": pesertaLink(p.code), Status: p.status
    }));
    downloadXlsx(rows, `Kode Peserta - ${s.name}.xlsx`, "Kode Peserta");
  };
  $("sdAdd").onclick = () => {
    modal("Tambah Peserta", `
      <p class="small muted">Tulis satu peserta per baris dengan format <b>Nama;Nomor Peserta</b> (nomor boleh kosong). Kode akses dibuat otomatis.</p>
      <textarea id="addList" placeholder="Budi Santoso;2026-001&#10;Siti Aminah;2026-002&#10;Rahmat Hidayat"></textarea>
      <p class="small muted" style="margin:14px 0 4px">— atau buat kode kosong (peserta mengisi nama sendiri saat masuk):</p>
      <input id="addN" type="number" min="0" max="500" placeholder="Jumlah kode kosong, mis. 50">`, [
      { text: "Batal" },
      { text: "Buat Kode Akses", cls: "primary", fn: async () => {
        const lines = $("addList").value.split("\n").map((l) => l.trim()).filter(Boolean);
        let rows = lines.map((l) => { const [n, no] = l.split(/[;\t]/); return { session_id: st.sesiId, org_id: st.org, name: (n || "").trim() || null, number: (no || "").trim() || null }; });
        const n = Number($("addN").value || 0);
        for (let i = 0; i < n; i++) rows.push({ session_id: st.sesiId, org_id: st.org });
        if (!rows.length) throw new Error("Isi daftar peserta atau jumlah kode.");
        if (rows.length > 500) throw new Error("Maksimal 500 peserta sekali tambah.");
        const { error } = await sb.from("participants").insert(rows);
        if (error) throw error;
        await reload();
        toast(`${rows.length} kode akses dibuat.`);
      } }
    ]);
  };

  /* =========================================================
     HASIL PESERTA
     ========================================================= */
  ["fSesi", "fStatus", "fLulus"].forEach((id) => ($(id).onchange = renderHasil));
  $("fCari").oninput = () => renderHasil();

  function filteredParts() {
    const sid = $("fSesi").value, stt = $("fStatus").value, l = $("fLulus").value, q = $("fCari").value.trim().toLowerCase();
    let rows = st.parts.filter((p) =>
      (!sid || p.session_id === sid) && (!stt || p.status === stt) &&
      (l === "" || (p.status === "selesai" && String(Number(p.passed)) === l)) &&
      (!q || [p.name, p.number, p.code].some((x) => (x || "").toLowerCase().includes(q))));
    const { k, d } = st.sort;
    rows.sort((a, b) => {
      let x = a[k], y = b[k];
      if (k === "durasi") { x = durasi(a); y = durasi(b); }
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * d;
    });
    return rows;
  }

  function renderHasil() {
    const rows = filteredParts();
    const cols = [["rank", "#"], ["name", "Nama"], ["number", "No. Peserta"], ["session", "Sesi"], ["score_twk", "TWK"], ["score_tiu", "TIU"], ["score_tkp", "TKP"], ["total", "Total"], ["status", "Status"], ["durasi", "Durasi"], ["tab_switches", "Pindah tab"]];
    const numeric = ["score_twk", "score_tiu", "score_tkp", "total", "durasi", "tab_switches"];
    $("hasilTable").innerHTML = `<tr>${cols.map(([k, l]) => `<th ${k !== "rank" && k !== "session" ? `data-k="${k}"` : ""} class="${numeric.includes(k) ? "num" : ""}">${l}</th>`).join("")}</tr>` +
      (rows.length ? rows.map((p, i) => `<tr class="click" data-id="${p.id}">
        <td>${i + 1}</td><td><b>${esc(p.name || "—")}</b><br><span class="small muted code">${p.code}</span></td><td>${esc(p.number || "-")}</td>
        <td class="small">${esc((sesiById(p.session_id) || {}).name)}</td>
        <td class="num">${p.score_twk ?? "-"}</td><td class="num">${p.score_tiu ?? "-"}</td><td class="num">${p.score_tkp ?? "-"}</td>
        <td class="num"><b>${p.total ?? "-"}</b></td><td>${statusPill(p)}</td>
        <td class="num">${durasi(p) !== null ? durasi(p) + " mnt" : "-"}</td>
        <td class="num ${p.tab_switches > 2 ? "warn-tab" : ""}">${p.tab_switches}</td></tr>`).join("")
        : `<tr><td colspan="${cols.length}" class="empty">Tidak ada data.</td></tr>`);
    $("hasilTable").querySelectorAll("th[data-k]").forEach((th) => (th.onclick = () => {
      st.sort = { k: th.dataset.k, d: st.sort.k === th.dataset.k ? -st.sort.d : -1 };
      renderHasil();
    }));
    bindDetailRows("hasilTable");
  }
  function bindDetailRows(tableId) {
    $(tableId).querySelectorAll("tr[data-id]").forEach((tr) => (tr.onclick = () => detailPeserta(tr.dataset.id)));
  }

  $("btnExport").onclick = () => {
    const rows = filteredParts().map((p, i) => ({
      Peringkat: i + 1, Nama: p.name || "", "No. Peserta": p.number || "", "Kode Akses": p.code,
      Sesi: (sesiById(p.session_id) || {}).name, Status: p.status,
      TWK: p.score_twk, TIU: p.score_tiu, TKP: p.score_tkp, Total: p.total,
      Keterangan: p.status === "selesai" ? (p.passed ? "Memenuhi PG" : "Tidak Memenuhi PG") : "",
      Mulai: p.started_at ? tgl(p.started_at) : "", Selesai: p.finished_at ? tgl(p.finished_at) : "",
      "Durasi (menit)": durasi(p), "Pindah Tab": p.tab_switches
    }));
    const org = st.orgs.find((o) => o.id === st.org);
    downloadXlsx(rows, `Hasil Ujian - ${org ? org.name : ""} - ${new Date().toISOString().slice(0, 10)}.xlsx`, "Hasil");
  };

  function downloadXlsx(rows, filename, sheet) {
    if (!rows.length) return toast("Tidak ada data untuk diekspor.");
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map((k) => ({ wch: Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)) + 2 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet);
    XLSX.writeFile(wb, filename.replace(/[\\/:*?"<>|]/g, "-"));
  }

  /* ---------- detail jawaban peserta ---------- */
  async function detailPeserta(id) {
    loading(true);
    try {
      const { data: p, error } = await sb.from("participants").select("*").eq("id", id).single();
      if (error) throw error;
      const s = sesiById(p.session_id);
      let qmap = {};
      if (p.items && p.items.length) {
        const ids = p.items.map((it) => it.id);
        const { data: qs, error: e2 } = await sb.from("questions").select("id,section,question,options,answer,scores").in("id", ids);
        if (e2) throw e2;
        qs.forEach((q) => (qmap[q.id] = q));
      }
      let rows = "";
      (p.items || []).forEach((it, i) => {
        const q = qmap[it.id];
        if (!q) return;
        const ans = p.answers ? p.answers[i] : null;
        const orig = ans === null || ans === undefined ? null : it.perm[ans];
        let kunci, nilai, cls;
        if (q.section === "TKP") {
          kunci = `Skor 5: ${LETTER[it.perm.indexOf(q.scores.indexOf(5))]}`;
          nilai = orig === null ? 0 : q.scores[orig];
          cls = orig === null ? "new" : nilai >= 4 ? "ok" : "no";
        } else {
          kunci = LETTER[it.perm.indexOf(q.answer)];
          nilai = orig !== null && orig === q.answer ? 5 : 0;
          cls = orig === null ? "new" : nilai ? "ok" : "no";
        }
        rows += `<tr><td>${i + 1}</td><td>${q.section}</td><td class="small">${esc(q.question.length > 90 ? q.question.slice(0, 90) + "…" : q.question)}</td>
          <td><b>${ans === null || ans === undefined ? "—" : LETTER[ans]}</b></td><td>${kunci}</td><td><span class="pill ${cls}">${nilai}</span></td></tr>`;
      });
      modal(`Detail: ${p.name || p.code}`, `
        <table class="kv">
          <tr><td>Nama</td><td><b>${esc(p.name || "—")}</b> (${esc(p.number || "-")})</td></tr>
          <tr><td>Sesi</td><td>${esc(s ? s.name : "")}</td></tr>
          <tr><td>Waktu</td><td>${tgl(p.started_at)} → ${tgl(p.finished_at)} (${durasi(p) ?? "-"} menit)</td></tr>
          <tr><td>Nilai</td><td>TWK <b>${p.score_twk ?? "-"}</b> · TIU <b>${p.score_tiu ?? "-"}</b> · TKP <b>${p.score_tkp ?? "-"}</b> · Total <b>${p.total ?? "-"}</b> ${statusPill(p)}</td></tr>
          <tr><td>Pindah tab</td><td class="${p.tab_switches > 2 ? "warn-tab" : ""}">${p.tab_switches} kali</td></tr>
        </table>
        <div class="table-wrap" style="max-height:45vh;margin-top:12px"><table class="data">
          <tr><th>No</th><th>Subtes</th><th>Soal</th><th>Jawaban</th><th>Kunci</th><th>Nilai</th></tr>${rows || `<tr><td colspan="6" class="empty">Belum ada jawaban.</td></tr>`}
        </table></div>`, [{ text: "Tutup", cls: "primary" }]);
    } catch (e) {
      toast(errMsg(e));
    } finally { loading(false); }
  }

  /* =========================================================
     BANK SOAL
     ========================================================= */
  ["qfSec", "qfOwn"].forEach((id) => ($(id).onchange = drawSoal));
  $("qfCari").oninput = drawSoal;
  async function renderSoal() {
    loading(true);
    try {
      st.soal = await fetchAll(() => sb.from("questions").select("id,org_id,section,question,options,answer,scores,active")
        .or(`org_id.is.null,org_id.eq.${st.org}`).order("id"));
    } catch (e) { toast(errMsg(e)); } finally { loading(false); }
    const cnt = (own, sec) => st.soal.filter((q) => q.active && q.section === sec && (own ? q.org_id === st.org : q.org_id === null)).length;
    $("soalCards").innerHTML = ["TWK", "TIU", "TKP"].map((k) => {
      const o = cnt(true, k), g = cnt(false, k);
      return `<div class="stat-card"><div class="lbl">${k}</div><div class="val">${o || g}</div><div class="sub">${o ? "memakai bank klien" : "memakai bank umum"} (umum ${g} · klien ${o})</div></div>`;
    }).join("");
    $("soalInfo").innerHTML = `Ujian memakai <b>bank soal klien</b> bila klien memiliki soal aktif pada subtes tersebut; jika tidak, memakai <b>bank soal umum</b>. ` +
      (isOwner() ? "Sebagai pemilik, impor Anda masuk ke bank umum kecuali dipilih lain." : "Impor Excel akan menambah soal ke bank soal perusahaan Anda.");
    drawSoal();
  }
  function drawSoal() {
    const sec = $("qfSec").value, own = $("qfOwn").value, q = $("qfCari").value.trim().toLowerCase();
    const rows = st.soal.filter((x) => (!sec || x.section === sec) && (!own || (own === "umum" ? x.org_id === null : x.org_id === st.org)) && (!q || x.question.toLowerCase().includes(q)));
    const canEdit = (x) => isOwner() || x.org_id === st.org;
    $("soalTable").innerHTML = `<tr><th>ID</th><th>Subtes</th><th>Soal</th><th>Kunci / Skor</th><th>Bank</th><th>Status</th><th>Aksi</th></tr>` +
      (rows.length ? rows.slice(0, 300).map((x) => `<tr>
        <td>${x.id}</td><td>${x.section}</td><td class="small">${esc(x.question)}</td>
        <td class="small">${x.section === "TKP" ? x.scores.join("-") : LETTER[x.answer]}</td>
        <td>${x.org_id ? "Klien" : "Umum"}</td>
        <td>${x.active ? `<span class="pill ok">Aktif</span>` : `<span class="pill new">Nonaktif</span>`}</td>
        <td>${canEdit(x) ? `<button class="link-btn" data-tg="${x.id}">${x.active ? "Nonaktifkan" : "Aktifkan"}</button><button class="link-btn red" data-dq="${x.id}">Hapus</button>` : ""}</td></tr>`).join("") +
        (rows.length > 300 ? `<tr><td colspan="7" class="empty">Menampilkan 300 dari ${rows.length} soal. Gunakan filter.</td></tr>` : "")
        : `<tr><td colspan="7" class="empty">Tidak ada soal.</td></tr>`);
    $("soalTable").querySelectorAll("[data-tg]").forEach((b) => (b.onclick = async () => {
      const x = st.soal.find((s) => s.id === Number(b.dataset.tg));
      const { error } = await sb.from("questions").update({ active: !x.active }).eq("id", x.id);
      if (error) return toast(errMsg(error));
      renderSoal();
    }));
    $("soalTable").querySelectorAll("[data-dq]").forEach((b) => (b.onclick = () => confirmBox("Hapus Soal?", "Soal akan dihapus permanen. Hasil ujian lama yang memakai soal ini tidak dapat menampilkan detail soal tersebut lagi. Sebaiknya <b>nonaktifkan</b> saja bila soal sudah pernah dipakai.", async () => {
      const { error } = await sb.from("questions").delete().eq("id", Number(b.dataset.dq));
      if (error) throw error;
      renderSoal(); toast("Soal dihapus.");
    }, "danger", "Ya, Hapus")));
  }

  $("btnTemplate").onclick = () => downloadXlsx([
    { Subtes: "TWK", Soal: "Contoh soal TWK ...", A: "Opsi A", B: "Opsi B", C: "Opsi C", D: "Opsi D", E: "Opsi E", Kunci: "C", "Skor TKP (A,B,C,D,E)": "", Pembahasan: "Penjelasan jawaban" },
    { Subtes: "TIU", Soal: "2, 4, 8, 16, ...", A: "20", B: "24", C: "30", D: "32", E: "36", Kunci: "D", "Skor TKP (A,B,C,D,E)": "", Pembahasan: "Dikali 2" },
    { Subtes: "TKP", Soal: "Contoh situasi kerja ...", A: "Sikap 1", B: "Sikap 2", C: "Sikap 3", D: "Sikap 4", E: "Sikap 5", Kunci: "", "Skor TKP (A,B,C,D,E)": "1,5,3,2,4", Pembahasan: "" }
  ], "Template Bank Soal CAT.xlsx", "Soal");

  $("fileImport").onchange = async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const errs = [], rows = [];
      data.forEach((r, i) => {
        const line = i + 2;
        const sec = String(r.Subtes).trim().toUpperCase();
        const opts = ["A", "B", "C", "D", "E"].map((k) => String(r[k]).trim());
        if (!["TWK", "TIU", "TKP"].includes(sec)) return errs.push(`Baris ${line}: Subtes harus TWK/TIU/TKP`);
        if (!String(r.Soal).trim()) return errs.push(`Baris ${line}: Soal kosong`);
        if (opts.some((o) => !o)) return errs.push(`Baris ${line}: opsi A–E wajib diisi`);
        const row = { section: sec, question: String(r.Soal).trim(), options: opts, explanation: String(r.Pembahasan || "").trim() || null };
        if (sec === "TKP") {
          const sc = String(r["Skor TKP (A,B,C,D,E)"]).split(/[,;\s-]+/).filter(Boolean).map(Number);
          if (sc.length !== 5 || sc.some((x) => !(x >= 1 && x <= 5))) return errs.push(`Baris ${line}: Skor TKP harus 5 angka 1–5`);
          row.scores = sc;
        } else {
          const k = LETTER.indexOf(String(r.Kunci).trim().toUpperCase());
          if (k < 0) return errs.push(`Baris ${line}: Kunci harus A–E`);
          row.answer = k;
        }
        rows.push(row);
      });
      if (!rows.length) return modal("Impor Gagal", `<p>Tidak ada soal valid.</p><p class="small">${errs.slice(0, 15).map(esc).join("<br>")}</p>`, [{ text: "Tutup" }]);
      const target = isOwner()
        ? `<label>Simpan ke</label><select id="impTarget"><option value="umum">Bank soal umum (semua klien)</option><option value="org">Bank soal klien: ${esc((st.orgs.find((o) => o.id === st.org) || {}).name)}</option></select>`
        : "";
      modal("Impor Bank Soal", `<p><b>${rows.length}</b> soal siap diimpor (${["TWK", "TIU", "TKP"].map((k) => `${k}: ${rows.filter((r) => r.section === k).length}`).join(", ")}).</p>
        ${errs.length ? `<p class="small" style="color:var(--red)">${errs.length} baris dilewati:<br>${errs.slice(0, 10).map(esc).join("<br>")}</p>` : ""}${target}`, [
        { text: "Batal" },
        { text: "Impor", cls: "primary", fn: async () => {
          const org = isOwner() && $("impTarget").value === "umum" ? null : st.org;
          const { error } = await sb.from("questions").insert(rows.map((r) => ({ ...r, org_id: org })));
          if (error) throw error;
          toast(`${rows.length} soal diimpor.`);
          renderSoal();
        } }
      ]);
    } catch (e) {
      toast("Gagal membaca file: " + errMsg(e));
    }
  };

  /* =========================================================
     KLIEN & ADMIN (khusus pemilik)
     ========================================================= */
  async function renderKlien() {
    if (!isOwner()) return setView("ringkasan");
    loading(true);
    try {
      const counts = {};
      await Promise.all(st.orgs.map(async (o) => {
        const { count } = await sb.from("participants").select("id", { count: "exact", head: true }).eq("org_id", o.id);
        counts[o.id] = count || 0;
      }));
      $("orgTable").innerHTML = `<tr><th>Nama Klien</th><th class="num">Kuota terpakai</th><th>Logo</th><th>Dibuat</th><th>Aksi</th></tr>` +
        (st.orgs.length ? st.orgs.map((o) => `<tr><td><b>${esc(o.name)}</b></td>
          <td class="num">${counts[o.id]} / ${o.quota}</td>
          <td>${o.logo_url ? `<img src="${esc(o.logo_url)}" style="height:26px">` : "-"}</td><td>${tgl(o.created_at)}</td>
          <td><button class="link-btn" data-eo="${o.id}">Ubah</button><button class="link-btn red" data-do="${o.id}">Hapus</button></td></tr>`).join("")
          : `<tr><td colspan="5" class="empty">Belum ada klien.</td></tr>`);
      $("orgTable").querySelectorAll("[data-eo]").forEach((b) => (b.onclick = () => formOrg(st.orgs.find((o) => o.id === b.dataset.eo))));
      $("orgTable").querySelectorAll("[data-do]").forEach((b) => (b.onclick = () => {
        const o = st.orgs.find((x) => x.id === b.dataset.do);
        confirmBox("Hapus Klien?", `Klien <b>${esc(o.name)}</b> beserta seluruh sesi, peserta, hasil ujian, bank soal, dan akun adminnya akan dihapus permanen.`, async () => {
          const { error } = await sb.from("organizations").delete().eq("id", o.id);
          if (error) throw error;
          if (st.org === o.id) st.org = null;
          await loadOrgs(); await reload(); setView("klien"); toast("Klien dihapus.");
        }, "danger", "Ya, Hapus Permanen");
      }));

      const { data: admins, error } = await sb.from("admins").select("*").order("created_at");
      if (error) throw error;
      $("adminTable").innerHTML = `<tr><th>Nama</th><th>Email</th><th>Peran</th><th>Klien</th><th>Aksi</th></tr>` +
        admins.map((a) => `<tr><td>${esc(a.name || "-")}</td><td>${esc(a.email || "-")}</td><td>${a.role === "owner" ? "Pemilik" : "Admin"}</td>
          <td>${esc((st.orgs.find((o) => o.id === a.org_id) || {}).name || "Semua")}</td>
          <td>${a.role !== "owner" ? `<button class="link-btn red" data-da="${a.user_id}">Cabut akses</button>` : ""}</td></tr>`).join("");
      $("adminTable").querySelectorAll("[data-da]").forEach((b) => (b.onclick = () => confirmBox("Cabut Akses Admin?", "Akun ini tidak akan bisa membuka dashboard lagi.", async () => {
        const { error } = await sb.from("admins").delete().eq("user_id", b.dataset.da);
        if (error) throw error;
        renderKlien(); toast("Akses dicabut.");
      }, "danger", "Ya, Cabut")));
    } catch (e) { toast(errMsg(e)); } finally { loading(false); }
  }

  $("btnNewOrg").onclick = () => formOrg();
  function formOrg(o) {
    const v = o || { name: "", quota: 100, logo_url: "" };
    modal(o ? "Ubah Klien" : "Klien Baru", `
      <label>Nama Perusahaan / Instansi</label><input id="foName" type="text" value="${esc(v.name)}">
      <label>Kuota Peserta</label><input id="foQuota" type="number" min="1" value="${v.quota}">
      <label>URL Logo (opsional)</label><input id="foLogo" type="text" value="${esc(v.logo_url || "")}" placeholder="https://…/logo.png">`, [
      { text: "Batal" },
      { text: "Simpan", cls: "primary", fn: async () => {
        const row = { name: $("foName").value.trim(), quota: Number($("foQuota").value) || 100, logo_url: $("foLogo").value.trim() || null };
        if (!row.name) throw new Error("Nama klien wajib diisi.");
        const q = o ? sb.from("organizations").update(row).eq("id", o.id) : sb.from("organizations").insert(row).select().single();
        const { data, error } = await q;
        if (error) throw error;
        if (!o && data) { st.org = data.id; localStorage.setItem("cat_admin_org", data.id); }
        await loadOrgs(); await reload(); setView("klien");
        toast("Klien disimpan.");
      } }
    ]);
  }

  $("btnNewAdmin").onclick = () => {
    if (!st.orgs.length) return toast("Buat klien terlebih dahulu.");
    modal("Tambah Admin / Pimpinan Klien", `
      <label>Klien</label><select id="faOrg">${st.orgs.map((o) => `<option value="${o.id}" ${o.id === st.org ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select>
      <label>Nama</label><input id="faName" type="text">
      <label>Email</label><input id="faEmail" type="email">
      <label>Kata Sandi Awal (min. 8 karakter)</label><input id="faPass" type="password" autocomplete="new-password">
      <p class="small muted">Jika email sudah terdaftar, kata sandi diabaikan dan akun langsung diberi akses ke klien terpilih.</p>`, [
      { text: "Batal" },
      { text: "Tambah", cls: "primary", fn: async () => {
        const email = $("faEmail").value.trim(), pass = $("faPass").value, name = $("faName").value.trim(), org = $("faOrg").value;
        if (!email) throw new Error("Email wajib diisi.");
        let r = await sb.rpc("assign_admin", { p_email: email, p_org: org, p_name: name || null });
        if (r.error && /belum terdaftar/.test(r.error.message)) {
          if (pass.length < 8) throw new Error("Kata sandi minimal 8 karakter.");
          const tmp = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, storageKey: "cat-tmp-signup" } });
          const su = await tmp.auth.signUp({ email, password: pass });
          if (su.error) throw su.error;
          r = await sb.rpc("assign_admin", { p_email: email, p_org: org, p_name: name || null });
        }
        if (r.error) throw r.error;
        renderKlien();
        toast("Admin ditambahkan.");
      } }
    ]);
  };

  /* ---------- mulai ---------- */
  if (cfg.SUPABASE_URL.includes("ISI-PROJECT")) {
    $("loginErr").textContent = "Aplikasi belum dikonfigurasi: isi SUPABASE_URL dan SUPABASE_KEY di config.js.";
  } else if (/type=recovery/.test(location.hash)) {
    showReset(); // datang dari link email "lupa kata sandi"
  } else {
    boot();
  }
})();
