// 设计 token：8pt 间距、有限字阶、统一圆角/阴影/动效，全部走 CSS 变量

export const tokens = `
:root {
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 32px;
  --sp-7: 48px;

  --fs-xs: 14px;
  --fs-sm: 15px;
  --fs-base: 16px;
  --fs-lg: 18px;
  --fs-xl: 22px;
  --fs-2xl: 28px;

  --fw-normal: 400;
  --fw-medium: 500;
  --fw-semibold: 600;

  --radius-sm: 4px;
  --radius: 8px;
  --radius-lg: 12px;

  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.08);
  --shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
  --shadow-lg: 0 12px 32px rgba(15, 23, 42, 0.16);

  --t-fast: 0.15s;
  --t: 0.2s;

  --c-bg: #f8fafc;
  --c-surface: #ffffff;
  --c-border: #e2e8f0;
  --c-text: #0f172a;
  --c-text-2: #475569;
  --c-text-3: #94a3b8;
  --c-primary: #1d4ed8;
  --c-primary-weak: #dbeafe;
  --c-danger: #b91c1c;
  --c-danger-weak: #fee2e2;
  --c-warn: #b45309;
  --c-warn-weak: #fef3c7;
  --c-ok: #15803d;
  --c-ok-weak: #dcfce7;
}

:root[data-theme='dark'] {
  --c-bg: #0b1220;
  --c-surface: #111a2e;
  --c-border: #1e293b;
  --c-text: #e2e8f0;
  --c-text-2: #94a3b8;
  --c-text-3: #64748b;
  --c-primary: #60a5fa;
  --c-primary-weak: #1e3a8a;
  --c-danger: #f87171;
  --c-danger-weak: #450a0a;
  --c-warn: #fbbf24;
  --c-warn-weak: #451a03;
  --c-ok: #4ade80;
  --c-ok-weak: #052e16;
}
`
