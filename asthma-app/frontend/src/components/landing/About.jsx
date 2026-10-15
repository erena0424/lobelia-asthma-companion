import { Nav, Container } from "react-bootstrap";
import { NavLink } from "react-router";
import { urls } from "../../constants";
import { FeedbackLink } from "../input/FeedbackModal";

function About() {
    const horiPad = 50;

    return (
        <Container
            className="vertical-8 h-100 p-0"
            style={{justifyContent: "space-between"}}
        >
            <div className="vertical-24">
                <h2 style={{textAlign: "center", paddingLeft:`${horiPad}px`, paddingRight:`${horiPad}px`}}>
                    Breathe and blossom. Don't let asthma stop you.
                </h2>
                <div className="vertical-8">
                    <p className="paragraph">
                        <strong>
                            Personalized asthma self-management for living life on your terms.
                        </strong>
                    </p>
                    <p className="paragraph">
                        Lobelia is a personal asthma management app that helps you make informed decisions based on your symptoms, trusted medical knowledge, and plans for the day. By bringing these factors together, Lobelia helps you manage your asthma while making the most of your everyday life.
                    </p>
                </div>
            </div>

            <div className="vertical-8">
                <h3>
                    How Lobelia Works
                </h3>
                <div className="vertical-8">
                    <p className="paragraph">
                        <strong>Understand your symptoms:</strong> Track your symptoms, triggers, and other health information to build a clear personal record and help Lobelia better understand your condition over time.
                    </p>
                    <br />
                    <p className="paragraph">
                        <strong>Know your risk:</strong> Lobelia combines your health information with environmental factors such as weather, air quality, and pollen to forecast your short-term asthma risk.
                    </p>
                    <br />
                    <p className="paragraph">
                        <strong>Plan with context:</strong> Connect your calendar so Lobelia can consider your plans and activities when providing personalized guidance.
                    </p>
                    <br />
                    <p className="paragraph">
                        <strong>Make informed decisions:</strong> Lobelia brings these insights together to help you decide how to approach your day while managing your asthma.
                    </p>
                    <br />
                </div>
            </div>

            <div className="vertical-8">
                <h3>
                    Medical Disclaimer
                </h3>
                <p className="paragraph">
                    Lobelia provides personalized asthma self-management support and risk forecasts. It is not a medical device and does not diagnose, treat, or prescribe. Lobelia does not replace professional medical advice or your asthma action plan.
                </p>
            </div>
            
            <h3>
                <Nav.Link className="text-decoration-underline" as={NavLink} to={urls.privacy} end>
                    Privacy Policy
                </Nav.Link>
            </h3>

            <p className="paragraph m-0">
                Feedback or questions? <FeedbackLink className="feedback-link-light">Send us a note</FeedbackLink>
            </p>
        </ Container>
    );
}

export default About;