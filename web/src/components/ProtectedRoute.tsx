import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { setReturnTo } from "../returnTo";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    setReturnTo(location.pathname + location.search + location.hash);
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
