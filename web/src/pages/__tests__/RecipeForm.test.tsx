import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { RecipeForm } from "../RecipeForm";

const mockAddRecipe = vi.fn();
const mockUpdateRecipe = vi.fn();
const mockGetRecipe = vi.fn();
const mockImportRecipeFromUrl = vi.fn();
const mockImportRecipeFromText = vi.fn();
const mockNavigate = vi.fn();
let mockParams: Record<string, string> = {};

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ username: "testuser-hash" }),
}));

const mockUseSettings = vi.fn();
vi.mock("../../contexts/SettingsContext", () => ({
  useSettings: () => mockUseSettings(),
}));

vi.mock("../../api/recipes", () => ({
  addRecipe: (...args: unknown[]) => mockAddRecipe(...args),
  updateRecipe: (...args: unknown[]) => mockUpdateRecipe(...args),
  getRecipe: (...args: unknown[]) => mockGetRecipe(...args),
  importRecipeFromUrl: (...args: unknown[]) => mockImportRecipeFromUrl(...args),
  importRecipeFromText: (...args: unknown[]) => mockImportRecipeFromText(...args),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams,
  };
});

describe("RecipeForm", () => {
  beforeEach(() => {
    mockAddRecipe.mockReset();
    mockUpdateRecipe.mockReset();
    mockGetRecipe.mockReset();
    mockImportRecipeFromUrl.mockReset();
    mockImportRecipeFromText.mockReset();
    mockNavigate.mockReset();
    mockParams = {};
    mockUseSettings.mockReturnValue({ hasGeminiKey: true, refreshSettings: vi.fn() });
  });

  function renderForm() {
    return render(
      <MemoryRouter>
        <RecipeForm />
      </MemoryRouter>,
    );
  }

  async function navigateToForm() {
    await userEvent.click(screen.getByText("Enter Manually"));
  }

  test("renders New Recipe title in add mode", () => {
    renderForm();
    expect(screen.getByRole("heading", { name: "New Recipe" })).toBeInTheDocument();
  });

  test("shows import option selection screen for new recipes", () => {
    renderForm();
    expect(screen.getByText("Import from URL")).toBeInTheDocument();
    expect(screen.getByText("Paste Recipe Text")).toBeInTheDocument();
    expect(screen.getByText("Enter Manually")).toBeInTheDocument();
  });

  test("shows URL input when Import from URL is selected", async () => {
    renderForm();
    await userEvent.click(screen.getByText("Import from URL"));
    expect(screen.getByLabelText("Recipe URL")).toBeInTheDocument();
  });

  test("shows text input when Paste Recipe Text is selected", async () => {
    renderForm();
    await userEvent.click(screen.getByText("Paste Recipe Text"));
    expect(screen.getByLabelText("Recipe Text")).toBeInTheDocument();
  });

  test("back button returns to select screen from URL step", async () => {
    renderForm();
    await userEvent.click(screen.getByText("Import from URL"));
    // Two "← Back" buttons exist: page header (navigate(-1)) and step back button.
    // Click the step-level back button (the second one).
    const backButtons = screen.getAllByRole("button", { name: /back/i });
    await userEvent.click(backButtons[backButtons.length - 1]);
    expect(screen.getByText("Enter Manually")).toBeInTheDocument();
  });

  test("populates form and advances to form step after URL import", async () => {
    mockImportRecipeFromUrl.mockResolvedValue({
      name: "Imported Pasta",
      prepDuration: "10 min",
      cookDuration: "20 min",
      servings: "4",
      ingredients: [{ id: 1, name: "pasta", amount: 1, unit: "cup" }],
      directions: [{ id: 1, text: "Boil.", duration: "" }],
    });
    renderForm();
    await userEvent.click(screen.getByText("Import from URL"));
    await userEvent.type(screen.getByLabelText("Recipe URL"), "https://example.com/recipe");
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByDisplayValue("Imported Pasta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Recipe" })).toBeInTheDocument();
  });

  test("populates form and advances to form step after text import", async () => {
    mockImportRecipeFromText.mockResolvedValue({
      name: "Pasted Soup",
      prepDuration: "5 min",
      cookDuration: "15 min",
      servings: "2",
      ingredients: [{ id: 1, name: "water", amount: 1, unit: "cup" }],
      directions: [{ id: 1, text: "Boil water.", duration: "" }],
    });
    renderForm();
    await userEvent.click(screen.getByText("Paste Recipe Text"));
    await userEvent.type(screen.getByLabelText("Recipe Text"), "Pasted soup recipe...");
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByDisplayValue("Pasted Soup")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Recipe" })).toBeInTheDocument();
  });

  test("renders Edit Recipe title in edit mode", async () => {
    mockParams = { id: "recipe-1" };
    mockGetRecipe.mockResolvedValue({
      _id: "recipe-1",
      name: "Test Recipe",
      prepDuration: "5 min",
      cookDuration: "10 min",
      servings: "2",
      ingredients: [{ id: 1, name: "salt", amount: 1, unit: "tsp" }],
      directions: [{ id: 1, text: "Season.", duration: "" }],
      userId: "testuser-hash",
    });
    renderForm();

    expect(await screen.findByRole("heading", { name: "Edit Recipe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test Recipe")).toBeInTheDocument();
  });

  test("shows 404 page when edit recipe fails to load", async () => {
    mockParams = { id: "recipe-1" };
    mockGetRecipe.mockRejectedValue(new Error("not found"));
    renderForm();
    expect(await screen.findByText("Recipe not found.")).toBeInTheDocument();
  });

  test("shows error when submitting a whitespace-only name", async () => {
    renderForm();
    await navigateToForm();
    await userEvent.type(screen.getByLabelText("Recipe Name *"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Create Recipe" }));
    expect(screen.getByText("Recipe name is required.")).toBeInTheDocument();
    expect(mockAddRecipe).not.toHaveBeenCalled();
  });

  test("calls addRecipe and navigates on valid submit", async () => {
    mockAddRecipe.mockResolvedValue({ success: true, data: { msg: "recipe added" } });
    renderForm();
    await navigateToForm();

    await userEvent.type(screen.getByLabelText("Recipe Name *"), "My New Recipe");
    await userEvent.click(screen.getByRole("button", { name: "Create Recipe" }));

    expect(mockAddRecipe).toHaveBeenCalledWith(expect.objectContaining({ name: "My New Recipe" }));
    expect(mockNavigate).toHaveBeenCalledWith("/recipes");
  });

  test("disables AI import buttons and shows notice when no Gemini key", () => {
    mockUseSettings.mockReturnValue({ hasGeminiKey: false, refreshSettings: vi.fn() });
    renderForm();
    expect(screen.getByRole("button", { name: /Import from URL/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Paste Recipe Text/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Enter Manually/i })).not.toBeDisabled();
    expect(screen.getByText(/Add one in Settings/i)).toBeInTheDocument();
  });

  test("enables AI import buttons and hides notice when Gemini key is set", () => {
    mockUseSettings.mockReturnValue({ hasGeminiKey: true, refreshSettings: vi.fn() });
    renderForm();
    expect(screen.getByRole("button", { name: /Import from URL/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Paste Recipe Text/i })).not.toBeDisabled();
    expect(screen.queryByText(/Add one in Settings/i)).not.toBeInTheDocument();
  });

  test("calls updateRecipe in edit mode", async () => {
    mockParams = { id: "recipe-1" };
    mockGetRecipe.mockResolvedValue({
      _id: "recipe-1",
      name: "Old Name",
      prepDuration: "",
      cookDuration: "",
      servings: "",
      ingredients: [{ id: 1, name: "salt", amount: 1, unit: "" }],
      directions: [{ id: 1, text: "Mix.", duration: "" }],
      userId: "testuser-hash",
    });
    mockUpdateRecipe.mockResolvedValue({ success: true, data: { msg: "updated" } });
    renderForm();

    await screen.findByDisplayValue("Old Name");
    await userEvent.clear(screen.getByLabelText("Recipe Name *"));
    await userEvent.type(screen.getByLabelText("Recipe Name *"), "New Name");
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(mockUpdateRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Name", _id: "recipe-1" }),
    );
  });
});
