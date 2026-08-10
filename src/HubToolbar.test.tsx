import { render, screen, fireEvent } from "@testing-library/react";
import { HubToolbar, type HubNavItem } from "./HubToolbar";

const NAV: HubNavItem[] = [
  { key: "pipeline", label: "Pipeline", href: "/dashboard", active: true },
  { key: "receiving", label: "Receiving", href: "/receiving" },
];

test("renders nav items as links with the active class on the active one", () => {
  render(<HubToolbar nav={NAV} />);
  const pipeline = screen.getByRole("link", { name: "Pipeline" });
  const receiving = screen.getByRole("link", { name: "Receiving" });
  expect(pipeline).toHaveAttribute("href", "/dashboard");
  expect(pipeline.className).toContain("is-active");
  expect(receiving.className).not.toContain("is-active");
});

test("renders the meta, primaryAction, and notifications slots", () => {
  render(
    <HubToolbar
      nav={NAV}
      meta={<span>v1.2.3</span>}
      primaryAction={<button>New</button>}
      notifications={<span aria-label="bell" />}
    />,
  );
  expect(screen.getByText("v1.2.3")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  expect(screen.getByLabelText("bell")).toBeInTheDocument();
});

test("the mobile toggle flips aria-expanded and opens the nav", () => {
  render(<HubToolbar nav={NAV} />);
  const toggle = screen.getByRole("button", { name: "Menu" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
});

test("renderNavLink overrides the anchor and receives className + onClick", () => {
  render(
    <HubToolbar
      nav={NAV}
      renderNavLink={(item, { className, onClick }) => (
        <a key={item.key} data-custom href={item.href} className={className} onClick={onClick}>
          {item.label}
        </a>
      )}
    />,
  );
  const pipeline = screen.getByRole("link", { name: "Pipeline" });
  expect(pipeline).toHaveAttribute("data-custom");
});
