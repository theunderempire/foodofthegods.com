import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { RecipeViewer } from "../RecipeViewer";

const mockGetRecipe = vi.fn();
const mockDeleteRecipe = vi.fn();
const mockGetIngredientList = vi.fn();
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
  addIngredients: vi.fn(),
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
});
