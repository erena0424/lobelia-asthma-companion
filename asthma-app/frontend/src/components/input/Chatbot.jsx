import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";
import ChatContent from "./ChatContent";
import { urls } from "../../constants";
import { OPEN_CHAT_EVENT } from "../../helper-functions/chatEvents";
import "./Chatbot.css";

// Desktop chat: a side panel opened from the top bar's "Ask Lobelia" button.
// Nothing is shown while it's closed, so it never covers page content.

function Chatbot({ title = "Ask Lobelia" }) {
    const [open, setOpen] = useState(false);
    const { pathname } = useLocation();
    const [lastPathname, setLastPathname] = useState(pathname);

    // close when the help flow opens (e.g. from the chat's breathing prompt)
    if (pathname !== lastPathname) {
        setLastPathname(pathname);
        if (pathname === urls.help && open) setOpen(false);
    }

    useEffect(() => {
        const handleOpen = () => setOpen(true);
        window.addEventListener(OPEN_CHAT_EVENT, handleOpen);
        return () => window.removeEventListener(OPEN_CHAT_EVENT, handleOpen);
    }, []);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open]);

    if (!open) return null;

    return createPortal(
        <aside className="chat-panel chatbot-floating" role="dialog" aria-label={title}>
            <div className="chat-panel-head">
                <h2>{title}</h2>
                <button type="button" className="chat-panel-close" aria-label="Close chat" onClick={() => setOpen(false)}>
                    ✕
                </button>
            </div>
            <ChatContent />
        </aside>,
        document.body
    );
}

export default Chatbot;
