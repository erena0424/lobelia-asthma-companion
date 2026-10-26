import { Link } from "react-router";
import lungFlowers from "../../assets/images/lungFlowers.png";
import { FeedbackLink } from "../input/FeedbackModal";
import MoodFace from "../input/MoodFace";
import { urls } from "../../constants";
import "./MarketingLanding.css";

// Public landing page: a picture of the product per section, plus a few short lines.
// Examples are invented and labelled. Pattern copy compares days, never implies cause.
// ALL COPY IS A DRAFT and needs regulatory-claims review before public use.

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
    a: "Only if you connect Google Calendar. Lobelia then shows your events and lets you edit or delete them, and it only changes an event when you do. You can also add plans yourself without connecting anything.",
  },
  {
    q: "What if I'm having an asthma attack?",
    a: "Follow your asthma action plan and call 911 in an emergency. Lobelia's help screen shows your saved plan and call buttons, but it doesn't contact anyone for you or monitor your breathing.",
  },
];

function Ticks({ items }) {
  return (
    <ul className="lp-ticks">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function SampleOutlook() {
  return (
    <figure className="lp-shot" aria-label="Invented example of a Today screen">
      <figcaption className="lp-shot-tag">Invented example</figcaption>
      <div className="lp-shot-outlook">
        <span className="lp-level"><i aria-hidden="true" />Medium</span>
        <p className="lp-shot-headline">Pollen is elevated today, and temperatures will drop this evening.</p>
        <div className="lp-readouts">
          <span>Pollen<b>Moderate</b></span>
          <span>Air quality<b>Good</b></span>
          <span>Temperature<b>68° → 49°F</b></span>
        </div>
      </div>
      <ul className="lp-shot-plans">
        <li><span>2:30 PM</span><div><b>Chemistry lab</b><small>Strong scents and fumes in the lab.</small></div></li>
        <li><span>5:00 PM</span><div><b>Skating</b><small>Cold rink air. A scarf over your mouth may help.</small></div></li>
      </ul>
    </figure>
  );
}

// Same chart as Insights (condition level up the side, average symptom level 0-10 across).
const SAMPLE_POLLEN = [
  { level: "Low", avg: 1.1, days: 29 },
  { level: "Moderate", avg: 3.3, days: 19 },
  { level: "High", avg: 5.2, days: 15 },
  { level: "Very High", avg: 6.6, days: 7 },
];

function SamplePatterns() {
  // compact drawing so the labels stay readable when the card is phone-width
  const x = (value) => 96 + value * 25;
  const y = (index) => 144 - index * 42;
  return (
    <figure className="lp-shot" aria-label="Invented example of a patterns chart">
      <figcaption className="lp-shot-tag">Invented example</figcaption>
      <div className="lp-chart-head"><h3>Pollen</h3><span>Average symptom level, 0–10</span></div>
      <svg className="lp-chart" viewBox="0 0 400 200" role="img"
        aria-label="Example: average symptom level was 1.1 on low pollen days, 3.3 on moderate, 5.2 on high and 6.6 on very high">
        {SAMPLE_POLLEN.map((point, index) => (
          <g key={point.level}>
            <line className="lp-chart-row" x1="96" x2="346" y1={y(index)} y2={y(index)} />
            <text className="lp-chart-level" x="88" y={y(index) + 4} textAnchor="end">{point.level}</text>
            <text className="lp-chart-days" x="398" y={y(index) + 4} textAnchor="end">{point.days} days</text>
          </g>
        ))}
        <line className="lp-chart-axis" x1="96" x2="96" y1="8" y2="154" />
        <line className="lp-chart-axis" x1="96" x2="346" y1="154" y2="154" />
        <line className="lp-chart-mid" x1="221" x2="221" y1="8" y2="154" />
        <polyline className="lp-chart-line" points={SAMPLE_POLLEN.map((point, index) => `${x(point.avg)},${y(index)}`).join(" ")} />
        {SAMPLE_POLLEN.map((point, index) => (
          <circle key={point.level} className="lp-chart-point" cx={x(point.avg)} cy={y(index)} r="5" />
        ))}
        {[0, 5, 10].map((tick) => <text key={tick} className="lp-chart-days" x={x(tick)} y="172" textAnchor="middle">{tick}</text>)}
        <text className="lp-chart-days" x="221" y="192" textAnchor="middle">Average symptom level</text>
      </svg>
      <p className="lp-chart-caption">Average 6.6 on 7 very high pollen days, compared with 1.1 on 29 low pollen days.</p>
      <div className="lp-noted">
        <div className="lp-noted-legend"><span><i className="lp-dot is-with" />Days with it</span><span><i className="lp-dot is-without" />Other days</span></div>
        {[
          { label: "Cold air", without: 2.9, with: 4.8 },
          { label: "Skating", without: 2.2, with: 5.2 },
        ].map((row) => (
          <div className="lp-noted-row" key={row.label}>
            <span>{row.label}</span>
            <div className="lp-scale">
              <span className="lp-scale-track" />
              <span className="lp-dot is-without" style={{ left: `${row.without * 10}%` }} />
              <span className="lp-dot is-with" style={{ left: `${row.with * 10}%` }} />
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

const STEPS = [
  {
    title: "Check in",
    body: "Four quick questions. The rest is up to you.",
    picture: (
      <div className="lp-step-checkin">
        <div className="lp-step-faces">
          <MoodFace level={3} size={24} /><MoodFace level={4} selected size={24} /><MoodFace level={5} size={24} />
        </div>
        <div className="lp-step-yn"><span>Yes</span><span className="is-on">No</span></div>
      </div>
    ),
  },
  {
    title: "Lobelia reads your day",
    body: "Conditions, your check-ins and your plans.",
    picture: (
      <div className="lp-readouts lp-step-readouts">
        <span>Pollen<b>High</b></span><span>Air<b>Good</b></span><span>Low<b>44°F</b></span>
      </div>
    ),
  },
  {
    title: "Get tips through the day",
    body: "A morning outlook, then a tip before each plan.",
    picture: (
      <div className="lp-step-tip"><span>5:00</span><div><b>Skating</b><small>Cold rink air tonight.</small></div></div>
    ),
  },
];

const icon = (paths) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);

const TILES = [
  {
    title: "Daily outlook",
    body: "Low, Medium or High, with the reasons.",
    icon: icon(<><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>),
  },
  {
    title: "Your calendar",
    body: "Add plans, or connect Google Calendar.",
    icon: icon(<><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>),
  },
  {
    title: "Insights",
    body: "Trends and possible patterns over time.",
    icon: icon(<path d="M4 19h16M7 16v-5M12 16V7M17 16v-3" />),
  },
  {
    title: "Help when it's hard",
    body: "Your saved action plan, and buttons to call 911.",
    icon: icon(<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z" />),
    help: true,
  },
];

const TRUST = [
  { title: "Not a medical device", body: "It doesn't replace your clinician.", icon: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>) },
  { title: "You choose what to share", body: "Edit or remove it anytime.", icon: icon(<path d="M5 12l4 4 10-10" />) },
  { title: "Your action plan stays yours", body: "It's never sent to the AI.", icon: icon(<><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>) },
];

function MarketingLanding() {
  return (
    <div className="lp">
      <header className="lp-header lp-container">
        <span className="lp-wordmark"><img src={lungFlowers} alt="" className="lp-wordmark-mark" />Lobelia</span>
        <nav className="lp-header-actions" aria-label="Account">
          <Link className="lp-btn lp-btn-secondary" to={urls.login}>Log in</Link>
          <Link className="lp-btn lp-btn-primary" to={urls.signup}>Sign up</Link>
        </nav>
      </header>

      <main>
        <section className="lp-hero lp-container">
          <div className="lp-hero-text">
            <h1 className="lp-hero-title">Plan your day around your asthma.</h1>
            <p className="lp-lead">Weather, pollen, air quality and your check-ins, in one daily outlook.</p>
            <div className="lp-actions">
              <Link className="lp-btn lp-btn-primary lp-btn-lg" to={urls.signup}>Sign up</Link>
              <Link className="lp-btn lp-btn-secondary lp-btn-lg" to={urls.login}>Log in</Link>
            </div>
            <p className="lp-fine">Not a medical device. Doesn't replace your clinician or your asthma action plan.</p>
          </div>
          <img className="lp-hero-art" src={lungFlowers} alt="Illustration of lungs made of flowers" />
        </section>

        <section className="lp-section lp-container lp-split">
          <div className="lp-split-copy">
            <p className="lp-eyebrow">Every morning</p>
            <h2>One outlook, and a tip for each plan</h2>
            <Ticks items={["Low, Medium or High, in plain words", "Pollen, air quality and temperature", "A short tip before each plan"]} />
          </div>
          <SampleOutlook />
        </section>

        <section className="lp-section lp-container lp-split lp-split-reverse">
          <SamplePatterns />
          <div className="lp-split-copy">
            <p className="lp-eyebrow">Over time</p>
            <h2>See patterns in your own days</h2>
            <Ticks items={["Your symptom level, compared on low and high pollen days", "Cold nights and air quality, too", "Plus the triggers and plans you note"]} />
            <p className="lp-fine">Patterns to talk over with your clinician, not causes.</p>
          </div>
        </section>

        <section className="lp-section lp-container">
          <p className="lp-eyebrow">How it works</p>
          <h2>Three small steps</h2>
          <ol className="lp-steps">
            {STEPS.map((step, index) => (
              <li key={step.title} className="lp-step">
                <div className="lp-step-pic" aria-hidden="true">{step.picture}</div>
                <div className="lp-step-words">
                  <h3>{index + 1} · {step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section lp-container">
          <p className="lp-eyebrow">What you get</p>
          <h2>Built around your real day</h2>
          <div className="lp-tiles">
            {TILES.map((tile) => (
              <article key={tile.title} className={`lp-tile ${tile.help ? "is-help" : ""}`}>
                {tile.icon}
                <h3>{tile.title}</h3>
                <p>{tile.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section lp-container">
          <h2>Clear about what Lobelia is</h2>
          <ul className="lp-trust-list">
            {TRUST.map((item) => (
              <li key={item.title}>{item.icon}<span><b>{item.title}</b>{item.body}</span></li>
            ))}
          </ul>
          <p className="lp-fine"><Link to={urls.privacy}>Read the Privacy Policy</Link></p>
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
        <p>Lobelia is not a medical device and does not diagnose, treat, or prescribe. In an emergency, call 911.</p>
        <p>
          <Link to={urls.privacy}>Privacy Policy</Link> · <Link to={urls.sources}>Sources</Link> · <FeedbackLink>Send feedback</FeedbackLink>
        </p>
      </footer>
    </div>
  );
}

export default MarketingLanding;
