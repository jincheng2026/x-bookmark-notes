// X 收藏备注的本机小程序（Chrome 叫它 Native Messaging host）。
// Chrome 插件自己不能运行电脑上的程序；插件把要分类的收藏交给它，它调这台电脑上的 Codex 或 Claude Code 命令行，
// 用读者自己账号的额度分类，再把结果交回插件。不用任何模型密钥。
//
// 只做两件事：回答「你在吗、这台电脑上有哪些 AI」；按插件给的说明分类一批收藏。
// Codex 用只读、不联网、不能用工具的方式跑；Claude Code 用不带任何工具的方式跑。收藏内容只交给读者本机的这两个程序。
// 由 install.mjs 装到 ~/.x-bookmark-notes/，那里的 config.json 记着装的时候找到的 node、codex、claude 在哪
// （Chrome 启动它时环境变量里的 PATH 很短，找不到装在别处的命令）。
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1";
const HERE = dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 6 * 60 * 1000;

function config() {
  try { return JSON.parse(readFileSync(join(HERE, "config.json"), "utf8")); } catch { return {}; }
}
function tools() {
  const c = config();
  const ok = (p) => (typeof p === "string" && p && existsSync(p) ? p : null);
  return { codex: ok(c.codex), claude: ok(c.claude), node: ok(c.node) || process.execPath };
}

// ---------- Chrome 的消息格式：前 4 个字节是长度，后面是 JSON ----------
function send(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([head, body]));
}
let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (buffer.length < 4 + length) break;
    const raw = buffer.subarray(4, 4 + length).toString("utf8");
    buffer = buffer.subarray(4 + length);
    let message;
    try { message = JSON.parse(raw); } catch { send({ ok: false, error: "看不懂插件发来的消息" }); continue; }
    handle(message).then(send, (error) => send({ ok: false, id: message?.id, error: String(error?.message || error).slice(0, 400) }));
  }
});
process.stdin.on("end", () => process.exit(0));

function run(command, args, { input, cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("AI 超过 6 分钟没分完")); }, TIMEOUT_MS);
    child.stdout.on("data", (d) => { out += d; if (out.length > 2e6) child.kill("SIGKILL"); });
    child.stderr.on("data", (d) => { err += d; if (err.length > 2e5) err = err.slice(-1e5); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`AI 程序退出码 ${code}：${err.trim().split("\n").slice(-3).join(" ").slice(0, 300)}`));
    });
    child.stdin.end(input);
  });
}
function childEnv(t, command) {
  const sep = process.platform === "win32" ? ";" : ":";
  const extra = process.platform === "win32" ? [] : ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
  return {
    ...process.env,
    HOME: process.env.HOME || homedir(),
    PATH: [dirname(command), dirname(t.node), ...extra, process.env.PATH || ""].filter(Boolean).join(sep),
    NO_COLOR: "1",
    TERM: "dumb",
  };
}
function firstJson(text) {
  const s = String(text || "").trim();
  try { return JSON.parse(s); } catch { /* 往下找 */ }
  const start = s.indexOf("{"), end = s.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1));
  throw new Error("AI 交回来的不是 JSON");
}

async function classify({ instructions, schema, input, prefer }) {
  const t = tools();
  const order = prefer === "claude" ? ["claude", "codex"] : ["codex", "claude"];
  const which = order.find((name) => t[name]);
  if (!which) throw new Error("这台电脑上没找到 Codex 或 Claude Code 命令行，重新运行一次 install.mjs");
  const workspace = join(tmpdir(), "x-bookmark-notes-classify");
  mkdirSync(workspace, { recursive: true });
  if (which === "codex") {
    const schemaFile = join(workspace, "schema.json");
    writeFileSync(schemaFile, JSON.stringify(schema));
    const out = await run(t.codex, [
      "exec", "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check",
      "-c", 'approval_policy="never"', "-c", 'web_search="disabled"', "-c", 'history.persistence="none"', "-c", "project_doc_max_bytes=0", "-c", "mcp_servers={}",
      "--color", "never", "--output-schema", schemaFile, "-C", workspace, instructions,
    ], { input: JSON.stringify(input), cwd: workspace, env: childEnv(t, t.codex) });
    return { tool: "codex", output: firstJson(out) };
  }
  const out = await run(t.claude, [
    "-p", "--output-format", "json", "--tools", "", "--no-session-persistence", "--json-schema", JSON.stringify(schema), instructions,
  ], { input: JSON.stringify(input), cwd: workspace, env: childEnv(t, t.claude) });
  const wrapped = firstJson(out);
  if (wrapped.is_error) throw new Error(`Claude Code 报错：${String(wrapped.result || "").slice(0, 200)}`);
  const output = wrapped.structured_output || (typeof wrapped.result === "string" ? firstJson(wrapped.result) : wrapped.result);
  return { tool: "claude", output };
}

async function handle(message) {
  if (message?.type === "ping") {
    const t = tools();
    return { ok: true, id: message.id, version: VERSION, codex: Boolean(t.codex), claude: Boolean(t.claude) };
  }
  if (message?.type === "classify") {
    const result = await classify(message);
    return { ok: true, id: message.id, ...result };
  }
  return { ok: false, id: message?.id, error: "不认识的请求" };
}
