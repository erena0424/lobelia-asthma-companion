import { Link } from "react-router";
import { urls } from "../../../constants";

function WelcomeStep() {
  return (
    <div className="vertical-16 text-center">
      <p className="section-text">
        Let's set up your account.
      </p>
      <p className="paragraph">
        We'll ask for your name, emergency contacts, asthma triggers, and symptoms.
        Lobelia uses them to personalize your daily tips and companion chat.
        You can edit them later.
      </p>
      <p className="paragraph">
        Lobelia is not a medical device and does not diagnose, treat, or prescribe.
        It does not replace professional medical advice or your asthma action plan.
        If you are having trouble breathing, follow your asthma action plan and call 911 if it is an emergency.
      </p>
      <p className="paragraph">
        <Link to={urls.privacy} target="_blank" rel="noopener noreferrer">
          Read how we handle your information (Privacy Policy)
        </Link>
      </p>
    </div>
  );
}

export default WelcomeStep;
