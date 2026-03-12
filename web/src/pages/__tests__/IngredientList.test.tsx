import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { IngredientList } from "../IngredientList";

const mockGetIngredientList = vi.fn();
const mockAddIngredients = vi.fn();
const mockRemoveIngredient = vi.fn();
const mockUpdateIngredient = vi.fn();

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ username: "testuser-hash" }),
}));

const mockUseSettings = vi.fn();
vi.mock("../../contexts/SettingsContext", () => ({
  useSettings: () => mockUseSettings(),
}));

vi.mock("../../api/ingredientList", () => ({
  getIngredientList: (...args: unknown[]) => mockGetIngredientList(...args),
  addIngredients: (...args: unknown[]) => mockAddIngredients(...args),
  removeIngredient: (...args: unknown[]) => mockRemoveIngredient(...args),
  updateIngredient: (...args: unknown[]) => mockUpdateIngredient(...args),
  clearAllIngredients: vi.fn(),
  clearMarkedIngredients: vi.fn(),
  groupIngredients: vi.fn(),
}));

const mockList = {
  groups: [
    {
      name: "Uncategorized",
      items: [
        {
          completed: false,
          ingredient: { id: 1, name: "butter", amount: 2, unit: "tbsp" },
        },
        {
          completed: false,
          ingredient: { id: 2, name: "eggs", amount: 3, unit: "" },
        },
      ],
    },
  ],
  lastModified: "",
};

describe("IngredientList", () => {
  beforeEach(() => {
    mockGetIngredientList.mockReset();
    mockAddIngredients.mockReset();
    mockRemoveIngredient.mockReset();
    mockUpdateIngredient.mockReset();
    mockUseSettings.mockReturnValue({ hasGeminiKey: true, refreshSettings: vi.fn() });
  });

  function renderList() {
    return render(
      <MemoryRouter>
        <IngredientList />
      </MemoryRouter>,
    );
  }

  test("shows loading state initially", () => {
    mockGetIngredientList.mockImplementation(() => new Promise(() => {}));
    renderList();
    expect(screen.getByText("Loading shopping list...")).toBeInTheDocument();
  });

  test("shows empty state when list is empty", async () => {
    mockGetIngredientList.mockResolvedValue(null);
    renderList();
    expect(await screen.findByText("Your shopping list is empty.")).toBeInTheDocument();
  });

  test("renders ingredient items", async () => {
    mockGetIngredientList.mockResolvedValue(mockList);
    renderList();
    expect(await screen.findByText("butter")).toBeInTheDocument();
    expect(screen.getByText("eggs")).toBeInTheDocument();
  });

  test("opens add modal when FAB is clicked", async () => {
    mockGetIngredientList.mockResolvedValue(null);
    renderList();
    await screen.findByText("Your shopping list is empty.");

    await userEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    expect(screen.getByText("Add Ingredient")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ingredient name")).toBeInTheDocument();
  });

  test("closes modal when Cancel is clicked", async () => {
    mockGetIngredientList.mockResolvedValue(null);
    renderList();
    await screen.findByText("Your shopping list is empty.");

    await userEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Add Ingredient")).not.toBeInTheDocument();
  });

  test("calls addIngredients and updates list on submit", async () => {
    mockGetIngredientList.mockResolvedValue(null);
    mockAddIngredients.mockResolvedValue(mockList);
    renderList();
    await screen.findByText("Your shopping list is empty.");

    await userEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    await userEvent.type(screen.getByPlaceholderText("Ingredient name"), "flour");
    await userEvent.type(screen.getByPlaceholderText("0"), "2");
    await userEvent.type(screen.getByPlaceholderText("cup, oz, …"), "cups");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(mockAddIngredients).toHaveBeenCalledWith(
      "testuser-hash",
      expect.arrayContaining([expect.objectContaining({ name: "flour", amount: 2, unit: "cups" })]),
    );
    expect(screen.queryByText("Add Ingredient")).not.toBeInTheDocument();
  });

  test("removes an item when remove button is clicked", async () => {
    mockGetIngredientList.mockResolvedValue(mockList);
    mockRemoveIngredient.mockResolvedValue({
      groups: [],
      lastModified: "",
    });
    renderList();
    await screen.findByText("butter");

    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    await userEvent.click(removeButtons[0]);

    expect(mockRemoveIngredient).toHaveBeenCalledWith("testuser-hash", "Uncategorized", 1);
  });

  test("Auto-group button is disabled when no Gemini key", async () => {
    mockUseSettings.mockReturnValue({ hasGeminiKey: false, refreshSettings: vi.fn() });
    mockGetIngredientList.mockResolvedValue(mockList);
    renderList();
    await screen.findByText("butter");
    expect(screen.getByRole("button", { name: /Auto-group/i })).toBeDisabled();
  });

  test("Auto-group button is enabled when Gemini key is set", async () => {
    mockUseSettings.mockReturnValue({ hasGeminiKey: true, refreshSettings: vi.fn() });
    mockGetIngredientList.mockResolvedValue(mockList);
    renderList();
    await screen.findByText("butter");
    expect(screen.getByRole("button", { name: /Auto-group/i })).not.toBeDisabled();
  });
});
