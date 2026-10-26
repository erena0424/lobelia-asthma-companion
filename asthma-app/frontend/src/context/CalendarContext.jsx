/* eslint-disable react-refresh/only-export-components */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { API_URL } from "../config";
import { getCheckIns, saveCheckIn } from "../helper-functions/checkIns";
import { browserTimezone } from "../helper-functions/dayPlan";
import { useAuth } from "./AuthContext";

const CalendarContext = createContext(null);

const EMPTY_STATUS = {
  connected: false,
  configured: false,
  email: null,
  connectedAt: null,
};

const EMPTY_SNAPSHOT = {
  monthKey: null,
  monthStart: null,
  monthEnd: null,
  checkIns: [],
  googleEvents: [],
  checkInsLoading: false,
  googleEventsLoading: false,
  error: "",
  checkInsLoaded: false,
  googleEventsLoaded: false,
  loadedAt: null,
};

function formatDateKey(year, monthIndex, day) {
  const month = String(monthIndex + 1).padStart(2, "0");
  const date = String(day).padStart(2, "0");

  return `${year}-${month}-${date}`;
}

function getMonthKey(monthStart, monthEnd) {
  return `${monthStart}:${monthEnd}`;
}

function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  return {
    year,
    monthIndex,
    monthStart: formatDateKey(year, monthIndex, 1),
    monthEnd: formatDateKey(year, monthIndex, daysInMonth),
  };
}

async function parseCalendarResponse(response) {
  const data = await response.json();

  if (!response.ok) {
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message || "Unable to update Google Calendar connection.";

    const error = new Error(message);
    error.status = response.status;
    error.code = detail?.code || data?.code;
    throw error;
  }

  return data;
}

async function fetchGoogleEventsForMonth(authToken, year, monthIndex, daysInMonth) {
  const monthStart = formatDateKey(year, monthIndex, 1);
  const monthEnd = formatDateKey(year, monthIndex, daysInMonth);
  const response = await fetch(
    `${API_URL}/v1/calendar/events?from=${monthStart}&to=${monthEnd}&timezone=${encodeURIComponent(browserTimezone())}`,
    {
      headers: { Authorization: `Bearer ${authToken}` },
    }
  );

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  if (!Array.isArray(data.events)) {
    return [];
  }

  return data.events.map((event) => ({
    ...event,
    date: event.date || String(event.start || "").slice(0, 10),
  }));
}

function monthPrefixFromDate(dateKey) {
  return dateKey.slice(0, 7);
}

export function CalendarProvider({ children }) {
  const { token } = useAuth();

  const [calendarStatus, setCalendarStatus] = useState(EMPTY_STATUS);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [calendarSnapshot, setCalendarSnapshot] = useState(EMPTY_SNAPSHOT);

  const monthCacheRef = useRef({});
  const statusRequestRef = useRef(0);
  const monthRequestRef = useRef(0);
  const popupRef = useRef(null);
  const pollTimerRef = useRef(null);

  const clearFeedback = useCallback(() => {
    setStatusError("");
    setActionError("");
    setActionMessage("");
  }, []);

  const clearGoogleEventsFromCache = useCallback(() => {
    const nextCache = {};

    for (const [monthKey, snapshot] of Object.entries(monthCacheRef.current)) {
      nextCache[monthKey] = {
        ...snapshot,
        googleEvents: [],
        googleEventsLoading: false,
        googleEventsLoaded: false,
      };
    }

    monthCacheRef.current = nextCache;

    setCalendarSnapshot((current) => ({
      ...current,
      googleEvents: [],
      googleEventsLoading: false,
      googleEventsLoaded: false,
    }));
  }, []);

  const resetCalendarState = useCallback(() => {
    monthRequestRef.current += 1;
    statusRequestRef.current += 1;
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    monthCacheRef.current = {};
    setCalendarStatus(EMPTY_STATUS);
    setStatusLoading(false);
    setStatusError("");
    setActionLoading(false);
    setActionError("");
    setActionMessage("");
    setCalendarSnapshot(EMPTY_SNAPSHOT);
  }, []);

  const refreshGoogleCalendarStatus = useCallback(
    async (authToken = token, { silent = false } = {}) => {
      if (!authToken) {
        return EMPTY_STATUS;
      }

      const requestId = ++statusRequestRef.current;

      if (!silent) {
        setStatusLoading(true);
      }

      setStatusError("");

      try {
        const response = await fetch(`${API_URL}/v1/calendar/status`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });

        const data = await parseCalendarResponse(response);

        if (requestId !== statusRequestRef.current) {
          return data;
        }

        const nextStatus = {
          connected: Boolean(data.connected),
          configured: Boolean(data.configured),
          email: data.email ?? null,
          connectedAt: data.connectedAt ?? data.connected_at ?? null,
        };

        setCalendarStatus(nextStatus);

        if (!nextStatus.connected) {
          clearGoogleEventsFromCache();
        }

        return nextStatus;
      } catch (error) {
        if (requestId !== statusRequestRef.current) {
          return null;
        }

        setCalendarStatus(EMPTY_STATUS);
        setStatusError(
          error?.message || "Unable to load Google Calendar connection status."
        );

        clearGoogleEventsFromCache();

        return null;
      } finally {
        if (!silent && requestId === statusRequestRef.current) {
          setStatusLoading(false);
        }
      }
    },
    [clearGoogleEventsFromCache, token]
  );

  const loadCalendarMonth = useCallback(async ({
    year,
    monthIndex,
    monthStart,
    monthEnd,
    includeEvents = calendarStatus.connected,
    authToken = token,
  }) => {
    if (!authToken) {
      return EMPTY_SNAPSHOT;
    }

    const monthKey = getMonthKey(monthStart, monthEnd);
    const cached = monthCacheRef.current[monthKey];
    const hasCheckIns = Boolean(cached?.checkInsLoaded);
    const hasEvents = Boolean(cached?.googleEventsLoaded);
    const canReuse = hasCheckIns && (!includeEvents || !calendarStatus.connected || hasEvents);

    if (cached && canReuse) {
      setCalendarSnapshot(cached);
      return cached;
    }

    const requestId = ++monthRequestRef.current;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    setCalendarSnapshot((current) => ({
      ...current,
      monthKey,
      monthStart,
      monthEnd,
      checkInsLoading: !hasCheckIns,
      googleEventsLoading: includeEvents && calendarStatus.connected && !hasEvents,
      error: "",
    }));

    try {
      let checkIns = cached?.checkIns ?? [];
      let googleEvents = cached?.googleEvents ?? [];
      let checkInsLoaded = hasCheckIns;
      let googleEventsLoaded = hasEvents;

      if (!checkInsLoaded) {
        const response = await getCheckIns({
          from: monthStart,
          to: monthEnd,
          token: authToken,
        });

        checkIns = response.items ?? [];
        checkInsLoaded = true;
      }

      if (includeEvents && calendarStatus.connected) {
        if (!googleEventsLoaded) {
          googleEvents = await fetchGoogleEventsForMonth(authToken, year, monthIndex, daysInMonth);
          googleEventsLoaded = true;
        }
      } else {
        googleEvents = [];
        googleEventsLoaded = false;
      }

      const snapshot = {
        monthKey,
        monthStart,
        monthEnd,
        checkIns,
        googleEvents,
        checkInsLoading: false,
        googleEventsLoading: false,
        error: "",
        checkInsLoaded,
        googleEventsLoaded,
        loadedAt: Date.now(),
      };

      if (requestId === monthRequestRef.current) {
        monthCacheRef.current[monthKey] = snapshot;
        setCalendarSnapshot(snapshot);
      }

      return snapshot;
    } catch (error) {
      const snapshot = {
        ...(cached ?? EMPTY_SNAPSHOT),
        monthKey,
        monthStart,
        monthEnd,
        checkInsLoading: false,
        googleEventsLoading: false,
        error: error?.message || "Unable to load calendar data.",
      };

      if (requestId === monthRequestRef.current) {
        monthCacheRef.current[monthKey] = snapshot;
        setCalendarSnapshot(snapshot);
      }

      return snapshot;
    }
  }, [calendarStatus.connected, token]);

  const saveCalendarCheckIn = useCallback(async ({ checkIn }) => {
    if (!token) {
      throw new Error("Please log in again to save your check-in.");
    }

    const savedCheckIn = await saveCheckIn({ token, checkIn });
    const datePrefix = monthPrefixFromDate(savedCheckIn.date);

    const updateSnapshot = (snapshot) => {
      const existingIndex = snapshot.checkIns.findIndex(
        (row) => row.date === savedCheckIn.date
      );

      const nextCheckIns =
        existingIndex === -1
          ? [...snapshot.checkIns, savedCheckIn]
          : snapshot.checkIns.map((row) =>
              row.date === savedCheckIn.date ? savedCheckIn : row
            );

      return {
        ...snapshot,
        checkIns: nextCheckIns,
        checkInsLoaded: true,
      };
    };

    setCalendarSnapshot((current) =>
      current.monthStart?.startsWith(datePrefix) ? updateSnapshot(current) : current
    );

    for (const [monthKey, snapshot] of Object.entries(monthCacheRef.current)) {
      if (snapshot.monthStart?.startsWith(datePrefix)) {
        monthCacheRef.current[monthKey] = updateSnapshot(snapshot);
      }
    }

    return savedCheckIn;
  }, [token]);

  const clearCalendarConnection = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }

    popupRef.current = null;
  }, []);

  const connectGoogleCalendar = useCallback(async () => {
    if (!token) {
      setActionError("Please log in again to connect Google Calendar.");
      return;
    }

    clearFeedback();
    setActionLoading(true);

    const popup = window.open("", "_blank");

    if (!popup) {
      setActionLoading(false);
      setActionError("Please allow pop-ups to connect Google Calendar.");
      return;
    }

    popupRef.current = popup;

    try {
      const response = await fetch(`${API_URL}/v1/calendar/connect`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await parseCalendarResponse(response);

      if (!data?.auth_url) {
        throw new Error("Google Calendar did not return a connection URL.");
      }

      popup.opener = null;
      popup.location.href = data.auth_url;

      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
      }

      pollTimerRef.current = window.setInterval(() => {
        const activePopup = popupRef.current;

        if (!activePopup || activePopup.closed) {
          refreshGoogleCalendarStatus(token, { silent: true }).then((status) => {
            clearCalendarConnection();
            setActionLoading(false);

            if (status?.connected) {
              setActionMessage("Google Calendar connected.");
              void loadCalendarMonth({
                ...getCurrentMonthRange(),
                includeEvents: true,
                authToken: token,
              });
              return;
            }

            setActionMessage("");
            setActionError("Google Calendar connection was not completed.");
          });
          return;
        }

        refreshGoogleCalendarStatus(token, { silent: true }).then((status) => {
          if (status?.connected) {
            clearCalendarConnection();
            setActionLoading(false);
            setActionMessage("Google Calendar connected.");
            void loadCalendarMonth({
              ...getCurrentMonthRange(),
              includeEvents: true,
              authToken: token,
            });
            setActionError("");
          }
        });
      }, 2000);

      setActionMessage("Google Calendar opened in a new tab.");
    } catch (error) {
      clearCalendarConnection();
      setActionLoading(false);
      setActionError(
        error?.message || "Unable to start the Google Calendar connection."
      );
    }
  }, [clearCalendarConnection, clearFeedback, loadCalendarMonth, refreshGoogleCalendarStatus, token]);

  const disconnectGoogleCalendar = useCallback(async () => {
    if (!token) {
      setActionError("Please log in again to disconnect Google Calendar.");
      return;
    }

    clearFeedback();
    setActionLoading(true);

    try {
      const response = await fetch(`${API_URL}/v1/calendar/disconnect`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await parseCalendarResponse(response);

      setCalendarStatus({
        connected: Boolean(data.connected),
        configured: Boolean(data.configured),
        email: data.email ?? null,
        connectedAt: data.connectedAt ?? data.connected_at ?? null,
      });

      clearGoogleEventsFromCache();
      setActionMessage("Google Calendar disconnected.");
    } catch (error) {
      setActionError(
        error?.message || "Unable to disconnect Google Calendar right now."
      );
    } finally {
      setActionLoading(false);
    }
  }, [clearFeedback, clearGoogleEventsFromCache, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!token) {
        resetCalendarState();
        return;
      }

      void refreshGoogleCalendarStatus(token).then((status) => {
        void loadCalendarMonth({
          ...getCurrentMonthRange(),
          includeEvents: Boolean(status?.connected),
          authToken: token,
        });
      });
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadCalendarMonth, refreshGoogleCalendarStatus, resetCalendarState, token]);

  const value = useMemo(() => ({
    calendarStatus,
    statusLoading,
    statusError,
    actionLoading,
    actionError,
    actionMessage,
    calendarSnapshot,
    refreshGoogleCalendarStatus,
    loadCalendarMonth,
    saveCalendarCheckIn,
    connectGoogleCalendar,
    disconnectGoogleCalendar,
    forgetGoogleEvents: clearGoogleEventsFromCache,
  }), [
    actionError,
    actionLoading,
    actionMessage,
    calendarSnapshot,
    calendarStatus,
    clearGoogleEventsFromCache,
    connectGoogleCalendar,
    disconnectGoogleCalendar,
    loadCalendarMonth,
    refreshGoogleCalendarStatus,
    saveCalendarCheckIn,
    statusError,
    statusLoading,
  ]);

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
}

export function useCalendar() {
  return useContext(CalendarContext);
}