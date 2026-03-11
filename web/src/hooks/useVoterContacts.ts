import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type {
  VoterContacts,
  PhoneContact,
  PhoneContactCreate,
  EmailContact,
  EmailContactCreate,
  AddressContact,
  AddressContactCreate,
} from "@/types/voter-contact"

const contactKeys = {
  all: (campaignId: string, voterId: string) =>
    ["voters", campaignId, voterId, "contacts"] as const,
}

export function useVoterContacts(campaignId: string, voterId: string) {
  return useQuery({
    queryKey: contactKeys.all(campaignId, voterId),
    queryFn: () =>
      api
        .get(`api/v1/campaigns/${campaignId}/voters/${voterId}/contacts`)
        .json<VoterContacts>(),
    enabled: !!campaignId && !!voterId,
  })
}

// --- Phones ---

export function useAddPhone(campaignId: string, voterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PhoneContactCreate) =>
      api
        .post(`api/v1/campaigns/${campaignId}/voters/${voterId}/phones`, { json: data })
        .json<PhoneContact>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.all(campaignId, voterId) }),
  })
}

export function useUpdatePhone(campaignId: string, voterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ phoneId, data }: { phoneId: string; data: Partial<PhoneContactCreate> }) =>
      api
        .patch(`api/v1/campaigns/${campaignId}/voters/${voterId}/phones/${phoneId}`, { json: data })
        .json<PhoneContact>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.all(campaignId, voterId) }),
  })
}

export function useDeletePhone(campaignId: string, voterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (phoneId: string) =>
      api.delete(`api/v1/campaigns/${campaignId}/voters/${voterId}/phones/${phoneId}`).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.all(campaignId, voterId) }),
  })
}

export function useSetPrimaryContact(campaignId: string, voterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ contactType, contactId }: { contactType: "phones" | "emails" | "addresses"; contactId: string }) =>
      api
        .post(`api/v1/campaigns/${campaignId}/voters/${voterId}/contacts/${contactType}/${contactId}/set-primary`)
        .json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.all(campaignId, voterId) }),
  })
}

// --- Emails ---

export function useAddEmail(campaignId: string, voterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: EmailContactCreate) =>
      api
        .post(`api/v1/campaigns/${campaignId}/voters/${voterId}/emails`, { json: data })
        .json<EmailContact>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.all(campaignId, voterId) }),
  })
}

export function useUpdateEmail(campaignId: string, voterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ emailId, data }: { emailId: string; data: Partial<EmailContactCreate> }) =>
      api
        .patch(`api/v1/campaigns/${campaignId}/voters/${voterId}/emails/${emailId}`, { json: data })
        .json<EmailContact>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.all(campaignId, voterId) }),
  })
}

export function useDeleteEmail(campaignId: string, voterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (emailId: string) =>
      api.delete(`api/v1/campaigns/${campaignId}/voters/${voterId}/emails/${emailId}`).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.all(campaignId, voterId) }),
  })
}

// --- Addresses ---

export function useAddAddress(campaignId: string, voterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AddressContactCreate) =>
      api
        .post(`api/v1/campaigns/${campaignId}/voters/${voterId}/addresses`, { json: data })
        .json<AddressContact>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.all(campaignId, voterId) }),
  })
}

export function useUpdateAddress(campaignId: string, voterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ addressId, data }: { addressId: string; data: Partial<AddressContactCreate> }) =>
      api
        .patch(`api/v1/campaigns/${campaignId}/voters/${voterId}/addresses/${addressId}`, { json: data })
        .json<AddressContact>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.all(campaignId, voterId) }),
  })
}

export function useDeleteAddress(campaignId: string, voterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (addressId: string) =>
      api.delete(`api/v1/campaigns/${campaignId}/voters/${voterId}/addresses/${addressId}`).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.all(campaignId, voterId) }),
  })
}

