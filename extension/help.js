// 说明页：打开收藏文件夹；把「装读收藏的 Skill」那段话连同 Skill 全文复制给 AI。
const $ = (id) => document.getElementById(id);

$("copyInstall").addEventListener("click", async () => {
  try {
    if (!(await xbnCopyInstallPrompt())) throw new Error("copy");
    $("copyMsg").textContent = "复制好了，发给你的 Claude Code 或 Codex";
  } catch {
    $("copyMsg").textContent = "没复制上，展开下面「看看复制的是什么」手动全选复制";
  }
});
$("openFolder").addEventListener("click", async () => {
  const r = await chrome.runtime.sendMessage({ type: "xbn-open-folder" }).catch(() => null);
  $("openMsg").textContent = r?.ok ? "" : "还没写出文件：先在插件弹窗里选导入最近 7 天或 30 天";
});
xbnInstallPrompt().then((text) => { $("preview").textContent = text; });
