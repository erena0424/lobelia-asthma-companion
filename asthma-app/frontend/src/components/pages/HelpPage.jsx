import { useState } from "react";
import { Button } from "react-bootstrap";
import { Link } from "react-router";
import { useAuth } from "../../context/AuthContext";
import FormModal from "../input/FormModal";
import { ACTION_PLAN_SECTIONS, getPath } from "../profile/profileFields";
import {
  ACTIVITY_OPTIONS,
  BREATHING_LEVELS,
  DANGER_QUESTIONS,
  RELIEVER_OPTIONS,
  assessZone,
  hasDangerSign,
} from "../../helper-functions/breathingZones";
import { urls } from "../../constants";
import "./HelpPage.css";

// "Trouble breathing" flow (Figma frames 04, 11-13). Deterministic: danger signs
// first, then short questions, then ONE zone result from fixed rules. The AI is
// not involved; doses shown come only from the user's saved plan.
// Wording and rules need regulatory-claims and clinical-advisor review.
// Lobelia never calls, texts, or alerts anyone; every call here is the user's own tap.

const FIND_ER_URL = "https://www.google.com/maps/search/emergency+room+near+me";

const EMPTY_ANSWERS = {
  breathing: "",
  cough: null,
  wheeze: null,
  chest_tightness: null,
  usual_activities: "",
  woke_at_night: null,
  reliever: "",
  peak_flow: "",
};

const YES_NO = [
  { value: false, label: "No" },
  { value: true, label: "Yes" },
];

function telHref(phone) {
  return `tel:${String(phone || "").replace(/[^\d+]/g, "")}`;
}

function contactName(contact) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Emergency contact";
}

function planZone(plan, zone) {
  const section = ACTION_PLAN_SECTIONS.find((item) => item.zone === zone);
  const fields = section.fields.filter((field) => {
    const value = getPath(plan, field.path);
    return value !== null && value !== undefined && value !== "";
  });
  return { ...section, fields };
}

function SavedZone({ plan, zone }) {
  const section = planZone(plan, zone);
  if (section.fields.length === 0) return null;

  return (
    <div className="vertical-8">
      <h3 className={`help-plan-title zone-header zone-${zone}`}>Your saved plan says</h3>
      {section.fields.map((field) => (
        <p className="m-0 help-action-plan" key={field.path}>
          <strong>{field.label}:</strong> {String(getPath(plan, field.path))}
        </p>
      ))}
    </div>
  );
}

function Call911({ large = false }) {
  return (
    <a className={`help-call-button help-call-911 ${large ? "help-call-large" : ""}`} href="tel:911">
      Call 911
    </a>
  );
}

function CallList({ user }) {
  const contacts = (Array.isArray(user?.emergency_contacts) ? user.emergency_contacts : []).filter(
    (contact) => contact?.phone
  );
  const care = [user?.asthma_support?.clinician, user?.asthma_support?.urgent_care].filter(
    (contact) => contact?.phone
  );

  if (contacts.length + care.length === 0) {
    return (
      <p className="m-0">
        No contacts saved yet. <Link to={urls.profile}>Add them in your Profile.</Link>
      </p>
    );
  }

  return (
    <div className="help-contact-list">
      {contacts.map((contact, index) => (
        <a className="help-call-button" href={telHref(contact.phone)} key={contact.id || `c-${index}`}>
          Call {contactName(contact)}
          <span className="help-contact-phone">{contact.phone}</span>
        </a>
      ))}
      {care.map((contact, index) => (
        <a className="help-call-button" href={telHref(contact.phone)} key={`care-${index}`}>
          Call {contact.name || "my clinician"}
          <span className="help-contact-phone">{contact.phone}</span>
        </a>
      ))}
    </div>
  );
}

function Choice({ label, options, value, onChange }) {
  return (
    <fieldset className="help-question vertical-8">
      <legend>{label}</legend>
      <div className="check-in-chips">
        {options.map((option) => {
          const optionValue = typeof option === "object" ? option.value : option;
          const optionLabel = typeof option === "object" ? option.label : option;
          return (
            <button
              type="button"
              key={optionLabel}
              className={`check-in-chip ${value === optionValue ? "selected" : ""}`}
              aria-pressed={value === optionValue}
              onClick={() => onChange(optionValue)}
            >
              {optionLabel}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function EmergencyScreen({ user }) {
  return (
    <section className="help-card help-urgent vertical-16" role="alert">
      <h2 className="zone-header zone-red">Get emergency help now</h2>
      <p className="m-0">These signs can mean a serious asthma attack. Call 911 now.</p>
      <Call911 large />
      <a className="help-call-button" href={FIND_ER_URL} target="_blank" rel="noopener noreferrer">
        Find the nearest ER
      </a>
      <SavedZone plan={user?.action_plan} zone="red" />
      <h3 className="help-plan-title">Let someone know</h3>
      <CallList user={user} />
    </section>
  );
}

const RESULT_TITLES = {
  green: "GREEN ZONE · Keep up your daily plan",
  yellow: "YELLOW ZONE · Follow your Yellow Zone action plan",
  red: "RED ZONE · Get medical help now",
};

function ResultModal({ result, user, onReassess, onClose }) {
  const plan = user?.action_plan;
  const yellow = plan?.yellow || {};
  const hasYellowPlan = planZone(plan, "yellow").fields.length > 0;
  const hasRedPlan = planZone(plan, "red").fields.length > 0;
  const [tookReliever, setTookReliever] = useState(false);

  return (
    <FormModal title={RESULT_TITLES[result.zone]} onHide={onClose} onSubmit={onClose} showSubmit={false} color="light">
      <div className="vertical-16 help-result">
        <p className={`m-0 zone-header zone-${result.zone}`}>
          {result.reasons.length > 0
            ? `Because: ${result.reasons.join(", ").toLowerCase()}.`
            : "You didn't report symptoms right now."}
        </p>

        {result.zone === "green" && (
          <>
            <SavedZone plan={plan} zone="green" />
            <p className="m-0">If symptoms start or get worse, check again.</p>
          </>
        )}

        {result.zone === "yellow" && (
          <>
            {hasYellowPlan ? (
              <SavedZone plan={plan} zone="yellow" />
            ) : (
              <p className="m-0">
                Use your quick-relief inhaler the way your clinician prescribed. If you don't have an action plan yet,
                ask your clinician to make one with you and <Link to={urls.profile}>save it in your Profile</Link>.
              </p>
            )}

            {!tookReliever ? (
              <Button className="button-dark btn-medium-text" onClick={() => setTookReliever(true)}>
                I took my prescribed reliever
              </Button>
            ) : (
              <div className="vertical-8">
                <p className="m-0">
                  Check how you feel again
                  {yellow.repeat_every_minutes
                    ? ` in about ${yellow.repeat_every_minutes} minutes, as your plan says`
                    : " soon"}
                  .{yellow.if_not_improving ? ` If you're not improving: ${yellow.if_not_improving}` : ""}
                </p>
                <Button className="button-dark btn-medium-text" onClick={onReassess}>
                  Check again now
                </Button>
              </div>
            )}
            <p className="m-0">If you get worse at any point, call 911.</p>
            <Call911 />
          </>
        )}

        {result.zone === "red" && (
          <>
            {hasRedPlan ? (
              <SavedZone plan={plan} zone="red" />
            ) : (
              <p className="m-0">
                Use your quick-relief inhaler the way your clinician prescribed and get medical help now.
              </p>
            )}
            <Call911 large />
            <a className="help-call-button" href={FIND_ER_URL} target="_blank" rel="noopener noreferrer">
              Find the nearest ER
            </a>
            <CallList user={user} />
          </>
        )}

        <p className="help-note m-0">
          Prototype: these steps follow fixed rules that haven't been clinically validated yet. Lobelia is not a
          medical device and doesn't contact anyone for you.
        </p>
      </div>
    </FormModal>
  );
}

function HelpPage() {
  const { user } = useAuth();

  // 0..2 = danger questions, 3 = the short questions
  const [step, setStep] = useState(0);
  const [danger, setDanger] = useState({});
  const [answers, setAnswers] = useState(EMPTY_ANSWERS);
  const [result, setResult] = useState(null);
  const [missing, setMissing] = useState("");

  const emergency = hasDangerSign(danger);
  const peakFlow = user?.asthma_support?.peak_flow;
  const usesPeakFlow = Boolean(peakFlow?.personal_best || peakFlow?.red_below || peakFlow?.yellow_below);

  function answerDanger(key, value) {
    setDanger((current) => ({ ...current, [key]: value }));
    if (!value) setStep((current) => current + 1);
  }

  function update(field, value) {
    setAnswers((current) => ({ ...current, [field]: value }));
  }

  function restart() {
    setResult(null);
    setDanger({});
    setAnswers(EMPTY_ANSWERS);
    setMissing("");
    setStep(0);
  }

  function seeResult() {
    const unanswered = ["breathing", "usual_activities", "reliever"].filter((key) => !answers[key]);
    if (unanswered.length > 0) {
      setMissing("Please answer how much trouble you're having, usual activities, and the reliever question.");
      return;
    }

    setMissing("");
    setResult(assessZone(answers, peakFlow));
  }

  return (
    <main className="help-page vertical-24">
      <div className="help-always-911">
        <span>In an emergency, don't wait.</span>
        <Call911 />
      </div>

      {emergency && <EmergencyScreen user={user} />}

      {!emergency && step < DANGER_QUESTIONS.length && (
        <section className="help-card vertical-16" aria-live="polite">
          <p className="m-0 help-step">
            Quick safety check · {step + 1} of {DANGER_QUESTIONS.length}
          </p>
          <h2 className="m-0">{DANGER_QUESTIONS[step].text}</h2>
          <div className="help-yes-no">
            <Button
              className="button-alert btn-large-text"
              onClick={() => answerDanger(DANGER_QUESTIONS[step].key, true)}
            >
              Yes
            </Button>
            <Button
              className="button-dark btn-large-text"
              onClick={() => answerDanger(DANGER_QUESTIONS[step].key, false)}
            >
              No
            </Button>
          </div>
        </section>
      )}

      {!emergency && step >= DANGER_QUESTIONS.length && (
        <section className="help-card vertical-16">
          <h2 className="m-0">A few quick questions</h2>
          <Choice
            label="How much trouble are you having breathing?"
            options={BREATHING_LEVELS}
            value={answers.breathing}
            onChange={(value) => update("breathing", value)}
          />
          <Choice label="Coughing?" options={YES_NO} value={answers.cough} onChange={(value) => update("cough", value)} />
          <Choice label="Wheezing?" options={YES_NO} value={answers.wheeze} onChange={(value) => update("wheeze", value)} />
          <Choice
            label="Chest tightness?"
            options={YES_NO}
            value={answers.chest_tightness}
            onChange={(value) => update("chest_tightness", value)}
          />
          <Choice
            label="Can you do your usual activities?"
            options={ACTIVITY_OPTIONS}
            value={answers.usual_activities}
            onChange={(value) => update("usual_activities", value)}
          />
          <Choice
            label="Did your breathing wake you up?"
            options={YES_NO}
            value={answers.woke_at_night}
            onChange={(value) => update("woke_at_night", value)}
          />
          <Choice
            label="Have you used your reliever (rescue) inhaler?"
            options={RELIEVER_OPTIONS}
            value={answers.reliever}
            onChange={(value) => update("reliever", value)}
          />
          {usesPeakFlow && (
            <label className="help-question vertical-8">
              <span>Peak flow reading (optional)</span>
              <input
                type="number"
                min="50"
                max="900"
                value={answers.peak_flow}
                onChange={(event) => update("peak_flow", event.target.value)}
              />
            </label>
          )}
          {missing && <p className="error-text-dark m-0">{missing}</p>}
          <Button className="button-dark btn-large-text" onClick={seeResult}>
            See what to do
          </Button>
        </section>
      )}

      {(emergency || step > 0) && (
        <div className="at-middle-center">
          <Button variant="link" onClick={restart}>
            Start over
          </Button>
        </div>
      )}

      {result && (
        <ResultModal result={result} user={user} onReassess={restart} onClose={() => setResult(null)} />
      )}
    </main>
  );
}

export default HelpPage;
