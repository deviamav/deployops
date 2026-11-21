import path from "node:path";
import fs from "node:fs/promises";
import type { NodeSSH } from "node-ssh";
import type { Domain } from "@prisma/client";
import { shellQuote, putRemoteFile, getRemoteFile } from "@/lib/ssh";
import { sanitizeZipBuffer } from "@/lib/zip";
import {
  addLandingBnPhpHeader,
  addOfferBnPhpHeader,
  addThanksPhpHeader,
  injectBaseHref,
  injectTikTokPixelPage,
  replaceApiSource,
  replaceCubbeLandingRedirect,
  replaceFbPixelWithGtag,
  replaceFbPixelWithTikTok,
  replaceLandingRedirect,
  stripPhpHeader,
} from "./transformers";

export type LogFn = (line: string) => void;
export type PixelPlatform = "google" | "facebook" | "tiktok";
/** palladium = content.php + reffo/per · palladium_redirect = content.php only · cubbe = offer/ + white/ */
export type CloakerEngineKind = "palladium" | "palladium_redirect" | "cubbe";

interface EngineOpts {
  ssh: NodeSSH;
  domain: Pick<Domain, "name" | "webRoot"> & { originalIndex?: string | null };
  /** Override of the system user (from ServerSetup.webUser). */
  webUser?: string | null;
  /** Analytics preset: google | facebook | tiktok */
  pixelPlatform?: PixelPlatform | null;
  /** Entry-script layout */
  cloakerEngine?: CloakerEngineKind | null;
  emit: LogFn;
  /** Callback: fired when the engine detects which index file existed before the deploy. */
  onOriginalIndexDetected?: (kind: "html" | "php") => void | Promise<void>;
}

/**
 * DeployEngine — performs all remote deploy operations over SSH/SFTP.
 * Single-use instance: one per deploy job.
 */
export class DeployEngine {
  private ssh: NodeSSH;
  private webRoot: string;
  private domainName: string;
  private webUser: string;
  private emit: LogFn;
  private pixelPlatform: PixelPlatform;
  private cloakerEngine: CloakerEngineKind;
  private originalIndex: "html" | "php" | null;
  private onOriginalIndexDetected?: (kind: "html" | "php") => void | Promise<void>;

  constructor(opts: EngineOpts) {
    this.ssh = opts.ssh;
    this.webRoot = opts.domain.webRoot;
    this.domainName = opts.domain.name;
    this.emit = opts.emit;
    this.pixelPlatform =
      opts.pixelPlatform === "facebook" || opts.pixelPlatform === "tiktok"
        ? opts.pixelPlatform
        : "google";
    this.cloakerEngine =
      opts.cloakerEngine === "cubbe"
        ? "cubbe"
        : opts.cloakerEngine === "palladium_redirect"
          ? "palladium_redirect"
          : "palladium";
    const rawWebUser = opts.webUser?.trim() || detectWebUser(this.webRoot);
    // SECURITY: webUser ends up in `chown user:user ...` without shellQuote (because of the colon),
    // so it is validated with a strict Unix-name regex. Without this, `webUser=";rm -rf /;#"`
    // would allow shell injection during deploy/rollback on the remote target.
    if (!isValidUnixName(rawWebUser)) {
      throw new Error(
        `Invalid webUser: ${JSON.stringify(rawWebUser)} — only [a-z_][a-z0-9_-]{0,31} is allowed`,
      );
    }
    this.webUser = rawWebUser;
    if (!isSafeAbsolutePath(this.webRoot)) {
      throw new Error(`Invalid webRoot: ${JSON.stringify(this.webRoot)}`);
    }
    if (!isValidHostname(this.domainName)) {
      throw new Error(`Invalid domain name: ${JSON.stringify(this.domainName)}`);
    }
    this.originalIndex =
      opts.domain.originalIndex === "html" || opts.domain.originalIndex === "php"
        ? opts.domain.originalIndex
        : null;
    this.onOriginalIndexDetected = opts.onOriginalIndexDetected;
  }

  async deployPackOnly(opts: { offerZipPath: string; cloakerScriptPath: string }): Promise<void> {
    if (this.cloakerEngine === "cubbe") {
      await this.cubbePrepareWhite();
      await this.deployOfferCubbe(opts.offerZipPath, "offer", "/offer/index.php");
      await this.uploadCloakerAsIndex(opts.cloakerScriptPath);
      await this.runCmd(`chmod 644 ${remoteJoin(this.webRoot, "index.php")}`);
      await this.runVerifyCubbe();
      this.emit("✓ done (split layout)");
      return;
    }

    if (this.cloakerEngine === "palladium_redirect") {
      await this.deployGatewayOnly(opts.cloakerScriptPath);
      return;
    }

    await this.renameIndexToContent();
    await this.uploadCloakerAsIndex(opts.cloakerScriptPath);
    await this.deployOffer(opts.offerZipPath, "reffo", "/reffo/bn.php");
    await this.runCmd(`chmod 644 ${remoteJoin(this.webRoot, "index.php")}`);
    await this.runVerify();
    this.emit("✓ done");
  }

  /**
   * Rollback: return the domain to its original state.
   * Split layout: remove offer/, move white/* back to the root, remove the entry script index.php.
   * Standard / gateway layout: content.php → index.*, remove reffo/ per/ (if present).
   * Legacy gateway: contact.php → index.* (older deployments).
   */
  async rollback(): Promise<void> {
    const wr = shellQuote(this.webRoot);
    const layout = await this.ssh.execCommand(
      `cd ${wr} && ` +
        `if [ -d white ]; then echo cubbe; ` +
        `elif [ -f contact.php ] && [ ! -f content.php ]; then echo palladium_redirect_legacy; ` +
        `else echo palladium; fi`,
    );
    const kind = layout.stdout.trim();
    if (kind === "cubbe") {
      await this.rollbackSplitLayout();
      return;
    }
    if (kind === "palladium_redirect_legacy") {
      await this.rollbackFromBackup("contact.php");
      return;
    }

    this.emit("step: remove reffo/ and per/");
    await this.runCmd(`cd ${wr} && rm -rf reffo per`);
    await this.rollbackFromBackup("content.php");
  }

  async deployTemplateAndPack(opts: {
    landingZipPath: string;
    offerZipPath: string;
    landingName: string;
    cloakerScriptPath: string;
  }): Promise<void> {
    if (this.cloakerEngine === "cubbe") {
      await this.cubbePrepareWhite();
      // Split layout: template → offer/, content pack → offer/money/
      await this.deployLandingCubbe(opts.landingZipPath, opts.landingName);
      await this.deployOfferCubbe(opts.offerZipPath, "offer/money", "/offer/money/index.php");
      await this.uploadCloakerAsIndex(opts.cloakerScriptPath);
      await this.runCmd(`chmod 644 ${remoteJoin(this.webRoot, "index.php")}`);
      await this.runVerifyCubbe();
      this.emit("✓ done (split layout, template + content pack)");
      return;
    }

    if (this.cloakerEngine === "palladium_redirect") {
      // Gateway only: content.php + entry script, no template / content pack.
      this.emit("  · palladium_redirect: skip landing/offer ZIP");
      await this.deployGatewayOnly(opts.cloakerScriptPath);
      return;
    }

    await this.renameIndexToContent();
    await this.uploadCloakerAsIndex(opts.cloakerScriptPath);

    await this.deployOffer(opts.offerZipPath, "per", "/per/bn.php");
    await this.deployLanding(opts.landingZipPath, opts.landingName);

    await this.runVerify();
    this.emit("✓ done");
  }

  /** Gateway only: index.* → content.php, entry script → index.php (no reffo/per). */
  private async deployGatewayOnly(cloakerScriptPath: string): Promise<void> {
    await this.renameIndexToContent();
    await this.uploadCloakerAsIndex(cloakerScriptPath);
    await this.runCmd(`chmod 644 ${remoteJoin(this.webRoot, "index.php")}`);
    await this.runVerifyRedirect();
    this.emit("✓ done (gateway only)");
  }

  private async rollbackFromBackup(backup: "content.php" | "contact.php"): Promise<void> {
    const wr = shellQuote(this.webRoot);
    const target = this.originalIndex === "html" ? "index.html" : "index.php";
    this.emit(`step: restore ${target} from ${backup}`);
    const cmd =
      `cd ${wr} && ` +
      `if [ -f ${backup} ]; then ` +
      `  rm -f index.php index.html; ` +
      `  mv ${backup} ${target}; echo "restored:${target}"; ` +
      `elif [ -f ${target} ] && [ ! -f ${backup} ]; then ` +
      `  echo "already-clean"; ` +
      `else ` +
      `  echo "nothing-to-restore"; ` +
      `fi`;
    const res = await this.ssh.execCommand(cmd);
    this.appendIfOutput(res.stdout, res.stderr);

    const targetAbs = shellQuote(remoteJoin(this.webRoot, target));
    await this.runCmd(`chown ${this.webUser}:${this.webUser} ${targetAbs} 2>/dev/null || true`);
    await this.runCmd(`chmod 644 ${targetAbs} 2>/dev/null || true`);

    this.emit("step: verify");
    const verify = await this.ssh.execCommand(
      `curl -k -sI -o /dev/null -w "%{http_code}" ${shellQuote(`https://${this.domainName}/`)}`,
    );
    this.emit(`  · https://${this.domainName}/ → HTTP ${verify.stdout.trim() || "?"}`);
    this.emit(`✓ rolled back (restored ${target})`);
  }

  /** Split layout: move everything from webRoot into white/ (except white/ and offer/). */
  private async cubbePrepareWhite(): Promise<void> {
    this.emit("step: split layout — move the original site into white/");
    const wr = shellQuote(this.webRoot);
    // Portable POSIX (no bash shopt): find + mv
    const cmd =
      `cd ${wr} && ` +
      `if [ -d white ] && [ -f index.php ] && [ ! -f content.php ]; then ` +
      `  echo "already-cubbe"; exit 0; ` +
      `fi && ` +
      `mkdir -p white && ` +
      `find . -mindepth 1 -maxdepth 1 ! -name white ! -name offer -exec mv -t white/ {} + && ` +
      `if [ -f white/index.html ]; then echo "renamed:html"; ` +
      `elif [ -f white/index.php ] || [ -f white/index.htm ]; then echo "renamed:php"; ` +
      `elif [ "$(ls -A white 2>/dev/null)" ]; then echo "renamed:php"; ` +
      `else echo "no-index" && exit 2; fi`;
    const res = await this.ssh.execCommand(cmd);
    this.appendIfOutput(res.stdout, res.stderr);
    if (res.code !== 0)
      throw new Error(`cubbePrepareWhite: ${res.stderr || res.stdout || "failed"}`);

    const out = res.stdout.trim();
    let detected: "html" | "php" | null = null;
    if (out.includes("renamed:html")) detected = "html";
    else if (out.includes("renamed:php")) detected = "php";
    if (detected) {
      this.originalIndex = detected;
      if (this.onOriginalIndexDetected) {
        try {
          await this.onOriginalIndexDetected(detected);
        } catch (e) {
          this.emit(`  ! could not save originalIndex to the DB: ${(e as Error).message}`);
        }
      }
      this.emit(`  · originalIndex: ${detected} (in white/)`);
    }
    await this.chownChmodDir("white");
  }

  private async rollbackSplitLayout(): Promise<void> {
    this.emit("step: split layout rollback — remove offer/ and the entry script, restore white/");
    const wr = shellQuote(this.webRoot);
    const cmd =
      `cd ${wr} && ` +
      `rm -rf offer && ` +
      `rm -f index.php && ` +
      `if [ -d white ]; then ` +
      `  find white -mindepth 1 -maxdepth 1 -exec mv -t . {} + && ` +
      `  rmdir white 2>/dev/null || rm -rf white; ` +
      `  echo "restored:white"; ` +
      `else echo "no-white"; fi`;
    const res = await this.ssh.execCommand(cmd);
    this.appendIfOutput(res.stdout, res.stderr);
    if (res.code !== 0)
      throw new Error(`rollbackSplitLayout: ${res.stderr || res.stdout || "failed"}`);

    await this.runCmd(
      `chown -R ${this.webUser}:${this.webUser} ${shellQuote(this.webRoot)} 2>/dev/null || true`,
    );
    this.emit("step: verify");
    const verify = await this.ssh.execCommand(
      `curl -k -sI -o /dev/null -w "%{http_code}" ${shellQuote(`https://${this.domainName}/`)}`,
    );
    this.emit(`  · https://${this.domainName}/ → HTTP ${verify.stdout.trim() || "?"}`);
    this.emit("✓ rolled back (split layout → white/ restored to the root)");
  }

  /**
   * Split layout content pack: extract into a subdir, keep index.html|php|htm (not bn.php).
   * Analytics / api / thanks handling matches the standard layout, with a different path.
   */
  private async deployOfferCubbe(
    zip: string,
    subdir: string,
    basePath: string,
  ): Promise<void> {
    this.emit(`step: split layout upload+extract content pack → ${subdir}/`);
    await this.uploadAndExtract(zip, subdir);

    // Normalise the entry file: index.htm → index.html; index.php alone is fine
    const ensureIndex = await this.ssh.execCommand(
      `cd ${shellQuote(remoteJoin(this.webRoot, subdir))} && ` +
        `if [ -f index.htm ] && [ ! -f index.html ] && [ ! -f index.php ]; then mv index.htm index.html; fi && ` +
        `if [ -f index.html ] || [ -f index.php ] || [ -f index.htm ]; then echo ok; else echo missing; fi`,
    );
    if (!ensureIndex.stdout.includes("ok")) {
      throw new Error(`split layout content pack: no index.html/php/htm in ${subdir}/`);
    }

    const hasPhp = await this.ssh.execCommand(
      `[ -f ${shellQuote(remoteJoin(this.webRoot, `${subdir}/index.php`))} ] && echo y || echo n`,
    );
    if (hasPhp.stdout.trim() === "y") {
      this.emit(`step: rewrite ${subdir}/index.php [${this.pixelPlatform}]`);
      await this.transformRemote(`${subdir}/index.php`, (c) => {
        let out = injectBaseHref(addOfferBnPhpHeader(stripPhpHeader(c)), basePath);
        if (this.pixelPlatform === "tiktok") {
          out = injectTikTokPixelPage(out);
        }
        return out;
      });
    } else if (this.pixelPlatform === "tiktok") {
      const htmlName = (await this.ssh.execCommand(
        `cd ${shellQuote(remoteJoin(this.webRoot, subdir))} && ` +
          `if [ -f index.html ]; then echo index.html; elif [ -f index.htm ]; then echo index.htm; fi`,
      )).stdout.trim();
      if (htmlName) {
        this.emit(`step: inject TikTok pixel into ${subdir}/${htmlName}`);
        await this.transformRemote(`${subdir}/${htmlName}`, (c) => injectTikTokPixelPage(c));
      }
    }

    await this.applyOfferPixelExtras(subdir);
    await this.chownChmodDir(subdir);
  }

  private async deployLandingCubbe(zip: string, landingName: string): Promise<void> {
    this.emit("step: split layout upload+extract template → offer/");
    await this.uploadAndExtract(zip, "offer");

    const hasPhp = await this.ssh.execCommand(
      `[ -f ${shellQuote(remoteJoin(this.webRoot, "offer/index.php"))} ] && echo y || echo n`,
    );
    if (hasPhp.stdout.trim() === "y") {
      this.emit(`step: rewrite offer/index.php (template) [${this.pixelPlatform}]`);
      await this.transformRemote("offer/index.php", (c) => {
        let out = replaceCubbeLandingRedirect(
          injectBaseHref(addLandingBnPhpHeader(stripPhpHeader(c), landingName), "/offer/index.php"),
        );
        if (this.pixelPlatform === "tiktok") {
          out = injectTikTokPixelPage(out);
        }
        return out;
      });
    } else {
      // html template — replace the redirect if present
      const htmlName = (await this.ssh.execCommand(
        `cd ${shellQuote(remoteJoin(this.webRoot, "offer"))} && ` +
          `if [ -f index.html ]; then echo index.html; elif [ -f index.htm ]; then echo index.htm; fi`,
      )).stdout.trim();
      if (htmlName) {
        await this.transformRemote(`offer/${htmlName}`, (c) => {
          let out = replaceCubbeLandingRedirect(c);
          if (this.pixelPlatform === "tiktok") out = injectTikTokPixelPage(out);
          return out;
        });
      }
    }
    await this.chownChmodDir("offer");
  }

  private async applyOfferPixelExtras(subdir: string): Promise<void> {
    const apiSource =
      this.pixelPlatform === "facebook"
        ? "FB"
        : this.pixelPlatform === "tiktok"
          ? "TikTok"
          : "Google";

    this.emit(`step: rewrite ${subdir}/api.php → source ${apiSource}`);
    await this.transformRemoteIfExists(`${subdir}/api.php`, (c) =>
      replaceApiSource(c, apiSource),
    );

    if (this.pixelPlatform === "google") {
      this.emit(`step: rewrite ${subdir}/thanks.php → gtag`);
      await this.transformRemoteIfExists(`${subdir}/thanks.php`, (c) =>
        replaceFbPixelWithGtag(addThanksPhpHeader(stripPhpHeader(c))),
      );
    } else if (this.pixelPlatform === "facebook") {
      this.emit(`  · meta: thanks.php left unchanged`);
    } else {
      this.emit(`step: rewrite ${subdir}/thanks.php → TikTok`);
      await this.transformRemoteIfExists(`${subdir}/thanks.php`, (c) =>
        replaceFbPixelWithTikTok(addThanksPhpHeader(stripPhpHeader(c))),
      );
    }
  }

  private async runVerifyCubbe(): Promise<void> {
    this.emit("step: verify (split layout)");
    const checks = [
      `https://${this.domainName}/`,
      `https://${this.domainName}/offer/`,
      `https://${this.domainName}/white/`,
    ];
    for (const url of checks) {
      const res = await this.ssh.execCommand(
        `curl -k -sI -o /dev/null -w "%{http_code}" ${shellQuote(url)}`,
      );
      this.emit(`  · ${url} → HTTP ${res.stdout.trim() || "?"}`);
    }
  }

  // ---------------------------------------------------------------------------

  private async renameIndexToContent(): Promise<void> {
    this.emit("step: rename index.* → content.php");
    const wr = shellQuote(this.webRoot);
    const cmd =
      `cd ${wr} && ` +
      `if   [ -f index.html ];  then mv index.html content.php; echo "renamed:html"; ` +
      `elif [ -f index.php ];   then mv index.php  content.php; echo "renamed:php"; ` +
      `elif [ -f content.php ]; then echo "already-deployed"; ` +
      `else echo "no-index" && exit 2; fi`;
    const res = await this.ssh.execCommand(cmd);
    this.appendIfOutput(res.stdout, res.stderr);
    if (res.code !== 0)
      throw new Error(`renameIndexToContent: ${res.stderr || "no index.* in webRoot"}`);
    await this.persistOriginalIndex(res.stdout.trim());
  }

  private async persistOriginalIndex(out: string): Promise<void> {
    let detected: "html" | "php" | null = null;
    if (out.includes("renamed:html")) detected = "html";
    else if (out.includes("renamed:php")) detected = "php";
    if (detected) {
      this.originalIndex = detected;
      if (this.onOriginalIndexDetected) {
        try {
          await this.onOriginalIndexDetected(detected);
        } catch (e) {
          this.emit(`  ! could not save originalIndex to the DB: ${(e as Error).message}`);
        }
      }
      this.emit(`  · originalIndex: ${detected}`);
    }
  }

  private async uploadCloakerAsIndex(localPhp: string): Promise<void> {
    this.emit(`step: upload entry script → ${this.webRoot}/index.php`);

    const remoteIndex = remoteJoin(this.webRoot, "index.php");
    const wr = shellQuote(this.webRoot);
    // Safety: never overwrite index.php unless a content.php backup (or legacy contact.php) exists.
    const check = await this.ssh.execCommand(
      `cd ${wr} && [ -f index.php ] && [ ! -f content.php ] && [ ! -f contact.php ] && echo "danger" || echo "ok"`,
    );
    if (check.stdout.trim() === "danger") {
      throw new Error(
        "Refusing to overwrite existing index.php that wasn't renamed to content.php — manual review required",
      );
    }

    await putRemoteFile(this.ssh, localPhp, remoteIndex, this.emit);
    await this.chownChmod(remoteIndex, "644");
    this.emit(`  ✓ ${remoteIndex} (chmod 644, chown ${this.webUser})`);
  }

  private async deployOffer(zip: string, subdir: "reffo" | "per", basePath: string): Promise<void> {
    this.emit(`step: upload+extract content pack → ${subdir}/`);
    await this.uploadAndExtract(zip, subdir);

    this.emit(`step: rewrite ${subdir}/bn.php [${this.pixelPlatform}]`);
    await this.renameRemote(`${subdir}/index.php`, `${subdir}/bn.php`);
    await this.transformRemote(`${subdir}/bn.php`, (c) => {
      let out = injectBaseHref(addOfferBnPhpHeader(stripPhpHeader(c)), basePath);
      if (this.pixelPlatform === "tiktok") {
        out = injectTikTokPixelPage(out);
      }
      return out;
    });

    const apiSource =
      this.pixelPlatform === "facebook"
        ? "FB"
        : this.pixelPlatform === "tiktok"
          ? "TikTok"
          : "Google";

    this.emit(`step: rewrite ${subdir}/api.php → source ${apiSource}`);
    await this.transformRemoteIfExists(`${subdir}/api.php`, (c) =>
      replaceApiSource(c, apiSource),
    );

    if (this.pixelPlatform === "google") {
      this.emit(`step: rewrite ${subdir}/thanks.php → gtag`);
      await this.transformRemoteIfExists(`${subdir}/thanks.php`, (c) =>
        replaceFbPixelWithGtag(addThanksPhpHeader(stripPhpHeader(c))),
      );
    } else if (this.pixelPlatform === "facebook") {
      this.emit(`  · meta: thanks.php left unchanged (Meta pixel)`);
    } else {
      this.emit(`step: rewrite ${subdir}/thanks.php → TikTok (Lead/Contact/CompleteRegistration/Purchase)`);
      await this.transformRemoteIfExists(`${subdir}/thanks.php`, (c) =>
        replaceFbPixelWithTikTok(addThanksPhpHeader(stripPhpHeader(c))),
      );
    }

    await this.chownChmodDir(subdir);
  }

  private async deployLanding(zip: string, landingName: string): Promise<void> {
    this.emit("step: upload+extract template → reffo/");
    await this.uploadAndExtract(zip, "reffo");
    await this.renameRemote("reffo/index.php", "reffo/bn.php");

    this.emit(`step: rewrite reffo/bn.php (template) [${this.pixelPlatform}]`);
    await this.transformRemote("reffo/bn.php", (c) => {
      let out = replaceLandingRedirect(
        injectBaseHref(addLandingBnPhpHeader(stripPhpHeader(c), landingName), "/reffo/bn.php"),
      );
      // TikTok: the pixel must also be present on the template page, otherwise event reporting stays silent
      if (this.pixelPlatform === "tiktok") {
        out = injectTikTokPixelPage(out);
      }
      return out;
    });

    await this.chownChmodDir("reffo");
  }

  private async ensureRemoteExtractTools(): Promise<void> {
    const check = await this.ssh.execCommand(`command -v unzip >/dev/null 2>&1; command -v bsdtar >/dev/null 2>&1`);
    if (check.code === 0) return;

    this.emit(`  ! unzip/bsdtar not found on the target — installing unzip + libarchive-tools`);
    const installCmd =
      `( command -v apt-get >/dev/null 2>&1 && ` +
      `  ( DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1; ` +
      `    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unzip libarchive-tools >/dev/null 2>&1 || ` +
      `    sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unzip libarchive-tools >/dev/null 2>&1 ) ) || ` +
      `( command -v dnf >/dev/null 2>&1 && ` +
      `  ( dnf install -y -q unzip bsdtar >/dev/null 2>&1 || sudo -n dnf install -y -q unzip bsdtar >/dev/null 2>&1 ) ) || ` +
      `( command -v yum >/dev/null 2>&1 && ` +
      `  ( yum install -y -q unzip bsdtar >/dev/null 2>&1 || sudo -n yum install -y -q unzip bsdtar >/dev/null 2>&1 ) )`;
    const inst = await this.ssh.execCommand(installCmd);

    const hasUnzip = await this.ssh.execCommand(`command -v unzip`);
    if (hasUnzip.code !== 0) {
      throw new Error(
        `cannot install unzip on target VPS. Run manually: apt-get install -y unzip libarchive-tools. ` +
          `${(inst.stderr || inst.stdout || "").trim().slice(0, 300)}`,
      );
    }
    this.emit(`  ✓ unzip is ready on the target`);
    const hasBsdtar = await this.ssh.execCommand(`command -v bsdtar`);
    if (hasBsdtar.code !== 0) {
      this.emit(`  ! bsdtar unavailable — fallback is limited`);
    }
  }

  private async uploadAndExtract(localZip: string, subdir: string): Promise<void> {
    const tmpDir = `/tmp/cloak-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const target = remoteJoin(this.webRoot, subdir);

    // The ZIP used to be repacked through adm-zip (sanitize) because of `fonts/../` entries in site-builder exports.
    // adm-zip 0.5.x fails with "No descriptor present" on valid ZIPs (macOS/Win).
    // Now: try a soft sanitize first; on any failure upload the original.
    // Remote `unzip` normally handles such archives; bsdtar is the fallback.
    const rawBuf = await fs.readFile(localZip);
    this.emit(`  · zip-pipe: v2 (${rawBuf.length}b)`);
    let zipBuf: Buffer = rawBuf;
    try {
      const sanitized = sanitizeZipBuffer(rawBuf);
      if (sanitized !== rawBuf && !Buffer.from(sanitized).equals(rawBuf)) {
        zipBuf = Buffer.from(sanitized);
        this.emit(`  · zip sanitize: rewritten (${rawBuf.length}b → ${zipBuf.length}b)`);
      } else {
        this.emit(`  · zip sanitize: pass-through`);
      }
    } catch (e: any) {
      this.emit(`  ! zip sanitize skipped: ${e?.message ?? e}`);
      zipBuf = rawBuf;
    }
    const localSanitized = path.join(
      process.cwd(),
      "uploads",
      ".tmp",
      `sanitized-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.zip`,
    );
    await fs.mkdir(path.dirname(localSanitized), { recursive: true });
    await fs.writeFile(localSanitized, zipBuf);

    await this.ensureRemoteExtractTools();
    await this.runCmd(`mkdir -p ${shellQuote(tmpDir)}`);
    await putRemoteFile(this.ssh, localSanitized, `${tmpDir}/archive.zip`, this.emit);
    await fs.unlink(localSanitized).catch(() => undefined);

    const zipPath = `${tmpDir}/archive.zip`;
    const srcDir = `${tmpDir}/src`;
    await this.runCmd(`mkdir -p ${shellQuote(srcDir)}`);

    const unzipRes = await this.ssh.execCommand(
      `unzip -o -q ${shellQuote(zipPath)} -d ${shellQuote(srcDir)}`,
    );
    if (unzipRes.code !== 0) {
      const msg = unzipRes.stderr || unzipRes.stdout || `exit ${unzipRes.code}`;
      this.emit(`  ! unzip warning: ${msg.trim().split("\n")[0]} — trying bsdtar fallback`);

      const hasBsdtar = await this.ssh.execCommand(`command -v bsdtar`);
      if (hasBsdtar.code !== 0) {
        throw new Error(
          `extract failed: unzip=${msg.trim()} | bsdtar not installed on target`,
        );
      }

      const tarRes = await this.ssh.execCommand(
        `cd ${shellQuote(srcDir)} && bsdtar -xf ${shellQuote(zipPath)}`,
      );
      if (tarRes.code !== 0) {
        throw new Error(
          `extract failed (unzip + bsdtar): unzip=${msg.trim()} | bsdtar=${(tarRes.stderr || tarRes.stdout).trim()}`,
        );
      }
      this.emit(`  ✓ bsdtar fallback OK`);
    }

    // SECURITY (Symlink-Zip-Slip defense in depth): inspectZip should already block
    // symlink entries, but if an archive got here through another path or older code,
    // physically delete every symlink before `cp -a` into webRoot.
    await this.runCmd(
      `find ${shellQuote(`${tmpDir}/src`)} \\( -type l -o -type b -o -type c -o -type s -o -type p \\) -delete`,
    );

    const findRes = await this.ssh.execCommand(
      `find ${shellQuote(`${tmpDir}/src`)} -maxdepth 3 \\( -iname index.php -o -iname index.html -o -iname index.htm \\) -print -quit`,
    );
    let sourceDir = `${tmpDir}/src`;
    if (findRes.stdout.trim()) {
      sourceDir = posixDirname(findRes.stdout.trim());
    }

    await this.runCmd(`mkdir -p ${shellQuote(target)}`);
    await this.runCmd(`cp -a ${shellQuote(sourceDir + "/.")} ${shellQuote(target + "/")}`);
    await this.runCmd(`rm -rf ${shellQuote(tmpDir)}`);
    this.emit(`  ✓ extracted to ${target}`);
  }

  private async transformRemote(relPath: string, fn: (content: string) => string): Promise<void> {
    const remote = remoteJoin(this.webRoot, relPath);
    const tmpLocal = path.join(
      process.cwd(),
      "uploads",
      ".tmp",
      `${Date.now()}-${path.basename(relPath)}`,
    );
    await fs.mkdir(path.dirname(tmpLocal), { recursive: true });
    await getRemoteFile(this.ssh, tmpLocal, remote, this.emit);
    const content = await fs.readFile(tmpLocal, "utf8");
    const next = fn(content);
    await fs.writeFile(tmpLocal, next, "utf8");
    await putRemoteFile(this.ssh, tmpLocal, remote, this.emit);
    await this.chownChmod(remote, "644");
    await fs.unlink(tmpLocal).catch(() => {});
    this.emit(`  ✓ rewritten ${relPath} (${content.length}b → ${next.length}b)`);
  }

  private async transformRemoteIfExists(
    relPath: string,
    fn: (content: string) => string,
  ): Promise<void> {
    const remote = remoteJoin(this.webRoot, relPath);
    const check = await this.ssh.execCommand(`[ -f ${shellQuote(remote)} ] && echo y || echo n`);
    if (check.stdout.trim() !== "y") {
      this.emit(`  · skip ${relPath} (not present)`);
      return;
    }
    await this.transformRemote(relPath, fn);
  }

  private async renameRemote(from: string, to: string): Promise<void> {
    const a = remoteJoin(this.webRoot, from);
    const b = remoteJoin(this.webRoot, to);
    const check = await this.ssh.execCommand(`[ -f ${shellQuote(a)} ] && echo y || echo n`);
    if (check.stdout.trim() !== "y") {
      this.emit(`  · skip rename: ${from} (not present)`);
      return;
    }
    await this.runCmd(`mv ${shellQuote(a)} ${shellQuote(b)}`);
    this.emit(`  ✓ rename ${from} → ${to}`);
  }

  private async chownChmod(target: string, mode: string): Promise<void> {
    await this.runCmd(`chown ${this.webUser}:${this.webUser} ${shellQuote(target)} || true`);
    await this.runCmd(`chmod ${mode} ${shellQuote(target)}`);
  }

  private async chownChmodDir(subdir: string): Promise<void> {
    const dir = remoteJoin(this.webRoot, subdir);
    await this.runCmd(`chown -R ${this.webUser}:${this.webUser} ${shellQuote(dir)} || true`);
    await this.runCmd(`chmod -R 755 ${shellQuote(dir)}`);
    this.emit(`  ✓ chown/chmod ${subdir}/`);
  }

  private async runCmd(cmd: string): Promise<void> {
    const res = await this.ssh.execCommand(cmd);
    this.appendIfOutput(res.stdout, res.stderr);
    if (res.code !== 0 && res.code !== null) {
      throw new Error(`cmd failed (${cmd}): ${res.stderr || res.stdout || `exit ${res.code}`}`);
    }
  }

  private async runVerify(): Promise<void> {
    this.emit("step: verify");
    const checks = [
      `https://${this.domainName}/`,
      `https://${this.domainName}/reffo/bn.php`,
      `https://${this.domainName}/content.php`,
    ];
    for (const url of checks) {
      const res = await this.ssh.execCommand(
        `curl -k -sI -o /dev/null -w "%{http_code}" ${shellQuote(url)}`,
      );
      this.emit(`  · ${url} → HTTP ${res.stdout.trim() || "?"}`);
    }
  }

  private async runVerifyRedirect(): Promise<void> {
    this.emit("step: verify (gateway only)");
    const checks = [
      `https://${this.domainName}/`,
      `https://${this.domainName}/content.php`,
    ];
    for (const url of checks) {
      const res = await this.ssh.execCommand(
        `curl -k -sI -o /dev/null -w "%{http_code}" ${shellQuote(url)}`,
      );
      this.emit(`  · ${url} → HTTP ${res.stdout.trim() || "?"}`);
    }
  }

  private appendIfOutput(stdout: string, stderr: string): void {
    const sout = stdout?.trim();
    const serr = stderr?.trim();
    if (sout) for (const l of sout.split(/\r?\n/)) this.emit(`    | ${l}`);
    if (serr) for (const l of serr.split(/\r?\n/)) this.emit(`    ! ${l}`);
  }
}

// === helpers =================================================================

/**
 * SECURITY: these regex validators are the front line against shell/path injection.
 * Every DB value that ends up in an SSH command (webUser, webRoot, domain)
 * passes through them in the DeployEngine constructor.
 */
function isValidUnixName(s: string): boolean {
  // POSIX 3.437 + consistent with useradd(8) (-E posix): max 32 chars,
  // starts with a-z or _, then a-z|0-9|_|- .
  return /^[a-z_][a-z0-9_-]{0,31}$/.test(s);
}

function isSafeAbsolutePath(p: string): boolean {
  // absolute posix path without shell metacharacters; ".." is forbidden.
  if (!p.startsWith("/")) return false;
  if (p.includes("..")) return false;
  return /^\/[a-zA-Z0-9._/-]+$/.test(p);
}

function isValidHostname(name: string): boolean {
  // RFC1123 host (1-253 chars, labels 1-63, letters/digits/hyphen)
  if (name.length === 0 || name.length > 253) return false;
  return /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(
    name,
  );
}

function detectWebUser(webRoot: string): string {
  const m = webRoot.match(/^\/home\/([^/]+)\/web\/[^/]+\/public_html/);
  if (m && isValidUnixName(m[1])) return m[1];
  return "www-data";
}

function remoteJoin(...parts: string[]): string {
  return parts
    .map((p, i) => (i === 0 ? p.replace(/\/+$/, "") : p.replace(/^\/+/, "").replace(/\/+$/, "")))
    .filter(Boolean)
    .join("/");
}

function posixDirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}
