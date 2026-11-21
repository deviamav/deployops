/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Pure PHP/HTML file transforms used by the deploy engine.
 * Every function takes a utf-8 string and returns a utf-8 string without side effects.
 *
 * !!! Do not change the header formatting without updating the unit tests (tests/transformers.test.ts).
 */

// === File headers (byte-exact; covered by unit tests) ========================

export const OFFER_BN_PHP_HEADER =
  `<?php

session_start();


$fullUrl = "http://" . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];


$_SESSION['full_url'] = $fullUrl;

?>




<?php

session_start();

if (true) {
  $_SESSION['url_params'] = http_build_query($_GET);
}
?>
<?php
session_start();

// Сохраняем GET-параметры в сессию
if (!empty($_GET['eventid'])) {
  $_SESSION['eventid'] = $_GET['eventid'];
}
if (!empty($_GET['awtag'])) {
  $_SESSION['awtag'] = $_GET['awtag'];
}
// TikTok Pixel ID з ?pixel= (і alias pixel_id) — на thanks після POST URL часто без нього
if (!empty($_GET['pixel'])) {
  $_SESSION['tt_pixel'] = $_GET['pixel'];
} elseif (!empty($_GET['pixel_id'])) {
  $_SESSION['tt_pixel'] = $_GET['pixel_id'];
}
if (!empty($_SERVER['REQUEST_URI'])) {
  $_SESSION['full_url'] = $_SERVER['REQUEST_URI'];
}
?>

`;

export const THANKS_PHP_HEADER =
  `<?php
session_start();

// Получаем параметры из сессии
$eventId = $_SESSION['eventid'] ?? '';
$awTag = $_SESSION['awtag'] ?? '';
$fullUrl = $_SESSION['full_url'] ?? '';
$ttPixel = $_SESSION['tt_pixel'] ?? '';

// Очищаем сессию после использования
unset($_SESSION['eventid']);
unset($_SESSION['awtag']);
unset($_SESSION['full_url']);
unset($_SESSION['tt_pixel']);
?>

`;

export function landingBnPhpHeader(landingName: string): string {
  const safe = String(landingName).replace(/'/g, "\\'");
  return `<?php

session_start();

if (true) {
    $_SESSION['landing_name'] = '${safe}';
    $_SESSION['url_params'] = http_build_query($_GET);
}
?>

`;
}

// === GTAG (для thanks.php) ===================================================

export const GTAG_SCRIPT =
  `<script async src="https://www.googletagmanager.com/gtag/js?id=AW-<?php echo htmlspecialchars($awTag); ?>"></script>
<script>
    window.dataLayer = window.dataLayer || [];
    function gtag() {
        console.log('gtag call:', arguments);
        dataLayer.push(arguments);
    }

    gtag('js', new Date());
    gtag('config', 'AW-<?php echo htmlspecialchars($awTag); ?>');

    const conversionData = {
        'send_to': 'AW-<?php echo htmlspecialchars($awTag); ?>/<?php echo htmlspecialchars($eventId); ?>',
        'value': 1.0,
        'currency': 'UAH'
    };
    console.log('Sending conversion event with data:', conversionData);
    gtag('event', 'conversion', conversionData);
</script>`;

// === Шаблон redirect-скрипту для landing → /per/bn.php ======================

export const LANDING_REDIRECT_SCRIPT =
  `<script>
    let allLinks = Array.from(document.getElementsByTagName("a"));

    allLinks.forEach((aL) => {
        if (aL.id !== "read-more") {
            aL.addEventListener("click", (e) => {
                e.preventDefault();

                window.location.href = "../per/bn.php?" + "<?php echo http_build_query($_GET); ?>";
            });
        }
    });
</script>`;

/** Cubbe land+offer: ленд у offer/, оффер у offer/money/ */
export const CUBBE_LANDING_REDIRECT_SCRIPT =
  `<script>
    let allLinks = Array.from(document.getElementsByTagName("a"));

    allLinks.forEach((aL) => {
        if (aL.id !== "read-more") {
            aL.addEventListener("click", (e) => {
                e.preventDefault();

                window.location.href = "./money/index.php?" + "<?php echo http_build_query($_GET); ?>";
            });
        }
    });
</script>`;

// === Pure functions ==========================================================

/**
 * Видаляє все, що знаходиться ДО першого `<!doctype html>` або `<html`
 * (case-insensitive). Якщо співпадіння немає — повертає вхід без змін.
 */
export function stripPhpHeader(content: string): string {
  const re = /^[\s\S]*?(?=<!doctype\s+html|<html[\s>])/i;
  const m = content.match(re);
  if (!m || m[0].length === 0) return content;
  return content.slice(m[0].length);
}

export function addOfferBnPhpHeader(content: string): string {
  return OFFER_BN_PHP_HEADER + content;
}

export function addThanksPhpHeader(content: string): string {
  return THANKS_PHP_HEADER + content;
}

export function addLandingBnPhpHeader(content: string, landingName: string): string {
  return landingBnPhpHeader(landingName) + content;
}

/**
 * Інжектить `<base href="...">` одразу після першого `<head ...>` (зі збереженням
 * атрибутів). Якщо `<head>` відсутній — повертає вхід без змін.
 *
 * `hrefPath` — лише шлях ("/reffo/bn.php" або "/per/bn.php"); хост підставляє PHP.
 */
export function injectBaseHref(content: string, hrefPath: string): string {
  const baseTag = `<base href="https://<?php echo $_SERVER['HTTP_HOST']; ?>${hrefPath}">`;
  let injected = false;
  const out = content.replace(/(<head[^>]*>)/i, (m) => {
    if (injected) return m;
    injected = true;
    return `${m}\n${baseTag}`;
  });
  return out;
}

/** Відомі значення source у api.php офферів. */
const API_SOURCE_RE =
  /(['"])source\1\s*=>\s*(['"])(?:FB|Bigo|Google|TikTok|tiktok|facebook|Facebook)\2/gi;

/**
 * Ставить `'source' => '…'` під мережу пікселя:
 * Google → Google · Facebook → FB · TikTok → TikTok
 */
export function replaceApiSource(
  content: string,
  source: "Google" | "FB" | "TikTok",
): string {
  if (API_SOURCE_RE.test(content)) {
    API_SOURCE_RE.lastIndex = 0;
    return content.replace(API_SOURCE_RE, `'source' => '${source}'`);
  }
  // fallback: старий патерн лише з одинарними лапками
  return content.replace(
    /'source'\s*=>\s*'(?:FB|Bigo|Google|TikTok|tiktok|facebook|Facebook)'/gi,
    `'source' => '${source}'`,
  );
}

/** @deprecated використовуй replaceApiSource(content, "Google") */
export function replaceApiSourceToGoogle(content: string): string {
  return replaceApiSource(content, "Google");
}

const FB_PIXEL_RE =
  /<script>\s*!function\s*\(\s*f\s*,\s*b\s*,\s*e\s*,\s*v\s*,\s*n\s*,\s*t\s*,\s*s\s*\)[\s\S]*?fbq\(\s*['"]track['"]\s*,\s*['"]Lead['"]\s*\)\s*;?\s*<\/script>/i;

/**
 * TikTok Pixel на bn / лендінгу (upper+mid funnel для Events Manager / модерації):
 *   ?pixel= → PHP session → localStorage
 *   PageView (ttq.page) + ViewContent на load
 *   ClickButton на кліки CTA/кнопок
 *   SubmitForm + Lead на submit форми (по факту кліка submit, не Purchase)
 * Конверсії Contact / CompleteRegistration / Purchase — на thanks.
 */
export const TIKTOK_PIXEL_SCRIPT = `<!-- TikTok Pixel -->
<script>
!function (w, d, t) {
    w.TiktokAnalyticsObject = t;
    var ttq = w[t] = w[t] || [];
    ttq.methods = ["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
    ttq.setAndDefer = function (t, e) {
        t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); };
    };
    for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
    ttq.instance = function (t) {
        var e = ttq._i[t] || [];
        for (var n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]);
        return e;
    };
    ttq.load = function (e, n) {
        var r = "https://analytics.tiktok.com/i18n/pixel/events.js";
        ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = r;
        ttq._t = ttq._t || {}; ttq._t[e] = +new Date;
        ttq._o = ttq._o || {}; ttq._o[e] = n || {};
        n = document.createElement("script");
        n.type = "text/javascript"; n.async = true;
        n.src = r + "?sdkid=" + e + "&lib=" + t;
        e = document.getElementsByTagName("script")[0];
        e.parentNode.insertBefore(n, e);
    };

    function qs(k) {
        try { return new URLSearchParams(window.location.search).get(k); } catch (e) { return null; }
    }
    function resolvePixel() {
        var id = qs("pixel") || qs("pixel_id") || qs("Pixel");
        if (!id) {
            id = <?php echo json_encode($_GET["pixel"] ?? ($_GET["pixel_id"] ?? ($_SESSION["tt_pixel"] ?? "")), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS); ?>;
            if (!id) id = null;
        }
        if (!id) {
            try { id = localStorage.getItem("saved_tt_pixel"); } catch (err) {}
        }
        return id || null;
    }

    var dynamicPixelId = resolvePixel();
    if (!dynamicPixelId) return;

    try { localStorage.setItem("saved_tt_pixel", dynamicPixelId); } catch (err) {}
    ttq.load(dynamicPixelId);
    ttq.page();

    var contentName = qs("content_name") || (d.title || "offer");
    var contentPayload = { contents: [{ content_name: contentName }] };
    // Upper funnel — потрібен Events Manager / модерації на URL оферу
    ttq.track("ViewContent", contentPayload);

    function onReady(fn) {
        if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", fn);
        else fn();
    }

    onReady(function () {
        // Mid funnel: кліки по кнопках / submit
        d.addEventListener("click", function (ev) {
            var el = ev.target;
            if (!el || !el.closest) return;
            var hit = el.closest('button, input[type="submit"], input[type="button"], a.btn, [type="submit"], .btn, .button');
            if (!hit) return;
            ttq.track("ClickButton", contentPayload);
        }, true);

        d.addEventListener("submit", function () {
            // По факту відправки форми на bn (до thanks)
            ttq.track("SubmitForm", contentPayload);
            ttq.track("Lead", contentPayload);
        }, true);
    });
}(window, document, 'ttq');
</script>
<!-- /TikTok Pixel -->`;

/**
 * Thanks — нижня воронка (після форми):
 * identify (SHA-256) → SubmitForm → Lead → Contact → CompleteRegistration → Purchase
 * Pixel: ?pixel= → PHP $ttPixel (session з bn) → localStorage
 * Purchase params: event_id, value, currency, price з URL
 */
export const TIKTOK_THANKS_SCRIPT = `<!-- TikTok Pixel Thanks -->
<script>
!function (w, d, t) {
    w.TiktokAnalyticsObject = t;
    var ttq = w[t] = w[t] || [];
    ttq.methods = ["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
    ttq.setAndDefer = function (t, e) {
        t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); };
    };
    for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
    ttq.instance = function (t) {
        var e = ttq._i[t] || [];
        for (var n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]);
        return e;
    };
    ttq.load = function (e, n) {
        var r = "https://analytics.tiktok.com/i18n/pixel/events.js";
        ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = r;
        ttq._t = ttq._t || {}; ttq._t[e] = +new Date;
        ttq._o = ttq._o || {}; ttq._o[e] = n || {};
        n = document.createElement("script");
        n.type = "text/javascript"; n.async = true;
        n.src = r + "?sdkid=" + e + "&lib=" + t;
        e = document.getElementsByTagName("script")[0];
        e.parentNode.insertBefore(n, e);
    };

    function qs(k) {
        try { return new URLSearchParams(window.location.search).get(k); } catch (e) { return null; }
    }
    function sha256Hex(str) {
        if (!str || !w.crypto || !w.crypto.subtle) return Promise.resolve(null);
        var data = new TextEncoder().encode(String(str).trim().toLowerCase());
        return w.crypto.subtle.digest("SHA-256", data).then(function (buf) {
            return Array.from(new Uint8Array(buf)).map(function (b) {
                return b.toString(16).padStart(2, "0");
            }).join("");
        }).catch(function () { return null; });
    }

    // 1) URL ?pixel=  2) PHP session з bn  3) localStorage
    var dynamicPixelId = qs("pixel") || qs("pixel_id") || qs("Pixel");
    if (!dynamicPixelId) {
        dynamicPixelId = <?php echo json_encode($ttPixel ?? "", JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS); ?>;
        if (!dynamicPixelId) dynamicPixelId = null;
    }
    if (!dynamicPixelId) {
        try { dynamicPixelId = localStorage.getItem("saved_tt_pixel"); } catch (err) {}
    }
    if (!dynamicPixelId) return;

    try { localStorage.setItem("saved_tt_pixel", dynamicPixelId); } catch (err) {}
    ttq.load(dynamicPixelId);
    ttq.page();

    var contentName = qs("content_name") || (d.title || "offer");
    var eventId = qs("event_id") || qs("eventid") || undefined;
    var valueRaw = qs("value") || qs("amount");
    var priceRaw = qs("price") || valueRaw;
    var currency = (qs("currency") || "USD").toUpperCase();
    var valueNum = valueRaw != null && valueRaw !== "" ? Number(valueRaw) : undefined;
    var priceNum = priceRaw != null && priceRaw !== "" ? Number(priceRaw) : undefined;
    var opts = eventId ? { event_id: String(eventId) } : undefined;
    var contentPayload = { contents: [{ content_name: contentName }] };

    function fireTracks() {
        // SubmitForm — стандартна TT-подія; далі Lead/Contact/CompleteRegistration/Purchase як у H S
        ttq.track("SubmitForm", contentPayload, opts);
        ttq.track("Lead", contentPayload, opts);
        ttq.track("Contact", contentPayload, opts);
        ttq.track("CompleteRegistration", contentPayload, opts);

        var purchaseContent = { content_name: contentName };
        if (typeof priceNum === "number" && !isNaN(priceNum)) {
            purchaseContent.price = priceNum;
        }
        var purchase = {
            contents: [purchaseContent],
            currency: currency
        };
        if (typeof valueNum === "number" && !isNaN(valueNum)) {
            purchase.value = valueNum;
        } else if (typeof priceNum === "number" && !isNaN(priceNum)) {
            purchase.value = priceNum;
        }
        ttq.track("Purchase", purchase, opts);
    }

    var email = qs("email");
    var phone = qs("phone") || qs("phone_number");
    var externalId = qs("external_id") || qs("uid") || qs("user_id");

    Promise.all([sha256Hex(email), sha256Hex(phone), sha256Hex(externalId)]).then(function (hashes) {
        var id = {};
        if (hashes[0]) id.email = hashes[0];
        if (hashes[1]) id.phone_number = hashes[1];
        if (hashes[2]) id.external_id = hashes[2];
        if (Object.keys(id).length) ttq.identify(id);
        fireTracks();
    }).catch(function () { fireTracks(); });
}(window, document, 'ttq');
</script>
<!-- /TikTok Pixel Thanks -->`;

/**
 * Знаходить FB Pixel-скрипт і замінює на gtag. Якщо не знайдено — інжектить
 * gtag безпосередньо перед першим `</head>`.
 */
export function replaceFbPixelWithGtag(content: string): string {
  if (FB_PIXEL_RE.test(content)) {
    return content.replace(FB_PIXEL_RE, GTAG_SCRIPT);
  }
  if (/<\/head>/i.test(content)) {
    return content.replace(/<\/head>/i, `${GTAG_SCRIPT}\n</head>`);
  }
  return content + "\n" + GTAG_SCRIPT;
}

/**
 * Замінює FB Pixel на TikTok Pixel (pixel з ?pixel= / localStorage).
 * Якщо FB-скрипта немає — інжектить перед </head>.
 */
export function replaceFbPixelWithTikTok(
  content: string,
  script: string = TIKTOK_THANKS_SCRIPT,
): string {
  if (FB_PIXEL_RE.test(content)) {
    return content.replace(FB_PIXEL_RE, script);
  }
  // прибрати старий ttq, якщо вже був
  let out = content.replace(
    /<!--\s*TikTok Pixel[\s\S]*?<!--\s*\/TikTok Pixel[^>]*>/gi,
    "",
  );
  if (/<\/head>/i.test(out)) {
    return out.replace(/<\/head>/i, `${script}\n</head>`);
  }
  return out + "\n" + script;
}

/** Інжект TikTok PageView у bn.php / index (якщо ще немає ttq). */
export function injectTikTokPixelPage(content: string): string {
  if (/TiktokAnalyticsObject|ttq\.load\s*\(/i.test(content)) {
    return replaceFbPixelWithTikTok(content, TIKTOK_PIXEL_SCRIPT);
  }
  return replaceFbPixelWithTikTok(content, TIKTOK_PIXEL_SCRIPT);
}

const LAND_REDIRECT_RE =
  /<script>\s*let\s+allLinks\s*=\s*Array\.from\(document\.getElementsByTagName\(["']a["']\)\);[\s\S]*?<\/script>/;

/**
 * Замінює оригінальний redirect-скрипт лендингу на варіант, що веде на
 * `../per/bn.php` (з фільтром `id="read-more"`).
 */
export function replaceLandingRedirect(content: string): string {
  if (LAND_REDIRECT_RE.test(content)) {
    return content.replace(LAND_REDIRECT_RE, LANDING_REDIRECT_SCRIPT);
  }
  return content;
}

/** Cubbe: ленд у offer/ → оффер у offer/money/index.php */
export function replaceCubbeLandingRedirect(content: string): string {
  if (LAND_REDIRECT_RE.test(content)) {
    return content.replace(LAND_REDIRECT_RE, CUBBE_LANDING_REDIRECT_SCRIPT);
  }
  return content;
}
