import { Link } from 'react-router-dom';

export function RegisterThanks() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo" style={{ color: 'var(--success)' }}>&#x2713;</div>
          <h1 className="auth-title">Request Sent!</h1>
          <p className="auth-subtitle">
            Your registration request has been submitted. The admin will review your request and set up your account.
          </p>
        </div>
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link to="/login" className="btn btn-primary">
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
