// 首帧之前设置主题和界面语言，避免刷新时闪一下。规则与 src/theme/theme.ts、src/i18n/locale.ts 一致。
// 这是同源的外部脚本，严格 CSP（script-src 'self'）下可以运行；不能改成内联脚本。
(() => {
  const root = document.documentElement;
  let locale = null;
  try {
    const theme = localStorage.getItem('moriium-dashboard.theme');
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    locale = localStorage.getItem('moriium-dashboard.locale');
  } catch {
    // 存储不可用：跟随系统主题，界面语言按浏览器设置。
  }
  if (locale !== 'zh-Hans' && locale !== 'ja' && locale !== 'en') {
    locale = 'zh-Hans';
    for (const tag of navigator.languages || []) {
      const t = tag.toLowerCase();
      if (t.startsWith('zh')) break;
      if (t.startsWith('ja')) {
        locale = 'ja';
        break;
      }
      if (t.startsWith('en')) {
        locale = 'en';
        break;
      }
    }
  }
  root.lang = locale;
})();
