export interface PaginationResponse {
  next_cursor: string | null
  has_more: boolean
}

export interface PaginatedResponse<T> {
  items: T[]
  pagination: PaginationResponse
}
