/**
 * TrackerSaaS - First Party Tracking Script
 * Version: 1.1.0
 *
 * Usage: <script src="https://your-app.vercel.app/tracker.js" data-tid="trk_YOUR_ID" async></script>
 *
 * Consent mode (GDPR/CCPA):
 *   Add data-consent-mode="true" to the script tag to activate event queuing.
 *   On user accept:  tracker.setConsent(true)   → flushes queued events
 *   On user decline: tracker.setConsent(false)  → discards queued events
 *   Pre-load hold:   tracker.holdConsent()      → call before banner resolves
 */
(function (window, document) {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────
  var script = document.currentScript ||
    document.querySelector('script[data-tid]');
  var CONFIG = {
    tid:             script ? script.getAttribute('data-tid') : null,
    endpoint:        script ? (script.getAttribute('data-endpoint') ||
                     script.src.replace('/tracker.js', '') + '/api/collect') : '/api/collect',
    cookieName:      '__fpt',
    sessionName:     '__fps',
    cookieDays:      365,
    sessionMinutes:  30,
    scrollThresholds: [25, 50, 75, 100],
  };

  if (!CONFIG.tid) {
    console.warn('[Tracker] Missing data-tid attribute.');
    return;
  }

  // ── Consent Management ──────────────────────────────────────────────────
  // Opt-in via data-consent-mode="true". Without it, events fire normally.
  var CONSENT_MODE    = !!(script && script.getAttribute('data-consent-mode') === 'true');
  var _consentGranted = null;  // null = unknown, true = granted, false = denied
  var _pendingQueue   = [];

  // Restore previous consent decision from localStorage (returning visitors)
  if (CONSENT_MODE) {
    try {
      var _prevConsent = localStorage.getItem('__trk_consent');
      if (_prevConsent === 'granted') _consentGranted = true;
      if (_prevConsent === 'denied')  _consentGranted = false;
    } catch (e) {}
  }

  // ── Utilities ────────────────────────────────────────────────────────────
  function generateId() {
    var arr = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(arr);
    } else {
      for (var i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(arr).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; expires=' + expires + '; path=/; SameSite=Lax';
  }

  function getOrCreate(cookieName, expireDays) {
    var val = getCookie(cookieName);
    if (!val) {
      val = generateId();
      setCookie(cookieName, val, expireDays);
    }
    return val;
  }

  // ── Fingerprint (fallback when cookies are blocked) ───────────────────
  function buildFingerprint() {
    var parts = [
      navigator.userAgent || '',
      navigator.language || '',
      screen.width + 'x' + screen.height,
      screen.colorDepth || '',
      new Date().getTimezoneOffset(),
      !!window.sessionStorage,
      !!window.localStorage,
      navigator.hardwareConcurrency || '',
    ];
    var str = parts.join('|');
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }

  // ── Traffic Source Auto-Detection ────────────────────────────────────
  function detectTrafficSource(params, referrer) {
    if (params.get('fbclid'))                                                return { source: 'facebook', medium: 'paid' };
    if (params.get('gclid') || params.get('gbraid') || params.get('wbraid')) return { source: 'google',   medium: 'paid' };
    if (params.get('ttclid'))                                                return { source: 'tiktok',   medium: 'paid' };
    if (params.get('msclkid'))                                               return { source: 'bing',     medium: 'paid' };
    if (params.get('twclid'))                                                return { source: 'twitter',  medium: 'paid' };
    if (params.get('li_fat_id'))                                             return { source: 'linkedin', medium: 'paid' };

    var utmSource = params.get('utm_source');
    if (utmSource) return {
      source: utmSource,
      medium: params.get('utm_medium') || 'unknown',
    };

    if (!referrer) return { source: 'direct', medium: 'none' };
    try {
      var host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
      if (/facebook\.com|fb\.com|instagram\.com|messenger\.com/.test(host)) return { source: 'facebook',  medium: 'social' };
      if (/google\.[a-z]+/.test(host))                                       return { source: 'google',    medium: 'organic' };
      if (/bing\.com|msn\.com/.test(host))                                   return { source: 'bing',      medium: 'organic' };
      if (/yahoo\.com/.test(host))                                           return { source: 'yahoo',     medium: 'organic' };
      if (/tiktok\.com/.test(host))                                          return { source: 'tiktok',    medium: 'social' };
      if (/youtube\.com|youtu\.be/.test(host))                               return { source: 'youtube',   medium: 'social' };
      if (/twitter\.com|t\.co|x\.com/.test(host))                            return { source: 'twitter',   medium: 'social' };
      if (/linkedin\.com/.test(host))                                        return { source: 'linkedin',  medium: 'social' };
      if (/pinterest\.com/.test(host))                                       return { source: 'pinterest', medium: 'social' };
      if (/reddit\.com/.test(host))                                          return { source: 'reddit',    medium: 'social' };
      if (/mail\.google|mail\.yahoo|outlook\.live|webmail/.test(host))       return { source: 'email',     medium: 'email' };
      return { source: host, medium: 'referral' };
    } catch (e) {
      return { source: 'unknown', medium: 'unknown' };
    }
  }

  // ── UTM & Click ID capture ────────────────────────────────────────────
  function captureUtmsAndClickIds() {
    var params  = new URLSearchParams(window.location.search);
    var utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    var stored  = {};

    try {
      var saved = localStorage.getItem('__trk_utms');
      if (saved) stored = JSON.parse(saved);
    } catch (e) {}

    var hasNewUtms = false;
    utmKeys.forEach(function (k) {
      var v = params.get(k);
      if (v) { stored[k] = v; hasNewUtms = true; }
    });
    if (hasNewUtms) {
      try { localStorage.setItem('__trk_utms', JSON.stringify(stored)); } catch (e) {}
    }

    // fbclid → _fbc cookie (browser-side; server also sets it via Set-Cookie for ITP bypass)
    var fbclid = params.get('fbclid');
    if (fbclid) {
      var fbc = 'fb.1.' + Date.now() + '.' + fbclid;
      setCookie('_fbc', fbc, 90);
    }

    var gclid = params.get('gclid');
    if (gclid) {
      try { localStorage.setItem('__trk_gclid', gclid); } catch (e) {}
    }

    var fbp = getCookie('_fbp');
    if (!fbp) {
      fbp = 'fb.1.' + Date.now() + '.' + Math.floor(Math.random() * 2147483647);
      setCookie('_fbp', fbp, 90);
    }

    // Always re-detect source from current page signals (fbclid, gclid, referrer, etc.)
    // This is crucial: if cached source is "direct" but user now arrives via a FB ad
    // (fbclid present), the ad click MUST override the stale cache.
    var currentSrc = detectTrafficSource(params, document.referrer);
    var srcData = currentSrc;
    try {
      if (currentSrc.source !== 'direct' && currentSrc.source !== 'unknown') {
        // Current page has a real signal — use it and update cache
        localStorage.setItem('__trk_src', JSON.stringify(currentSrc));
      } else {
        // No signal on this page → preserve first-touch from cache if available
        var savedSrc = localStorage.getItem('__trk_src');
        if (savedSrc) {
          srcData = JSON.parse(savedSrc);
        } else {
          localStorage.setItem('__trk_src', JSON.stringify(currentSrc));
        }
      }
    } catch (e) {
      srcData = currentSrc;
    }

    // Capture referrer host for no-UTM traffic attribution display
    var refHost;
    try {
      if (document.referrer) {
        refHost = new URL(document.referrer).hostname.replace(/^www\./, '');
      }
    } catch (e) {}

    return {
      utms:        Object.keys(stored).length ? stored : undefined,
      fbc:         getCookie('_fbc') || undefined,
      fbp:         fbp || undefined,
      source:      srcData.source || undefined,
      medium:      srcData.medium || undefined,
      referrer_host: refHost || undefined,
    };
  }

  var clickData = captureUtmsAndClickIds();

  // ── Identity ──────────────────────────────────────────────────────────
  var visitorId  = getOrCreate(CONFIG.cookieName, CONFIG.cookieDays);
  var sessionId  = getOrCreate(CONFIG.sessionName, CONFIG.sessionMinutes / 1440);
  var fingerprint = buildFingerprint();

  // ── Core HTTP sender (bypasses consent check — called only when allowed) ─
  function sendImmediate(eventName, extra) {
    var baseProps = {};
    if (clickData.fbc)           baseProps.fbc           = clickData.fbc;
    if (clickData.fbp)           baseProps.fbp           = clickData.fbp;
    if (clickData.utms)          baseProps.utms          = clickData.utms;
    if (clickData.source)        baseProps.source        = clickData.source;
    if (clickData.medium)        baseProps.medium        = clickData.medium;
    if (clickData.referrer_host) baseProps.referrer_host = clickData.referrer_host;

    var extraWithProps = Object.assign({}, extra || {});
    if (Object.keys(baseProps).length) {
      extraWithProps.props = Object.assign({}, baseProps, extra && extra.props ? extra.props : {});
    }

    var payload = Object.assign({
      tid: CONFIG.tid,
      event: eventName,
      vid:   visitorId,
      sid:   sessionId,
      fp:    fingerprint,
      url:   window.location.href,
      ref:   document.referrer || '',
    }, extraWithProps);

    var data = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      var blob = new Blob([data], { type: 'application/json' });
      navigator.sendBeacon(CONFIG.endpoint, blob);
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', CONFIG.endpoint, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(data);
    }
  }

  // ── Consent-aware dispatcher ──────────────────────────────────────────
  // - CONSENT_MODE off (default): fires immediately, no queuing
  // - CONSENT_MODE on + granted:  fires immediately
  // - CONSENT_MODE on + unknown:  queues until setConsent() is called
  // - CONSENT_MODE on + denied:   silently drops
  function send(eventName, extra) {
    if (!CONSENT_MODE || _consentGranted === true) {
      sendImmediate(eventName, extra);
    } else if (_consentGranted === null) {
      _pendingQueue.push({ e: eventName, x: extra });
    }
    // _consentGranted === false → silently drop
  }

  // ── Page View ────────────────────────────────────────────────────────
  send('page_view');

  // SPA navigation
  var lastUrl = window.location.href;
  function checkUrlChange() {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      send('page_view');
    }
  }
  var origPush    = history.pushState;
  var origReplace = history.replaceState;
  history.pushState    = function () { origPush.apply(this, arguments); checkUrlChange(); };
  history.replaceState = function () { origReplace.apply(this, arguments); checkUrlChange(); };
  window.addEventListener('popstate', checkUrlChange);

  // ── Scroll Depth ──────────────────────────────────────────────────────
  var scrollFired = {};

  function getScrollPercent() {
    var doc       = document.documentElement;
    var body      = document.body;
    var scrollTop = window.pageYOffset || doc.scrollTop || body.scrollTop;
    var docHeight = Math.max(body.scrollHeight, doc.scrollHeight, body.offsetHeight, doc.offsetHeight, body.clientHeight, doc.clientHeight);
    var winHeight = window.innerHeight || doc.clientHeight;
    var scrollable = docHeight - winHeight;
    if (scrollable <= 0) return 100;
    return Math.round((scrollTop / scrollable) * 100);
  }

  function onScroll() {
    var pct = getScrollPercent();
    CONFIG.scrollThresholds.forEach(function (threshold) {
      if (pct >= threshold && !scrollFired[threshold]) {
        scrollFired[threshold] = true;
        send('scroll_' + threshold);
      }
    });
  }

  var scrollTimer;
  window.addEventListener('scroll', function () {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(onScroll, 150);
  }, { passive: true });

  // ── Lead Detection ────────────────────────────────────────────────────
  function findEmailInForm(form) {
    var inputs = form.querySelectorAll('input[type="email"], input[name*="email"], input[id*="email"]');
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].value && inputs[i].value.includes('@')) {
        return inputs[i].value.trim().toLowerCase();
      }
    }
    return null;
  }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    var email = findEmailInForm(form);
    if (email) send('lead', { email: email });
  }, true);

  // ── Purchase Detection ────────────────────────────────────────────────
  function trackPurchase(data) {
    send('purchase', {
      email:    data.email    || null,
      value:    data.value    || null,
      currency: data.currency || 'USD',
      order_id: data.orderId  || data.order_id || null,
    });
  }

  (function detectPurchaseFromUrl() {
    var params  = new URLSearchParams(window.location.search);
    var orderId = params.get('order_id') || params.get('order') || params.get('transaction_id');
    var value   = params.get('value')    || params.get('total') || params.get('amount');
    if (orderId) {
      trackPurchase({
        order_id: orderId,
        value:    value ? parseFloat(value) : null,
        currency: params.get('currency') || 'USD',
        email:    params.get('email')    || null,
      });
    }
  })();

  // ── Public API ────────────────────────────────────────────────────────
  window.tracker = {
    /** tracker.purchase({ value, currency, orderId, email }) */
    purchase: trackPurchase,

    /** tracker.lead({ email }) */
    lead: function (data) {
      send('lead', { email: data.email || null });
    },

    /** tracker.track('event_name', { key: 'value' }) */
    track: function (eventName, props) {
      send(eventName, { props: props || {} });
    },

    /**
     * tracker.setConsent(true|false)
     * Call after the user responds to the cookie/consent banner.
     * - true:  grants consent, flushes any queued events, persists decision
     * - false: denies consent, discards queued events, persists decision
     */
    setConsent: function (granted) {
      _consentGranted = !!granted;
      CONSENT_MODE    = true;
      try { localStorage.setItem('__trk_consent', granted ? 'granted' : 'denied'); } catch (e) {}
      if (granted) {
        var item;
        while (_pendingQueue.length) {
          item = _pendingQueue.shift();
          sendImmediate(item.e, item.x);
        }
      } else {
        _pendingQueue = [];
      }
    },

    /**
     * tracker.holdConsent()
     * Call SYNCHRONOUSLY before or right after the script loads to put all
     * events on hold without yet knowing the user's decision.
     * Useful when you activate consent mode dynamically instead of via data-consent-mode.
     */
    holdConsent: function () {
      if (_consentGranted === true) return; // already granted, don't hold
      CONSENT_MODE    = true;
      _consentGranted = null;
    },
  };

})(window, document);
