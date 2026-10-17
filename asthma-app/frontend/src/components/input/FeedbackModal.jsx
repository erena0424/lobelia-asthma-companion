import { useState } from "react";
import { Button } from "react-bootstrap";
import FormModal from "./FormModal";
import { useAuth } from "../../context/AuthContext";
import { FEEDBACK_MAX_LENGTH, SUPPORT_EMAIL, sendFeedback } from "../../helper-functions/feedback";
import "./FeedbackModal.css";

const CATEGORIES = [
  { value: "idea", label: "An idea" },
  { value: "bug", label: "Something's not working" },
  { value: "other", label: "Something else" },
];

/** "Send feedback" pop-up; emails the support inbox (works signed in or out). */
function FeedbackModal({ onClose }) {
  const { token, user } = useAuth();
  const signedIn = Boolean(token && user?.email);

  const [category, setCategory] = useState("other");
  const [message, setMessage] = useState("");
  const [allowReply, setAllowReply] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("editing");
  const [error, setError] = useState("");

  async function handleSend() {
    if (status === "sending") return;

    if (!message.trim()) {
      setError("Please write a message first.");
      return;
    }

    if (allowReply && !signedIn && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Add an email address so we can reply, or untick the box.");
      return;
    }

    setStatus("sending");
    setError("");

    try {
      await sendFeedback({
        token: signedIn ? token : null,
        message: message.trim(),
        category,
        allowReply,
        email: allowReply && !signedIn ? email.trim() : null,
      });
      setStatus("sent");
    } catch (sendError) {
      setError(sendError.message);
      setStatus("failed");
    }
  }

  if (status === "sent") {
    return (
      <FormModal title="Thank you!" onHide={onClose} onSubmit={onClose} submitText="Close" color="light">
        <p className="m-0 text-center">
          We really appreciate you taking the time. Every message is read by our team and helps shape what we build
          next.
        </p>
      </FormModal>
    );
  }

  return (
    <FormModal
      title="Send feedback"
      onHide={onClose}
      onSubmit={handleSend}
      submitText={status === "sending" ? "Sending…" : "Send"}
      color="light"
    >
      <div className="vertical-16 feedback-form">
        <p className="m-0">
          We read every note and take your feedback seriously. Tell us what's working, what isn't, or what you
          wish Lobelia did.
        </p>

        <div className="check-in-chips" role="group" aria-label="What is it about?">
          {CATEGORIES.map((option) => (
            <button
              type="button"
              key={option.value}
              className={`check-in-chip ${category === option.value ? "selected" : ""}`}
              aria-pressed={category === option.value}
              onClick={() => setCategory(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="feedback-field">
          <span>Your message</span>
          <textarea
            rows="5"
            maxLength={FEEDBACK_MAX_LENGTH}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Please don't include medical details you wouldn't want to email."
          />
          <small>{message.length}/{FEEDBACK_MAX_LENGTH}</small>
        </label>

        <label className="feedback-check">
          <input type="checkbox" checked={allowReply} onChange={(event) => setAllowReply(event.target.checked)} />
          <span>
            It's OK to email me back{signedIn ? ` at ${user.email}` : ""}
          </span>
        </label>

        {allowReply && !signedIn && (
          <label className="feedback-field">
            <span>Your email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} />
          </label>
        )}

        {error && (
          <div className="feedback-error vertical-8" role="alert">
            <p className="m-0">{error}</p>
            {status === "failed" && (
              <p className="m-0">
                You can also email us directly at{" "}
                <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Lobelia feedback")}`}>{SUPPORT_EMAIL}</a>.
              </p>
            )}
          </div>
        )}
      </div>
    </FormModal>
  );
}

/** A link-style button that opens the feedback pop-up. */
export function FeedbackLink({ className = "", children = "Send feedback" }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="link" className={`feedback-link ${className}`} onClick={() => setOpen(true)}>
        {children}
      </Button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  );
}

export default FeedbackModal;
