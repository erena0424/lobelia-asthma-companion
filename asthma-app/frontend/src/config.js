let API_URL;

// Local dev on computer (VITE_LOCAL_API_URL points one dev server at another local API)
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
  API_URL = import.meta.env.VITE_LOCAL_API_URL || "http://127.0.0.1:8000";
}

// Phone or other LAN device
else if (/^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname)) {
  API_URL = `http://${window.location.hostname}:8000`;
}

// Production
else {
  API_URL = import.meta.env.VITE_API_URL;
}

export { API_URL };