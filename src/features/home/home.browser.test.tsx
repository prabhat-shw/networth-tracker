// Empty Home (#105): the zero-state leads; the household panel waits behind a secondary action.
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Home } from "./home";

describe("Home", () => {
  it("leads with the empty state and keeps the invite form out of view", async () => {
    const screen = await render(<Home household={<p>household panel</p>} />);
    await expect
      .element(screen.getByText("Your household net worth will show up here"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Add your first account" }))
      .toBeDisabled();
    await expect
      .element(screen.getByText("household panel"))
      .not.toBeInTheDocument();
  });

  it("opens and closes the household panel from Invite a member", async () => {
    const screen = await render(<Home household={<p>household panel</p>} />);
    const action = screen.getByRole("button", { name: "Invite a member" });
    await expect.element(action).toHaveAttribute("aria-expanded", "false");
    await action.click();
    await expect.element(screen.getByText("household panel")).toBeVisible();
    await expect.element(action).toHaveAttribute("aria-expanded", "true");
    await action.click();
    await expect
      .element(screen.getByText("household panel"))
      .not.toBeInTheDocument();
  });
});
