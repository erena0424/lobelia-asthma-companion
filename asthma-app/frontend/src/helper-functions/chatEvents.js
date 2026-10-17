// Opens the desktop chat panel from anywhere (the panel listens for this event).
export const OPEN_CHAT_EVENT = "lobelia:open-chat";

export function openChat() {
  window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
}
