import { useEffect, useRef, useState } from "react";
import { Form, Button, Image } from "react-bootstrap";
import ArrowButton from "./ArrowButton";
import { useChat } from "../../context/ChatContext";

function ChatContent() {
    const {
        messages,
        isSending,
        sendMessage,
        openConversation, openingFailed, canRequestOpening, clearChat, persona, setPersona
    } = useChat();

    useEffect(() => { openConversation(); }, [openConversation]);

    const [input, setInput] = useState("");
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({
            behavior: "smooth",
        });
    }, [messages, isSending]);

    function handleSend() {
        const trimmed = input.trim();

        if (!trimmed || isSending) {
            return;
        }

        sendMessage(trimmed);
        setInput("");
    }

    function handleKeyDown(e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    return (
        <div className="chatbot">
            <fieldset style={{ border: 0, padding: 0 }}>
                <label className="d-block">
                    Reply tone
                    <Form.Select value={persona} onChange={e => setPersona(e.target.value)}>
                        <option value="warm">Warm</option>
                        <option value="calm">Calm</option>
                        <option value="direct">Direct</option>
                    </Form.Select>
                </label>
            </fieldset>
            <div className="chatbot-content">
                <Image className="companion" src="bunny.gif" alt="Companion"/>
                <div className="chatbot-conversation" role="log" aria-label="Companion conversation">
                    {messages.map((message) => (
                        <div
                            key={message.id}
                            className={`chatbot-row ${message.sender}`}
                        >
                            <div
                                className={`chatbot-bubble ${message.sender}`}
                                style={{ whiteSpace: "pre-wrap" }}
                            >
                                {message.text}
                            </div>
                        </div>
                    ))}

                    {isSending && (
                        <div className="chatbot-row ai" aria-live="polite">
                            <div className="chatbot-bubble ai">
                                Companion is typing…
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>
                                

            {(openingFailed || canRequestOpening) && <Button disabled={isSending} onClick={() => openConversation(true)}>{openingFailed ? "Try greeting again" : "Show my daily greeting"}</Button>}

            <div className="chatbot-input">
                <div
                    className="chatbot-input-field card-0 light-theme"
                    style={{ borderRadius: "8px" }}
                >
                    <Form.Control
                        style={{ borderRadius: "4px" }}
                        as="textarea"
                        rows={2}
                        maxLength={1000}
                        aria-label="Message to companion"
                        placeholder={
                            isSending
                                ? "Companion is replying..."
                                : "Type a message..."
                        }
                        value={input}
                        disabled={isSending}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                </div>

                <fieldset disabled={isSending || !input.trim()} style={{ border: 0, padding: 0 }}>
                <ArrowButton
                    className="button-light p-2"
                    isSend
                    onClick={handleSend}
                />
                </fieldset>
            </div>

            <p className="m-0 text-center" style={{ fontSize: "13px" }}>
                The companion is AI and can be wrong. It is not medical advice.
                If you are having trouble breathing, follow your asthma action plan and call 911 if it is an emergency.
            </p>

            <Button
                className="button-error-light btn-medium-text button-medium"
                onClick={() => clearChat()}

            >
                Clear Chat
            </Button>
            
        </ div>
    );
}

export default ChatContent;