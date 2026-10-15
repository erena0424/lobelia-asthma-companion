import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "../../context/AuthContext";
import {
  getProfile,
  updateProfile,
  uploadAndSaveProfileImage,
  deleteProfileImage,
} from "../../helper-functions/profile";
import "./ProfilePage.css";
import EditButton from "../input/EditButton";
import ProfileCircle from "../input/ProfileCircle";
import { Card, Button } from "react-bootstrap"
import EmergencyContactsManager from "../input/EmergencyContactsManager";
import FormModal from "../input/FormModal";
import CancelButton from "../input/CancelButton";
import AsthmaProfileCards from "../profile/AsthmaProfileCards";
import { FeedbackLink } from "../input/FeedbackModal";

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;

  const birthDate = new Date(`${dateOfBirth}T00:00:00`);

  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();

  const birthdayPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() >= birthDate.getDate());

  if (!birthdayPassed) {
    age -= 1;
  }

  return age;
}

function formatBirthdate(dateOfBirth) {
  if (!dateOfBirth) {
    return "No birthdate saved";
  }

  const birthDate = new Date(`${dateOfBirth}T00:00:00`);

  if (Number.isNaN(birthDate.getTime())) {
    return dateOfBirth;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(birthDate);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getSymptomsField(user) {
  if (!user) return null;

  if (
    Object.prototype.hasOwnProperty.call(
      user,
      "known_symptoms"
    )
  ) {
    return "known_symptoms";
  }

  if (
    Object.prototype.hasOwnProperty.call(user, "symptoms")
  ) {
    return "symptoms";
  }

  return null;
}

function EditIcon() {
  return <span aria-hidden="true">✎</span>;
}

function ProfilePage() {
  const { token, user, refreshUserProfile } = useAuth();
  const fileInputRef = useRef(null);

  const [pageStatus, setPageStatus] = useState("success");
  const [pageError, setPageError] = useState("");

  const [activeEditor, setActiveEditor] = useState(null);

  const [profileDraft, setProfileDraft] = useState({
    name: "",
    date_of_birth: "",
  });

  const [listDraft, setListDraft] = useState([]);
  const [newListItem, setNewListItem] = useState("");

  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] =
    useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [actionError, setActionError] = useState("");

  const symptomsField = useMemo(
    () => getSymptomsField(user),
    [user]
  );

  const symptoms = useMemo(() => {
    if (!symptomsField) return [];

    return normalizeStringArray(user?.[symptomsField]);
  }, [user, symptomsField]);

  const triggers = useMemo(
    () =>
      normalizeStringArray(user?.trigger_preferences),
    [user]
  );

  const emergencyContacts = useMemo(() => {
    if (!Array.isArray(user?.emergency_contacts)) {
      return [];
    }

    return user.emergency_contacts;
  }, [user]);

  const age = calculateAge(user?.date_of_birth);

  const photoSupported =
    user &&
    Object.prototype.hasOwnProperty.call(
      user,
      "profile_image_url"
    );

  function openProfileEditor() {
    setActionError("");

    setProfileDraft({
      name: user?.name || "",
      date_of_birth: user?.date_of_birth || "",
    });

    setActiveEditor("profile");
  }

  function openTriggersEditor() {
    setActionError("");
    setListDraft(triggers);
    setNewListItem("");
    setActiveEditor("triggers");
  }

  function openSymptomsEditor() {
    setActionError("");

    if (!symptomsField) {
      setActionError(
        "Symptoms are not currently stored by the profile API."
      );
      return;
    }

    setListDraft(symptoms);
    setNewListItem("");
    setActiveEditor("symptoms");
  }

  function closeEditor() {
    if (saving) return;

    setActiveEditor(null);
    setListDraft([]);
    setNewListItem("");
    setActionError("");
  }

  function addListItem() {
    const item = newListItem.trim();

    if (!item) return;

    const duplicate = listDraft.some(
      (currentItem) =>
        currentItem.toLowerCase() === item.toLowerCase()
    );

    if (duplicate) {
      setActionError("That item is already saved.");
      return;
    }

    setListDraft((currentItems) => [
      ...currentItems,
      item,
    ]);

    setNewListItem("");
    setActionError("");
  }

  function removeListItem(itemToRemove) {
    setListDraft((currentItems) =>
      currentItems.filter(
        (item) => item !== itemToRemove
      )
    );
  }

  async function saveProfileDetails() {
    try {
      setSaving(true);
      setActionError("");

      const updatedProfile = await updateProfile({
        token,
        updates: {
          name: profileDraft.name.trim(),
          date_of_birth:
            profileDraft.date_of_birth || null,
        },
      });

      await refreshUserProfile();
      setActiveEditor(null);
    } catch (error) {
      setActionError(
        error.message || "Unable to update your profile."
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveTriggers() {
    try {
      setSaving(true);
      setActionError("");

      const updatedProfile = await updateProfile({
        token,
        updates: {
          trigger_preferences: listDraft,
        },
      });

      await refreshUserProfile();
      setActiveEditor(null);
    } catch (error) {
      setActionError(
        error.message || "Unable to update your triggers."
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveSymptoms() {
    if (!symptomsField) {
      setActionError(
        "The backend does not support saved symptoms yet."
      );
      return;
    }

    try {
      setSaving(true);
      setActionError("");

      const updatedProfile = await updateProfile({
        token,
        updates: {
          [symptomsField]: listDraft,
        },
      });

      await refreshUserProfile();
      setActiveEditor(null);
    } catch (error) {
      setActionError(
        error.message || "Unable to update your symptoms."
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateEmergencyContacts(contacts) {
    try {
      setSaving(true);
      setActionError("");

      await updateProfile({
        token,
        updates: {
          emergency_contacts: contacts,
        },
      });

      await refreshUserProfile();
    } catch (error) {
      setActionError(
        error.message ||
        "Unable to update your emergency contacts."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePhoto() {
    try {
      setUploadingPhoto(true);
      setActionError("");

      await deleteProfileImage({
        token,
      });

      await refreshUserProfile();
    } catch (error) {
      setActionError(
        error.message || "Unable to remove your photo."
      );
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handlePhotoSelected(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!photoSupported) {
      setActionError(
        "Profile image storage is not available from the current backend."
      );
      event.target.value = "";
      return;
    }

    try {
      setUploadingPhoto(true);
      setActionError("");

      const updatedProfile =
        await uploadAndSaveProfileImage({
          file,
          token,
        });

      await refreshUserProfile();
    } catch (error) {
      setActionError(
        error.message || "Unable to upload your photo."
      );
    } finally {
      setUploadingPhoto(false);
      event.target.value = "";
    }
  }

  if (pageStatus === "loading") {
    return (
      <main className="profile-page-state">
        <h1>Profile</h1>
        <p>Loading your profile...</p>
      </main>
    );
  }

  if (pageStatus === "error") {
    return (
      <main className="profile-page-state">
        <h1>Profile</h1>
        <p className="profile-error">{pageError}</p>
      </main>
    );
  }

  return (
    <main className="vertical-40">

      {actionError && !activeEditor && (
        <p className="profile-global-error">
          {actionError}
        </p>
      )}

      <section className="profile-top-grid">
        <Card className="green-theme border-contrast text-center at-middle-center vertical-16" style={{justifyContent:"space-evenly"}}>
          <EditButton
            className="profile-edit-button button-light button-small"
            width="30"
            height="30"
            onClick={openProfileEditor}
            ariaLabel="Edit profile details"
          >
          </EditButton>

          <ProfileCircle
            imageUrl={user?.profile_image_url}
            size={"175px"}
            onClick={() => {
              if (!photoSupported) {
                setActionError(
                  "Profile image storage is not available from the current backend."
                );
                return;
              }

              setShowPhotoModal(true);
            }}
            disabled={uploadingPhoto}
            ariaLabel="Upload profile photo"
            theme={"light-theme"}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handlePhotoSelected}
            hidden
          />

          <div className="vertical-8">
            <h2 className={"section-header-text"}>{user?.name || "No name saved"}</h2>

            <p>
              {age === null
                ? "No age available"
                : `${age} years old`}
            </p>

            <p>{formatBirthdate(user?.date_of_birth)}</p>
          </div>
        </Card>

        <div className="profile-information-column">
          <ProfileListCard
            title="Known Symptoms"
            items={symptoms}
            emptyMessage={
              symptomsField
                ? "No symptoms saved"
                : "Symptoms are not available from the backend yet"
            }
            onEdit={
              symptomsField
                ? openSymptomsEditor
                : null
            }
            type="symptoms"
          />

          <ProfileListCard
            title="Known Triggers"
            items={triggers}
            emptyMessage="No triggers saved"
            onEdit={openTriggersEditor}
            type="triggers"
          />
        </div>
      </section>

      <ProfileListCard
          title="Emergency Contacts"
          items={emergencyContacts}
          emptyMessage="No emergency contacts saved"
          onEdit={() => setActiveEditor("contacts")}
          type="contacts"
      />

      <AsthmaProfileCards />

      <Card className="green-theme border-contrast profile-list-card-wide text-center">
        <h2 className="section-header-text">Feedback</h2>
        <hr />
        <p className="m-0">
          Something confusing, broken, or missing? <FeedbackLink>Send feedback to the Lobelia team</FeedbackLink>.
        </p>
      </Card>

      {activeEditor && (
        <div
          className="profile-modal-backdrop"
          role="presentation"
          onMouseDown={closeEditor}
        >
          <section
            className="profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-editor-title"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              className="profile-modal-close"
              onClick={closeEditor}
              aria-label="Close editor"
            >
              ×
            </button>

            {activeEditor === "profile" && (
              <>
                <h2 id="profile-editor-title">
                  Edit Profile
                </h2>

                <label className="profile-field">
                  <span>Name</span>

                  <input
                    type="text"
                    value={profileDraft.name}
                    onChange={(event) =>
                      setProfileDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="profile-field">
                  <span>Birthdate</span>

                  <input
                    type="date"
                    value={profileDraft.date_of_birth}
                    onChange={(event) =>
                      setProfileDraft((current) => ({
                        ...current,
                        date_of_birth:
                          event.target.value,
                      }))
                    }
                  />
                </label>

                <EditorError message={actionError} />

                <button
                  type="button"
                  className="profile-save-button"
                  onClick={saveProfileDetails}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </>
            )}

            {(activeEditor === "triggers" ||
              activeEditor === "symptoms") && (
              <>
                <h2 id="profile-editor-title">
                  Edit{" "}
                  {activeEditor === "triggers"
                    ? "Known Triggers"
                    : "Known Symptoms"}
                </h2>

                <div className="profile-editor-items">
                  {listDraft.map((item) => (
                    <div
                      className="profile-editor-item"
                      key={item}
                    >
                      <span>{item}</span>

                      <CancelButton
                        onClick={() =>
                            removeListItem(item)
                          }
                        className={"button-dark"}
                        width="20"
                        height="20"
                      />
                    </div>
                  ))}
                </div>

                <div className="profile-add-row">
                  <input
                    type="text"
                    value={newListItem}
                    placeholder="Add an item"
                    onChange={(event) =>
                      setNewListItem(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addListItem();
                      }
                    }}
                  />

                  <button
                    type="button"
                    onClick={addListItem}
                  >
                    Add
                  </button>
                </div>

                <EditorError message={actionError} />

                <button
                  type="button"
                  className="profile-save-button"
                  onClick={
                    activeEditor === "triggers"
                      ? saveTriggers
                      : saveSymptoms
                  }
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </>
            )}

            {activeEditor === "contacts" && (
                <>
                    <h2 id="profile-editor-title">
                        Edit Emergency Contacts
                    </h2>

                    <EmergencyContactsManager
                        contacts={emergencyContacts}
                        onChange={updateEmergencyContacts}
                        compact={true}
                    />

                    <EditorError message={actionError} />
                </>
            )}
          </section>
        </div>
      )}

      {showPhotoModal && (
        <FormModal
          title="Profile Photo"
          onHide={() => setShowPhotoModal(false)}
          onSubmit={() => setShowPhotoModal(false)}
          submitText="Cancel"
          showSubmit={false}
        >
          <div className="vertical-16 at-middle-center">
            <Button
              className="button-light body-text"
              onClick={() => {
                setShowPhotoModal(false);
                fileInputRef.current?.click();
              }}
            >
              {user?.profile_image_url
                ? "Change Photo"
                : "Add Photo"}
            </Button>

            {user?.profile_image_url && (
              <Button
                className="button-light body-text"
                disabled={uploadingPhoto}
                onClick={async () => {
                  await handleDeletePhoto();
                  setShowPhotoModal(false);
                }}
              >
                {uploadingPhoto
                  ? "Removing..."
                  : "Remove Photo"}
              </Button>
            )}
          </div>
        </FormModal>
      )}
    </main>
  );
}

function ProfileListCard({
  title,
  items,
  emptyMessage,
  onEdit,
  wide = true,
  type = "strings"
}) {
  return (
    <Card
      className={`green-theme border-contrast text-center ${
        wide ? "profile-list-card-wide" : ""
      }`}
    >
      {onEdit && (
        <EditButton
          className="profile-edit-button button-light button-small"
          width="30"
          height="30"
          onClick={onEdit}
          ariaLabel={`Edit ${title}`}
        >
        </EditButton>
      )}

      <h2 className={"section-header-text"}>{title}</h2>

      <hr />

      {items.length > 0 ? (
          <div className="profile-chip-list">
            {type === "contacts"
              ? items.map(contact => (
                  <div
                      className="profile-chip"
                      key={contact.id}
                  >
                      <div>
                          {contact.firstName} {contact.lastName}
                      </div>

                      {contact.phone && (
                          <div>{contact.phone}</div>
                      )}
                  </div>
              ))
              : items.map(item => (
                  <span
                      className="profile-chip"
                      key={item}
                  >
                      {item}
                  </span>
              ))}
          </div>
        ) : (
          <p className="profile-empty-message">
            {emptyMessage}
          </p>
      )}
    </Card>
  );
}

function EditorError({ message }) {
  if (!message) return null;

  return <p className="profile-error">{message}</p>;
}

export default ProfilePage;