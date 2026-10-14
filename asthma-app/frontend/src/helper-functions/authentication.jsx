import { API_URL } from "../config"

const invalidCode = "The code you gave is either incorrect or has expired. Please try again."
const serverUnavailable = "We couldn't reach Lobelia. The server may be waking up, so please try again in a few seconds."

// returned by getProfile when the saved session is no longer valid
export const SESSION_EXPIRED = "SESSION_EXPIRED";

export async function getProfile(token) {
  try {
    const res = await fetch(`${API_URL}/v1/users/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return SESSION_EXPIRED;
      }

      return "Unable to retrieve profile.";
    }

    return await res.json();
  }
  catch (err) {
    return "Trouble Processing. Please try again later.";
  }
}

export async function login(email, password) {
  try {
    const res = await fetch(`${API_URL}/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    });

    if (!res.ok) {
      // 5xx means the server (not the password) is the problem, e.g. a cold start
      if (res.status >= 500) {
        return serverUnavailable;
      }

      return "Invalid credentials.";
    }

    const data = await res.json();
    return data.access_token; // JWT
  }
  catch (err) {
    return serverUnavailable;
  }
}

export async function signUp(email, password) {
  try {
    const res = await fetch(`${API_URL}/v1/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    });

    if (!res.ok) {
      if(res.status == 409) {
        return "Email already exists.";
      }
      else {
        return "Invalid credentials.";
      }
    }

    const data = await res.json();

    return data.access_token; // JWT
  }
  catch (err) {
    return "Trouble Processing. Please try again later.";
  }
}

export async function requestSignupCode(email) {
  try {
    const res = await fetch(`${API_URL}/v1/auth/signup-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });

    if (!res.ok) {
      if (res.status == 409) {
        return "Email already exists.";
      }

      return "We couldn't send your code. Please try again in a few seconds.";
    }

    return true;
  }
  catch (err) {
    return serverUnavailable;
  }
}

export async function verifySignupCode(email, code) {
  try {
    const res = await fetch(`${API_URL}/v1/auth/signup-code/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, code })
    });

    if (!res.ok) {
      if (res.status == 400) {
        return invalidCode;
      }

      return "Trouble Processing. Please try again later.";
    }

    return true;
  }
  catch (err) {
    return "Trouble Processing. Please try again later.";
  }
}

export async function requestResetCode(email) {
  try {
    const res = await fetch(`${API_URL}/v1/auth/reset-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });

    if (!res.ok) {
      if (res.status == 404) {
        return "Email not found.";
      }

      return "Trouble Processing. Please try again later.";
    }

    return true;
  }
  catch (err) {
    return "Trouble Processing. Please try again later.";
  }
}

export async function verifyResetCode(email, code) {
  try {
    const res = await fetch(`${API_URL}/v1/auth/reset-code/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, code })
    });

    if (!res.ok) {
      if (res.status == 400) {
        return invalidCode;
      }

      return "Trouble Processing. Please try again later.";
    }

    return true;
  }
  catch (err) {
    return "Trouble Processing. Please try again later.";
  }
}

export async function resetPassword(email, password, code) {
  try {
    const res = await fetch(`${API_URL}/v1/auth/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password,
        code
      })
    });

    if (!res.ok) {
      if (res.status == 400) {
        return invalidCode;
      }

      if (res.status == 404) {
        return "Email not found.";
      }

      return "Trouble Processing. Please try again later.";
    }

    return true;
  }
  catch (err) {
    return "Trouble Processing. Please try again later.";
  }
}

export function isJwt(token) {
  if (typeof token !== "string") return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [header, payload, signature] = parts;

  // Basic base64url check
  const base64urlRegex = /^[A-Za-z0-9\-_]+$/;
  if (!base64urlRegex.test(header)) return false;
  if (!base64urlRegex.test(payload)) return false;
  if (!base64urlRegex.test(signature)) return false;

  try {
    // Convert base64url → base64
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");

    // Decode
    const decoded = atob(normalizedPayload);

    // Payload must be valid JSON
    JSON.parse(decoded);

    return true;
  } catch {
    return false;
  }
}
