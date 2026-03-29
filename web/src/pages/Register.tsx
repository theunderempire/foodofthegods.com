import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api/auth";
import MushroomLogo from "../components/MushroomLogo";

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
            <MushroomLogo />
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
