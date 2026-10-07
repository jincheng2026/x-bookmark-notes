// 装「X 收藏备注」的本机小程序，让插件能调这台电脑上的 Codex 或 Claude Code 给收藏分类。
// 用法：node install.mjs           装好并自检
//       node install.mjs --test    装好，再真让 AI 分一条示例收藏，确认能分
// 做的事：把 xbn-host.mjs 复制到 ~/.x-bookmark-notes/host/，记下 node、codex、claude 在哪，
// 再告诉 Chrome（以及 Edge、Brave、Arc、Chromium，装了哪个告诉哪个）这个小程序在哪、只许这个插件调用。
// 重复运行没关系：每次都按这台电脑现在的情况重写。
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST_NAME = "com.x_bookmark_notes.host";
const HOME = homedir();
const OS = platform();
const DEST = join(HOME, ".x-bookmark-notes", "host");

// 插件编号由 manifest.json 里的 key 算出来，和 Chrome 算法一样
function extensionId() {
  const manifest = JSON.parse(readFileSync(join(HERE, "..", "manifest.json"), "utf8"));
  const hash = createHash("sha256").update(Buffer.from(manifest.key, "base64")).digest("hex").slice(0, 32);
  return [...hash].map((c) => String.fromCharCode("a".charCodeAt(0) + parseInt(c, 16))).join("");
}

function findCommand(name) {
  const tries = [];
  if (OS === "win32") {
    try { tries.push(...execFileSync("where", [name], { encoding: "utf8" }).split(/\r?\n/)); } catch { /* 没有 */ }
    tries.push(join(HOME, "AppData", "Roaming", "npm", `${name}.cmd`));
  } else {
    const shell = process.env.SHELL || "/bin/zsh";
    try { tries.push(execFileSync(shell, ["-lic", `command -v ${name}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000 }).trim().split("\n").pop()); } catch { /* 没有 */ }
    tries.push(join(HOME, ".npm-global", "bin", name), "/opt/homebrew/bin/" + name, "/usr/local/bin/" + name, join(HOME, ".local", "bin", name), join(HOME, ".bun", "bin", name));
    if (name === "claude") tries.push(join(HOME, ".claude", "local", "claude"));
    if (name === "codex") tries.push("/Applications/Codex.app/Contents/Resources/codex");
  }
  return tries.map((p) => String(p || "").trim()).find((p) => p && existsSync(p)) || null;
}

function browserDirs() {
  if (OS === "darwin") {
    const base = join(HOME, "Library", "Application Support");
    return ["Google/Chrome", "Google/Chrome Beta", "Google/Chrome Canary", "Chromium", "Microsoft Edge", "BraveSoftware/Brave-Browser", "Arc/User Data", "Vivaldi"]
      .map((d) => join(base, d)).filter(existsSync).map((d) => join(d, "NativeMessagingHosts"));
  }
  if (OS === "linux") {
    const base = join(HOME, ".config");
    return ["google-chrome", "google-chrome-beta", "chromium", "microsoft-edge", "BraveSoftware/Brave-Browser", "vivaldi"]
      .map((d) => join(base, d)).filter(existsSync).map((d) => join(d, "NativeMessagingHosts"));
  }
  return [];
}

function ask(wrapper, message) {
  return new Promise((resolve) => {
    const child = OS === "win32" ? spawn("cmd.exe", ["/c", wrapper], { stdio: ["pipe", "pipe", "inherit"] }) : spawn(wrapper, [], { stdio: ["pipe", "pipe", "inherit"], env: { PATH: "/usr/bin:/bin", HOME } });
    let out = Buffer.alloc(0);
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 360000);
    child.stdout.on("data", (d) => {
      out = Buffer.concat([out, d]);
      if (out.length >= 4 && out.length >= 4 + out.readUInt32LE(0)) {
        clearTimeout(timer);
        child.kill();
        resolve(JSON.parse(out.subarray(4, 4 + out.readUInt32LE(0)).toString("utf8")));
      }
    });
    child.on("error", () => { clearTimeout(timer); resolve(null); });
    const body = Buffer.from(JSON.stringify(message), "utf8");
    const head = Buffer.alloc(4); head.writeUInt32LE(body.length, 0);
    child.stdin.write(Buffer.concat([head, body]));
  });
}

const id = extensionId();
const node = process.execPath;
const codex = findCommand("codex");
const claude = findCommand("claude");
mkdirSync(DEST, { recursive: true });
copyFileSync(join(HERE, "xbn-host.mjs"), join(DEST, "xbn-host.mjs"));
writeFileSync(join(DEST, "package.json"), '{"type":"module"}\n');
writeFileSync(join(DEST, "config.json"), JSON.stringify({ node, codex, claude, installedAt: new Date().toISOString() }, null, 2));
let wrapper;
if (OS === "win32") {
  wrapper = join(DEST, "xbn-host.bat");
  writeFileSync(wrapper, `@echo off\r\n"${node}" "${join(DEST, "xbn-host.mjs")}" %*\r\n`);
} else {
  wrapper = join(DEST, "xbn-host.sh");
  writeFileSync(wrapper, `#!/bin/sh\nexec "${node}" "${join(DEST, "xbn-host.mjs")}" "$@"\n`);
  chmodSync(wrapper, 0o755);
}
const manifest = { name: HOST_NAME, description: "X 收藏备注：调本机的 Codex 或 Claude Code 给收藏分类", path: wrapper, type: "stdio", allowed_origins: [`chrome-extension://${id}/`] };
const written = [];
if (OS === "win32") {
  const file = join(DEST, `${HOST_NAME}.json`);
  writeFileSync(file, JSON.stringify(manifest, null, 2));
  for (const key of ["Google\\Chrome", "Microsoft\\Edge", "BraveSoftware\\Brave-Browser", "Chromium"]) {
    try { execFileSync("reg", ["add", `HKCU\\Software\\${key}\\NativeMessagingHosts\\${HOST_NAME}`, "/ve", "/t", "REG_SZ", "/d", file, "/f"], { stdio: "ignore" }); written.push(key); } catch { /* 跳过 */ }
  }
} else {
  for (const dir of browserDirs()) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${HOST_NAME}.json`), JSON.stringify(manifest, null, 2));
    written.push(dir);
  }
}

const lines = [];
lines.push(`插件编号：${id}`);
lines.push(`小程序装在：${DEST}`);
lines.push(`告诉了这些浏览器：${written.length ? written.join("；") : "一个都没找到（先装 Chrome 再运行一次）"}`);
lines.push(`Codex 命令行：${codex || "没找到"}`);
lines.push(`Claude Code 命令行：${claude || "没找到"}`);
const pong = await ask(wrapper, { type: "ping", id: "install" });
lines.push(`自检：${pong?.ok ? "小程序能正常启动" : "小程序启动失败"}`);
if (!codex && !claude) lines.push("要分类，这台电脑上得有 Codex 或 Claude Code 命令行。装好以后再运行一次 node install.mjs。");
if (process.argv.includes("--test") && pong?.ok && (codex || claude)) {
  const { classifierInstructions, intentOutputSchema } = await import("../lib/classify.js");
  const result = await ask(wrapper, { type: "classify", id: "test", instructions: classifierInstructions(), schema: intentOutputSchema(),
    input: { items: [{ id: "1", author: "示例", handle: "example", text: "Claude Code 新出了 /loop 命令：让它按间隔反复跑一个任务，比如每 5 分钟检查一次部署。", note: "可以做一期教程", publishedAt: new Date().toISOString(), bookmarkedAt: new Date().toISOString() }], corrections: [] } });
  const item = result?.output?.items?.[0];
  lines.push(result?.ok && item ? `试分一条：用 ${result.tool} 分好了，分到「${(item.tags || []).map((t) => t.minor).join("、")}」，讲的是「${item.about}」` : `试分一条：没分成，${result?.error || "没有回应"}`);
}
console.log(lines.join("\n"));
