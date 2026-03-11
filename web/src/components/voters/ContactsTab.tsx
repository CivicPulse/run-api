import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Star, Pencil, Trash2, Plus, Phone, Mail, MapPin } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { RequireRole } from "@/components/shared/RequireRole"
import { DestructiveConfirmDialog } from "@/components/shared/DestructiveConfirmDialog"
import { EmptyState } from "@/components/shared/EmptyState"
import {
  useVoterContacts,
  useAddPhone,
  useUpdatePhone,
  useDeletePhone,
  useAddEmail,
  useUpdateEmail,
  useDeleteEmail,
  useAddAddress,
  useUpdateAddress,
  useDeleteAddress,
  useSetPrimaryContact,
} from "@/hooks/useVoterContacts"
import type {
  PhoneContact,
  EmailContact,
  AddressContact,
  PhoneContactCreate,
  EmailContactCreate,
  AddressContactCreate,
} from "@/types/voter-contact"

interface ContactsTabProps {
  campaignId: string
  voterId: string
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const phoneSchema = z.object({
  value: z.string().min(1, "Phone number is required"),
  type: z.string().min(1, "Type is required"),
})

const emailSchema = z.object({
  value: z.string().email("Must be a valid email"),
  type: z.string().min(1, "Type is required"),
})

const addressSchema = z.object({
  address_line1: z.string().min(1, "Street address is required"),
  address_line2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().min(2, "State is required").max(2),
  zip_code: z.string().min(5, "ZIP code is required"),
  type: z.string().min(1, "Type is required"),
})

type PhoneFormValues = z.infer<typeof phoneSchema>
type EmailFormValues = z.infer<typeof emailSchema>
type AddressFormValues = z.infer<typeof addressSchema>

// ── Phone Type Options ─────────────────────────────────────────────────────

const PHONE_TYPES = ["mobile", "home", "work", "other"]
const EMAIL_TYPES = ["personal", "work", "other"]
const ADDRESS_TYPES = ["home", "mailing", "work", "other"]

// ── Inline Phone Form ─────────────────────────────────────────────────────

interface PhoneFormProps {
  defaultValues?: PhoneFormValues
  onSave: (data: PhoneFormValues) => void
  onCancel: () => void
  isPending: boolean
}

function PhoneForm({ defaultValues, onSave, onCancel, isPending }: PhoneFormProps) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<PhoneFormValues>({
    resolver: zodResolver(phoneSchema),
    defaultValues: defaultValues ?? { value: "", type: "mobile" },
  })
  const typeValue = watch("type")

  return (
    <form onSubmit={handleSubmit(onSave)} className="mt-2 space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="phone-value" className="text-xs">Phone Number</Label>
          <Input id="phone-value" {...register("value")} placeholder="e.g. 555-555-5555" disabled={isPending} />
          {errors.value && <p className="text-xs text-destructive">{errors.value.message}</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={typeValue} onValueChange={(v) => setValue("type", v)} disabled={isPending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PHONE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>Save</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>Cancel</Button>
      </div>
    </form>
  )
}

// ── Inline Email Form ─────────────────────────────────────────────────────

interface EmailFormProps {
  defaultValues?: EmailFormValues
  onSave: (data: EmailFormValues) => void
  onCancel: () => void
  isPending: boolean
}

function EmailForm({ defaultValues, onSave, onCancel, isPending }: EmailFormProps) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: defaultValues ?? { value: "", type: "personal" },
  })
  const typeValue = watch("type")

  return (
    <form onSubmit={handleSubmit(onSave)} className="mt-2 space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="email-value" className="text-xs">Email Address</Label>
          <Input id="email-value" type="email" {...register("value")} placeholder="e.g. user@example.com" disabled={isPending} />
          {errors.value && <p className="text-xs text-destructive">{errors.value.message}</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={typeValue} onValueChange={(v) => setValue("type", v)} disabled={isPending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMAIL_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>Save</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>Cancel</Button>
      </div>
    </form>
  )
}

// ── Inline Address Form ───────────────────────────────────────────────────

interface AddressFormProps {
  defaultValues?: AddressFormValues
  onSave: (data: AddressFormValues) => void
  onCancel: () => void
  isPending: boolean
}

function AddressForm({ defaultValues, onSave, onCancel, isPending }: AddressFormProps) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<AddressFormValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: defaultValues ?? { address_line1: "", address_line2: "", city: "", state: "", zip_code: "", type: "home" },
  })
  const typeValue = watch("type")

  return (
    <form onSubmit={handleSubmit(onSave)} className="mt-2 space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="col-span-2 space-y-1">
          <Label htmlFor="addr-line1" className="text-xs">Street Address</Label>
          <Input id="addr-line1" {...register("address_line1")} placeholder="123 Main St" disabled={isPending} />
          {errors.address_line1 && <p className="text-xs text-destructive">{errors.address_line1.message}</p>}
        </div>
        <div className="col-span-2 space-y-1">
          <Label htmlFor="addr-line2" className="text-xs">Apt / Suite (optional)</Label>
          <Input id="addr-line2" {...register("address_line2")} placeholder="Apt 2" disabled={isPending} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="addr-city" className="text-xs">City</Label>
          <Input id="addr-city" {...register("city")} placeholder="City" disabled={isPending} />
          {errors.city && <p className="text-xs text-destructive">{errors.city.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="addr-state" className="text-xs">State</Label>
            <Input id="addr-state" {...register("state")} placeholder="CA" maxLength={2} disabled={isPending} />
            {errors.state && <p className="text-xs text-destructive">{errors.state.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="addr-zip" className="text-xs">ZIP</Label>
            <Input id="addr-zip" {...register("zip_code")} placeholder="90210" disabled={isPending} />
            {errors.zip_code && <p className="text-xs text-destructive">{errors.zip_code.message}</p>}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={typeValue} onValueChange={(v) => setValue("type", v)} disabled={isPending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADDRESS_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>Save</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>Cancel</Button>
      </div>
    </form>
  )
}

// ── Phone Section ─────────────────────────────────────────────────────────

interface PhoneSectionProps {
  campaignId: string
  voterId: string
  phones: PhoneContact[]
  setPrimary: ReturnType<typeof useSetPrimaryContact>
}

function PhoneSection({ campaignId, voterId, phones, setPrimary }: PhoneSectionProps) {
  const [expandedEdit, setExpandedEdit] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PhoneContact | null>(null)

  const addPhone = useAddPhone(campaignId, voterId)
  const updatePhone = useUpdatePhone(campaignId, voterId)
  const deletePhone = useDeletePhone(campaignId, voterId)

  function handleUpdate(phone: PhoneContact, data: PhoneFormValues) {
    updatePhone.mutate(
      { phoneId: phone.id, data },
      {
        onSuccess: () => {
          toast.success("Phone updated")
          setExpandedEdit(null)
        },
      },
    )
  }

  function handleAdd(data: PhoneFormValues) {
    const payload: PhoneContactCreate = { value: data.value, type: data.type }
    addPhone.mutate(payload, {
      onSuccess: () => {
        toast.success("Phone added")
        setShowAddForm(false)
      },
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    deletePhone.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success("Phone removed")
        setDeleteTarget(null)
      },
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Phone className="size-4 text-muted-foreground" />
          Phone Numbers
        </h3>
        <RequireRole minimum="manager">
          <Button variant="ghost" size="sm" onClick={() => setShowAddForm(true)} className="h-7 text-xs">
            <Plus className="size-3 mr-1" /> Add phone
          </Button>
        </RequireRole>
      </div>

      {phones.length === 0 && !showAddForm ? (
        <EmptyState
          title="No phone numbers"
          description="Add a phone number to get started."
          className="py-4"
          action={
            <RequireRole minimum="manager">
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>Add phone</Button>
            </RequireRole>
          }
        />
      ) : (
        <div className="space-y-1">
          {phones.map((phone) => (
            <div key={phone.id}>
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                <button
                  onClick={() => setPrimary.mutate({ contactType: "phones", contactId: phone.id })}
                  disabled={setPrimary.isPending}
                  className="shrink-0 text-muted-foreground hover:text-amber-500 disabled:opacity-50"
                  aria-label={phone.is_primary ? "Primary phone" : "Set as primary"}
                >
                  <Star
                    className="size-4"
                    fill={phone.is_primary ? "currentColor" : "none"}
                    color={phone.is_primary ? "#f59e0b" : "currentColor"}
                  />
                </button>
                <span className="flex-1 text-sm font-medium">{phone.value}</span>
                <Badge variant="secondary" className="text-xs">{phone.type}</Badge>
                <RequireRole minimum="manager">
                  <button
                    onClick={() => setExpandedEdit(expandedEdit === phone.id ? null : phone.id)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Edit phone"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(phone)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Delete phone"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </RequireRole>
              </div>
              {expandedEdit === phone.id && (
                <PhoneForm
                  defaultValues={{ value: phone.value, type: phone.type }}
                  onSave={(data) => handleUpdate(phone, data)}
                  onCancel={() => setExpandedEdit(null)}
                  isPending={updatePhone.isPending}
                />
              )}
            </div>
          ))}
          {showAddForm && (
            <PhoneForm
              onSave={handleAdd}
              onCancel={() => setShowAddForm(false)}
              isPending={addPhone.isPending}
            />
          )}
        </div>
      )}

      <DestructiveConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Remove phone number"
        description={`Remove ${deleteTarget?.value}?`}
        confirmText="remove"
        confirmLabel="Remove"
        onConfirm={handleDelete}
        isPending={deletePhone.isPending}
      />
    </div>
  )
}

// ── Email Section ─────────────────────────────────────────────────────────

interface EmailSectionProps {
  campaignId: string
  voterId: string
  emails: EmailContact[]
  setPrimary: ReturnType<typeof useSetPrimaryContact>
}

function EmailSection({ campaignId, voterId, emails, setPrimary }: EmailSectionProps) {
  const [expandedEdit, setExpandedEdit] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<EmailContact | null>(null)

  const addEmail = useAddEmail(campaignId, voterId)
  const updateEmail = useUpdateEmail(campaignId, voterId)
  const deleteEmail = useDeleteEmail(campaignId, voterId)

  function handleUpdate(email: EmailContact, data: EmailFormValues) {
    updateEmail.mutate(
      { emailId: email.id, data },
      {
        onSuccess: () => {
          toast.success("Email updated")
          setExpandedEdit(null)
        },
      },
    )
  }

  function handleAdd(data: EmailFormValues) {
    const payload: EmailContactCreate = { value: data.value, type: data.type }
    addEmail.mutate(payload, {
      onSuccess: () => {
        toast.success("Email added")
        setShowAddForm(false)
      },
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteEmail.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success("Email removed")
        setDeleteTarget(null)
      },
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Mail className="size-4 text-muted-foreground" />
          Email Addresses
        </h3>
        <RequireRole minimum="manager">
          <Button variant="ghost" size="sm" onClick={() => setShowAddForm(true)} className="h-7 text-xs">
            <Plus className="size-3 mr-1" /> Add email
          </Button>
        </RequireRole>
      </div>

      {emails.length === 0 && !showAddForm ? (
        <EmptyState
          title="No email addresses"
          description="Add an email address to get started."
          className="py-4"
          action={
            <RequireRole minimum="manager">
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>Add email</Button>
            </RequireRole>
          }
        />
      ) : (
        <div className="space-y-1">
          {emails.map((email) => (
            <div key={email.id}>
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                <button
                  onClick={() => setPrimary.mutate({ contactType: "emails", contactId: email.id })}
                  disabled={setPrimary.isPending}
                  className="shrink-0 text-muted-foreground hover:text-amber-500 disabled:opacity-50"
                  aria-label={email.is_primary ? "Primary email" : "Set as primary"}
                >
                  <Star
                    className="size-4"
                    fill={email.is_primary ? "currentColor" : "none"}
                    color={email.is_primary ? "#f59e0b" : "currentColor"}
                  />
                </button>
                <span className="flex-1 text-sm font-medium">{email.value}</span>
                <Badge variant="secondary" className="text-xs">{email.type}</Badge>
                <RequireRole minimum="manager">
                  <button
                    onClick={() => setExpandedEdit(expandedEdit === email.id ? null : email.id)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Edit email"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(email)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Delete email"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </RequireRole>
              </div>
              {expandedEdit === email.id && (
                <EmailForm
                  defaultValues={{ value: email.value, type: email.type }}
                  onSave={(data) => handleUpdate(email, data)}
                  onCancel={() => setExpandedEdit(null)}
                  isPending={updateEmail.isPending}
                />
              )}
            </div>
          ))}
          {showAddForm && (
            <EmailForm
              onSave={handleAdd}
              onCancel={() => setShowAddForm(false)}
              isPending={addEmail.isPending}
            />
          )}
        </div>
      )}

      <DestructiveConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Remove email address"
        description={`Remove ${deleteTarget?.value}?`}
        confirmText="remove"
        confirmLabel="Remove"
        onConfirm={handleDelete}
        isPending={deleteEmail.isPending}
      />
    </div>
  )
}

// ── Address Section ───────────────────────────────────────────────────────

interface AddressSectionProps {
  campaignId: string
  voterId: string
  addresses: AddressContact[]
  setPrimary: ReturnType<typeof useSetPrimaryContact>
}

function AddressSection({ campaignId, voterId, addresses, setPrimary }: AddressSectionProps) {
  const [expandedEdit, setExpandedEdit] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AddressContact | null>(null)

  const addAddress = useAddAddress(campaignId, voterId)
  const updateAddress = useUpdateAddress(campaignId, voterId)
  const deleteAddress = useDeleteAddress(campaignId, voterId)

  function handleUpdate(address: AddressContact, data: AddressFormValues) {
    const payload: Partial<AddressContactCreate> = {
      address_line1: data.address_line1,
      address_line2: data.address_line2,
      city: data.city,
      state: data.state,
      zip_code: data.zip_code,
      type: data.type,
    }
    updateAddress.mutate(
      { addressId: address.id, data: payload },
      {
        onSuccess: () => {
          toast.success("Address updated")
          setExpandedEdit(null)
        },
      },
    )
  }

  function handleAdd(data: AddressFormValues) {
    const payload: AddressContactCreate = {
      value: [data.address_line1, data.city, data.state, data.zip_code].filter(Boolean).join(", "),
      type: data.type,
      address_line1: data.address_line1,
      address_line2: data.address_line2,
      city: data.city,
      state: data.state,
      zip_code: data.zip_code,
    }
    addAddress.mutate(payload, {
      onSuccess: () => {
        toast.success("Address added")
        setShowAddForm(false)
      },
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteAddress.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success("Address removed")
        setDeleteTarget(null)
      },
    })
  }

  function formatAddress(addr: AddressContact): string {
    return [
      addr.address_line1,
      addr.address_line2,
      [addr.city, addr.state].filter(Boolean).join(", "),
      addr.zip_code,
    ]
      .filter(Boolean)
      .join(" ")
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <MapPin className="size-4 text-muted-foreground" />
          Mailing Addresses
        </h3>
        <RequireRole minimum="manager">
          <Button variant="ghost" size="sm" onClick={() => setShowAddForm(true)} className="h-7 text-xs">
            <Plus className="size-3 mr-1" /> Add address
          </Button>
        </RequireRole>
      </div>

      {addresses.length === 0 && !showAddForm ? (
        <EmptyState
          title="No mailing addresses"
          description="Add a mailing address to get started."
          className="py-4"
          action={
            <RequireRole minimum="manager">
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>Add address</Button>
            </RequireRole>
          }
        />
      ) : (
        <div className="space-y-1">
          {addresses.map((address) => (
            <div key={address.id}>
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                <button
                  onClick={() => setPrimary.mutate({ contactType: "addresses", contactId: address.id })}
                  disabled={setPrimary.isPending}
                  className="shrink-0 text-muted-foreground hover:text-amber-500 disabled:opacity-50"
                  aria-label={address.is_primary ? "Primary address" : "Set as primary"}
                >
                  <Star
                    className="size-4"
                    fill={address.is_primary ? "currentColor" : "none"}
                    color={address.is_primary ? "#f59e0b" : "currentColor"}
                  />
                </button>
                <span className="flex-1 text-sm font-medium">{formatAddress(address)}</span>
                <Badge variant="secondary" className="text-xs">{address.type}</Badge>
                <RequireRole minimum="manager">
                  <button
                    onClick={() => setExpandedEdit(expandedEdit === address.id ? null : address.id)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Edit address"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(address)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Delete address"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </RequireRole>
              </div>
              {expandedEdit === address.id && (
                <AddressForm
                  defaultValues={{
                    address_line1: address.address_line1,
                    address_line2: address.address_line2 ?? "",
                    city: address.city,
                    state: address.state,
                    zip_code: address.zip_code,
                    type: address.type,
                  }}
                  onSave={(data) => handleUpdate(address, data)}
                  onCancel={() => setExpandedEdit(null)}
                  isPending={updateAddress.isPending}
                />
              )}
            </div>
          ))}
          {showAddForm && (
            <AddressForm
              onSave={handleAdd}
              onCancel={() => setShowAddForm(false)}
              isPending={addAddress.isPending}
            />
          )}
        </div>
      )}

      <DestructiveConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Remove address"
        description={deleteTarget ? `Remove ${formatAddress(deleteTarget)}?` : undefined}
        confirmText="remove"
        confirmLabel="Remove"
        onConfirm={handleDelete}
        isPending={deleteAddress.isPending}
      />
    </div>
  )
}

// ── ContactsTab ───────────────────────────────────────────────────────────

export function ContactsTab({ campaignId, voterId }: ContactsTabProps) {
  const { data: contacts, isLoading } = useVoterContacts(campaignId, voterId)
  const setPrimary = useSetPrimaryContact(campaignId, voterId)

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    )
  }

  const phones = contacts?.phones ?? []
  const emails = contacts?.emails ?? []
  const addresses = contacts?.addresses ?? []

  return (
    <div className="space-y-8">
      <PhoneSection
        campaignId={campaignId}
        voterId={voterId}
        phones={phones}
        setPrimary={setPrimary}
      />
      <EmailSection
        campaignId={campaignId}
        voterId={voterId}
        emails={emails}
        setPrimary={setPrimary}
      />
      <AddressSection
        campaignId={campaignId}
        voterId={voterId}
        addresses={addresses}
        setPrimary={setPrimary}
      />
    </div>
  )
}
