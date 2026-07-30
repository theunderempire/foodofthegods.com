import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { matchPath, MemoryRouter } from "react-router-dom";
import { ROUTES } from "../../routes";
import { RecipeViewer } from "../RecipeViewer";

const mockGetRecipe = vi.fn();
const mockDeleteRecipe = vi.fn();
const mockGetIngredientList = vi.fn();
const mockAddIngredients = vi.fn();
const mockNavigate = vi.fn();

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    username: "testuser-hash",
    isAuthenticated: true,
  }),
}));

vi.mock("../../api/recipes", () => ({
  getRecipe: (...args: unknown[]) => mockGetRecipe(...args),
  deleteRecipe: (...args: unknown[]) => mockDeleteRecipe(...args),
}));

vi.mock("../../api/ingredientList", () => ({
  getIngredientList: (...args: unknown[]) => mockGetIngredientList(...args),
  addIngredient: vi.fn(),
  addIngredients: (...args: unknown[]) => mockAddIngredients(...args),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: "recipe-1" }),
  };
});

const mockRecipe = {
  _id: "recipe-1",
  name: "Grandma's Lasagna",
  prepDuration: "30 min",
  cookDuration: "1 hour",
  servings: "8",
  ingredients: [
    { id: 1, name: "pasta", amount: 2, unit: "cups" },
    { id: 2, name: "cheese", amount: 1, unit: "lb" },
  ],
  directions: [
    { id: 1, text: "Boil the pasta.", duration: "10 min" },
    { id: 2, text: "Layer and bake.", duration: "45 min" },
  ],
  userId: "testuser-hash",
};

describe("RecipeViewer", () => {
  beforeEach(() => {
    mockGetRecipe.mockReset();
    mockDeleteRecipe.mockReset();
    mockAddIngredients.mockReset();
    mockNavigate.mockReset();
    mockGetIngredientList.mockResolvedValue(null);
  });

  function renderViewer() {
    return render(
      <MemoryRouter>
        <RecipeViewer />
      </MemoryRouter>,
    );
  }

  test("shows loading state initially", () => {
    mockGetRecipe.mockImplementation(() => new Promise(() => {}));
    renderViewer();
    expect(screen.getByText("Loading recipe...")).toBeInTheDocument();
  });

  test("renders recipe name, meta, ingredients and directions", async () => {
    mockGetRecipe.mockResolvedValue(mockRecipe);
    renderViewer();

    expect(await screen.findByRole("heading", { name: "Grandma's Lasagna" })).toBeInTheDocument();
    expect(screen.getByText("30 min")).toBeInTheDocument();
    expect(screen.getByText("1 hour")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("pasta")).toBeInTheDocument();
    expect(screen.getByText("cheese")).toBeInTheDocument();
    expect(screen.getByText("Boil the pasta.")).toBeInTheDocument();
    expect(screen.getByText("Layer and bake.")).toBeInTheDocument();
  });

  test("shows NotFound page when recipe fails to load", async () => {
    mockGetRecipe.mockRejectedValue(new Error("not found"));
    renderViewer();
    expect(await screen.findByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(screen.getByText("Recipe not found.")).toBeInTheDocument();
  });

  test("shows Share, Edit, and Delete buttons when authenticated", async () => {
    mockGetRecipe.mockResolvedValue(mockRecipe);
    renderViewer();
    await screen.findByRole("heading", { name: "Grandma's Lasagna" });
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  test("Share button copies correct share link to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    mockGetRecipe.mockResolvedValue(mockRecipe);
    renderViewer();
    await screen.findByRole("heading", { name: "Grandma's Lasagna" });

    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    const generatedUrl = writeText.mock.calls[0][0];
    const pathname = new URL(generatedUrl).pathname;
    const match = matchPath(ROUTES.recipes.SHARE_PATTERN, pathname);

    expect(match).not.toBeNull();
    expect(match?.params.shareId).toBe("recipe-1");
    expect(await screen.findByRole("button", { name: "Link copied!" })).toBeInTheDocument();
  });

  test("clicking Delete shows a confirmation dialog", async () => {
    mockGetRecipe.mockResolvedValue(mockRecipe);
    renderViewer();
    await screen.findByRole("heading", { name: "Grandma's Lasagna" });

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(
      screen.getByText(/Delete "Grandma's Lasagna"\? This cannot be undone\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  test("canceling the delete dialog hides it without calling deleteRecipe", async () => {
    mockGetRecipe.mockResolvedValue(mockRecipe);
    renderViewer();
    await screen.findByRole("heading", { name: "Grandma's Lasagna" });

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    expect(mockDeleteRecipe).not.toHaveBeenCalled();
  });

  test("confirming delete calls deleteRecipe and navigates to /recipes", async () => {
    mockGetRecipe.mockResolvedValue(mockRecipe);
    mockDeleteRecipe.mockResolvedValue({ success: true });
    renderViewer();
    await screen.findByRole("heading", { name: "Grandma's Lasagna" });

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(mockDeleteRecipe).toHaveBeenCalledWith("recipe-1");
    expect(mockNavigate).toHaveBeenCalledWith("/recipes");
  });

  test("shows error message if delete fails", async () => {
    mockGetRecipe.mockResolvedValue(mockRecipe);
    mockDeleteRecipe.mockRejectedValue(new Error("Server error"));
    renderViewer();
    await screen.findByRole("heading", { name: "Grandma's Lasagna" });

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Failed to delete recipe.")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test("shows add-to-shopping-list button when authenticated", async () => {
    mockGetRecipe.mockResolvedValue(mockRecipe);
    renderViewer();
    await screen.findByRole("heading", { name: "Grandma's Lasagna" });
    expect(screen.getByRole("button", { name: "+ Shopping List" })).toBeInTheDocument();
  });

  test("multiplier scales ingredient amounts and servings", async () => {
    mockGetRecipe.mockResolvedValue(mockRecipe);
    renderViewer();
    await screen.findByRole("heading", { name: "Grandma's Lasagna" });

    expect(screen.getByText("1×")).toBeInTheDocument();
    expect(screen.getByText("2 cups")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Increase recipe multiplier" }));
    await userEvent.click(screen.getByRole("button", { name: "Increase recipe multiplier" }));

    expect(screen.getByText("2×")).toBeInTheDocument();
    expect(screen.getByText("4 cups")).toBeInTheDocument();
    expect(screen.getByText("2 lb")).toBeInTheDocument();
    expect(screen.getByText("16")).toBeInTheDocument(); // servings 8 × 2
  });

  test("multiplier cannot go below 0.5", async () => {
    mockGetRecipe.mockResolvedValue(mockRecipe);
    renderViewer();
    await screen.findByRole("heading", { name: "Grandma's Lasagna" });

    const decrease = screen.getByRole("button", { name: "Decrease recipe multiplier" });
    await userEvent.click(decrease);
    expect(screen.getByText("0.5×")).toBeInTheDocument();
    expect(decrease).toBeDisabled();
  });

  test("leaves non-numeric amounts unchanged when multiplied", async () => {
    mockGetRecipe.mockResolvedValue({
      ...mockRecipe,
      ingredients: [{ id: 1, name: "salt", amount: "a pinch", unit: "" }],
    });
    renderViewer();
    await screen.findByRole("heading", { name: "Grandma's Lasagna" });

    await userEvent.click(screen.getByRole("button", { name: "Increase recipe multiplier" }));
    expect(screen.getByText("a pinch")).toBeInTheDocument();
  });

  test("adds scaled amounts to the shopping list", async () => {
    mockGetRecipe.mockResolvedValue(mockRecipe);
    mockAddIngredients.mockResolvedValue({ groups: [], lastModified: "" });
    renderViewer();
    await screen.findByRole("heading", { name: "Grandma's Lasagna" });

    await userEvent.click(screen.getByRole("button", { name: "Increase recipe multiplier" }));
    await userEvent.click(screen.getByRole("button", { name: "+ Shopping List" }));

    expect(mockAddIngredients).toHaveBeenCalledWith("testuser-hash", [
      { id: 1, name: "pasta", amount: 3, unit: "cups" },
      { id: 2, name: "cheese", amount: 1.5, unit: "lb" },
    ]);
  });

  test("back button navigates to /recipes", async () => {
    mockGetRecipe.mockResolvedValue(mockRecipe);
    renderViewer();
    await screen.findByRole("heading", { name: "Grandma's Lasagna" });
    await userEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/recipes");
  });
});
