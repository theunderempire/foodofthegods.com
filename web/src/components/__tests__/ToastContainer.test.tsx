import { act, fireEvent, render, screen } from "@testing-library/react";
import { ToastContainer, showSuccessToast } from "../ToastContainer";

const TOAST_MS = 5000;

/** Toasts are driven by window events, so dispatching needs an act() wrapper. */
function emit(type: "api-error" | "api-success", message: string) {
  act(() => {
    window.dispatchEvent(new CustomEvent(type, { detail: message }));
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("ToastContainer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("renders nothing until an event arrives", () => {
    const { container } = render(<ToastContainer />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders an error toast when api-error fires", () => {
    render(<ToastContainer />);
    emit("api-error", "Database unavailable");

    const toast = screen.getByText("Database unavailable").closest(".toast");
    expect(toast).toBeInTheDocument();
    expect(toast).toHaveClass("toast-error");
  });

  test("renders a success toast when api-success fires", () => {
    render(<ToastContainer />);
    emit("api-success", "Recipe saved");

    const toast = screen.getByText("Recipe saved").closest(".toast");
    expect(toast).toBeInTheDocument();
    expect(toast).toHaveClass("toast-success");
  });

  test("showSuccessToast is the public entry point for success toasts", () => {
    render(<ToastContainer />);
    act(() => {
      showSuccessToast("Shopping list copied");
    });

    expect(screen.getByText("Shopping list copied")).toBeInTheDocument();
  });

  test("auto-dismisses a toast after its timeout", () => {
    render(<ToastContainer />);
    emit("api-error", "Temporary glitch");

    advance(TOAST_MS - 1);
    expect(screen.getByText("Temporary glitch")).toBeInTheDocument();

    advance(1);
    expect(screen.queryByText("Temporary glitch")).not.toBeInTheDocument();
  });

  test("manual dismiss removes the toast immediately", () => {
    render(<ToastContainer />);
    emit("api-error", "Something broke");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText("Something broke")).not.toBeInTheDocument();
  });

  test("stacks multiple toasts and dismisses only the one clicked", () => {
    render(<ToastContainer />);
    emit("api-error", "First problem");
    emit("api-error", "Second problem");
    emit("api-success", "But this worked");

    expect(screen.getAllByRole("button", { name: "Dismiss" })).toHaveLength(3);

    const second = screen.getByText("Second problem").closest(".toast")!;
    fireEvent.click(second.querySelector(".toast-dismiss")!);

    expect(screen.queryByText("Second problem")).not.toBeInTheDocument();
    expect(screen.getByText("First problem")).toBeInTheDocument();
    expect(screen.getByText("But this worked")).toBeInTheDocument();
  });

  test("each toast expires on its own schedule", () => {
    render(<ToastContainer />);
    emit("api-error", "Older toast");
    advance(TOAST_MS - 1000);
    emit("api-error", "Newer toast");

    // The first toast's 5s window closes while the second still has 4s left.
    advance(1000);
    expect(screen.queryByText("Older toast")).not.toBeInTheDocument();
    expect(screen.getByText("Newer toast")).toBeInTheDocument();

    advance(4000);
    expect(screen.queryByText("Newer toast")).not.toBeInTheDocument();
  });

  test("stops listening once unmounted", () => {
    const { unmount, container } = render(<ToastContainer />);
    unmount();

    window.dispatchEvent(new CustomEvent("api-error", { detail: "Too late" }));

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Too late")).not.toBeInTheDocument();
  });
});
