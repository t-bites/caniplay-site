/* CanIPlay — 可搜索下拉硬件选择 + 兼容判定（GPU/CPU/RAM 三维度） */
(() => {
  let HW = { gpus: [], cpus: [] };
  // ===== 硬件推荐目录（8/13：低/中/高 × CPU/主板/GPU + 整机，affiliate 优先排序） =====
  const HW_CATALOG = {
    gpu: [
      { name: "NVIDIA GTX 1650", tier: "low", passmark: 6400, price: 149, affiliate_priority: 3, query: "GTX 1650 graphics card" },
      { name: "AMD RX 6500 XT", tier: "low", passmark: 5700, price: 139, affiliate_priority: 4, query: "RX 6500 XT graphics card" },
      { name: "NVIDIA RTX 3060", tier: "mid", passmark: 12100, price: 299, affiliate_priority: 1, query: "RTX 3060 graphics card" },
      { name: "AMD RX 6600", tier: "mid", passmark: 11800, price: 219, affiliate_priority: 2, query: "RX 6600 graphics card" },
      { name: "NVIDIA RTX 4070", tier: "high", passmark: 24700, price: 549, affiliate_priority: 5, query: "RTX 4070 graphics card" },
      { name: "AMD RX 7800 XT", tier: "high", passmark: 23800, price: 479, affiliate_priority: 6, query: "RX 7800 XT graphics card" },
    ],
    cpu: [
      { name: "Intel Core i3-12100F", tier: "low", passmark: 12500, price: 95, affiliate_priority: 3, socket: "lga1700", query: "i3-12100F processor" },
      { name: "AMD Ryzen 5 5500", tier: "low", passmark: 15100, price: 99, affiliate_priority: 4, socket: "am4", query: "Ryzen 5 5500 processor" },
      { name: "Intel Core i5-12400F", tier: "mid", passmark: 17800, price: 149, affiliate_priority: 1, socket: "lga1700", query: "i5-12400F processor" },
      { name: "AMD Ryzen 5 5600", tier: "mid", passmark: 18800, price: 139, affiliate_priority: 2, socket: "am4", query: "Ryzen 5 5600 processor" },
      { name: "Intel Core i5-13600K", tier: "high", passmark: 31500, price: 289, affiliate_priority: 5, socket: "lga1700", query: "i5-13600K processor" },
      { name: "AMD Ryzen 7 7800X3D", tier: "high", passmark: 30500, price: 399, affiliate_priority: 6, socket: "am5", query: "Ryzen 7 7800X3D processor" },
    ],
    mobo: [
      { name: "B660M (LGA1700)", tier: "low", socket: "lga1700", price: 109, affiliate_priority: 2, query: "B660M LGA1700 motherboard" },
      { name: "B760 (LGA1700)", tier: "mid", socket: "lga1700", price: 149, affiliate_priority: 1, query: "B760 LGA1700 motherboard" },
      { name: "Z790 (LGA1700)", tier: "high", socket: "lga1700", price: 239, affiliate_priority: 3, query: "Z790 LGA1700 motherboard" },
      { name: "A520M (AM4)", tier: "low", socket: "am4", price: 79, affiliate_priority: 2, query: "A520M AM4 motherboard" },
      { name: "B550 (AM4)", tier: "mid", socket: "am4", price: 119, affiliate_priority: 1, query: "B550 AM4 motherboard" },
      { name: "B650 (AM5)", tier: "mid", socket: "am5", price: 169, affiliate_priority: 1, query: "B650 AM5 motherboard" },
      { name: "X670E (AM5)", tier: "high", socket: "am5", price: 289, affiliate_priority: 3, query: "X670E AM5 motherboard" },
    ],
  };
  const AMZ = {
    tag: "caniplay0b-20",  // 已注册 TAG（generate_site.py 同步）
    base: "https://www.amazon.com/s",
    link(query) { return `${this.base}?k=${encodeURIComponent(query)}&tag=${this.tag}`; }
  };
  // 路径兼容：游戏页在 /game/ 子目录，data.json 在上级 assets/
  const isSub = window.location.pathname.indexOf('/game/') !== -1;
  const dataPath = (isSub ? '../' : '') + 'assets/data.json';
  fetch(dataPath).then(r => r.json()).then(d => {
    HW = d;
    window.__HW = HW; // 调试钩子
    // 等待 HW 数据的回调（⌘K 命令面板等异步组件）
    (window.__HW_WAITERS || []).forEach(fn => { try { fn(); } catch (e) {} });
    // 数据就绪后刷新下拉（用户可能已输入）
    document.querySelectorAll('.combo-wrap input').forEach(inp => {
      if (inp.value.trim()) inp.dispatchEvent(new Event('input'));
    });
  }).catch(e => { window.__HW_ERR = String(e); });

  const T = {
    en: {
      great: "🟢 Runs smoothly — above recommended specs",
      ok: "🟢 Playable — meets minimum requirements",
      weakRam: "🟡 Barely playable — RAM below minimum",
      weakCpu: "🟡 Barely playable — CPU below minimum",
      noGpu: "🔴 Can't run — GPU below minimum",
      noBoth: "🔴 Can't run — GPU & CPU below minimum",
      unknown: "Hardware not found. Pick from the dropdown or try a more specific model.",
      suggest: "Upgrade suggestions",
      gpuUp: "Upgrade your GPU to around: ",
      cpuUp: "Upgrade your CPU to around: ",
      ramUp: "Upgrade your RAM to at least: ",
      noSuggest: "Your hardware meets requirements. Check 'Recommended' spec for a smoother experience."
    }
  };
  const t = T.en;

  // ---- 硬件精确匹配（2026-08-10 修复：低端卡被高估 bug）----
  // 原实现 `includes + 取 mark 最高` 导致 "RTX 3060" 匹配到 "GeForce RTX 3060 Ti"
  // （mark 更高）→ 低端卡被高估。现按精确度分级：
  //   score 3 = 完全相等（含去空格连字符）
  //   score 2 = 查询是名称的结尾 token（如 "3060" → "GeForce RTX 3060" ✅ / "RTX 3060 Ti" ❌）
  //   score 1 = 查询在名称中间（后面还有 token，如 "3060" → "GeForce RTX 3060 Ti"）
  //   score 0 = 宽松子串 / token 序列（兜底，防漏匹配）
  // 同级取 mark 最高；高级别永远优先于低级别。
  function hwScore(n, q) {
    if (n === q) return 3;
    const n2 = n.replace(/[^a-z0-9]+/g, '');
    const q2 = q.replace(/[^a-z0-9]+/g, '');
    if (!q2) return -1;
    if (n2 === q2) return 3;
    if (n2.endsWith(q2)) return 2;  // 结尾精确（最强防高估）
    if (n.includes(q) || n2.includes(q2)) return 1;
    // 宽松兜底：查询 token 按序出现（如 "intel hd 4000" → "Intel HD Graphics 4000"）
    const qw = q.split(/[^a-z0-9]+/).filter(Boolean);
    const nw = n.split(/[^a-z0-9]+/).filter(Boolean);
    if (qw.length > 1) {
      let i = 0;
      for (const w of nw) if (w === qw[i]) i++;
      if (i === qw.length) return 0;
    }
    return -1;
  }
  function matchHw(list, query) {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    let best = null, bestScore = -1;
    for (const item of list) {
      const s = hwScore(item.n.toLowerCase(), q);
      if (s < 0) continue;  // 2026-08-13 修复：无匹配条目必须跳过，否则 s=-1 与 bestScore=-1 相等且 m 比较恒真 → 返回列表首个（mark 最高）→ 乱输入被误判 Runs smoothly
      if (s > bestScore || (s === bestScore && item.m > (best ? best.m : -1))) {
        bestScore = s; best = item;
      }
    }
    return best;
  }
  // 暴露给对比弹层等其它模块复用（#26 My PC 对比行用同一判定引擎，保证口径一致）
  window.matchHw = matchHw;

  // ---- #36 判定结果分享卡：复制文本摘要（CYRI 式，2026-08-14）----
  // 模块级剪贴板/Toast 助手（判定框底部 Copy result 按钮复用，与分享行独立）：
  // 分享行内闭包版 toast/fallbackCopy 保持原样，两者共用 .share-toast 元素互不冲突
  function copyText(text, done) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopyText(text, done));
    } else {
      fallbackCopyText(text, done);
    }
  }
  function fallbackCopyText(text, done) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (e) { done(); }
  }
  function showToast(msg) {
    let t = document.querySelector('.share-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'share-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tm);
    t._tm = setTimeout(() => t.classList.remove('show'), 1800);
  }
  // 提取纯游戏名（与分享行同逻辑：剔除 h1 内 platform/sale/free 徽章）
  function pageGameName() {
    const h1 = document.querySelector('.game-page .game-head h1');
    if (!h1) return document.title.replace(/\s*[|—-].*$/, '').trim();
    const clone = h1.cloneNode(true);
    clone.querySelectorAll('.platform-badge, .sale-badge, .free-badge').forEach(el => el.remove());
    return (clone.textContent || '').replace(/\s{2,}/g, ' ').trim() || document.title;
  }

  // ---- 下拉过滤（输入时显示匹配项，取 mark 高者优先；支持键盘导航）----
  // list 参数改为 getter：HW 数据是异步加载后整体替换的，直接传数组会捕获到空数组导致下拉永空
  function setupCombo(inputId, listId, getList) {
    const input = document.getElementById(inputId);
    const box = document.getElementById(listId);
    if (!input || !box) return;
    let active = -1;
    const render = (items) => {
      box.innerHTML = '';
      active = -1;
      items.slice(0, 8).forEach((it, i) => {
        const div = document.createElement('div');
        div.className = 'combo-item';
        div.textContent = it.n;
        div.addEventListener('click', () => {
          input.value = it.n;
          box.innerHTML = '';
          box.style.display = 'none';
          input.dispatchEvent(new Event('change'));  // Game Gear 页监听 change 显示规格
        });
        box.appendChild(div);
      });
      box.style.display = items.length ? 'block' : 'none';
    };
    const filter = (q) => {
      const list = getList() || [];
      if (!q) { box.style.display = 'none'; return; }
      const q2 = q.replace(/[^a-z0-9]+/g, '');
      const hits = [];
      for (const it of list) {
        const n = it.n.toLowerCase();
        if (n.includes(q) || n.replace(/[^a-z0-9]+/g, '').includes(q2)) {
          hits.push(it);
          if (hits.length >= 60) break;
        }
      }
      // 精确度优先排序（与判定 matchHw 同分级），同级按 mark 降序
      render(hits.sort((a, b) => {
        const sa = hwScore(a.n.toLowerCase(), q), sb = hwScore(b.n.toLowerCase(), q);
        return (sb - sa) || (b.m - a.m);
      }));
    };
    const move = (dir) => {
      const items = box.querySelectorAll('.combo-item');
      if (!items.length) return;
      active = (active + dir + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle('combo-active', i === active));
      const cur = items[active];
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    };
    const selectActive = () => {
      const items = box.querySelectorAll('.combo-item');
      if (active >= 0 && items[active]) items[active].click();
    };
    input.addEventListener('input', () => filter(input.value.trim().toLowerCase()));
    input.addEventListener('focus', () => {
      const q = input.value.trim().toLowerCase();
      if (q) { filter(q); return; }
      // 空值聚焦：直接显示 Top 硬件列表（下拉选择）
      const list = getList() || [];
      render([...list].sort((a, b) => b.m - a.m).slice(0, 8));
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); selectActive(); }
      else if (e.key === 'Escape') { box.style.display = 'none'; active = -1; }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.combo-wrap')) box.style.display = 'none';
    });
  }

  // ---- 游戏搜索（联想下拉，点击/回车跳转详情页）----
  function setupGameCombo() {
    const input = document.getElementById('game-input');
    const box = document.getElementById('game-combo');
    if (!input || !box) return;
    // 详情页在 /game/ 子目录，跳转路径要加 ../ 前缀
    const base = window.location.pathname.indexOf('/game/') !== -1 ? '../' : '';
    let active = -1;
    const render = (items) => {
      box.innerHTML = '';
      active = -1;
      items.slice(0, 8).forEach((it, i) => {
        const div = document.createElement('div');
        div.className = 'combo-item';
        div.textContent = it.n;
        div.addEventListener('click', () => {
          window.location.href = base + 'game/' + it.u + '.html';
        });
        box.appendChild(div);
      });
      box.style.display = items.length ? 'block' : 'none';
    };
    const filter = (q) => {
      if (!q) { box.style.display = 'none'; return; }
      const hits = (HW.games || []).filter(g => {
        const n = g.n.toLowerCase();
        if (n.includes(q)) return true;
        if ((g.g || []).some(gen => gen.toLowerCase().includes(q))) return true;
        return (g.a || []).some(al => al.includes(q) || q.includes(al));
      }).slice(0, 30);
      render(hits);
    };
    const move = (dir) => {
      const items = box.querySelectorAll('.combo-item');
      if (!items.length) return;
      active = (active + dir + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle('combo-active', i === active));
      const cur = items[active];
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    };
    const selectActive = () => {
      const items = box.querySelectorAll('.combo-item');
      if (active >= 0 && items[active]) items[active].click();
    };
    input.addEventListener('input', () => filter(input.value.trim().toLowerCase()));
    input.addEventListener('focus', () => {
      if (input.value.trim()) filter(input.value.trim().toLowerCase());
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); selectActive(); }
      else if (e.key === 'Escape') { box.style.display = 'none'; active = -1; }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.combo-wrap')) box.style.display = 'none';
    });
  }

  // ---- 游戏库页搜索联想（games.html：分片数据加载完成后绑定）----
  // 复用全量数组：联想跳详情页，输入过滤由页面级逻辑继续处理
  function setupLibraryCombo() {
    const input = document.getElementById('game-search');
    const box = document.getElementById('game-search-combo');
    if (!input || !box) return;
    let active = -1;
    const render = (items) => {
      box.innerHTML = '';
      active = -1;
      items.slice(0, 8).forEach((it, i) => {
        const div = document.createElement('div');
        div.className = 'combo-item';
        div.textContent = it.n;
        const meta = [];
        if (it.y) meta.push(it.y);
        if (it.g && it.g.length) meta.push(it.g.slice(0, 2).join(', '));
        if (meta.length) {
          const sub = document.createElement('span');
          sub.className = 'combo-meta';
          sub.textContent = ' · ' + meta.join(' · ');
          div.appendChild(sub);
        }
        div.addEventListener('click', () => {
          window.location.href = 'game/' + (it.u || it.a) + '.html';
        });
        box.appendChild(div);
      });
      box.style.display = items.length ? 'block' : 'none';
    };
    const filter = (q) => {
      if (!q) { box.style.display = 'none'; return; }
      const all = window.__ALL_GAMES || [];
      const q2 = q.replace(/[\s\-]+/g, '');
      const hits = [];
      for (const g of all) {
        const n = g.n.toLowerCase();
        // 名称匹配 或 类型(genre)关键词匹配（如 "rpg"/"action"）
        const genreHit = (g.g || []).some(gen => gen.toLowerCase().includes(q));
        if (n.includes(q) || n.replace(/[\s\-]+/g, '').includes(q2) || genreHit) {
          hits.push(g);
          if (hits.length >= 30) break;
        }
      }
      render(hits);
    };
    const move = (dir) => {
      const items = box.querySelectorAll('.combo-item');
      if (!items.length) return;
      active = (active + dir + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle('combo-active', i === active));
      const cur = items[active];
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    };
    const selectActive = () => {
      const items = box.querySelectorAll('.combo-item');
      if (active >= 0 && items[active]) items[active].click();
    };
    input.addEventListener('input', () => filter(input.value.trim().toLowerCase()));
    input.addEventListener('focus', () => {
      if (input.value.trim()) filter(input.value.trim().toLowerCase());
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); selectActive(); }
      else if (e.key === 'Escape') { box.style.display = 'none'; active = -1; }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.combo-wrap')) box.style.display = 'none';
    });
  }

  // ---- ⌘K 命令面板（#17，借鉴 Linear/Steam 快速搜索）：全站 Ctrl/Cmd+K 搜游戏/硬件 ----
  // 纯 JS 注入（导航提示按钮 + 遮罩弹窗），免全量重建；数据来自 data.json（games/gpus/cpus）
  function setupKbdPalette() {
    const base = isSub ? '../' : '';
    if (document.getElementById('kbd-overlay')) return;
    const nav = document.querySelector('.nav');
    // 导航内提示按钮（发现入口）
    const hint = document.createElement('button');
    hint.className = 'kbd-hint';
    hint.type = 'button';
    hint.title = 'Search games & hardware (Ctrl+K)';
    hint.innerHTML = '🔍 <span class="kbd-hint-label">Search</span><kbd>Ctrl K</kbd>';
    // 遮罩 + 弹窗
    const ov = document.createElement('div');
    ov.className = 'kbd-overlay';
    ov.id = 'kbd-overlay';
    ov.style.display = 'none';
    ov.innerHTML = `
    <div class="kbd-modal" role="dialog" aria-label="Quick search">
      <div class="kbd-input-row">
        <span class="kbd-search-icon">🔍</span>
        <input class="kbd-input" id="kbd-input" type="text" placeholder="Search games — or GPU/CPU models..." autocomplete="off" spellcheck="false">
        <button class="kbd-esc" id="kbd-esc" type="button" aria-label="Close">esc</button>
      </div>
      <div class="kbd-results" id="kbd-results"></div>
      <div class="kbd-foot"><span id="kbd-count"></span><span>↑↓ navigate · ↵ open · esc close</span></div>
    </div>`;
    const input = ov.querySelector('.kbd-input');
    const results = ov.querySelector('.kbd-results');
    const countEl = ov.querySelector('#kbd-count');
    let activeIdx = -1, items = [];

    const openPalette = () => {
      ov.style.display = 'flex';
      input.value = '';
      render('');
      setTimeout(() => input.focus(), 30);
    };
    const closePalette = () => {
      ov.style.display = 'none';
      activeIdx = -1;
    };
    const setActive = (i) => {
      activeIdx = i;
      items.forEach((x, k) => x.row.classList.toggle('active', k === i));
      if (i >= 0 && items[i]) items[i].row.scrollIntoView({ block: 'nearest' });
    };
    const go = (type, it) => {
      closePalette();
      if (type === 'game') {
        if (!it.u) return;
        window.location.href = base + 'game/' + it.u + '.html';
      } else {
        // 硬件 → Game Gear 页并预填（该页支持 ?gpu=/?cpu= 深链）
        const qp = new URLSearchParams();
        qp.set(type, it.n);
        window.location.href = base + 'game-gear.html?' + qp.toString();
      }
    };
    const render = (q) => {
      if (!HW.games) {  // 数据未就绪
        results.innerHTML = '<div class="kbd-empty">Loading hardware database…</div>';
        return;
      }
      const qq = q.trim().toLowerCase();
      const games = [], gpus = [], cpus = [];
      if (qq) {
        // 游戏：按相关度打分排序（精确=4 / 前缀=3 / 包含=2 / 别名=1），避免原始顺序截断漏掉热门精确项
        const q2 = qq.replace(/[^a-z0-9]+/g, '');
        const scored = [];
        for (const g of HW.games) {
          const n = g.n.toLowerCase();
          let s = -1;
          if (n === qq) s = 4;
          else if (n.startsWith(qq)) s = 3;
          else if (n.includes(qq) || n.replace(/[^a-z0-9]+/g, '').includes(q2)) s = 2;
          else if ((g.a || []).some(al => al.toLowerCase().includes(qq) || qq.includes(al.toLowerCase()))) s = 1;
          if (s > 0) scored.push([g, s]);
        }
        scored.sort((a, b) => b[1] - a[1]);
        for (const [g] of scored.slice(0, 8)) games.push(g);
        // 硬件：首尾精确优先（"3060" → GeForce RTX 3060 先于 3060 Ti）
        const hwHits = (list) => {
          const out = [];
          for (const it of list) {
            const n = it.n.toLowerCase();
            if (!n.includes(qq)) continue;
            out.push([it, (n.startsWith(qq) || n.endsWith(qq)) ? 2 : 1]);
          }
          out.sort((a, b) => b[1] - a[1]);
          return out.slice(0, 4).map(x => x[0]);
        };
        gpus.push(...hwHits(HW.gpus));
        cpus.push(...hwHits(HW.cpus));
      } else {
        // 空查询：展示库内前 6 款（入口引导，避免空白弹窗）
        for (let i = 0; i < Math.min(6, HW.games.length); i++) games.push(HW.games[i]);
      }
      results.innerHTML = '';
      items = [];
      const addGroup = (label, list, type) => {
        if (!list.length) return;
        const h = document.createElement('div');
        h.className = 'kbd-group-label';
        h.textContent = label;
        results.appendChild(h);
        list.forEach((it) => {
          const row = document.createElement('div');
          row.className = 'kbd-item';
          row.setAttribute('role', 'option');
          const name = document.createElement('span');
          name.className = 'kbd-item-name';
          name.textContent = it.n;
          row.appendChild(name);
          const meta = document.createElement('span');
          meta.className = 'kbd-item-meta';
          meta.textContent = type === 'game' ? 'Game'
            : (type === 'gpu' ? 'GPU · ' + it.m.toLocaleString() + ' marks' : 'CPU · ' + it.m.toLocaleString() + ' marks');
          row.appendChild(meta);
          row.addEventListener('click', () => go(type, it));
          row.addEventListener('mousemove', () => setActive(items.length));
          results.appendChild(row);
          items.push({ type, it, row });
        });
      };
      addGroup('🎮 Games', games, 'game');
      addGroup('🖥️ GPUs', gpus, 'gpu');
      addGroup('🧠 CPUs', cpus, 'cpu');
      if (!items.length) {
        results.innerHTML = '<div class="kbd-empty">No matches for “' + qq + '” — try a shorter name.</div>';
      }
      countEl.textContent = qq
        ? items.length + ' result' + (items.length === 1 ? '' : 's')
        : HW.games.length.toLocaleString() + ' games indexed';
      setActive(-1);
    };
    // 数据就绪回调：更新占位符 + 刷新打开中的面板（已就绪则立即执行，防竞态）
    const onHWReady = () => {
      if (HW.games && !input.dataset.counted) {
        input.dataset.counted = '1';
        input.placeholder = 'Search ' + HW.games.length.toLocaleString() + ' games — or GPU/CPU models...';
      }
      if (ov.style.display !== 'none') render(input.value);
    };
    if (HW.games) onHWReady();
    else (window.__HW_WAITERS = window.__HW_WAITERS || []).push(onHWReady);
    // 输入：防抖搜索
    let kbdTimer = null;
    input.addEventListener('input', () => {
      clearTimeout(kbdTimer);
      kbdTimer = setTimeout(() => render(input.value), 120);
    });
    // 键盘导航：↑↓ 移动 / Enter 打开 / Esc 关闭
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = items.length;
        if (!n) return;
        const next = e.key === 'ArrowDown'
          ? (activeIdx + 1) % n
          : (activeIdx <= 0 ? n - 1 : activeIdx - 1);
        setActive(next);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items.length) go(items[activeIdx >= 0 ? activeIdx : 0].type, items[activeIdx >= 0 ? activeIdx : 0].it);
      } else if (e.key === 'Escape') {
        closePalette();
      }
    });
    // 全局快捷键：Ctrl/Cmd+K 开关；非输入态 "/" 打开（Steam 式）
    document.addEventListener('keydown', (e) => {
      const tag = (e.target || {}).tagName || '';
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (ov.style.display === 'none') openPalette(); else closePalette();
        return;
      }
      if (!inField && e.key === '/' && ov.style.display === 'none') {
        e.preventDefault();
        openPalette();
      }
    });
    // 点击遮罩空白 / esc 按钮关闭
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) closePalette(); });
    ov.querySelector('#kbd-esc').addEventListener('click', closePalette);
    if (hint) hint.addEventListener('click', () => { if (ov.style.display === 'none') openPalette(); });
    if (nav) nav.appendChild(hint);
    document.body.appendChild(ov);
  }

  // ---- 判定（GPU/CPU/RAM）----
  // #6 MIN/REC 折叠切换（渐进披露，借鉴 CYRI）：默认 REC 参考，可切 MIN 参考
  let VIEW_MODE = 'rec';

  // #26 OS 兼容行（Steam 式）：检测用户 OS vs 游戏最低 OS（生成器内嵌 mof/mos，纯前端零请求）
  function detectOS() {
    const ua = navigator.userAgent || '';
    const uad = navigator.userAgentData;
    if (/Windows NT (\d+\.?\d*)/i.test(ua)) {
      let nt = parseFloat(RegExp.$1);
      // Chromium UA 恒报 NT 10.0：platformVersion ≥13 才是 Win11（13=11，14+=未来）
      if (uad && uad.platform === 'Windows' && uad.platformVersion) {
        const pv = parseInt(String(uad.platformVersion).split('.')[0], 10);
        if (pv >= 13) nt = 11;
      }
      // NT 版本号 → 显示版本号（5.1=XP, 6.0=Vista, 6.1=7, 6.2=8, 6.3=8.1, 10=10/11）
      const ver = nt >= 11 ? 11 : nt >= 10 ? 10 : nt >= 6.3 ? 8.1 : nt >= 6.2 ? 8
                : nt >= 6.1 ? 7 : nt >= 6.0 ? 6 : nt >= 5.1 ? 5.1 : 0;
      return { fam: 'win', ver, name: 'Windows ' + winVerName(ver) };
    }
    if (/Mac OS X (\d+[._]\d+)/i.test(ua)) {
      return { fam: 'mac', ver: parseFloat(RegExp.$1.replace('_', '.')), name: 'macOS' };
    }
    if (/CrOS|Android|Linux|X11/i.test(ua)) {
      return { fam: 'linux', ver: 0, name: /Android/i.test(ua) ? 'Android' : 'Linux' };
    }
    return null;
  }
  // 显示版本空间（阈值与检测共用）：7=Win7, 8=Win8, 8.1, 10, 11；兼容 NT 式 6.x 兜底
  function winVerName(v) {
    if (v >= 11) return '11';
    if (v >= 10) return '10';
    if (v >= 8.1) return '8.1';
    if (v >= 8) return '8';
    if (v >= 7) return '7';
    if (v >= 6.3) return '8.1';
    if (v >= 6.2) return '8';
    if (v >= 6.1) return '7';
    if (v >= 6.0) return 'Vista';
    if (v >= 5.1) return 'XP';
    return 'any modern';
  }
  function osRowHtml(th) {
    const f = th.mof;
    if (!f) return '';
    const FAM = { win: 'Windows', mac: 'macOS', linux: 'Linux' };
    const famName = FAM[f] || f;
    const minV = parseFloat(th.mos) || 0;
    // 版本可信度：Windows <5.0 是解析残留（如 "Windows 7/8/10" 列表误拆），视为"任意现代 Windows"
    const needTxt = minV > 0
      ? (f === 'win' ? (minV >= 5 ? famName + ' ' + winVerName(minV) + '+' : 'any modern Windows')
                     : famName + (minV >= 10 ? ' ' + minV + '+' : ''))
      : famName;
    const row = (s, icon, val, gap) =>
      `<div class="os-row gs-${s}"><span class="gauge-label">OS</span><span class="gauge-status">${icon}</span><span class="gauge-val">${val}</span><span class="gauge-gap">${gap}</span></div>`;
    const os = detectOS();
    if (!os) return row('ok', '❔', `Game needs ${needTxt}`, "couldn't detect your OS");
    if (os.fam !== f) return row('warn', '⚠️', `${famName} only — you're on ${os.name}`, `needs ${needTxt}`);
    if (f === 'win') {
      const ok = !(minV >= 5 && os.ver < minV);
      return row(ok ? 'ok' : 'no', ok ? '✅' : '❌', `Your OS: ${os.name} — game needs ${needTxt}`, ok ? 'compatible' : 'below minimum');
    }
    if (f === 'mac') {
      const ok = !(minV >= 10.10 && os.ver < minV);
      return row(ok ? 'ok' : 'no', ok ? '✅' : '❌', `Your OS: ${os.name} — game needs ${needTxt}`, ok ? 'compatible' : 'below minimum');
    }
    return row('ok', '✅', `Linux — game needs ${needTxt}`, 'compatible');
  }

  function judge(btn) {
    const gamePage = btn.dataset.thresholds;
    const gpuInput = document.getElementById('gpu-input');
    const cpuInput = document.getElementById('cpu-input');
    const ramSelect = document.getElementById('ram-select');
    const out = document.getElementById('verdict');
    if (!out) return;

    const gpu = matchHw(HW.gpus, gpuInput.value);
    const cpu = matchHw(HW.cpus, cpuInput.value);
    const ram = ramSelect ? parseFloat(ramSelect.value) : null;

    if (gamePage) {
      const th = JSON.parse(btn.dataset.thresholds);
      const osHtml = osRowHtml(th);
      if (!gpu || !cpu || !ram) { out.innerHTML = `<div class="verdict-box verdict-weak">${t.unknown}</div>`; return; }
      const gpuGreat = gpu.m >= th.rg, gpuOk = gpu.m >= th.mg;
      const cpuGreat = cpu.m >= th.rc, cpuOk = cpu.m >= th.mc;
      const ramGreat = ram >= (th.rram || 16), ramOk = ram >= (th.mram || 4);
      let verdict, cls;
      if (gpuGreat && cpuGreat && ramGreat) { verdict = t.great; cls = 'verdict-great'; }
      else if (gpuOk && cpuOk && ramOk) { verdict = t.ok; cls = 'verdict-ok'; }
      else if (gpuOk && cpuOk && !ramOk) { verdict = t.weakRam; cls = 'verdict-weak'; }
      else if (gpuOk && !cpuOk) { verdict = t.weakCpu; cls = 'verdict-weak'; }
      else if (!gpuOk && cpuOk) { verdict = t.noGpu; cls = 'verdict-no'; }
      else { verdict = t.noBoth; cls = 'verdict-no'; }
      const detail = `GPU: ${gpu.n} (${gpu.m}) vs ${VIEW_MODE === 'min' ? 'min' : 'rec'} ${VIEW_MODE === 'min' ? th.mg : th.rg} · CPU: ${cpu.n} (${cpu.m}) vs ${VIEW_MODE === 'min' ? 'min' : 'rec'} ${VIEW_MODE === 'min' ? th.mc : th.rc} · RAM: ${ram}GB vs ${VIEW_MODE === 'min' ? 'min' : 'rec'} ${VIEW_MODE === 'min' ? th.mram : th.rram}GB`;
      // #18 匹配透明度（2026-08-15）：告诉用户硬件是精确命中还是近似匹配（2026-08-10 matchHw 分级修复的 UX 闭环）
      // hwScore: 3=完全相等 / 2=型号后缀命中("3060"→RTX 3060) / 1=中间子串 / 0=宽松兜底
      const mq = (label, hit, q) => {
        if (!hit) return '';
        const s = hwScore(hit.n.toLowerCase(), q);
        const [cls, tag, tip] = s >= 3 ? ['vm-exact', 'exact match', 'Your input exactly matches this model in the database']
          : s === 2 ? ['vm-good', 'series match', 'Matched by model number suffix (e.g. "3060" → GeForce RTX 3060)']
          : s === 1 ? ['vm-warn', 'partial match', 'No exact model found — closest name containing your input']
          : ['vm-loose', 'closest match', 'No exact model found — nearest model by name similarity'];
        const safe = String(hit.n).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        return `<span class="vm-item ${cls}" title="${tip}">${label}: ${safe} <em>${tag}</em></span>`;
      };
      const matchNote = `<div class="verdict-match" aria-label="Hardware match quality">${mq('GPU', gpu, gpuInput.value.trim().toLowerCase())}${mq('CPU', cpu, cpuInput.value.trim().toLowerCase())}</div>`;
      // 体验等级（#16，借鉴 PCGameBenchmark）：按弱项组件 vs 推荐值的比率估算 1080p 档位
      const bottle = Math.min(gpu.m / (th.rg || 1), cpu.m / (th.rc || 1));
      // #43 预计帧数（CYRI 式，2026-08-16）：由 bottle（最弱组件 vs 推荐）分段线性映射 1080p 估算 FPS，
      // 与 #16 档位标签同源同口径（1→30 / 2→60 / 3→144，封顶 240）；bottle=0.93 → ≈28（最低档 ~30 附近）
      const estFps = b => b <= 0 ? 0
        : b < 1 ? Math.round(30 * b)
        : b < 2 ? Math.round(30 + (b - 1) * 30)
        : b < 3 ? Math.round(60 + (b - 2) * 84)
        : Math.min(240, Math.round(144 + (b - 3) * 32));
      let tier = 0, tierLabel = '';
      if (gpuOk && cpuOk && ramOk) {
        if (bottle >= 3) { tier = 4; tierLabel = '⚡ Excellent — Ultra settings, 144+ FPS'; }
        else if (bottle >= 2) { tier = 3; tierLabel = '🚀 Great — High settings, 60–144 FPS'; }
        else if (bottle >= 1) { tier = 2; tierLabel = '👍 Good — Medium settings, 30–60 FPS'; }
        else { tier = 1; tierLabel = '🐢 Minimum — Low settings, ~30 FPS'; }
      }
      const fps = estFps(bottle);
      const expHtml = tier > 0
        ? `<div class="exp-box"><div class="exp-meter">${['t1','t2','t3','t4'].map((c, i) =>
            `<span class="exp-seg ${c}${tier >= i + 1 ? ' on' : ''}">${['Low','Med','High','Ultra'][i]}</span>`).join('')}
</div><p class="exp-label">${tierLabel} <span class="exp-fps" title="Estimated FPS at 1080p, from your weakest component vs recommended requirements">🎯 ≈ ${fps} FPS</span></p><p class="exp-note">Estimate at 1080p — actual FPS depends on settings &amp; drivers.</p></div>`
        : '';
      // 判定结果组件化：三色分数条 + 组件级 ✅/⚠️/❌ + 差距提示 + 最低要求刻度
      // 参考系随 #6 切换：REC 模式条宽 = 值/推荐值（保留最低刻度线）；MIN 模式条宽 = 值/最低要求（无刻度）
      const pct = (v, max) => Math.min(100, Math.max(0, Math.round(v / (max || 1) * 100)));
      const st = (meetsMin, meetsRec) => meetsRec ? 'ok' : (meetsMin ? 'warn' : 'no');
      const ICON = { ok: '✅', warn: '⚠️', no: '❌' };
      const bar = (label, v, minV, recV, meetsMin, meetsRec, valStr, recStr, minStr) => {
        const ref = VIEW_MODE === 'min' ? minV : recV;
        const s = st(meetsMin, meetsRec);
        const gapPct = Math.abs(Math.round((v / (ref || 1) - 1) * 100));
        const hint = VIEW_MODE === 'min'
          ? (meetsMin ? `↑ ${gapPct}% above min` : `✗ ${gapPct}% below min`)
          : (meetsRec ? `↑ ${gapPct}% above rec`
              : meetsMin ? `↓ ${gapPct}% below rec`
              : `✗ ${gapPct}% below min`);
        const mark = VIEW_MODE === 'rec' ? `<div class="gauge-mark" style="left:${pct(minV, recV)}%" title="Minimum requirement"></div>` : '';
        return `
        <div class="gauge-row gs-${s}">
          <span class="gauge-label">${label}</span>
          <span class="gauge-status">${ICON[s]}</span>
          <div class="gauge-track">
            <div class="gauge-fill g-fill-${s}" style="width:${pct(v, ref)}%"></div>
            ${mark}
          </div>
          <span class="gauge-val">${valStr} / ${VIEW_MODE === 'min' ? minStr : recStr}</span>
          <span class="gauge-gap">${hint}</span>
        </div>`;
      };
      // #42 总览双色达标进度条（CYRI 式，2026-08-16）：单条聚合——你的综合分（三组件最弱口径）
      // vs 当前参考（REC/MIN）；REC 模式叠加红色最低要求刻度线（过线即能玩，CYRI 招牌视觉）
      const ovrRec = Math.min(gpu.m / (th.rg || 1), cpu.m / (th.rc || 1), ram / (th.rram || 16));
      const ovrMin = Math.min(gpu.m / (th.mg || 1), cpu.m / (th.mc || 1), ram / (th.mram || 4));
      const minPos = Math.min(th.mg / (th.rg || 1), th.mc / (th.rc || 1), (th.mram || 4) / (th.rram || 16));
      const ovrRatio = VIEW_MODE === 'min' ? ovrMin : ovrRec;
      const ovrS = st(ovrMin >= 1, ovrRec >= 1);
      const ovrGap = Math.abs(Math.round((ovrRatio - 1) * 100));
      const ovrHint = VIEW_MODE === 'min'
        ? (ovrMin >= 1 ? `↑ ${ovrGap}% above min` : `✗ ${ovrGap}% below min`)
        : (ovrRec >= 1 ? `↑ ${ovrGap}% above rec`
            : ovrMin >= 1 ? `↓ ${ovrGap}% below rec`
            : `✗ ${ovrGap}% below min`);
      const ovrMark = VIEW_MODE === 'rec'
        ? `<div class="gauge-mark ovr-mark" style="left:${pct(minPos, 1)}%" title="Minimum requirement"></div>` : '';
      const ovrRow = `
        <div class="ovr-row gs-${ovrS}" title="Overall score = weakest component (GPU/CPU/RAM) vs ${VIEW_MODE === 'min' ? 'minimum' : 'recommended'} requirements">
          <span class="gauge-label ovr-label">Overall</span>
          <span class="gauge-status">${ICON[ovrS]}</span>
          <div class="gauge-track ovr-track">
            <div class="gauge-fill g-fill-${ovrS}" style="width:${pct(ovrRatio, 1)}%"></div>
            ${ovrMark}
          </div>
          <span class="gauge-val ovr-val">${Math.round(ovrRatio * 100)}% of ${VIEW_MODE === 'min' ? 'min' : 'rec'}</span>
          <span class="gauge-gap">${ovrHint}</span>
        </div>`;
      const gauges = `
        <div class="gauge-box">
          ${ovrRow}
          ${bar('GPU', gpu.m, th.mg, th.rg, gpuOk, gpuGreat, gpu.m.toLocaleString(), th.rg.toLocaleString(), th.mg.toLocaleString())}
          ${bar('CPU', cpu.m, th.mc, th.rc, cpuOk, cpuGreat, cpu.m.toLocaleString(), th.rc.toLocaleString(), th.mc.toLocaleString())}
          ${bar('RAM', ram, th.mram || 4, th.rram || 16, ramOk, ramGreat, ram + 'GB', (th.rram || 16) + 'GB', (th.mram || 4) + 'GB')}
        </div>`;
      const toggle = `<div class="view-toggle" role="group" aria-label="Compare against">
        <button type="button" class="vt-btn${VIEW_MODE === 'rec' ? ' active' : ''}" data-v="rec">Recommended</button>
        <button type="button" class="vt-btn${VIEW_MODE === 'min' ? ' active' : ''}" data-v="min">Minimum</button>
      </div>`;
      out.innerHTML = `<div class="verdict-box ${cls}">${verdict}${matchNote}${osHtml}${expHtml}<div class="verdict-detail">${detail}</div>${toggle}${gauges}<div class="verdict-share-row"><button type="button" class="share-btn verdict-share">📋 Copy result</button></div></div>`;
      // #6 切换 MIN/REC 参考：重建判定框（旧按钮随 innerHTML 替换回收，无监听器堆积）
      out.querySelectorAll('.vt-btn').forEach(b => b.addEventListener('click', () => {
        if (b.dataset.v !== VIEW_MODE) { VIEW_MODE = b.dataset.v; judge(btn); }
      }));
      // #36 判定结果分享卡（CYRI 式）：一键复制判定文本摘要（游戏名+结论+三组件 vs 参考+链接）
      const share = out.querySelector('.verdict-share');
      if (share) share.addEventListener('click', () => {
        const st = (great, ok) => great ? '✅' : (ok ? '⚠️' : '❌');
        const ref = VIEW_MODE === 'min' ? 'min' : 'rec';
        const line = (label, v, minV, recV, great, ok) =>
          `${label}: ${v.toLocaleString()} vs ${ref} ${(VIEW_MODE === 'min' ? minV : recV).toLocaleString()} ${st(great, ok)}`;
        // #45 分享判定深链（CYRI 式）：链接带上当前判定的硬件参数 → 接收方打开
        // ?gpu=&cpu=&ram= 自动预填并复现同一判定（跨设备共享"能不能跑"结论）
        const gpuVal = (document.getElementById('gpu-input') || {}).value || '';
        const cpuVal = (document.getElementById('cpu-input') || {}).value || '';
        const ramVal = (document.getElementById('ram-select') || {}).value || '';
        const qps = new URLSearchParams();
        if (gpuVal) qps.set('gpu', gpuVal);
        if (cpuVal) qps.set('cpu', cpuVal);
        if (ramVal) qps.set('ram', ramVal);
        const qss = qps.toString();
        const shareUrl = window.location.origin + window.location.pathname + (qss ? '?' + qss : '');
        const summary = [
          `Can I play ${pageGameName()} on my PC?`,
          '',
          verdict,
          '',
          `Overall: ${Math.round(ovrRatio * 100)}% of ${VIEW_MODE === 'min' ? 'min' : 'rec'} ${ICON[ovrS]}`,
          tier > 0 ? `Est. FPS: ~${fps} @ 1080p` : 'Est. FPS: below minimum — may not run',
          line('GPU', gpu.m, th.mg, th.rg, gpuGreat, gpuOk),
          line('CPU', cpu.m, th.mc, th.rc, cpuGreat, cpuOk),
          line('RAM', ram, th.mram || 4, th.rram || 16, ramGreat, ramOk),
          '',
          `Full check: ${shareUrl}`
        ].join('\n');
        copyText(summary, () => showToast('✅ Result copied'));
      });
      const up = document.getElementById('upgrade-suggest');
      if (up) {
        // 8/13：升级建议改为低/中/高三档硬件推荐（renderHwRec 用 th 阈值匹配）
        renderHwRec(th);
      }
    } else {
      if (!gpu || !cpu) { out.innerHTML = `<div class="verdict-box verdict-weak">${t.unknown}</div>`; return; }
      out.innerHTML = `<div class="verdict-box verdict-ok">GPU: ${gpu.n} · CPU: ${cpu.n} · RAM: ${ram}GB — pick a game to check compatibility</div>`;
    }
  }

  // ---- 硬件推荐（8/13：低/中/高三档 × CPU/主板/GPU + 整机） ----
  function renderHwRec(th) {
    const up = document.getElementById('upgrade-suggest');
    if (!up) return;
    if (!th || !th.mg) { up.innerHTML = `<h3>💡 Upgrade suggestions</h3><p>${t.noSuggest}</p>`; return; }
    const needGpu = Math.max(th.mg || 0, th.rg || 0);
    const needCpu = Math.max(th.mc || 0, th.rc || 0);
    const tiers = needGpu > 20000 ? ['high'] : (needGpu > 10000 ? ['mid', 'high'] : ['low', 'mid', 'high']);
    const tierName = { low: 'Low', mid: 'Mid', high: 'High' };
    const cards = tiers.map(tier => {
      const g = HW_CATALOG.gpu.filter(x => x.tier === tier).sort((a,b) => (a.affiliate_priority||99)-(b.affiliate_priority||99))[0];
      if (!g) return '';
      const cpu = HW_CATALOG.cpu.filter(x => x.tier === tier).sort((a,b) => (a.affiliate_priority||99)-(b.affiliate_priority||99))[0];
      const mobo = cpu ? (HW_CATALOG.mobo.filter(m => m.socket === cpu.socket).sort((a,b) => (a.affiliate_priority||99)-(b.affiliate_priority||99))[0] || null) : null;
      const parts = [];
      if (g) parts.push(`<a class="rec-item" href="${AMZ.link(g.query)}" target="_blank" rel="sponsored noopener"><span class="rec-type">GPU</span>${g.name}<span class="rec-price">$${g.price}</span></a>`);
      if (cpu) parts.push(`<a class="rec-item" href="${AMZ.link(cpu.query)}" target="_blank" rel="sponsored noopener"><span class="rec-type">CPU</span>${cpu.name}<span class="rec-price">$${cpu.price}</span></a>`);
      if (mobo) parts.push(`<a class="rec-item" href="${AMZ.link(mobo.query)}" target="_blank" rel="sponsored noopener"><span class="rec-type">MOBO</span>${mobo.name}<span class="rec-price">$${mobo.price}</span></a>`);
      // 整机（低/中档才推，高档需求默认配件齐全）
      const fullQuery = tier === 'high' ? '' : `${g.query} ${cpu ? cpu.query : ''} ${mobo ? mobo.query : ''} gaming pc`.trim();
      if (fullQuery) parts.push(`<a class="rec-item rec-full" href="${AMZ.link(fullQuery)}" target="_blank" rel="sponsored noopener"><span class="rec-type">FULL PC</span>${tierName[tier]} budget build<span class="rec-price">💡</span></a>`);
      return `<div class="rec-tier"><h4>${tierName[tier]} tier</h4>${parts.join('')}</div>`;
    }).join('');
    const upHtml = `<h3>💡 ${t.suggest} <span class="rec-hint">(Amazon links support the site)</span></h3><div class="rec-grid">${cards}</div>`;
    // 覆盖现有渲染
    const existing = up.innerHTML;
    up.innerHTML = upHtml;
    if (!tiers.length) up.innerHTML = `<h3>💡 ${t.suggest}</h3><p>${t.noSuggest}</p>`;
  }

  // ---- 硬件多组管理（8/13：localStorage 全局保存） ----
  const HW_STORE_KEY = 'caniplay_hw_groups';
  function hwLoadGroups() {
    try { return JSON.parse(localStorage.getItem(HW_STORE_KEY) || '[]'); } catch (e) { return []; }
  }
  function hwSaveGroups(groups) {
    try { localStorage.setItem(HW_STORE_KEY, JSON.stringify(groups)); } catch (e) {}
  }
  function hwCurrent() {
    try { return JSON.parse(localStorage.getItem('caniplay_hw_current') || 'null'); } catch (e) { return null; }
  }
  function hwSetCurrent(g) {
    try { localStorage.setItem('caniplay_hw_current', JSON.stringify(g)); } catch (e) {}
  }
  function hwApplyGroup(g) {
    const gpu = document.getElementById('gpu-input'), cpu = document.getElementById('cpu-input'), ram = document.getElementById('ram-select');
    if (gpu) gpu.value = g.gpu || '';
    if (cpu) cpu.value = g.cpu || '';
    if (ram && g.ram) ram.value = String(g.ram);
    hwSetCurrent(g);
    renderHwGroups();
  }
  function hwRenderGroups() {
    const box = document.getElementById('hw-groups');
    if (!box) return;
    const groups = hwLoadGroups();
    const cur = hwCurrent();
    if (!groups.length) { box.innerHTML = ''; return; }
    box.innerHTML = groups.map((g, i) => {
      const active = cur && cur.gpu === g.gpu && cur.cpu === g.cpu && cur.ram === g.ram;
      return `<div class="hw-group${active ? ' active' : ''}">
        <span class="hw-group-name">${g.name || ('Group ' + (i+1))}</span>
        <span class="hw-group-spec">${g.gpu || '?'} / ${g.cpu || '?'} / ${g.ram || 16}GB</span>
        <button type="button" class="hw-use" data-i="${i}">Use</button>
        <button type="button" class="hw-del" data-i="${i}">✕</button>
      </div>`;
    }).join('');
    box.querySelectorAll('.hw-use').forEach(b => b.addEventListener('click', () => hwApplyGroup(hwLoadGroups()[+b.dataset.i])));
    box.querySelectorAll('.hw-del').forEach(b => b.addEventListener('click', () => {
      const groups = hwLoadGroups();
      groups.splice(+b.dataset.i, 1);
      hwSaveGroups(groups);
      hwRenderGroups();
    }));
  }
  function hwAddGroup() {
    const gpu = document.getElementById('gpu-input'), cpu = document.getElementById('cpu-input'), ram = document.getElementById('ram-select');
    const gpuV = gpu ? gpu.value.trim() : '', cpuV = cpu ? cpu.value.trim() : '';
    if (!gpuV && !cpuV) { showToast('⚠️ Enter GPU or CPU first'); return; }
    const groups = hwLoadGroups();
    groups.push({ name: `Group ${groups.length + 1}`, gpu: gpuV, cpu: cpuV, ram: ram ? ram.value : '16', ts: Date.now() });
    hwSaveGroups(groups);
    hwSetCurrent(groups[groups.length - 1]);
    hwRenderGroups();
    showToast('✅ Hardware group saved');
  }

  // ---- 事件绑定 ----
  document.addEventListener('DOMContentLoaded', () => {
    // 首页 card-meta 清洗（#4 收尾，双保险配合生成器修复）：
    // 旧构建产物 raw genres JSON `["Action", "Free To Play"]` → `Action · Free To Play`；
    // "Coming Coming soo" → "Coming ..."；等下次全量重建后此段变为 no-op
    document.querySelectorAll('.card-meta').forEach(el => {
      let t = (el.textContent || '').trim();
      if (t.startsWith('[')) {
        try {
          const arr = JSON.parse(t);
          t = (Array.isArray(arr) ? arr : [arr]).filter(Boolean).join(' · ');
        } catch (e) {
          t = t.replace(/^\[/, '').replace(/\]$/, '').split(',')[0].trim().replace(/^"|"$/g, '');
        }
      }
      t = t.replace(/^Coming Coming\b/i, 'Coming').replace(/^Coming\s+(?=To be)/i, '');
      el.textContent = t;
    });
    setupGameCombo();
    setupKbdPalette();
    setupCombo('gpu-input', 'gpu-combo', () => HW.gpus);
    setupCombo('cpu-input', 'cpu-combo', () => HW.cpus);
    // 8/13：硬件多组管理——恢复上次使用 + 渲染组列表 + 添加组按钮
    const curHw = hwCurrent();
    if (curHw) {
      const gpu = document.getElementById('gpu-input'), cpu = document.getElementById('cpu-input'), ram = document.getElementById('ram-select');
      if (gpu && curHw.gpu) gpu.value = curHw.gpu;
      if (cpu && curHw.cpu) cpu.value = curHw.cpu;
      if (ram && curHw.ram) ram.value = String(curHw.ram);
    }
    hwRenderGroups();
    const addBtn = document.getElementById('hw-add-group');
    if (addBtn) addBtn.addEventListener('click', hwAddGroup);
    document.querySelectorAll('#check-btn').forEach(btn => {
      btn.addEventListener('click', () => judge(btn));
    });
    document.querySelectorAll('#gpu-input, #cpu-input').forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const btn = document.querySelector('#check-btn');
          if (btn) judge(btn);
        }
      });
    });
    // 全部游戏页：SPA 分片加载 + 搜索过滤（10 万款目录）
    const gameList = document.getElementById('game-list');
    const gameSearch = document.getElementById('game-search');
    const gameTotal = document.getElementById('game-total');
    if (gameList) {
      // 骨架屏（2026-08-11，Linear 式）：分片加载期 shimmer 占位卡，数据就绪后 render() 整体替换
      gameList.innerHTML = Array.from({ length: 12 }, () =>
        '<div class="sk-card"><div class="sk-thumb"></div><div class="sk-line"></div><div class="sk-line short"></div></div>'
      ).join('');
      const isSub = window.location.pathname.indexOf('/game/') !== -1;
      const base = isSub ? '../' : '';
      (async () => {
        try {
          const meta = await (await fetch(base + 'assets/data/index.json')).json();
          if (gameTotal) gameTotal.textContent = meta.total.toLocaleString() + ' games (' + meta.scraped.toLocaleString() + ' with specs)';
          const all = [];
          await Promise.all(meta.shards.map(async s => {
            const d = await (await fetch(base + 'assets/data/games_' + s + '.json')).json();
            all.push(...d);
          }));
          // ---- 排序 ----
          const SORTS = {
            '': (a, b) => (b.d || 0) - (a.d || 0) || b.y - a.y,
            name: (a, b) => a.n.localeCompare(b.n),
            year: (a, b) => (b.y || 0) - (a.y || 0),
            discount: (a, b) => (b.di || 0) - (a.di || 0),
            price: (a, b) => (a.p || 0) - (b.p || 0)
          };
          let shown = 120;  // 初始显示更多（PC 大屏不空洞）
          const render = (items) => {
            const box = document.getElementById('result-count');
            if (box) box.textContent = items.length.toLocaleString() + ' game' + (items.length === 1 ? '' : 's') + ' found';
            const slice = items.slice(0, shown);
            if (!slice.length) {
              // 空状态设计（#11）：引导清空筛选，避免死胡同
              gameList.innerHTML = `<div class="empty-state">
  <p class="empty-icon">🎮</p>
  <p class="empty-title">No games found</p>
  <p class="empty-sub">Try a different search term or clear your filters.</p>
  <button class="empty-clear" id="empty-clear">✕ Clear all filters</button>
</div>`;
              const ec = document.getElementById('empty-clear');
              if (ec) ec.addEventListener('click', () => {
                const fc = document.getElementById('f-clear');
                if (fc) fc.click();
              });
            } else {
              gameList.innerHTML = slice.map(g => {
                const href = g.d ? 'game/' + (g.u || g.a) + '.html' : '#';
                const img = g.i ? `<div class="thumb"><img src="${g.i}" alt="${g.n}" loading="lazy" onerror="this.remove()"></div>` : '<div class="card-ph"></div>';
                // 彩色徽章系统（#8）：折扣分级着色 + FREE + 规格待补 + 类型 chips
                const badges = [];
                if (g.di > 0) {
                  const cls = g.di >= 40 ? 'sale-big' : g.di >= 20 ? 'sale-mid' : 'sale-small';
                  badges.push(`<span class="sale-badge ${cls}">-${g.di}%</span>`);
                }
                if (g.f) badges.push('<span class="free-badge">FREE</span>');
                if (!g.d) badges.push('<span class="badge-pending">specs soon</span>');
                const chips = (g.g || []).slice(0, 3).map(x => `<span class="chip">${x}</span>`).join('');
                const year = g.y ? `<span class="row-genres">${g.y}</span>` : '';
                // 价格显示守卫：DB 历史混入非美元币种（VND/JPY/KRW 残值），美元价不可能 > $200，
                // 仅显示 0 < price ≤ $200 的金额，否则留空（根治=爬虫固定币种重爬）
                const price = (g.p && g.p <= 20000) ? `<span class="row-price">$${(g.p / 100).toFixed(2)}</span>` : '';
                return `<a class="game-card" href="${href}" data-name="${g.n.toLowerCase()}">
  ${img}
  <h3>${g.n}${badges.join('')}</h3>
  ${chips ? `<div class="card-genres">${chips}</div>` : ''}
  ${year}${price}
</a>`;
              }).join('');
            }
            const moreBtn = document.getElementById('load-more');
            if (moreBtn) {
              const hasMore = items.length > shown;
              moreBtn.style.display = hasMore ? 'block' : 'none';
              moreBtn.textContent = 'Load more (' + Math.min(120, items.length - shown).toLocaleString() + ' more)';
            }
          };
          // 无限滚动（只建一次）：接近底部自动加载更多
          const sentinel = document.createElement('div');
          sentinel.style.height = '1px';
          sentinel.className = 'scroll-sentinel';
          gameList.after(sentinel);
          const loader = document.createElement('div');
          loader.className = 'scroll-loader';
          loader.textContent = 'Loading more...';
          loader.style.display = 'none';
          sentinel.after(loader);
          let loading = false;
          window.__scrollObs = new IntersectionObserver((entries) => {
            if (!entries[0].isIntersecting || loading) return;
            const items = window.__FILTERED || all;
            if (shown < items.length) {
              loading = true;
              loader.style.display = 'block';
              setTimeout(() => {
                shown += 120;
                render(items);
                loading = false;
                loader.style.display = 'none';
              }, 200);
            }
          }, { rootMargin: '600px' });
          window.__scrollObs.observe(sentinel);
          render(all);
          window.__ALL_GAMES = all;
          // 游戏库搜索联想：数据加载完成后绑定（联想跳详情页，过滤逻辑独立保留）
          setupLibraryCombo();
          // ---- 筛选（年份/类型/免费/折扣）+ 排序 ----
          const fYear = document.getElementById('f-year');
          const fGenre = document.getElementById('f-genre');
          const fFree = document.getElementById('f-free');
          const fSale = document.getElementById('f-sale');
          const fSort = document.getElementById('f-sort');
          const fClear = document.getElementById('f-clear');
          let debounceTimer = null;
          // 状态持久化（切 tab 回来恢复筛选/搜索/排序）
          const STATE_KEY = 'caniplay_filters';
          const saveState = () => {
            try {
              sessionStorage.setItem(STATE_KEY, JSON.stringify({
                q: gameSearch ? gameSearch.value : '', y: fYear ? fYear.value : '',
                g: fGenre ? fGenre.value : '', fr: fFree ? fFree.checked : false,
                s: fSale ? fSale.checked : false, sort: fSort ? fSort.value : ''
              }));
            } catch (e) {}
          };
          let syncPills = () => {};  // #7 pills 活动态同步（pills 块未建前是 no-op，避免 restore 提前触发报错）
          let syncChecks = () => {};  // #7 Free/On Sale pill 选中态（JS 驱动，兼容无 :has 的旧浏览器）
          const applyFilters = () => {
            const q = gameSearch ? gameSearch.value.trim().toLowerCase().replace(/[\s\-]+/g, '') : '';
            let hits = all;
            if (q) hits = hits.filter(g => {
              // 防御：shard 偶发 null name/genre（下架 app）曾致 toLowerCase 崩溃、整个搜索失效
              const n = (g.n || '').toLowerCase().replace(/[\s\-]+/g, '');
              const genreHit = (g.g || []).filter(Boolean).some(gen => gen.toLowerCase().includes(q));
              // 连续子串或类型命中（去掉字符分散匹配：'witcher' 曾命中 3836 个、'zzzz' 也有结果）
              return n.includes(q) || genreHit;
            });
            // A-Z 字母跳转（#10）：首字母过滤，叠加在其他筛选之上
            if (window.__AZ) {
              const az = window.__AZ === '#' ? /^[0-9]/ : new RegExp('^' + window.__AZ, 'i');
              hits = hits.filter(g => az.test((g.n || '')[0]));
            }
            if (fYear && fYear.value) hits = hits.filter(g => g.y == fYear.value);
            if (fGenre && fGenre.value) hits = hits.filter(g => (g.g || []).includes(fGenre.value));
            // #46 特性筛选（?feat= 深链，Steam categories 式）：按 featidx appid 集合过滤，可与搜索/类型叠加
            if (window.__FEAT_IDS) hits = hits.filter(g => window.__FEAT_IDS.has(g.a));
            if (fFree && fFree.checked) hits = hits.filter(g => g.f);
            if (fSale && fSale.checked) hits = hits.filter(g => g.di > 0);
            hits.sort(SORTS[fSort ? fSort.value : ''] || SORTS['']);
            shown = 60;
            window.__FILTERED = hits;
            render(hits);
            if (syncPills) syncPills();
            if (syncChecks) syncChecks();
            saveState();
          };
          // 恢复上次筛选状态（切 tab 回来后）
          let restored = null;
          try { restored = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null'); } catch (e) {}
          if (restored) {
            if (gameSearch) gameSearch.value = restored.q || '';
            if (fYear && restored.y) fYear.value = restored.y;
            if (fGenre && restored.g) fGenre.value = restored.g;
            if (fFree) fFree.checked = !!restored.fr;
            if (fSale) fSale.checked = !!restored.s;
            if (fSort && restored.sort) fSort.value = restored.sort;
            if (restored.q || restored.y || restored.g || restored.fr || restored.s) applyFilters();
          }
          if (fYear) {
            const years = [...new Set(all.map(g => g.y).filter(Boolean))].sort((a, b) => b - a);
            years.forEach(y => {
              const opt = document.createElement('option');
              opt.value = y; opt.textContent = y;
              fYear.appendChild(opt);
            });
          }
          if (fGenre) {
            const genres = [...new Set(all.flatMap(g => g.g || []))].sort();
            genres.forEach(gen => {
              const opt = document.createElement('option');
              opt.value = gen; opt.textContent = gen;
              fGenre.appendChild(opt);
            });
            // 支持 ?genre=Action 直达预筛选（首页分类入口）
            try {
              const want = new URLSearchParams(window.location.search).get('genre');
              if (want && genres.includes(want)) {
                fGenre.value = want;
                const origQ = gameSearch ? gameSearch.value : '';
                if (gameSearch) gameSearch.value = '';
                applyFilters();
                if (origQ) gameSearch.value = origQ;
              }
            } catch (e) {}
          }
          // ?q= 直达搜索（#30：404 页/分享链接落点；URL 优先于 session 恢复）
          try {
            const wantQ = new URLSearchParams(window.location.search).get('q');
            if (wantQ && gameSearch) {
              gameSearch.value = wantQ;
              applyFilters();
            }
          } catch (e) {}
          // #46/#47 ?feat= 特性筛选（Steam categories 式交叉浏览，URL 优先于 session 恢复）
          // 单特性: ?feat=single-player；多特性 AND 组合: ?feat=single-player+co-op（+ 分隔，appid 集合求交）
          // 数据: assets/data/featidx/<slug>.json（build_feat_index.py 生成，appid 集合与 shards 同源）
          // 提示条: 每特性一个 chip（label+计数+✕ 移除）+ "+ Add" 选择器追加特性，URL 与筛选实时同步（replaceState）
          try {
            const wantF = new URLSearchParams(window.location.search).get('feat');
            // 分隔符 '+'：raw '+' 在 query 中被解析为空格（URL 规范），slug 恒无空格 → 还原后再 split
            // #49 排除过滤（GG.deals ± NOT）：'-' 前缀段 = 排除特性（?feat=single-player+-co-op = 含 SP 且排除 Co-op）
            const featParts = [...new Set((wantF || '').replace(/ /g, '+').split('+').map(s => s.trim()).filter(Boolean))];
            const featSlugs = featParts.filter(s => !s.startsWith('-') && /^[a-z0-9-]+$/.test(s));
            const featExcl = featParts.filter(s => s.startsWith('-') && /^[a-z0-9-]+$/.test(s.slice(1))).map(s => s.slice(1));
            if (featSlugs.length || featExcl.length) {
              window.__FEAT_SLUGS = featSlugs;   // 活动特性 slug 数组（包含，AND）
              window.__FEAT_EXCL = featExcl;     // 排除特性 slug 数组（差集，NOT）
              window.__FEAT_IDS = null;          // 组合结果集（加载后填充）
              const featMeta = {};               // slug -> {label, ids:Set, count}
              const hint = document.createElement('div');
              hint.className = 'feat-hint';
              hint.id = 'feat-hint';
              hint.innerHTML = '<span class="feat-hint-label">Features:</span>' +
                '<span class="feat-tags"></span>' +
                '<button type="button" class="feat-add" id="feat-add" aria-haspopup="true">+ Add</button>' +
                '<button type="button" class="feat-hint-clear" aria-label="Clear feature filter">✕ Clear</button>' +
                '<div class="feat-add-menu" hidden></div>';
              const pills = document.getElementById('filter-pills') || document.getElementById('filter-bar');
              if (pills) pills.after(hint);
              const tagsEl = hint.querySelector('.feat-tags');
              const menuEl = hint.querySelector('.feat-add-menu');
              const syncUrl = () => {
                try {
                  const u = new URL(window.location.href);
                  const featAll = [...window.__FEAT_SLUGS, ...window.__FEAT_EXCL.map(s => '-' + s)];
                  if (featAll.length) u.searchParams.set('feat', featAll.join('+'));
                  else u.searchParams.delete('feat');
                  history.replaceState(null, '', u.pathname + u.search + u.hash);
                } catch (e) {}
              };
              const renderTags = () => {
                // 包含 chips 在前，排除 chips 在后（Not: 前缀 + excl 样式区分）
                const chips = [
                  ...window.__FEAT_SLUGS.map(s => ({ s, excl: false })),
                  ...window.__FEAT_EXCL.map(s => ({ s, excl: true }))
                ];
                tagsEl.innerHTML = chips.map(({ s, excl }) => {
                  const m = featMeta[s];
                  const cnt = m ? m.count.toLocaleString() : '…';
                  const label = m ? String(m.label).replace(/[<>&"]/g, '') : s;
                  return '<span class="feat-tag' + (excl ? ' excl' : '') + '" data-slug="' + s + '" data-excl="' + (excl ? 1 : 0) + '">' +
                    (excl ? '<span class="feat-tag-not">Not</span>' : '') +
                    '<b>' + label + '</b> <span class="feat-tag-cnt">' + cnt + '</span>' +
                    '<button type="button" class="feat-tag-rm" aria-label="Remove ' + (excl ? 'exclude ' : '') + label + '">✕</button></span>';
                }).join('');
              };
              const applyFeat = () => {
                // #49 排除过滤（GG.deals ± NOT）：包含集 AND 求交（无包含 → 全量基础集），再减去排除集并集
                let inter = null;
                for (const s of window.__FEAT_SLUGS) {
                  const m = featMeta[s];
                  if (!m) return; // 等全部加载完
                  inter = inter === null ? new Set(m.ids) : new Set([...inter].filter(x => m.ids.has(x)));
                }
                if (inter === null) inter = new Set(all.map(g => g.a)); // 仅排除 → 全量
                for (const s of window.__FEAT_EXCL) {
                  const m = featMeta[s];
                  if (!m) return; // 等全部加载完
                  for (const x of m.ids) inter.delete(x);
                }
                window.__FEAT_IDS = inter;
                renderTags();
                applyFilters();
              };
              const loadSlug = (s) => {
                return fetch(base + 'assets/data/featidx/' + s + '.json', { cache: 'no-cache' })
                  .then(r => (r.ok ? r.json() : Promise.reject(new Error('no feat index'))))
                  .then(fi => {
                    featMeta[s] = { label: String(fi.label || s), ids: new Set(fi.ids || []), count: (fi.ids || []).length };
                  })
                  .catch(() => {
                    featMeta[s] = { label: s, ids: new Set(), count: 0 }; // 未知特性 → 0 games（设计行为）
                  });
              };
              // 事件：chip ✕ 移除单个特性（区分包含/排除）
              tagsEl.addEventListener('click', (e) => {
                const rm = e.target.closest('.feat-tag-rm');
                const tag = rm ? rm.closest('.feat-tag') : null;
                if (!tag) return;
                const s = tag.dataset.slug;
                if (tag.dataset.excl === '1') window.__FEAT_EXCL = window.__FEAT_EXCL.filter(x => x !== s);
                else window.__FEAT_SLUGS = window.__FEAT_SLUGS.filter(x => x !== s);
                if (!window.__FEAT_SLUGS.length && !window.__FEAT_EXCL.length) {
                  window.__FEAT_IDS = null;
                  hint.remove();
                  syncUrl();
                  applyFilters();
                } else {
                  syncUrl();
                  applyFeat();
                }
              });
              // 事件：✕ Clear 清空全部
              hint.querySelector('.feat-hint-clear').addEventListener('click', () => {
                window.__FEAT_IDS = null;
                window.__FEAT_SLUGS = [];
                window.__FEAT_EXCL = [];
                hint.remove();
                syncUrl();
                applyFilters();
              });
              // 事件：+ Add 选择器（_index.json 清单，build_feat_index.py 生成，22 特性带计数）
              hint.querySelector('.feat-add').addEventListener('click', () => {
                if (menuEl.hidden === false) { menuEl.hidden = true; return; }
                fetch(base + 'assets/data/featidx/_index.json', { cache: 'no-cache' })
                  .then(r => (r.ok ? r.json() : Promise.reject(new Error('no feat index'))))
                  .then(idx => {
                    menuEl.innerHTML = Object.keys(idx).map(s => {
                      const on = window.__FEAT_SLUGS.includes(s);
                      const ex = window.__FEAT_EXCL.includes(s);
                      const busy = on || ex;
                      const lb = String(idx[s].label || s).replace(/[<>&"]/g, '');
                      return '<span class="feat-add-row' + (busy ? ' on' : '') + '" data-slug="' + s + '">' +
                        '<button type="button" class="feat-add-item' + (busy ? ' on' : '') + '" data-slug="' + s + '"' + (busy ? ' disabled' : '') + '>' +
                        lb + ' <span class="f-pill-cnt">' + (idx[s].count || 0).toLocaleString() + '</span>' + (on ? ' ✓' : (ex ? ' Not ✓' : '')) + '</button>' +
                        // #49 排除入口（GG.deals ± NOT）：每项右侧 ⊖ 排除小按钮
                        '<button type="button" class="feat-add-ex' + (ex ? ' on' : '') + '" data-slug="' + s + '" aria-label="Exclude ' + lb + '" title="Exclude ' + lb + '"' + (ex ? ' disabled' : '') + '>⊖</button></span>';
                    }).join('') +
                      // #48 特性浏览专页入口（Steam categories 首页式）：菜单底部跳转 features.html
                      '<div class="feat-add-all"><a href="' + base + 'features.html">Browse all features →</a></div>';
                    menuEl.hidden = false;
                  })
                  .catch(() => { menuEl.hidden = true; });
              });
              menuEl.addEventListener('click', (e) => {
                // #49 ⊖ 排除按钮：从包含（若有）移到排除列表
                const exBtn = e.target.closest('.feat-add-ex');
                if (exBtn) {
                  if (exBtn.disabled) return;
                  const s = exBtn.dataset.slug;
                  window.__FEAT_EXCL = [...new Set([...window.__FEAT_EXCL, s])];
                  window.__FEAT_SLUGS = window.__FEAT_SLUGS.filter(x => x !== s);
                  menuEl.hidden = true;
                  loadSlug(s).then(() => { syncUrl(); applyFeat(); });
                  return;
                }
                const item = e.target.closest('.feat-add-item');
                if (!item || item.disabled) return;
                window.__FEAT_SLUGS = [...new Set([...window.__FEAT_SLUGS, item.dataset.slug])];
                menuEl.hidden = true;
                loadSlug(item.dataset.slug).then(() => { syncUrl(); applyFeat(); });
              });
              document.addEventListener('click', (e) => {
                if (!hint.contains(e.target)) menuEl.hidden = true;
              });
              document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') menuEl.hidden = true;
              });
              // 首次：并行加载全部活动特性（含排除，#49）→ 求交+差集 → 渲染
              Promise.all([...window.__FEAT_SLUGS, ...window.__FEAT_EXCL].map(loadSlug)).then(() => {
                syncUrl();
                applyFeat();
              });
            }
          } catch (e) {}
          [fYear, fGenre, fFree, fSale, fSort].forEach(el => el && el.addEventListener('change', () => {
            if ((el === fFree || el === fSale) && syncChecks) syncChecks();
            applyFilters();
          }));
          // #7 筛选栏 pills 化（GG.deals 式）：genre 下拉 → 可点击 pill 行（带游戏数），活动态高亮
          // 借鉴 GG.deals/Metacritic：筛选选项直接可见可点，比 select 少一次点击；纯 JS 注入免全量重建
          {
            const pillRow = document.createElement('div');
            pillRow.className = 'filter-pills';
            pillRow.id = 'filter-pills';
            const counts = new Map();
            for (const g of all) for (const gen of (g.g || [])) counts.set(gen, (counts.get(gen) || 0) + 1);
            const gens = [...counts.keys()].sort();
            pillRow.innerHTML = '<button class="f-pill" data-g="" type="button">All genres</button>' +
              gens.map(gen => `<button class="f-pill" data-g="${gen.replace(/"/g, '&quot;')}" type="button">${gen} <span class="f-pill-cnt">${counts.get(gen).toLocaleString()}</span></button>`).join('');
            const fb = document.getElementById('filter-bar');
            if (fb) fb.after(pillRow);
            syncPills = () => {
              const cur = fGenre ? fGenre.value : '';
              pillRow.querySelectorAll('.f-pill').forEach(b => b.classList.toggle('on', (b.dataset.g || '') === cur));
            };
            pillRow.addEventListener('click', (e) => {
              const b = e.target.closest('.f-pill');
              if (!b) return;
              fGenre.value = b.dataset.g || '';
              applyFilters();
            });
            syncPills();
          }
          // #7 Free/On Sale 复选框 → pill 选中态（.on 类，兼容无 :has 的旧浏览器）
          syncChecks = () => {
            [fFree, fSale].forEach(el => {
              if (!el) return;
              const lbl = el.closest('.f-check');
              if (lbl) lbl.classList.toggle('on', el.checked);
            });
          };
          syncChecks();
          if (gameSearch) gameSearch.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(applyFilters, 200);
          });
          // A-Z 字母跳转条（#10，借鉴 CYRI A-Z 索引）：动态注入 filter-bar 下方
          // 点击字母 → 首字母过滤 + 滚动到列表顶部；再次点击同字母取消
          const azBar = document.createElement('div');
          azBar.className = 'az-bar';
          azBar.id = 'az-bar';
          const azLetters = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
          azBar.innerHTML = '<span class="az-bar-label">A–Z</span>' + azLetters.map(c =>
            `<button class="az-btn" data-az="${c}" type="button">${c}</button>`).join('');
          const filterBarEl = document.getElementById('filter-bar');
          if (filterBarEl) filterBarEl.after(azBar);
          let azActive = '';
          azBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.az-btn');
            if (!btn) return;
            const c = btn.dataset.az;
            // 再点一次同字母 = 取消
            azActive = (azActive === c) ? '' : c;
            azBar.querySelectorAll('.az-btn').forEach(b => b.classList.toggle('on', b.dataset.az === azActive));
            window.__AZ = azActive || '';
            applyFilters();
            if (azActive) {
              // 滚动到列表顶部（吸顶栏下方），让用户看到过滤结果
              const heroEl = document.querySelector('.hero');
              const topY = heroEl ? heroEl.getBoundingClientRect().bottom + window.scrollY - 60 : 0;
              window.scrollTo({ top: topY, behavior: 'smooth' });
            }
          });
          const moreBtn = document.getElementById('load-more');
          if (moreBtn) moreBtn.addEventListener('click', () => {
            shown += 60;
            render(window.__FILTERED || all);
          });
          if (fClear) fClear.addEventListener('click', () => {
            if (fYear) fYear.value = '';
            if (fGenre) fGenre.value = '';
            if (fFree) fFree.checked = false;
            if (fSale) fSale.checked = false;
            if (fSort) fSort.value = '';
            if (gameSearch) gameSearch.value = '';
            window.__AZ = '';
            azActive = '';
            azBar.querySelectorAll('.az-btn').forEach(b => b.classList.remove('on'));
            // #46/#47/#49 清空特性筛选（?feat=，多特性组合含排除）
            window.__FEAT_IDS = null;
            window.__FEAT_SLUGS = [];
            window.__FEAT_EXCL = [];
            const fh = document.getElementById('feat-hint');
            if (fh) fh.remove();
            try {
              const u = new URL(window.location.href);
              u.searchParams.delete('feat');
              history.replaceState(null, '', u.pathname + u.search + u.hash);
            } catch (e) {}
            applyFilters();
          });
        } catch (e) {
          gameList.innerHTML = '<p class="loading">Failed to load game database.</p>';
        }
      })();
    }
    // Game Gear：选中硬件后显示规格 + 🛒 购买链接
    const gearResult = document.getElementById('gear-result');
    if (gearResult) {
      document.getElementById('gpu-input').addEventListener('change', () => showGear('gpu'));
      document.getElementById('cpu-input').addEventListener('change', () => showGear('cpu'));
    }
    // ⌘K 深链：game-gear.html?gpu=...&cpu=...（命令面板硬件结果落点，预填并触发查询）
    // 注意竞态：change 触发 showGear 需要 HW 数据，须等 data.json 就绪（已就绪则立即执行）
    try {
      const _sp = new URLSearchParams(window.location.search);
      const _apply = () => ['gpu', 'cpu'].forEach(k => {
        const el = document.getElementById(k + '-input');
        const v = _sp.get(k);
        if (el && v) { el.value = v; el.dispatchEvent(new Event('change')); }
      });
      if (_sp.get('gpu') || _sp.get('cpu')) {
        if (HW.gpus.length) _apply();
        else (window.__HW_WAITERS = window.__HW_WAITERS || []).push(_apply);
      }
    } catch (e) {}
    function showGear(kind) {
      const input = document.getElementById(kind + '-input');
      const q = input.value.trim().toLowerCase();
      const list = kind === 'gpu' ? HW.gpus : HW.cpus;
      const hit = matchHw(list, q);  // 2026-08-10: 与判定同用精确分级匹配（防高估）
      if (!hit) { gearResult.innerHTML = ''; return; }
      const price = hit.p ? ` · $${hit.p}` : '';
      const buy = `<a class="gear-buy" href="https://www.amazon.com/s?k=${encodeURIComponent(hit.n)}&tag=caniplay0b-20" target="_blank" rel="sponsored noopener">🛒 Buy on Amazon</a>`;
      gearResult.innerHTML = `<div class="gear-card"><b>${hit.n}</b><span>${hit.m.toLocaleString()} marks${price}</span>${buy}</div>`;
    }
    // 排行榜区域 Tab 切换（+ 状态持久化）
    document.querySelectorAll('.rank-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.rank-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.rank-tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.querySelector(`.rank-tab-panel[data-tab="${btn.dataset.tab}"]`);
        if (panel) panel.classList.add('active');
        try { sessionStorage.setItem('caniplay_rank_tab', btn.dataset.tab); } catch (e) {}
      });
    });
    // 恢复上次选中的区域 Tab
    const savedTab = (() => { try { return sessionStorage.getItem('caniplay_rank_tab'); } catch (e) { return null; } })();
    const targetBtn = savedTab && document.querySelector(`.rank-tab-btn[data-tab="${savedTab}"]`)
      ? document.querySelector(`.rank-tab-btn[data-tab="${savedTab}"]`) : document.querySelector('.rank-tab-btn');
    if (targetBtn) targetBtn.click();
    // 页面级搜索（Top Games / Game Sales：按 data-name 过滤卡片/排行行）
    const pageSearch = document.getElementById('rank-search') || document.getElementById('sale-search');
    if (pageSearch) {
      pageSearch.addEventListener('input', () => {
        const q = pageSearch.value.trim().toLowerCase();
        document.querySelectorAll('.game-card, .rank-row').forEach(card => {
          const hit = !q || (card.dataset.name || '').includes(q);
          card.style.display = hit ? '' : 'none';
        });
      });
    }
    // 首页大搜索主入口：桌面端自动聚焦游戏搜索框（触屏设备跳过，避免弹键盘）
    if (document.getElementById('game-input') && !('ontouchstart' in window)) {
      const gi = document.getElementById('game-input');
      setTimeout(() => gi.focus({ preventScroll: true }), 300);
    }
    // ---- 分享按钮行（详情页，Steam 式分享）----
    // 仅游戏详情页注入：复制链接（剪贴板 API）+ X 分享（intent URL）+ 移动端原生分享
    const gamePage = document.querySelector('.game-page');
    if (gamePage) {
      const head = document.querySelector('.game-head');
      if (head) {
        const h1 = head.querySelector('h1');
        // 提取纯游戏名（剔除 platform-badge 等子元素文本）
        const gameName = (() => {
          if (!h1) return document.title;
          const clone = h1.cloneNode(true);
          clone.querySelectorAll('.platform-badge, .sale-badge, .free-badge').forEach(el => el.remove());
          return (clone.textContent || '').replace(/\s{2,}/g, ' ').trim() || document.title;
        })();
        const url = window.location.href;
        const mkBtn = (label, cls, onclick) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'share-btn' + (cls ? ' ' + cls : '');
          b.textContent = label;
          b.addEventListener('click', onclick);
          return b;
        };
        const row = document.createElement('div');
        row.className = 'share-row';
        const toast = () => {
          let t = document.querySelector('.share-toast');
          if (!t) {
            t = document.createElement('div');
            t.className = 'share-toast';
            document.body.appendChild(t);
          }
          t.textContent = '✅ Link copied';
          t.classList.add('show');
          clearTimeout(t._tm);
          t._tm = setTimeout(() => t.classList.remove('show'), 1800);
        };
        // 复制链接：优先 Clipboard API，降级 textarea + execCommand（非 https/file 场景）
        row.appendChild(mkBtn('🔗 Copy Link', '', () => {
          const done = () => toast();
          if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
          } else {
            fallbackCopy(url, done);
          }
        }));
        // X 分享（intent URL，新窗口打开）
        row.appendChild(mkBtn('𝕏 Share', '', () => {
          const text = encodeURIComponent('Can I play ' + gameName + ' on my PC?');
          window.open('https://twitter.com/intent/tweet?text=' + text + '&url=' + encodeURIComponent(url), '_blank', 'noopener,width=600,height=480');
        }));
        // QR 码分享（Steam 式）：懒加载 qrcode 库 → 弹层展示，手机扫码直达
        row.appendChild(mkBtn('📱 QR', 'qr-btn', () => showQrPopover(gameName, url)));
        // 移动端原生分享（Web Share API 可用时，优先系统分享面板）
        if (navigator.share) {
          row.appendChild(mkBtn('📤 Share', '', () => {
            navigator.share({ title: gameName, text: 'Can I play ' + gameName + ' on my PC?', url })
              .catch(() => {});
          }));
        }
        head.appendChild(row);
      }
      function fallbackCopy(text, done) {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          done();
        } catch (e) { done(); }
      }
      // ---- QR 码分享弹层（Steam 式，手机扫码直达）2026-08-14 ----
      // qrcode 库 ~20KB 懒加载（仅首次点击时拉取），弹层展示二维码 + 游戏名 + 链接；
      // Esc / 点遮罩 / ✕ 关闭。纯 assets 免重建。
      function showQrPopover(name, url) {
        const close = () => { const p = document.querySelector('.qr-pop'); if (p) p.remove(); };
        if (document.querySelector('.qr-pop')) close();
        const overlay = document.createElement('div');
        overlay.className = 'qr-pop';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML =
          '<div class="qr-card">' +
          '<button type="button" class="qr-x" aria-label="Close">✕</button>' +
          '<div class="qr-title">Scan to open on your phone</div>' +
          '<div class="qr-name"></div>' +
          '<div class="qr-body">Loading…</div>' +
          '<div class="qr-url"></div>' +
          '</div>';
        document.body.appendChild(overlay);
        overlay.querySelector('.qr-x').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        overlay.querySelector('.qr-name').textContent = name;
        overlay.querySelector('.qr-url').textContent = url;
        const onEsc = e => {
          if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
        };
        document.addEventListener('keydown', onEsc);
        const body = overlay.querySelector('.qr-body');
        // 懒加载 qrcode 库：与 app.js 同目录（取 app.js 的 src 推导，兼容 hash/query）
        const loadQr = () => new Promise((res, rej) => {
          if (window.qrcode) return res();
          const base = (() => {
            const s = document.querySelector('script[src*="app.js"]');
            return s ? s.src.replace(/app\.js.*$/, 'qrcode.min.js') : '../assets/qrcode.min.js';
          })();
          const sc = document.createElement('script');
          sc.src = base;
          sc.onload = () => res();
          sc.onerror = () => rej(new Error('qrcode lib load failed'));
          document.head.appendChild(sc);
        });
        loadQr().then(() => {
          const qr = qrcode(0, 'M');
          qr.addData(url);
          qr.make();
          body.innerHTML = '<div class="qr-box">' + qr.createImgTag(4, 2) + '</div>';
        }).catch(() => { body.textContent = 'QR unavailable'; });
      }
    }
  });
})();

/* #22 Sparkline 点击展开全历史表格（GG.deals price-history 式）2026-08-12
   点击排行榜行内趋势线 → 行下方展开 [日期 | 数值 | Δ] 全历史表；再点/点别处/Esc 关闭。
   数据来自生成器内嵌 data-pts（原始值 JSON），与 sparkline 同源，无伪造。 */
(() => {
  const isTopGames = !!document.querySelector('.rank-list');
  if (!isTopGames) return; // 仅 Top Games 页（零开销守卫，同 share 模式）

  const spFmt = (v, metric) => {
    v = Number(v);
    if (!isFinite(v)) return '?';
    if (metric === 'current_players') {
      return v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'K' : String(Math.round(v));
    }
    return String(Math.round(v));
  };
  const spFull = (v, metric) => {
    v = Number(v);
    if (!isFinite(v)) return '?';
    return metric === 'current_players' ? v.toLocaleString('en-US') + ' players' : String(Math.round(v));
  };
  const spDate = d => {
    const m = /(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
    return m ? String(Number(m[2])) + '/' + String(Number(m[3])) : d;
  };
  const spLabel = m => (m === 'current_players' ? 'Players' : 'Rank');
  const spTitle = m => (m === 'current_players' ? 'Online players history' : 'Rank history');

  let spPanel = null;

  function spClose() {
    if (spPanel) { spPanel.remove(); spPanel = null; }
    document.querySelectorAll('.rank-spark.open').forEach(s => s.classList.remove('open'));
  }

  function spOpen(svg) {
    const row = svg.closest('.rank-row');
    if (!row) return;
    const nameEl = row.querySelector('.rank-name');
    const name = nameEl ? nameEl.textContent.trim() : '?';
    const metric = svg.dataset.metric || '';
    let pts = [];
    try { pts = JSON.parse(svg.dataset.pts || '[]'); } catch (e) { pts = []; }
    if (pts.length < 2) return;

    // #23 历史最佳/区间：rank 类最小值=最佳排名；current_players 最大值=峰值
    let bestIdx = -1, bestVal = null, minVal = null, maxVal = null;
    {
      const nums = pts.map(p => Number(p[1])).filter(v => isFinite(v));
      if (nums.length) {
        minVal = Math.min(...nums);
        maxVal = Math.max(...nums);
        if (metric === 'current_players') { bestVal = maxVal; bestIdx = pts.findIndex(p => Number(p[1]) === bestVal); }
        else { bestVal = minVal; bestIdx = pts.findIndex(p => Number(p[1]) === bestVal); }
      }
    }

    const N = pts.length;

    /* #30 展开表缩放（GG.deals price-history 式）2026-08-13
       窗口 [lo,hi] 内渲染历史行 + 刻度轴；+/− 按钮或面板滚轮缩放，
       Reset 还原全量；数据与 sparkline 同源 data-pts，无伪造。 */
    let spWin = { lo: 0, hi: N - 1 };

    const spBuildRows = (lo, hi) => pts.slice(lo, hi + 1).map((p, k) => {
      const i = lo + k, d = p[0], cur = Number(p[1]);
      const prev = i > 0 ? Number(pts[i - 1][1]) : null;
      let delta = '<span class="sp-delta same">—</span>';
      if (prev !== null && isFinite(prev) && isFinite(cur) && prev !== cur) {
        // rank 类：值变小=上升；current_players：值变大=上升
        const diff = metric === 'current_players' ? cur - prev : prev - cur;
        const dir = diff > 0 ? 'up' : 'down';
        delta = `<span class="sp-delta ${dir}">${diff > 0 ? '▲' : '▼'}${spFmt(Math.abs(diff), metric)}</span>`;
      }
      const cls = (i === N - 1 ? 'cur' : '') + (i === bestIdx ? ' best' : '');
      const clsAttr = cls ? ` class="${cls}"` : '';
      return `<tr${clsAttr}><td>${spDate(d)}</td><td><b>${spFull(cur, metric)}</b></td><td>${delta}</td></tr>`;
    }).join('');

    // #28 日期刻度轴（GG.deals 式）：窗口内按快照时间比例均布刻度，首末日期锚定
    const spBuildAxis = (lo, hi) => {
      const sub = pts.slice(lo, hi + 1);
      const d0 = sub[0][0], d1 = sub[sub.length - 1][0];
      const t0 = Date.parse(d0), t1 = Date.parse(d1);
      if (!isFinite(t0) || !isFinite(t1) || t1 <= t0) return '';
      const ticks = sub.map(p => {
        const t = Date.parse(p[0]);
        const left = Math.max(0, Math.min(100, ((t - t0) / (t1 - t0)) * 100));
        return `<span class="sp-tick" style="left:${left.toFixed(1)}%"><i></i><b>${spDate(p[0])}</b></span>`;
      }).join('');
      return `<div class="sp-axis" aria-hidden="true">${ticks}</div>`;
    };

    const panel = document.createElement('div');
    panel.className = 'spark-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', spTitle(metric) + ' — ' + name);
    panel.innerHTML =
      `<div class="sp-head"><span class="sp-title"></span><span class="sp-sub"></span>` +
      `<span class="sp-range"></span>` +
      `<span class="sp-zoom">` +
      `<span class="sp-window"></span>` +
      `<button type="button" class="sp-zbtn sp-zi" aria-label="Zoom in">+</button>` +
      `<button type="button" class="sp-zbtn sp-zo" aria-label="Zoom out">−</button>` +
      `<button type="button" class="sp-zr" aria-label="Reset zoom">Reset</button>` +
      `</span>` +
      `<button type="button" class="sp-close" aria-label="Close history">✕</button></div>` +
      `<div class="sp-axis" aria-hidden="true"></div>` +
      `<table class="sp-table"><thead><tr><th>Date</th><th>${spLabel(metric)}</th><th>Δ</th></tr></thead>` +
      `<tbody></tbody></table>`;
    panel.querySelector('.sp-title').textContent = name;
    panel.querySelector('.sp-sub').textContent = `${spTitle(metric)} — ${N} snapshots`;
    // #23 GG.deals 式区间标注：历史最佳（rank 最小=最佳排名 / players 最大=峰值）+ min–max 区间
    const bestEl = panel.querySelector('.sp-range');
    if (bestIdx >= 0) {
      const tag = metric === 'current_players' ? 'Peak' : 'Best rank';
      bestEl.textContent = `${tag} ${spFull(bestVal, metric)} · Range ${spFmt(minVal, metric)}–${spFmt(maxVal, metric)}`;
    }
    const tbody = panel.querySelector('.sp-table tbody');
    const axisWrap = panel.querySelector('.sp-axis');
    const winEl = panel.querySelector('.sp-window');
    const ziEl = panel.querySelector('.sp-zi');
    const zoEl = panel.querySelector('.sp-zo');
    const zrEl = panel.querySelector('.sp-zr');

    const spRender = () => {
      const lo = spWin.lo, hi = spWin.hi;
      tbody.innerHTML = spBuildRows(lo, hi);
      const nax = spBuildAxis(lo, hi);
      if (nax === '') { axisWrap.innerHTML = ''; axisWrap.style.display = 'none'; }
      else { axisWrap.style.display = ''; axisWrap.innerHTML = nax; }
      const zoomed = !(lo === 0 && hi === N - 1);
      winEl.textContent = zoomed ? `${lo + 1}–${hi + 1} / ${N}` : `${N} snapshots`;
      zrEl.style.display = zoomed ? '' : 'none';
      ziEl.disabled = (hi - lo + 1) <= 2;
      zoEl.disabled = (hi - lo + 1) >= N;
    };
    const spZoom = dir => {
      const w = spWin.hi - spWin.lo + 1;
      if (dir > 0 && w <= 2) return;
      if (dir < 0 && w >= N) return;
      const nw = dir > 0 ? Math.max(2, Math.floor(w / 2)) : Math.min(N, w * 2);
      const c = (spWin.lo + spWin.hi) / 2;
      let lo = Math.round(c - (nw - 1) / 2);
      lo = Math.max(0, Math.min(lo, N - nw));
      spWin = { lo, hi: lo + nw - 1 };
      spRender();
    };
    ziEl.addEventListener('click', e => { e.stopPropagation(); spZoom(1); });
    zoEl.addEventListener('click', e => { e.stopPropagation(); spZoom(-1); });
    zrEl.addEventListener('click', e => { e.stopPropagation(); spWin = { lo: 0, hi: N - 1 }; spRender(); });
    panel.addEventListener('wheel', e => {
      const w = spWin.hi - spWin.lo + 1;
      if ((e.deltaY < 0 && w > 2) || (e.deltaY > 0 && w < N)) {
        e.preventDefault();
        spZoom(e.deltaY < 0 ? 1 : -1);
      }
    }, { passive: false });
    panel.querySelector('.sp-close').addEventListener('click', e => { e.stopPropagation(); spClose(); });

    spRender(); // 初始全量渲染（无缩放态）

    spClose(); // 同屏只开一个
    row.insertAdjacentElement('afterend', panel);
    svg.classList.add('open');
    spPanel = panel;
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  document.addEventListener('click', e => {
    const svg = e.target.closest ? e.target.closest('.rank-spark') : null;
    if (svg) {
      e.preventDefault();
      e.stopPropagation();
      if (spPanel && spPanel.previousElementSibling === svg.closest('.rank-row')) spClose();
      else spOpen(svg);
      return;
    }
    if (spPanel && !e.target.closest('.spark-panel')) spClose();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { spClose(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('rank-spark')) {
      e.preventDefault();
      const svg = e.target;
      if (spPanel && spPanel.previousElementSibling === svg.closest('.rank-row')) spClose();
      else spOpen(svg);
    }
  });
})();

/* #24 游戏对比（Game Compare，Steam compare 式）2026-08-12
   详情页 "⚖ Compare" 加入对比（localStorage 持久，上限 4 款）→ 全站浮动
   对比栏 → 弹层并排展示 MIN/REC 规格表（CPU/GPU/Memory/Storage），
   全行相同绿色 ✓、有差异琥珀高亮，缺失显示 —。纯 assets 免重建。 */
(() => {
  const KEY = 'caniplay_cmp';
  const MAX = 4;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const save = l => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) {} };

  /* ---- 详情页：解析当前游戏规格 + 注入 Compare 按钮 ----
     须等 DOMContentLoaded：share-row 由上一段在 DOMContentLoaded 内注入，
     本监听器注册更晚 → 执行顺序靠后，此时 share-row 已存在。 */
  document.addEventListener('DOMContentLoaded', () => {
  const gamePage = document.querySelector('.game-page');
  if (gamePage) {
    const head = document.querySelector('.game-head');
    const h1 = head && head.querySelector('h1');
    const name = h1 ? (h1.childNodes[0] ? (h1.childNodes[0].textContent || '').trim() : '') : '';
    const cover = head ? (head.querySelector('img.game-cover') || {}).src || '' : '';
    const genres = head && head.querySelector('.genres') ? head.querySelector('.genres').textContent.trim() : '';
    const date = head && head.querySelector('.date') ? head.querySelector('.date').textContent.trim() : '';
    const slug = (window.location.pathname.match(/game\/([^/]+)\.html/) || [])[1] || '';

    // 解析 .specs .spec-col 表：h3 头（Minimum/Recommended）+ tr[td,td]
    const specs = { min: {}, rec: {} };
    document.querySelectorAll('.specs .spec-col').forEach(col => {
      const h = col.querySelector('h3');
      const isMin = h && /minimum/i.test(h.textContent);
      const tbl = col.querySelector('table');
      if (!tbl) return;
      tbl.querySelectorAll('tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 2) return;
        const k = (tds[0].textContent || '').trim().toLowerCase();
        const v = (tds[1].textContent || '').trim();
        if (!k || !v) return;
        const bucket = isMin ? specs.min : specs.rec;
        if (/cpu/.test(k)) bucket.cpu = v;
        else if (/gpu|graphics|video/.test(k)) bucket.gpu = v;
        else if (/mem|ram/.test(k)) bucket.mem = v;
        else if (/stor|disk|space/.test(k)) bucket.disk = v;
      });
    });

    // 判定阈值（#check-btn data-thresholds 数值 mark/GB）→ 供 #26 My PC 对比行做达标判定
    let th = null;
    const jb = document.querySelector('#check-btn');
    if (jb && jb.dataset.thresholds) { try { th = JSON.parse(jb.dataset.thresholds); } catch (e) { th = null; } }

    const mkCmpBtn = () => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'share-btn cmp-btn';
      const inList = () => load().some(g => g.slug === slug);
      const refresh = () => {
        const on = inList();
        b.textContent = on ? '✓ In compare' : '⚖ Compare';
        b.classList.toggle('on', on);
        b.setAttribute('aria-label', (on ? 'Remove ' : 'Compare ') + (name || slug));
      };
      b.addEventListener('click', () => {
        let l = load();
        const idx = l.findIndex(g => g.slug === slug);
        if (idx >= 0) { l.splice(idx, 1); save(l); toast('🗑 Removed from compare'); }
        else {
          if (l.length >= MAX) l.shift(); // 超限丢最旧
          l.push({ slug, name: name || slug, cover, genres, date,
                   url: window.location.href, specs, th });
          save(l); toast('✅ Added to compare');
        }
        refresh();
        cmpSync();
      });
      refresh();
      return b;
    };

    // 挂在 share-row 末尾（share 注入在上一段，同 DOMContentLoaded 顺序执行）
    const row = document.querySelector('.share-row');
    if (row && name && slug) row.appendChild(mkCmpBtn());

    // #41 特性图标行（Steam 式）：懒加载特性数据（slug → 特性），注入 game-head-info
    // 数据源：appdetails_raw 的 Steam categories（build_features_data.py 生成），零伪造
    // 按首字母分桶拉取（features/<a-z|_>.json），无特性游戏只下载 ~1/26 数据量
    // ⚠️ isSub 在第一段 IIFE 内，本段（compare IIFE）不可见 → 自行推导
    const featBase = window.location.pathname.indexOf('/game/') !== -1 ? '../' : '';
    const _f0 = (slug[0] || '').toLowerCase();
    const featBucket = /^[a-z]$/.test(_f0) ? _f0 : '_';
    fetch(featBase + 'assets/data/features/' + featBucket + '.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('no features bucket'))))
      .then(fm => {
        const feats = fm[slug];
        if (!feats || !feats.length) return;
        const head = document.querySelector('.game-head-info');
        if (!head) return;
        const box = document.createElement('div');
        box.className = 'feat-chips';
        box.setAttribute('aria-label', 'Game features');
        // #46 特性 chips → 可点击筛选深链（Steam categories 式）：?feat=<slug> → games.html 按 appid 集合过滤
        box.innerHTML = feats.map(f => {
          const [icon, ...rest] = f.split(' ');
          const label = rest.join(' ');
          const fs = label.toLowerCase().replace(/\s+/g, '-');
          return `<a class="feat-chip" href="${featBase}games.html?feat=${encodeURIComponent(fs)}" title="${esc(f)}"><span class="feat-ico" aria-hidden="true">${esc(icon)}</span>${esc(label)}</a>`;
        }).join('');
        // 插在 genres 之后（date 之前）
        const ref = head.querySelector('.genres');
        if (ref && ref.nextSibling) head.insertBefore(box, ref.nextSibling);
        else head.appendChild(box);
      })
      .catch(() => { /* 无数据/离线静默：详情页无 chips 不影响功能 */ });
  }
  });

  /* ---- 全站：浮动对比栏 + 弹层 ---- */
  let cmpFab = null, cmpModal = null;

  function toast(msg) {
    let t = document.querySelector('.share-toast');
    if (!t) { t = document.createElement('div'); t.className = 'share-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tm);
    t._tm = setTimeout(() => t.classList.remove('show'), 1800);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function norm(v) { return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  function buildModal() {
    const l = load();
    const n = l.length;
    const hw = loadHw();

    const overlay = document.createElement('div');
    overlay.className = 'cmp-overlay';
    overlay.innerHTML = `<div class="cmp-modal" role="dialog" aria-modal="true" aria-label="Compare games">
      <div class="cmp-head">
        <span class="cmp-title">⚖ Compare Games</span>
        <span class="cmp-count">${n}/${MAX}</span>
        <button type="button" class="cmp-clear"${n ? '' : ' disabled'}>Clear all</button>
        <button type="button" class="cmp-close" aria-label="Close">✕</button>
      </div>
      <div class="cmp-hw">
        <div class="cmp-hw-head">🖥 My PC vs these games <span class="cmp-hw-hint">live check with your hardware — same engine as game pages</span></div>
        <div class="cmp-hw-inputs">
          <input id="cmp-hw-gpu" type="text" placeholder="GPU (e.g. RTX 3060)" autocomplete="off" value="${esc(hw.gpu || '')}">
          <input id="cmp-hw-cpu" type="text" placeholder="CPU (e.g. i5-12400F)" autocomplete="off" value="${esc(hw.cpu || '')}">
          <select id="cmp-hw-ram" title="RAM">
            ${['8','16','32','64','4'].map(v => `<option value="${v}"${String(hw.ram) === v ? ' selected' : ''}>${v} GB RAM</option>`).join('')}
          </select>
        </div>
        <div class="cmp-hw-body"></div>
      </div>
      <div class="cmp-scroll">${n < 2
        ? `<div class="cmp-empty">Add at least 2 games to compare — open a game page and press <b>⚖ Compare</b>.</div>`
        : cmpTableHtml(l)}
      </div></div>`;

    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('.cmp-close')) { overlay.remove(); cmpModal = null; return; }
      if (e.target.closest('.cmp-clear')) { save([]); cmpSync(); return; }
      const rm = e.target.closest('.cmp-rm');
      if (rm) {
        const slug = rm.dataset.slug;
        save(load().filter(g => g.slug !== slug));
        cmpSync();
      }
    });
    wireHwInputs(overlay);
    renderHwBody(overlay);
    return overlay;
  }

  /* ---- #26 My PC 对比行：硬件持久化 + 达标判定（复用 window.matchHw，与详情页同口径） ---- */
  const HW_KEY = 'caniplay_hw';
  const loadHw = () => { try { const h = JSON.parse(localStorage.getItem(HW_KEY)) || {}; if (!h.ram) h.ram = '16'; return h; } catch (e) { return { ram: '16' }; } };
  const saveHw = h => { try { localStorage.setItem(HW_KEY, JSON.stringify(h)); } catch (e) {} };

  let hwWaiting = false;
  function renderHwBody(overlay) {
    const body = overlay.querySelector('.cmp-hw-body');
    if (!body) return;
    const l = load();
    const hw = loadHw();
    if (!window.__HW) {
      body.innerHTML = '<div class="cmp-hw-msg">Loading hardware database…</div>';
      if (!hwWaiting) {
        hwWaiting = true;
        (window.__HW_WAITERS = window.__HW_WAITERS || []).push(() => {
          hwWaiting = false;
          if (cmpModal && cmpModal.isConnected) renderHwBody(cmpModal);
        });
      }
      return;
    }
    if (!hw.gpu && !hw.cpu) {
      body.innerHTML = '<div class="cmp-hw-msg">Enter your GPU &amp; CPU above — every game gets a ✅ / ❌ pass check against its minimum requirements.</div>';
      return;
    }
    body.innerHTML = hwBodyHtml(l, hw);
  }

  function hwBodyHtml(l, hw) {
    const HW = window.__HW;
    const judged = l.map(g => hwStatus(g, hw, HW));
    const rows = [
      ['GPU', s => `${s.gpu.ok ? '✅' : '❌'} ${s.gpu.n} · ${s.gpu.m.toLocaleString()}`],
      ['CPU', s => `${s.cpu.ok ? '✅' : '❌'} ${s.cpu.n} · ${s.cpu.m.toLocaleString()}`],
      ['RAM', s => `${s.ram.ok ? '✅' : '❌'} ${s.ram.gb} GB`]
    ];
    let html = '<table class="cmp-hw-table"><tbody>';
    rows.forEach(([label, cellText]) => {
      html += `<tr class="cmp-hw-row"><td class="cmp-hw-label">${label}</td>`;
      judged.forEach(s => {
        html += `<td class="cmp-hw-cell ${s ? 'hw-' + s.cls : 'hw-na'}">${s ? cellText(s) : '—'}</td>`;
      });
      html += '</tr>';
    });
    // 判定汇总行：每个游戏一个状态 pill + 达标 X/Y 汇总徽章（#27）
    html += '<tr class="cmp-hw-row"><td class="cmp-hw-label">Can I play?</td>';
    judged.forEach(s => {
      if (!s) { html += '<td class="hw-na">—</td>'; return; }
      const icon = s.cls === 'ok' ? '✅' : (s.cls === 'warn' ? '⚠️' : '❌');
      const passN = (s.gpu.ok ? 1 : 0) + (s.cpu.ok ? 1 : 0) + (s.ram.ok ? 1 : 0);
      html += `<td><span class="cmp-verdict v-${s.cls}">${icon} ${esc(s.v)}</span><span class="cmp-pass p-${s.cls}" title="components meeting MIN requirements">${passN}/3 达标</span></td>`;
    });
    html += '</tr></tbody></table>';
    return html;
  }

  // 单款游戏 vs 我的硬件：全部按 MIN 阈值判定（能不能玩），全达 rec 升级为 Runs great
  function hwStatus(g, hw, HW) {
    const th = g.th;
    if (!th || !hw.gpu || !hw.cpu || !hw.ram) return null;
    const gpu = window.matchHw(HW.gpus, hw.gpu);
    const cpu = window.matchHw(HW.cpus, hw.cpu);
    const ram = parseFloat(hw.ram);
    if (!gpu || !cpu || !isFinite(ram)) return null;
    const mg = th.mg || 0, rg = th.rg || 0, mc = th.mc || 0, rc = th.rc || 0;
    const mram = th.mram || 4, rram = th.rram || 16;
    const gpuOk = gpu.m >= mg, gpuGreat = gpu.m >= rg;
    const cpuOk = cpu.m >= mc, cpuGreat = cpu.m >= rc;
    const ramOk = ram >= mram, ramGreat = ram >= rram;
    let v, cls;
    if (gpuGreat && cpuGreat && ramGreat) { v = 'Runs great'; cls = 'ok'; }
    else if (gpuOk && cpuOk && ramOk) { v = 'Runs'; cls = 'ok'; }
    else if (gpuOk && (!cpuOk || !ramOk)) { v = 'Weak'; cls = 'warn'; }
    else { v = "Can't run"; cls = 'no'; }
    return {
      v, cls,
      gpu: { n: gpu.n, m: gpu.m, ok: gpuOk, great: gpuGreat },
      cpu: { n: cpu.n, m: cpu.m, ok: cpuOk, great: cpuGreat },
      ram: { gb: ram, ok: ramOk, great: ramGreat }
    };
  }

  function wireHwInputs(overlay) {
    const gpu = overlay.querySelector('#cmp-hw-gpu');
    const cpu = overlay.querySelector('#cmp-hw-cpu');
    const ram = overlay.querySelector('#cmp-hw-ram');
    if (!gpu || !cpu || !ram) return;
    const commit = () => {
      saveHw({ gpu: gpu.value.trim(), cpu: cpu.value.trim(), ram: ram.value });
      renderHwBody(overlay);
    };
    gpu.addEventListener('input', commit);
    cpu.addEventListener('input', commit);
    ram.addEventListener('change', commit);
  }

  // Esc 关闭：单一全局监听（避免每开一次弹层注册一个）
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && cmpModal && cmpModal.isConnected) {
      cmpModal.remove(); cmpModal = null;
    }
  });

  function cmpTableHtml(l) {
    const rowDefs = [
      ['Minimum Requirements', ['cpu', 'gpu', 'mem', 'disk']],
      ['Recommended Requirements', ['cpu', 'gpu', 'mem', 'disk']]
    ];
    const labels = { cpu: 'CPU', gpu: 'GPU', mem: 'Memory', disk: 'Storage' };
    let html = '<table class="cmp-table"><thead><tr><th class="cmp-th-label"></th>';
    l.forEach(g => {
      html += `<th class="cmp-th-game"><div class="cmp-th-inner">
        <img src="${esc(g.cover)}" alt="" loading="lazy" onerror="this.style.display='none'">
        <a class="cmp-name" href="${esc(g.url)}">${esc(g.name)}</a>
        <button type="button" class="cmp-rm" data-slug="${esc(g.slug)}" aria-label="Remove ${esc(g.name)}">✕</button>
      </div></th>`;
    });
    html += '</tr></thead><tbody>';

    rowDefs.forEach(([sec, keys]) => {
      html += `<tr class="cmp-sec"><td colspan="${l.length + 1}">${sec}</td></tr>`;
      keys.forEach(k => {
        const vals = l.map(g => (g.specs || {})[sec === 'Minimum Requirements' ? 'min' : 'rec'][k] || '');
        const nonEmpty = vals.filter(v => v);
        const allSame = nonEmpty.length > 0 && nonEmpty.every(v => norm(v) === norm(nonEmpty[0]));
        html += `<tr class="cmp-row${allSame ? ' same' : (nonEmpty.length >= 2 ? ' diff' : '')}">
          <td class="cmp-row-label">${labels[k]}</td>`;
        vals.forEach(v => {
          html += `<td class="cmp-cell">${v ? esc(v) : '<span class="cmp-na">—</span>'}</td>`;
        });
        html += '</tr>';
      });
    });
    html += '</tbody></table>';
    return html;
  }

  function cmpSync() {
    const l = load();
    if (!cmpFab) {
      cmpFab = document.createElement('button');
      cmpFab.type = 'button';
      cmpFab.className = 'cmp-fab';
      cmpFab.setAttribute('aria-label', 'Compare games');
      cmpFab.addEventListener('click', () => {
        if (cmpModal) { cmpModal.remove(); cmpModal = null; return; }
        cmpModal = buildModal();
        document.body.appendChild(cmpModal);
      });
      document.body.appendChild(cmpFab);
    }
    cmpFab.textContent = `⚖ Compare (${l.length})`;
    cmpFab.classList.toggle('show', l.length >= 1);
    if (cmpModal && cmpModal.isConnected) {
      const fresh = buildModal();
      cmpModal.replaceWith(fresh);
      cmpModal = fresh;
    }
  }

  // 跨标签页同步
  window.addEventListener('storage', e => { if (e.key === KEY) cmpSync(); });
  cmpSync();
})();

/* #32 My PC 自动判定（CYRI 式，2026-08-13）：
   复用 #26 对比弹层持久化的 caniplay_hw（localStorage），详情页打开即自动
   预填 GPU/CPU/RAM 并触发判定（打开即出结果，零输入）；提示条可一键清除
   （清 localStorage + 清输入框 + 清判定区）；详情页手动 Check 的新值反向写回
   caniplay_hw（与对比弹层共享同一份 My PC 硬件）。纯 assets 免重建。 */
(() => {
  const btn = document.querySelector('#check-btn');
  if (!btn) return;                       // 仅详情页有
  const gpuInp = document.getElementById('gpu-input');
  const cpuInp = document.getElementById('cpu-input');
  const ramSel = document.getElementById('ram-select');
  const verdict = document.getElementById('verdict');
  if (!gpuInp || !cpuInp || !ramSel || !verdict) return;
  const HW_KEY = 'caniplay_hw';
  let hw = {};
  try { hw = JSON.parse(localStorage.getItem(HW_KEY)) || {}; } catch (e) { hw = {}; }
  // #45 分享判定深链（CYRI 式）：URL ?gpu=&cpu=&ram= 显式硬件——来自他人分享的判定链接，
  // 优先级高于本地保存的 My PC（显式意图），打开即自动判定同一配置；并写回 caniplay_hw
  // （对比弹层/下次访问复用同一份 My PC）。
  const qps = new URLSearchParams(window.location.search);
  const urlGpu = (qps.get('gpu') || '').trim();
  const urlCpu = (qps.get('cpu') || '').trim();
  const urlRam = (qps.get('ram') || '').trim();
  const fromUrl = !!(urlGpu || urlCpu || urlRam);
  if (urlGpu) hw.gpu = urlGpu;
  if (urlCpu) hw.cpu = urlCpu;
  if (urlRam && /^\d+$/.test(urlRam)) hw.ram = parseInt(urlRam, 10);
  if (!hw.gpu && !hw.cpu) return;         // 从未保存过硬件且无分享参数 → 不打扰
  if (fromUrl) {
    try { localStorage.setItem(HW_KEY, JSON.stringify({ gpu: hw.gpu || '', cpu: hw.cpu || '', ram: hw.ram || 16 })); } catch (e) {}
  }

  // 预填（仅当输入框为空，避免覆盖用户手输）
  if (!gpuInp.value && hw.gpu) gpuInp.value = hw.gpu;
  if (!cpuInp.value && hw.cpu) cpuInp.value = hw.cpu;
  if (hw.ram) { const o = [...ramSel.options].find(x => x.value === String(hw.ram)); if (o) ramSel.value = String(hw.ram); }

  // 提示条（说明自动判定来源 + 一键清除）
  const hint = document.createElement('div');
  hint.className = 'hw-hint';
  const chip = (l, v) => `<span class="hw-chip"><b>${l}</b> ${v}</span>`;
  hint.innerHTML = (fromUrl ? '🔗 Check from shared link' : '🖥 Auto-checked with your saved PC') +
    ` ${chip('GPU', hw.gpu || '—')} ${chip('CPU', hw.cpu || '—')} ${chip('RAM', (hw.ram || 16) + ' GB')}` +
    `<button type="button" class="hw-clear" title="Clear saved PC & inputs">✕ Clear</button>`;
  verdict.parentNode.insertBefore(hint, verdict);
  hint.querySelector('.hw-clear').addEventListener('click', () => {
    try { localStorage.removeItem(HW_KEY); } catch (e) {}
    gpuInp.value = ''; cpuInp.value = '';
    verdict.innerHTML = '';
    hint.remove();
  });

  // HW 数据就绪后自动判定（与 ⌘K 面板同用 __HW_WAITERS 防竞态）
  const auto = () => { try { btn.click(); } catch (e) {} };
  if (window.__HW && window.__HW.gpus && window.__HW.gpus.length) auto();
  else (window.__HW_WAITERS = window.__HW_WAITERS || []).push(auto);

  // 反向写回：手动 Check 时把当前输入存为 My PC（对比弹层跨页复用）
  btn.addEventListener('click', () => {
    const g = gpuInp.value.trim(), c = cpuInp.value.trim();
    if (!g && !c) return;
    try { localStorage.setItem(HW_KEY, JSON.stringify({ gpu: g, cpu: c, ram: ramSel.value })); } catch (e) {}
  });
})();

/* #33 Auto-detect My PC（CYRI 式，2026-08-13）：
   从浏览器探测真实硬件：WebGL renderer 解析 GPU 型号（真实）、navigator.deviceMemory
   取 RAM（真实）、hardwareConcurrency 取 CPU 核数（型号浏览器不可读，标注为猜测）。
   探测结果填入判定表单 → 写回 caniplay_hw（与 #26/#32 共享）→ 自动判定。
   探测不到就明说（不编造型号）；探测来源标注 guess 提示。纯 assets 免重建。 */
(() => {
  const btn = document.querySelector('#check-btn');
  if (!btn) return;
  const gpuInp = document.getElementById('gpu-input');
  const cpuInp = document.getElementById('cpu-input');
  const ramSel = document.getElementById('ram-select');
  if (!gpuInp || !cpuInp || !ramSel) return;

  // 注入按钮（Check 旁，放进 .hw-actions 容器与 Check 同宽并排）
  const d = document.createElement('button');
  d.type = 'button';
  d.className = 'detect-btn';
  d.textContent = '🎯 Auto-detect';
  d.title = 'Detect your PC from the browser (GPU/RAM real, CPU cores only — CPU model is a guess)';
  const actions = btn.closest('.hw-actions');
  if (actions) actions.appendChild(d);
  else btn.parentNode.insertBefore(d, btn);

  const HW = () => window.__HW || { gpus: [], cpus: [] };

  // WebGL renderer → GPU 型号（如 "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)"）
  function detectGPU() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return '';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (!ext) return '';
      let s = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
      if (!s) return '';
      s = s.replace(/^ANGLE\s*\(/, '').replace(/\)\s*$/, '');
      const seg = s.split(',')[1] || s.split(',')[0] || '';
      // 去 Direct3D/OpenGL/Vulkan 渲染器后缀
      return seg.replace(/\s+(Direct3D|OpenGL|Vulkan).*$/i, '').trim();
    } catch (e) { return ''; }
  }

  // 匹配时剥离厂商前缀（NVIDIA/AMD/Intel），命中库标准名；防高估原则不变
  function matchDetected(list, raw) {
    if (!list.length) return null;
    const bare = raw.replace(/^(nvidia|amd|intel)\s+/i, '');
    return (window.matchHw || matchHw)(list, raw) || (bare !== raw ? (window.matchHw || matchHw)(list, bare) : null);
  }

  function nearestRamOption(gb) {
    const opts = [...ramSel.options].map(o => parseFloat(o.value)).filter(v => !isNaN(v));
    if (!opts.length) return '16';
    return String(opts.reduce((a, b) => Math.abs(b - gb) < Math.abs(a - gb) ? b : a));
  }

  function run() {
    const hw = HW();
    const notes = [];
    // GPU：WebGL 真实探测 → matchHw 精确匹配库（防高估，匹配不到用原文并标注）
    let gpuName = detectGPU();
    if (gpuName) {
      const hit = matchDetected(hw.gpus, gpuName);
      if (hit) { gpuName = hit.n; notes.push('GPU detected: ' + hit.n); }
      else notes.push('GPU detected (not in DB, entered as-is): ' + gpuName);
    } else {
      notes.push('GPU not detectable in this browser');
    }
    // RAM：deviceMemory 真实值（Chrome/Edge）；无则留默认 16 并标注
    let ram = '16';
    const dm = navigator.deviceMemory;
    if (typeof dm === 'number' && dm > 0) { ram = nearestRamOption(dm); notes.push('RAM detected: ~' + dm + ' GB'); }
    else notes.push('RAM not detectable — left at ' + ram + ' GB');
    // CPU：只有核数（型号浏览器不可读）→ 生成 "N-core CPU (guess)" 并明确标注猜测
    let cpuName = '';
    const cores = navigator.hardwareConcurrency;
    if (cores && cores > 0) {
      cpuName = cores + '-core CPU';
      const hit = hw.cpus.length ? (window.matchHw || matchHw)(hw.cpus, cpuName) : null;
      if (hit) { cpuName = hit.n; notes.push('CPU cores: ' + cores + ' (matched ' + hit.n + ')'); }
      else notes.push('CPU: ' + cores + '-core (guess — browser can\'t read model, please confirm)');
    } else {
      notes.push('CPU not detectable');
    }
    // 填表单
    if (gpuName) gpuInp.value = gpuName;
    if (cpuName) cpuInp.value = cpuName;
    const ro = [...ramSel.options].find(o => o.value === ram);
    if (ro) ramSel.value = ram;
    // 写回 caniplay_hw（与 #26/#32 共享同一份 My PC）
    try { localStorage.setItem('caniplay_hw', JSON.stringify({ gpu: gpuName, cpu: cpuName, ram })); } catch (e) {}
    // 提示条（标注探测来源，猜测项明说）
    const verdict = document.getElementById('verdict');
    const hint = document.createElement('div');
    hint.className = 'hw-hint detect-note';
    hint.innerHTML = `🎯 Auto-detected from browser — ${notes.join(' · ')}` +
      `<button type="button" class="hw-clear" title="Dismiss">✕</button>`;
    hint.querySelector('.hw-clear').addEventListener('click', () => hint.remove());
    if (verdict) verdict.parentNode.insertBefore(hint, verdict);
    else btn.parentNode.appendChild(hint);
    // 自动判定（等 HW 就绪由外层逻辑处理）
    try { btn.click(); } catch (e) {}
  }

  d.addEventListener('click', () => {
    if (window.__HW && window.__HW.gpus && window.__HW.gpus.length) run();
    else (window.__HW_WAITERS = window.__HW_WAITERS || []).push(run);
  });
})();

/* #35 详情页头部信息区块化（Steam 式，2026-08-14）：
   ① genre 文本（"Action, RPG"）→ 可点击标签 chips → games.html?genre= 深链过滤
   ② 公司行（"🏢 Devs · Pubs"）→ Developer / Publisher 分行标注
   ③ 封面图 URL 解析 appid → View on Steam 商店按钮（解析失败不渲染，不编造）
   纯 assets 免重建；数据全部来自页面真实内容（服务端 DB 渲染）。 */
(() => {
  const head = document.querySelector('.game-page .game-head');
  if (!head) return;                       // 仅详情页
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isSub = window.location.pathname.indexOf('/game/') !== -1;
  const base = isSub ? '../' : '';

  // ① genre → 可点击 chips（Steam 商店页标签区）
  const genresP = head.querySelector('p.genres');
  if (genresP && !genresP.querySelector('a')) {
    const tags = (genresP.textContent || '').split(',').map(s => s.trim()).filter(Boolean);
    if (tags.length) {
      genresP.className = 'genres genre-tags';
      genresP.innerHTML = tags.map(t =>
        `<a class="genre-tag" href="${base}games.html?genre=${encodeURIComponent(t)}">${esc(t)}</a>`).join('');
    }
  }

  // ② 公司行 → Developer / Publisher 分行（Steam 式信息标注）
  const companyP = head.querySelector('p.company');
  if (companyP && !companyP.querySelector('span')) {
    const raw = (companyP.textContent || '').replace(/^🏢\s*/, '').trim();
    const parts = raw.split('·').map(s => s.trim()).filter(Boolean);
    if (parts.length) {
      const dev = parts[0];
      const pub = parts.slice(1).join(', ');
      companyP.className = 'company meta-lines';
      companyP.innerHTML =
        `<span class="meta-line"><b>Developer:</b> ${esc(dev)}</span>` +
        (pub ? `<span class="meta-line"><b>Publisher:</b> ${esc(pub)}</span>` : '');
    }
  }

  // ③ View on Steam（appid 从封面图 steam/apps/<id>/ 解析，失败则不渲染）
  const cover = head.querySelector('img.game-cover');
  if (cover) {
    const m = (cover.getAttribute('src') || '').match(/steam\/apps\/(\d+)\//);
    if (m) {
      const appid = m[1];
      const a = document.createElement('a');
      a.className = 'steam-btn';
      a.href = 'https://store.steampowered.com/app/' + appid + '/';
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = 'Open Steam store page';
      a.innerHTML = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 0a8 8 0 0 0-2.51 15.61c-.19-.1-.19-.45-.1-.67l.86-2.93c1.53.93 3.5 1.1 5.22.45 2.2-.85 3.65-3 3.5-5.42C15.62 3.7 12.2.4 8 0Zm.05 8.7-3.9 1.27a.4.4 0 0 1-.24-.76l3.9-1.28a.4.4 0 0 1 .24.77Zm3.76-1.6a1.15 1.15 0 1 1-1.15-1.15 1.15 1.15 0 0 1 1.15 1.15Z" fill="currentColor"/></svg>View on Steam';
      // 放入 share-row（share-row 由更早注册的 DOMContentLoaded 回调注入，本回调注册更晚 → 已存在）
      const place = () => {
        const row = head.querySelector('.share-row');
        (row || head).appendChild(a);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place);
      else place();
    }
  }
})();

/* ===== 8/14 媒体悬浮窗：图片画廊(左右切换) + HLS 视频站内播放 ===== */
(() => {
  // 悬浮层 DOM
  const ov = document.createElement('div');
  ov.className = 'media-overlay';
  ov.style.display = 'none';
  ov.innerHTML = `
    <div class="mo-bg"></div>
    <button class="mo-close" aria-label="Close">✕</button>
    <button class="mo-prev" aria-label="Previous">‹</button>
    <div class="mo-stage"><img class="mo-img" alt=""><video class="mo-video" controls playsinline></video></div>
    <button class="mo-next" aria-label="Next">›</button>
    <div class="mo-dots"></div>
  `;
  document.body.appendChild(ov);

  const bg = ov.querySelector('.mo-bg');
  const closeBtn = ov.querySelector('.mo-close');
  const prevBtn = ov.querySelector('.mo-prev');
  const nextBtn = ov.querySelector('.mo-next');
  const img = ov.querySelector('.mo-img');
  const video = ov.querySelector('.mo-video');
  const dotsBox = ov.querySelector('.mo-dots');

  let imgs = [];      // 当前画廊图片列表
  let cur = 0;
  let hlsPlayer = null; // hls.js 实例

  function closeOverlay() {
    ov.style.display = 'none';
    img.style.display = 'none';
    video.pause(); video.removeAttribute('src'); video.load();
    if (hlsPlayer) { try { hlsPlayer.destroy(); } catch(e){} hlsPlayer = null; }
  }
  function showImg(i) {
    cur = (i + imgs.length) % imgs.length;
    img.src = imgs[cur];
    img.style.display = 'block';
    video.style.display = 'none';
    // 圆点
    dotsBox.innerHTML = imgs.map((_, k) =>
      `<span class="mo-dot${k === cur ? ' on' : ''}" data-i="${k}"></span>`).join('');
    prevBtn.style.display = imgs.length > 1 ? 'block' : 'none';
    nextBtn.style.display = imgs.length > 1 ? 'block' : 'none';
  }
  function playHls(url) {
    img.style.display = 'none';
    video.style.display = 'block';
    video.src = url; // 若浏览器原生支持 m3u8（Safari）直接用
    video.play().catch(() => {});
    // 非 Safari：懒加载 hls.js
    if (window.Hls) {
      hlsPlayer = new Hls();
      hlsPlayer.loadSource(url);
      hlsPlayer.attachMedia(video);
      hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    }
    // 无 hls.js 且浏览器不支持 → video 会报错，提示降级
    video.onerror = () => { video.src = ''; };
  }

  // 图片画廊：收集所有 .ss-item
  document.addEventListener('click', (e) => {
    const item = e.target.closest('.ss-item');
    if (item) {
      e.preventDefault();
      imgs = [...document.querySelectorAll('.ss-item')].map(a => a.dataset.full).filter(Boolean);
      cur = imgs.indexOf(item.dataset.full);
      if (cur < 0) cur = 0;
      ov.style.display = 'flex';
      showImg(cur);
      return;
    }
    // HLS 视频
    const tc = e.target.closest('.trailer-hls');
    if (tc) {
      e.preventDefault();
      ov.style.display = 'flex';
      imgs = []; dotsBox.innerHTML = '';
      prevBtn.style.display = 'none'; nextBtn.style.display = 'none';
      playHls(tc.dataset.hls);
      return;
    }
  });

  // 控制
  prevBtn.addEventListener('click', () => showImg(cur - 1));
  nextBtn.addEventListener('click', () => showImg(cur + 1));
  closeBtn.addEventListener('click', closeOverlay);
  bg.addEventListener('click', closeOverlay);
  dotsBox.addEventListener('click', (e) => {
    const d = e.target.closest('.mo-dot');
    if (d) showImg(+d.dataset.i);
  });
  document.addEventListener('keydown', (e) => {
    if (ov.style.display === 'none') return;
    if (e.key === 'Escape') closeOverlay();
    else if (e.key === 'ArrowLeft' && imgs.length) showImg(cur - 1);
    else if (e.key === 'ArrowRight' && imgs.length) showImg(cur + 1);
  });
  // 触控滑动切换
  let tx = 0;
  ov.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  ov.addEventListener('touchend', (e) => {
    if (ov.style.display === 'none' || !imgs.length) return;
    const dx = e.changedTouches[0].clientX - tx;
    if (dx < -40) showImg(cur + 1);
    else if (dx > 40) showImg(cur - 1);
  }, { passive: true });
})();

/* #40 硬件对比（Hardware Compare，PassMark/UserBenchmark 式，2026-08-15）：
   hardware.html 排行表每行注入 ⚖ Compare 按钮 → 点选加入对比列表
   （localStorage caniplay_hwc，上限 4）→ 浮动栏 → 弹层并排对比：
   行 = Type / Mark（按最大值比例条 + % + 最优绿标）/ Rank（最小=最优）/ Price（最低=最优）；
   弹层顶部搜索框可从全量硬件目录（data.json gpus/cpus，含 PassMark rank+price）
   任意添加 GPU/CPU 对比（不止 Top20 行内）；✕/Clear all/Esc/点外关闭，
   跨标签页 storage 同步。纯 assets 免重建。 */
(() => {
  const KEY = 'caniplay_hwc';
  const MAX = 4;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const save = l => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) {} };

  function hwcToast(msg) {
    let t = document.querySelector('.share-toast');
    if (!t) { t = document.createElement('div'); t.className = 'share-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tm);
    t._tm = setTimeout(() => t.classList.remove('show'), 1800);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---- hardware.html：排行表行内注入 ⚖ 按钮（仅含 Mark 列的性能表） ---- */
  document.querySelectorAll('.rank-table').forEach(tbl => {
    const thead = tbl.querySelector('thead');
    if (!thead || !/mark/i.test(thead.textContent)) return;   // 跳过 Value/Samples 表
    const isCpu = /cpu/i.test(thead.textContent);
    tbl.querySelectorAll('tbody tr').forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 3) return;
      const rank = parseInt((tds[0].textContent || '').replace(/[^0-9]/g, ''), 10);
      const name = (tds[1].textContent || '').trim();
      const mark = parseInt((tds[2].textContent || '').replace(/[^0-9]/g, ''), 10);
      if (!name || !mark) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hwc-add';
      btn.setAttribute('aria-label', 'Compare ' + name);
      const inList = () => load().some(h => h.n === name);
      const refresh = () => {
        btn.textContent = inList() ? '✓' : '⚖';
        btn.classList.toggle('on', inList());
      };
      btn.addEventListener('click', () => {
        let l = load();
        const idx = l.findIndex(h => h.n === name);
        if (idx >= 0) { l.splice(idx, 1); save(l); hwcToast('🗑 Removed from compare'); }
        else {
          if (l.length >= MAX) l.shift();
          l.push({ t: isCpu ? 'cpu' : 'gpu', n: name, m: mark, r: rank || null, p: null });
          save(l); hwcToast('✅ Added to compare');
        }
        refresh(); hwcSync();
      });
      refresh();
      const td = document.createElement('td');
      td.className = 'hwc-td';
      td.appendChild(btn);
      tr.appendChild(td);
    });
  });

  /* ---- 弹层：并排对比表 + 全量目录搜索添加 ---- */
  let hwcFab = null, hwcModal = null;

  function enrich(l) {
    // 用 HW 目录（data.json，含 rank/price）补齐 p/r；目录无此型号则保留行内值
    const HW = window.__HW;
    if (!HW) return l;
    return l.map(h => {
      const pool = h.t === 'cpu' ? HW.cpus : HW.gpus;
      const hit = (pool || []).find(x => x.n === h.n);
      if (!hit) return h;
      return { t: h.t, n: h.n, m: h.m || hit.m, r: h.r || hit.r || null, p: h.p || hit.p || null };
    });
  }

  function buildHwcModal() {
    let l = enrich(load());
    const n = l.length;

    const overlay = document.createElement('div');
    overlay.className = 'cmp-overlay';
    overlay.innerHTML = `<div class="cmp-modal hwc-modal" role="dialog" aria-modal="true" aria-label="Compare hardware">
      <div class="cmp-head">
        <span class="cmp-title">⚖ Compare Hardware</span>
        <span class="cmp-count">${n}/${MAX}</span>
        <div class="hwc-search-wrap">
          <input id="hwc-search" type="text" placeholder="Add any GPU / CPU… (e.g. RTX 3060)" autocomplete="off">
          <div class="hwc-sugg" id="hwc-sugg"></div>
        </div>
        <button type="button" class="cmp-clear"${n ? '' : ' disabled'}>Clear all</button>
        <button type="button" class="cmp-close" aria-label="Close">✕</button>
      </div>
      <div class="cmp-scroll">${n < 2
        ? `<div class="cmp-empty">Add at least 2 to compare — click <b>⚖</b> on any ranking row, or search above to add any GPU / CPU.</div>`
        : hwcTableHtml(l)}
      </div></div>`;

    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('.cmp-close')) { overlay.remove(); hwcModal = null; return; }
      if (e.target.closest('.cmp-clear')) { save([]); hwcSync(); return; }
      const rm = e.target.closest('.hwc-rm');
      if (rm) {
        const nm = rm.dataset.n;
        save(load().filter(h => h.n !== nm));
        hwcSync();
      }
    });

    // 搜索添加：全量目录模糊匹配（GPU/CPU 合并，Top8 建议）
    const inp = overlay.querySelector('#hwc-search');
    const sugg = overlay.querySelector('#hwc-sugg');
    const pick = h => {
      let l2 = load();
      if (l2.some(x => x.n === h.n)) { hwcToast('Already in compare'); return; }
      if (l2.length >= MAX) l2.shift();
      l2.push(h);
      save(l2); hwcToast('✅ Added ' + h.n);
      inp.value = ''; sugg.innerHTML = '';
      hwcSync();
    };
    let lastQ = '';
    inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase();
      if (q === lastQ) return;
      lastQ = q;
      sugg.innerHTML = '';
      if (q.length < 2) return;
      const HW = window.__HW;
      if (!HW) { sugg.innerHTML = '<div class="hwc-sugg-item muted">Loading hardware database…</div>'; return; }
      const all = [
        ...(HW.gpus || []).map(g => ({ t: 'gpu', n: g.n, m: g.m, r: g.r, p: g.p })),
        ...(HW.cpus || []).map(c => ({ t: 'cpu', n: c.n, m: c.m, r: c.r, p: c.p }))
      ].filter(h => h.n && h.n.toLowerCase().includes(q)).slice(0, 8);
      if (!all.length) { sugg.innerHTML = '<div class="hwc-sugg-item muted">No matches</div>'; return; }
      all.forEach(h => {
        const d = document.createElement('div');
        d.className = 'hwc-sugg-item';
        d.innerHTML = `<span class="hwc-sugg-type ${h.t}">${h.t === 'cpu' ? 'CPU' : 'GPU'}</span> ${esc(h.n)}
          <span class="hwc-sugg-meta">${(h.m || 0).toLocaleString()} · rank ${h.r != null ? h.r : '—'}${h.p ? ' · $' + h.p.toLocaleString() : ''}</span>`;
        d.addEventListener('click', () => pick({ t: h.t, n: h.n, m: h.m, r: h.r, p: h.p }));
        sugg.appendChild(d);
      });
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const first = sugg.querySelector('.hwc-sugg-item:not(.muted)');
        if (first) first.click();
      } else if (e.key === 'Escape') {
        inp.blur(); sugg.innerHTML = '';
      }
    });
    document.addEventListener('keydown', function hwcEsc(e) {
      if (e.key === 'Escape') { overlay.remove(); hwcModal = null; document.removeEventListener('keydown', hwcEsc); }
    });
    return overlay;
  }

  function hwcTableHtml(l) {
    const rows = [];
    const maxMark = Math.max(...l.map(h => h.m || 0));
    const minRank = Math.min(...l.map(h => h.r != null ? h.r : Infinity));
    const prices = l.map(h => h.p).filter(p => p != null && p > 0);
    const minPrice = prices.length ? Math.min(...prices) : null;

    // Type
    rows.push({ label: 'Type', cells: l.map(h => `<span class="hwc-type ${h.t}">${h.t === 'cpu' ? '🧠 CPU' : '🖥 GPU'}</span>`) });

    // Mark + % of max
    rows.push({
      label: 'PassMark', bestIdx: l.reduce((bi, h, i) => (h.m || 0) > (l[bi].m || 0) ? i : bi, 0),
      cells: l.map(h => {
        const pct = maxMark ? Math.round((h.m || 0) / maxMark * 100) : 0;
        return `<div class="hwc-mark"><b>${(h.m || 0).toLocaleString()}</b>
          <span class="hwc-pct">${pct}%</span>
          <span class="hwc-bar"><i style="width:${pct}%"></i></span></div>`;
      })
    });

    // Rank
    rows.push({
      label: 'Rank', bestIdx: l.reduce((bi, h, i) => (h.r != null && h.r < (l[bi].r != null ? l[bi].r : Infinity)) ? i : bi, 0),
      cells: l.map(h => h.r != null ? `<b>#${h.r.toLocaleString()}</b>` : '<span class="cmp-na">—</span>')
    });

    // Price
    rows.push({
      label: 'Price', bestIdx: minPrice != null ? l.findIndex(h => h.p === minPrice) : -1,
      cells: l.map(h => h.p ? `<b>$${h.p.toLocaleString()}</b>` : '<span class="cmp-na">—</span>')
    });

    let html = '<table class="cmp-table hwc-table"><tbody>';
    html += '<tr><td class="cmp-row-label hwc-label"></td>';
    l.forEach(h => {
      html += `<td class="hwc-th"><span class="hwc-th-inner">
        <button type="button" class="cmp-rm hwc-rm" data-n="${esc(h.n)}" aria-label="Remove">✕</button>
        <b>${esc(h.n)}</b></span></td>`;
    });
    html += '</tr>';
    rows.forEach(row => {
      html += `<tr class="cmp-row"><td class="cmp-row-label">${row.label}</td>`;
      row.cells.forEach((c, i) => {
        html += `<td class="cmp-cell${i === row.bestIdx && row.bestIdx >= 0 ? ' hwc-best' : ''}">${c}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function hwcSync() {
    const l = load();
    if (!hwcFab) {
      hwcFab = document.createElement('button');
      hwcFab.type = 'button';
      hwcFab.className = 'hwc-fab';
      hwcFab.setAttribute('aria-label', 'Compare hardware');
      hwcFab.addEventListener('click', () => {
        if (hwcModal) { hwcModal.remove(); hwcModal = null; return; }
        hwcModal = buildHwcModal();
        document.body.appendChild(hwcModal);
      });
      document.body.appendChild(hwcFab);
    }
    hwcFab.textContent = `⚖ Hardware (${l.length})`;
    hwcFab.classList.toggle('show', l.length >= 1);
    if (hwcModal && hwcModal.isConnected) {
      const fresh = buildHwcModal();
      hwcModal.replaceWith(fresh);
      hwcModal = fresh;
    }
  }

  window.addEventListener('storage', e => { if (e.key === KEY) hwcSync(); });
  hwcSync();
})();

/* #56 sticky 吸顶态投影：sentinel 离开视口 = 元素已吸顶 → .stuck 增强层次 */
(function () {
  if (!('IntersectionObserver' in window)) return;
  ['.feat-sort', '.filter-bar.sticky'].forEach(sel => {
    const el = document.querySelector(sel);
    if (!el || el.dataset.stuckWatch) return;
    el.dataset.stuckWatch = '1';
    const sent = document.createElement('div');
    sent.setAttribute('aria-hidden', 'true');
    sent.style.cssText = 'position:absolute;width:1px;height:1px;margin:0;padding:0;pointer-events:none;visibility:hidden;';
    el.parentNode.insertBefore(sent, el);
    new IntersectionObserver(entries => {
      entries.forEach(e => el.classList.toggle('stuck', !e.isIntersecting));
    }).observe(sent);
  });
})();
