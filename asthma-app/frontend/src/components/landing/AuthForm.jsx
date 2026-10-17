import { Container, Row, Col, Button, Form, Spinner } from 'react-bootstrap';
import { useState, useEffect } from 'react';
import FormFull from '../input/FormFull';
import ArrowButton from '../input/ArrowButton';
import { loginFields, signUpFields, loginState, signUpState, urls } from '../../constants';
import { login, signUp, isJwt, requestSignupCode } from '../../helper-functions/authentication';
import { useAuth } from '../../context/AuthContext';
import playErrorResponse from '../../helper-functions/playErrorResponse';
import { validate, hasErrors } from '../../helper-functions/validate';
import { useNavigate } from "react-router";
import SignupVerificationModal from './SignupVerificationModal';
import ForgotPasswordModal from './ForgotPasswordModal';

function AuthSlide({ showLogin, showSignUp }) {
  // whether app is waiting for API call
  const [loading, setLoading] = useState(false);

  // fields to use
  var fields = showLogin ? loginFields : signUpFields;

  // store user input and errors for the user input
  var initialFormData = showLogin ? loginState : signUpState;
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState(initialFormData);

  // authentication
  const { storeToken, setupComplete, setSetupComplete } = useAuth();

  // button error handling
  const [buttonError, setButtonError] = useState("");
  const [shake, setShake] = useState(false);
  const [showSignupVerificationModal, setShowSignupVerificationModal] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);

  // validate errors immediately
  useEffect(() => {
    verifyFields();
  }, [])

  // to navigate on button click
  const navigate = useNavigate();

  // navigate to home page when setupComplete changes to true
  useEffect(() => {
    if (setupComplete) {
      navigate(urls.home);
    }
  }, [setupComplete]);

  function verifyFields() {
    const newErrors = validate(fields, formData);

    setErrors(newErrors);
    return newErrors;
  }

  async function submitAuthentication() {
    var result = "Trouble Processing. Please try again later.";

    try {
      if (showLogin) {
        result = await login(formData.email, formData.password);
      } else {
        result = await signUp(formData.email, formData.password);
      }
    } catch {}

    if (isJwt(result)) {
      if (showLogin) {
        setSetupComplete(true);
      } else {
        navigate(urls.setup);
      }

      storeToken(result);
      return;
    }

    setButtonError(result);
    playErrorResponse(setShake);
  }

  // enter is pressed
  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      authButtonClick();
    }
  }


  // ********************* login or sign up is clicked *****************************
  async function authButtonClick() {
    if (loading) return;

    const newErrors = verifyFields();

    if (hasErrors(newErrors)) {
      setButtonError("You have not met the requirements.");
      playErrorResponse(setShake);
      return;
    }

    setLoading(true);
    setButtonError("");

    try {
      if (showLogin) {
        await submitAuthentication();
        return;
      }

      // SIGNUP FLOW
      setButtonError("");

      // Request signup code BEFORE opening modal
      const result = await requestSignupCode(formData.email);

      if (result !== true) {
        setButtonError(result);
        playErrorResponse(setShake);
        return;
      }

      setShowSignupVerificationModal(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignupVerified() {
    await submitAuthentication();
  }

  function openForgotPassword() {
    setButtonError("");
    setShowForgotPasswordModal(true);
  }

  // must have only one be true
  if ((showLogin && showSignUp) || (!showLogin && !showSignUp)) {
    return <h1>Error in loading.</h1>
  }

  return (
    <>
      <Container
        className="vertical h-100 p-0"
        onKeyDown={handleKeyDown}
      >
        <Row className="flex-grow-1">
          <Col
            className="vertical-8 p-0"
          >
            <div className="p-0">
              <h1 className="text-center">{ showLogin ? "Login" : "Sign Up" }</h1>
              <hr />
            </div>
            <FormFull
              theme={"light"}
              fields={fields}
              formData={formData}
              setFormData={setFormData}
              errors={errors}
              setErrors={setErrors}
              setInputError={setButtonError}
            />
          </Col>
        </Row>
        <Row
          className="error-text-light at-middle-center mt-4 mb-2"
          style={{height: "48px"}}
        >{buttonError}</Row>
        <Row className="at-middle-center">
        {
          loading ? (
            <Spinner
              animation="border"
              role="status"
              style={{
                width: "48px",
                height: "48px",
                color: "var(--teal)",
              }}
            />
          ) : (
            <Button
              className={`button-light btn-large-text ${shake ? "shake" : ""}`}
              onClick={authButtonClick}
            >
              { showLogin ? "Login" : "Sign Up" }
            </Button>
          )
        }
        </Row>
        {
          showLogin && !loading && (
            <Row className="at-middle-center mt-3">
              <Button
                variant="link"
                className="btn-medium-text p-0 border-0 text-decoration-underline"
                style={{ color: "var(--teal-soft)", width: "fit-content" }}
                onClick={openForgotPassword}
              >
                Forgot password?
              </Button>
            </Row>
          )
        }
      </Container>

      <SignupVerificationModal
        show={showSignupVerificationModal}
        email={formData.email}
        onHide={() => setShowSignupVerificationModal(false)}
        onConfirm={handleSignupVerified}
      />

      <ForgotPasswordModal
        show={showForgotPasswordModal}
        onHide={() => setShowForgotPasswordModal(false)}
      />
    </>
  )
}

export default AuthSlide;