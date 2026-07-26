/* Fransızca Kartlar — basit, backend'siz aralıklı tekrar uygulaması.
   Tüm ilerleme localStorage'da tutulur. */

(function () {
  'use strict';

  // ---------------------------------------------------------------- sabitler
  var STORAGE_KEY = 'frcards.v1.progress';
  var LAST_DECK_KEY = 'frcards.v1.lastDeck';
  var LEVEL_KEY = 'frcards.v1.level';
  var TR_PREF_KEY = 'frcards.v1.showExampleTr';
  var DECKS_INDEX = 'vocab/decks.json';

  var DAY = 24 * 60 * 60 * 1000;
  var AGAIN_DELAY = 10 * 60 * 1000; // "Tekrar" → 10 dakika sonra
  var MIN_EASE = 1.3;
  var START_EASE = 2.5;
  var MAX_INTERVAL = 365;

  // ------------------------------------------------------------------ durum
  var decks = [];          // [{id, name, file, description, level, cards: []}]
  var deck = null;         // aktif deste
  var queue = [];          // bu oturumda gösterilecek kartlar
  var current = null;      // ekrandaki kart
  var stats = null;        // oturum istatistikleri
  var level = readPref(LEVEL_KEY, 'all');            // 'all' | 'A' | 'B' | 'C'
  var showTr = readPref(TR_PREF_KEY, '0') === '1';   // örnek cümle çevirisi açık mı

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

    screenDecks: $('screen-decks'),
    levelFilter: $('level-filter'),
    deckList: $('deck-list'),
    deckError: $('deck-error'),

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

  function keyOf(deckId, cardId) { return deckId + '::' + cardId; }

  function stateOf(deckId, cardId) {
    return progress[keyOf(deckId, cardId)] || null;
  }

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
    var s = schedule(state, grade, now);
    return formatDays(s.interval);
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
    el.screenDecks.hidden = name !== 'decks';
    el.screenStudy.hidden = name !== 'study';
    el.screenSummary.hidden = name !== 'summary';
    el.back.hidden = name === 'decks';
    el.count.hidden = name !== 'study';
  }

  // ============================================================ desteleri yükle

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error(url + ' okunamadı (HTTP ' + res.status + ')');
      return res.json();
    });
  }

  /* Deste dosyası ya düz bir dizi ya da { name, cards: [...] } olabilir. */
  function normalizeCards(raw, deckId, deckLevel) {
    var list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.cards) ? raw.cards : []);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c || !c.front || !c.back) continue;
      out.push({
        id: String(c.id != null ? c.id : (deckId + '-' + i)),
        front: String(c.front),
        back: String(c.back),
        example: c.example ? String(c.example) : '',
        exampleTr: c.exampleTr ? String(c.exampleTr) : '',
        // Kartın kendi seviyesi yoksa destenin seviyesini devralır.
        level: String(c.level || deckLevel || '').toUpperCase()
      });
    }
    return out;
  }

  /* 'A1', 'B2' gibi seviyeler A/B/C filtresine ilk harfiyle eşleşir. */
  function matchesLevel(cardLevel, filter) {
    if (filter === 'all') return true;
    return !!cardLevel && cardLevel.charAt(0) === filter;
  }

  function cardsForLevel(d) {
    return d.cards.filter(function (c) { return matchesLevel(c.level, level); });
  }

  function loadDecks() {
    return fetchJSON(DECKS_INDEX).then(function (index) {
      var list = Array.isArray(index) ? index : (index.decks || []);
      return Promise.all(list.map(function (d, i) {
        var id = String(d.id || d.file || ('deste-' + i));
        var lvl = String(d.level || '').toUpperCase();
        return fetchJSON(d.file).then(function (raw) {
          return {
            id: id,
            name: d.name || id,
            description: d.description || '',
            level: lvl,
            file: d.file,
            cards: normalizeCards(raw, id, lvl)
          };
        }).catch(function (err) {
          console.warn(err);
          return {
            id: id, name: d.name || id, description: 'Dosya okunamadı',
            level: lvl, file: d.file, cards: []
          };
        });
      }));
    });
  }

  function dueCount(cards, deckId, now) {
    var n = 0;
    for (var i = 0; i < cards.length; i++) {
      if (isDue(stateOf(deckId, cards[i].id), now)) n++;
    }
    return n;
  }

  function renderLevelChips() {
    var chips = el.levelFilter.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('is-active', chips[i].dataset.level === level);
    }
  }

  function renderDecks() {
    var now = Date.now();
    el.deckList.innerHTML = '';
    renderLevelChips();

    if (!decks.length) {
      el.deckList.innerHTML = '<p class="muted">Hiç deste bulunamadı. vocab/decks.json dosyasını kontrol et.</p>';
      return;
    }

    // Seçili seviyede kartı olmayan desteler listelenmez.
    var visible = decks.filter(function (d) { return cardsForLevel(d).length > 0; });

    if (!visible.length) {
      el.deckList.innerHTML =
        '<p class="muted">Bu seviyede kart yok. Başka bir seviye seç ya da vocab/ altına ' +
        'bu seviyede bir deste ekle.</p>';
      return;
    }

    visible.forEach(function (d) {
      var cards = cardsForLevel(d);
      var due = dueCount(cards, d.id, now);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'deck';

      var info = document.createElement('div');
      info.className = 'deck-info';

      var name = document.createElement('div');
      name.className = 'deck-name';
      if (d.level) {
        var tag = document.createElement('span');
        tag.className = 'level-tag';
        tag.textContent = d.level;
        name.appendChild(tag);
      }
      name.appendChild(document.createTextNode(d.name));

      var sub = document.createElement('div');
      sub.className = 'deck-sub';
      sub.textContent = d.description
        ? d.description + ' · ' + cards.length + ' kart'
        : cards.length + ' kart';

      var badge = document.createElement('span');
      badge.className = 'deck-due' + (due ? '' : ' zero');
      badge.textContent = due;
      badge.title = 'Bugün tekrar edilecek kart';

      info.appendChild(name);
      info.appendChild(sub);
      btn.appendChild(info);
      btn.appendChild(badge);

      btn.addEventListener('click', function () { startSession(d); });
      el.deckList.appendChild(btn);
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

  function startSession(d) {
    deck = d;
    try { localStorage.setItem(LAST_DECK_KEY, d.id); } catch (e) {}

    var now = Date.now();
    queue = shuffle(cardsForLevel(d).filter(function (c) {
      return isDue(stateOf(d.id, c.id), now);
    }));

    stats = { reviewed: {}, answers: 0, easy: 0, again: 0 };
    el.title.textContent = d.name;

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
    var st = stateOf(deck.id, current.id) || newState();
    ['again', 'hard', 'good', 'easy'].forEach(function (g) {
      var node = el.grades.querySelector('[data-when="' + g + '"]');
      if (node) node.textContent = previewLabel(st, g, now);
    });
  }

  function answer(grade) {
    if (!current || el.grades.hidden) return;

    var now = Date.now();
    var card = current;
    var st = stateOf(deck.id, card.id) || newState();

    progress[keyOf(deck.id, card.id)] = schedule(st, grade, now);
    saveProgress(progress);

    stats.reviewed[card.id] = true;
    stats.answers++;
    if (grade === 'easy') stats.easy++;
    if (grade === 'again') {
      stats.again++;
      // Aynı oturumda tekrar sor: birkaç kart sonraya yerleştir.
      var pos = Math.min(queue.length, 3);
      queue.splice(pos, 0, card);
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
      ? 'Bu destede bugün tekrar edilecek kart kalmadı. 👌'
      : nextDueText();

    showScreen('summary');
  }

  function nextDueText() {
    if (!deck) return '';
    var now = Date.now();
    var soonest = Infinity;
    var cards = cardsForLevel(deck);
    for (var i = 0; i < cards.length; i++) {
      var st = stateOf(deck.id, cards[i].id);
      if (st && st.due > now && st.due < soonest) soonest = st.due;
    }
    if (soonest === Infinity) return '';
    var days = Math.max(0, Math.ceil((soonest - now) / DAY));
    return days <= 1
      ? 'Sıradaki tekrar: yarın.'
      : 'Sıradaki tekrar: ' + days + ' gün sonra.';
  }

  function backToDecks() {
    deck = null;
    current = null;
    el.title.textContent = 'Fransızca Kartlar';
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    renderDecks();
    showScreen('decks');
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

  el.levelFilter.addEventListener('click', function (e) {
    var chip = e.target.closest ? e.target.closest('.chip') : null;
    if (!chip || !chip.dataset.level || chip.dataset.level === level) return;
    level = chip.dataset.level;
    writePref(LEVEL_KEY, level);
    renderDecks();
  });

  el.back.addEventListener('click', backToDecks);
  el.toDecks.addEventListener('click', backToDecks);
  el.restart.addEventListener('click', function () {
    if (deck) startSession(deck);
    else backToDecks();
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

  loadDecks().then(function (list) {
    decks = list;
    renderDecks();
    showScreen('decks');
  }).catch(function (err) {
    console.error(err);
    el.deckList.innerHTML = '';
    el.deckError.hidden = false;
    el.deckError.textContent =
      'Desteler yüklenemedi (' + err.message + '). Dosyaları doğrudan açmak (file://) ' +
      'yerine bir web sunucusundan servis et: örn. "python3 -m http.server" veya GitHub Pages.';
  });

})();
