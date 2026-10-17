import { useCalendar } from "../../context/CalendarContext";
import { Button, Container, Row, Col, Card } from "react-bootstrap";

export default function CalendarConnectionPanel() {
  const {
    calendarStatus,
    statusLoading,
    statusError,
    actionLoading,
    actionError,
    actionMessage,
    connectGoogleCalendar,
    disconnectGoogleCalendar,
  } = useCalendar();

  const isConnected = calendarStatus.connected;

  const buttonText = !isConnected
    ? !calendarStatus.configured
      ? "Google Calendar unavailable"
      : actionLoading
      ? "Connecting..."
      : "Connect Google Calendar"
    : actionLoading
    ? "Disconnecting..."
    : "Disconnect Google Calendar";

  const onClick = isConnected
    ? disconnectGoogleCalendar
    : connectGoogleCalendar;

  const disabled = isConnected
    ? actionLoading || statusLoading
    : actionLoading ||
      statusLoading ||
      !calendarStatus.configured;
      
  return (
      <Container className="dark-theme card"  style={{width: "100%"}} aria-live="polite">
        <Row className="p-2 align-items-center" style={{width: "100%", justifyContent: "space-between"}}>
          <Col md={12} lg={7} className="vertical-16">
            <p>Google Calendar</p>

            <h2>
              {statusLoading
                ? "Checking connection status"
                : calendarStatus.connected
                  ? "Calendar connected"
                  : "Calendar not connected"}
            </h2>

            <p>
              {statusLoading
                ? "Loading your Google Calendar connection."
                : calendarStatus.connected
                  ? `Connected${calendarStatus.email ? ` as ${calendarStatus.email}` : ""}.`
                  : "Connect Google Calendar to bring events into your monthly view."}
            </p>

            {(statusError || actionError || actionMessage) && (
              <p
                style={{
                  color: statusError || actionError
                    ? "var(--plum)"
                    : "var(--teal)",
                }}
              >
                {statusError || actionError || actionMessage}
              </p>
            )}
          </Col>

          <Col md={12} lg={1} style={{height:"24px", width:"24px"}}/>

          <Col md={12} lg={4} className="at-middle-center">
            <Button
              className="button-light body-text p-3"
              style={{ width: "fit-content" }}
              onClick={onClick}
              disabled={disabled}
            >
              {buttonText}
            </Button>
          </Col>
        </Row>
      </Container>
  );
}