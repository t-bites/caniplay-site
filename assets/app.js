/* CanIPlay — 可搜索下拉硬件选择 + 兼容判定（GPU/CPU/RAM 三维度） */
(() => {
  let HW = { gpus: [], cpus: [] };
  // 路径兼容：游戏页在 /game/ 子目录，data.json 在上级 assets/
  const isSub = window.location.pathname.indexOf('/game/') !== -1;
  const dataPath = (isSub ? '../' : '') + 'assets/data.json';
  fetch(dataPath).then(r => r.json()).then(d => {
    HW = d;
    window.__HW = HW; // 调试钩子
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

  // ---- 硬件模糊匹配 ----
  function matchHw(list, query) {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const q2 = q.replace(/[\s\-]+/g, '');
    let best = null;
    for (const item of list) {
      const n = item.n.toLowerCase();
      if (n === q) { return item; }
      if (n.includes(q) || n.replace(/[\s\-]+/g, '').includes(q2)) {
        if (!best || item.m > best.m) best = item;
      }
    }
    return best;
  }

  // ---- 下拉过滤（输入时显示匹配项，取 mark 高者优先）----
  function setupCombo(inputId, listId, list) {
    const input = document.getElementById(inputId);
    const box = document.getElementById(listId);
    if (!input || !box) return;
    const show = (items) => {
      box.innerHTML = '';
      items.slice(0, 8).forEach(it => {
        const div = document.createElement('div');
        div.className = 'combo-item';
        div.textContent = it.n;
        div.addEventListener('click', () => { input.value = it.n; box.innerHTML = ''; });
        box.appendChild(div);
      });
      box.style.display = items.length ? 'block' : 'none';
    };
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { box.style.display = 'none'; return; }
      const q2 = q.replace(/[\s\-]+/g, '');
      const hits = [];
      for (const it of list) {
        const n = it.n.toLowerCase();
        if (n.includes(q) || n.replace(/[\s\-]+/g, '').includes(q2)) {
          hits.push(it);
          if (hits.length >= 30) break;
        }
      }
      show(hits.sort((a, b) => b.m - a.m));
    });
    input.addEventListener('focus', () => {
      if (input.value.trim()) input.dispatchEvent(new Event('input'));
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.combo-wrap')) box.style.display = 'none';
    });
  }

  // ---- 游戏搜索（点击跳转详情页）----
  function setupGameCombo() {
    const input = document.getElementById('game-input');
    const box = document.getElementById('game-combo');
    if (!input || !box) return;
    const show = (items) => {
      box.innerHTML = '';
      items.slice(0, 8).forEach(it => {
        const div = document.createElement('div');
        div.className = 'combo-item';
        div.textContent = it.n;
        div.addEventListener('click', () => {
          window.location.href = 'game/' + it.u + '.html';
        });
        box.appendChild(div);
      });
      box.style.display = items.length ? 'block' : 'none';
    };
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { box.style.display = 'none'; return; }
      const hits = (HW.games || []).filter(g => {
        const n = g.n.toLowerCase();
        if (n.includes(q)) return true;
        return (g.a || []).some(al => al.includes(q) || q.includes(al));
      }).slice(0, 30);
      show(hits);
    });
    input.addEventListener('focus', () => {
      if (input.value.trim()) input.dispatchEvent(new Event('input'));
    });
  }

  // ---- 判定（GPU/CPU/RAM）----
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
      const detail = `GPU: ${gpu.n} (${gpu.m}) vs min ${th.mg} · CPU: ${cpu.n} (${cpu.m}) vs min ${th.mc} · RAM: ${ram}GB vs min ${th.mram}GB`;
      // 判定结果可视化：GPU/CPU/RAM 三维分数条（vs recommended）
      const pct = (v, max) => Math.min(100, Math.max(0, Math.round(v / (max || 1) * 100)));
      const bar = (label, p, meetsMin, meetsRec, val, req) => `
        <div class="gauge-row">
          <span class="gauge-label">${label}</span>
          <div class="gauge-track"><div class="gauge-fill ${meetsRec ? 'g-great' : (meetsMin ? 'g-ok' : 'g-no')}" style="width:${p}%"></div></div>
          <span class="gauge-val">${val} / ${req}</span>
        </div>`;
      const gauges = `
        <div class="gauge-box">
          ${bar('GPU', pct(gpu.m, th.rg), gpuOk, gpuGreat, gpu.m, th.rg)}
          ${bar('CPU', pct(cpu.m, th.rc), cpuOk, cpuGreat, cpu.m, th.rc)}
          ${bar('RAM', pct(ram, th.rram || 16), ramOk, ramGreat, ram + 'GB', (th.rram || 16) + 'GB')}
        </div>`;
      out.innerHTML = `<div class="verdict-box ${cls}">${verdict}<div class="verdict-detail">${detail}</div>${gauges}</div>`;
      const up = document.getElementById('upgrade-suggest');
      if (up) {
        if (!gpuOk) up.innerHTML = `<h3>💡 ${t.suggest}</h3><p>${t.gpuUp}GPU with PassMark ≥ ${th.mg}</p>`;
        else if (!cpuOk) up.innerHTML = `<h3>💡 ${t.suggest}</h3><p>${t.cpuUp}CPU with PassMark ≥ ${th.mc}</p>`;
        else if (!ramOk) up.innerHTML = `<h3>💡 ${t.suggest}</h3><p>${t.ramUp}${th.mram} GB</p>`;
        else up.innerHTML = `<h3>💡 ${t.suggest}</h3><p>${t.noSuggest}</p>`;
      }
    } else {
      if (!gpu || !cpu) { out.innerHTML = `<div class="verdict-box verdict-weak">${t.unknown}</div>`; return; }
      out.innerHTML = `<div class="verdict-box verdict-ok">GPU: ${gpu.n} · CPU: ${cpu.n} · RAM: ${ram}GB — pick a game to check compatibility</div>`;
    }
  }

  // ---- 事件绑定 ----
  document.addEventListener('DOMContentLoaded', () => {
    setupGameCombo();
    setupCombo('gpu-input', 'gpu-combo', HW.gpus);
    setupCombo('cpu-input', 'cpu-combo', HW.cpus);
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
            gameList.innerHTML = slice.map(g => {
              const href = g.d ? 'game/' + (g.u || g.a) + '.html' : '#';
              const img = g.i ? `<div class="thumb"><img src="${g.i}" alt="${g.n}" loading="lazy" onerror="this.remove()"></div>` : '<div class="card-ph"></div>';
              const badge = g.d ? '' : '<span class="badge-pending">specs soon</span>';
              const sale = g.di > 0 ? `<span class="sale-badge">-${g.di}%</span>` : '';
              const year = g.y ? `<span class="row-genres">${g.y}</span>` : '';
              const price = g.p ? `<span class="row-price">$${(g.p / 100).toFixed(2)}</span>` : '';
              return `<a class="game-card" href="${href}" data-name="${g.n.toLowerCase()}">
  ${img}
  <h3>${g.n}${badge}${sale}</h3>
  ${year}${price}
</a>`;
            }).join('') || '<p class="loading">No games found.</p>';
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
          const applyFilters = () => {
            const q = gameSearch ? gameSearch.value.trim().toLowerCase().replace(/[\s\-]+/g, '') : '';
            let hits = all;
            if (q) hits = hits.filter(g => {
              const n = g.n.toLowerCase().replace(/[\s\-]+/g, '');
              return n.includes(q) || q.split('').every(c => n.includes(c));
            });
            if (fYear && fYear.value) hits = hits.filter(g => g.y == fYear.value);
            if (fGenre && fGenre.value) hits = hits.filter(g => (g.g || []).includes(fGenre.value));
            if (fFree && fFree.checked) hits = hits.filter(g => g.f);
            if (fSale && fSale.checked) hits = hits.filter(g => g.di > 0);
            hits.sort(SORTS[fSort ? fSort.value : ''] || SORTS['']);
            shown = 60;
            window.__FILTERED = hits;
            render(hits);
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
          }
          [fYear, fGenre, fFree, fSale, fSort].forEach(el => el && el.addEventListener('change', applyFilters));
          if (gameSearch) gameSearch.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(applyFilters, 200);
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
    function showGear(kind) {
      const input = document.getElementById(kind + '-input');
      const q = input.value.trim().toLowerCase();
      const list = kind === 'gpu' ? HW.gpus : HW.cpus;
      const hit = list.find(h => h.n.toLowerCase() === q) || list.find(h => h.n.toLowerCase().includes(q));
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
    // 页面级搜索（Top Games / Game Sales：按 data-name 过滤卡片）
    const pageSearch = document.getElementById('rank-search') || document.getElementById('sale-search');
    if (pageSearch) {
      pageSearch.addEventListener('input', () => {
        const q = pageSearch.value.trim().toLowerCase();
        document.querySelectorAll('.game-card').forEach(card => {
          const hit = !q || (card.dataset.name || '').includes(q);
          card.style.display = hit ? '' : 'none';
        });
      });
    }
  });
})();
