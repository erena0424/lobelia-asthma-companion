import { Link } from "react-router";
import AuthForm from "../landing/AuthForm";
import { urls } from "../../constants";
import "./MarketingLanding.css";

// Log in / Sign up as a centred card (replaces the old sliding landing panel).
// AuthForm keeps all existing behaviour: validation, signup code, forgot password.
function AuthPage({ mode }) {
  const isLogin = mode === "login";

  return (
    <div className="lp auth-page">
      <header className="lp-header lp-container">
        <Link className="lp-wordmark auth-wordmark" to={urls.landing}>Lobelia</Link>
      </header>

      <main className="lp-container auth-main">
        <div className="auth-card dark-green-body">
          <AuthForm key={mode} showLogin={isLogin} showSignUp={!isLogin} />
        </div>

        <p className="auth-switch">
          {isLogin ? (
            <>New to Lobelia? <Link to={urls.signup}>Create an account</Link></>
          ) : (
            <>Already have an account? <Link to={urls.login}>Log in</Link></>
          )}
        </p>
        <p className="lp-fine auth-fine">
          Lobelia is not a medical device. <Link to={urls.privacy}>Privacy Policy</Link>
        </p>
      </main>
    </div>
  );
}

export default AuthPage;
