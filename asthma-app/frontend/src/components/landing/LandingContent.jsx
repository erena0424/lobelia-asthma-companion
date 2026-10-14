import { Button, Container, Row, Col } from "react-bootstrap";
import { motion } from "framer-motion";
import { useRef, useLayoutEffect, useState } from "react";
import { Link } from "react-router";
import image from "../../assets/images/lungFlowers.png";
import { urls } from "../../constants";

function LandingContent({
  onLogin,
  onSignUp,
  onAbout,
  onBack,
  landingSlideOpen,
  buttonsDisabled,
  animationDuration
}) {

  const loginSignupRef = useRef(null);
  const backRef = useRef(null);

  const [loginSignupHeight, setLoginSignupHeight] = useState(0);
  const [backHeight, setBackHeight] = useState(0);

  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      if (loginSignupRef.current) {
        setLoginSignupHeight(
          loginSignupRef.current.offsetHeight
        );
      }

      if (backRef.current) {
        setBackHeight(
          backRef.current.offsetHeight
        );
      }
    });

    if (loginSignupRef.current)
      observer.observe(loginSignupRef.current);

    if (backRef.current)
      observer.observe(backRef.current);

    return () => observer.disconnect();

  }, []);

  const wrapperHeight =
    landingSlideOpen
      ? backHeight
      : loginSignupHeight + 1;


  return (
    <Container
      fluid
      className="green-body vertical-16 min-vh-100"
    >
      <Row className="at-middle-center text-center">
        <Col xs="auto">
          <h1 className="title">
            Lobelia
          </h1>
          <h2 className="section-text">
            AI-Powered Asthma Risk Forecasting
          </h2>
        </Col>
      </Row>

      <div
        style={{
          flex: "1 1 0",
          minHeight: 0,
          position: "relative",
        }}
      >
        <img
          src={image}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            pointerEvents: "none",
          }}
        />
      </div>

      <motion.div
        animate={{
          height: wrapperHeight
        }}
        transition={{
          duration: animationDuration
        }}
        style={{
          position: "relative",
          overflow: "hidden"
        }}
      >

        {/* Login / Signup */}
        <motion.div
          className="vertical-16 p-0"
          ref={loginSignupRef}
          animate={{
            opacity: landingSlideOpen ? 0 : 1,
            pointerEvents: landingSlideOpen
              ? "none"
              : "auto",
          }}
          transition={{
            duration: animationDuration
          }}
          style={{
            position: "absolute",
            width: "100%",
            padding: "8px"
          }}
        >
          <Row className="at-middle-center g-3 p-0">
            <Col xs="auto">
              <Button
                className="button-dark btn-large-text login-signup-button"
                onClick={onLogin}
                disabled={buttonsDisabled}
              >
                Login
              </Button>
            </Col>
            <Col xs="auto line-break-wrapper p-0">
              <span className="btn-large-text line-break">
                Or
              </span>
            </Col>
            <Col xs="auto">
              <Button
                className="button-dark btn-large-text login-signup-button"
                onClick={onSignUp}
                disabled={buttonsDisabled}
              >
                Sign Up
              </Button>
            </Col>
          </Row>
          <Row className="at-middle-center">
            <Button
              variant="link"
              className="btn-medium-text p-0 border-0 text-decoration-underline"
              style={{ color: "var(--color-secondary)", width: "fit-content" }}
              onClick={onAbout}
            >
              About
            </Button>
          </Row>
          <Row className="at-middle-center">
            <p
              className="text-center m-0"
              style={{ color: "var(--color-secondary)", fontSize: "14px", maxWidth: "480px", paddingBottom: "8px" }}
            >
              Not a medical device. Lobelia does not replace professional medical advice or your asthma action plan.{" "}
              <Link to={urls.privacy} style={{ color: "var(--color-secondary)" }}>
                Privacy Policy
              </Link>
            </p>
          </Row>
        </motion.div>

        {/* Back */}
        <motion.div
          ref={backRef}
          animate={{
            opacity: landingSlideOpen ? 1 : 0,
            pointerEvents: landingSlideOpen
              ? "auto"
              : "none",
          }}
          transition={{
            duration: animationDuration
          }}
          style={{
            position: "absolute",
            width: "100%"
          }}
        >
          <Row className="at-middle-center g-3">
            <Col xs="auto">
              <Button
                className="button-dark btn-large-text"
                onClick={onBack}
                disabled={buttonsDisabled}
              >
                Back
              </Button>
            </Col>
          </Row>
        </motion.div>

      </motion.div>
    </Container>
  );
}

export default LandingContent;