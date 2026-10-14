import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router';
import { Container, Nav, Navbar } from 'react-bootstrap';
import { urls } from "../constants";
import { useAuth } from "../context/AuthContext";
import ProfileCircle from "./input/ProfileCircle";
import FormModal from "./input/FormModal";
import Chatbot from './input/Chatbot';
import SpinnerOverlay from './input/SpinnerOverlay';
import useIsSmallScreen from "../helper-functions/useIsSmallScreen";
import { getUserLocation } from "../helper-functions/location";

function DashboardLayout() {
  const appLocation = useLocation();
  const { token, user, logout, refreshUserProfile, profileError } = useAuth();
  const isSmallScreen = useIsSmallScreen();

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [navbarExpanded, setNavbarExpanded] = useState(false);

  const navbarRef = useRef(null);

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

  // Collapse navbar when clicking outside of it
  useEffect(() => {
    if (!isSmallScreen || !navbarExpanded) {
      return;
    }

    function handleClickOutside(event) {
      if (
        navbarRef.current &&
        !navbarRef.current.contains(event.target)
      ) {
        setNavbarExpanded(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, [isSmallScreen, navbarExpanded]);

  // Collapse navbar whenever the route changes
  useEffect(() => {
    setNavbarExpanded(false);
  }, [appLocation.pathname]);

  const pageNames = {
    [urls.home]: `Hi, ${user?.name || "User"}!`,
    [urls.statistics]: "Your Statistics",
    [urls.calendar]: "Calendar",
    [urls.profile]: "Profile",
    [urls.chat]: "Chat",
    [urls.help]: "Get Help",
  };

  const currentPage = pageNames[appLocation.pathname];

  function openLogoutModal() {
    setShowLogoutModal(true);
  }

  function closeLogoutModal() {
    setShowLogoutModal(false);
  }

  function confirmLogout() {
    logout();
    setShowLogoutModal(false);
  }

  return (
    <>
      {/* Navbar */}
      <div
        ref={navbarRef}
        className="dashboard-navbar"
        style={{
          backgroundColor: "var(--color-tertiary-dark)",
        }}
      >
        <Navbar
          expand="md"
          expanded={navbarExpanded}
          onToggle={setNavbarExpanded}
        >
          <Navbar.Toggle aria-controls="dashboard-navbar-nav" />

          <Navbar.Collapse id="dashboard-navbar-nav">
            <Nav className="w-100">
              <Nav.Link as={NavLink} to={urls.home} end>
                Home
              </Nav.Link>

              <Nav.Link as={NavLink} to={urls.statistics} end>
                Statistics
              </Nav.Link>

              <Nav.Link as={NavLink} to={urls.calendar} end>
                Calendar
              </Nav.Link>

              <Nav.Link as={NavLink} to={urls.profile} end>
                Profile
              </Nav.Link>

              {isSmallScreen && (
                <Nav.Link as={NavLink} to={urls.chat} end>
                  Chat
                </Nav.Link>
              )}
            </Nav>
          </Navbar.Collapse>
        </Navbar>
      </div>

      {/* Floating chatbot on larger screens */}
      {!isSmallScreen && (
        <Chatbot
          title="Chat"
          isFloating={true}
          beginClosed={true}
        />
      )}

      {/* Header */}
      <div className="p-4 pb-0">
        <div
          className="horizontal at-middle-center"
          style={{ justifyContent: "space-between" }}
        >
          <h1>{currentPage}</h1>

          <div className="horizontal-16 at-middle-center">
            {appLocation.pathname !== urls.help && (
              <Link to={urls.help} className="help-header-link">
                Trouble breathing?
              </Link>
            )}

            <ProfileCircle
              imageUrl={`${import.meta.env.BASE_URL}lobelia_icon_fill.png`}
              onClick={openLogoutModal}
              theme="green-theme"
            />
          </div>
        </div>

        <hr />
      </div>

      {/* Content */}
      <Container fluid className="w-100 p-4">
        <Outlet context={{ location, locationPermission }} />
      </Container>

      {/* Logout Confirmation */}
      {showLogoutModal && (
        <FormModal
          title="Logout?"
          onHide={closeLogoutModal}
          onSubmit={confirmLogout}
          submitText="Logout"
        >
          <div className="at-middle-center vertical-16">
            <p className="text-center">
              Are you sure you want to log out?
            </p>
          </div>
        </FormModal>
      )}
      <SpinnerOverlay visible={user?.name === undefined && !profileError} message="Loading your information..." />
      {profileError && (
        <FormModal
          title="Connection problem"
          onHide={refreshUserProfile}
          onSubmit={refreshUserProfile}
          submitText="Try again"
        >
          <div className="at-middle-center vertical-16">
            <p className="text-center">
              We couldn't load your information. The server may be waking up, so please try again in a few seconds.
            </p>
          </div>
        </FormModal>
      )}
    </>
  );
}

export default DashboardLayout;