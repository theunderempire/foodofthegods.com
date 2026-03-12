import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Register } from "../Register";

const mockRegister = vi.fn();
const mockNavigate = vi.fn();

vi.mock("../../api/auth", () => ({
  register: (...args: unknown[]) => mockRegister(...args),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

describe("Register", () => {
  beforeEach(() => {
    mockRegister.mockReset();
    mockNavigate.mockReset();
  });

  function renderRegister() {
    return render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>,
    );
  }

  async function fillForm({ username = "validuser", email = "test@example.com" } = {}) {
    await userEvent.type(screen.getByLabelText("Username"), username);
    await userEvent.type(screen.getByLabelText("Email"), email);
  }

  test("renders username and email fields only (no password)", () => {
    renderRegister();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Confirm Password")).not.toBeInTheDocument();
  });

  test("shows error when username is too short", async () => {
    renderRegister();
    await fillForm({ username: "short" });
    await userEvent.click(screen.getByRole("button", { name: "Request Access" }));
    expect(screen.getByText("Username must be at least 8 characters.")).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  test("calls register with username and email then navigates", async () => {
    mockRegister.mockResolvedValue(undefined);
    renderRegister();
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: "Request Access" }));
    expect(mockRegister).toHaveBeenCalledWith("validuser", "test@example.com");
    expect(mockNavigate).toHaveBeenCalledWith("/register/thanks");
  });

  test("shows error when registration request fails", async () => {
    mockRegister.mockRejectedValue(new Error("network error"));
    renderRegister();
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: "Request Access" }));
    expect(
      await screen.findByText("Failed to send registration request. Please try again."),
    ).toBeInTheDocument();
  });
});
