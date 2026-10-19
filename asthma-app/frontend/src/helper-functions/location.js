const FALLBACK_LOCATION = {
  lat: 43.0731,
  lon: -89.4012,
};

// Named on screen whenever the fallback is in use, so it never passes for the user's own conditions.
export const FALLBACK_PLACE = "Madison, WI";

export function getUserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({
        location: FALLBACK_LOCATION,
        permission: "unsupported",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        resolve({
          location: {
            lat: coords.latitude,
            lon: coords.longitude,
          },
          permission: "granted",
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve({
            location: FALLBACK_LOCATION,
            permission: "denied",
          });
          return;
        }

        resolve({
          location: FALLBACK_LOCATION,
          permission: "unavailable",
        });
      },
      {
        enableHighAccuracy: false,
        timeout: 7000,
        maximumAge: 300000,
      }
    );
  });
}

/**
 * Call onChange whenever the browser's geolocation permission changes (for
 * example the user allows location after the page loaded). Returns an
 * unsubscribe function. A no-op where the Permissions API is missing.
 */
export function watchLocationPermission(onChange, nav = globalThis.navigator) {
  let status = null;
  let stopped = false;
  const handler = () => onChange(status?.state);

  if (nav?.permissions?.query) {
    nav.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        if (stopped) return;
        status = result;
        status.addEventListener("change", handler);
      })
      .catch(() => {});
  }

  return () => {
    stopped = true;
    status?.removeEventListener("change", handler);
  };
}
