import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { MappingPreview } from "./MappingPreview"

describe("MappingPreview", () => {
  describe("IMPT-04: mapping preview table", () => {
    it("renders a row for each mapped column showing source column and canonical field", () => {
      render(
        <MappingPreview
          columns={["Col A", "Col B", "Col C"]}
          mapping={{ "Col A": "first_name", "Col B": "", "Col C": "email" }}
        />,
      )
      expect(screen.getByText("Col A")).toBeTruthy()
      expect(screen.getByText("first_name")).toBeTruthy()
      expect(screen.getByText("Col C")).toBeTruthy()
      expect(screen.getByText("email")).toBeTruthy()
    })

    it("excludes columns mapped to empty string (skip) from the preview", () => {
      render(
        <MappingPreview
          columns={["Col A", "Col B", "Col C"]}
          mapping={{ "Col A": "first_name", "Col B": "", "Col C": "email" }}
        />,
      )
      // Col B maps to "" so it should not appear as a table row
      expect(screen.queryByText("Col B")).toBeNull()
    })

    it("renders no data rows when all columns are skipped", () => {
      render(
        <MappingPreview
          columns={["Col A", "Col B"]}
          mapping={{ "Col A": "", "Col B": "" }}
        />,
      )
      expect(
        screen.getByText(/no columns mapped/i),
      ).toBeTruthy()
    })

    it("shows Source Column and Voter Field headers when there are mapped columns", () => {
      render(
        <MappingPreview
          columns={["Col A"]}
          mapping={{ "Col A": "first_name" }}
        />,
      )
      expect(screen.getByText("Source Column")).toBeTruthy()
      expect(screen.getByText("Voter Field")).toBeTruthy()
    })
  })
})
