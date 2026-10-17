import { Link } from "react-router";
import { urls } from "../../constants";
import "./PrivacyPage.css";

// One place that credits the health information behind Lobelia's tips, so the tips
// themselves stay short. Keep in step with asthma-app/knowledge/sources.json (enabled sources).
// Copy needs regulatory-claims review before launch.
const SOURCES = [
  {
    publisher: "U.S. Centers for Disease Control and Prevention (CDC)",
    items: [
      { title: "Controlling Asthma", url: "https://www.cdc.gov/asthma/control/index.html" },
      { title: "Living with Asthma", url: "https://www.cdc.gov/asthma/living-with/index.html" },
      { title: "What to Do When an Emergency Occurs", url: "https://www.cdc.gov/asthma/emergency/index.html" },
    ],
  },
  {
    publisher: "U.S. Environmental Protection Agency, AirNow",
    items: [
      { title: "Fires and Your Health", url: "https://www.airnow.gov/air-quality-and-health/fires-and-your-health/" },
    ],
  },
  {
    publisher: "National Heart, Lung, and Blood Institute (NHLBI)",
    items: [
      {
        title: "2020 Focused Updates to the Asthma Management Guidelines: Clinician's Guide",
        url: "https://www.nhlbi.nih.gov/sites/default/files/publications/Asthma%20Clinicians%20Guide%20508_02-03-21.pdf",
      },
    ],
  },
];

function SourcesPage() {
  return (
    <main className="privacy-page">
      <header className="privacy-header">
        <p className="privacy-brand">Lobelia</p>
        <h1>Sources</h1>
        <p className="privacy-intro">
          Lobelia's tips draw on general asthma information from the public health sources below. Weather, pollen and
          air quality come from live data services. These organizations do not review or endorse Lobelia.
        </p>
      </header>

      {SOURCES.map((group) => (
        <section key={group.publisher}>
          <h2>{group.publisher}</h2>
          <ul>
            {group.items.map((item) => (
              <li key={item.url}>
                <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <footer className="privacy-footer">
        <Link to={urls.landing}>Back to Lobelia</Link>
      </footer>
    </main>
  );
}

export default SourcesPage;
