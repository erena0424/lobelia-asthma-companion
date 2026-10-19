import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router';
import { urls } from "../constants";
import { useAuth } from "../context/AuthContext";
import FormModal from "./input/FormModal";
import Chatbot from './input/Chatbot';
import { openChat } from '../helper-functions/chatEvents';
import SpinnerOverlay from './input/SpinnerOverlay';
import FeedbackModal, { FeedbackLink } from './input/FeedbackModal';
import useIsSmallScreen from "../helper-functions/useIsSmallScreen";
import { getUserLocation } from "../helper-functions/location";
import lungFlowers from "../assets/images/lungFlowers.png";
import "./DashboardLayout.css";

// App shell (design direction v2): slim top bar, text nav with an underline,
// "Trouble breathing?" always visible; on phones a 5-tab bottom bar and the chat
// button in the top bar, so nothing floats over the content.

const NAV_ITEMS = [
  { to: urls.home, label: "Today", icon: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" },
  { to: urls.checkIn, label: "Check in", icon: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM9 14.5c1.6 1.4 4.4 1.4 6 0M9.5 10.5h.01M14.5 10.5h.01" },
  { to: urls.calendar, label: "Calendar", icon: "M6 5.5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2ZM4 10h16M8.5 3.5v4M15.5 3.5v4" },
  { to: urls.statistics, label: "Insights", icon: "M4 19h16M7 16v-5M12 16V7M17 16v-3" },
  { to: urls.profile, label: "Profile", icon: "M12 5.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM5.5 19.5c1.2-3 3.6-4.5 6.5-4.5s5.3 1.5 6.5 4.5" },
];

// Today has its own greeting; other pages keep a simple title until they're redesigned
const PAGE_TITLES = {
  [urls.statistics]: "Insights",
  [urls.calendar]: "Calendar",
  [urls.profile]: "Profile",
  [urls.chat]: "Chat",
  [urls.help]: "Get help",
  [urls.checkIn]: "Check in",
};

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 18.5V6.8A1.8 1.8 0 0 1 6.8 5h10.4A1.8 1.8 0 0 1 19 6.8v7.4a1.8 1.8 0 0 1-1.8 1.8H8.5L5 18.5z" />
    </svg>
  );
}

function AccountMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const menuRef = useRef(null);
  const initial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return undefined;
    function close(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="shell-account" ref={menuRef}>
      <button
        type="button"
        className="shell-avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((value) => !value)}
      >
        {initial}
      </button>
      {open && (
        <div className="shell-menu" role="menu">
          <Link role="menuitem" to={urls.profile} onClick={() => setOpen(false)}>Profile</Link>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); setShowFeedback(true); }}>Send feedback</button>
          <Link role="menuitem" to={urls.privacy} onClick={() => setOpen(false)}>Privacy Policy</Link>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); onLogout(); }}>Log out</button>
        </div>
      )}
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </div>
  );
}

function DashboardLayout() {
  const appLocation = useLocation();
  const navigate = useNavigate();
  const { token, user, logout, refreshUserProfile, profileError } = useAuth();
  const isSmallScreen = useIsSmallScreen();

  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // request user location
  const [location, setLocation] = useState(null);
  const [locationPermission, setLocationPermission] = useState("checking");

  useEffect(() => {
    getUserLocation().then((result) => {
      setLocation(result.location);
      setLocationPermission(result.permission);
    });
  }, []);

  useEffect(() => {
    refreshUserProfile();
  }, [token, refreshUserProfile]);

  const onHelp = appLocation.pathname === urls.help;
  const pageTitle = PAGE_TITLES[appLocation.pathname];

  function handleChat() {
    // phones get the full chat page; larger screens open the side panel
    if (isSmallScreen) navigate(urls.chat);
    else openChat();
  }

  return (
    <div className="shell">
      <header className="shell-topbar">
        <div className="shell-topbar-inner">
          <Link className="shell-brand" to={urls.home} aria-label="Lobelia, Today">
            <img src={lungFlowers} alt="" />
            <span className="shell-wordmark">Lobelia</span>
          </Link>

          <nav className="shell-nav" aria-label="Main">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="shell-right">
            {!onHelp && (
              <Link to={urls.help} className="shell-help">
                <span className="long">Trouble breathing?</span>
                <span className="short">Breathing help</span>
              </Link>
            )}
            <button type="button" className="shell-chat" aria-label="Open chat" onClick={handleChat}>
              <ChatIcon />
              <span>Ask Lobelia</span>
            </button>
            <AccountMenu user={user} onLogout={() => setShowLogoutModal(true)} />
          </div>
        </div>
      </header>

      {!isSmallScreen && <Chatbot />}

      <main className="shell-main">
        <div className="shell-content">
          {pageTitle && <h1 className="shell-page-title">{pageTitle}</h1>}
          <Outlet context={{ location, locationPermission }} />
        </div>
      </main>

      <footer className="shell-footer">
        <span>Lobelia is not a medical device and doesn't replace your action plan or your clinician.</span>
        <NavLink to={urls.privacy}>Privacy Policy</NavLink>
        <NavLink to={urls.sources}>Sources</NavLink>
        <FeedbackLink />
      </footer>

      <nav className="shell-tabbar" aria-label="Main">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={item.icon} />
            </svg>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {showLogoutModal && (
        <FormModal
          title="Log out?"
          onHide={() => setShowLogoutModal(false)}
          onSubmit={() => { logout(); setShowLogoutModal(false); }}
          submitText="Log out"
          color="light"
        >
          <div className="at-middle-center vertical-16">
            <p className="text-center">Are you sure you want to log out?</p>
          </div>
        </FormModal>
      )}
      {/* never cover the help screen: 911, the saved plan and contacts must stay usable while the server wakes up */}
      <SpinnerOverlay visible={!onHelp && user?.name === undefined && !profileError} message="Loading your information..." />
      {profileError && !onHelp && (
        <FormModal
          title="Connection problem"
          onHide={refreshUserProfile}
          onSubmit={refreshUserProfile}
          submitText="Try again"
          color="light"
        >
          <div className="at-middle-center vertical-16">
            <p className="text-center">
              We couldn't load your information. The server may be waking up, so please try again in a few seconds.
            </p>
          </div>
        </FormModal>
      )}
    </div>
  );
}

export default DashboardLayout;
