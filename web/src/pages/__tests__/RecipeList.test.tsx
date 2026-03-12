import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { RecipeList } from "../RecipeList";

const mockGetRecipes = vi.fn();
const mockNavigate = vi.fn();
const mockUseNavigationType = vi.fn();

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ username: "testuser-hash" }),
}));

vi.mock("../../api/recipes", () => ({
  getRecipes: (...args: unknown[]) => mockGetRecipes(...args),
  deleteRecipe: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useNavigationType: () => mockUseNavigationType(),
  };
});

const mockRecipes = [
  { _id: "1", name: "Pasta", prepDuration: "10 min", cookDuration: "20 min" },
  { _id: "2", name: "Salad", prepDuration: "5 min", cookDuration: "" },
  { _id: "3", name: "Soup", prepDuration: "", cookDuration: "30 min" },
];

describe("RecipeList", () => {
  beforeEach(() => {
    mockGetRecipes.mockReset();
    mockNavigate.mockReset();
    mockUseNavigationType.mockReturnValue("PUSH");
    sessionStorage.clear();
  });

  function renderList() {
    return render(
      <MemoryRouter>
        <RecipeList />
      </MemoryRouter>,
    );
  }

  test("shows loading state initially", () => {
    mockGetRecipes.mockImplementation(() => new Promise(() => {}));
    renderList();
    expect(screen.getByText("Loading recipes...")).toBeInTheDocument();
  });

  test("renders recipe cards after load", async () => {
    mockGetRecipes.mockResolvedValue(mockRecipes);
    renderList();
    expect(await screen.findByText("Pasta")).toBeInTheDocument();
    expect(screen.getByText("Salad")).toBeInTheDocument();
    expect(screen.getByText("Soup")).toBeInTheDocument();
  });

  test("recipes are sorted alphabetically", async () => {
    mockGetRecipes.mockResolvedValue([
      { _id: "1", name: "Zucchini", prepDuration: "", cookDuration: "" },
      { _id: "2", name: "Apple Pie", prepDuration: "", cookDuration: "" },
      { _id: "3", name: "Muffins", prepDuration: "", cookDuration: "" },
    ]);
    renderList();
    const titles = await screen.findAllByRole("heading", { level: 2 });
    const names = titles.map((t) => t.textContent);
    expect(names).toEqual(["Apple Pie", "Muffins", "Zucchini"]);
  });

  test("filters recipes by name", async () => {
    mockGetRecipes.mockResolvedValue(mockRecipes);
    renderList();
    await screen.findByText("Pasta");

    await userEvent.type(screen.getByPlaceholderText("Search recipes..."), "pa");

    expect(screen.getByText("Pasta")).toBeInTheDocument();
    expect(screen.queryByText("Salad")).not.toBeInTheDocument();
    expect(screen.queryByText("Soup")).not.toBeInTheDocument();
  });

  test("shows empty state when no recipes", async () => {
    mockGetRecipes.mockResolvedValue([]);
    renderList();
    expect(await screen.findByText("No recipes yet.")).toBeInTheDocument();
  });

  test("shows no-match message when filter has no results", async () => {
    mockGetRecipes.mockResolvedValue(mockRecipes);
    renderList();
    await screen.findByText("Pasta");

    await userEvent.type(screen.getByPlaceholderText("Search recipes..."), "xyz");

    expect(screen.getByText(/No recipes match/)).toBeInTheDocument();
  });

  test("navigates to add recipe page", async () => {
    mockGetRecipes.mockResolvedValue(mockRecipes);
    renderList();
    await screen.findByText("Pasta");
    await userEvent.click(screen.getByRole("button", { name: "Add recipe" }));
    expect(mockNavigate).toHaveBeenCalledWith("/recipes/add");
  });
});

describe("search state persistence", () => {
  beforeEach(() => {
    mockGetRecipes.mockReset();
    mockUseNavigationType.mockReturnValue("PUSH");
    sessionStorage.clear();
  });

  function renderList() {
    return render(
      <MemoryRouter>
        <RecipeList />
      </MemoryRouter>,
    );
  }

  test("saves filter to sessionStorage as user types", async () => {
    mockGetRecipes.mockResolvedValue(mockRecipes);
    renderList();
    await screen.findByText("Pasta");

    await userEvent.type(screen.getByPlaceholderText("Search recipes..."), "pa");

    const saved = JSON.parse(sessionStorage.getItem("recipe-list-filter")!);
    expect(saved.value).toBe("pa");
  });

  test("restores filter from sessionStorage on back navigation", async () => {
    // First render: type a filter to save it
    mockGetRecipes.mockResolvedValue(mockRecipes);
    const { unmount } = renderList();
    await screen.findByText("Pasta");
    await userEvent.type(screen.getByPlaceholderText("Search recipes..."), "sal");
    unmount();

    // Second render: simulate back navigation
    mockUseNavigationType.mockReturnValue("POP");
    renderList();
    await screen.findByText("Salad");

    expect(screen.getByPlaceholderText("Search recipes...")).toHaveValue("sal");
    expect(screen.queryByText("Pasta")).not.toBeInTheDocument();
    expect(screen.queryByText("Soup")).not.toBeInTheDocument();
  });

  test("does not restore filter on PUSH navigation", async () => {
    // Save a filter in the first render
    mockGetRecipes.mockResolvedValue(mockRecipes);
    const { unmount } = renderList();
    await screen.findByText("Pasta");
    await userEvent.type(screen.getByPlaceholderText("Search recipes..."), "sal");
    unmount();

    // Second render: PUSH navigation (e.g. clicking nav link) should not restore
    renderList();
    await screen.findByText("Pasta");

    expect(screen.getByPlaceholderText("Search recipes...")).toHaveValue("");
    expect(screen.getByText("Salad")).toBeInTheDocument();
    expect(screen.getByText("Soup")).toBeInTheDocument();
  });

  test("does not restore filter after a page reload (stale session ID)", async () => {
    // Simulate data left over from a previous session (different session ID)
    sessionStorage.setItem(
      "recipe-list-filter",
      JSON.stringify({ sid: "stale-session-id", value: "sal" }),
    );
    mockUseNavigationType.mockReturnValue("POP");
    mockGetRecipes.mockResolvedValue(mockRecipes);
    renderList();
    await screen.findByText("Pasta");

    expect(screen.getByPlaceholderText("Search recipes...")).toHaveValue("");
    expect(screen.getByText("Salad")).toBeInTheDocument();
  });
});

describe("scroll position persistence", () => {
  beforeEach(() => {
    mockGetRecipes.mockReset();
    mockUseNavigationType.mockReturnValue("PUSH");
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function renderList() {
    return render(
      <MemoryRouter>
        <RecipeList />
      </MemoryRouter>,
    );
  }

  test("saves scroll position to sessionStorage on scroll event", async () => {
    mockGetRecipes.mockResolvedValue(mockRecipes);
    renderList();
    await screen.findByText("Pasta");

    Object.defineProperty(window, "scrollY", { value: 400, configurable: true });
    fireEvent.scroll(window);

    const saved = JSON.parse(sessionStorage.getItem("recipe-list-scroll")!);
    expect(saved.value).toBe("400");
  });

  test("restores scroll position on back navigation after loading", async () => {
    // First render: scroll to save position
    mockGetRecipes.mockResolvedValue(mockRecipes);
    const { unmount } = renderList();
    await screen.findByText("Pasta");
    Object.defineProperty(window, "scrollY", { value: 350, configurable: true });
    fireEvent.scroll(window);
    unmount();

    // Second render: back navigation should restore scroll
    mockUseNavigationType.mockReturnValue("POP");
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    renderList();
    await screen.findByText("Pasta");

    expect(scrollToSpy).toHaveBeenCalledWith(0, 350);
  });

  test("does not restore scroll on PUSH navigation", async () => {
    // Save a scroll position
    mockGetRecipes.mockResolvedValue(mockRecipes);
    const { unmount } = renderList();
    await screen.findByText("Pasta");
    Object.defineProperty(window, "scrollY", { value: 350, configurable: true });
    fireEvent.scroll(window);
    unmount();

    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderList();
    await screen.findByText("Pasta");

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  test("does not restore scroll after a page reload (stale session ID)", async () => {
    // Simulate scroll data from a previous session
    sessionStorage.setItem(
      "recipe-list-scroll",
      JSON.stringify({ sid: "stale-session-id", value: "350" }),
    );
    mockUseNavigationType.mockReturnValue("POP");
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    mockGetRecipes.mockResolvedValue(mockRecipes);
    renderList();
    await screen.findByText("Pasta");

    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});
