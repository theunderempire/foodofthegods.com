import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SetPassword } from "../SetPassword";

const mockSetPassword = vi.fn();
const mockNavigate = vi.fn();

vi.mock("../../api/auth", () => ({
  setPassword: (...args: unknown[]) => mockSetPassword(...args),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

describe("SetPassword", () => {
  beforeEach(() => {
    mockSetPassword.mockReset();
    mockNavigate.mockReset();
  });

  function renderWithToken(token: string | null = "validtoken") {
    const search = token ? `?token=${token}` : "";
    return render(
      <MemoryRouter initialEntries={[{ pathname: "/set-password", search }]}>
        <SetPassword />
      </MemoryRouter>,
    );
  }

  test("shows 404 page when no token is in the URL", () => {
    renderWithToken(null);
    expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(screen.getByText("Invalid password setup link.")).toBeInTheDocument();
  });

  test("renders password form when token is present", () => {
    renderWithToken();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set Password" })).toBeInTheDocument();
  });

  test("shows error when passwords do not match", async () => {
    renderWithToken();
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.type(screen.getByLabelText("Confirm Password"), "different");
    await userEvent.click(screen.getByRole("button", { name: "Set Password" }));
    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(mockSetPassword).not.toHaveBeenCalled();
  });

  test("shows error when password is too short", async () => {
    renderWithToken();
    await userEvent.type(screen.getByLabelText("Password"), "short");
    await userEvent.type(screen.getByLabelText("Confirm Password"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Set Password" }));
    expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();
    expect(mockSetPassword).not.toHaveBeenCalled();
  });

  test("calls setPassword with token and password then navigates to login", async () => {
    mockSetPassword.mockResolvedValue(undefined);
    renderWithToken("mytoken");
    await userEvent.type(screen.getByLabelText("Password"), "securepass");
    await userEvent.type(screen.getByLabelText("Confirm Password"), "securepass");
    await userEvent.click(screen.getByRole("button", { name: "Set Password" }));
    expect(mockSetPassword).toHaveBeenCalledWith("mytoken", "securepass");
    expect(mockNavigate).toHaveBeenCalledWith("/login", {
      state: { message: "Account created! You can now sign in." },
    });
  });

  test("shows error when setPassword call fails", async () => {
    mockSetPassword.mockRejectedValue(new Error("expired"));
    renderWithToken();
    await userEvent.type(screen.getByLabelText("Password"), "securepass");
    await userEvent.type(screen.getByLabelText("Confirm Password"), "securepass");
    await userEvent.click(screen.getByRole("button", { name: "Set Password" }));
    expect(
      await screen.findByText(
        "This link is invalid or has expired. Please request a new registration.",
      ),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
