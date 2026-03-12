import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function Layout({ children }: { children: React.ReactNode }) {
  const { logout, username } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <header className="navbar">
        <NavLink to="/recipes" className="navbar-brand">
          <svg
            className="brand-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 32 32"
            width="22"
            height="22"
            aria-hidden="true"
          >
            <rect x="12" y="18" width="8" height="11" rx="2" fill="#c8a064" />
            <ellipse cx="16" cy="19.5" rx="12.5" ry="3.5" fill="#8b1a10" />
            <path d="M3 19 A 13 17 0 0 1 29 19 Z" fill="#cc2b1a" />
            <circle cx="11" cy="12" r="2.4" fill="white" opacity="0.92" />
            <circle cx="20.5" cy="10.5" r="3" fill="white" opacity="0.92" />
            <circle cx="16" cy="17" r="1.7" fill="white" opacity="0.92" />
            <circle cx="6.5" cy="17" r="1.6" fill="white" opacity="0.92" />
            <circle cx="25" cy="15.5" r="1.8" fill="white" opacity="0.92" />
          </svg>
          <span>Food of the Gods</span>
        </NavLink>
        <nav className="navbar-links">
          <NavLink
            to="/recipes"
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          >
            Recipes
          </NavLink>
          <NavLink
            to="/ingredients"
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          >
            Shopping List
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          >
            Settings
          </NavLink>
        </nav>
        <div className="navbar-user">
          {/* <span className="username-badge">{username}</span> */}
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <main className="main-content">{children}</main>
    </div>
  );
}
