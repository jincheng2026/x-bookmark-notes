// 「复制给 AI」那段话：装本机小程序（AI 分类用）和读收藏的 Skill。设置页、收藏页、插件小窗、说明页都用这一份。
async function xbnInstallPrompt() {
  const read = async (path) => (await fetch(chrome.runtime.getURL(path))).text();
  const [skill, taxonomy] = await Promise.all([read("skill/x-bookmark-notes/SKILL.md"), read("skill/x-bookmark-notes/references/categories.md")]);
  return [
    "帮我把 Chrome 插件「X 收藏备注」配好。这个插件把我的 X（推特）收藏存成了 Markdown 文件；要配两样东西：一个本机小程序，让插件能调这台电脑上的 Codex 或 Claude Code 命令行自动给收藏分类；一个 Skill，教你怎么查、怎么整理、怎么拿一条收藏开工。",
    "",
    "要做的事：",
    "1. 装本机小程序。先找到插件文件夹：里面有 manifest.json（它的 name 是「X 收藏备注」）和 host/install.mjs，常放在「文稿」「下载」「桌面」里，找不到就在用户目录下搜 install.mjs。这台电脑没有 Node.js 就先装上（18 以上）。然后运行 node <插件文件夹>/host/install.mjs --test。它会说找没找到 Codex、Claude Code 命令行，并真分一条示例收藏。两个命令行都没找到，就帮我装上其中一个：你自己是 Codex 就装 Codex 命令行，是 Claude Code 就装 Claude Code 命令行；需要我登录时停下来告诉我怎么登，我登好了你再运行一次 install.mjs --test。",
    "2. 装 Skill：先看你自己是什么工具（Claude Code、Codex 或别的），把下面两个文件原样写进你读取 Skill 的地方，文件夹名叫 x-bookmark-notes：Claude Code 是 ~/.claude/skills/x-bookmark-notes/，Codex 是 ~/.codex/skills/x-bookmark-notes/（你实际从别的目录读 Skill 就放那里）。已经有旧版就覆盖。不支持 Skill 的工具，就把 SKILL.md 的内容加进你的长期说明（比如 AGENTS.md）。两个文件一个字都不要改。",
    "3. 装好后按 Skill 里写的办法找到我的收藏文件夹，告诉我一共多少条收藏、几条写了「为什么收藏」，再挑最近 3 条写了的，每条一句话告诉我讲什么、我当时写的是什么，证明你读得到。",
    "4. 最后告诉我：本机小程序装没装好、示例分到了哪一类；装好了就提醒我回到 Chrome 里的收藏页，它会自己发现装好了、自动开始分类。找不到收藏文件夹，就告诉我：先在 Chrome 右上角点插件图标，选「导入最近 7 天」或「导入最近 30 天」，等它同步完再叫你。",
    "",
    "===== 文件一：SKILL.md =====",
    skill.trim(),
    "",
    "===== 文件二：references/categories.md =====",
    taxonomy.trim(),
    "",
    "===== 两个文件到此结束 =====",
  ].join("\n");
}

// 复制到剪贴板；复制不了时返回 false
async function xbnCopyInstallPrompt() {
  try { await navigator.clipboard.writeText(await xbnInstallPrompt()); return true; } catch { return false; }
}
