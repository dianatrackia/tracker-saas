/**
 * TrackerSaaS - First Party Tracking Script
 * Version: 1.0.0
 *
 * Usage: <script src="https://your-app.vercel.app/tracker.js" data-tid="trk_YOUR_ID" async></script>
 */
(function (window, document) {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────
  var script = document.currentScript ||
    document.querySelector('script[data-tid]');
  var CONFIG = {
    tid:      script ? script.getAttribute('data-tid') : null,
    endpoint: script ? (script.getAttribute('data-endpoint') ||
              script.src.replace('/tracker.js', '') + '/api/collect') : '/api/collect',
    cookieName: '__fpt',       // first party tracker cookie
    sessionName: '__fps',      // session cookie
    cookieDays: 365,
    sessionMinutes: 30,
    scrollThresholds: [25, 50, 75, 100],
  };

  if (!CONFIG.tid) {
    console.warn('[Tracker] Missing data-tid attribute.');
    return;
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
    // Simple djb2 hash
    var str = parts.join('|');
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }

  // ── Identity ──────────────────────────────────────────────────────────
  var visitorId = getOrCreate(CONFIG.cookieName, CONFIG.cookieDays);
  var sessionId = getOrCreate(CONFIG.sessionName, CONFIG.sessionMinutes / 1440);
  var fingerprint = buildFingerprint();

  // ── Send event ────────────────────────────────────────────────────────
  function send(eventName, extra) {
    var payload = Object.assign({
      tid:   CONFIG.tid,
      event: eventName,
      vid:   visitorId,
      sid:   sessionId,
      fp:    fingerprint,
      url:   window.location.href,
      ref:   document.referrer || '',
    }, extra || {});

    // Use sendBeacon when available (non-blocking, survives page unload)
    var data = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      var blob = new Blob([data], { type: 'application/json' });
      navigator.sendBeacon(CONFIG.endpoint, blob);
    } else {
      // Fallback: XHR
      var xhr = new XMLHttpRequest();
      xhr.open('POST', CONFIG.endpoint, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(data);
    }
  }

  // ── Page View ────────────────────────────────────────────────────────
  send('page_view');

  // Handle SPA navigation (pushState / replaceState)
  var lastUrl = window.location.href;
  function checkUrlChange() {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      send('page_view');
    }
  }
  var origPush = history.pushState;
  var origReplace = history.replaceState;
  history.pushState = function () { origPush.apply(this, arguments); checkUrlChange(); };
  history.replaceState = function () { origReplace.apply(this, arguments); checkUrlChange(); };
  window.addEventListener('popstate', checkUrlChange);

  // ── Scroll Depth ──────────────────────────────────────────────────────
  var scrollFired = {};

  function getScrollPercent() {
    var doc = document.documentElement;
    var body = document.body;
    var scrollTop = window.pageYOffset || doc.scrollTop || body.scrollTop;
    var docHeight = Math.max(
      body.scrollHeight, doc.scrollHeight,
      body.offsetHeight, doc.offsetHeight,
      body.clientHeight, doc.clientHeight
    );
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

  // Throttle scroll handler
  var scrollTimer;
  window.addEventListener('scroll', function () {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(onScroll, 150);
  }, { passive: true });

  // ── Lead Detection ────────────────────────────────────────────────────
  // Intercepts form submissions to detect lead events.
  // Looks for email fields in any form on the page.
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
    if (email) {
      send('lead', { email: email });
    }
  }, true);

  // Also detect when hidden email inputs are set (e.g., ActiveCampaign embeds)
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el && el.type === 'email' && el.value && el.value.includes('@')) {
      // Will be sent on form submit — no duplicate needed here
    }
  });

  // ── Purchase Detection ────────────────────────────────────────────────
  // Exposes window.tracker.purchase() for manual integration
  // Also auto-detects common purchase confirmation URL patterns

  function trackPurchase(data) {
    send('purchase', {
      email:    data.email || null,
      value:    data.value || null,
      currency: data.currency || 'USD',
      order_id: data.orderId || data.order_id || null,
    });
  }

  // Auto-detect: URL params like ?order_id=xxx&value=99
  (function detectPurchaseFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var orderId = params.get('order_id') || params.get('order') || params.get('transaction_id');
    var value   = params.get('value') || params.get('total') || params.get('amount');
    if (orderId) {
      trackPurchase({
        order_id: orderId,
        value: value ? parseFloat(value) : null,
        currency: params.get('currency') || 'USD',
        email: params.get('email') || null,
      });
    }
  })();

  // ── Public API ────────────────────────────────────────────────────────
  window.tracker = {
    /**
     * Track a custom purchase event manually.
     * tracker.purchase({ value: 99.00, currency: 'USD', orderId: 'ORD-123', email: 'user@example.com' })
     */
    purchase: trackPurchase,

    /**
     * Track a lead manually.
     * tracker.lead({ email: 'user@example.com' })
     */
    lead: function (data) {
      send('lead', { email: data.email || null });
    },

    /**
     * Track any custom event.
     * tracker.track('my_event', { key: 'value' })
     */
    track: function (eventName, props) {
      send(eventName, { props: props || {} });
    },
  };

})(window, document);
