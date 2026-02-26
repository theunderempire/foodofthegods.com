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
          <span className="brand-icon">&#x2665;</span>
          <span>Food of the Gods</span>
        </NavLink>
        <nav className="navbar-links">
          <NavLink
            to="/recipes"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Recipes
          </NavLink>
          <NavLink
            to="/ingredients"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Shopping List
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
