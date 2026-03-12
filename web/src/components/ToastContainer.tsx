import { useEffect, useState } from "react";

interface Toast {
  id: number;
  message: string;
  type: "error" | "success";
}

let nextId = 1;

export function showSuccessToast(message: string) {
  window.dispatchEvent(new CustomEvent("api-success", { detail: message }));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function addToast(message: string, type: Toast["type"]) {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    }

    function handleApiError(e: Event) {
      addToast((e as CustomEvent<string>).detail, "error");
    }
    function handleApiSuccess(e: Event) {
      addToast((e as CustomEvent<string>).detail, "success");
    }

    window.addEventListener("api-error", handleApiError);
    window.addEventListener("api-success", handleApiSuccess);
    return () => {
      window.removeEventListener("api-error", handleApiError);
      window.removeEventListener("api-success", handleApiSuccess);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
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
