import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "../Settings";

const mocks = vi.hoisted(() => ({
  hasGeminiKey: false,
  geminiModel: "gemini-2.5-flash",
  refreshSettings: vi.fn(),
  saveSettings: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("../../contexts/SettingsContext", () => ({
  useSettings: () => ({
    hasGeminiKey: mocks.hasGeminiKey,
    geminiModel: mocks.geminiModel,
    refreshSettings: mocks.refreshSettings,
  }),
  DEFAULT_GEMINI_MODEL: "gemini-2.5-flash",
}));

vi.mock("../../api/settings", () => ({
  saveSettings: mocks.saveSettings,
}));

vi.mock("../../components/ToastContainer", () => ({
  showSuccessToast: mocks.showSuccessToast,
}));

describe("Settings", () => {
  beforeEach(() => {
    mocks.hasGeminiKey = false;
    mocks.geminiModel = "gemini-2.5-flash";
    mocks.refreshSettings.mockResolvedValue(undefined);
    mocks.saveSettings.mockResolvedValue(undefined);
    mocks.showSuccessToast.mockReset();
  });

  test("renders API key input and save button", () => {
    render(<Settings />);
    expect(screen.getByLabelText(/gemini api key/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  test("save button is disabled when API key input is empty", () => {
    render(<Settings />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  test("does not show model dropdown when no API key is saved", () => {
    mocks.hasGeminiKey = false;
    render(<Settings />);
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
  });

  test("shows model dropdown when API key is saved", () => {
    mocks.hasGeminiKey = true;
    render(<Settings />);
    expect(screen.getByLabelText("Model")).toBeInTheDocument();
  });

  test("dropdown contains both available models", () => {
    mocks.hasGeminiKey = true;
    render(<Settings />);
    expect(
      screen.getByRole("option", { name: "Gemini 2.5 Flash (free tier)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Gemini 2.5 Flash-Lite" })).toBeInTheDocument();
  });

  test("saves model and shows toast when selection changes", async () => {
    mocks.hasGeminiKey = true;
    mocks.geminiModel = "gemini-2.5-flash";
    render(<Settings />);
    await userEvent.selectOptions(screen.getByLabelText("Model"), "gemini-2.5-flash-lite");
    expect(mocks.saveSettings).toHaveBeenCalledWith({ geminiModel: "gemini-2.5-flash-lite" });
    await waitFor(() => expect(mocks.showSuccessToast).toHaveBeenCalledWith("Model saved."));
  });

  test("saves API key and shows toast on submit", async () => {
    render(<Settings />);
    await userEvent.type(screen.getByLabelText(/gemini api key/i), "my-api-key");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.saveSettings).toHaveBeenCalledWith({ geminiApiKey: "my-api-key" });
    await waitFor(() => expect(mocks.showSuccessToast).toHaveBeenCalledWith("API key saved."));
  });

  test("clears input after saving API key", async () => {
    render(<Settings />);
    const input = screen.getByLabelText(/gemini api key/i);
    await userEvent.type(input, "my-api-key");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(input).toHaveValue(""));
  });

  test("shows remove button and update label when API key is already saved", () => {
    mocks.hasGeminiKey = true;
    render(<Settings />);
    expect(screen.getByRole("button", { name: "Remove key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update key" })).toBeInTheDocument();
  });

  test("removes API key and shows toast when remove is clicked", async () => {
    mocks.hasGeminiKey = true;
    render(<Settings />);
    await userEvent.click(screen.getByRole("button", { name: "Remove key" }));
    expect(mocks.saveSettings).toHaveBeenCalledWith({ geminiApiKey: null });
    await waitFor(() => expect(mocks.showSuccessToast).toHaveBeenCalledWith("API key removed."));
  });
});
