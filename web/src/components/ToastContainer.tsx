import { useEffect, useState } from "react";

interface Toast {
  id: number;
  message: string;
}

let nextId = 1;

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function handleApiError(e: Event) {
      const message = (e as CustomEvent<string>).detail;
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    }

    window.addEventListener("api-error", handleApiError);
    return () => window.removeEventListener("api-error", handleApiError);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast toast-error">
          <span>{toast.message}</span>
          <button
            className="toast-dismiss"
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            aria-label="Dismiss"
          >
            &#x2715;
          </button>
        </div>
      ))}
    </div>
  );
}
