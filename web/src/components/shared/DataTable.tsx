import React from "react"
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PaginationControls } from "@/components/shared/PaginationControls"
import { EmptyState } from "@/components/shared/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  sorting?: SortingState
  onSortingChange?: (sorting: SortingState) => void
  isLoading?: boolean
  emptyIcon?: LucideIcon
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
  onRowClick?: (row: TData) => void
  hasNextPage?: boolean
  hasPreviousPage?: boolean
  onNextPage?: () => void
  onPreviousPage?: () => void
}

export function DataTable<TData>({
  columns,
  data,
  sorting,
  onSortingChange,
  isLoading = false,
  emptyIcon,
  emptyTitle = "No data",
  emptyDescription,
  emptyAction,
  onRowClick,
  hasNextPage,
  hasPreviousPage,
  onNextPage,
  onPreviousPage,
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sorting ?? [],
    },
    onSortingChange: (updater) => {
      if (onSortingChange) {
        const newSorting =
          typeof updater === "function" ? updater(sorting ?? []) : updater
        onSortingChange(newSorting)
      }
    },
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  })

  const showPagination =
    (hasNextPage !== undefined || hasPreviousPage !== undefined) &&
    (hasNextPage || hasPreviousPage)

  return (
    <div className="min-w-0 overflow-x-auto">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort()
                const sortDir = header.column.getIsSorted()
                return (
                  <TableHead
                    key={header.id}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    className={cn(
                      canSort && "cursor-pointer select-none",
                      header.column.columnDef.meta?.className,
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort && (
                        <span className="text-muted-foreground">
                          {sortDir === "asc" ? (
                            <ArrowUp className="size-4" />
                          ) : sortDir === "desc" ? (
                            <ArrowDown className="size-4" />
                          ) : (
                            <ArrowUpDown className="size-4" />
                          )}
                        </span>
                      )}
                    </span>
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            // 5 skeleton rows
            Array.from({ length: 5 }).map((_, rowIdx) => (
              <TableRow key={`skeleton-${rowIdx}`}>
                {columns.map((_, colIdx) => (
                  <TableCell key={`skeleton-${rowIdx}-${colIdx}`} className="py-3">
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="p-0">
                <EmptyState
                  icon={emptyIcon}
                  title={emptyTitle}
                  description={emptyDescription}
                  action={emptyAction}
                />
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onRowClick?.(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      "py-3",
                      cell.column.columnDef.meta?.className,
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {showPagination && (
        <div className="mt-4">
          <PaginationControls
            hasNextPage={hasNextPage ?? false}
            hasPreviousPage={hasPreviousPage ?? false}
            onNextPage={onNextPage ?? (() => {})}
            onPreviousPage={onPreviousPage ?? (() => {})}
            isLoading={isLoading}
          />
        </div>
      )}
    </div>
  )
}
