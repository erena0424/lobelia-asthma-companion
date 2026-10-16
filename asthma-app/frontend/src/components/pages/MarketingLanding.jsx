import { Link } from "react-router";
import lungFlowers from "../../assets/images/lungFlowers.png";
import { FeedbackLink } from "../input/FeedbackModal";
import { urls } from "../../constants";
import "./MarketingLanding.css";

// Public landing page (docs/design/redesign-plan.md §5).
// ALL COPY IS A DRAFT and needs regulatory-claims review before public use.

const STEPS = [
  { title: "Check in for a minute", body: "Tell Lobelia how you feel and how your breathing is. Every question but one is optional." },
  { title: "Lobelia reads your day", body: "It looks at local weather, pollen and air quality, your recent check-ins, and the plans you add." },
  { title: "Get guidance through the day", body: "A morning outlook, then a short, practical tip before each plan." },
];

const FEATURES = [
  {
    title: "A daily outlook you can understand",
    body: "Low, Medium or High, with the main reasons in plain words. It's an estimate to help you plan, not a diagnosis.",
  },
  {
    title: "Tips for each part of your day",
    body: "Add a lab, a run or a night out and get one short tip for it, like cold air before skating or strong scents in a lab.",
  },
  {
    title: "Your plans in one calendar",
    body: "Month, week and day views. Click a time to add a plan, or connect Google Calendar (read-only).",
  },
  {
    title: "Help that follows your own action plan",
    body: "If breathing gets hard, Lobelia shows danger signs first, then the steps you saved from your clinician's plan, with buttons to call 911 or someone you trust. Fixed rules decide the zone, never the AI, and your plan is never sent to the AI.",
  },
];

const FAQ = [
  {
    q: "Is Lobelia medical advice?",
    a: "No. Lobelia supports everyday self-management. It doesn't diagnose, treat, or replace your clinician or your asthma action plan.",
  },
  {
    q: "How is the outlook made?",
    a: "A model looks at local weather, pollen and air quality together with your recent check-ins and shows Low, Medium or High. It's an estimate to help you plan, not a prediction you should rely on for medical decisions.",
  },
  {
    q: "What information does Lobelia use?",
    a: "Your check-ins, the profile details you choose to add, the plans you enter, and your approximate location for weather and air quality. See the Privacy Policy for details.",
  },
  {
    q: "Does it read my calendar?",
    a: "Only if you connect Google Calendar, and then read-only. You can also add plans yourself without connecting anything.",
  },
  {
    q: "What if I'm having an asthma attack?",
    a: "Follow your asthma action plan and call 911 in an emergency. Lobelia's help screen shows your saved plan and call buttons, but it doesn't contact anyone for you or monitor your breathing.",
  },
];

function SampleOutlook() {
  return (
    <figure className="lp-sample" aria-label="Invented example of a Today screen">
      <figcaption className="lp-sample-tag">Invented example</figcaption>
      <div className="lp-sample-outlook">
        <span className="lp-badge lp-badge-medium">Medium</span>
        <p className="lp-sample-title">Today's outlook</p>
        <p className="lp-sample-text">Moderate pollen and a cold evening. Keep your rescue inhaler with you.</p>
        <div className="lp-chips">
          <span>Moderate pollen</span>
          <span>Cold air tonight</span>
        </div>
      </div>
      <ul className="lp-sample-plans">
        <li>
          <span className="lp-time">2:30 PM</span>
          <div>
            <strong>Chemistry lab</strong>
            <span>Be mindful of strong scents and fumes.</span>
          </div>
        </li>
        <li>
          <span className="lp-time">5:00 PM</span>
          <div>
            <strong>Skating</strong>
            <span>Cold air can be a trigger. A scarf over your mouth may help.</span>
          </div>
        </li>
      </ul>
    </figure>
  );
}

function MarketingLanding() {
  return (
    <div className="lp">
      <header className="lp-header lp-container">
        <span className="lp-wordmark">Lobelia</span>
        <nav className="lp-header-actions" aria-label="Account">
          <Link className="lp-btn lp-btn-quiet" to={urls.login}>Log in</Link>
          <Link className="lp-btn lp-btn-primary" to={urls.signup}>Sign up</Link>
        </nav>
      </header>

      <main>
        <section className="lp-hero lp-container">
          <div className="lp-hero-text">
            <h1 className="lp-hero-title">Plan your day around your asthma.</h1>
            <p className="lp-lead">
              Lobelia brings together today's weather, pollen and air quality, your quick check-ins, and your plans,
              then gives you a simple daily outlook and practical tips before each part of your day.
            </p>
            <div className="lp-actions">
              <Link className="lp-btn lp-btn-primary lp-btn-lg" to={urls.signup}>Sign up</Link>
              <Link className="lp-btn lp-btn-secondary lp-btn-lg" to={urls.login}>Log in</Link>
            </div>
            <p className="lp-fine">Not a medical device. Doesn't replace your clinician or your asthma action plan.</p>
          </div>
          <img className="lp-hero-art" src={lungFlowers} alt="Illustration of lungs made of flowers" />
        </section>

        <section className="lp-section lp-container lp-example">
          <div>
            <p className="lp-eyebrow">An example</p>
            <h2>What a day in Lobelia looks like</h2>
            <p>
              Each morning you get one outlook for the day and a tip for each plan you've added. It's short, so you can
              read it on your way out the door.
            </p>
          </div>
          <SampleOutlook />
        </section>

        <section className="lp-section lp-container">
          <p className="lp-eyebrow">How it works</p>
          <h2>Three small steps</h2>
          <ol className="lp-steps">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="lp-step-number" aria-hidden="true">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section lp-container">
          <p className="lp-eyebrow">What you get</p>
          <h2>Built around your real day</h2>
          <div className="lp-features">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="lp-feature">
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section lp-container lp-trust">
          <h2>Clear about what Lobelia is</h2>
          <ul>
            <li><strong>Not a medical device.</strong> Lobelia doesn't replace your clinician or your action plan.</li>
            <li>
              <strong>You choose what to share.</strong> Check-ins, profile details and plans are optional, and you can
              edit them anytime.
            </li>
            <li>
              <strong>How it's used.</strong> Your information personalizes your outlook and tips. Some of it is
              processed by AI services to write tips; your action plan never is.
            </li>
          </ul>
          <Link to={urls.privacy}>Read the Privacy Policy</Link>
        </section>

        <section className="lp-section lp-container">
          <h2>Questions</h2>
          <div className="lp-faq">
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-section lp-container lp-final">
          <h2>Start with a one-minute check-in</h2>
          <div className="lp-actions">
            <Link className="lp-btn lp-btn-primary lp-btn-lg" to={urls.signup}>Sign up</Link>
            <Link className="lp-btn lp-btn-secondary lp-btn-lg" to={urls.login}>Log in</Link>
          </div>
        </section>
      </main>

      <footer className="lp-footer lp-container">
        <p>
          Lobelia is not a medical device and does not diagnose, treat, or prescribe. In an emergency, call 911.
        </p>
        <p>
          <Link to={urls.privacy}>Privacy Policy</Link> · <Link to={urls.sources}>Sources</Link> · <FeedbackLink>Send feedback</FeedbackLink>
        </p>
      </footer>
    </div>
  );
}

export default MarketingLanding;
