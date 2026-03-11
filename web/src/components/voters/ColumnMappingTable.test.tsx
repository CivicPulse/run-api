import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { ColumnMappingTable } from "./ColumnMappingTable"

const columns = ["First Name", "Email"]
const suggestedMapping: Record<string, string | null> = {
  "First Name": "first_name",
  Email: null,
}
const mapping: Record<string, string> = {
  "First Name": "first_name",
  Email: "",
}

describe("ColumnMappingTable", () => {
  describe("IMPT-03: dropdown-based column mapping", () => {
    it("renders one row per detected column with column name on left and Select on right", () => {
      render(
        <ColumnMappingTable
          columns={columns}
          suggestedMapping={suggestedMapping}
          mapping={mapping}
          onMappingChange={vi.fn()}
        />,
      )
      expect(screen.getByText("First Name")).toBeTruthy()
      expect(screen.getByText("Email")).toBeTruthy()
    })

    it("Select is pre-populated with suggested_mapping value", () => {
      render(
        <ColumnMappingTable
          columns={columns}
          suggestedMapping={suggestedMapping}
          mapping={mapping}
          onMappingChange={vi.fn()}
        />,
      )
      // The selected value for "First Name" should show "first_name" as the trigger text
      expect(screen.getByText("first_name")).toBeTruthy()
    })

    it("shows green badge (CheckCircle2) when suggested_mapping is non-null and unchanged", () => {
      render(
        <ColumnMappingTable
          columns={columns}
          suggestedMapping={suggestedMapping}
          mapping={mapping}
          onMappingChange={vi.fn()}
        />,
      )
      expect(screen.getByLabelText("High confidence match")).toBeTruthy()
    })

    it("shows yellow badge (AlertTriangle) when suggested_mapping is null", () => {
      render(
        <ColumnMappingTable
          columns={columns}
          suggestedMapping={suggestedMapping}
          mapping={mapping}
          onMappingChange={vi.fn()}
        />,
      )
      expect(screen.getByLabelText("No suggestion available")).toBeTruthy()
    })

    it("(skip) option is available in dropdown for each column", () => {
      render(
        <ColumnMappingTable
          columns={columns}
          suggestedMapping={suggestedMapping}
          mapping={mapping}
          onMappingChange={vi.fn()}
        />,
      )
      // Open one of the selects and check for the (skip) option
      const triggers = screen.getAllByRole("combobox")
      fireEvent.click(triggers[0])
      expect(screen.getAllByText("(skip)").length).toBeGreaterThanOrEqual(1)
    })

    it("changing Select value calls onMappingChange with updated mapping", () => {
      const onMappingChange = vi.fn()
      render(
        <ColumnMappingTable
          columns={["Email"]}
          suggestedMapping={{ Email: null }}
          mapping={{ Email: "" }}
          onMappingChange={onMappingChange}
        />,
      )
      // Open the select and choose "email"
      const trigger = screen.getByRole("combobox")
      fireEvent.click(trigger)
      // Find and click the "email" option in the listbox
      const emailOption = screen.getByRole("option", { name: "email" })
      fireEvent.click(emailOption)
      expect(onMappingChange).toHaveBeenCalledWith("Email", "email")
    })

    it("renders skeleton rows when columns array is empty", () => {
      const { container } = render(
        <ColumnMappingTable
          columns={[]}
          suggestedMapping={{}}
          mapping={{}}
          onMappingChange={vi.fn()}
        />,
      )
      // Should render 5 skeleton pairs
      const skeletons = container.querySelectorAll("[class*='skeleton'], [data-slot='skeleton']")
      expect(skeletons.length).toBeGreaterThanOrEqual(1)
    })
  })
})
