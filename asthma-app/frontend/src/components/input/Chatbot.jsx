import { useRef, useState, useLayoutEffect } from "react";
import { useLocation } from "react-router";
import { urls } from "../../constants";
import { createPortal } from "react-dom";
import { Container, Row, Col } from "react-bootstrap";
import ToggleButton from "./ToggleButton";
import { Rnd } from "react-rnd";
import ChatContent from "./ChatContent";

function Chatbot({
    title = "Chat",
    beginClosed = false,
}) {
    const containerRef = useRef(null);

    // matches minWidth / minHeight below so the default fits on screen
    const EXPANDED_DEFAULT = {
        width: 800,
        height: 565,
    };

    const COLLAPSED_WIDTH = 240;
    const EDGE_MARGIN = 20;

    // bottom-right corner, never pushed off the left/top edge
    function cornerPosition({ width, height }) {
        return {
            x: Math.max(0, window.innerWidth - width - EDGE_MARGIN),
            y: Math.max(0, window.innerHeight - height - EDGE_MARGIN),
        };
    }

    const [isCollapsed, setIsCollapsed] =
        useState(beginClosed);

    const [size, setSize] =
        useState(EXPANDED_DEFAULT);

    const previousExpandedSize = useRef(
        EXPANDED_DEFAULT
    );

    const [position, setPosition] = useState(() =>
        cornerPosition(EXPANDED_DEFAULT)
    );

    useLayoutEffect(() => {
        if (isCollapsed && containerRef.current) {
            const { height } =
                containerRef.current.getBoundingClientRect();

            const collapsedSize = {
                width: COLLAPSED_WIDTH,
                height: Math.ceil(height),
            };

            setSize(collapsedSize);
            setPosition(cornerPosition(collapsedSize));
        } else {
            setSize(previousExpandedSize.current);
            setPosition(cornerPosition(previousExpandedSize.current));
        }
    }, [isCollapsed, title]);

    // get out of the way when the help screen opens (e.g. from the chat's help prompt)
    const { pathname } = useLocation();
    const [lastPathname, setLastPathname] = useState(pathname);

    if (pathname !== lastPathname) {
        setLastPathname(pathname);

        if (pathname === urls.help) {
            setIsCollapsed(true);
        }
    }

    function onCollapse() {
        setIsCollapsed((collapsed) => !collapsed);
    }

    const chatbot = (
        <div className="chatbot-layer">
            <Rnd
                size={size}
                position={position}
                onDragStop={(e, d) => {
                    setPosition({
                        x: d.x,
                        y: d.y,
                    });
                }}
                onResizeStop={(
                    e,
                    direction,
                    ref,
                    delta,
                    newPosition
                ) => {
                    const newSize = {
                        width: ref.offsetWidth,
                        height: ref.offsetHeight,
                    };

                    setSize(newSize);
                    previousExpandedSize.current = newSize;
                    setPosition(newPosition);
                }}
                // collapsed bar is fixed-size; resizing it would overwrite the expanded size
                enableResizing={!isCollapsed}
                minWidth={isCollapsed ? COLLAPSED_WIDTH : 800}
                minHeight={isCollapsed ? 0 : 565}
                bounds="parent"
                dragHandleClassName="chatbot-header"
                style={{
                    position: "fixed",
                    // below form modals (1000) so dialogs are never covered
                    zIndex: 900,
                }}
            >
                <Container
                    ref={containerRef}
                    className="contact-card d-flex flex-column chatbot-floating"
                    style={{
                        width: isCollapsed ? "auto" : "100%",
                        height: isCollapsed ? "auto" : "100%",
                        resize: "none",
                    }}
                >
                    {/* Floating chatbot header */}
                    <Row
                        className="vertical chatbot-header"
                        style={{
                            cursor: "move",
                            userSelect: "none",
                        }}
                    >
                        <Col className="position-relative">
                            <h2
                                className="text-center"
                                style={{
                                    overflowWrap: "break-word",
                                }}
                            >
                                {title}
                            </h2>

                            <div className="chatbot-collapse">
                                <ToggleButton
                                    className="button-light p-2"
                                    width="25"
                                    height="25"
                                    isCollapse={isCollapsed}
                                    onClick={onCollapse}
                                />
                            </div>
                        </Col>

                        {!isCollapsed && (
                            <Col>
                                <hr />
                            </Col>
                        )}
                    </Row>

                    {!isCollapsed && <ChatContent />}
                </Container>
            </Rnd>
        </div>
    );

    return createPortal(
        chatbot,
        document.body
    );
}

export default Chatbot;