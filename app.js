/* Fransızca Kartlar — basit, backend'siz aralıklı tekrar uygulaması.
   Kelimeler tek bir vocab.json dosyasından okunur; her kartın kendi seviyesi
   (A1, B2 …) vardır ve seçilen seviyede çıkar. İlerleme localStorage'da. */

(function () {
  'use strict';

  // ---------------------------------------------------------------- sabitler
  var STORAGE_KEY = 'frcards.v2.progress';
  var TR_PREF_KEY = 'frcards.v1.showExampleTr';
  var VOCAB_FILE = 'vocab.json';

  var DAY = 24 * 60 * 60 * 1000;
  var AGAIN_DELAY = 10 * 60 * 1000; // "Tekrar" → 10 dakika sonra
  var MIN_EASE = 1.3;
  var START_EASE = 2.5;
  var MAX_INTERVAL = 365;

  // Seçim ekranındaki gruplar. Kart, seviyesinin ilk harfiyle gruba girer.
  var GROUPS = [
    { key: 'all', name: 'Tümü',    note: 'Bütün seviyeler karışık' },
    { key: 'A',   name: 'A',       note: 'Başlangıç' },
    { key: 'B',   name: 'B',       note: 'Orta' },
    { key: 'C',   name: 'C',       note: 'İleri' }
  ];

  // ------------------------------------------------------------------ durum
  var cards = [];          // vocab.json'daki bütün kartlar
  var group = null;        // aktif grup ('all' | 'A' | 'B' | 'C')
  var queue = [];          // bu oturumda gösterilecek kartlar
  var current = null;      // ekrandaki kart
  var stats = null;        // oturum istatistikleri
  var showTr = readPref(TR_PREF_KEY, '0') === '1'; // örnek cümle çevirisi açık mı

  function readPref(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  }

  function writePref(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  // -------------------------------------------------------------- DOM kısayolları
  function $(id) { return document.getElementById(id); }

  var el = {
    back: $('btn-back'),
    title: $('topbar-title'),
    count: $('topbar-count'),

    screenLevels: $('screen-levels'),
    levelList: $('level-list'),
    loadError: $('load-error'),

    screenStudy: $('screen-study'),
    front: $('card-front'),
    speakFront: $('btn-speak-front'),
    back_: $('card-back'),
    meaning: $('card-meaning'),
    exampleWrap: $('example-wrap'),
    example: $('card-example'),
    exampleTr: $('card-example-tr'),
    speakExample: $('btn-speak-example'),
    toggleTr: $('btn-toggle-tr'),
    show: $('btn-show'),
    grades: $('grade-buttons'),

    screenSummary: $('screen-summary'),
    statTotal: $('stat-total'),
    statEasy: $('stat-easy'),
    statAgain: $('stat-again'),
    summaryNext: $('summary-next'),
    restart: $('btn-restart'),
    toDecks: $('btn-to-decks')
  };

  // ============================================================ ilerleme (localStorage)

  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveProgress(p) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch (e) {
      // Özel sekmede / kota dolduğunda sessizce geç: uygulama yine de çalışsın.
      console.warn('İlerleme kaydedilemedi:', e);
    }
  }

  var progress = loadProgress();

  function stateOf(cardId) { return progress[cardId] || null; }

  function newState() {
    return { due: 0, interval: 0, ease: START_EASE, reps: 0 };
  }

  // ============================================================ SM-2 (sadeleştirilmiş)

  // Gün cinsinden aralıkları ertesi günlerin başlangıcına yerleştir; böylece
  // "bugün veya öncesi" kontrolü takvim günü mantığıyla çalışır.
  function startOfDay(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function dueAfterDays(now, days) {
    return startOfDay(now) + Math.round(days) * DAY;
  }

  function clampEase(e) { return Math.max(MIN_EASE, Math.min(3.5, e)); }
  function clampInterval(i) { return Math.max(1, Math.min(MAX_INTERVAL, Math.round(i))); }

  /* "İyi" cevabının aralığı: ilk doğru 1 gün, ikinci 3 gün, sonra interval × ease. */
  function goodInterval(s) {
    if (s.reps === 0) return 1;
    if (s.reps === 1) return 3;
    return clampInterval(s.interval * s.ease);
  }

  /* Bir cevaba göre kartın yeni durumunu hesaplar (yan etkisiz). */
  function schedule(state, grade, now) {
    var s = {
      due: state.due,
      interval: state.interval,
      ease: state.ease || START_EASE,
      reps: state.reps || 0
    };

    if (grade === 'again') {
      s.ease = clampEase(s.ease - 0.2);
      s.reps = 0;
      s.interval = 0;
      s.due = now + AGAIN_DELAY;
      return s;
    }

    if (grade === 'hard') {
      s.ease = clampEase(s.ease - 0.15);
      s.interval = s.reps === 0 ? 1 : clampInterval(Math.max(s.interval * 1.2, s.interval + 1));
    } else if (grade === 'good') {
      s.interval = goodInterval(s);
    } else { // easy
      s.ease = clampEase(s.ease + 0.15);
      // "Kolay" her zaman "İyi"den belirgin biçimde uzun olmalı.
      var good = goodInterval(s);
      s.interval = clampInterval(Math.max(good * 1.3, good + 1, 4));
    }

    s.interval = clampInterval(s.interval);
    s.reps += 1;
    s.due = dueAfterDays(now, s.interval);
    return s;
  }

  /* Buton altındaki "ne zaman tekrar geleceği" etiketi. */
  function previewLabel(state, grade, now) {
    if (grade === 'again') return '10 dk';
    return formatDays(schedule(state, grade, now).interval);
  }

  function formatDays(d) {
    if (d < 30) return d + ' gün';
    if (d < 365) return Math.round(d / 30) + ' ay';
    return (Math.round(d / 36.5) / 10) + ' yıl';
  }

  function isDue(state, now) {
    return !state || state.due <= now;
  }

  // ============================================================ seslendirme (TTS)

  var tts = {
    supported: typeof window.speechSynthesis !== 'undefined' &&
               typeof window.SpeechSynthesisUtterance !== 'undefined',
    voice: null,

    pickVoice: function () {
      if (!this.supported) return;
      var voices = window.speechSynthesis.getVoices() || [];
      for (var i = 0; i < voices.length; i++) {
        if (voices[i].lang && voices[i].lang.toLowerCase().indexOf('fr') === 0) {
          this.voice = voices[i];
          return;
        }
      }
    },

    /* iOS Safari: seslendirme yalnızca bir kullanıcı dokunuşunun ardından
       çalışır, bu yüzden hiçbir yerde otomatik konuşma tetiklenmiyor. */
    speak: function (text, btn) {
      if (!this.supported || !text) return;
      try {
        window.speechSynthesis.cancel();     // iOS'ta takılı kalan kuyruğu temizler
        if (!this.voice) this.pickVoice();

        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'fr-FR';
        u.rate = 0.9;
        if (this.voice) u.voice = this.voice;

        if (btn) {
          var done = function () { btn.classList.remove('speaking'); };
          u.onstart = function () { btn.classList.add('speaking'); };
          u.onend = done;
          u.onerror = done;
        }

        window.speechSynthesis.speak(u);
      } catch (e) {
        console.warn('Seslendirme başarısız:', e);
      }
    }
  };

  if (tts.supported) {
    tts.pickVoice();
    // Sesler asenkron yükleniyorsa (iOS/Chrome) hazır olunca tekrar dene.
    window.speechSynthesis.onvoiceschanged = function () { tts.pickVoice(); };
  }

  // ============================================================ ekran yönetimi

  function showScreen(name) {
    el.screenLevels.hidden = name !== 'levels';
    el.screenStudy.hidden = name !== 'study';
    el.screenSummary.hidden = name !== 'summary';
    el.back.hidden = name === 'levels';
    el.count.hidden = name !== 'study';
  }

  // ============================================================ kelimeleri yükle

  /* id verilmemişse kart, Fransızca yüzüyle tanınır — böylece elle JSON
     düzenlerken id uydurmak gerekmez. */
  function normalizeCards(raw) {
    var list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.cards) ? raw.cards : []);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c || !c.front || !c.back) continue;
      out.push({
        id: String(c.id != null ? c.id : c.front),
        level: String(c.level || '').toUpperCase(),
        front: String(c.front),
        back: String(c.back),
        example: c.example ? String(c.example) : '',
        exampleTr: c.exampleTr ? String(c.exampleTr) : ''
      });
    }
    return out;
  }

  /* 'A1', 'B2' gibi seviyeler A/B/C grubuna ilk harfleriyle girer. */
  function inGroup(card, key) {
    if (key === 'all') return true;
    return !!card.level && card.level.charAt(0) === key;
  }

  function cardsOf(key) {
    return cards.filter(function (c) { return inGroup(c, key); });
  }

  function loadVocab() {
    return fetch(VOCAB_FILE, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error(VOCAB_FILE + ' okunamadı (HTTP ' + res.status + ')');
      return res.json();
    }).then(normalizeCards);
  }

  // ============================================================ seviye listesi

  function dueCount(list, now) {
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      if (isDue(stateOf(list[i].id), now)) n++;
    }
    return n;
  }

  /* Grup içindeki alt seviyeleri sırayla listeler: "A1, A2" */
  function subLevels(list) {
    var seen = [];
    for (var i = 0; i < list.length; i++) {
      var lv = list[i].level;
      if (lv && seen.indexOf(lv) < 0) seen.push(lv);
    }
    return seen.sort();
  }

  function renderLevels() {
    var now = Date.now();
    el.levelList.innerHTML = '';

    if (!cards.length) {
      el.levelList.innerHTML =
        '<p class="muted">Hiç kelime bulunamadı. vocab.json dosyasını kontrol et.</p>';
      return;
    }

    GROUPS.forEach(function (g) {
      var list = cardsOf(g.key);
      if (!list.length) return;   // o harfte kelime yoksa satırı gösterme

      var due = dueCount(list, now);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'deck';

      var info = document.createElement('div');
      info.className = 'deck-info';

      var name = document.createElement('div');
      name.className = 'deck-name';
      name.textContent = g.name;

      var sub = document.createElement('div');
      sub.className = 'deck-sub';
      var levels = g.key === 'all' ? [] : subLevels(list);
      sub.textContent = (levels.length ? levels.join(', ') + ' · ' : g.note + ' · ') +
                        list.length + ' kelime';

      var badge = document.createElement('span');
      badge.className = 'deck-due' + (due ? '' : ' zero');
      badge.textContent = due;
      badge.title = 'Bugün tekrar edilecek kart';

      info.appendChild(name);
      info.appendChild(sub);
      btn.appendChild(info);
      btn.appendChild(badge);

      btn.addEventListener('click', function () { startSession(g); });
      el.levelList.appendChild(btn);
    });
  }

  // ============================================================ oturum

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function startSession(g) {
    group = g;
    var now = Date.now();

    queue = shuffle(cardsOf(g.key).filter(function (c) {
      return isDue(stateOf(c.id), now);
    }));

    stats = { reviewed: {}, answers: 0, easy: 0, again: 0 };
    el.title.textContent = g.key === 'all' ? 'Tümü' : g.name + ' · ' + g.note;

    if (!queue.length) {
      showSummary();
      return;
    }

    showScreen('study');
    nextCard();
  }

  function nextCard() {
    if (!queue.length) {
      showSummary();
      return;
    }

    current = queue.shift();
    el.count.textContent = (queue.length + 1) + ' kart';

    el.front.textContent = current.front;
    el.meaning.textContent = current.back;

    if (current.example) {
      el.example.textContent = current.example;
      el.exampleWrap.hidden = false;
      el.exampleTr.textContent = current.exampleTr;
      // Çeviri butonu yalnızca çevirisi olan kartlarda; tercih kartlar arası korunur.
      el.toggleTr.hidden = !current.exampleTr;
      applyTrVisibility();
    } else {
      el.exampleWrap.hidden = true;
    }

    // Ön yüz durumuna dön
    el.back_.hidden = true;
    el.grades.hidden = true;
    el.show.hidden = false;
    el.speakFront.classList.remove('speaking');
    el.speakExample.classList.remove('speaking');
  }

  function applyTrVisibility() {
    var has = !!(current && current.exampleTr);
    el.exampleTr.hidden = !(has && showTr);
    el.toggleTr.textContent = showTr ? 'Çeviriyi gizle' : 'Çeviriyi göster';
  }

  function revealAnswer() {
    if (!current) return;
    el.back_.hidden = false;
    el.show.hidden = true;
    el.grades.hidden = false;

    // Buton etiketlerine sonraki aralığı yaz
    var now = Date.now();
    var st = stateOf(current.id) || newState();
    ['again', 'hard', 'good', 'easy'].forEach(function (g) {
      var node = el.grades.querySelector('[data-when="' + g + '"]');
      if (node) node.textContent = previewLabel(st, g, now);
    });
  }

  function answer(grade) {
    if (!current || el.grades.hidden) return;

    var now = Date.now();
    var card = current;

    progress[card.id] = schedule(stateOf(card.id) || newState(), grade, now);
    saveProgress(progress);

    stats.reviewed[card.id] = true;
    stats.answers++;
    if (grade === 'easy') stats.easy++;
    if (grade === 'again') {
      stats.again++;
      // Aynı oturumda tekrar sor: birkaç kart sonraya yerleştir.
      queue.splice(Math.min(queue.length, 3), 0, card);
    }

    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    nextCard();
  }

  function showSummary() {
    current = null;
    var total = stats ? Object.keys(stats.reviewed).length : 0;
    el.statTotal.textContent = total;
    el.statEasy.textContent = stats ? stats.easy : 0;
    el.statAgain.textContent = stats ? stats.again : 0;

    el.summaryNext.textContent = total === 0
      ? 'Bu seviyede bugün tekrar edilecek kart kalmadı. 👌'
      : nextDueText();

    showScreen('summary');
  }

  function nextDueText() {
    if (!group) return '';
    var now = Date.now();
    var list = cardsOf(group.key);
    var soonest = Infinity;
    for (var i = 0; i < list.length; i++) {
      var st = stateOf(list[i].id);
      if (st && st.due > now && st.due < soonest) soonest = st.due;
    }
    if (soonest === Infinity) return '';
    var days = Math.max(0, Math.ceil((soonest - now) / DAY));
    return days <= 1
      ? 'Sıradaki tekrar: yarın.'
      : 'Sıradaki tekrar: ' + days + ' gün sonra.';
  }

  function backToLevels() {
    group = null;
    current = null;
    el.title.textContent = 'Fransızca Kartlar';
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    renderLevels();
    showScreen('levels');
  }

  // ============================================================ olaylar

  el.show.addEventListener('click', revealAnswer);

  el.grades.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.grade') : null;
    if (btn && btn.dataset.grade) answer(btn.dataset.grade);
  });

  el.speakFront.addEventListener('click', function () {
    if (current) tts.speak(current.front, el.speakFront);
  });

  el.speakExample.addEventListener('click', function () {
    if (current && current.example) tts.speak(current.example, el.speakExample);
  });

  el.toggleTr.addEventListener('click', function () {
    showTr = !showTr;
    writePref(TR_PREF_KEY, showTr ? '1' : '0');
    applyTrVisibility();
  });

  el.back.addEventListener('click', backToLevels);
  el.toDecks.addEventListener('click', backToLevels);
  el.restart.addEventListener('click', function () {
    if (group) startSession(group);
    else backToLevels();
  });

  // Masaüstünde pratik olsun diye klavye kısayolları (iPhone'da etkisiz).
  document.addEventListener('keydown', function (e) {
    if (el.screenStudy.hidden) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!el.show.hidden) revealAnswer();
    } else if (['1', '2', '3', '4'].indexOf(e.key) >= 0) {
      answer(['again', 'hard', 'good', 'easy'][Number(e.key) - 1]);
    }
  });

  // ============================================================ başlangıç

  if (!tts.supported) {
    el.speakFront.disabled = true;
    el.speakExample.disabled = true;
    el.speakFront.textContent = '🔇 Seslendirme desteklenmiyor';
  }

  loadVocab().then(function (list) {
    cards = list;
    renderLevels();
    showScreen('levels');
  }).catch(function (err) {
    console.error(err);
    el.levelList.innerHTML = '';
    el.loadError.hidden = false;
    el.loadError.textContent =
      'Kelimeler yüklenemedi (' + err.message + '). Dosyaları doğrudan açmak (file://) ' +
      'yerine bir web sunucusundan servis et: örn. "python3 -m http.server" veya GitHub Pages.';
  });

})();
