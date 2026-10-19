import { useEffect } from "react";

// The policy lives in public/privacy/index.html so it has a plain URL
// (https://lobelia.app/privacy) for Google OAuth verification. This hash route
// only forwards there, so there is one copy of the policy to keep current.
export const PRIVACY_POLICY_PATH = `${import.meta.env.BASE_URL}privacy/`;

function PrivacyPage() {
  useEffect(() => {
    window.location.replace(PRIVACY_POLICY_PATH);
  }, []);

  return (
    <main style={{ maxWidth: "42rem", margin: "0 auto", padding: "2.5rem 1.25rem" }}>
      <p>
        Opening the <a href={PRIVACY_POLICY_PATH}>Privacy Policy</a>…
      </p>
    </main>
  );
}

export default PrivacyPage;
