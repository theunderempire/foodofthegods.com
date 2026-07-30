import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { formatListAsText, IngredientList } from "../IngredientList";

const mockGetIngredientList = vi.fn();
const mockAddIngredients = vi.fn();
const mockRemoveIngredient = vi.fn();
const mockUpdateIngredient = vi.fn();
const mockGroupIngredients = vi.fn();

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
  groupIngredients: (...args: unknown[]) => mockGroupIngredients(...args),
  subscribeToList: vi.fn().mockReturnValue(() => {}),
}));

describe("formatListAsText", () => {
  test("formats groups with headers and one line per item", () => {
    const text = formatListAsText({
      lastModified: "",
      groups: [
        {
          name: "Dairy",
          items: [
            { completed: false, ingredient: { id: 1, name: "milk", amount: 1, unit: "gal" } },
            { completed: false, ingredient: { id: 2, name: "eggs", amount: 12 } },
          ],
        },
        { name: "Empty", items: [] },
        {
          name: "Produce",
          items: [
            { completed: false, ingredient: { id: 3, name: "apples", amount: 3, unit: "lb" } },
          ],
        },
      ],
    });

    expect(text).toBe("Dairy\n- 1 gal milk\n- 12 eggs\n\nProduce\n- 3 lb apples");
  });

  test("excludes crossed-off items and skips groups left empty by them", () => {
    const text = formatListAsText({
      lastModified: "",
      groups: [
        {
          name: "Dairy",
          items: [
            { completed: false, ingredient: { id: 1, name: "milk", amount: 1, unit: "gal" } },
            { completed: true, ingredient: { id: 2, name: "eggs", amount: 12 } },
          ],
        },
        {
          name: "Produce",
          items: [
            { completed: true, ingredient: { id: 3, name: "apples", amount: 3, unit: "lb" } },
          ],
        },
      ],
    });

    expect(text).toBe("Dairy\n- 1 gal milk");
  });
});

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

const mockGroupingList = {
  ...mockList,
  groups: [
    {
      name: "Uncategorized",
      items: [
        { completed: true, ingredient: { id: 1, name: "butter", amount: 2, unit: "tbsp" } },
        { completed: false, ingredient: { id: 2, name: "eggs", amount: 3, unit: "" } },
      ],
    },
  ],
  grouping: true,
};

describe("IngredientList", () => {
  beforeEach(() => {
    mockGetIngredientList.mockReset();
    mockAddIngredients.mockReset();
    mockRemoveIngredient.mockReset();
    mockUpdateIngredient.mockReset();
    mockGroupIngredients.mockReset();
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

  test("copy list button copies all items as text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    mockGetIngredientList.mockResolvedValue(mockList);
    renderList();
    await screen.findByText("butter");

    await userEvent.click(screen.getByRole("button", { name: "Copy list" }));

    expect(writeText).toHaveBeenCalledWith("Uncategorized\n- 2 tbsp butter\n- 3 eggs");
    expect(await screen.findByRole("button", { name: "Copied!" })).toBeInTheDocument();
  });

  test("copy list button is hidden when the list is empty", async () => {
    mockGetIngredientList.mockResolvedValue(null);
    renderList();
    await screen.findByText("Your shopping list is empty.");
    expect(screen.queryByRole("button", { name: "Copy list" })).not.toBeInTheDocument();
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
    await userEvent.clear(screen.getByPlaceholderText("0"));
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

  test("opens edit modal pre-filled and saves updated ingredient", async () => {
    mockGetIngredientList.mockResolvedValue(mockList);
    mockUpdateIngredient.mockResolvedValue({
      groups: [
        {
          name: "Uncategorized",
          items: [
            { completed: false, ingredient: { id: 1, name: "butter", amount: 4, unit: "tbsp" } },
            { completed: false, ingredient: { id: 2, name: "eggs", amount: 3, unit: "" } },
          ],
        },
      ],
      lastModified: "",
    });
    renderList();
    await screen.findByText("butter");

    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);

    expect(screen.getByRole("heading", { name: "Edit Ingredient" })).toBeInTheDocument();
    const nameInput = screen.getByPlaceholderText("Ingredient name");
    expect(nameInput).toHaveValue("butter");

    await userEvent.clear(screen.getByPlaceholderText("0"));
    await userEvent.type(screen.getByPlaceholderText("0"), "4");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mockUpdateIngredient).toHaveBeenCalledWith(
      "testuser-hash",
      expect.objectContaining({
        groupName: "Uncategorized",
        ingredientListItem: expect.objectContaining({
          ingredient: expect.objectContaining({ name: "butter", amount: 4 }),
        }),
      }),
    );
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

  test("shows Grouping spinner and hides list items when list.grouping is true", async () => {
    mockGetIngredientList.mockResolvedValue(mockGroupingList);
    renderList();
    // Wait for the toolbar button to reflect the grouping state, then verify the spinner div
    await screen.findByRole("button", { name: "Grouping..." });
    expect(screen.getByText("Grouping...", { selector: "div" })).toBeInTheDocument();
    expect(screen.queryByText("butter")).not.toBeInTheDocument();
    expect(screen.queryByText("eggs")).not.toBeInTheDocument();
  });

  test("disables toolbar buttons when list.grouping is true", async () => {
    mockGetIngredientList.mockResolvedValue(mockGroupingList);
    renderList();
    await screen.findByRole("button", { name: "Grouping..." });
    expect(screen.getByRole("button", { name: "Grouping..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Remove checked/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Clear all/i })).toBeDisabled();
  });

  test("disables the add ingredient FAB when list.grouping is true", async () => {
    mockGetIngredientList.mockResolvedValue(mockGroupingList);
    renderList();
    await screen.findByRole("button", { name: "Grouping..." });
    expect(screen.getByRole("button", { name: "Add ingredient" })).toBeDisabled();
  });

  test("does not clear the list when groupIngredients returns null", async () => {
    mockGetIngredientList.mockResolvedValue(mockList);
    mockGroupIngredients.mockResolvedValue(null);
    renderList();
    await screen.findByText("butter");

    await userEvent.click(screen.getByRole("button", { name: /Auto-group/i }));

    expect(screen.getByText("butter")).toBeInTheDocument();
  });
});
