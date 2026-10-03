// DOM user interface: HUD (money, rating, objective), side buttons, toasts and
// modal screens (upgrades, map, talents, wardrobe, settings...).

import { fmtMoney, fmtDuration } from '../util/math.js';
import { UPGRADES, UPGRADE_GROUPS } from '../data/upgrades.js';
import { TOOLS, ROLES } from '../data/catalog.js';
import { TALENTS, ACHIEVEMENTS, COSMETICS } from '../data/meta.js';
import { talentCost, buyTalent, cosmeticById } from '../game/save.js';
import { LEVELS } from '../data/levels/index.js';

const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== undefined) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
};

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.cache = {};
    this.modalRefresh = null;
    this.build();
  }

  get game() { return this.app.game; }
  get meta() { return this.app.save.meta; }

  build() {
    this.money = h('span', { class: 'v' }, '0');
    this.moneyPill = h('div', { class: 'pill money' }, h('span', { class: 'ico' }, '💵'), this.money);
    this.ratingFg = h('div', { class: 'fg' }, '★★★★★');
    this.ratingVal = h('span', { class: 'rv' }, '');
    this.ratingPill = h('div', { class: 'pill rating', title: 'Réputation' }, h('div', { class: 'stars5' }, h('div', { class: 'bg' }, '★★★★★'), this.ratingFg), this.ratingVal);
    this.starsVal = h('span', { class: 'v' }, '0');
    this.starsPill = h('div', { class: 'pill stars', onclick: () => this.showTalents() }, h('span', { class: 'ico' }, '🌟'), this.starsVal);
    this.top = h('div', { class: 'topbar' }, this.moneyPill, this.ratingPill, this.starsPill);

    this.qText = h('div', { class: 'qtext' });
    this.qFill = h('div', { class: 'qfill' });
    this.qLabel = h('div', { class: 'qlabel' });
    this.qBar = h('div', { class: 'qbar' }, this.qFill);
    this.quest = h('div', { class: 'quest' }, h('div', { class: 'qicon' }, '🎯'), h('div', { class: 'qbody' }, this.qText, h('div', { class: 'qrow' }, this.qBar, this.qLabel)));

    this.rName = h('span', { class: 'rname' });
    this.rFill = h('div', { class: 'rfill' });
    this.rPct = h('span', { class: 'rpct' });
    this.roomProg = h('div', { class: 'roomprog hidden' }, h('span', {}, '🧽'), this.rName, h('div', { class: 'rbar' }, this.rFill), this.rPct);

    const btn = (icon, label, fn, cls = '') => h('button', { class: 'sbtn ' + cls, onclick: () => { this.app.audio.play('click'); fn(); }, 'aria-label': label },
      h('span', { class: 'i' }, icon), h('span', { class: 'l' }, label), h('span', { class: 'badge hidden' }, '!'));
    this.btnUp = btn('⬆️', 'Améliorer', () => this.showUpgrades(), 'big');
    this.btnMap = btn('🗺️', 'Lieux', () => this.showMap());
    this.btnTal = btn('🌟', 'Talents', () => this.showTalents());
    this.btnWard = btn('👕', 'Style', () => this.showWardrobe());
    this.btnSet = btn('⚙️', 'Options', () => this.showSettings());
    this.side = h('div', { class: 'side' }, this.btnUp, this.btnMap, this.btnTal, this.btnWard, this.btnSet);

    this.toasts = h('div', { class: 'toasts' });
    this.hud = h('div', { class: 'hud' }, this.top, this.quest, this.roomProg, this.side);
    this.modalWrap = h('div', { class: 'modal-wrap hidden', onclick: (e) => { if (e.target === this.modalWrap && !this.modalLocked) this.closeModal(); } });
    this.root.append(this.hud, this.toasts, this.modalWrap);
  }

  setText(el, key, v) { if (this.cache[key] !== v) { this.cache[key] = v; el.textContent = v; } }

  update(dt) {
    const g = this.game;
    if (!g) return;
    this.setText(this.money, 'money', fmtMoney(g.state.money));
    const r = g.state.rating;
    const rp = Math.round(r * 20);
    if (this.cache.rating !== rp) { this.cache.rating = rp; this.ratingFg.style.width = (r / 5) * 100 + '%'; }
    this.setText(this.ratingVal, 'rv', r.toFixed(1).replace('.', ','));
    this.setText(this.starsVal, 'stars', String(this.meta.stars));
    // quest
    const qv = g.quests.view();
    if (qv) {
      this.setText(this.qText, 'qt', qv.text + (qv.reward ? `  (+${fmtMoney(qv.reward)})` : ''));
      this.setText(this.qLabel, 'ql', qv.label || '');
      const pw = qv.progress === null ? -1 : Math.round(qv.progress * 100);
      if (this.cache.qp !== pw) {
        this.cache.qp = pw;
        this.qBar.style.display = pw < 0 ? 'none' : '';
        this.qFill.style.width = Math.max(0, pw) + '%';
      }
      const flash = g.quests.doneFlash > 0;
      if (this.cache.qf !== flash) { this.cache.qf = flash; this.quest.classList.toggle('flash', flash); }
    }
    // room progress
    const room = g.map.roomAtWorld(g.player.x, g.player.y);
    const show = room && room.unlocked && !room.cleaned;
    if (this.cache.rshow !== show) { this.cache.rshow = show; this.roomProg.classList.toggle('hidden', !show); }
    if (show) {
      const pr = Math.floor(g.roomProgress(room) * 100);
      this.setText(this.rName, 'rn', room.name);
      this.setText(this.rPct, 'rp', pr + ' %');
      if (this.cache.rpw !== pr) { this.cache.rpw = pr; this.rFill.style.width = pr + '%'; }
    }
    // badges
    this.badgeT = (this.badgeT || 0) - dt;
    if (this.badgeT <= 0) {
      this.badgeT = 0.5;
      const canUp = Object.keys(UPGRADES).some((k) => {
        const inf = g.upgradeInfo(k);
        if (UPGRADES[k].needsStaff && g.staff.length === 0) return false;
        return inf.cost !== null && g.state.money >= inf.cost;
      });
      this.btnUp.querySelector('.badge').classList.toggle('hidden', !canUp);
      const canTal = Object.keys(TALENTS).some((k) => { const c = talentCost(this.meta, k); return c !== null && this.meta.stars >= c; });
      this.btnTal.querySelector('.badge').classList.toggle('hidden', !canTal);
      const nextOpen = this.app.save.unlocked > g.index + 1 && g.state.completed;
      this.btnMap.querySelector('.badge').classList.toggle('hidden', !nextOpen);
    }
    if (this.modalRefresh) {
      this.modalT = (this.modalT || 0) - dt;
      if (this.modalT <= 0) { this.modalT = 0.25; this.modalRefresh(); }
    }
  }

  bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  moneyBump() { this.bump(this.moneyPill); }

  toast(text, cls = '') {
    const t = h('div', { class: 'toast ' + cls }, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  // ---------------------------------------------------------------- modal plumbing

  openModal(title, content, { locked = false, refresh = null, cls = '' } = {}) {
    this.modalLocked = locked;
    this.modalWrap.innerHTML = '';
    const sheet = h('div', { class: 'sheet ' + cls },
      h('div', { class: 'sheet-head' }, h('h2', {}, title), locked ? null : h('button', { class: 'close', onclick: () => this.closeModal(), 'aria-label': 'Fermer' }, '✕')),
      h('div', { class: 'sheet-body' }, content));
    this.modalWrap.append(sheet);
    this.modalWrap.classList.remove('hidden');
    this.modalRefresh = refresh;
    this.modalT = 0;
    this.app.input.enabled = false;
    this.app.input.release();
  }

  closeModal() {
    this.modalWrap.classList.add('hidden');
    this.modalWrap.innerHTML = '';
    this.modalRefresh = null;
    this.app.input.enabled = true;
    if (this.onModalClosed) { const f = this.onModalClosed; this.onModalClosed = null; f(); }
  }

  get modalOpen() { return !this.modalWrap.classList.contains('hidden'); }

  // ---------------------------------------------------------------- upgrades

  showUpgrades(tab = this.lastUpTab || 'player') {
    this.lastUpTab = tab;
    const g = this.game;
    const tabs = h('div', { class: 'tabs' }, UPGRADE_GROUPS.map((gr) =>
      h('button', { class: 'tab' + (gr.id === tab ? ' on' : ''), onclick: () => this.showUpgrades(gr.id) }, gr.icon + ' ' + gr.name)));
    const list = h('div', { class: 'cards' });
    const rows = [];
    for (const [key, u] of Object.entries(UPGRADES)) {
      if (u.group !== tab) continue;
      const btn = h('button', { class: 'buy' });
      const lvl = h('div', { class: 'lvl' });
      const desc = h('div', { class: 'desc' });
      const card = h('div', { class: 'card' }, h('div', { class: 'cicon' }, u.icon), h('div', { class: 'cbody' }, h('div', { class: 'cname' }, u.name), desc, lvl), btn);
      btn.addEventListener('click', () => {
        if (g.buyUpgrade(key)) { this.bump(card); refresh(); if (key === 'tool') this.toast(`${g.stats.tool.icon} Nouvel outil : ${g.stats.tool.name} !`, 'good'); }
        else this.app.audio.play('error');
      });
      rows.push({ key, u, btn, lvl, desc, card });
      list.append(card);
    }
    if (tab === 'staff') {
      list.prepend(h('div', { class: 'hint' }, g.staff.length ? `👥 Employés : ${g.staff.map((s) => ROLES[s.role].icon).join(' ')}` : '👥 Embauche du personnel via les zones d\'achat au sol (icônes 🧑‍💼 🧑‍🍳 🧹) pour débloquer ces améliorations.'));
    }
    const refresh = () => {
      for (const r of rows) {
        const inf = g.upgradeInfo(r.key);
        const cur = r.u.special === 'tool' ? g.stats.toolTier : r.u.effect(inf.level);
        let txt = r.u.desc(cur);
        if (inf.cost !== null) {
          const next = r.u.special === 'tool' ? g.stats.toolTier + 1 : r.u.effect(inf.level + 1);
          txt += '  →  ' + (r.u.special === 'tool' ? `${TOOLS[next - 1].icon} ${TOOLS[next - 1].name}` : r.u.desc(next).replace(/^[^:×]*[:×]\s?/, ''));
        }
        if (this.cache['ud' + r.key] !== txt) { this.cache['ud' + r.key] = txt; r.desc.textContent = txt; }
        r.lvl.textContent = `Niveau ${inf.level}/${inf.max}`;
        const locked = r.u.needsStaff && g.staff.length === 0;
        if (inf.cost === null) { r.btn.textContent = 'MAX'; r.btn.disabled = true; r.btn.className = 'buy max'; }
        else if (locked) { r.btn.textContent = '🔒'; r.btn.disabled = true; r.btn.className = 'buy'; }
        else {
          r.btn.textContent = '💵 ' + fmtMoney(inf.cost);
          r.btn.disabled = g.state.money < inf.cost;
          r.btn.className = 'buy' + (g.state.money >= inf.cost ? ' ok' : '');
        }
      }
    };
    refresh();
    this.openModal('⬆️ Améliorations', h('div', {}, tabs, list), { refresh });
  }

  // ---------------------------------------------------------------- map / locations

  showMap() {
    const app = this.app;
    const list = h('div', { class: 'levels' });
    LEVELS.forEach((def, i) => {
      const unlocked = i < app.save.unlocked;
      const stars = this.meta.levelStars[def.id] || [0, 0, 0];
      const current = i === app.game.index;
      const saved = app.save.levels[def.id];
      let status = '';
      if (!unlocked) status = '🔒 Termine le lieu précédent';
      else if (this.meta.completed[def.id]) status = '✅ Terminé';
      else if (saved || current) status = '🚧 En cours';
      else status = '✨ Nouveau !';
      const card = h('div', { class: 'lcard' + (unlocked ? '' : ' locked') + (current ? ' current' : '') },
        h('div', { class: 'licon' }, unlocked ? def.icon : '❔'),
        h('div', { class: 'lbody' },
          h('div', { class: 'lname' }, `${i + 1}. ${unlocked ? def.name : '???'}`),
          h('div', { class: 'lstars' }, stars.map((s) => (s ? '⭐' : '☆')).join(' ')),
          h('div', { class: 'lstatus' }, status)),
        unlocked && !current ? h('button', { class: 'buy ok', onclick: () => { this.closeModal(); app.switchLevel(i); } }, 'Y aller') : current ? h('span', { class: 'here' }, 'Ici') : null);
      list.append(card);
    });
    const info = h('div', { class: 'hint' }, '⭐ 1 : tout nettoyer · ⭐ 2 : tout construire (débloque le lieu suivant) · ⭐ 3 : servir assez de clients. Ta progression dans chaque lieu est conservée.');
    this.openModal('🗺️ Mes établissements', h('div', {}, info, list));
  }

  // ---------------------------------------------------------------- talents & achievements

  showTalents(tab = 'talents') {
    const meta = this.meta;
    const tabs = h('div', { class: 'tabs' },
      h('button', { class: 'tab' + (tab === 'talents' ? ' on' : ''), onclick: () => this.showTalents('talents') }, '🌟 Talents'),
      h('button', { class: 'tab' + (tab === 'ach' ? ' on' : ''), onclick: () => this.showTalents('ach') }, '🏆 Succès'));
    const body = h('div', { class: 'cards' });
    let refresh = null;
    if (tab === 'talents') {
      const head = h('div', { class: 'hint' });
      body.append(head);
      const rows = [];
      for (const [key, t] of Object.entries(TALENTS)) {
        const btn = h('button', { class: 'buy' });
        const lvl = h('div', { class: 'lvl' });
        const card = h('div', { class: 'card' }, h('div', { class: 'cicon' }, t.icon), h('div', { class: 'cbody' }, h('div', { class: 'cname' }, t.name), h('div', { class: 'desc' }, t.desc), lvl), btn);
        btn.addEventListener('click', () => {
          if (buyTalent(meta, key)) { this.app.audio.play('upgrade'); this.bump(card); this.app.game.recomputeStats(); this.app.saveSoon(); refresh(); }
          else this.app.audio.play('error');
        });
        rows.push({ key, t, btn, lvl });
        body.append(card);
      }
      refresh = () => {
        head.textContent = `Tu as 🌟 ${meta.stars} étoile(s). Gagne des étoiles en terminant les objectifs des lieux et les succès. Les talents sont permanents.`;
        for (const r of rows) {
          const l = meta.talents[r.key] || 0;
          r.lvl.textContent = `Niveau ${l}/${r.t.costs.length}`;
          const c = talentCost(meta, r.key);
          if (c === null) { r.btn.textContent = 'MAX'; r.btn.disabled = true; r.btn.className = 'buy max'; }
          else { r.btn.textContent = `🌟 ${c}`; r.btn.disabled = meta.stars < c; r.btn.className = 'buy' + (meta.stars >= c ? ' ok' : ''); }
        }
      };
      refresh();
    } else {
      for (const a of ACHIEVEMENTS) {
        const done = !!meta.achievements[a.id];
        const v = Math.min(a.goal, meta.stats[a.stat] || 0);
        const pct = Math.floor((v / a.goal) * 100);
        const reward = cosmeticById(a.unlock);
        body.append(h('div', { class: 'card' + (done ? ' done' : '') },
          h('div', { class: 'cicon' }, done ? '🏆' : '🔸'),
          h('div', { class: 'cbody' },
            h('div', { class: 'cname' }, a.name),
            h('div', { class: 'desc' }, `${a.desc} — récompense : 🌟${a.stars}${reward ? ' + ' + (reward.icon || '🎨') + ' ' + reward.name : ''}`),
            h('div', { class: 'qbar small' }, h('div', { class: 'qfill', style: `width:${pct}%` }))),
          h('div', { class: 'lvl' }, done ? '✅' : `${pct} %`)));
      }
    }
    this.openModal('🌟 Talents & succès', h('div', {}, tabs, body), { refresh });
  }

  // ---------------------------------------------------------------- wardrobe

  showWardrobe() {
    const meta = this.meta;
    const cos = meta.cosmetics;
    const grid = (items, kind) => h('div', { class: 'grid' }, items.map((it) => {
      const owned = cos.unlocked.includes(it.id);
      const selected = kind === 'hat' ? cos.hat === it.id : cos.color === it.id;
      return h('button', {
        class: 'gitem' + (owned ? '' : ' locked') + (selected ? ' sel' : ''),
        title: owned ? it.name : it.unlock,
        onclick: () => {
          if (!owned) { this.toast('🔒 ' + it.unlock); return; }
          if (kind === 'hat') cos.hat = it.id; else { cos.color = it.id; cos.colorValue = it.color; }
          this.app.audio.play('click');
          this.app.saveSoon();
          this.showWardrobe();
        },
      }, kind === 'hat' ? h('span', { class: 'gi' }, owned ? it.icon : '🔒') : h('span', { class: 'swatch', style: `background:${owned ? it.color : '#555'}` }, owned ? '' : '🔒'),
      h('span', { class: 'gl' }, owned ? it.name : it.unlock));
    }));
    const skins = ['#f6d3b3', '#eab68e', '#c98e62', '#a26a45', '#7a4a2e'];
    const skinRow = h('div', { class: 'grid' }, skins.map((s) => h('button', {
      class: 'gitem' + (cos.skin === s ? ' sel' : ''), onclick: () => { cos.skin = s; this.app.saveSoon(); this.showWardrobe(); },
    }, h('span', { class: 'swatch', style: `background:${s}` }))));
    this.openModal('👕 Ma tenue', h('div', {}, h('h3', {}, 'Chapeaux'), grid(COSMETICS.hats, 'hat'), h('h3', {}, 'Couleurs'), grid(COSMETICS.colors, 'color'), h('h3', {}, 'Peau'), skinRow));
  }

  // ---------------------------------------------------------------- settings

  showSettings() {
    const app = this.app;
    const s = this.meta.settings;
    const slider = (label, key, min, max, step, apply) => {
      const val = h('span', { class: 'sval' }, Math.round(s[key] * 100) + ' %');
      const inp = h('input', { type: 'range', min, max, step, value: s[key] });
      inp.addEventListener('input', () => { s[key] = parseFloat(inp.value); val.textContent = Math.round(s[key] * 100) + ' %'; apply(); app.saveSoon(); });
      return h('label', { class: 'srow' }, h('span', {}, label), inp, val);
    };
    const toggle = (label, key, apply) => {
      const inp = h('input', { type: 'checkbox' });
      inp.checked = !!s[key];
      inp.addEventListener('change', () => { s[key] = inp.checked; apply(); app.saveSoon(); });
      return h('label', { class: 'srow' }, h('span', {}, label), inp);
    };
    const quality = h('select', {}, h('option', { value: 'high' }, 'Haute'), h('option', { value: 'low' }, 'Économie (batterie)'));
    quality.value = s.quality;
    quality.addEventListener('change', () => { s.quality = quality.value; app.applySettings(); app.saveSoon(); });
    const persisted = h('div', { class: 'hint' }, '💾 Sauvegarde automatique sur cet appareil.');
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then((p) => { persisted.textContent = p ? '💾 Sauvegarde automatique — stockage persistant activé ✅' : '💾 Sauvegarde automatique (installe le jeu pour un stockage garanti).'; });
    }
    const exportBtn = h('button', { class: 'buy ok', onclick: async () => {
      const code = app.exportCode();
      try { await navigator.clipboard.writeText(code); this.toast('📋 Code de sauvegarde copié !', 'good'); }
      catch { area.value = code; area.select(); this.toast('Copie le code affiché ci-dessous'); }
    } }, '📤 Exporter');
    const area = h('textarea', { rows: 3, placeholder: 'Colle ici un code de sauvegarde (FF1:...)' });
    const importBtn = h('button', { class: 'buy', onclick: () => {
      if (!area.value.trim()) { this.toast('Colle d\'abord un code dans la zone de texte'); return; }
      if (confirm('Remplacer ta progression actuelle par cette sauvegarde ?')) app.importCode(area.value);
    } }, '📥 Importer');
    const resetBtn = h('button', { class: 'buy danger', onclick: () => {
      if (confirm('Effacer TOUTE ta progression ? Cette action est irréversible.')) app.resetAll();
    } }, '🗑️ Tout effacer');
    const installBtn = app.installPrompt ? h('button', { class: 'buy ok', onclick: () => app.promptInstall() }, '📲 Installer le jeu') : null;
    const total = Object.values(app.save.levels).reduce((t, l) => t + (l.playTime || 0), 0) + (app.game?.state.playTime || 0) - (app.save.levels[app.game.def.id]?.playTime || 0);
    this.openModal('⚙️ Options', h('div', { class: 'settings' },
      slider('🎵 Musique', 'music', 0, 1, 0.05, () => app.applySettings()),
      slider('🔊 Effets', 'sfx', 0, 1, 0.05, () => app.applySettings()),
      toggle('📳 Vibrations', 'vibration', () => {}),
      h('label', { class: 'srow' }, h('span', {}, '✨ Graphismes'), quality),
      slider('🔍 Zoom', 'zoom', 0.7, 1.4, 0.05, () => app.applySettings()),
      installBtn,
      persisted,
      h('div', { class: 'row' }, exportBtn, importBtn),
      area,
      h('div', { class: 'row' }, resetBtn),
      h('div', { class: 'hint small' }, `Temps de jeu : ${fmtDuration(total)} · Version ${app.version} · Frote Frote — jeu libre et sans pub.`),
    ));
  }

  // ---------------------------------------------------------------- popups

  showIntro(def, index, onClose) {
    this.onModalClosed = onClose;
    this.openModal(`${def.icon} Lieu ${index + 1} — ${def.name}`, h('div', { class: 'intro' },
      h('p', {}, def.intro),
      h('ul', {},
        h('li', {}, '🕹️ Glisse ton doigt n\'importe où pour te déplacer (ou ZQSD / flèches).'),
        h('li', {}, '🗑️ Marche sur les déchets pour les ramasser, puis vide ton sac dans la benne ♻️.'),
        h('li', {}, '🧽 Passe sur les taches pour les frotter. Reste à côté des encombrants pour les casser.'),
        h('li', {}, '💵 Reste sur une zone d\'achat pour payer et construire.'),
      ),
      h('button', { class: 'buy ok big', onclick: () => this.closeModal() }, 'C\'est parti !')));
  }

  showOffline(amount, secs) {
    this.openModal('🌙 Bon retour !', h('div', { class: 'intro' },
      h('p', {}, `Pendant ton absence (${fmtDuration(secs)}), ton équipe a fait tourner la boutique.`),
      h('div', { class: 'bigmoney' }, '💵 +' + fmtMoney(amount)),
      h('button', { class: 'buy ok big', onclick: () => this.closeModal() }, 'Récupérer')));
  }

  showLevelComplete(def, index, hasNext, onNext) {
    this.openModal('🎉 Lieu terminé !', h('div', { class: 'intro' },
      h('p', {}, `${def.icon} ${def.name} est entièrement rénové et tourne à plein régime. Bravo !`),
      hasNext ? h('p', {}, '🗺️ Un nouveau lieu est disponible. Tu peux y aller maintenant ou rester ici pour gagner la 3ᵉ étoile.') : h('p', {}, '🏆 Tu as terminé tous les lieux ! Tu peux continuer à faire tourner tes établissements.'),
      h('div', { class: 'row' },
        hasNext ? h('button', { class: 'buy ok big', onclick: () => { this.closeModal(); onNext(); } }, 'Lieu suivant ➜') : null,
        h('button', { class: 'buy big', onclick: () => this.closeModal() }, 'Rester ici'))));
  }
}
