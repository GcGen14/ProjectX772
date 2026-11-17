// Minimal inline SVG icon set (stroke icons, 24x24 grid).

const paths: Record<string, string> = {
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronsDown: '<path d="m7 7 5 5 5-5M7 13l5 5 5-5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  briefcase:
    '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  user: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.5c1.2-2.2 3.2-3.3 5.5-3.3s4.3 1.1 5.5 3.3"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2z"/>',
  image:
    '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/>',
  muted: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m16 9 5 6M21 9l-5 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7z"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  message: '<path d="M4 5h16v11H9l-5 4V5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  language:
    '<path d="M4 5h9M8.5 3v2M6 5c.8 3 2.8 5.5 6 7M11 5c-.8 3.6-3 6.2-7 8M13 21l4-10 4 10M14.5 17.5h5"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.3 7.5 9.5 4.3-1.2 7.5-5 7.5-9.5V6L12 3z"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
  arrowUpRight: '<path d="M7 17 17 7M8 7h9v9"/>',
  sparkle:
    '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z"/>',
  // tag icons
  pen: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
  book: '<path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5V5.5z"/><path d="M12 6v13.5"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10.5 5-3v9l-5-3"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4V8z"/><circle cx="12" cy="13" r="3.5"/>',
  palette:
    '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.6 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
  bot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/>',
  home: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4v-9z"/>',
  users:
    '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.8-3 3-4.6 5.5-4.6s4.7 1.6 5.5 4.6"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6M17 14.6c1.8.5 3 1.9 3.5 4.4"/>',
  play: '<path d="M8 5.5v13l10.5-6.5L8 5.5z" fill="currentColor" stroke="none"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  cake: '<path d="M4 20h16v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7zM4 15c2 1.5 4 1.5 6 0 2 1.5 4 1.5 6 0 2 1.5 3 1.5 4 0M12 11V8M12 5.5v-.01"/>',
  instagram:
    '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><path d="M16.8 7.2v.01"/>',
  box: '<path d="M12 3 4 7v10l8 4 8-4V7l-8-4z"/><path d="m4 7 8 4 8-4M12 11v10"/>',
  brush:
    '<path d="M19 3 9 13l2 2L21 5M9 13c-3 0-4 2-4 4s-1 3-2 3c2 1 6 1 7.5-1.5C11.5 17 11 15 11 15"/>',
  // chat
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  chat: '<path d="M20 11.5c0 4.1-3.6 7.5-8 7.5-1.2 0-2.3-.2-3.3-.6L4 19.5l1.2-3.6C4.4 14.7 4 13.2 4 11.5 4 7.4 7.6 4 12 4s8 3.4 8 7.5z"/>',
  checks: '<path d="m2.5 12.5 4.5 4.5 9.5-9.5M12.5 16l1 1 9.5-9.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  eyeOff:
    '<path d="M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.5.9-1.6 2.5-3.2 3.8M6.4 7.6C4.6 8.9 3.2 10.7 2.5 12c1 1.8 4.5 6 9.5 6 1.5 0 2.9-.4 4.1-1M9.9 10a3 3 0 0 0 4.2 4.2"/>',
};

export function icon(name: string, size = 20, cls = ""): string {
  const p = paths[name] ?? "";
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

export const star = (size = 14) =>
  `<svg class="star" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path fill="#ffb800" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>`;

/** Brand mark: three rounded petals around a center (original placeholder mark). */
export const logoMark = (size = 22) =>
  `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true">
    <path d="M16 15.5c-2.6-3.2-3.2-6.9-1.6-10.2a2 2 0 0 1 3.2 0c1.6 3.3 1 7-1.6 10.2z"/>
    <path d="M16.4 16.3c4.1-.6 7.6.8 9.6 3.8a2 2 0 0 1-1.6 2.8c-3.6.3-6.6-1.9-8-6.6z"/>
    <path d="M15.6 16.3c-1.4 4.7-4.4 6.9-8 6.6A2 2 0 0 1 6 20.1c2-3 5.5-4.4 9.6-3.8z"/>
  </svg>`;

export const onlineDot = () =>
  `<svg class="online-dot" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#fff"/><circle cx="8" cy="8" r="5" fill="#16a34a"/></svg>`;
