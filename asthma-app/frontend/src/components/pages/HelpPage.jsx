import { Link } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { ACTION_PLAN_SECTIONS, getPath } from "../profile/profileFields";
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

// Red and yellow zones first: those are what someone needs when breathing is hard.
const PLAN_ORDER = ["Red zone · medical alert", "Yellow zone · getting worse", "Anything else from your plan", "Green zone · every day"];

function savedPlanSections(plan) {
  return PLAN_ORDER.map((title) => ACTION_PLAN_SECTIONS.find((section) => section.title === title))
    .map((section) => ({
      ...section,
      fields: section.fields.filter((field) => {
        const value = getPath(plan, field.path);
        return value !== null && value !== undefined && value !== "";
      }),
    }))
    .filter((section) => section.fields.length > 0);
}

function HelpPage() {
  const { user } = useAuth();

  const contacts = Array.isArray(user?.emergency_contacts)
    ? user.emergency_contacts.filter((contact) => contact?.phone)
    : [];

  const careContacts = [
    { label: "my clinician", contact: user?.asthma_support?.clinician },
    { label: "urgent care", contact: user?.asthma_support?.urgent_care },
  ].filter(({ contact }) => contact?.phone);

  const planSections = savedPlanSections(user?.action_plan);

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
        {contacts.length + careContacts.length > 0 ? (
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
            {careContacts.map(({ label, contact }) => (
              <a className="help-call-button" href={telHref(contact.phone)} key={label}>
                Call {contact.name || label}
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
        {planSections.length > 0 ? (
          <>
            {planSections.map((section) => (
              <div key={section.title} className="vertical-0">
                <h3 className="help-plan-title">{section.title}</h3>
                {section.fields.map((field) => (
                  <p className="paragraph help-action-plan m-0" key={field.path}>
                    <strong>{field.label}:</strong> {String(getPath(user.action_plan, field.path))}
                  </p>
                ))}
              </div>
            ))}
            <p className="help-note m-0">This is the plan you saved from your clinician. Lobelia doesn't change it.</p>
          </>
        ) : (
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
