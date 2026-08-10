import { render, screen, fireEvent } from "@testing-library/react";
import { HubSidebar, type HubSidebarItem } from "./HubSidebar";

const ITEMS: HubSidebarItem[] = [
  { key: "pipeline", label: "Pipeline", href: "/dashboard", active: true },
  { key: "receiving", label: "Receiving", href: "/receiving" },
];

test("renders items as links with the active class on the active one", () => {
  render(<HubSidebar items={ITEMS} />);
  const pipeline = screen.getByRole("link", { name: "Pipeline" });
  expect(pipeline).toHaveAttribute("href", "/dashboard");
  expect(pipeline.className).toContain("is-active");
  expect(screen.getByRole("link", { name: "Receiving" }).className).not.toContain(
    "is-active",
  );
});

test("renders the title and footer slots", () => {
  render(<HubSidebar items={ITEMS} title="Warehouse" footer={<span>v1.2.3</span>} />);
  expect(screen.getByText("Warehouse")).toBeInTheDocument();
  expect(screen.getByText("v1.2.3")).toBeInTheDocument();
});

test("the mobile toggle flips aria-expanded", () => {
  render(<HubSidebar items={ITEMS} />);
  const toggle = screen.getByRole("button", { name: "Menu" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
});

test("renderLink overrides the anchor and receives className + onClick", () => {
  render(
    <HubSidebar
      items={ITEMS}
      renderLink={(item, { className, onClick }) => (
        <a key={item.key} data-custom href={item.href} className={className} onClick={onClick}>
          {item.label}
        </a>
      )}
    />,
  );
  expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute("data-custom");
});
