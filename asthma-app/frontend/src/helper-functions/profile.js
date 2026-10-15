// same API base as the rest of the app (local dev, LAN devices and production)
import { API_URL } from "../config";

const CLOUDINARY_CLOUD_NAME =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;

const CLOUDINARY_UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getApiError(data, fallback) {
  if (typeof data?.detail === "string") {
    return data.detail;
  }

  if (typeof data?.detail?.message === "string") {
    return data.detail.message;
  }

  if (typeof data?.message === "string") {
    return data.message;
  }

  return fallback;
}

export async function getProfile(token) {
  if (!token) {
    throw new Error("Authentication token is missing.");
  }

  const response = await fetch(`${API_URL}/v1/users/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(
      getApiError(data, "Unable to load your profile.")
    );
  }

  return data;
}

export async function updateProfile({ token, updates }) {
  if (!token) {
    throw new Error("Authentication token is missing.");
  }

  const response = await fetch(`${API_URL}/v1/users/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });

  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(
      getApiError(data, "Unable to update your profile.")
    );
  }

  return data;
}

export async function uploadProfileImage(file) {
  if (!file) {
    throw new Error("Select an image first.");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("The selected file must be an image.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("The image must be smaller than 5 MB.");
  }

  if (
    !CLOUDINARY_CLOUD_NAME ||
    !CLOUDINARY_UPLOAD_PRESET
  ) {
    throw new Error(
      "Cloudinary environment variables are missing."
    );
  }

  const cloudinaryUrl =
    `https://api.cloudinary.com/v1_1/` +
    `${CLOUDINARY_CLOUD_NAME}/image/upload`;

  const formData = new FormData();

  formData.append("file", file);
  formData.append(
    "upload_preset",
    CLOUDINARY_UPLOAD_PRESET
  );

  const response = await fetch(cloudinaryUrl, {
    method: "POST",
    body: formData,
  });

  const data = await readJson(response);

  if (!response.ok || !data?.secure_url) {
    throw new Error(
      data?.error?.message ||
        "Unable to upload the profile image."
    );
  }

  return data.secure_url;
}

export async function uploadAndSaveProfileImage({
  file,
  token,
}) {
  const profileImageUrl = await uploadProfileImage(file);

  return updateProfile({
    token,
    updates: {
      profile_image_url: profileImageUrl,
    },
  });
}

export async function deleteProfileImage({ token }) {
  const response = await fetch(`${API_URL}/v1/users/me`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      profile_image_url: "",
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => "");

    throw new Error(
      error?.detail || "Unable to remove profile image."
    );
  }

  return response.json();
}