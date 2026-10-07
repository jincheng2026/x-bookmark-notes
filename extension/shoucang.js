
// X 收藏页（插件版）：从作者自用的收藏页搬过来。数据都从插件后台读：收藏、AI 分类、你的批注和状态、头像。
// 页面代码基本照原样，只换了取数据的 api()（原来连本机书签服务，现在问插件后台），去掉了只有作者自己用得上的「正在做」「流量爆帖」。
let ITEMS = [], INTENT = {}, REVIEW = {}, TOPIC = {}, WORK = {}, AVATARS = {}, CLIPS = {}, HOT = {}, HOT_RULES = null, TAXO = [], SINCE = "", SYNC = {}, CLASSIFY = {}, RELAY = null, DOW = [];
let PAGE_VERSION = ""; // 打开页面时是哪一版
const ON_MAC = true; // 插件页面就在这台电脑上：「马上做」能直接开 Claude、Codex
const ICONS = {"circle-plus": "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" />\n  <path d=\"M9 12h6\" />\n  <path d=\"M12 9v6\" />", "rocket": "<path d=\"M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3\" />\n  <path d=\"M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3\" />\n  <path d=\"M15 9m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" />", "ban": "<path d=\"M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" />\n  <path d=\"M5.7 5.7l12.6 12.6\" />", "calendar-plus": "<path d=\"M12.5 21h-6.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v5\" />\n  <path d=\"M16 3v4\" />\n  <path d=\"M8 3v4\" />\n  <path d=\"M4 11h16\" />\n  <path d=\"M16 19h6\" />\n  <path d=\"M19 16v6\" />", "flame": "<path d=\"M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235\" />", "flame-filled": "<path d=\"M10 2c0 -.88 1.056 -1.331 1.692 -.722c1.958 1.876 3.096 5.995 1.75 9.12l-.08 .174l.012 .003c.625 .133 1.203 -.43 2.303 -2.173l.14 -.224a1 1 0 0 1 1.582 -.153c1.334 1.435 2.601 4.377 2.601 6.27c0 4.265 -3.591 7.705 -8 7.705s-8 -3.44 -8 -7.706c0 -2.252 1.022 -4.716 2.632 -6.301l.605 -.589c.241 -.236 .434 -.43 .618 -.624c1.43 -1.512 2.145 -2.924 2.145 -4.78\" />", "volume": "<path d=\"M15 8a5 5 0 0 1 0 8\" /><path d=\"M17.7 5a9 9 0 0 1 0 14\" /><path d=\"M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5\" />", "volume-3": "<path d=\"M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5\" /><path d=\"M16 10l4 4m0 -4l-4 4\" />", "x-home": "<path d=\"M9.25 20.5H6a2 2 0 0 1-2-2v-8.1a2 2 0 0 1 .7-1.52l6-5.14a2 2 0 0 1 2.6 0l6 5.14a2 2 0 0 1 .7 1.52v8.1a2 2 0 0 1-2 2h-3.25v-4.25a2.75 2.75 0 0 0-5.5 0z\"/>", "x-home-filled": "<path d=\"M9.25 20.5H6a2 2 0 0 1-2-2v-8.1a2 2 0 0 1 .7-1.52l6-5.14a2 2 0 0 1 2.6 0l6 5.14a2 2 0 0 1 .7 1.52v8.1a2 2 0 0 1-2 2h-3.25v-4.25a2.75 2.75 0 0 0-5.5 0z\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>", "x-article": "<path d=\"M7.9 20.7H5.9A2.6 2.6 0 0 1 3.3 18.1V5A2.6 2.6 0 0 1 5.9 2.4H16.3A2.6 2.6 0 0 1 18.9 5V8.3\"/><path d=\"M7 7.4H15.2M7 11.3H12\" stroke-linecap=\"butt\"/><path d=\"M11.9 21.5L15.39 20.75L21.17 14.97A1.93 1.93 0 0 0 18.44 12.24L12.66 18.02Z\"/>", "x-article-filled": "<path fill-rule=\"evenodd\" d=\"M5.6 1.7H16.1A3.2 3.2 0 0 1 19.3 4.9V9.1L7 21.4H5.6A3.2 3.2 0 0 1 2.4 18.2V4.9A3.2 3.2 0 0 1 5.6 1.7ZM6.5 5.8h8.2v1.9h-8.2ZM6.5 9.9h5v1.8h-5Z\"/><path d=\"M11.3 22.1L15.15 21.43L21.39 15.19A2.25 2.25 0 0 0 18.21 12.01L11.97 18.25Z\"/>", "home": "<path d=\"M5 12l-2 0l9 -9l9 9l-2 0\" />\n  <path d=\"M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7\" />\n  <path d=\"M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6\" />", "clock": "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" />\n  <path d=\"M12 7v5l3 3\" />", "pencil": "<path d=\"M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4\" />\n  <path d=\"M13.5 6.5l4 4\" />", "sparkles": "<path d=\"M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z\" />", "search": "<path d=\"M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0\" />\n  <path d=\"M21 21l-6 -6\" />", "tool": "<path d=\"M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5\" />", "bulb": "<path d=\"M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7\" />\n  <path d=\"M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3\" />\n  <path d=\"M9.7 17l4.6 0\" />", "movie": "<path d=\"M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z\" />\n  <path d=\"M8 4l0 16\" />\n  <path d=\"M16 4l0 16\" />\n  <path d=\"M4 8l4 0\" />\n  <path d=\"M4 16l4 0\" />\n  <path d=\"M4 12l16 0\" />\n  <path d=\"M16 8l4 0\" />\n  <path d=\"M16 16l4 0\" />", "circle-check": "<path d=\"M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" />\n  <path d=\"M9 12l2 2l4 -4\" />", "message-circle": "<path d=\"M3 20l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235 -7.615 4.215 -11.574 2.293l-4.7 1\" />", "bookmark": "<path d=\"M18 7v14l-6 -4l-6 4v-14a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4z\" />", "bolt": "<path d=\"M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11\" />", "file-plus": "<path d=\"M14 3v4a1 1 0 0 0 1 1h4\" />\n  <path d=\"M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z\" />\n  <path d=\"M12 11l0 6\" />\n  <path d=\"M9 14l6 0\" />", "chart-bar": "<path d=\"M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z\" />\n  <path d=\"M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z\" />\n  <path d=\"M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z\" />\n  <path d=\"M4 20h14\" />", "dots": "<path d=\"M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" />\n  <path d=\"M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" />\n  <path d=\"M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" />", "arrow-left": "<path d=\"M5 12l14 0\" />\n  <path d=\"M5 12l6 6\" />\n  <path d=\"M5 12l6 -6\" />", "external-link": "<path d=\"M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6\" />\n  <path d=\"M11 13l9 -9\" />\n  <path d=\"M15 4h5v5\" />", "trash": "<path d=\"M4 7l16 0\" />\n  <path d=\"M10 11l0 6\" />\n  <path d=\"M14 11l0 6\" />\n  <path d=\"M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12\" />\n  <path d=\"M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3\" />", "link": "<path d=\"M9 15l6 -6\" />\n  <path d=\"M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464\" />\n  <path d=\"M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463\" />", "chevron-down": "<path d=\"M6 9l6 6l6 -6\" />", "article": "<path d=\"M3 4m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z\" />\n  <path d=\"M7 8h10\" />\n  <path d=\"M7 12h10\" />\n  <path d=\"M7 16h10\" />", "check": "<path d=\"M5 12l5 5l10 -10\" />", "tags": "<path d=\"M3 8v4.172a2 2 0 0 0 .586 1.414l5.71 5.71a2.41 2.41 0 0 0 3.408 0l3.592 -3.592a2.41 2.41 0 0 0 0 -3.408l-5.71 -5.71a2 2 0 0 0 -1.414 -.586h-4.172a2 2 0 0 0 -2 2z\" />\n  <path d=\"M18 19l1.592 -1.592a4.82 4.82 0 0 0 0 -6.816l-4.592 -4.592\" />\n  <path d=\"M7 10h-.01\" />", "player-play": "<path d=\"M7 4v16l13 -8z\" />", "x": "<path d=\"M18 6l-12 12\" />\n  <path d=\"M6 6l12 12\" />", "home-filled": "<path d=\"M12.707 2.293l9 9c.63 .63 .184 1.707 -.707 1.707h-1v6a3 3 0 0 1 -3 3h-1v-7a3 3 0 0 0 -2.824 -2.995l-.176 -.005h-2a3 3 0 0 0 -3 3v7h-1a3 3 0 0 1 -3 -3v-6h-1c-.89 0 -1.337 -1.077 -.707 -1.707l9 -9a1 1 0 0 1 1.414 0m.293 11.707a1 1 0 0 1 1 1v7h-4v-7a1 1 0 0 1 .883 -.993l.117 -.007z\" />", "clock-filled": "<path d=\"M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 14.995 -8.336zm-5 2.66a1 1 0 0 0 -.993 .883l-.007 .117v5l.009 .131a1 1 0 0 0 .197 .477l.087 .1l3 3l.094 .082a1 1 0 0 0 1.226 0l.094 -.083l.083 -.094a1 1 0 0 0 0 -1.226l-.083 -.094l-2.707 -2.708v-4.585l-.007 -.117a1 1 0 0 0 -.993 -.883z\" />", "bookmark-filled": "<path d=\"M14 2a5 5 0 0 1 5 5v14a1 1 0 0 1 -1.555 .832l-5.445 -3.63l-5.444 3.63a1 1 0 0 1 -1.55 -.72l-.006 -.112v-14a5 5 0 0 1 5 -5h4z\" />", "circle-check-filled": "<path d=\"M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 14.995 -8.336zm-1.293 5.953a1 1 0 0 0 -1.32 -.083l-.094 .083l-3.293 3.292l-1.293 -1.292l-.094 -.083a1 1 0 0 0 -1.403 1.403l.083 .094l2 2l.094 .083a1 1 0 0 0 1.226 0l.094 -.083l4 -4l.083 -.094a1 1 0 0 0 -.083 -1.32z\" />", "bolt-filled": "<path d=\"M13 2l.018 .001l.016 .001l.083 .005l.011 .002h.011l.038 .009l.052 .008l.016 .006l.011 .001l.029 .011l.052 .014l.019 .009l.015 .004l.028 .014l.04 .017l.021 .012l.022 .01l.023 .015l.031 .017l.034 .024l.018 .011l.013 .012l.024 .017l.038 .034l.022 .017l.008 .01l.014 .012l.036 .041l.026 .027l.006 .009c.12 .147 .196 .322 .218 .513l.001 .012l.002 .041l.004 .064v6h5a1 1 0 0 1 .868 1.497l-.06 .091l-8 11c-.568 .783 -1.808 .38 -1.808 -.588v-6h-5a1 1 0 0 1 -.868 -1.497l.06 -.091l8 -11l.01 -.013l.018 -.024l.033 -.038l.018 -.022l.009 -.008l.013 -.014l.04 -.036l.028 -.026l.008 -.006a1 1 0 0 1 .402 -.199l.011 -.001l.027 -.005l.074 -.013l.011 -.001l.041 -.002z\" />", "bulb-filled": "<path d=\"M4 11a1 1 0 0 1 .117 1.993l-.117 .007h-1a1 1 0 0 1 -.117 -1.993l.117 -.007h1z\" />\n  <path d=\"M12 2a1 1 0 0 1 .993 .883l.007 .117v1a1 1 0 0 1 -1.993 .117l-.007 -.117v-1a1 1 0 0 1 1 -1z\" />\n  <path d=\"M21 11a1 1 0 0 1 .117 1.993l-.117 .007h-1a1 1 0 0 1 -.117 -1.993l.117 -.007h1z\" />\n  <path d=\"M4.893 4.893a1 1 0 0 1 1.32 -.083l.094 .083l.7 .7a1 1 0 0 1 -1.32 1.497l-.094 -.083l-.7 -.7a1 1 0 0 1 0 -1.414z\" />\n  <path d=\"M17.693 4.893a1 1 0 0 1 1.497 1.32l-.083 .094l-.7 .7a1 1 0 0 1 -1.497 -1.32l.083 -.094l.7 -.7z\" />\n  <path d=\"M14 18a1 1 0 0 1 1 1a3 3 0 0 1 -6 0a1 1 0 0 1 .883 -.993l.117 -.007h4z\" />\n  <path d=\"M12 6a6 6 0 0 1 3.6 10.8a1 1 0 0 1 -.471 .192l-.129 .008h-6a1 1 0 0 1 -.6 -.2a6 6 0 0 1 3.6 -10.8z\" />", "message-circle-filled": "<path d=\"M5.821 4.91c3.899 -2.765 9.468 -2.539 13.073 .535c3.667 3.129 4.168 8.238 1.152 11.898c-2.841 3.447 -7.965 4.583 -12.231 2.805l-.233 -.101l-4.374 .931l-.04 .006l-.035 .007h-.018l-.022 .005h-.038l-.033 .004l-.021 -.001l-.023 .001l-.033 -.003h-.035l-.022 -.004l-.022 -.002l-.035 -.007l-.034 -.005l-.016 -.004l-.024 -.005l-.049 -.016l-.024 -.005l-.011 -.005l-.022 -.007l-.045 -.02l-.03 -.012l-.011 -.006l-.014 -.006l-.031 -.018l-.045 -.024l-.016 -.011l-.037 -.026l-.04 -.027l-.002 -.004l-.013 -.009l-.043 -.04l-.025 -.02l-.006 -.007l-.056 -.062l-.013 -.014l-.011 -.014l-.039 -.056l-.014 -.019l-.005 -.01l-.042 -.073l-.007 -.012l-.004 -.008l-.007 -.012l-.014 -.038l-.02 -.042l-.004 -.016l-.004 -.01l-.017 -.061l-.007 -.018l-.002 -.015l-.005 -.019l-.005 -.033l-.008 -.042l-.002 -.031l-.003 -.01v-.016l-.004 -.054l.001 -.036l.001 -.023l.002 -.053l.004 -.025v-.019l.008 -.035l.005 -.034l.005 -.02l.004 -.02l.018 -.06l.003 -.013l1.15 -3.45l-.022 -.037c-2.21 -3.747 -1.209 -8.391 2.413 -11.119z\" />", "player-play-filled": "<path d=\"M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z\" />", "zoom": "<path d=\"M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0\" />\n  <path d=\"M21 21l-6 -6\" />", "settings": "<path d=\"M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z\" />\n  <path d=\"M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0\" />", "camera": "<path d=\"M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2\" />\n  <path d=\"M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0\" />", "message": "<path d=\"M8 9h8\" />\n  <path d=\"M8 13h6\" />\n  <path d=\"M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z\" />", "hourglass": "<path d=\"M6.5 7h11\" />\n  <path d=\"M6.5 17h11\" />\n  <path d=\"M6 20v-2a6 6 0 1 1 12 0v2a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1z\" />\n  <path d=\"M6 4v2a6 6 0 1 0 12 0v-2a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1z\" />", "bookmarks": "<path d=\"M15 10v11l-5 -3l-5 3v-11a3 3 0 0 1 3 -3h4a3 3 0 0 1 3 3z\" />\n  <path d=\"M11 3h5a3 3 0 0 1 3 3v11\" />", "adjustments-horizontal": "<path d=\"M14 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" />\n  <path d=\"M4 6l8 0\" />\n  <path d=\"M16 6l4 0\" />\n  <path d=\"M8 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" />\n  <path d=\"M4 12l2 0\" />\n  <path d=\"M10 12l10 0\" />\n  <path d=\"M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" />\n  <path d=\"M4 18l11 0\" />\n  <path d=\"M19 18l1 0\" />", "refresh": "<path d=\"M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4\" />\n  <path d=\"M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4\" />", "zoom-filled": "<path d=\"M14 3.072a8 8 0 0 1 2.617 11.424l4.944 4.943a1.5 1.5 0 0 1 -2.008 2.225l-.114 -.103l-4.943 -4.944a8 8 0 0 1 -12.49 -6.332l-.006 -.285l.005 -.285a8 8 0 0 1 11.995 -6.643z\" />", "settings-filled": "<path d=\"M14.647 4.081a.724 .724 0 0 0 1.08 .448c2.439 -1.485 5.23 1.305 3.745 3.744a.724 .724 0 0 0 .447 1.08c2.775 .673 2.775 4.62 0 5.294a.724 .724 0 0 0 -.448 1.08c1.485 2.439 -1.305 5.23 -3.744 3.745a.724 .724 0 0 0 -1.08 .447c-.673 2.775 -4.62 2.775 -5.294 0a.724 .724 0 0 0 -1.08 -.448c-2.439 1.485 -5.23 -1.305 -3.745 -3.744a.724 .724 0 0 0 -.447 -1.08c-2.775 -.673 -2.775 -4.62 0 -5.294a.724 .724 0 0 0 .448 -1.08c-1.485 -2.439 1.305 -5.23 3.744 -3.745a.722 .722 0 0 0 1.08 -.447c.673 -2.775 4.62 -2.775 5.294 0zm-2.647 4.919a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z\" />", "camera-filled": "<path d=\"M15 3a2 2 0 0 1 1.995 1.85l.005 .15a1 1 0 0 0 .883 .993l.117 .007h1a3 3 0 0 1 2.995 2.824l.005 .176v9a3 3 0 0 1 -2.824 2.995l-.176 .005h-14a3 3 0 0 1 -2.995 -2.824l-.005 -.176v-9a3 3 0 0 1 2.824 -2.995l.176 -.005h1a1 1 0 0 0 1 -1a2 2 0 0 1 1.85 -1.995l.15 -.005h6zm-3 7a3 3 0 0 0 -2.985 2.698l-.011 .152l-.004 .15l.004 .15a3 3 0 1 0 2.996 -3.15z\" />", "message-filled": "<path d=\"M18 3a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-4.724l-4.762 2.857a1 1 0 0 1 -1.508 -.743l-.006 -.114v-2h-1a4 4 0 0 1 -3.995 -3.8l-.005 -.2v-8a4 4 0 0 1 4 -4zm-4 9h-6a1 1 0 0 0 0 2h6a1 1 0 0 0 0 -2m2 -4h-8a1 1 0 1 0 0 2h8a1 1 0 0 0 0 -2\" />", "hourglass-filled": "<path d=\"M17 2a2 2 0 0 1 1.995 1.85l.005 .15v2a6.996 6.996 0 0 1 -3.393 6a6.994 6.994 0 0 1 3.388 5.728l.005 .272v2a2 2 0 0 1 -1.85 1.995l-.15 .005h-10a2 2 0 0 1 -1.995 -1.85l-.005 -.15v-2a6.996 6.996 0 0 1 3.393 -6a6.994 6.994 0 0 1 -3.388 -5.728l-.005 -.272v-2a2 2 0 0 1 1.85 -1.995l.15 -.005h10z\" />", "bookmarks-filled": "<path d=\"M12 6a4 4 0 0 1 4 4v11a1 1 0 0 1 -1.514 .857l-4.486 -2.691l-4.486 2.691a1 1 0 0 1 -1.508 -.743l-.006 -.114v-11a4 4 0 0 1 4 -4h4z\" />\n  <path d=\"M16 2a4 4 0 0 1 4 4v11a1 1 0 0 1 -2 0v-11a2 2 0 0 0 -2 -2h-5a1 1 0 0 1 0 -2h5z\" />"};
const ME = {name:"我", handle:""};
const STATUSES = [["现在就用","bolt","马上要用：做成选题，或当素材用进手头的内容"],["先存着","bookmark","暂时用不上，需要时再来找"],["用过了","circle-check","已经用在视频或项目里"],["丢掉","trash","这里不再显示，X 上的书签还在"]];
const VIDEOS = [["教程","settings"],["观点","message"],["科普","bulb"]];
const VIEWS = [["all","x-home","全部收藏"],["today","clock","今天"],["make","player-play","可做成视频"],["nonote","message","没写备注"],["pending","hourglass","未分类"]];
// 选中时：有实心版的用实心，没有的（放大镜）加粗线条，和 X 的「探索」一样。x-home、x-article 是照 X 的「主页」「文章」图标画的
const MAJOR_IC = {"信息差":"search","AI 实操":"x-article","认知":"bulb","做内容参考":"camera"};
let NOW = Date.now(); const today = new Date(); today.setHours(0,0,0,0);
const st = { view:{kind:"all"}, status:"全部", videos:new Set(), q:"", expanded:new Set(), aiOpen:new Set(), popId:null };
// 栏目写进网址：#make/over 是「可做成视频 · 过期了」，#work 是「正在做」，#tag/信息差/小类 是某个大类；工作台首页那一行点过来直接落到这一栏
function viewFromHash(){
  const [kind, a, b] = decodeURIComponent(location.hash.slice(1)).split("/");
  if (kind === "tag" && a) return { kind, major: a, minor: b || undefined };
  if (VIEWS.some(([k]) => k === kind)) return { kind, minor: a || undefined };
  return null;
}
function hashFor(v){ return v.kind === "all" ? "" : "#" + [v.kind, v.kind === "tag" ? v.major : v.minor, v.kind === "tag" ? v.minor : undefined].filter(Boolean).map(encodeURIComponent).join("/"); }
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function ic(name, size = 18.75, o = {}){
  const f = o.fill && ICONS[name + "-filled"]; const inner = f ? ICONS[name + "-filled"] : (ICONS[name] || "");
  const attrs = f ? 'fill="currentColor" stroke="none"' : `fill="none" stroke="currentColor" stroke-width="${o.bold ? 2.5 : 1.75}" stroke-linecap="round" stroke-linejoin="round"`;
  return `<svg class="svg" viewBox="0 0 24 24" width="${size}" height="${size}" ${attrs} aria-hidden="true">${inner}</svg>`;
}
// AI 的分类；你在卡片上直接改过标签、可做成什么的，以你改的为准
let MAJOR_OF = {}; // 小类 → 大类，读完分类树算一次
function cls(it){
  const c = INTENT[it.id] || null, L = REVIEW[it.id];
  if (!L || (!L.tags && !L.video)) return c;
  return { ...(c || { tags: [], video: [], status: "先存着", keywords: [] }),
    ...(L.tags ? { tags: L.tags.map((t) => typeof t === "string" ? [MAJOR_OF[t], t] : [t.major, t.minor]).filter(([a]) => a) } : {}),
    ...(L.video ? { video: L.video } : {}), edited: true };
}
const reviewOf = (id) => REVIEW[id] || {};
const statusOf = (it) => reviewOf(it.id).status || cls(it)?.status || "先存着";
const noteOf = (it) => it.note || "";
const live = (it) => statusOf(it) !== "丢掉";
const savedAt = (it) => it.bookmarkedAt || it.firstSeen; // 收藏的时刻（X 没给排序号的，用进书签库的时间顶上）
const isToday = (it) => { const t = Date.parse(savedAt(it) || ""); return t && t >= today.getTime(); };
// ---------- 多久内做：可做成视频的收藏，从收藏那一刻算最晚多久内做（五档，档位和叫法从插件后台来） ----------
// 你在网页上改过的档优先，其次是 AI 定的；你给做不成视频的也定了档，就当它能做
const withinOf = (it) => reviewOf(it.id).doWithin || cls(it)?.doWithin || "";
const tierOf = (it) => DOW.find((w) => w.key === withinOf(it)) || null;
const makeable = (it) => Boolean(cls(it)?.video?.length || reviewOf(it.id).doWithin);
// 用进了选题卡的，做不做、什么时候做看选题总览，这里不倒计时；卡已经做完的（已做、已发布）不再放进「可做成视频」
const topicsOf = (it) => TOPIC[it.id] || [];
const topicDone = (it) => topicsOf(it).some((c) => c.done || c.status === "已发布");
// 没写备注、你也没自己定档的，档是 AI 按推文猜的，不倒计时
const guessed = (it) => !noteOf(it).trim() && !reviewOf(it.id).doWithin;
// 正在做：点过「马上做」，或在 Claude、Codex 对话里贴过这条的链接；用过了、丢掉、不做了、选题卡已经做完的不算
const workOf = (it) => WORK[it.id] || null;
const working = (it) => Boolean(workOf(it)) && live(it) && !dropped(it) && statusOf(it) !== "用过了" && !topicDone(it);
const TOOL_NAMES = { claude: "Claude", codex: "Codex" };
const workHow = (w) => w.via === "page" ? `在收藏页点了马上做，用 ${TOOL_NAMES[w.tool]}` : w.via === "plugin" ? `在插件里点了马上做，用 ${TOOL_NAMES[w.tool]}` : `在 ${TOOL_NAMES[w.tool] || w.tool} 对话里贴了链接`;
function dueAt(it){ if (topicsOf(it).length || guessed(it) || working(it)) return null; const w = tierOf(it), L = reviewOf(it.id), t = Date.parse((L.decision === "delay" && L.decidedAt) || savedAt(it) || ""); return w?.hours && t ? t + w.hours * 3600e3 : null; } // 延期的从点延期那一刻重新算 // 「随时能做」没有截止
const overdue = (it) => { const d = dueAt(it); return d !== null && d <= NOW; };
const dueSoon = (it) => { const d = dueAt(it); return d !== null && d > NOW && d - NOW < 24 * 3600e3; };
function leftLabel(ms){ if (ms <= 0) return "过期了"; const h = ms / 3600e3; return h < 1 ? "还剩不到 1 小时" : h < 48 ? `还剩 ${Math.ceil(h)} 小时` : `还剩 ${Math.round(h / 24)} 天`; }
// 「可做成视频」这一栏只放要做的：用过了的不放（在右上角状态里选「用过了」才看得到）
// 「不做了」的只在最后那个「不做了」标签里
const dropped = (it) => reviewOf(it.id).decision === "drop";
const makeList = (it) => makeable(it) && live(it) && !dropped(it) && ((statusOf(it) !== "用过了" && !topicDone(it)) || st.status === "用过了");
const monthDay = (ms) => { const x = new Date(ms); return `${x.getMonth() + 1}月${x.getDate()}日`; };
const dueSoonCount = () => ITEMS.filter((it) => makeList(it) && dueSoon(it)).length;
function hue(s){ let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
// 头像：X 上的头像图，40 像素的位置用 X 自己的 96 像素版本；没有头像或加载失败时显示名字第一个字
function avatar(name, handle, size){
  const src = AVATARS[String(handle || "").replace(/^@+/, "").toLowerCase()];
  const img = src ? `<img src="${esc(src.replace(/_normal(\.\w+)$/, "_x96$1"))}" alt="" loading="lazy" decoding="async">` : "";
  return `<span class="av" style="background:hsl(${hue(handle || name)} 40% 48%)${size ? `;width:${size}px;height:${size}px` : ""}">${esc([...(name || "?")][0])}${img}</span>`;
}
function relTime(s){
  const t = Date.parse(s || ""); if (!t) return ""; const d = (NOW - t) / 1000;
  if (d < 60) return Math.max(1, Math.floor(d)) + "秒"; if (d < 3600) return Math.floor(d / 60) + "分钟"; if (d < 86400) return Math.floor(d / 3600) + "小时";
  const x = new Date(t); return (x.getFullYear() === new Date(NOW).getFullYear() ? "" : x.getFullYear() + "年") + (x.getMonth() + 1) + "月" + x.getDate() + "日";
}
// 卡片上写两个时间：帖子什么时候发布的、你什么时候收藏的；鼠标停上去看具体到分钟
const timeLabel = (s, verb) => { const r = relTime(s); return r ? (/[月年]/.test(r) ? `${r}${verb}` : `${r}前${verb}`) : ""; };
const pubLabel = (it) => timeLabel(it.datetime, "发布");
const savedLabel = (it) => timeLabel(savedAt(it), "收藏");
function fullTime(s){ const t = Date.parse(s || ""); if (!t) return ""; const x = new Date(t); return `${x.getFullYear()}年${x.getMonth() + 1}月${x.getDate()}日 ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`; }
function timeTip(it){ return [it.bookmarkedAt ? `收藏于 ${fullTime(it.bookmarkedAt)}` : `进书签库 ${fullTime(it.firstSeen)}`, it.datetime ? `发帖于 ${fullTime(it.datetime)}` : ""].filter(Boolean).join("\n"); }
function fmtNum(n){ if (!n) return ""; if (n < 10000) return n.toLocaleString("en-US"); if (n < 1e8) return (n / 1e4).toFixed(n < 1e5 ? 1 : 0).replace(/\.0$/, "") + "万"; return (n / 1e8).toFixed(1).replace(/\.0$/, "") + "亿"; }
function shortText(t){
  if (t.length <= 280) return [t, false];
  let cut = t.slice(0, 280); const p = cut.lastIndexOf("\n");
  if (p > 120) cut = cut.slice(0, p);
  else { const e = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"), cut.lastIndexOf(". ")); if (e > 120) cut = cut.slice(0, e + 1); }
  return [cut.trimEnd() + "…", true];
}
function linkify(text){
  return esc(text).replace(/https?:\/\/\s?[^\s，。）)]+/g, (u) => { const clean = u.replace(/\s/g, "").replace(/&amp;/g, "&"); const shown = clean.replace(/^https?:\/\/(www\.)?/, ""); return `<a href="${esc(clean)}" target="_blank" rel="noopener">${esc(shown.length > 26 ? shown.slice(0, 25) + "…" : shown)}</a>`; });
}
// 点图、点视频：和 X 一样，打开这条帖子的这张图、这段视频（X 的媒体查看页，视频进去就播放）；第几个按推文里的顺序数
function mediaHtml(it){
  const ms = it.media; if (!ms?.length) return ""; const list = ms.slice(0, 4);
  const base = /\/status\/\d+/.test(it.url || "") ? it.url.replace(/[?#].*$/, "").replace(/\/+$/, "") : `https://x.com/i/status/${it.id}`;
  const vids = CLIPS[it.id] || [];
  return `<div class="media n${list.length}" data-key="${esc(JSON.stringify([list, vids]))}">${list.map((u, i) => { const v = /video_thumb/.test(u), mp4 = v && vids.find((x) => x.idx === i);
    const inline = mp4 ? `<video muted playsinline loop preload="none" data-src="${esc(mp4.mp4)}"></video><span class="vtime">${mp4.kind === "gif" ? "GIF" : fmtDur(mp4.durationMs)}</span>${mp4.kind === "gif" ? "" : `<button class="vmute" data-act="mute" aria-label="${soundOn ? "关掉声音" : "打开声音"}">${ic(soundOn ? "volume" : "volume-3", 18, {bold:true})}</button>`}` : "";
    return `<a class="m${mp4 ? " vid" : ""}" ${mp4 ? `data-kind="${mp4.kind}"` : ""} href="${esc(base)}/${v ? "video" : "photo"}/${i + 1}" target="_blank" rel="noopener" aria-label="${v ? "到 X 播放这段视频" : "到 X 看这张图"}"><img loading="lazy" decoding="async" src="${esc(u)}" alt="">${inline}${v ? `<span class="play">${ic("player-play", 26, {fill:true})}</span>` : ""}</a>`; }).join("")}</div>`;
}
function fmtDur(ms){ const t = Math.max(0, Math.round((ms || 0) / 1000)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = String(t % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`; }
// ---------- 视频自动播放：和 X 一样，屏幕上露出一半以上的视频里，只播露得最多的那一条，其余暂停 ----------
let soundOn = false; // 和 X 一样全局一个开关：在一条视频上打开声音，之后滑到的视频也有声音
const vidRatio = new Map();
const vidObserver = new IntersectionObserver((entries) => {
  for (const e of entries) vidRatio.set(e.target, e.isIntersecting ? e.intersectionRatio : 0);
  pickVideo();
}, { threshold: [0, 0.25, 0.5, 0.75, 1] });
function pickVideo(){
  let best = null, bestR = 0.5;
  for (const [box, r] of vidRatio){ if (!box.isConnected){ vidRatio.delete(box); continue; } if (r >= bestR){ best = box; bestR = r; } }
  if (document.hidden) best = null;
  for (const [box] of vidRatio) if (box !== best) box.querySelector("video")?.pause();
  if (!best) return;
  const v = best.querySelector("video"); if (!v) return;
  if (!v.src) v.src = v.dataset.src; // 露出来才开始加载
  v.muted = !soundOn || best.dataset.kind === "gif";
  v.play().catch(() => { if (!v.muted){ v.muted = true; v.play().catch(() => {}); } }); // 浏览器不让带声音自动播时，先静音播
}
function wireVideos(root){
  for (const box of root.querySelectorAll(".m.vid:not([data-wired])")){
    box.dataset.wired = "1";
    const v = box.querySelector("video"), time = box.querySelector(".vtime");
    v.addEventListener("playing", () => box.classList.add("on"));
    if (box.dataset.kind !== "gif") v.addEventListener("timeupdate", () => { if (v.duration) time.textContent = fmtDur((v.duration - v.currentTime) * 1000); });
    v.addEventListener("error", () => { vidRatio.delete(box); vidObserver.unobserve(box); v.remove(); box.querySelector(".vmute")?.remove(); box.classList.remove("vid", "on"); }); // 播不了就退回封面，点了去 X 播
    vidObserver.observe(box);
  }
}
function setSound(on){
  soundOn = on;
  for (const box of document.querySelectorAll(".m.vid")){
    const v = box.querySelector("video"), b = box.querySelector(".vmute");
    if (v && box.dataset.kind !== "gif") v.muted = !on;
    if (b){ b.innerHTML = ic(on ? "volume" : "volume-3", 18, {bold:true}); b.setAttribute("aria-label", on ? "关掉声音" : "打开声音"); }
  }
  pickVideo();
}
function inView(it){
  const c = cls(it), v = st.view;
  if (v.kind === "today") return isToday(it);
  if (v.kind === "nonote") return !noteOf(it).trim() && (!v.minor || (v.minor === "day") === (Date.now() - Date.parse(savedAt(it) || 0) < 24 * 3600e3)); // 标签：最近一天收的、更早的
  if (v.kind === "pending") return !c;
  if (v.kind === "hot") return !!HOT[it.id];
  if (v.kind === "work") return working(it);
  if (v.kind === "make" && v.minor === "dropped") return makeable(it) && dropped(it);
  if (v.kind === "make"){ if (!makeList(it)) return false; const tab = v.minor || ""; return tab === "over" ? overdue(it) : !overdue(it) && (!tab || withinOf(it) === tab); } // 标签栏借用 minor 记档位，over 是「过期了」
  if (v.kind === "tag") return !!c && c.tags.some(([a, b]) => a === v.major && (!v.minor || b === v.minor));
  return true;
}
// 有搜索词时在全部收藏里找（不限当前这一栏），AI 写的「讲的是」「还读出」「处理建议」、你写的不准原因、不做了和延期的原因都算
function matches(it){
  if (!st.q && !inView(it)) return false;
  if (st.status === "全部" ? !live(it) : statusOf(it) !== st.status) return false;
  const c = cls(it);
  if (st.videos.size && (!c || !c.video.some((x) => st.videos.has(x)))) return false;
  if (st.q){ const L = reviewOf(it.id); const hay = [it.author, it.handle, it.text, it.articleTitle, it.quoted?.text, noteOf(it), c?.about, c?.readout, c?.statusNote, ...(c?.video || []).map((v) => v + "视频"), L.fix, L.decisionNote, ...(c?.keywords || []), ...(c?.tags || []).flat()].join(" ").toLowerCase(); if (!st.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false; }
  return true;
}
const countTag = (a, b) => ITEMS.filter((it) => { const c = cls(it); return c && live(it) && c.tags.some(([x, y]) => x === a && (!b || y === b)); }).length;
const pendingCount = () => ITEMS.filter((it) => !cls(it)).length;

// ---------- 左栏：只建一次，之后只改样子，不重画（鼠标底下的灰底不会闪） ----------
let navItems = [];
function buildNav(){
  // 顺序：全部收藏、今天，然后四个大类；没写备注、未分类是待处理的清单，没那么常看，放最下面
  const view = ([k, icon, name]) => ({key:"v:" + k, icon, name, view:{kind:k}});
  const later = ["nonote", "pending"];
  navItems = [...VIEWS.filter(([k]) => !later.includes(k)).map(view), ...TAXO.map((g) => ({key:"m:" + g.major, icon: MAJOR_IC[g.major] || "tags", name: g.major, view:{kind:"tag", major:g.major}})), ...VIEWS.filter(([k]) => later.includes(k)).map(view)];
  $("#nav").innerHTML = navItems.map((n) => n === "sep" ? `<div class="nav-sep"></div>` :
    `<button class="nav-i" data-nav="${esc(n.key)}" data-tip="${esc(n.name)}"><span class="ico"><span class="ic"></span>${["v:pending", "v:hot", "v:make"].includes(n.key) ? `<span class="badge" hidden></span>` : ""}</span><span class="lbl">${esc(n.name)}</span></button>`).join("");
  $("#bbar").innerHTML = VIEWS.filter(([k]) => k !== "work").map(([k, icon, name]) => `<button data-nav="v:${k}" aria-label="${name}"><span class="ico" style="position:relative;display:block"><span class="ic"></span>${["pending", "hot", "make"].includes(k) ? `<span class="badge" hidden></span>` : ""}</span></button>`).join("") + `<button data-act="views" aria-label="标签">${ic("tags", 26.25)}</button>`;
}
// 流量爆帖的数字：上次打开「流量爆帖」以后新出现的条数；打开这一栏就清零（记在这台电脑的浏览器里）
const HOT_SEEN_KEY = "xsc.hotSeenAt";
function hotSeenAt(){ try { return Number(localStorage.getItem(HOT_SEEN_KEY)) || 0; } catch { return 0; } }
function newHotCount(){ const seen = hotSeenAt(); return ITEMS.filter((it) => HOT[it.id] && Date.parse(HOT[it.id].flaggedAt) > seen && live(it)).length; }
function markHotSeen(){ const latest = Math.max(0, ...Object.values(HOT).map((h) => Date.parse(h.flaggedAt) || 0)); try { if (latest > hotSeenAt()) localStorage.setItem(HOT_SEEN_KEY, String(latest)); } catch {} }
function activeKey(){ const v = st.view; return v.kind === "tag" ? "m:" + v.major : "v:" + v.kind; }
function updateNav(){
  const on = activeKey(), pend = pendingCount(), fresh = newHotCount(), soon = dueSoonCount(); // 可做成视频的角标：一天内到期的条数
  for (const el of document.querySelectorAll("[data-nav]")){
    const n = navItems.find((x) => x !== "sep" && x.key === el.dataset.nav); if (!n || !el.querySelector(".ic")) continue; // 右栏、菜单里借用跳转标记的按钮不是导航，不改
    const isOn = el.dataset.nav === on;
    if (el.classList.contains("on") !== isOn || !el.dataset.drawn){ el.classList.toggle("on", isOn); el.querySelector(".ic").outerHTML = `<span class="ic">${ic(n.icon, 26.25, {fill:isOn, bold:isOn})}</span>`; el.dataset.drawn = "1"; }
    const badge = el.querySelector(".badge"), n2 = el.dataset.nav === "v:hot" ? fresh : el.dataset.nav === "v:make" ? soon : pend; if (badge){ badge.hidden = !n2; badge.textContent = n2; }
  }
}
// ---------- 标题栏：小类在标签栏里，状态在右上角的下拉按钮里 ----------
function renderHead(){
  const v = st.view, g = v.kind === "tag" ? TAXO.find((x) => x.major === v.major) : null;
  if (v.kind === "tag" && !g){ st.view = {kind:"all"}; return renderHead(); } // 网址里的大类已经不在分类树里了
  const title = g ? g.major : VIEWS.find((x) => x[0] === v.kind)[2];
  $("#title").innerHTML = `${esc(title)}${ic("chevron-down", 18.75)}`;
  $("#title").title = g ? g.when : "";
  $("#back").hidden = v.kind === "all";
  const f = $("#filter"); f.classList.toggle("on", st.status !== "全部");
  f.innerHTML = `${esc(st.status === "全部" ? "全部状态" : st.status)}${ic("chevron-down", 18.75)}`;
  const tabs = $("#tabs");
  const defs = g ? [["", "全部"], ...g.minors.map((m) => [m.name, m.name, m.why])]
    : v.kind === "nonote" ? [["", "全部"], ["day", "最近一天收的", "24 小时内收藏、还没写为什么的"], ["old", "更早的", "收了一天以上还没写的"]]
    : v.kind === "make" ? [["", "全部", "还没过期的，快到期的在最上面"], ...DOW.map((w) => [w.key, w.label, `${w.what}，比如${w.example}`]), ["over", "过期了", "过了期还没做的"], ["dropped", "不做了", "你决定不做的，每条写了原因"]] : null;
  if (!defs || st.q){ tabs.hidden = true; tabs.innerHTML = ""; return; } // 搜索时在全部收藏里找，这一栏的标签先收起来
  tabs.hidden = false; tabs.classList.toggle("many", defs.length > 7);
  tabs.innerHTML = defs.map(([k, name, why]) => `<button class="tab ${(v.minor || "") === k ? "on" : ""}" data-minor="${esc(k)}" ${why ? `title="${esc(why)}"` : ""} role="tab"><span>${esc(name)}</span></button>`).join("");
}
// ---------- 推文卡片：做好一次就留着，切换时只是挪位置、显示隐藏，图片不重新加载 ----------
const cards = new Map();
const mostlyChinese = (t) => { const s = String(t).replace(/https?:\/\/\S+/g, ""); const zh = (s.match(/[\u4e00-\u9fff]/g) || []).length; return zh >= 10 || zh / Math.max(1, s.replace(/\s/g, "").length) > 0.3; };
function tweetHtml(it){
  const c = cls(it), note = noteOf(it).trim(), L = reviewOf(it.id);
  const name = it.author || it.handle || "未知作者", handle = (it.handle || "").replace(/^@+/, ""), status = statusOf(it), views = it.metrics?.views || 0;
  const [shown, long] = shortText(it.text || ""), full = st.expanded.has(it.id);
  let h = `<div class="meta"><span class="nm">${esc(name)}</span>${handle ? `<span class="hd">@${esc(handle)}</span>` : ""}<span class="sep">·</span><a class="tm" href="${esc(it.url)}" target="_blank" rel="noopener" style="color:inherit" title="${esc(timeTip(it))}">${pubLabel(it)}</a><span class="sep">·</span><span class="sv" title="${esc(timeTip(it))}">${savedLabel(it)}</span>${views >= 500000 ? `<span class="fl">· 爆款</span>` : ""}${HOT[it.id] ? `<span class="hotb">· 流量爆帖</span>` : ""}${c?.noText ? `<span class="fl">· 正文没抓到</span>` : ""}<span class="more"><button class="icbtn" data-act="menu" data-id="${it.id}" data-tip="更多" aria-label="更多">${ic("dots", 18.75)}</button></span></div>`;
  if (!c) h += `<div class="ai">${ic("sparkles", 15)}<span>还没分类</span><span>·</span>${CLASSIFY.running ? `<span>AI 正在分…</span>` : `<a href="#" data-act="judge" class="dt">让 AI 分一下</a>`}</div>`;
  else {
    const tags = c.tags.map(([a, b]) => `<button class="tg" data-major="${esc(a)}" data-minor="${esc(b)}">${esc(b)}</button>`).join(`<span class="dot">·</span>`);
    const more = c.readout || c.statusNote || c.keywords?.length;
    h += `<div class="tagline">${makeable(it) ? makePill(it) : ""}<span class="tgs">${tags || `<span class="none">没分进标签</span>`}</span><button class="dt" data-act="edit" data-id="${it.id}" title="${c.edited ? "你改过分类" : "分得不对就直接改"}">${c.edited ? "你改过" : "改"}</button>${more ? `<button class="dt" data-act="ai" data-id="${it.id}">${st.aiOpen.has(it.id) ? "收起" : "详情"}</button>` : ""}</div>`;
    if (c.about && !mostlyChinese(it.text || it.articleTitle || "")) h += `<div class="about">${ic("sparkles", 15)}<span>讲的是：${esc(c.about)}</span></div>`; // 英文帖先用一句中文说讲什么
    if (st.aiOpen.has(it.id)) h += `<div class="ai-more">${c.about ? `<div>讲的是：${esc(c.about)}</div>` : ""}${c.readout ? `<div>还读出：${esc(c.readout)}</div>` : ""}${c.statusNote ? `<div>处理建议：${esc(c.status)} · ${esc(c.statusNote)}</div>` : ""}${c.keywords?.length ? `<div>关键词：${c.keywords.map((k) => `<button class="kw" data-kw="${esc(k)}">${esc(k)}</button>`).join("、")}</div>` : ""}</div>`;
  }
  if (topicsOf(it).length) h += `<div class="verdict topic">${ic("article", 15)}<span>${topicsOf(it).map((t) => `列在 <b>${esc(t.t)}</b> ${esc(t.title)}${t.status ? `（${esc(t.status)}）` : ""}`).join("；")}<span class="sub"> · 什么时候做看选题总览</span></span></div>`;
  if (working(it)){ const w = workOf(it); h += `<div class="verdict topic work">${ic("rocket", 15)}<span><b>正在做</b> · ${esc(timeLabel(w.startedAt, ""))}，${esc(workHow(w))}${ON_MAC ? `<button class="dt" data-act="unwork" data-id="${it.id}">不算开工</button>` : ""}</span></div>`; }
  h += hotHtml(it);
  if (!note) h += `<div class="ctx"><button class="wnote" data-act="note-open" data-id="${it.id}">${ic("pencil", 16, {bold:true})}${side.drafts["note" + it.id] ? "接着写备注" : "写备注"}</button><span>${side.drafts["note" + it.id] ? "有没写完的草稿" : "还没写备注"}${c ? "，AI 先按推文内容分的类" : ""}</span></div>`;
  if ((it.text || "").trim()) h += `<div class="txt">${linkify(full ? it.text : shown)}${long ? ` <button class="show-more" data-act="more" data-id="${it.id}">${full ? "收起" : "显示更多"}</button>` : ""}</div>`;
  h += mediaHtml(it);
  const q = it.quoted;
  if (q && (q.text || q.articleTitle)) h += `<div class="card"${q.url ? ` data-href="${esc(q.url)}" title="打开被引用的原帖"` : ""}><div class="card-in"><div class="qh">${avatar(q.author, q.handle, 20)}<b>${esc(q.author)}</b><span>@${esc(q.handle)}</span></div>${q.articleTitle ? `<div class="ttl">${esc(q.articleTitle)}</div>` : ""}${q.text ? `<div class="qt">${linkify(q.text)}</div>` : ""}</div></div>`;
  if (it.isArticle && it.articleTitle) h += `<div class="card" data-href="${esc(it.articleUrl || it.url)}" title="打开这篇 X 文章"><div class="card-in"><div class="kind">${ic("article", 15)}X 文章</div><div class="ttl">${esc(it.articleTitle)}</div>${it.articleBody ? `<div class="sm">${esc(it.articleBody)}</div>` : ""}</div></div>`;
  if (note) h += `<div class="card note"><div class="card-in"><div class="qh">${avatar(ME.name, ME.handle, 20)}<b>${ME.name}</b><span>${ME.handle ? "@" + ME.handle + " · " : ""}${it.noteFrom === "waiting" ? "刚写的，等进书签库" : it.noteFrom === "relay" ? "刚写的，等 Mac 写进书签库" : "收藏时写的"}${it.noteAt ? " · " + relTime(it.noteAt) : ""}</span><button class="dt note-edit" data-act="note-open" data-id="${it.id}">改</button></div><div class="qt">${esc(note)}</div></div></div>`;
  if (L.verdict === "bad") h += `<div class="verdict">${ic("message", 15)}<span>你标了<b>不准</b>：${esc(L.fix || "")}<span class="sub"> · ${INTENT[it.id] && L.fixAt && INTENT[it.id].at > L.fixAt ? "AI 已按你这句重分了" : "AI 正按你这句重分"}</span></span></div>`;
  if (L.decision) h += `<div class="verdict">${ic(L.decision === "drop" ? "ban" : "calendar-plus", 15)}<span>${L.decision === "drop" ? "你决定<b>不做了</b>" : `你<b>延期</b>了${L.delays > 1 ? `（第 ${L.delays} 次）` : ""}`}：${esc(L.decisionNote)}${L.decidedAt ? `<span class="sub"> · ${esc(timeLabel(L.decidedAt, ""))}</span>` : ""}</span></div>`;
  const sIc = STATUSES.find((s) => s[0] === status)[1], sOn = Boolean(L.status); // 你自己选过的状态才亮
  h += `<div class="acts"><div class="grp">
    <button class="act good ${L.verdict === "good" ? "on" : ""}" data-act="good" data-id="${it.id}" ${c ? "" : "disabled"} data-tip="${L.verdict === "good" ? "取消" : "判断准确"}"><span class="icbtn">${ic("circle-check", 18.75, {fill: L.verdict === "good"})}</span><span class="n">${L.verdict === "good" ? "准确" : "准"}</span></button>
    <button class="act bad ${L.verdict === "bad" ? "on" : ""}" data-act="bad" data-id="${it.id}" ${c ? "" : "disabled"} data-tip="判断得不准，写一句错在哪"><span class="icbtn">${ic("message", 18.75, {fill: L.verdict === "bad"})}</span><span class="n">不准</span></button>
    <button class="act st ${sOn ? "on" : ""}" data-act="menu" data-id="${it.id}" data-tip="改状态"><span class="icbtn">${ic(sIc, 18.75, {fill: sOn})}</span><span class="n">${status}</span></button>
    ${views ? `<span class="act views" data-tip="浏览量"><span class="icbtn">${ic("chart-bar", 18.75)}</span><span class="n">${fmtNum(views)}</span></span>` : `<span class="act"></span>`}
  </div><div class="end">
    ${ON_MAC ? `<button class="act go" data-act="go" data-id="${it.id}" data-tip="开一个 AI 新对话，开场白从你的备注出发"><span class="icbtn">${ic("rocket", 18.75)}</span><span class="n">马上做</span></button>` : ""}
    <a class="act" href="${esc(it.url)}" target="_blank" rel="noopener" data-tip="打开原帖" style="text-decoration:none"><span class="icbtn">${ic("external-link", 18.75)}</span></a>
  </div></div>`;
  return `<div class="tw-av">${avatar(name, handle)}</div><div class="tw-main">${h}</div>`;
}
// 卡片上的蓝色标签：可做成什么 · 多久内做 · 还剩多久；点它改档
function makePill(it){
  const c = cls(it), w = tierOf(it), L = reviewOf(it.id), due = L.decision === "drop" ? null : dueAt(it), left = due === null ? 0 : due - NOW;
  if (L.decision === "drop") return `<button class="vd" data-act="menu" data-id="${it.id}" data-tip="要重新做，点这里选「还是要做」">${ic("player-play", 13, {fill:true})}<span>${c?.video.length ? `可做成${c.video.map(esc).join("、")}` : "可做成视频"}<span class="due over"> · 不做了</span></span></button>`;
  if (L.decision === "delay" && due !== null) return `<button class="vd" data-act="within" data-id="${it.id}" data-tip="改多久内做">${ic("player-play", 13, {fill:true})}<span>${c?.video.length ? `可做成${c.video.map(esc).join("、")}` : "可做成视频"} · 延期到 ${monthDay(due)}<span class="due${left <= 0 ? " over" : left < 24 * 3600e3 ? " soon" : ""}"> · ${leftLabel(left)}</span></span></button>`;
  const why = working(it) ? "（正在做）" : topicsOf(it).length ? "（看选题卡）" : w && guessed(it) ? "（AI 猜的）" : "";
  const tip = working(it) ? "已经开工，不倒计时；点这里改多久内做" : topicsOf(it).length ? "已经用进选题卡，什么时候做看选题总览，这里不倒计时；点这里改多久内做" : w && guessed(it) ? "没写备注，这一档是 AI 按推文猜的，不倒计时；写了备注或点这里自己定档才开始算" : "改多久内做";
  return `<button class="vd" data-act="within" data-id="${it.id}" data-tip="${tip}">${ic("player-play", 13, {fill:true})}<span>${c?.video.length ? `可做成${c.video.map(esc).join("、")}` : "可做成视频"}${w ? ` · ${esc(w.label)}${why}` : ""}${due !== null ? `<span class="due${left <= 0 ? " over" : left < 24 * 3600e3 ? " soon" : ""}"> · ${leftLabel(left)}</span>` : ""}</span></button>`;
}
function cardFor(it){
  let el = cards.get(it.id);
  if (!el){ el = document.createElement("article"); el.className = "tw"; el.dataset.id = it.id; el.innerHTML = tweetHtml(it); wireVideos(el); cards.set(it.id, el); }
  return el;
}
function redraw(id){
  const it = ITEMS.find((x) => x.id === id), el = cards.get(id); if (!it || !el) return;
  const old = el.querySelector(".media"); el.innerHTML = tweetHtml(it);
  const neu = el.querySelector(".media"); if (old && neu && old.dataset.key === neu.dataset.key) neu.replaceWith(old);
  wireVideos(el); pickVideo(); // 挪回来的视频要是被浏览器停了，接着播
}
// 最近收藏的在前：按收藏的时刻（X 书签列表的排序号算出来的；没有的用进书签库的时间）
function newerFirst(a, b){ return (Date.parse(savedAt(b) || 0) || 0) - (Date.parse(savedAt(a) || 0) || 0); }
// ---------- 流量爆帖：为什么算、现在还涨不涨、大家在干什么 ----------
function fmtW(n){ n = Math.round(n || 0); return n >= 1e8 ? `${(n / 1e8).toFixed(1).replace(/\.0$/, "")} 亿` : n >= 1e4 ? `${(n / 1e4).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "")} 万` : n.toLocaleString("en-US"); }
const fmtPct = (x) => { const v = x * 100; return v >= 10 ? `${Math.round(v)}%` : `${v.toFixed(1).replace(/\.0$/, "")}%`; };
const fmtAge = (h) => h < 48 ? `${Math.max(1, Math.round(h))} 小时` : `${Math.round(h / 24)} 天`;
function hotWhy(h){
  const lang = h.zh ? "中文帖" : "英文帖";
  if (h.rule === "revival" && h.revival) return `老帖又火了：发出 ${fmtAge(h.revival.ageHours)}后，${Math.round(h.revival.hours)} 小时里又涨了 ${fmtW(h.revival.views - h.revival.baseViews)}（+${fmtPct(h.revival.views / h.revival.baseViews - 1)}）`;
  if (h.firstRule === "day") return `发出 ${fmtAge(h.firstAgeHours)}就有 ${fmtW(h.firstViews)} 浏览，过了${lang} 24 小时 ${fmtW(h.threshold)} 的线`;
  if (h.firstRule === "threeDays") return `发出 ${fmtAge(h.firstAgeHours)}就有 ${fmtW(h.firstViews)} 浏览，过了${lang} 72 小时 ${fmtW(h.threshold)} 的线`;
  if (h.firstRule === "week") return `发出 ${fmtAge(h.firstAgeHours)}，浏览就破了 100 万（${fmtW(h.firstViews)}）`;
  return "";
}
function hotNow(h){
  const g = h.growth;
  if (!g) return "下次同步后能看出它还涨不涨";
  if (g.delta <= 0 || (g.pct !== null && g.pct < 0.01)) return `最近 ${Math.round(g.hours)} 小时基本没涨，热度已经过去了`;
  return `最近 ${Math.round(g.hours)} 小时又涨了 ${fmtW(g.delta)}${g.pct !== null ? `（+${fmtPct(g.pct)}）` : ""}，每小时约 ${fmtW(g.perHour)}`;
}
const HOT_HINT = { discuss: (r) => `回复和引用特别多（是点赞的 ${fmtPct(r)}），大家在讨论`, save: (r) => `收藏特别多（是点赞的 ${r.toFixed(1)} 倍），大家存着准备照着做` };
function hotHtml(it){
  const h = HOT[it.id]; if (!h) return "";
  const hints = (h.hints || []).map((x) => HOT_HINT[x.kind]?.(x.ratio)).filter(Boolean);
  return `<div class="hotbox"><div class="hl">${ic("flame", 15, {fill:true})}<span>${esc(hotWhy(h))}</span></div><div class="hl sub">${ic("chart-bar", 15)}<span>${esc(hotNow(h))}${hints.length ? `；${esc(hints.join("；"))}` : ""}</span></div></div>`;
}
function hotNoteHtml(){
  const r = HOT_RULES; if (!r) return "";
  return `<div class="hotnote"><b>怎么算流量爆帖：</b>发出 24 小时内浏览过 ${fmtW(r.zh.day)}（英文帖 ${fmtW(r.en.day)}），或 72 小时内过 ${fmtW(r.zh.threeDays)}（英文帖 ${fmtW(r.en.threeDays)}），或 7 天内破 ${fmtW(r.week)}，或发出 ${r.revival.minAgeHours / 24} 天以上的老帖一天内又涨 ${fmtPct(r.revival.pct)} 以上、至少多 ${fmtW(r.revival.min)}。数字每天随同步更新三次，最近火的排在最上面。</div>`;
}
// 可做成视频：快到期的在最上面，「随时能做」和没定档的排在后面（按最近收藏）；「过期了」里最近过期的在最上面
function makeOrder(a, b){
  if (st.view.minor === "dropped") return (Date.parse(reviewOf(b.id).decidedAt || 0) || 0) - (Date.parse(reviewOf(a.id).decidedAt || 0) || 0); // 最近决定不做的在上面
  const da = dueAt(a), db = dueAt(b);
  if (da !== null && db !== null) return st.view.minor === "over" ? db - da : da - db;
  return da !== null ? -1 : db !== null ? 1 : newerFirst(a, b);
}
function renderFeed(){
  const hotView = st.view.kind === "hot", makeView = st.view.kind === "make", workView = st.view.kind === "work";
  const list = ITEMS.filter(matches).sort(hotView ? ((a, b) => Date.parse(HOT[b.id].flaggedAt) - Date.parse(HOT[a.id].flaggedAt)) : makeView ? makeOrder : workView ? ((a, b) => Date.parse(workOf(b).startedAt) - Date.parse(workOf(a).startedAt)) : newerFirst); // 平时和 X 书签页一样最近收藏的在上面；流量爆帖按最近火的在上面
  $("#feed").classList.toggle("hotview", hotView);
  const feed = $("#feed");
  feed.querySelector(".empty")?.remove();
  const keep = new Set(list.map((it) => it.id));
  for (const el of [...feed.children]) if (!keep.has(el.dataset.id)) el.remove();
  let prev = null;
  for (const it of list){ const el = cardFor(it); const want = prev ? prev.nextSibling : feed.firstChild; if (el !== want) feed.insertBefore(el, want); prev = el; }
  if (!list.length) feed.insertAdjacentHTML("beforeend", hotView ? `<div class="empty"><b>现在还没有流量爆帖</b><span>你收藏的帖子里，有冲得快的或者老帖又火起来的，会出现在这里。</span></div>`
    : makeView && st.view.minor === "dropped" ? `<div class="empty"><b>还没有决定不做的</b><span>讨论完觉得不做了，在卡片右上角「更多」里点「不做了」，写一句为什么，就会放到这里。</span></div>`
    : makeView && st.view.minor === "over" ? `<div class="empty"><b>没有过期的</b><span>能做成视频的收藏过了期还没做，会放在这里。</span></div>`
    : workView ? `<div class="empty"><b>现在没有正在做的</b><span>在卡片上点「马上做」开工，或者把帖子链接贴进 Claude、Codex 的对话，这条就会放到这里（贴链接的一分钟内出现）。</span></div>`
    : makeView ? `<div class="empty"><b>这一档现在没有要做的</b><span>AI 判成能做成视频的收藏，按多久内做分在这里。觉得分得不对，点卡片上蓝色的「可做成…」就能改。</span></div>`
    : `<div class="empty"><b>这里还没有收藏</b><span>换个小类、换个状态，或者取消右边「可做成视频」的筛选看看。</span></div>`);
  feed.querySelector(".hotnote")?.remove();
  if (hotView) feed.insertAdjacentHTML("afterbegin", hotNoteHtml());
  feed.querySelector(".searchnote")?.remove();
  if (st.q) feed.insertAdjacentHTML("afterbegin", `<div class="searchnote">${ic("search", 16)}<span>在全部收藏里找「${esc(st.q)}」：${list.length} 条</span><button class="dt" data-act="clear-q">清空</button></div>`);
}
function renderRight(){
  $("#videos").innerHTML = VIDEOS.map(([x, icon]) => { const n = ITEMS.filter((it) => live(it) && cls(it)?.video.includes(x)).length, on = st.videos.has(x);
    return `<div class="row"><span class="ci">${ic(icon, 20)}</span><span class="t"><b>${x}</b><span class="sub">${n} 条收藏可以做</span></span><button class="pill ${on ? "line" : "dark"}" data-video="${x}">${on ? `<span class="a">已筛选</span><span class="b">取消</span>` : "只看这类"}</button></div>`; }).join("");
  const rows = [["today","今天 · 进来",ITEMS.filter(isToday).length],["make","快到期 · 一天内要做",dueSoonCount()],["nonote","待处理 · 没写备注",ITEMS.filter((it) => !noteOf(it).trim()).length],["pending","待处理 · 未分类",pendingCount()]];
  $("#today").innerHTML = rows.map(([k, s, n]) => `<button class="row" data-nav="v:${k}"><span class="t"><small>${s}</small><b>${n} 条收藏</b></span></button>`).join("");
  const freq = {}; for (const it of ITEMS) if (live(it)) for (const k of (cls(it)?.keywords || [])) freq[k] = (freq[k] || 0) + 1;
  $("#kws").innerHTML = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `<button class="row" data-kw="${esc(k)}"><span class="t"><small>关键词 · ${n} 条收藏</small><b>${esc(k)}</b></span></button>`).join("");
}
// 右栏比屏幕高时，照 X 的做法：页面往下滑，右栏先跟着走，底部露出来以后再停住；搜索框一直留在顶上
function fitRight(){ const el = $(".right-in"); if (!el) return; el.style.top = Math.min(0, window.innerHeight - el.offsetHeight) + "px"; }
function render({ top = false } = {}){ if (st.view.kind === "hot") markHotSeen();
  const h = hashFor(st.view); if (h !== location.hash) history.replaceState(null, "", h || location.pathname + location.search); updateNav(); renderHead(); renderFeed(); renderRight(); fitRight(); if (top) window.scrollTo({top:0}); sidePlace(); }
function go(view){ st.view = view; closeMenu(); render({top:true}); }

// ---------- 补备注、写哪里不准：在这条帖子右边弹小框（和插件里的备注框一个样），写的时候原帖一直看得见 ----------
// 小框顶端对齐这条帖子，页面滑动时跟着帖子走，碰到屏幕上下边就停住；右栏不显示的窄屏上放右下角
// 只有回车或点「保存」才算保存；按 Esc、点 × 只是收起，写了的字留作草稿，再点这条接着写
const side = { id:null, kind:null, drafts:{}, delayTo:null, delayDrafts:{} };
// 延期：从现在起延多久。只给比现在的到期更晚的选项（延期不能把到期提前），下面写清延到哪天、原来哪天到期；
// 默认和现在这一档一样长，收起再打开时用上次选的
function delayChoices(it){
  const cur = dropped(it) ? null : dueAt(it), now = Date.now();
  return { cur, list: DOW.filter((w) => w.hours && (cur === null || cur <= now || now + w.hours * 3600e3 > cur)) };
}
function delayOpts(){
  const it = ITEMS.find((x) => x.id === side.id); if (!it) return;
  const { cur, list } = delayChoices(it), now = Date.now();
  if (!list.some((w) => w.key === side.delayTo)) side.delayTo = list[0]?.key || null;
  const to = list.find((w) => w.key === side.delayTo);
  $("#sideOpts").innerHTML = `<span>从现在起延</span>${list.map((w) => `<button class="${side.delayTo === w.key ? "on" : ""}" data-act="delay-to" data-w="${w.key}">${esc(w.label.replace(/内做$/, ""))}</button>`).join("")}` +
    (to ? `<span class="to">延到 ${monthDay(now + to.hours * 3600e3)}${cur === null ? "" : cur > now ? `，原来 ${monthDay(cur)} 到期` : `，原来 ${monthDay(cur)} 就过期了`}</span>` : "");
}
function sideOpen(id, kind){
  const it = ITEMS.find((x) => x.id === id); if (!it) return;
  if (side.id) sideClose();
  const c = cls(it), name = it.author || it.handle || "未知作者", handle = (it.handle || "").replace(/^@+/, "");
  const excerpt = (it.text || it.articleTitle || "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  const t = $("#sideText");
  if (kind === "note"){
    $("#sideTitle").textContent = noteOf(it).trim() ? "改备注" : "写一句为什么收藏";
    $("#sideRef").innerHTML = `<b>${esc(name)}</b>${handle ? ` @${esc(handle)}` : ""}${excerpt ? ` · ${esc(excerpt)}` : ""}`;
    t.placeholder = "为什么存？打算怎么用？"; t.value = side.drafts[kind + id] ?? noteOf(it);
  } else if (kind === "drop" || kind === "delay"){
    const w = tierOf(it), due = dueAt(it);
    $("#sideTitle").textContent = kind === "drop" ? "为什么不做了" : "为什么延期";
    $("#sideRef").innerHTML = `${w ? `现在是「${esc(w.label)}」${due !== null && !dropped(it) ? `，${leftLabel(due - NOW)}` : ""} · ` : ""}<b>${esc(name)}</b>${excerpt ? ` · ${esc(excerpt)}` : ""}`; // 多久内做放最前面，两行放不下时被截的是原文
    t.placeholder = kind === "drop" ? "写下你的判断：比如热度过了、别人已经做烂了、和我的定位不搭" : "写下你的判断：比如等官方教程出来、这周先做别的";
    t.value = side.drafts[kind + id] ?? "";
    if (kind === "delay") side.delayTo = side.delayDrafts[id] || (w?.hours ? w.key : "3d");
  } else {
    $("#sideTitle").textContent = "哪里判断得不准";
    $("#sideRef").innerHTML = `AI 分类到 <b>${esc(c?.tags.map(([, b]) => b).join("、") || "没分进标签")}</b>${c?.video.length ? ` · 可做成${c.video.map(esc).join("、")}` : ""}${c?.doWithin ? ` · ${esc(DOW.find((w) => w.key === c.doWithin)?.label || "")}` : ""}`;
    t.placeholder = "比如：这条我存它是因为讲法好，应该是口播参考"; t.value = side.drafts[kind + id] ?? reviewOf(id).fix ?? "";
  }
  side.id = id; side.kind = kind; $("#sideMsg").textContent = ""; $("#sideOpts").hidden = kind !== "delay";
  if (kind === "delay") delayOpts(); // 要先记下是哪条，才算得出能延到哪几档
  cards.get(id)?.classList.add("editing");
  $("#side").hidden = false; sidePlace();
  t.focus(); t.setSelectionRange(t.value.length, t.value.length);
}
function sideClose(){
  if (!side.id) return;
  const id = side.id, key = side.kind + id, v = $("#sideText").value, was = side.kind === "fix" ? (reviewOf(id).fix || "") : "";
  if (side.kind === "delay") side.delayDrafts[id] = side.delayTo; // 选的时长和写了一半的字一起留着
  if (v.trim() && v.trim() !== was) side.drafts[key] = v; else delete side.drafts[key];
  side.id = side.kind = null; $("#side").hidden = true; $("#sideText").value = "";
  cards.get(id)?.classList.remove("editing"); redraw(id);
}
// 保存：存进书签库成功才收起；没存上，字留在框里，说清楚原因
let saving = false;
async function sideSave(){
  const id = side.id, kind = side.kind, v = $("#sideText").value.trim(); if (!id || saving) return;
  if (!v){ $("#sideMsg").textContent = kind === "note" ? "先写一句" : kind === "drop" ? "写一句为什么不做了，以后回头看得懂" : kind === "delay" ? "写一句为什么延期" : "写一句错在哪，AI 才学得会"; $("#sideText").focus(); return; }
  const it = ITEMS.find((x) => x.id === id);
  saving = true; $("#sideSave").disabled = true; $("#sideText").readOnly = true;
  let saved = null;
  try {
    if (kind === "note"){
      // 和插件备注框走同一个入口：备注存进插件，再写进这条收藏的文件
      saved = await api("/api/bookmark-notes", { entry: "web", uid: newUid(), tweetId: id, note: v, notedAt: new Date().toISOString(), url: it.url, author: it.author, excerpt: (it.text || "").slice(0, 200) });
      it.note = v; it.noteAt = new Date().toISOString(); it.noteFrom = saved.relay ? "relay" : "library";
      delete INTENT[id]; // 备注变了，AI 按新备注重新分
    } else if (kind === "drop" || kind === "delay"){
      REVIEW[id] = (await api("/api/shoucang/review", { id, decision: kind, decisionNote: v, ...(kind === "delay" ? { doWithin: side.delayTo } : {}) })).review;
    } else {
      REVIEW[id] = (await api("/api/shoucang/review", { id, verdict: "bad", fix: v })).review;
    }
  } catch (error) {
    $("#sideMsg").textContent = `没存上：${error.message}。字还在框里，稍后再按回车`;
    return;
  } finally { saving = false; $("#sideSave").disabled = false; $("#sideText").readOnly = false; }
  delete side.drafts[kind + id]; $("#sideText").value = "";
  sideClose(); delete side.delayDrafts[id];
  if (kind === "note"){
    toast(saved?.relay ? saved.message : "备注存好了，AI 会按这句备注重新分类");
    // 写完这条留在原地不跳走；只有它不该再出现在这一页（比如在「没写备注」里）才拿掉
    if (!matches(it)) renderFeed(); updateNav(); renderRight(); fitRight();
    if (!saved?.relay) startClassify({ quiet: true });
  } else if (kind === "drop" || kind === "delay"){
    toast(kind === "drop" ? "记下了，放进了「不做了」" : `记下了：延期到 ${monthDay(dueAt(it))}`);
    render(); // 不做了的从这一栏拿走；延期的按新的到期时间挪位置
  } else { cards.get(id)?.querySelector(".act.bad")?.classList.add("burst"); toast("记下了：AI 马上按你这句重分这一条，以后分别的收藏也会参考"); }
}
function sidePlace(){
  if (!side.id) return;
  const el = $("#side"), card = cards.get(side.id);
  if (!card?.isConnected){ sideClose(); return; } // 换了一页，这条不在了
  const right = $(".right");
  if (getComputedStyle(right).display === "none"){
    el.style.cssText = window.innerWidth <= 700 ? "left:8px;right:8px;top:8px;width:auto" : "right:16px;bottom:16px;width:min(348px,calc(100vw - 24px))";
    return;
  } // 手机宽度下让开底部导航
  const r = right.getBoundingClientRect(), top = Math.max(66, Math.min(card.getBoundingClientRect().top, window.innerHeight - el.offsetHeight - 16));
  el.style.cssText = `left:${r.left}px;top:${top}px;width:${r.width}px`;
}
let placeQueued = false;
function sideFollow(){ if (!side.id || placeQueued) return; placeQueued = true; requestAnimationFrame(() => { placeQueued = false; sidePlace(); }); }
window.addEventListener("scroll", sideFollow, { passive:true });
new ResizeObserver(sideFollow).observe(document.getElementById("feed")); // 上面的图片加载完把帖子往下推时，小框也跟着挪

let menuEl = null;
function closeMenu(){ menuEl?.remove(); menuEl = null; st.popId = null; }
function openMenu(anchor, html, key, extra){
  closeMenu(); menuEl = document.createElement("div"); menuEl.className = "menu" + (extra ? " " + extra : ""); menuEl.innerHTML = html; document.body.appendChild(menuEl); st.popId = key;
  const r = anchor.getBoundingClientRect(), m = menuEl.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
  let left = r.right - m.width; if (left < 8) left = 8; if (left + m.width > vw - 8) left = vw - m.width - 8;
  let top = r.top; if (top + m.height > vh - 8) top = Math.max(8, r.bottom - m.height);
  menuEl.style.left = left + window.scrollX + "px"; menuEl.style.top = top + window.scrollY + "px";
}
const statusMenu = (id) => { const it = ITEMS.find((x) => x.id === id), cur = statusOf(it), w = tierOf(it);
  return STATUSES.map(([s, icon, d]) => `<button class="${s === cur ? "cur" : ""}" data-act="status" data-s="${s}" data-id="${id}">${ic(icon, 18.75, {fill: s === cur})}<span>${s}<small>${d}</small></span></button>`).join("") +
    (cls(it) ? `<div class="sep"></div><button data-act="within" data-id="${id}">${ic("clock", 18.75)}<span>多久内做<small>${w ? `现在是「${esc(w.label)}」${reviewOf(id).doWithin ? "，你改的" : "，AI 定的"}` : "还没定：定了就会出现在「可做成视频」里"}</small></span></button>` : "") +
    `<button data-act="edit" data-id="${id}">${ic("tags", 18.75)}<span>改分类<small>标签和可做成什么，改了马上生效，AI 以后也照着学</small></span></button>` +
    (cls(it) && makeable(it) ? decideRows(id) : "") +
    `<div class="sep"></div><button data-act="open" data-id="${id}">${ic("external-link", 18.75)}<span>打开原帖</span></button><button data-act="copy" data-id="${id}">${ic("link", 18.75)}<span>复制链接</span></button>`; };
// 改分类：可做成什么、标签，点一下就改，菜单不收起，接着点别的
const editMenu = (id) => { const it = ITEMS.find((x) => x.id === id), c = cls(it) || { tags: [], video: [] }, L = reviewOf(id);
  const on = new Set(c.tags.map(([, b]) => b)), vids = new Set(c.video || []);
  const row = (act, attr, name, isOn, tip) => `<button class="${isOn ? "cur" : ""}" data-act="${act}" ${attr} data-id="${id}"${tip ? ` title="${esc(tip)}"` : ""}>${ic(isOn ? "circle-check" : "circle-plus", 18.75, {fill: isOn})}<span>${esc(name)}</span></button>`;
  return `<div class="mh">可做成视频${L.video ? " · 你改过" : ""}</div>` + VIDEOS.map(([x]) => row("edit-video", `data-v="${x}"`, x, vids.has(x))).join("") +
    TAXO.map((g) => `<div class="sep"></div><div class="mh">${esc(g.major)}${L.tags ? "" : ""}</div>` + g.minors.map((m) => row("edit-tag", `data-m="${esc(m.name)}"`, m.name, on.has(m.name), m.why)).join("")).join("") +
    (L.tags || L.video ? `<div class="sep"></div><button data-act="edit-reset" data-id="${id}">${ic("sparkles", 18.75)}<span>改回按 AI 分的</span></button>` : ""); };
function editPatch(id, patch, msg){
  quickReview(id, patch, null, msg).then(() => { if (menuEl && st.popId === "e" + id) menuEl.innerHTML = editMenu(id); });
  if (menuEl && st.popId === "e" + id) menuEl.innerHTML = editMenu(id);
}
// 马上做：选用哪个客户端开工；已经开了工的，可以再开一个，或者说这次不算
const goMenu = (id) => { const it = ITEMS.find((x) => x.id === id), w = working(it) ? workOf(it) : null;
  return `<div class="mh">${w ? `已经在做：${esc(timeLabel(w.startedAt, ""))}，${esc(workHow(w))}。要再开一个新对话：` : "开一个新的 AI 对话，开场白从你的备注出发，你看过再发"}</div>` +
    Object.entries(TOOL_NAMES).map(([k, name]) => `<button data-act="go-tool" data-tool="${k}" data-id="${id}">${ic("rocket", 18.75)}<span>用 ${name} 开工<small>${k === "claude" ? "Claude 桌面端的 Claude Code" : "Codex 桌面端"}，模型用你在里面选的</small></span></button>`).join("") +
    `<button data-act="go-copy" data-id="${id}">${ic("link", 18.75)}<span>复制开场白<small>没装桌面端，或者想用别的 AI：复制下来自己贴</small></span></button>` +
    (noteOf(it).trim() ? "" : `<div class="mh">这条还没写备注，AI 只能按帖子内容猜你想干什么</div>`) +
    (w ? `<div class="sep"></div><button data-act="unwork" data-id="${id}">${ic("x", 18.75)}<span>不算开工<small>记错了：从「正在做」里拿走</small></span></button>` : ""); };
// 可做成视频的这条，讨论完改了主意：延期、不做了，都要写原因（和写备注一样在旁边弹框）
function decideRows(id){
  const L = reviewOf(id);
  return (tierOf(ITEMS.find((x) => x.id === id))?.hours ? `<button data-act="delay" data-id="${id}">${ic("calendar-plus", 18.75)}<span>延期<small>${L.decision === "delay" ? `已经延期${L.delays > 1 ? ` ${L.delays} 次` : "过"}，可以再延：写一句为什么` : "写一句为什么，再选延到多久"}</small></span></button>` : "") +
    (L.decision === "drop" ? `<button data-act="undrop" data-id="${id}">${ic("player-play", 18.75)}<span>还是要做<small>撤回「不做了」，回到可做成视频里</small></span></button>`
      : `<button data-act="drop" data-id="${id}">${ic("ban", 18.75)}<span>不做了<small>写一句为什么，从可做成视频里拿走</small></span></button>`);
}
// 改多久内做：五档，写清每档放什么；你改过的可以改回按 AI 定的
const withinMenu = (id) => { const it = ITEMS.find((x) => x.id === id), cur = withinOf(it), ai = cls(it)?.doWithin || "";
  const L = reviewOf(id);
  return `<div class="mh">多久内做 · ${L.decision === "delay" && L.decidedAt ? `从你 ${monthDay(Date.parse(L.decidedAt))} 延期那一刻算` : "从你收藏那一刻算"}</div>` + DOW.map((w) => `<button class="${w.key === cur ? "cur" : ""}" data-act="set-within" data-w="${w.key}" data-id="${id}">${ic("clock", 18.75, {fill: w.key === cur})}<span>${esc(w.label)}<small>${esc(w.what)}</small></span></button>`).join("") +
    (reviewOf(id).doWithin ? `<div class="sep"></div><button data-act="set-within" data-w="" data-id="${id}">${ic("sparkles", 18.75)}<span>改回按 AI 定的<small>${ai ? `AI 定的是「${esc(DOW.find((w) => w.key === ai)?.label || "")}」` : "AI 判的是做不成视频"}</small></span></button>` : ""); };
const filterMenu = () => [["全部","bookmarks","除了丢掉的都显示"], ...STATUSES].map(([s, icon, d]) => `<button class="${st.status === s ? "cur" : ""}" data-act="set-status" data-s="${s}">${ic(icon, 18.75, {fill: st.status === s})}<span>${s === "全部" ? "全部状态" : s}<small>${d}</small></span></button>`).join("");
const viewsMenu = () => VIEWS.map(([k, icon, name]) => `<button data-nav="v:${k}">${ic(icon, 18.75)}<span>${name}</span></button>`).join("") + `<div class="sep"></div>` +
  TAXO.map((g) => `<button data-nav="m:${esc(g.major)}">${ic(MAJOR_IC[g.major] || "tags", 18.75)}<span>${esc(g.major)}<small>${esc(g.when)}</small></span></button>`).join("");
let toastTimer;
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3000); }
// 原来连本机书签服务；插件版问插件后台，接口和返回的数据一样
async function api(path, body){
  if (path === "/api/bookmark-notes/start") return startWork(body);
  let json;
  try { json = await chrome.runtime.sendMessage({ type: "xbn-api", path, body }); }
  catch { throw new Error("插件后台没响应，刷新一下这个页面"); }
  if (!json || json.ok === false) throw new Error(json?.message || json?.error || "插件后台没响应");
  return json;
}
// 「马上做」：带着备注和原文开一个 Claude 或 Codex 新对话（Chrome 会问一句要不要打开）
async function startWork({ tweetId, tool }){
  const r = await chrome.runtime.sendMessage({ type: "xbn-work-prompt", tweetId });
  if (!r?.ok) throw new Error("没拿到这条收藏的内容");
  const a = document.createElement("a");
  a.href = tool === "codex" ? `codex://threads/new?prompt=${encodeURIComponent(r.prompt)}` : `claude://code/new?q=${encodeURIComponent(r.prompt)}`;
  document.body.appendChild(a); a.click(); a.remove();
  return { ok: true };
}
// 头像、配图加载不出来时：头像退回名字第一个字，配图整块去掉
document.addEventListener("error", (e) => { const img = e.target; if (!(img instanceof HTMLImageElement)) return; if (img.closest(".av")) img.remove(); else if (img.closest(".m")) img.closest(".m").remove(); }, true);
const newUid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "");
// 读一遍书签库。已经做好的卡片只在内容变了时重画，不闪
const sigs = new Map();
function cardSig(it){ return JSON.stringify([it, INTENT[it.id] || null, REVIEW[it.id] || null, dueAt(it) === null ? "" : leftLabel(dueAt(it) - NOW), AVATARS[(it.handle || "").toLowerCase()] || "", AVATARS[(it.quoted?.handle || "").toLowerCase()] || "", CLIPS[it.id] || null, HOT[it.id] || null, CLASSIFY.running]); }
async function load({ first = false } = {}){
  const j = await api("/api/shoucang");
  if (first) checkHost();
  NOW = Date.now();
  ITEMS = j.items; REVIEW = j.reviews || {}; TOPIC = j.topicUse || {}; /* 用进了第二大脑哪张选题卡 */ WORK = j.working || {}; /* 开了工的 */ DOW = j.doWithin || []; AVATARS = j.avatars || {}; HOT = j.hot || {}; HOT_RULES = j.hotRules || null; CLIPS = j.videos || {}; /* 视频的 mp4 地址（VIDEOS 是「可做成视频」的三类） */ TAXO = j.taxonomy; SINCE = j.since; SYNC = j.sync || {}; CLASSIFY = j.classify || {};
  /* 中转站上还排着、Mac 还没写进书签库的备注，先叠上去 */ for (const [id, n] of Object.entries(j.relay?.notes || {})){ const it = ITEMS.find((x) => x.id === id); if (it) Object.assign(it, n); }
  MAJOR_OF = Object.fromEntries((j.taxonomy || []).flatMap((g) => g.minors.map((m) => [m.name, g.major])));
  INTENT = Object.fromEntries(Object.entries(j.intents || {}).map(([id, c]) => [id, { ...c, tags: c.tags.map((t) => [t.major, t.minor]) }]));
  if (first) buildNav();
  for (const it of ITEMS){ const sig = cardSig(it); if (cards.has(it.id) && sigs.get(it.id) !== sig) redraw(it.id); sigs.set(it.id, sig); }
  $("#meAv").innerHTML = avatar(ME.name, ME.handle);
  const [y, m, d] = String(SINCE || "").split("-").map(Number);
  $("#scope").textContent = m ? `${m} 月 ${d} 日以后收藏的 ${ITEMS.length} 条` : "";
  const at = Date.parse(SYNC.lastXSuccessAt || ""); $("#dataAt").textContent = at ? `X 同步于 ${relTime(new Date(at).toISOString())}前`.replace("日前", "日") : "";
  RELAY = j.relay || null; renderRelay();
  if (j.pageVersion){ if (!PAGE_VERSION) PAGE_VERSION = j.pageVersion; else if (j.pageVersion !== PAGE_VERSION) $("#newVer").hidden = false; } // 打开以后页面又更新过
  render();
  if (CLASSIFY.running) pollClassify();
}
// 中转站：Mac 超过 3 分钟没来取活，就是睡着了（或断网了），顶上写清楚现在看到的是几点的数据、改动先存着
const macAsleep = () => Boolean(RELAY) && Date.parse(RELAY.now) - (Date.parse(RELAY.macSeenAt || "") || 0) > 3 * 60 * 1000;
function renderRelay(){
  const bar = $("#relayBar"); $("#oldLink").hidden = !ON_MAC;
  bar.hidden = !macAsleep(); if (bar.hidden) return;
  const at = RELAY.pushedAt ? fullTime(RELAY.pushedAt).replace(/^\d+年/, "") : "";
  bar.innerHTML = `<b>Mac 在睡觉</b>，这里是 ${esc(at)} 的收藏。你写的备注、点的准不准先存着${RELAY.pending ? `（现在有 ${RELAY.pending} 件）` : ""}，Mac 醒了自动写进去。`;
}
// 「开始分类」：本机小程序调这台电脑上的 Codex 或 Claude Code 分，一批 8 条；分完自动刷新
let polling = false;
// ---------- 引导装好 AI 分类：没装好时收藏页最上面一直有这张卡片，装好了自动开始分类、卡片消失 ----------
let HOST = null, hostTimer = 0, guideCopied = false;
async function checkHost(){
  try { HOST = await chrome.runtime.sendMessage({ type: "xbn-host-status" }); } catch { HOST = null; }
  renderGuide();
  clearTimeout(hostTimer);
  if (!hostReady()) hostTimer = setTimeout(() => { if (document.visibilityState === "visible") checkHost(); else hostTimer = setTimeout(checkHost, 4000); }, 4000); // 没装好就每 4 秒看一次，装好了自己往下走
  else if (CLASSIFY.running) pollClassify();
}
const hostReady = () => Boolean(HOST?.installed && (HOST.codex || HOST.claude));
function renderGuide(){
  const g = $("#guide");
  if (hostReady()){
    if (!g.hidden && g.dataset.state !== "ok"){ g.dataset.state = "ok"; g.className = "guide ok"; g.innerHTML = `<h3>AI 分类装好了，用 ${HOST.codex ? "Codex" : "Claude Code"}</h3><p>正在给收藏分类，分好的会一条条出现在卡片上。以后新收藏的会自动分好。</p>`; setTimeout(() => { g.hidden = true; }, 8000); load().catch(() => {}); pollClassify(); }
    return;
  }
  const nocli = Boolean(HOST?.installed);
  g.hidden = false; g.className = "guide"; g.dataset.state = nocli ? "nocli" : "missing";
  g.innerHTML = nocli
    ? `<h3>还差一点：没找到能用的 Codex 或 Claude Code</h3><p>本机小程序装好了，但这台电脑上没找到 Codex 或 Claude Code 命令行。点下面的按钮再复制一次，发给你的 AI，它会帮你装上。</p><div class="gbtns"><button class="gbtn" data-guide="copy">复制给 AI</button><span class="gsub">${guideCopied ? "复制好了，去 Codex 或 Claude Code 里粘贴发送。装好后这里会自动往下走" : ""}</span></div>`
    : `<h3>最后一步：装好 AI 自动分类（只要做一次）</h3><p>装好以后，每条收藏会自动分好类：以后什么时候翻它、能不能做成视频、多久内要做。用的是你电脑上的 Codex 或 Claude Code，不用填任何密钥。</p>
      <ol><li>点下面的「复制给 AI」</li><li>打开 Codex 或 Claude Code，新开一个对话，粘贴，发送</li><li>等它说装好了，回到这里。这张卡片会自己变成「装好了」，开始分类</li></ol>
      <div class="gbtns"><button class="gbtn" data-guide="copy">复制给 AI</button><span class="gsub">${guideCopied ? "复制好了，去 Codex 或 Claude Code 里粘贴发送。装好后这张卡片会自己变" : "它还会顺手装一个读收藏的 Skill，以后你问 AI「我收藏过什么」它就能答"}</span></div>`;
}
async function copyGuide(){
  guideCopied = await xbnCopyInstallPrompt();
  toast(guideCopied ? "复制好了：发给你的 Codex 或 Claude Code" : "没复制上，再点一次");
  renderGuide();
}
document.addEventListener("click", (e) => { if (e.target.closest?.('[data-guide="copy"]')) copyGuide(); });

async function startClassify({ quiet = false } = {}){
  if (!hostReady()){ // 还没装好：不报错，直接带去装
    if (quiet) return;
    await checkHost();
    if (!hostReady()){ await copyGuide(); const g = $("#guide"); g.scrollIntoView({ behavior: "smooth", block: "center" }); g.classList.remove("flash"); void g.offsetWidth; g.classList.add("flash"); return; }
  }
  let r;
  try { r = await api("/api/shoucang/classify", {}); } catch (error) { if (!quiet) toast(`没能开始分类：${error.message}`); return; }
  if (r.state === "nothing"){ if (!quiet) toast("都分好了"); return; }
  if (r.relay){ if (!quiet) toast(r.macAwake ? "叫 Mac 开始分类了，分完这里会自己更新" : "Mac 在睡觉，醒了就开始分类"); if (r.macAwake) pollClassify(); return; }
  CLASSIFY = r; if (!quiet) toast(`AI 开始分类，共 ${r.total} 条，分完这里会自己更新`);
  for (const it of ITEMS) if (!cls(it)) redraw(it.id);
  pollClassify();
}
async function pollClassify(){
  if (polling) return; polling = true;
  try {
    // 中转站模式下 Mac 每 10 秒才来一次，查得慢一些，最多等 3 分钟
    for (let i = 0; ; i += 1){
      if (RELAY && i >= 18){ toast("Mac 还在分，过一会儿下拉刷新看"); break; }
      await new Promise((r) => setTimeout(r, RELAY ? 10000 : 3000));
      const s = await api("/api/shoucang/classify");
      if (s.relay && s.macAwake === false){ toast("Mac 睡着了，醒了接着分"); break; }
      if (!s.running){
        await load();
        if (s.relay && s.lastState === "nothing"){ toast("都分好了"); break; }
        toast(s.failed ? `分好了 ${s.done} 条，${s.failed} 条没分成，过一会儿再点「开始分类」` : `分好了 ${s.done} 条`);
        break;
      }
    }
  } catch (error) { toast(`查不到分类进度：${error.message}`); }
  finally { polling = false; }
}
// 「从 X 同步」：书签服务跑一次快速同步（只抓最近 100 条，几秒钟），跑完重新读一遍，告诉你新进来几条
let syncing = false;
async function syncFromX(){
  if (syncing) return; syncing = true;
  const btn = $("#syncBtn"); btn.classList.add("spin");
  const before = new Set(ITEMS.map((it) => it.id));
  try {
    const r = await api("/api/bookmark-notes/sync", {});
    if (r.state === "cooldown"){ toast(`刚同步过，${r.cooldownSeconds || 60} 秒后再点`); return; }
    if (r.relay && !r.macAwake){ toast("Mac 在睡觉，醒了就从 X 同步"); return; }
    // 中转站模式下要等 Mac 来取活、跑完再把数据送上来，大约半分钟
    toast(r.relay ? "叫 Mac 从 X 抓最近的收藏了，大约半分钟" : "正在从 X 抓最近的收藏…");
    let done = false, cooled = false;
    for (let i = 0; i < (r.relay ? 30 : 60); i += 1){
      await new Promise((x) => setTimeout(x, r.relay ? 5000 : 1500));
      const s = await api("/api/bookmark-notes/sync");
      if (s.relay && s.macAwake === false){ toast("Mac 睡着了，醒了就从 X 同步"); return; }
      if (!s.running){ done = true; cooled = s.relay && s.lastState === "cooldown"; break; }
    }
    if (cooled){ toast("Mac 一分钟内刚同步过，这次没再抓。过一分钟再点"); return; }
    await load();
    const fresh = ITEMS.filter((it) => !before.has(it.id)).length;
    toast(!done && !fresh ? "Mac 还在同步，过一会儿下拉刷新看" : fresh ? `同步好了，新进来 ${fresh} 条` : "同步好了，没有新收藏");
  } catch (error) { toast(`没同步成：${error.message}`); }
  finally { syncing = false; btn.classList.remove("spin"); }
}
function judgeAll(){ startClassify(); }
// 「DIY」：复制一段话，读者发给自己的 Codex 或 Claude Code；AI 先一轮一轮问清楚想怎么改，读者同意了再改插件代码
function viewName(){ const v = st.view; if (v.kind === "tag") return v.minor ? `${v.major} · ${v.minor}` : v.major; return (VIEWS.find((x) => x[0] === v.kind) || [, , "全部收藏"])[2] + (v.minor ? ` · ${v.minor}` : ""); }
function diyPrompt(){
  const version = chrome.runtime.getManifest().version;
  return [
    `我在用 Chrome 插件「X 收藏备注」（${version} 版）的收藏页，想按自己的需要改一改这个页面。你来帮我改，但先别动手，按下面三步来。`,
    "",
    "第一步：问清楚我要什么。",
    "1. 先问我想改什么。一次只问一到三个问题，每个问题给两三个常见的选项让我挑，每个选项写清选了会怎样，我用自己的话回答就行，也可以说别的；我答完再接着问，直到你能说清楚四件事：改哪一块（左栏、卡片、右栏、搜索、分类……）、改成什么样（让我举个例子，或者说像哪个网站、哪个地方）、改了用来干什么、哪些地方保持原样。",
    "2. 我说不清楚的时候，你把两三种改法分别会是什么样子讲给我听，让我挑。跟我说话不用技术词。",
    "3. 问清楚以后，用几句大白话复述你打算怎么改、改完我会看到什么，等我说「可以」再动手。",
    "",
    "第二步：改。",
    "1. 先找到插件文件夹：里面有 manifest.json，它的 name 是「X 收藏备注」，常放在「文稿」「下载」「桌面」里；找不到就在用户目录下搜 shoucang.html。",
    "2. 动手前把整个 extension 文件夹复制一份当备份，放在它旁边，文件夹名后面加上今天的日期。",
    "3. 文件分工：收藏页的布局和样式在 extension/shoucang.html；页面怎么画、每个按钮做什么在 extension/shoucang.js；页面要的数据由 extension/background.js 里的 pageApi、shoucangData 给；分类树和给 AI 的分类说明在 extension/lib/classify.js（改了分类树，已经分好的收藏会自动按新分类重分）；收藏时弹出的备注框在 extension/card.html、extension/card.js。",
    "4. 不能动的：manifest.json 里的 key（改了插件编号会变，AI 分类就连不上了）；插件存数据的方式和已有数据的格式（chrome.storage 里 t:、n:、i:、r: 开头的那些），不然我已经存的收藏和备注会读不出来；「我为什么收藏」的备注只能由我自己写。",
    "",
    "第三步：让我看效果。",
    "1. 改完提醒我：打开 chrome://extensions，在「X 收藏备注」卡片上点刷新图标，再刷新收藏页。这一步我自己来点。",
    "2. 我看了说不对，就接着改，直到我满意。",
    "3. 插件文件夹里有 test/e2e.mjs 的话，改完运行 node test/e2e.mjs，有没过的告诉我是哪一项、要不要紧。",
    "4. 最后在 extension 文件夹旁边写一份「我的改动.md」：改了什么、为什么改、改了哪些文件。以后插件出新版、整个文件夹换成新的时，我把这份文件和新版一起发给你，你照着再改一遍。",
    "",
    `我点 DIY 的时候，收藏页正在看「${viewName()}」这一栏。我想改的写在这句话后面（没写就从第一步开始问我）：`,
    "",
  ].join("\n");
}
async function copyDiy(){
  try { await navigator.clipboard.writeText(diyPrompt()); toast("复制好了：发给你的 Codex 或 Claude Code，它会先问你想怎么改"); }
  catch { toast("没复制上，再点一次 DIY"); }
}
async function saveReview(id, patch, done){
  try { REVIEW[id] = (await api("/api/shoucang/review", { id, ...patch })).review; }
  catch (error) { toast(`没存上：${error.message}`); return false; }
  done?.(); return true;
}
// 先在页面上改好、放动效，再存；没存上就改回去
async function quickReview(id, patch, act, msg){
  const before = REVIEW[id], it = ITEMS.find((x) => x.id === id);
  REVIEW[id] = { ...(before || {}), ...patch, ...(patch.verdict !== undefined && patch.verdict !== "bad" ? { fix: "" } : {}) };
  if (it && !matches(it)) afterCardChange(id); else { redraw(id); updateNav(); renderRight(); }
  if (act) cards.get(id)?.querySelector(act)?.classList.add("burst"); // act 是要放动效的按钮
  const shown = REVIEW[id], saved = await saveReview(id, patch);
  if (!saved){ REVIEW[id] = before; afterCardChange(id); return; }
  const key = (r) => JSON.stringify(["verdict", "status", "doWithin", "decision", "decidedAt"].map((k) => r?.[k] ?? null));
  if (key(REVIEW[id]) !== key(shown)) afterCardChange(id);
  if (msg) toast(msg);
}
function afterCardChange(id){ redraw(id); render(); }

document.addEventListener("click", (e) => {
  const b = e.target.closest("button, a");
  if (menuEl && !e.target.closest(".menu") && !(b && ["menu","views","filter","within","go","edit"].includes(b.dataset.act))) { closeMenu(); if (!b) return; }
  // 引用卡片、文章卡片：点卡片空白处和 X 一样打开原文（点卡片里的链接照旧去那个链接；拖选文字时不跳）
  const cardLink = e.target.closest(".card[data-href]");
  if (!b && cardLink && !String(window.getSelection?.() || "")){ window.open(cardLink.dataset.href, "_blank", "noopener"); return; }
  if (!b) return;
  const d = b.dataset;
  if (d.nav){ const n = navItems.find((x) => x !== "sep" && x.key === d.nav); if (n) go({...n.view}); return; }
  if (d.view){ go({kind:d.view}); return; }
  if (d.minor !== undefined && !d.major){ st.view = {...st.view, minor: d.minor || undefined}; render(); return; }
  if (d.major !== undefined){ go({kind:"tag", major:d.major, minor:d.minor || undefined}); return; }
  if (d.video){ st.videos.has(d.video) ? st.videos.delete(d.video) : st.videos.add(d.video); render(); return; }
  if (d.kw){ st.q = d.kw; $("#q").value = $("#q2").value = d.kw; render({top:true}); return; }
  if (d.act === "filter"){ if (st.popId === "filter") closeMenu(); else openMenu(b, filterMenu(), "filter"); return; }
  if (d.act === "set-status"){ st.status = d.s; closeMenu(); render({top:true}); return; }
  if (d.act === "views"){ if (window.innerWidth > 700 && b.id === "title") return; if (st.popId === "views") closeMenu(); else openMenu(b, viewsMenu(), "views"); return; }
  const id = d.id, L = id ? reviewOf(id) : null;
  switch (d.act){
    case "judge": e.preventDefault(); judgeAll(); break;
    case "mute": e.preventDefault(); setSound(!soundOn); break;
    case "more": st.expanded.has(id) ? st.expanded.delete(id) : st.expanded.add(id); redraw(id); break;
    case "ai": st.aiOpen.has(id) ? st.aiOpen.delete(id) : st.aiOpen.add(id); redraw(id); break;
    case "good": { if (side.id === id && side.kind === "fix") sideClose(); const on = L.verdict !== "good";
      quickReview(id, { verdict: on ? "good" : null }, on ? ".act.good" : null, on ? "记下了：判断准确" : ""); break; }
    case "bad": sideOpen(id, "fix"); break;
    case "menu": if (st.popId === id) closeMenu(); else openMenu(b, statusMenu(id), id); break;
    case "within": { // 点卡片上的蓝色标签，或「更多」菜单里的「多久内做」（这时菜单要收起，改挂在卡片右上角）
      if (st.popId === "w" + id){ closeMenu(); break; }
      const anchor = b.closest(".menu") ? cards.get(id)?.querySelector('.more [data-act="menu"]') : b;
      if (anchor) openMenu(anchor, withinMenu(id), "w" + id); break; }
    case "drop": case "delay": closeMenu(); sideOpen(id, d.act); break;
    case "undrop": { closeMenu(); // 撤回以后告诉他回到了哪一档（之前延期过的，书签服务会恢复那次延期）
      quickReview(id, { decision: null }, null, "").then(() => { const it = ITEMS.find((x) => x.id === id), w = it && tierOf(it);
        if (reviewOf(id).decision === "drop") return; toast(it && overdue(it) ? "撤回了：不过它已经过期，在「过期了」里，可以点「延期」" : `撤回了：回到「${w ? w.label : "可做成视频"}」`); });
      break; }
    case "delay-to": side.delayTo = d.w; delayOpts(); $("#sideText").focus(); break;
    case "set-within": { closeMenu(); const w = DOW.find((x) => x.key === d.w);
      quickReview(id, { doWithin: d.w || null }, null, w ? `改成「${w.label}」了` : "改回按 AI 定的了"); break; }
    case "status": closeMenu(); quickReview(id, { status: d.s }, ".act.st", d.s === "丢掉" ? "已丢掉：只是这里不再显示，不删你的 X 书签" : `已标成「${d.s}」`); break;
    case "open": closeMenu(); window.open(ITEMS.find((x) => x.id === id).url, "_blank", "noopener"); break;
    case "copy": closeMenu(); navigator.clipboard?.writeText(ITEMS.find((x) => x.id === id).url).then(() => toast("链接已复制"), () => toast("复制失败")); break;
    case "clear-q": st.q = ""; $("#q").value = $("#q2").value = ""; render({top:true}); break;
    case "go": if (st.popId === "g" + id) closeMenu(); else openMenu(b, goMenu(id), "g" + id); break;
    case "edit": { if (st.popId === "e" + id){ closeMenu(); break; }
      const anchor = b.closest(".menu") ? cards.get(id)?.querySelector('.more [data-act="menu"]') : b;
      if (anchor) openMenu(anchor, editMenu(id), "e" + id, "edit"); break; }
    case "edit-tag": { const c = cls(ITEMS.find((x) => x.id === id)) || { tags: [] }, cur = c.tags.map(([, m]) => m);
      editPatch(id, { tags: cur.includes(d.m) ? cur.filter((m) => m !== d.m) : [...cur, d.m] }, "改好了，AI 以后分类会参考"); break; }
    case "edit-video": { const c = cls(ITEMS.find((x) => x.id === id)) || { video: [] }, cur = c.video || [];
      editPatch(id, { video: VIDEOS.map(([x]) => x).filter((x) => x === d.v ? !cur.includes(x) : cur.includes(x)) }, "改好了，AI 以后分类会参考"); break; }
    case "edit-reset": editPatch(id, { tags: null, video: null }, "改回按 AI 分的了"); break;
    case "go-copy": closeMenu();
      chrome.runtime.sendMessage({ type: "xbn-work-prompt", tweetId: id }).then((r) => navigator.clipboard.writeText(r.prompt)).then(() => toast("复制好了：备注和原文，贴给任何 AI 都行"), () => toast("没复制上，再点一次")); break;
    case "go-tool": { closeMenu(); const name = TOOL_NAMES[d.tool];
      api("/api/bookmark-notes/start", { tweetId: id, tool: d.tool, from: "page" })
        .then((r) => { if (r.work) WORK[id] = r.work; afterCardChange(id); toast(`正在打开 ${name}：Chrome 会问一句要不要打开，点打开，开场白已经填好。没反应就用「复制开场白」`); })
        .catch((err) => toast(err.message)); break; }
    case "unwork": closeMenu();
      api("/api/bookmark-notes/unwork", { tweetId: id }).then(() => { delete WORK[id]; afterCardChange(id); toast("不算开工了，从「正在做」里拿走"); }).catch((err) => toast(err.message)); break;
    case "note-open": e.preventDefault(); sideOpen(id, "note"); break;
  }
});
document.addEventListener("keydown", (e) => { if (e.key !== "Escape") return; if (menuEl) closeMenu(); else sideClose(); });
window.addEventListener("resize", () => { closeMenu(); fitRight(); sidePlace(); });
$("#sideText").addEventListener("keydown", (e) => {
  if (e.isComposing || e.keyCode === 229) return; // 输入法正在选字：回车、Esc 交给输入法
  if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); sideSave(); }
  else if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); sideClose(); }
});
$("#sideText").addEventListener("input", () => { $("#sideMsg").textContent = ""; });
$("#newVerBtn").onclick = () => location.reload();
$("#sideSave").onclick = sideSave; $("#sideX").onclick = sideClose; $("#sideX").innerHTML = ic("x", 18);
$("#judge").onclick = judgeAll; $("#diy").onclick = copyDiy; $("#diyIc").innerHTML = ic("pencil", 24); $("#syncBtn").onclick = syncFromX; $("#syncBtn").innerHTML = ic("refresh", 20); $("#fab").onclick = judgeAll;
$("#logo").innerHTML = ic("bookmark", 30, {fill:true}); $("#judgeIc").innerHTML = ic("sparkles", 24); $("#fab").innerHTML = ic("sparkles", 24);
$("#back").innerHTML = ic("arrow-left", 20);
$("#srchIc").innerHTML = ic("search", 18.75); $("#srchIc2").innerHTML = ic("search", 18.75); $("#acctDots").innerHTML = ic("dots", 18.75);
for (const inp of [$("#q"), $("#q2")]) inp.addEventListener("input", (e) => { st.q = e.target.value.trim(); $("#q").value = $("#q2").value = e.target.value; render(); });
$("#feed").innerHTML = `<div class="empty"><span>正在读书签库…</span></div>`;
st.view = viewFromHash() || st.view;
window.addEventListener("hashchange", () => { const v = viewFromHash(); if (v){ st.view = v; closeMenu(); render({top:true}); } });
load({ first: true }).catch((error) => { $("#feed").innerHTML = `<div class="empty"><b>读不到收藏</b><span>${esc(error.message)}。${ON_MAC ? "刷新一下这个页面；还不行，到 chrome://extensions 点插件卡片上的刷新图标" : "等 Mac 醒着、联网时，过一分钟再刷新。"}</span></div>`; });
let lastLoad = Date.now();
document.addEventListener("visibilitychange", pickVideo); // 切到别的标签页就停，切回来接着播
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || Date.now() - lastLoad < 20000 || side.id) return;
  lastLoad = Date.now(); load().catch(() => {});
});
let storageTimer = 0;
chrome.storage.onChanged.addListener((changes) => {
  if (!Object.keys(changes).some((k) => /^(t|n|i|r):/.test(k) || k === "classifyRun")) return;
  clearTimeout(storageTimer); storageTimer = setTimeout(() => { if (document.visibilityState === "visible" && !side.id) { lastLoad = Date.now(); load().catch(() => {}); } }, 1200);
});
