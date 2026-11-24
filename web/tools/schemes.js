/* Renk şemaları — css/tokens.css bu dosyadan üretilir (node tools/build-tokens.js).
   Her şema dark + light için TOKENS listesindeki her tokenı tanımlar. "falcon" Falcon Ofis'in kendi değerleridir (değiştirmeyin).
   Yeni şemalar WCAG AA'ya göre ayarlanmıştır (test/schemes.test.js denetler). */
'use strict';

const TOKENS = [
  'bg', 'bg-grid', 'panel', 'panel-solid', 'panel-hover', 'border', 'border-strong', 'border-w',
  'text', 'muted', 'label', 'nav-text', 'nav-title',
  'accent', 'accent-2', 'on-accent', 'primary-1', 'primary-2', 'active-1', 'active-2', 'active-line', 'accent-soft', 'accent-line',
  'focus', 'focus-w', 'focus-ring',
  'danger', 'warn', 'ok', 'ok-text', 'danger-text', 'warn-text', 'ok-soft', 'ok-line', 'danger-soft', 'danger-line', 'warn-soft', 'warn-line',
  'sidebar-bg', 'topbar-bg', 'modal-bg', 'modal-border', 'backdrop',
  'toast-bg', 'toast-text', 'toast-line', 'toast-err-bg', 'toast-err-text', 'toast-err-line',
  'badge-text', 'badge-bg', 'badge-line', 'on-badge',
  'bar-track', 'scroll-thumb', 'glow-1', 'glow-2', 'shadow-pop', 'shadow-modal', 'shadow-toast'
];

const SHADOW_DARK = { 'shadow-pop': '0 14px 40px #0009', 'shadow-modal': '0 30px 80px #0009', 'shadow-toast': '0 12px 30px #00000073' };
const SHADOW_LIGHT = { 'shadow-pop': '0 14px 40px #0f172a2e', 'shadow-modal': '0 24px 60px #0f172a33', 'shadow-toast': '0 12px 30px #0f172a26' };

/** Temel renklerden tam token kümesi türetir (saydam tonlar hex + alfa). */
function derive(b, dark) {
  const t = {
    bg: b.bg, 'bg-grid': (dark ? b.accent : b.text) + (dark ? '09' : '08'),
    panel: b.panelSolid + (dark ? 'b8' : 'e0'), 'panel-solid': b.panelSolid, 'panel-hover': b.panelHover,
    border: b.line + (dark ? '24' : '1c'), 'border-strong': b.accent + (dark ? '73' : '66'), 'border-w': '1px',
    text: b.text, muted: b.muted, label: b.label, 'nav-text': b.navText, 'nav-title': b.navTitle,
    accent: b.accent, 'accent-2': b.accent2, 'on-accent': b.onAccent || '#ffffff', 'primary-1': b.primary1, 'primary-2': b.primary2,
    'active-1': b.accent + '29', 'active-2': b.accent2 + '14', 'active-line': b.accent + '47', 'accent-soft': b.accent + '14', 'accent-line': b.accent + '59',
    focus: b.accent, 'focus-w': '2px', 'focus-ring': b.accent + (dark ? '1f' : '1a'),
    danger: b.danger, warn: b.warn, ok: b.ok, 'ok-text': b.okText, 'danger-text': b.dangerText, 'warn-text': b.warnText,
    'ok-soft': b.ok + '1a', 'ok-line': b.ok + '4d', 'danger-soft': b.danger + '1a', 'danger-line': b.danger + '59', 'warn-soft': b.warn + '1a', 'warn-line': b.warn + '4d',
    'sidebar-bg': b.sidebar + 'd9', 'topbar-bg': b.topbar + '99', 'modal-bg': b.modal, 'modal-border': b.accent + (dark ? '38' : '40'),
    backdrop: dark ? '#02060fb8' : '#0f172a59',
    'toast-bg': b.toastBg, 'toast-text': b.toastText, 'toast-line': b.ok + '66', 'toast-err-bg': b.errBg, 'toast-err-text': b.errText, 'toast-err-line': b.danger + '73',
    'badge-text': b.badgeText, 'badge-bg': b.accent2 + '24', 'badge-line': b.accent2 + '59', 'on-badge': b.onBadge,
    'bar-track': b.line + '33', 'scroll-thumb': b.line + '33', 'glow-1': b.accent2 + '2e', 'glow-2': b.accent + '1f'
  };
  Object.assign(t, dark ? SHADOW_DARK : SHADOW_LIGHT, b.over || {});
  return t;
}

const DARK_STATUS = { danger: '#f43f5e', warn: '#f59e0b', ok: '#34d399', okText: '#6ee7b7', dangerText: '#fda4af', warnText: '#fcd34d', errBg: '#2a0f17', errText: '#fecdd3' };
const LIGHT_STATUS = { danger: '#be123c', warn: '#b45309', ok: '#047857', okText: '#047857', dangerText: '#9f1239', warnText: '#92400e', errBg: '#fff1f2', errText: '#9f1239' };

const SCHEMES = {
  /* Falcon Ofis — birebir (falcon-ref.css :root ve html.theme-light, sabit renkler tokena çevrildi) */
  falcon: {
    dark: {
      bg: '#070b14', 'bg-grid': '#38bdf809', panel: '#0f172ab8', 'panel-solid': '#0e1526', 'panel-hover': '#131d33',
      border: '#94a3b824', 'border-strong': '#38bdf873', 'border-w': '1px',
      text: '#e2e8f0', muted: '#8b98ad', label: '#a5b4cb', 'nav-text': '#b4c0d3', 'nav-title': '#5b6880',
      accent: '#22d3ee', 'accent-2': '#6366f1', 'on-accent': '#ffffff', 'primary-1': '#0891b2', 'primary-2': '#4f46e5',
      'active-1': '#22d3ee29', 'active-2': '#6366f114', 'active-line': '#22d3ee47', 'accent-soft': '#22d3ee14', 'accent-line': '#22d3ee59',
      focus: '#22d3ee', 'focus-w': '2px', 'focus-ring': '#22d3ee1f',
      danger: '#f43f5e', warn: '#f59e0b', ok: '#34d399', 'ok-text': '#6ee7b7', 'danger-text': '#fda4af', 'warn-text': '#fcd34d',
      'ok-soft': '#34d3991a', 'ok-line': '#34d3994d', 'danger-soft': '#f43f5e1a', 'danger-line': '#f43f5e59', 'warn-soft': '#f59e0b1a', 'warn-line': '#f59e0b4d',
      'sidebar-bg': '#080d19d9', 'topbar-bg': '#070b1499', 'modal-bg': '#0b1222', 'modal-border': '#38bdf838', backdrop: '#02060fb8',
      'toast-bg': '#0f2a26', 'toast-text': '#a7f3d0', 'toast-line': '#34d39966', 'toast-err-bg': '#2a0f17', 'toast-err-text': '#fecdd3', 'toast-err-line': '#f43f5e73',
      'badge-text': '#c7d2fe', 'badge-bg': '#6366f124', 'badge-line': '#6366f159', 'on-badge': '#04121a',
      'bar-track': '#94a3b833', 'scroll-thumb': '#94a3b833', 'glow-1': '#6366f12e', 'glow-2': '#22d3ee1f', ...SHADOW_DARK
    },
    light: {
      bg: '#eef2f7', 'bg-grid': '#0f172a08', panel: '#ffffffe0', 'panel-solid': '#ffffff', 'panel-hover': '#eef3f9',
      border: '#0f172a1c', 'border-strong': '#0891b266', 'border-w': '1px',
      text: '#0f172a', muted: '#5b6678', label: '#33435b', 'nav-text': '#2b384c', 'nav-title': '#616f89',
      accent: '#0891b2', 'accent-2': '#4f46e5', 'on-accent': '#ffffff', 'primary-1': '#0891b2', 'primary-2': '#4036e3',
      'active-1': '#22d3ee29', 'active-2': '#2c30ec14', 'active-line': '#22d3ee47', 'accent-soft': '#22d3ee14', 'accent-line': '#22d3ee59',
      focus: '#0891b2', 'focus-w': '2px', 'focus-ring': '#22d3ee16',
      danger: '#e11d48', warn: '#b45309', ok: '#059669', 'ok-text': '#159462', 'danger-text': '#5d000b', 'warn-text': '#b58b00',
      'ok-soft': '#34d3991a', 'ok-line': '#34d3994d', 'danger-soft': '#f326491f', 'danger-line': '#f3264959', 'warn-soft': '#f59e0b1a', 'warn-line': '#f59e0b4d',
      'sidebar-bg': '#e6ebf7d9', 'topbar-bg': '#ebeff899', 'modal-bg': '#ffffff', 'modal-border': '#0891b240', backdrop: '#0f172a59',
      'toast-bg': '#ecfdf5', 'toast-text': '#065f46', 'toast-line': '#05966966', 'toast-err-bg': '#fff1f2', 'toast-err-text': '#9f1239', 'toast-err-line': '#e11d4866',
      'badge-text': '#000b39', 'badge-bg': '#2c30ec24', 'badge-line': '#2c30ec59', 'on-badge': '#04121a',
      'bar-track': '#47566b33', 'scroll-thumb': '#47566b33', 'glow-1': '#2c30ec2e', 'glow-2': '#22d3ee1f', ...SHADOW_LIGHT
    }
  },
  zumrut: {
    dark: derive({ bg: '#04120f', panelSolid: '#0a1f1a', panelHover: '#0f2a23', text: '#e3f4ee', muted: '#8fb3a7', label: '#a9cbbf', navText: '#b7d6cb', navTitle: '#7ba497', accent: '#34d399', accent2: '#14b8a6', primary1: '#047857', primary2: '#0f766e', line: '#94b8ac', sidebar: '#05140f', topbar: '#04120f', modal: '#081b16', toastBg: '#0c2a22', toastText: '#a7f3d0', badgeText: '#ccfbf1', onBadge: '#022c22', ...DARK_STATUS }, true),
    light: derive({ bg: '#eef6f3', panelSolid: '#ffffff', panelHover: '#e6f2ed', text: '#0b2620', muted: '#4a665d', label: '#2f4d44', navText: '#23413a', navTitle: '#557269', accent: '#0f766e', accent2: '#047857', primary1: '#047857', primary2: '#0f766e', line: '#0b2620', sidebar: '#e3f0eb', topbar: '#e9f3ef', modal: '#ffffff', toastBg: '#ecfdf5', toastText: '#065f46', badgeText: '#053b33', onBadge: '#ffffff', ...LIGHT_STATUS }, false)
  },
  gunbatimi: {
    dark: derive({ bg: '#140b08', panelSolid: '#22130e', panelHover: '#2c1a13', text: '#f8ebe4', muted: '#c19d8f', label: '#d9b8aa', navText: '#e2c6b9', navTitle: '#a88072', accent: '#fbbf24', accent2: '#f43f5e', primary1: '#b45309', primary2: '#be123c', line: '#d6b2a3', sidebar: '#170c09', topbar: '#140b08', modal: '#1d100c', toastBg: '#2a1d0c', toastText: '#fde68a', badgeText: '#ffe4e6', onBadge: '#1c0f02', ...DARK_STATUS, danger: '#fb7185', warn: '#fbbf24' }, true),
    light: derive({ bg: '#fbf3ee', panelSolid: '#ffffff', panelHover: '#fbeee6', text: '#2a140c', muted: '#6e4c40', label: '#553529', navText: '#4a2c21', navTitle: '#80594b', accent: '#b45309', accent2: '#be123c', primary1: '#b45309', primary2: '#be123c', line: '#2a140c', sidebar: '#f6e7de', topbar: '#f8ece5', modal: '#ffffff', toastBg: '#fffbeb', toastText: '#78350f', badgeText: '#4c0519', onBadge: '#ffffff', ...LIGHT_STATUS }, false)
  },
  mor: {
    dark: derive({ bg: '#0c0816', panelSolid: '#171028', panelHover: '#1f1636', text: '#ece7fb', muted: '#a39bc4', label: '#bdb4dc', navText: '#c8c0e6', navTitle: '#8a82b0', accent: '#a78bfa', accent2: '#6366f1', primary1: '#7c3aed', primary2: '#4f46e5', line: '#a99fd0', sidebar: '#0e0a1b', topbar: '#0c0816', modal: '#130d22', toastBg: '#0f2a26', toastText: '#a7f3d0', badgeText: '#ddd6fe', onBadge: '#1a0b3d', ...DARK_STATUS, danger: '#fb7185', warn: '#fbbf24' }, true),
    light: derive({ bg: '#f3f1fb', panelSolid: '#ffffff', panelHover: '#eeeaf9', text: '#1b1433', muted: '#5b5378', label: '#3f3760', navText: '#352d55', navTitle: '#6a6290', accent: '#6d28d9', accent2: '#4f46e5', primary1: '#6d28d9', primary2: '#4f46e5', line: '#1b1433', sidebar: '#ebe7f8', topbar: '#efecf9', modal: '#ffffff', toastBg: '#ecfdf5', toastText: '#065f46', badgeText: '#2e1065', onBadge: '#ffffff', ...LIGHT_STATUS }, false)
  },
  okyanus: {
    dark: derive({ bg: '#050b1a', panelSolid: '#0a1630', panelHover: '#0f1e3d', text: '#e2ecfb', muted: '#8fa6c8', label: '#a9bee0', navText: '#b6c9e8', navTitle: '#7390b8', accent: '#38bdf8', accent2: '#3b82f6', primary1: '#0369a1', primary2: '#1d4ed8', line: '#94acd0', sidebar: '#061026', topbar: '#050b1a', modal: '#08122a', toastBg: '#0f2a26', toastText: '#a7f3d0', badgeText: '#bfdbfe', onBadge: '#03111f', ...DARK_STATUS }, true),
    light: derive({ bg: '#eef4fb', panelSolid: '#ffffff', panelHover: '#e7eff9', text: '#0b1a33', muted: '#4b5d78', label: '#2f4262', navText: '#26385a', navTitle: '#53668a', accent: '#0369a1', accent2: '#1d4ed8', primary1: '#0369a1', primary2: '#1d4ed8', line: '#0b1a33', sidebar: '#e4edf8', topbar: '#eaf1fa', modal: '#ffffff', toastBg: '#ecfdf5', toastText: '#065f46', badgeText: '#0c2a5b', onBadge: '#ffffff', ...LIGHT_STATUS }, false)
  },
  grafit: {
    dark: derive({ bg: '#0d0e10', panelSolid: '#17191c', panelHover: '#1f2226', text: '#e8e9eb', muted: '#9a9fa6', label: '#b5b9bf', navText: '#c2c6cb', navTitle: '#868b93', accent: '#cbd5e1', accent2: '#94a3b8', primary1: '#3f4652', primary2: '#2b3039', line: '#a1a6ad', sidebar: '#0f1012', topbar: '#0d0e10', modal: '#141619', toastBg: '#1a1d21', toastText: '#e8e9eb', badgeText: '#e5e7eb', onBadge: '#111214', ...DARK_STATUS, over: { 'bg-grid': '#ffffff05', 'glow-1': '#94a3b812', 'glow-2': '#cbd5e10d' } }, true),
    light: derive({ bg: '#f2f3f5', panelSolid: '#ffffff', panelHover: '#eceef1', text: '#16181b', muted: '#575d66', label: '#3b4048', navText: '#30353c', navTitle: '#646a73', accent: '#3f4652', accent2: '#5b636e', primary1: '#3f4652', primary2: '#2b3039', line: '#16181b', sidebar: '#e9eaed', topbar: '#eff0f2', modal: '#ffffff', toastBg: '#f6f7f8', toastText: '#16181b', badgeText: '#1f2328', onBadge: '#ffffff', ...LIGHT_STATUS, over: { 'bg-grid': '#0000', 'glow-1': '#0000', 'glow-2': '#0000' } }, false)
  },
  'yuksek-kontrast': {
    dark: derive({ bg: '#000000', panelSolid: '#000000', panelHover: '#1f1f1f', text: '#ffffff', muted: '#e6e6e6', label: '#ffffff', navText: '#ffffff', navTitle: '#e6e6e6', accent: '#ffff00', accent2: '#00ffff', primary1: '#ffff00', primary2: '#ffff00', onAccent: '#000000', line: '#ffffff', sidebar: '#000000', topbar: '#000000', modal: '#000000', toastBg: '#000000', toastText: '#ffffff', badgeText: '#ffffff', onBadge: '#000000', danger: '#ff6b6b', warn: '#ffd000', ok: '#00ff7f', okText: '#00ff7f', dangerText: '#ff9090', warnText: '#ffd000', errBg: '#000000', errText: '#ff9090',
      over: { panel: '#000000', border: '#ffffff', 'border-strong': '#ffff00', 'border-w': '2px', focus: '#00ffff', 'focus-w': '3px', 'focus-ring': '#00ffff80', 'sidebar-bg': '#000000', 'topbar-bg': '#000000', 'modal-border': '#ffffff', backdrop: '#000000d9', 'toast-line': '#ffffff', 'toast-err-line': '#ff6b6b', 'badge-bg': '#000000', 'badge-line': '#ffffff', 'bar-track': '#ffffff59', 'scroll-thumb': '#ffffff99', 'bg-grid': '#0000', 'glow-1': '#0000', 'glow-2': '#0000', 'active-1': '#ffff0033', 'active-2': '#ffff0033', 'active-line': '#ffff00', 'accent-soft': '#ffff0026', 'accent-line': '#ffff00', 'ok-line': '#00ff7f', 'danger-line': '#ff6b6b', 'warn-line': '#ffd000' } }, true),
    light: derive({ bg: '#ffffff', panelSolid: '#ffffff', panelHover: '#e6e6e6', text: '#000000', muted: '#1f1f1f', label: '#000000', navText: '#000000', navTitle: '#1f1f1f', accent: '#0000cc', accent2: '#000000', primary1: '#0000cc', primary2: '#0000cc', line: '#000000', sidebar: '#ffffff', topbar: '#ffffff', modal: '#ffffff', toastBg: '#ffffff', toastText: '#000000', badgeText: '#000000', onBadge: '#ffffff', danger: '#b00020', warn: '#7a4b00', ok: '#006400', okText: '#006400', dangerText: '#b00020', warnText: '#7a4b00', errBg: '#ffffff', errText: '#b00020',
      over: { panel: '#ffffff', border: '#000000', 'border-strong': '#0000cc', 'border-w': '2px', focus: '#0000cc', 'focus-w': '3px', 'focus-ring': '#0000cc66', 'sidebar-bg': '#ffffff', 'topbar-bg': '#ffffff', 'modal-border': '#000000', backdrop: '#000000a6', 'toast-line': '#000000', 'toast-err-line': '#b00020', 'badge-bg': '#ffffff', 'badge-line': '#000000', 'bar-track': '#00000040', 'scroll-thumb': '#00000080', 'bg-grid': '#0000', 'glow-1': '#0000', 'glow-2': '#0000', 'active-1': '#0000cc1f', 'active-2': '#0000cc1f', 'active-line': '#0000cc', 'accent-soft': '#0000cc14', 'accent-line': '#0000cc', 'ok-line': '#006400', 'danger-line': '#b00020', 'warn-line': '#7a4b00' } }, false)
  }
};

module.exports = { TOKENS, SCHEMES, derive };
