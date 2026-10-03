// App entry point: loads the save, creates the Game for the current location,
// runs the main loop, autosaves, wires audio/UI events and the service worker.

import { Game } from './game/game.js';
import { Renderer } from './render/renderer.js';
import { Input } from './engine/input.js';
import { Audio } from './engine/audio.js';
import { loadSave, writeSave, clearSave, requestPersistence, exportCode, importCode } from './engine/storage.js';
import { newSave, migrate, checkAchievements, unlockCosmetic } from './game/save.js';
import { LEVELS } from './data/levels/index.js';
import { UI } from './ui/ui.js';
import { fmtMoney } from './util/math.js';

export const VERSION = '1.0.0';
const AUTOSAVE_EVERY = 10; // seconds
const OFFLINE_MIN = 60; // seconds away before offline earnings kick in

class App {
  constructor() {
    this.version = VERSION;
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.input = new Input(this.canvas);
    this.audio = new Audio();
    this.saveT = AUTOSAVE_EVERY;
    this.achT = 2;
    this.lastHaptic = 0;
    this.last = performance.now();
    this.running = false;
    this.debug = new URLSearchParams(location.search).has('debug');
  }

  async init() {
    let raw = null;
    try { raw = await loadSave(); } catch { raw = null; }
    this.save = migrate(raw || newSave());
    this.save.current = Math.min(this.save.current, LEVELS.length - 1);
    this.ui = new UI(this);
    this.applySettings();
    const away = (Date.now() - (this.save.meta.lastActive || Date.now())) / 1000;
    this.startLevel(this.save.current, away);
    window.addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.persist());
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.installPrompt = e; });
    this.input.onFirstGesture = () => this.onGesture();
    this.registerSW();
    if (this.debug) this.installDebug();
    window.__app = this;
    this.running = true;
    requestAnimationFrame((t) => this.frame(t));
  }

  onGesture() {
    this.audio.unlock();
    if (this.save.meta.settings.music > 0) this.audio.startMusic();
    requestPersistence();
  }

  applySettings() {
    const s = this.save.meta.settings;
    this.audio.setVolumes(s.sfx, s.music);
    if (s.music > 0 && this.audio.ctx) this.audio.startMusic();
    if (s.music <= 0) this.audio.stopMusic();
    this.renderer.dprCap = s.quality === 'low' ? 1 : 2;
    this.renderer.zoomPref = s.zoom || 1;
    this.renderer.resize();
    if (this.game) this.game.fx.scale = s.quality === 'low' ? 0.45 : 1;
  }

  // ---------------------------------------------------------------- levels

  startLevel(index, awaySeconds = 0) {
    const def = LEVELS[index];
    const saved = this.save.levels[def.id] || null;
    const game = new Game(def, index, this.save.meta, saved);
    this.game = game;
    this.save.current = index;
    game.fx.scale = this.save.meta.settings.quality === 'low' ? 0.45 : 1;
    this.hookGame(game);
    this.renderer.attach(game);
    this.ui.cache = {};
    if (!saved && !this.save.meta.introSeen[def.id]) {
      this.save.meta.introSeen[def.id] = 1;
      this.ui.showIntro(def, index);
    } else if (saved && awaySeconds > OFFLINE_MIN) {
      this.grantOffline(awaySeconds);
    }
    this.persist();
  }

  switchLevel(index) {
    if (index === this.game.index) return;
    this.save.levels[this.game.def.id] = this.game.serialize();
    this.startLevel(index);
  }

  grantOffline(secs) {
    const g = this.game;
    const st = g.stats;
    const cap = st.offlineCapH * 3600;
    const amount = g.state.autoRate * Math.min(secs, cap) * st.offlineEff;
    if (amount >= 1) {
      g.addMoney(amount, 'offline');
      this.ui.showOffline(amount, secs);
    }
  }

  hookGame(g) {
    g.on('sfx', (name, o) => this.audio.play(name, o));
    g.on('haptic', (ms) => this.haptic(ms));
    g.on('shake', (a) => { this.renderer.cam.shake = Math.max(this.renderer.cam.shake, a); });
    g.on('toast', (t) => this.ui.toast(t));
    g.on('money', (v, src) => { if (src !== 'scrub' && src !== 'trash') this.ui.moneyBump(); });
    g.on('roomCleaned', (r) => { this.ui.toast(`✨ ${r.name} est toute propre ! De nouvelles zones d'achat sont apparues.`, 'good'); this.saveSoon(); });
    g.on('built', () => this.saveSoon());
    g.on('star', (i) => this.onStar(g, i));
    g.on('levelComplete', () => this.onLevelComplete(g));
  }

  onStar(g, i) {
    const meta = this.save.meta;
    const arr = (meta.levelStars[g.def.id] ||= [0, 0, 0]);
    if (arr[i]) return;
    arr[i] = 1;
    meta.stars += 1;
    meta.starsEarned += 1;
    const names = ['Tout est propre !', 'Tout est construit !', 'Clients servis !'];
    this.audio.play('star');
    this.ui.toast(`🌟 Étoile gagnée : ${names[i]} (+1 🌟 pour les talents)`, 'star');
    this.saveSoon();
  }

  onLevelComplete(g) {
    const meta = this.save.meta;
    meta.completed[g.def.id] = Date.now();
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(LEVELS.length, g.index + 2));
    const unlocks = { 0: 'hat_chef', 2: 'color_white', 4: 'hat_pirate' };
    if (unlocks[g.index] && unlockCosmetic(meta, unlocks[g.index])) this.ui.toast('👕 Nouvelle tenue débloquée !', 'good');
    if (LEVELS.every((d) => meta.completed[d.id])) unlockCosmetic(meta, 'hat_halo');
    const hasNext = g.index + 1 < LEVELS.length;
    setTimeout(() => this.ui.showLevelComplete(g.def, g.index, hasNext, () => this.switchLevel(g.index + 1)), 1200);
    this.saveSoon();
  }

  haptic(ms) {
    if (!this.save.meta.settings.vibration || !navigator.vibrate) return;
    const now = performance.now();
    if (now - this.lastHaptic < 45) return;
    this.lastHaptic = now;
    try { navigator.vibrate(ms); } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------- loop

  frame(t) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    const g = this.game;
    const v = this.input.vector();
    g.input.x = v.x; g.input.y = v.y;
    g.update(dt);
    this.renderer.render(g, dt, this.input);
    this.ui.update(dt);
    this.audio.setScrub(g.player.scrubbing, g.stats.tool.id);
    this.saveT -= dt;
    if (this.saveT <= 0) { this.saveT = AUTOSAVE_EVERY; this.persist(); }
    this.achT -= dt;
    if (this.achT <= 0) {
      this.achT = 2;
      for (const a of checkAchievements(this.save.meta)) {
        this.audio.play('star');
        this.ui.toast(`🏆 Succès : ${a.name} (+${a.stars} 🌟)`, 'star');
        this.saveSoon();
      }
    }
    if (this.running) requestAnimationFrame((tt) => this.frame(tt));
  }

  onVisibility() {
    if (document.hidden) {
      this.persist();
      this.audio.suspend();
      this.hiddenAt = Date.now();
    } else {
      this.audio.resume();
      this.last = performance.now();
      if (this.hiddenAt) {
        const away = (Date.now() - this.hiddenAt) / 1000;
        this.hiddenAt = 0;
        if (away > OFFLINE_MIN && !this.ui.modalOpen) this.grantOffline(away);
      }
    }
  }

  // ---------------------------------------------------------------- saving

  saveSoon() { this.saveT = Math.min(this.saveT, 1); }

  snapshot() {
    this.save.levels[this.game.def.id] = this.game.serialize();
    this.save.current = this.game.index;
    this.save.meta.lastActive = Date.now();
    return this.save;
  }

  persist() {
    if (this.resetting) return;
    try { writeSave(this.snapshot()); } catch (e) { console.warn('save failed', e); }
  }

  exportCode() { return exportCode(this.snapshot()); }

  async importCode(code) {
    try {
      const s = migrate(importCode(code));
      this.resetting = true;
      await writeSave(s);
      location.reload();
    } catch (e) {
      this.ui.toast('❌ ' + e.message);
    }
  }

  async resetAll() {
    this.resetting = true;
    await clearSave();
    location.reload();
  }

  async promptInstall() {
    if (!this.installPrompt) return;
    this.installPrompt.prompt();
    try { await this.installPrompt.userChoice; } catch { /* ignore */ }
    this.installPrompt = null;
  }

  registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:' || this.debug) return;
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            this.ui.toast('🔄 Mise à jour disponible : relance le jeu pour en profiter.');
          }
        });
      });
    }).catch(() => {});
  }

  installDebug() {
    const g = () => this.game;
    window.dbg = {
      money: (v = 1e6) => g().addMoney(v, 'debug'),
      clean: () => { for (const r of g().map.rooms) if (r.unlocked && !r.cleaned) { g().trash = g().trash.filter((t) => g().map.roomAtWorld(t.x, t.y) !== r); g().junk = g().junk.filter((t) => g().map.roomAtWorld(t.x, t.y) !== r); g().roomCleaned(r); } },
      buyAll: () => { let n = 0; while (g().pads.length && n++ < 200) g().completePad(g().pads[0]); },
      stars: (n = 10) => { this.save.meta.stars += n; },
      level: (i) => this.switchLevel(i),
      unlockAll: () => { this.save.unlocked = LEVELS.length; },
      fmt: fmtMoney,
    };
    console.log('Debug: window.dbg', Object.keys(window.dbg));
  }
}

const app = new App();
const start = document.getElementById('start');
const boot = () => {
  if (start) {
    start.classList.add('out');
    setTimeout(() => start.remove(), 400);
  }
  app.onGesture();
};
app.init().then(() => {
  const btn = document.getElementById('play');
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Jouer';
    btn.addEventListener('click', boot, { once: true });
  }
  if (app.debug && start) boot();
}).catch((e) => {
  console.error(e);
  const btn = document.getElementById('play');
  if (btn) btn.textContent = 'Erreur : ' + e.message;
});
