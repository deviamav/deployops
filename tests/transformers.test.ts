import { describe, expect, it } from "vitest";
import {
  addLandingBnPhpHeader,
  addOfferBnPhpHeader,
  addThanksPhpHeader,
  GTAG_SCRIPT,
  injectBaseHref,
  LANDING_REDIRECT_SCRIPT,
  OFFER_BN_PHP_HEADER,
  replaceApiSourceToGoogle,
  replaceFbPixelWithGtag,
  replaceLandingRedirect,
  stripPhpHeader,
  THANKS_PHP_HEADER,
} from "@/server/deploy/transformers";

const OFFER_INPUT = `<?php
session_start();
$_SESSION['source'] = 'fb';
// довільний код від клікера
?>

<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Hot offer</title>
</head>
<body>
   ... offer markup ...
</body>
</html>
`;

const THANKS_INPUT = `<?php
$pixel = $_GET['pixel'] ?? '';
?>
<html>
<head>
<title>Thanks</title>
<script>
!function (f, b, e, v, n, t, s) {
  if (f.fbq) return;
  n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) };
  if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
  n.queue = []; t = b.createElement(e); t.async = !0;
  t.src = v; s = b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t, s)
}(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '<?php echo htmlspecialchars($_GET['pixel'], ENT_QUOTES, 'UTF-8'); ?>');
fbq('track', 'Lead');
</script>
</head>
<body>Thanks</body>
</html>
`;

const LANDING_INPUT = `<body>
... landing markup ...

<script>
let allLinks = Array.from(document.getElementsByTagName("a"));
allLinks.forEach((aL) => {
    aL.addEventListener("click", (e) => {
        e.preventDefault();
        window.location.href = "{offer}&<?php echo http_build_query($_GET); ?>";
    });
});
</script>
</body>
`;

describe("stripPhpHeader", () => {
  it("видаляє <?php...?> до <!doctype html>", () => {
    const out = stripPhpHeader(OFFER_INPUT);
    expect(out.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(out).not.toContain("session_start();");
  });

  it("чистий HTML — нічого не міняє", () => {
    const clean = "<!DOCTYPE html><html><body>hi</body></html>";
    expect(stripPhpHeader(clean)).toBe(clean);
  });

  it("працює з <html (без DOCTYPE)", () => {
    const src = `<?php x ?><html><body>q</body></html>`;
    expect(stripPhpHeader(src).startsWith("<html>")).toBe(true);
  });

  it("повертає вхід якщо немає doctype/html", () => {
    const src = `<?php only_php ?>`;
    expect(stripPhpHeader(src)).toBe(src);
  });
});

describe("addOfferBnPhpHeader", () => {
  it("додає 3 PHP-блоки зверху (за п. 6.4 C.3)", () => {
    const stripped = stripPhpHeader(OFFER_INPUT);
    const out = addOfferBnPhpHeader(stripped);
    expect(out.startsWith(OFFER_BN_PHP_HEADER)).toBe(true);
    expect((out.match(/session_start\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(out).toContain("$_SESSION['full_url'] = $fullUrl;");
    expect(out).toContain("$_SESSION['url_params'] = http_build_query($_GET);");
    expect(out).toContain("$_SESSION['eventid'] = $_GET['eventid'];");
    expect(out).toContain("$_SESSION['awtag'] = $_GET['awtag'];");
    expect(out.endsWith(stripped)).toBe(true);
  });
});

describe("addThanksPhpHeader", () => {
  it("додає шапку з $eventId / $awTag / unset", () => {
    const out = addThanksPhpHeader("<html></html>");
    expect(out.startsWith(THANKS_PHP_HEADER)).toBe(true);
    expect(out).toContain("$eventId = $_SESSION['eventid'] ?? '';");
    expect(out).toContain("$awTag = $_SESSION['awtag'] ?? '';");
    expect(out).toContain("unset($_SESSION['eventid']);");
  });
});

describe("addLandingBnPhpHeader", () => {
  it("підставляє landingName у $_SESSION['landing_name']", () => {
    const out = addLandingBnPhpHeader("<html></html>", "Orlen_PL_v2");
    expect(out).toContain("$_SESSION['landing_name'] = 'Orlen_PL_v2';");
  });

  it("екранує одинарну лапку", () => {
    const out = addLandingBnPhpHeader("<html></html>", "Ev'il");
    expect(out).toContain("$_SESSION['landing_name'] = 'Ev\\'il';");
  });
});

describe("injectBaseHref", () => {
  it("вставляє після <head>, зберігає атрибути", () => {
    const src = `<html><head class="x"><title>t</title></head><body/></html>`;
    const out = injectBaseHref(src, "/reffo/bn.php");
    expect(out).toContain(`<head class="x">\n<base href="https://<?php echo $_SERVER['HTTP_HOST']; ?>/reffo/bn.php">`);
  });

  it("case-insensitive", () => {
    const src = `<HTML><HEAD><title>t</title></HEAD></HTML>`;
    const out = injectBaseHref(src, "/per/bn.php");
    expect(out).toMatch(/<HEAD>\n<base href="https:[^"]+\/per\/bn\.php">/);
  });

  it("без <head> — повертає вхід", () => {
    const src = `<html><body>q</body></html>`;
    expect(injectBaseHref(src, "/x")).toBe(src);
  });

  it("вставляє тільки один раз навіть якщо є кілька <head>", () => {
    const src = `<head><x/></head><head><y/></head>`;
    const out = injectBaseHref(src, "/reffo/bn.php");
    expect((out.match(/<base href=/g) ?? []).length).toBe(1);
  });
});

describe("replaceApiSourceToGoogle", () => {
  it("FB → Google", () => {
    const src = `[ 'source' => 'FB', 'a' => 1 ]`;
    expect(replaceApiSourceToGoogle(src)).toContain("'source' => 'Google'");
  });

  it("Bigo → Google", () => {
    const src = `[ 'source' =>'Bigo' ]`;
    expect(replaceApiSourceToGoogle(src)).toContain("'source' => 'Google'");
  });

  it("інші джерела залишає недоторканими", () => {
    const src = `'source' => 'Yandex'`;
    expect(replaceApiSourceToGoogle(src)).toBe(src);
  });
});

describe("replaceFbPixelWithGtag", () => {
  it("замінює fbq-блок на gtag", () => {
    const out = replaceFbPixelWithGtag(THANKS_INPUT);
    expect(out).toContain("googletagmanager.com/gtag/js");
    expect(out).not.toMatch(/fbq\(\s*['"]track['"]\s*,\s*['"]Lead['"]\s*\)/);
  });

  it("якщо FB відсутній — gtag перед </head>", () => {
    const src = `<html><head><title>x</title></head><body/></html>`;
    const out = replaceFbPixelWithGtag(src);
    const headIdx = out.indexOf("</head>");
    const gtagIdx = out.indexOf("googletagmanager.com/gtag/js");
    expect(gtagIdx).toBeGreaterThan(-1);
    expect(gtagIdx).toBeLessThan(headIdx);
  });
});

describe("replaceLandingRedirect", () => {
  it("замінює оригінальний redirect на варіант з ../per/bn.php і id != read-more", () => {
    const out = replaceLandingRedirect(LANDING_INPUT);
    expect(out).toContain('window.location.href = "../per/bn.php?"');
    expect(out).toContain('aL.id !== "read-more"');
    expect(out).not.toContain('window.location.href = "{offer}');
  });

  it("шаблон LANDING_REDIRECT_SCRIPT повністю вставляється", () => {
    const out = replaceLandingRedirect(LANDING_INPUT);
    expect(out).toContain(LANDING_REDIRECT_SCRIPT);
  });

  it("без redirect-блока — повертає вхід", () => {
    const src = `<body><p>nope</p></body>`;
    expect(replaceLandingRedirect(src)).toBe(src);
  });
});

describe("integration: повний offer-only пайплайн bn.php", () => {
  it("strip + addHeader + injectBase дає очікувану структуру", () => {
    const out = injectBaseHref(
      addOfferBnPhpHeader(stripPhpHeader(OFFER_INPUT)),
      "/reffo/bn.php",
    );
    expect(out).toContain("$_SESSION['eventid']");
    expect(out).toContain('<base href="https://<?php echo $_SERVER[\'HTTP_HOST\']; ?>/reffo/bn.php">');
    expect(out).toContain("<!DOCTYPE html>");
    expect(out).not.toContain("$_SESSION['source'] = 'fb';");
  });
});

describe("gtag template", () => {
  it("містить очікувані поля", () => {
    expect(GTAG_SCRIPT).toContain("send_to");
    expect(GTAG_SCRIPT).toContain("currency");
    expect(GTAG_SCRIPT).toContain("AW-");
  });
});
