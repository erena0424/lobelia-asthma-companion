import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { getActionPlan } from "../../helper-functions/actionPlan";
import { urls } from "../../constants";
import "./HelpPage.css";

// Wording on this page needs regulatory-claims and clinical-advisor review.
// Lobelia never calls, texts, or alerts anyone; every action here is the user's own tap.

function telHref(phone) {
  return `tel:${String(phone || "").replace(/[^\d+]/g, "")}`;
}

function contactName(contact) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Emergency contact";
}

function HelpPage() {
  const { token, user } = useAuth();

  const [actionPlan, setActionPlan] = useState("");
  const [planStatus, setPlanStatus] = useState("loading");

  const contacts = Array.isArray(user?.emergency_contacts)
    ? user.emergency_contacts.filter((contact) => contact?.phone)
    : [];

  useEffect(() => {
    let cancelled = false;

    getActionPlan(token)
      .then((text) => {
        if (cancelled) return;
        setActionPlan(text);
        setPlanStatus("success");
      })
      .catch(() => {
        if (!cancelled) setPlanStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="help-page vertical-24">
      <section className="help-card help-card-urgent vertical-16">
        <h2>Having trouble breathing?</h2>
        <p className="paragraph">
          Use your rescue inhaler the way your asthma action plan or your doctor told you to.
        </p>
        <p className="paragraph">
          If your breathing is getting worse, your rescue inhaler isn't helping, or you think it's an emergency, call 911.
        </p>
        <a className="help-call-button help-call-911" href="tel:911">
          Call 911
        </a>
      </section>

      <section className="help-card vertical-16">
        <h2>Call someone you trust</h2>
        {contacts.length > 0 ? (
          <div className="help-contact-list">
            {contacts.map((contact, index) => (
              <a
                className="help-call-button"
                href={telHref(contact.phone)}
                key={contact.id || `${contact.phone}-${index}`}
              >
                Call {contactName(contact)}
                <span className="help-contact-phone">{contact.phone}</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="paragraph">
            You haven't saved any emergency contacts yet.{" "}
            <Link to={urls.profile}>Add them in your Profile.</Link>
          </p>
        )}
      </section>

      <section className="help-card vertical-16">
        <h2>My asthma action plan</h2>
        {planStatus === "loading" && <p className="paragraph">Loading your plan...</p>}
        {planStatus === "error" && (
          <p className="paragraph">We couldn't load your action plan right now.</p>
        )}
        {planStatus === "success" && actionPlan && (
          <p className="paragraph help-action-plan">{actionPlan}</p>
        )}
        {planStatus === "success" && !actionPlan && (
          <p className="paragraph">
            You haven't added your action plan yet. Copy it from the plan your doctor gave you.{" "}
            <Link to={urls.profile}>Add it in your Profile.</Link>
          </p>
        )}
      </section>

      <p className="help-note">
        Lobelia does not contact anyone for you, does not monitor your breathing, and is not a medical device.
      </p>
    </main>
  );
}

export default HelpPage;
