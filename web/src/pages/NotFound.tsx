import { useNavigate } from "react-router-dom";

interface NotFoundProps {
  message?: string;
}

export function NotFound({ message = "Page not found." }: NotFoundProps) {
  const navigate = useNavigate();

  return (
    <div className="page not-found">
      <h1 className="not-found-code">404</h1>
      <p className="not-found-message">{message}</p>
      <button className="btn btn-primary" onClick={() => navigate("/recipes")}>
        Go to Recipes
      </button>
    </div>
  );
}
