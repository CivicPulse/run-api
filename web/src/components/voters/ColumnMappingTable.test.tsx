import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { ColumnMappingTable } from "./ColumnMappingTable"
import { CANONICAL_FIELDS, FIELD_GROUPS } from "./column-mapping-constants"
import type { FieldMapping } from "@/types/import-job"

const columns = ["First Name", "Email"]
const suggestedMapping: Record<string, FieldMapping> = {
  "First Name": { field: "first_name", match_type: "exact" },
  Email: { field: null, match_type: null },
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
      // "First Name" appears as both column label and selected value label;
      // verify at least one instance exists for each column
      expect(screen.getAllByText("First Name").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Email").length).toBeGreaterThanOrEqual(1)
    })

    it("Select is pre-populated with suggested_mapping value showing human-readable label", () => {
      render(
        <ColumnMappingTable
          columns={["Address"]}
          suggestedMapping={{ Address: { field: "registration_line1", match_type: "exact" } }}
          mapping={{ Address: "registration_line1" }}
          onMappingChange={vi.fn()}
        />,
      )
      // The selected value for "registration_line1" should show "Registration Line 1" as the trigger text
      expect(screen.getByText("Registration Line 1")).toBeTruthy()
    })

    it("shows exact badge when match_type is 'exact' and unchanged", () => {
      render(
        <ColumnMappingTable
          columns={columns}
          suggestedMapping={suggestedMapping}
          mapping={mapping}
          onMappingChange={vi.fn()}
        />,
      )
      expect(screen.getByLabelText("Exact match — auto-mapped")).toBeTruthy()
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

    it("changing Select value calls onMappingChange with raw field name", () => {
      const onMappingChange = vi.fn()
      render(
        <ColumnMappingTable
          columns={["Email Col"]}
          suggestedMapping={{ "Email Col": { field: null, match_type: null } }}
          mapping={{ "Email Col": "" }}
          onMappingChange={onMappingChange}
        />,
      )
      // Open the select and choose "Email" (the label for "email")
      const trigger = screen.getByRole("combobox")
      fireEvent.click(trigger)
      // Find and click the "Email" option in the listbox (label text)
      const emailOption = screen.getByRole("option", { name: "Email" })
      fireEvent.click(emailOption)
      expect(onMappingChange).toHaveBeenCalledWith("Email Col", "email")
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

    it("dropdown shows grouped field labels", () => {
      render(
        <ColumnMappingTable
          columns={["Test Col"]}
          suggestedMapping={{ "Test Col": { field: null, match_type: null } }}
          mapping={{ "Test Col": "" }}
          onMappingChange={vi.fn()}
        />,
      )
      // Open the select
      const trigger = screen.getByRole("combobox")
      fireEvent.click(trigger)
      // Verify group labels exist
      expect(screen.getByText("Personal")).toBeTruthy()
      expect(screen.getByText("Registration Address")).toBeTruthy()
      expect(screen.getByText("Mailing Address")).toBeTruthy()
      expect(screen.getByText("Demographics")).toBeTruthy()
      expect(screen.getByText("Propensity")).toBeTruthy()
      expect(screen.getByText("Household")).toBeTruthy()
      expect(screen.getByText("Political")).toBeTruthy()
      expect(screen.getByText("Other")).toBeTruthy()
    })

    it("CANONICAL_FIELDS includes new fields from Phase 23", () => {
      expect(CANONICAL_FIELDS).toContain("registration_line1")
      expect(CANONICAL_FIELDS).toContain("mailing_city")
      expect(CANONICAL_FIELDS).toContain("propensity_general")
      expect(CANONICAL_FIELDS).toContain("spoken_language")
      expect(CANONICAL_FIELDS).toContain("household_size")
    })

    it("FIELD_GROUPS has 8 groups", () => {
      expect(Object.keys(FIELD_GROUPS)).toHaveLength(8)
    })

    it("dropdown shows human-readable labels instead of raw field names", () => {
      render(
        <ColumnMappingTable
          columns={["Test Col"]}
          suggestedMapping={{ "Test Col": { field: null, match_type: null } }}
          mapping={{ "Test Col": "" }}
          onMappingChange={vi.fn()}
        />,
      )
      // Open the select
      const trigger = screen.getByRole("combobox")
      fireEvent.click(trigger)
      // Verify human-readable labels appear
      expect(screen.getByText("Registration Line 1")).toBeTruthy()
      expect(screen.getByText("Mailing City")).toBeTruthy()
      expect(screen.getByText("General Propensity")).toBeTruthy()
    })
  })

  describe("L2 format detection", () => {
    it("shows L2 detection banner when formatDetected is 'l2'", () => {
      render(
        <ColumnMappingTable
          columns={columns}
          suggestedMapping={suggestedMapping}
          mapping={mapping}
          onMappingChange={vi.fn()}
          formatDetected="l2"
        />,
      )
      expect(screen.getByText("L2 voter file detected — columns auto-mapped")).toBeTruthy()
    })

    it("does not show L2 banner when formatDetected is 'generic'", () => {
      render(
        <ColumnMappingTable
          columns={columns}
          suggestedMapping={suggestedMapping}
          mapping={mapping}
          onMappingChange={vi.fn()}
          formatDetected="generic"
        />,
      )
      expect(screen.queryByText("L2 voter file detected — columns auto-mapped")).toBeNull()
    })

    it("does not show L2 banner when formatDetected is null", () => {
      render(
        <ColumnMappingTable
          columns={columns}
          suggestedMapping={suggestedMapping}
          mapping={mapping}
          onMappingChange={vi.fn()}
          formatDetected={null}
        />,
      )
      expect(screen.queryByText("L2 voter file detected — columns auto-mapped")).toBeNull()
    })

    it("shows fuzzy badge for fuzzy match_type", () => {
      const fuzzyMapping: Record<string, FieldMapping> = {
        "Fuzzy Col": { field: "first_name", match_type: "fuzzy" },
      }
      render(
        <ColumnMappingTable
          columns={["Fuzzy Col"]}
          suggestedMapping={fuzzyMapping}
          mapping={{ "Fuzzy Col": "first_name" }}
          onMappingChange={vi.fn()}
        />,
      )
      expect(screen.getByLabelText("Fuzzy match — review suggested")).toBeTruthy()
    })

    it("shows exact badge for exact match_type", () => {
      render(
        <ColumnMappingTable
          columns={["First Name"]}
          suggestedMapping={{ "First Name": { field: "first_name", match_type: "exact" } }}
          mapping={{ "First Name": "first_name" }}
          onMappingChange={vi.fn()}
        />,
      )
      expect(screen.getByLabelText("Exact match — auto-mapped")).toBeTruthy()
    })
  })
})
