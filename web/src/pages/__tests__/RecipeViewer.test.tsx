import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RecipeViewer } from "../RecipeViewer";

const mockGetRecipe = vi.fn();
const mockGetIngredientList = vi.fn();

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    username: "testuser-hash",
    isAuthenticated: true,
  }),
}));

vi.mock("../../api/recipes", () => ({
  getRecipe: (...args: unknown[]) => mockGetRecipe(...args),
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
    useNavigate: () => vi.fn(),
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

  test("shows Share and Edit buttons when authenticated", async () => {
    mockGetRecipe.mockResolvedValue(mockRecipe);
    renderViewer();
    await screen.findByRole("heading", { name: "Grandma's Lasagna" });
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  test("shows add-to-shopping-list button when authenticated", async () => {
    mockGetRecipe.mockResolvedValue(mockRecipe);
    renderViewer();
    await screen.findByRole("heading", { name: "Grandma's Lasagna" });
    expect(screen.getByRole("button", { name: "+ Shopping List" })).toBeInTheDocument();
  });
});
