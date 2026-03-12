import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api/auth";

export function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (username.length < 8) e.username = "Username must be at least 8 characters.";
    if (username.length > 30) e.username = "Username must be at most 30 characters.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await register(username, email);
      navigate("/register/thanks");
    } catch {
      setErrors({ form: "Failed to send registration request. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide">
        <div className="auth-header">
          <div className="auth-logo">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 32 32"
              width="48"
              height="48"
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
          </div>
          <h1 className="auth-title">Request Access</h1>
          <p className="auth-subtitle">Registration requires admin approval</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          {errors.form && <div className="alert alert-error">{errors.form}</div>}
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              className={`input ${errors.username ? "input-error" : ""}`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="8–30 characters"
            />
            {errors.username && <span className="field-error">{errors.username}</span>}
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className={`input ${errors.email ? "input-error" : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? "Sending request..." : "Request Access"}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
