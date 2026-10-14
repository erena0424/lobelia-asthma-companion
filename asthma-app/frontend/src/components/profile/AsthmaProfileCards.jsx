import { useState } from "react";
import { Card } from "react-bootstrap";
import FormModal from "../input/FormModal";
import EditButton from "../input/EditButton";
import { useAuth } from "../../context/AuthContext";
import { updateProfile } from "../../helper-functions/profile";
import {
  ACTION_PLAN_SECTIONS,
  PREFERENCE_FIELDS,
  SUPPORT_SECTIONS,
  cleanValue,
  getPath,
  setPath,
} from "./profileFields";
import "./AsthmaProfileCards.css";

export const PLAN_SOURCE_NOTE =
  "Copy these from the plan your clinician gave you. Medication instructions come from your clinician-created plan; Lobelia's AI never writes or changes them.";

function FieldInput({ field, value, onChange }) {
  const common = {
    value: value ?? "",
    onChange: (event) => onChange(event.target.value),
    placeholder: field.placeholder,
  };

  if (field.type === "textarea") {
    return <textarea rows="2" maxLength={field.max || 500} {...common} />;
  }

  if (field.type === "select") {
    return (
      <select {...common}>
        <option value="">Choose…</option>
        {field.options.map((option) => <option key={option}>{option}</option>)}
      </select>
    );
  }

  return (
    <input
      type={field.type === "number" ? "number" : field.type === "tel" ? "tel" : "text"}
      min={field.min}
      max={field.max}
      maxLength={field.type === "number" ? undefined : 300}
      {...common}
    />
  );
}

function SectionsEditor({ title, intro, sections, initial, onClose, onSave }) {
  const [draft, setDraft] = useState(initial || {});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (saving) return;

    let cleaned = {};
    for (const section of sections) {
      for (const field of section.fields) {
        cleaned = setPath(cleaned, field.path, cleanValue(field, getPath(draft, field.path)));
      }
    }

    setSaving(true);
    setError("");

    try {
      await onSave(cleaned);
      onClose();
    } catch (saveError) {
      setError(saveError.message || "Unable to save.");
      setSaving(false);
    }
  }

  return (
    <FormModal
      title={title}
      onHide={onClose}
      onSubmit={handleSave}
      submitText={saving ? "Saving…" : "Save"}
      color="light"
      buttonError={error}
    >
      <div className="vertical-16 asthma-editor">
        {intro && <p className="m-0">{intro}</p>}
        {sections.map((section) => (
          <fieldset key={section.title || "fields"} className="vertical-8">
            {section.title && (
              <legend className={section.zone ? `zone-header zone-${section.zone}` : ""}>{section.title}</legend>
            )}
            {section.fields.map((field) => (
              <label key={field.path} className="asthma-editor-field">
                <span>{field.label}</span>
                <FieldInput
                  field={field}
                  value={getPath(draft, field.path)}
                  onChange={(value) => setDraft((current) => setPath(current, field.path, value))}
                />
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </FormModal>
  );
}

function SectionsSummary({ sections, data, emptyMessage }) {
  const filled = sections
    .map((section) => ({
      ...section,
      fields: section.fields.filter((field) => {
        const value = getPath(data, field.path);
        return value !== null && value !== undefined && value !== "";
      }),
    }))
    .filter((section) => section.fields.length > 0);

  if (filled.length === 0) {
    return <p className="profile-empty-message">{emptyMessage}</p>;
  }

  return (
    <div className="asthma-summary vertical-16">
      {filled.map((section) => (
        <div key={section.title || "fields"} className="vertical-0">
          {section.title && (
            <h3 className={`asthma-summary-title ${section.zone ? `zone-header zone-${section.zone}` : ""}`}>
              {section.title}
            </h3>
          )}
          {section.fields.map((field) => (
            <p key={field.path} className="m-0">
              <strong>{field.label}:</strong> {String(getPath(data, field.path))}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

function ProfileSectionCard({ title, note, sections, data, emptyMessage, editorIntro, onSave }) {
  const [editing, setEditing] = useState(false);

  return (
    <Card className="green-theme border-contrast profile-list-card-wide asthma-card">
      <EditButton
        className="profile-edit-button button-light button-small"
        width="30"
        height="30"
        onClick={() => setEditing(true)}
        ariaLabel={`Edit ${title}`}
      />
      <h2 className="section-header-text text-center">{title}</h2>
      <hr />
      {note && <p className="asthma-card-note">{note}</p>}
      <SectionsSummary sections={sections} data={data} emptyMessage={emptyMessage} />

      {editing && (
        <SectionsEditor
          title={title}
          intro={editorIntro}
          sections={sections}
          initial={data}
          onClose={() => setEditing(false)}
          onSave={onSave}
        />
      )}
    </Card>
  );
}

function AsthmaProfileCards() {
  const { token, user, refreshUserProfile } = useAuth();

  async function save(updates) {
    await updateProfile({ token, updates });
    await refreshUserProfile();
  }

  const preferences = Object.fromEntries(
    PREFERENCE_FIELDS.map((field) => [field.path, user?.[field.path] ?? null])
  );

  return (
    <>
      <ProfileSectionCard
        title="My asthma action plan"
        note={PLAN_SOURCE_NOTE}
        sections={ACTION_PLAN_SECTIONS}
        data={user?.action_plan}
        emptyMessage="No action plan saved yet. Add it so it's one tap away when you need it."
        editorIntro={PLAN_SOURCE_NOTE}
        onSave={(plan) => save({ action_plan: plan })}
      />

      <ProfileSectionCard
        title="Asthma support information"
        sections={SUPPORT_SECTIONS}
        data={user?.asthma_support}
        emptyMessage="Add your inhalers, clinician, and preferred urgent care."
        onSave={(support) => save({ asthma_support: support })}
      />

      <ProfileSectionCard
        title="About you"
        note="Lobelia doesn't send reminders or messages yet; this helps us learn what you'd want."
        sections={[{ title: "", fields: PREFERENCE_FIELDS }]}
        data={preferences}
        emptyMessage="Tell Lobelia a bit about what you'd like help with."
        // the API skips null top-level fields, so only send the filled ones
        onSave={(values) =>
          save(Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null)))
        }
      />
    </>
  );
}

export default AsthmaProfileCards;
