import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { RecipeForm } from "../RecipeForm";

const mockAddRecipe = vi.fn();
const mockUpdateRecipe = vi.fn();
const mockGetRecipe = vi.fn();
const mockNavigate = vi.fn();
let mockParams: Record<string, string> = {};

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ username: "testuser-hash" }),
}));

vi.mock("../../api/recipes", () => ({
  addRecipe: (...args: unknown[]) => mockAddRecipe(...args),
  updateRecipe: (...args: unknown[]) => mockUpdateRecipe(...args),
  getRecipe: (...args: unknown[]) => mockGetRecipe(...args),
  importRecipeFromUrl: vi.fn(),
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
    mockNavigate.mockReset();
    mockParams = {};
  });

  function renderForm() {
    return render(
      <MemoryRouter>
        <RecipeForm />
      </MemoryRouter>,
    );
  }

  test("renders New Recipe title in add mode", () => {
    renderForm();
    expect(screen.getByRole("heading", { name: "New Recipe" })).toBeInTheDocument();
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

  test("shows error when submitting a whitespace-only name", async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText("Recipe Name *"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Create Recipe" }));
    expect(screen.getByText("Recipe name is required.")).toBeInTheDocument();
    expect(mockAddRecipe).not.toHaveBeenCalled();
  });

  test("calls addRecipe and navigates on valid submit", async () => {
    mockAddRecipe.mockResolvedValue({ success: true, data: { msg: "recipe added" } });
    renderForm();

    await userEvent.type(screen.getByLabelText("Recipe Name *"), "My New Recipe");
    await userEvent.click(screen.getByRole("button", { name: "Create Recipe" }));

    expect(mockAddRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My New Recipe" }),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/recipes");
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
