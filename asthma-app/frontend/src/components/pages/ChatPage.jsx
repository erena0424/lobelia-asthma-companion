import { Navigate } from "react-router";
import ChatContent from "../input/ChatContent";
import useIsSmallScreen from "../../helper-functions/useIsSmallScreen";
import { urls } from "../../constants";
import "../input/Chatbot.css";

function ChatPage() {
    const isSmallScreen = useIsSmallScreen();

    if (!isSmallScreen) {
        return <Navigate to={urls.home} replace />;
    }

    return (
        <div className="chat-page">
            <ChatContent />
        </ div>
    );
}

export default ChatPage;