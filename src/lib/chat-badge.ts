// Unread counter on every "แชท" link (rail, tab bar, landing nav).
import { api, myNo } from "./api.ts";

let last = { private: 0, pending: 0 };

export function paintChatBadge(counts = last) {
  last = counts;
  const n = counts.private + counts.pending;
  document.querySelectorAll<HTMLElement>("[data-chat-badge]").forEach((b) => {
    b.textContent = n > 99 ? "99+" : String(n);
    b.hidden = n === 0;
  });
}

export async function refreshChatBadge() {
  if (!myNo()) return paintChatBadge({ private: 0, pending: 0 });
  try {
    paintChatBadge(await api.chatUnread());
  } catch {
    paintChatBadge({ private: 0, pending: 0 });
  }
}

export const chatBadge = () => `<span class="ch-badge" data-chat-badge hidden></span>`;
