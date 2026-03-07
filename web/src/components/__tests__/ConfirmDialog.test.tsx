import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "../ConfirmDialog";

describe("ConfirmDialog", () => {
  test("renders the message", () => {
    render(
      <ConfirmDialog message="Are you sure?" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  test("calls onConfirm when Confirm is clicked", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog message="Delete?" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  test("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog message="Delete?" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  test("calls onCancel when overlay is clicked", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog message="Delete?" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(container.querySelector(".dialog-overlay")!);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
