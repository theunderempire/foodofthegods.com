import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImagePickerDialog } from "../ImagePickerDialog";

const mockUploadRecipeImage = vi.fn();

vi.mock("../../api/recipes", () => ({
  uploadRecipeImage: (...args: unknown[]) => mockUploadRecipeImage(...args),
}));

describe("ImagePickerDialog", () => {
  let onSelect: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSelect = vi.fn();
    onClose = vi.fn();
    mockUploadRecipeImage.mockReset();
  });

  function renderDialog() {
    return render(<ImagePickerDialog onSelect={onSelect} onClose={onClose} />);
  }

  test("renders with Image URL tab active by default", () => {
    renderDialog();
    expect(screen.getByPlaceholderText("https://example.com/image.jpg")).toBeInTheDocument();
    expect(screen.queryByLabelText("Upload image file")).not.toBeInTheDocument();
  });

  test("switches to file input when Upload Image tab is clicked", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Upload Image" }));
    expect(screen.getByLabelText("Upload image file")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("https://example.com/image.jpg")).not.toBeInTheDocument();
  });

  test("switches back to URL input when Image URL tab is clicked", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Upload Image" }));
    await userEvent.click(screen.getByRole("button", { name: "Image URL" }));
    expect(screen.getByPlaceholderText("https://example.com/image.jpg")).toBeInTheDocument();
  });

  test("calls onClose when overlay is clicked", () => {
    const { container } = renderDialog();
    fireEvent.click(container.querySelector(".dialog-overlay")!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("calls onSelect and onClose with entered URL when Use URL is clicked", async () => {
    renderDialog();
    await userEvent.type(
      screen.getByPlaceholderText("https://example.com/image.jpg"),
      "https://example.com/my-image.jpg",
    );
    await userEvent.click(screen.getByRole("button", { name: "Use URL" }));
    expect(onSelect).toHaveBeenCalledWith("https://example.com/my-image.jpg");
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("Use URL button is disabled when URL input is empty", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Use URL" })).toBeDisabled();
  });

  test("calls onSelect and onClose after successful file upload", async () => {
    mockUploadRecipeImage.mockResolvedValue("http://api/thumbnails/upload-abc.jpg?v=1");
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Upload Image" }));

    const file = new File(["(content)"], "photo.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("Upload image file"), file);

    expect(mockUploadRecipeImage).toHaveBeenCalledWith(file);
    expect(onSelect).toHaveBeenCalledWith("http://api/thumbnails/upload-abc.jpg?v=1");
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("shows error message when upload returns null", async () => {
    mockUploadRecipeImage.mockResolvedValue(null);
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Upload Image" }));

    const file = new File(["(content)"], "photo.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("Upload image file"), file);

    expect(await screen.findByText("Failed to upload image.")).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("shows uploading state while upload is in progress", async () => {
    mockUploadRecipeImage.mockReturnValue(new Promise(() => {}));
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Upload Image" }));

    const file = new File(["(content)"], "photo.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("Upload image file"), file);

    expect(await screen.findByText("Uploading...")).toBeInTheDocument();
    expect(screen.getByLabelText("Upload image file")).toBeDisabled();
  });
});
